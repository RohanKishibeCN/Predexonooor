from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .predexon import DataClient, now_ms


@dataclass(frozen=True)
class TopOfBook:
    venue: str
    best_bid: float
    best_ask: float
    bid_size: float
    ask_size: float

    @property
    def spread(self) -> float:
        return max(0.0, self.best_ask - self.best_bid)

    @property
    def mid(self) -> float:
        return (self.best_ask + self.best_bid) / 2.0


def _extract_best(levels: list[dict[str, Any]], *, side: Literal["bid", "ask"]) -> tuple[float, float]:
    if not levels:
        return 0.0, 0.0
    prices = [float(l["price"]) for l in levels if "price" in l]
    if not prices:
        return 0.0, 0.0
    if side == "bid":
        best_price = max(prices)
    else:
        best_price = min(prices)
    best_levels = [l for l in levels if float(l.get("price", -1)) == best_price]
    size = float(best_levels[0].get("size", 0.0)) if best_levels else 0.0
    return best_price, size


def quote_polymarket_token(data: DataClient, *, token_id: str, lookback_ms: int = 5 * 60 * 1000) -> TopOfBook | None:
    end_ms = now_ms()
    start_ms = end_ms - lookback_ms
    payload = data.polymarket_orderbooks(token_id=token_id, start_ms=start_ms, end_ms=end_ms, limit=1)
    snapshots = payload.get("snapshots") or []
    if not snapshots:
        return None
    snap = snapshots[-1]
    bids = snap.get("bids") or []
    asks = snap.get("asks") or []
    best_bid, bid_size = _extract_best(bids, side="bid")
    best_ask, ask_size = _extract_best(asks, side="ask")
    if best_bid <= 0.0 or best_ask <= 0.0:
        return None
    return TopOfBook(venue="polymarket", best_bid=best_bid, best_ask=best_ask, bid_size=bid_size, ask_size=ask_size)


def quote_limitless_market(data: DataClient, *, market_slug: str, lookback_ms: int = 5 * 60 * 1000) -> TopOfBook | None:
    end_ms = now_ms()
    start_ms = end_ms - lookback_ms
    payload = data.limitless_orderbooks(market_slug=market_slug, start_ms=start_ms, end_ms=end_ms, limit=1)
    snapshots = payload.get("snapshots") or []
    if not snapshots:
        return None
    snap = snapshots[-1]
    bids = snap.get("bids") or []
    asks = snap.get("asks") or []
    best_bid, bid_size = _extract_best(bids, side="bid")
    best_ask, ask_size = _extract_best(asks, side="ask")
    if best_bid <= 0.0 or best_ask <= 0.0:
        return None
    return TopOfBook(venue="limitless", best_bid=best_bid, best_ask=best_ask, bid_size=bid_size, ask_size=ask_size)
