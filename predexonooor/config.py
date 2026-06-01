from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class VenuesConfig:
    enabled: list[str]
    prefer_order: list[str]


@dataclass(frozen=True)
class LiquidityConfig:
    max_spread: float
    min_top_depth_usd: float


@dataclass(frozen=True)
class RiskConfig:
    starting_capital_usd: float
    max_per_trade_usd: float
    max_exposure_per_market_usd: float
    max_total_exposure_usd: float
    max_open_positions: int
    daily_max_loss_usd: float
    max_drawdown_usd: float


@dataclass(frozen=True)
class EntryExitConfig:
    take_profit_pct: float
    stop_loss_pct: float
    max_hold_minutes: int


@dataclass(frozen=True)
class ExecutionConfig:
    entry: EntryExitConfig
    slippage_guard_pct: float


@dataclass(frozen=True)
class AppConfig:
    mode: str
    account_id: str
    poll_interval_seconds: int
    max_markets_scan: int
    venues: VenuesConfig
    liquidity: LiquidityConfig
    risk: RiskConfig
    execution: ExecutionConfig


def _must_float(obj: Any, path: str) -> float:
    try:
        return float(obj)
    except Exception as e:
        raise ValueError(f"Invalid float at {path}: {obj!r}") from e


def _must_int(obj: Any, path: str) -> int:
    try:
        return int(obj)
    except Exception as e:
        raise ValueError(f"Invalid int at {path}: {obj!r}") from e


def load_config(config_path: str | Path) -> AppConfig:
    p = Path(config_path)
    raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("Config root must be a YAML mapping")

    venues_raw = raw.get("venues", {})
    liquidity_raw = raw.get("liquidity", {})
    risk_raw = raw.get("risk", {})
    exec_raw = raw.get("execution", {})
    entry_raw = (exec_raw.get("entry") or {}) if isinstance(exec_raw, dict) else {}

    venues = VenuesConfig(
        enabled=list(venues_raw.get("enabled") or []),
        prefer_order=list(venues_raw.get("prefer_order") or []),
    )
    liquidity = LiquidityConfig(
        max_spread=_must_float(liquidity_raw.get("max_spread", 0.02), "liquidity.max_spread"),
        min_top_depth_usd=_must_float(
            liquidity_raw.get("min_top_depth_usd", 20), "liquidity.min_top_depth_usd"
        ),
    )
    risk = RiskConfig(
        starting_capital_usd=_must_float(risk_raw.get("starting_capital_usd", 100), "risk.starting_capital_usd"),
        max_per_trade_usd=_must_float(risk_raw.get("max_per_trade_usd", 5), "risk.max_per_trade_usd"),
        max_exposure_per_market_usd=_must_float(
            risk_raw.get("max_exposure_per_market_usd", 10), "risk.max_exposure_per_market_usd"
        ),
        max_total_exposure_usd=_must_float(risk_raw.get("max_total_exposure_usd", 30), "risk.max_total_exposure_usd"),
        max_open_positions=_must_int(risk_raw.get("max_open_positions", 3), "risk.max_open_positions"),
        daily_max_loss_usd=_must_float(risk_raw.get("daily_max_loss_usd", 3), "risk.daily_max_loss_usd"),
        max_drawdown_usd=_must_float(risk_raw.get("max_drawdown_usd", 8), "risk.max_drawdown_usd"),
    )
    entry = EntryExitConfig(
        take_profit_pct=_must_float(entry_raw.get("take_profit_pct", 0.01), "execution.entry.take_profit_pct"),
        stop_loss_pct=_must_float(entry_raw.get("stop_loss_pct", 0.015), "execution.entry.stop_loss_pct"),
        max_hold_minutes=_must_int(entry_raw.get("max_hold_minutes", 60), "execution.entry.max_hold_minutes"),
    )
    execution = ExecutionConfig(
        entry=entry,
        slippage_guard_pct=_must_float(exec_raw.get("slippage_guard_pct", 0.008), "execution.slippage_guard_pct"),
    )

    return AppConfig(
        mode=str(raw.get("mode", "dry_run")),
        account_id=str(raw.get("account_id", "")),
        poll_interval_seconds=_must_int(raw.get("poll_interval_seconds", 20), "poll_interval_seconds"),
        max_markets_scan=_must_int(raw.get("max_markets_scan", 30), "max_markets_scan"),
        venues=venues,
        liquidity=liquidity,
        risk=risk,
        execution=execution,
    )
