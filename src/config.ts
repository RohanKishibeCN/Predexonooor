import fs from "node:fs";
import YAML from "yaml";

export type Mode = "dry_run" | "live";

export type AppConfig = {
  mode: Mode;
  accountId: string;
  pollIntervalSeconds: number;
  maxMarketsScan: number;
  venues: {
    enabled: Array<"polymarket" | "limitless">;
    preferOrder: Array<"polymarket" | "limitless">;
  };
  liquidity: {
    maxSpread: number;
    minTopDepthUsd: number;
  };
  risk: {
    startingCapitalUsd: number;
    maxPerTradeUsd: number;
    maxExposurePerMarketUsd: number;
    maxTotalExposureUsd: number;
    maxOpenPositions: number;
    dailyMaxLossUsd: number;
    maxDrawdownUsd: number;
  };
  execution: {
    entry: {
      takeProfitPct: number;
      stopLossPct: number;
      maxHoldMinutes: number;
    };
    slippageGuardPct: number;
  };
};

const mustNumber = (v: unknown, path: string): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number at ${path}`);
  }
  return n;
};

const mustInt = (v: unknown, path: string): number => {
  const n = mustNumber(v, path);
  if (!Number.isInteger(n)) {
    throw new Error(`Invalid int at ${path}`);
  }
  return n;
};

export const loadConfig = (path: string): AppConfig => {
  const raw = YAML.parse(fs.readFileSync(path, "utf8")) as any;
  if (!raw || typeof raw !== "object") throw new Error("Config root must be a YAML mapping");

  const cfg: AppConfig = {
    mode: (raw.mode ?? "dry_run") as Mode,
    accountId: String(raw.account_id ?? raw.accountId ?? ""),
    pollIntervalSeconds: mustInt(raw.poll_interval_seconds ?? raw.pollIntervalSeconds ?? 20, "pollIntervalSeconds"),
    maxMarketsScan: mustInt(raw.max_markets_scan ?? raw.maxMarketsScan ?? 30, "maxMarketsScan"),
    venues: {
      enabled: (raw.venues?.enabled ?? ["polymarket", "limitless"]) as any,
      preferOrder: (raw.venues?.prefer_order ?? raw.venues?.preferOrder ?? ["polymarket", "limitless"]) as any
    },
    liquidity: {
      maxSpread: mustNumber(raw.liquidity?.max_spread ?? raw.liquidity?.maxSpread ?? 0.02, "liquidity.maxSpread"),
      minTopDepthUsd: mustNumber(
        raw.liquidity?.min_top_depth_usd ?? raw.liquidity?.minTopDepthUsd ?? 20,
        "liquidity.minTopDepthUsd"
      )
    },
    risk: {
      startingCapitalUsd: mustNumber(
        raw.risk?.starting_capital_usd ?? raw.risk?.startingCapitalUsd ?? 100,
        "risk.startingCapitalUsd"
      ),
      maxPerTradeUsd: mustNumber(raw.risk?.max_per_trade_usd ?? raw.risk?.maxPerTradeUsd ?? 5, "risk.maxPerTradeUsd"),
      maxExposurePerMarketUsd: mustNumber(
        raw.risk?.max_exposure_per_market_usd ?? raw.risk?.maxExposurePerMarketUsd ?? 10,
        "risk.maxExposurePerMarketUsd"
      ),
      maxTotalExposureUsd: mustNumber(
        raw.risk?.max_total_exposure_usd ?? raw.risk?.maxTotalExposureUsd ?? 30,
        "risk.maxTotalExposureUsd"
      ),
      maxOpenPositions: mustInt(raw.risk?.max_open_positions ?? raw.risk?.maxOpenPositions ?? 3, "risk.maxOpenPositions"),
      dailyMaxLossUsd: mustNumber(raw.risk?.daily_max_loss_usd ?? raw.risk?.dailyMaxLossUsd ?? 3, "risk.dailyMaxLossUsd"),
      maxDrawdownUsd: mustNumber(raw.risk?.max_drawdown_usd ?? raw.risk?.maxDrawdownUsd ?? 8, "risk.maxDrawdownUsd")
    },
    execution: {
      entry: {
        takeProfitPct: mustNumber(
          raw.execution?.entry?.take_profit_pct ?? raw.execution?.entry?.takeProfitPct ?? 0.01,
          "execution.entry.takeProfitPct"
        ),
        stopLossPct: mustNumber(
          raw.execution?.entry?.stop_loss_pct ?? raw.execution?.entry?.stopLossPct ?? 0.015,
          "execution.entry.stopLossPct"
        ),
        maxHoldMinutes: mustInt(
          raw.execution?.entry?.max_hold_minutes ?? raw.execution?.entry?.maxHoldMinutes ?? 60,
          "execution.entry.maxHoldMinutes"
        )
      },
      slippageGuardPct: mustNumber(
        raw.execution?.slippage_guard_pct ?? raw.execution?.slippageGuardPct ?? 0.008,
        "execution.slippageGuardPct"
      )
    }
  };

  if (cfg.mode !== "dry_run" && cfg.mode !== "live") throw new Error("mode must be dry_run or live");
  if (cfg.mode === "live" && !cfg.accountId) throw new Error("account_id/accountId is required in live mode");
  return cfg;
};

