from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class RiskLimits:
    starting_capital_usd: float
    max_per_trade_usd: float
    max_exposure_per_market_usd: float
    max_total_exposure_usd: float
    max_open_positions: int
    daily_max_loss_usd: float
    max_drawdown_usd: float


@dataclass
class RiskState:
    today: date
    realized_pnl_today: float
    equity_peak: float
    equity_now: float


def initial_state(limits: RiskLimits) -> RiskState:
    d = date.today()
    return RiskState(today=d, realized_pnl_today=0.0, equity_peak=limits.starting_capital_usd, equity_now=limits.starting_capital_usd)


def can_open_trade(
    *,
    limits: RiskLimits,
    state: RiskState,
    open_positions: int,
    total_exposure: float,
    market_exposure: float,
    intended_notional: float,
) -> tuple[bool, str]:
    if state.today != date.today():
        state.today = date.today()
        state.realized_pnl_today = 0.0

    if state.realized_pnl_today <= -limits.daily_max_loss_usd:
        return False, "daily_loss_limit"
    if (limits.starting_capital_usd - state.equity_now) >= limits.max_drawdown_usd:
        return False, "max_drawdown"

    if open_positions >= limits.max_open_positions:
        return False, "max_open_positions"
    if intended_notional > limits.max_per_trade_usd:
        return False, "max_per_trade"
    if (market_exposure + intended_notional) > limits.max_exposure_per_market_usd:
        return False, "max_exposure_per_market"
    if (total_exposure + intended_notional) > limits.max_total_exposure_usd:
        return False, "max_total_exposure"

    return True, "ok"
