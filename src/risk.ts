export type RiskLimits = {
  startingCapitalUsd: number;
  maxPerTradeUsd: number;
  maxExposurePerMarketUsd: number;
  maxTotalExposureUsd: number;
  maxOpenPositions: number;
  dailyMaxLossUsd: number;
  maxDrawdownUsd: number;
};

export type RiskState = {
  dayKey: string;
  realizedPnlToday: number;
  equityPeak: number;
  equityNow: number;
};

export const todayKey = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export const initialRiskState = (limits: RiskLimits): RiskState => ({
  dayKey: todayKey(),
  realizedPnlToday: 0,
  equityPeak: limits.startingCapitalUsd,
  equityNow: limits.startingCapitalUsd
});

export const canOpenTrade = (opts: {
  limits: RiskLimits;
  state: RiskState;
  openPositions: number;
  totalExposure: number;
  marketExposure: number;
  intendedNotional: number;
}): { ok: boolean; reason: string } => {
  const k = todayKey();
  if (opts.state.dayKey !== k) {
    opts.state.dayKey = k;
    opts.state.realizedPnlToday = 0;
  }

  if (opts.state.realizedPnlToday <= -opts.limits.dailyMaxLossUsd) return { ok: false, reason: "daily_loss_limit" };
  if (opts.limits.startingCapitalUsd - opts.state.equityNow >= opts.limits.maxDrawdownUsd) return { ok: false, reason: "max_drawdown" };

  if (opts.openPositions >= opts.limits.maxOpenPositions) return { ok: false, reason: "max_open_positions" };
  if (opts.intendedNotional > opts.limits.maxPerTradeUsd) return { ok: false, reason: "max_per_trade" };
  if (opts.marketExposure + opts.intendedNotional > opts.limits.maxExposurePerMarketUsd)
    return { ok: false, reason: "max_exposure_per_market" };
  if (opts.totalExposure + opts.intendedNotional > opts.limits.maxTotalExposureUsd) return { ok: false, reason: "max_total_exposure" };

  return { ok: true, reason: "ok" };
};

