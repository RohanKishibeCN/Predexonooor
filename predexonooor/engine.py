from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any

from .config import AppConfig
from .liquidity import score_top_of_book
from .predexon import DataClient, TradeClient
from .quotes import TopOfBook, quote_limitless_market, quote_polymarket_token
from .risk import RiskLimits, can_open_trade, initial_state
from .storage.sqlite import (
    connect as db_connect,
    exposures,
    init_db,
    list_open_positions,
    open_position,
    total_exposure,
)


log = logging.getLogger("predexonooor")


@dataclass(frozen=True)
class VenueListing:
    venue: str
    token_id: str | None
    market_slug: str | None


class DataRateLimiter:
    def __init__(self, min_interval_seconds: float) -> None:
        self._min_interval = min_interval_seconds
        self._last = 0.0

    def wait(self) -> None:
        now = time.time()
        delta = now - self._last
        if delta < self._min_interval:
            time.sleep(self._min_interval - delta)
        self._last = time.time()


def _parse_listings(outcome: dict[str, Any]) -> list[VenueListing]:
    venues = outcome.get("venues") or []
    out: list[VenueListing] = []
    for v in venues:
        out.append(
            VenueListing(
                venue=str(v.get("venue")),
                token_id=str(v.get("token_id")) if v.get("token_id") else None,
                market_slug=str(v.get("market_slug")) if v.get("market_slug") else None,
            )
        )
    return out


def _quote_listing(data: DataClient, listing: VenueListing) -> TopOfBook | None:
    if listing.venue == "polymarket" and listing.token_id:
        return quote_polymarket_token(data, token_id=listing.token_id)
    if listing.venue == "limitless" and listing.market_slug:
        return quote_limitless_market(data, market_slug=listing.market_slug)
    return None


def _pick_best_liquidity(
    data: DataClient, *, predexon_id: str, enabled_venues: set[str], limiter: DataRateLimiter
) -> tuple[TopOfBook, VenueListing] | None:
    limiter.wait()
    outcome = data.get_outcome(predexon_id=predexon_id, routable_only=True)
    listings = [l for l in _parse_listings(outcome) if l.venue in enabled_venues]
    best: tuple[float, TopOfBook, VenueListing] | None = None

    for listing in listings:
        limiter.wait()
        q = _quote_listing(data, listing)
        if not q:
            continue
        s = score_top_of_book(q)
        if best is None or s.score > best[0]:
            best = (s.score, q, listing)

    if not best:
        return None
    return best[1], best[2]


def _extract_market_candidates(markets_payload: dict[str, Any]) -> list[dict[str, Any]]:
    markets = markets_payload.get("markets") or []
    out: list[dict[str, Any]] = []
    for m in markets:
        outcomes = m.get("outcomes") or []
        for o in outcomes:
            predexon_id = o.get("predexon_id") or o.get("predexonId")
            token_id = o.get("token_id") or o.get("tokenId")
            price = o.get("price")
            if not predexon_id or not token_id or price is None:
                continue
            p = float(price)
            if p <= 0.05 or p >= 0.95:
                continue
            out.append(
                {
                    "title": m.get("title") or m.get("question") or "",
                    "predexon_id": str(predexon_id),
                    "token_id": str(token_id),
                }
            )
    return out


