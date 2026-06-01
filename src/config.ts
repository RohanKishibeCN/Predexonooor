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

const mustNumber = (v: unknown, path: string, defaultValue?: number): number => {
  if (v === undefined || v === null || v === "") {
    if (defaultValue !== undefined) return defaultValue;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number at ${path}`);
  }
  return n;
};

const mustInt = (v: unknown, path: string, defaultValue?: number): number => {
  const n = mustNumber(v, path, defaultValue);
  if (!Number.isInteger(n)) {
    throw new Error(`Invalid int at ${path}`);
  }
  return n;
};

const mustMode = (v: unknown): Mode => {
  const s = String(v ?? "dry_run");
  if (s !== "dry_run" && s !== "live") throw new Error("MODE must be dry_run or live");
  return s;
};

const mustVenueList = (v: unknown, defaultValue: Array<"polymarket" | "limitless">): Array<"polymarket" | "limitless"> => {
  const s = String(v ?? "").trim();
  if (!s) return defaultValue;
  const items = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const allowed = new Set(["polymarket", "limitless"]);
  const out: Array<"polymarket" | "limitless"> = [];
  for (const it of items) {
    if (!allowed.has(it)) throw new Error(`Invalid venue in ENABLED_VENUES: ${it}`);
    out.push(it as any);
  }
  return out.length ? out : defaultValue;
};

export const loadConfigFromEnv = (): AppConfig => {
  const cfg: AppConfig = {
    mode: mustMode(process.env.MODE),
    accountId: String(process.env.ACCOUNT_ID ?? ""),
    pollIntervalSeconds: mustInt(process.env.POLL_INTERVAL_SECONDS, "POLL_INTERVAL_SECONDS", 20),
    maxMarketsScan: mustInt(process.env.MAX_MARKETS_SCAN, "MAX_MARKETS_SCAN", 30),
    venues: {
      enabled: mustVenueList(process.env.ENABLED_VENUES, ["polymarket", "limitless"]),
      preferOrder: mustVenueList(process.env.VENUE_PREFER_ORDER, ["polymarket", "limitless"])
    },
    liquidity: {
      maxSpread: mustNumber(process.env.MAX_SPREAD, "MAX_SPREAD", 0.02),
      minTopDepthUsd: mustNumber(process.env.MIN_TOP_DEPTH_USD, "MIN_TOP_DEPTH_USD", 20)
    },
    risk: {
      startingCapitalUsd: mustNumber(process.env.STARTING_CAPITAL_USD, "STARTING_CAPITAL_USD", 100),
      maxPerTradeUsd: mustNumber(process.env.MAX_PER_TRADE_USD, "MAX_PER_TRADE_USD", 5),
      maxExposurePerMarketUsd: mustNumber(process.env.MAX_EXPOSURE_PER_MARKET_USD, "MAX_EXPOSURE_PER_MARKET_USD", 10),
      maxTotalExposureUsd: mustNumber(process.env.MAX_TOTAL_EXPOSURE_USD, "MAX_TOTAL_EXPOSURE_USD", 30),
      maxOpenPositions: mustInt(process.env.MAX_OPEN_POSITIONS, "MAX_OPEN_POSITIONS", 3),
      dailyMaxLossUsd: mustNumber(process.env.DAILY_MAX_LOSS_USD, "DAILY_MAX_LOSS_USD", 3),
      maxDrawdownUsd: mustNumber(process.env.MAX_DRAWDOWN_USD, "MAX_DRAWDOWN_USD", 8)
    },
    execution: {
      entry: {
        takeProfitPct: mustNumber(process.env.TAKE_PROFIT_PCT, "TAKE_PROFIT_PCT", 0.01),
        stopLossPct: mustNumber(process.env.STOP_LOSS_PCT, "STOP_LOSS_PCT", 0.015),
        maxHoldMinutes: mustInt(process.env.MAX_HOLD_MINUTES, "MAX_HOLD_MINUTES", 60)
      },
      slippageGuardPct: mustNumber(process.env.SLIPPAGE_GUARD_PCT, "SLIPPAGE_GUARD_PCT", 0.008)
    }
  };

  if (cfg.mode === "live" && !cfg.accountId) throw new Error("ACCOUNT_ID is required when MODE=live");
  return cfg;
};