def run_bot(cfg: AppConfig, *, data: DataClient, trade: TradeClient, db_path: str = "state.db") -> None:
    conn = db_connect(db_path)
    init_db(conn)

    enabled_venues = set(cfg.venues.enabled)
    limiter = DataRateLimiter(min_interval_seconds=1.1)

    limits = RiskLimits(
        starting_capital_usd=cfg.risk.starting_capital_usd,
        max_per_trade_usd=cfg.risk.max_per_trade_usd,
        max_exposure_per_market_usd=cfg.risk.max_exposure_per_market_usd,
        max_total_exposure_usd=cfg.risk.max_total_exposure_usd,
        max_open_positions=cfg.risk.max_open_positions,
        daily_max_loss_usd=cfg.risk.daily_max_loss_usd,
        max_drawdown_usd=cfg.risk.max_drawdown_usd,
    )
    risk_state = initial_state(limits)

    if cfg.mode not in {"dry_run", "live"}:
        raise ValueError("mode must be dry_run or live")
    if cfg.mode == "live" and not cfg.account_id:
        raise ValueError("account_id is required in live mode")

    log.info("boot health data=%s trade=%s", data.health(), trade.health())

    while True:
        open_pos = list_open_positions(conn)
        exp_by_market = exposures(conn)
        exp_total = total_exposure(conn)

        for pos in open_pos:
            q: TopOfBook | None = None
            if pos.venue == "polymarket":
                limiter.wait()
                q = quote_polymarket_token(data, token_id=pos.token_id)
            elif pos.venue == "limitless":
                limiter.wait()
                outcome = data.get_outcome(predexon_id=pos.predexon_id, routable_only=True)
                listing = next((l for l in _parse_listings(outcome) if l.venue == "limitless"), None)
                if listing and listing.market_slug:
                    limiter.wait()
                    q = quote_limitless_market(data, market_slug=listing.market_slug)
            if not q:
                continue

            now = int(time.time())
            should_exit = False
            reason = ""
            if q.mid >= pos.take_profit:
                should_exit = True
                reason = "take_profit"
            elif q.mid <= pos.stop_loss:
                should_exit = True
                reason = "stop_loss"
            elif now >= pos.max_hold_until:
                should_exit = True
                reason = "max_hold"

            if not should_exit:
                continue

            exit_price = max(0.001, min(0.999, q.best_bid * (1 - cfg.execution.slippage_guard_pct)))
            log.info(
                "exit signal pos=%s reason=%s venue=%s mid=%.3f bid=%.3f ask=%.3f",
                pos.id,
                reason,
                pos.venue,
                q.mid,
                q.best_bid,
                q.best_ask,
            )
            if cfg.mode == "live":
                client_id = str(uuid.uuid4())
                trade.place_order(
                    account_id=cfg.account_id,
                    venue=pos.venue,  # type: ignore[arg-type]
                    token_id=pos.token_id,
                    side="sell",
                    order_type="limit",
                    size=pos.size,
                    price=exit_price,
                    client_id=client_id,
                )
            conn.execute("UPDATE positions SET status='closed' WHERE id=?", (pos.id,))
            conn.commit()

        open_pos = list_open_positions(conn)
        if len(open_pos) < cfg.risk.max_open_positions:
            limiter.wait()
            markets_payload = data.list_polymarket_markets(limit=cfg.max_markets_scan)
            base_candidates = _extract_market_candidates(markets_payload)

            for c in base_candidates:
                predexon_id = c["predexon_id"]
                if any(p.predexon_id == predexon_id and p.status == "open" for p in open_pos):
                    continue

                picked = _pick_best_liquidity(data, predexon_id=predexon_id, enabled_venues=enabled_venues, limiter=limiter)
                if not picked:
                    continue
                q, listing = picked

                if q.spread > cfg.liquidity.max_spread:
                    continue
                if min(q.bid_size, q.ask_size) * q.mid < cfg.liquidity.min_top_depth_usd:
                    continue

                intended_notional = min(cfg.risk.max_per_trade_usd, cfg.risk.max_total_exposure_usd - exp_total)
                market_exp = exp_by_market.get(predexon_id, 0.0)
                ok, why = can_open_trade(
                    limits=limits,
                    state=risk_state,
                    open_positions=len(open_pos),
                    total_exposure=exp_total,
                    market_exposure=market_exp,
                    intended_notional=intended_notional,
                )
                if not ok:
                    continue

                token_id = listing.token_id
                if not token_id:
                    continue
                entry_price = min(0.999, q.best_ask * (1 + cfg.execution.slippage_guard_pct))
                size = max(0.01, intended_notional / entry_price)

                take_profit = entry_price * (1 + cfg.execution.entry.take_profit_pct)
                stop_loss = entry_price * (1 - cfg.execution.entry.stop_loss_pct)
                max_hold_until = int(time.time()) + (cfg.execution.entry.max_hold_minutes * 60)

                log.info(
                    "enter candidate venue=%s spread=%.4f depth=%.2f title=%s",
                    listing.venue,
                    q.spread,
                    min(q.bid_size, q.ask_size),
                    c["title"],
                )

                if cfg.mode == "live":
                    client_id = str(uuid.uuid4())
                    trade.place_order(
                        account_id=cfg.account_id,
                        venue=listing.venue,  # type: ignore[arg-type]
                        token_id=token_id,
                        side="buy",
                        order_type="limit",
                        size=size,
                        price=entry_price,
                        client_id=client_id,
                    )

                open_position(
                    conn,
                    predexon_id=predexon_id,
                    venue=listing.venue,
                    token_id=token_id,
                    size=size,
                    entry_price=entry_price,
                    take_profit=take_profit,
                    stop_loss=stop_loss,
                    max_hold_until=max_hold_until,
                )
                open_pos = list_open_positions(conn)
                exp_by_market = exposures(conn)
                exp_total = total_exposure(conn)
                if len(open_pos) >= cfg.risk.max_open_positions:
                    break

        time.sleep(cfg.poll_interval_seconds)
