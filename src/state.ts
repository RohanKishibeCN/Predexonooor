import fs from "node:fs";

export type Position = {
  id: string;
  predexonId: string;
  venue: "polymarket" | "limitless" | "hyperliquid";
  tokenId?: string;
  assetId?: string;
  size: number;
  entryPrice: number;
  entryTs: number;
  takeProfit: number;
  stopLoss: number;
  maxHoldUntil: number;
  status: "open" | "closed";
};

export type Fill = {
  id: string;
  ts: number;
  dayISO: string;
  accountId: string;
  venue: "polymarket" | "limitless" | "hyperliquid";
  predexonId: string;
  side: "buy" | "sell";
  filledSize: number;
  avgPrice: number;
  orderId: string;
  clientId?: string;
};

export type Lot = {
  predexonId: string;
  venue: "polymarket" | "limitless" | "hyperliquid";
  size: number;
  price: number;
};

export type BotState = {
  positions: Position[];
  fills: Fill[];
  lots: Lot[];
  lastExitTsByPredexonId: Record<string, number>;
  lastTickAt?: number;
  lastTickDayISO?: string;
  lastTickVenuesEnabled?: string[];
  lastTickSummary?: Record<string, any>;
  realized: {
    total: number;
    byDay: Record<string, number>;
  };
};

export const loadState = (path: string): BotState => {
  if (!fs.existsSync(path))
    return {
      positions: [],
      fills: [],
      lots: [],
      lastExitTsByPredexonId: {},
      lastTickAt: undefined,
      lastTickDayISO: undefined,
      lastTickVenuesEnabled: undefined,
      lastTickSummary: undefined,
      realized: { total: 0, byDay: {} }
    };
  const raw = JSON.parse(fs.readFileSync(path, "utf8")) as BotState;
  if (!raw || typeof raw !== "object")
    return {
      positions: [],
      fills: [],
      lots: [],
      lastExitTsByPredexonId: {},
      lastTickAt: undefined,
      lastTickDayISO: undefined,
      lastTickVenuesEnabled: undefined,
      lastTickSummary: undefined,
      realized: { total: 0, byDay: {} }
    };
  return {
    positions: Array.isArray(raw.positions) ? raw.positions : [],
    fills: Array.isArray((raw as any).fills) ? (raw as any).fills : [],
    lots: Array.isArray((raw as any).lots) ? (raw as any).lots : [],
    lastExitTsByPredexonId:
      (raw as any).lastExitTsByPredexonId && typeof (raw as any).lastExitTsByPredexonId === "object"
        ? (raw as any).lastExitTsByPredexonId
        : {},
    lastTickAt: typeof (raw as any).lastTickAt === "number" ? (raw as any).lastTickAt : undefined,
    lastTickDayISO: typeof (raw as any).lastTickDayISO === "string" ? (raw as any).lastTickDayISO : undefined,
    lastTickVenuesEnabled: Array.isArray((raw as any).lastTickVenuesEnabled) ? (raw as any).lastTickVenuesEnabled : undefined,
    lastTickSummary: (raw as any).lastTickSummary && typeof (raw as any).lastTickSummary === "object" ? (raw as any).lastTickSummary : undefined,
    realized: (raw as any).realized && typeof (raw as any).realized === "object" ? (raw as any).realized : { total: 0, byDay: {} }
  };
};

export const saveState = (path: string, state: BotState): void => {
  const tmp = `${path}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, path);
};

export const exposuresByMarket = (state: BotState): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const p of state.positions) {
    if (p.status !== "open") continue;
    out[p.predexonId] = (out[p.predexonId] ?? 0) + p.size * p.entryPrice;
  }
  return out;
};

export const totalExposure = (state: BotState): number =>
  state.positions.filter((p) => p.status === "open").reduce((acc, p) => acc + p.size * p.entryPrice, 0);

export const realizedToday = (state: BotState, dayISO: string): number => Number(state.realized?.byDay?.[dayISO] ?? 0);

export const applyFillToLedger = (state: BotState, fill: Fill): void => {
  state.fills.push(fill);

  if (!state.realized) state.realized = { total: 0, byDay: {} };
  if (!state.realized.byDay) state.realized.byDay = {};

  if (fill.side === "buy") {
    state.lots.push({ predexonId: fill.predexonId, venue: fill.venue, size: fill.filledSize, price: fill.avgPrice });
    return;
  }

  let remaining = fill.filledSize;
  let realized = 0;
  const lots = state.lots.filter((l) => l.predexonId === fill.predexonId && l.venue === fill.venue);

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.size);
    realized += (fill.avgPrice - lot.price) * take;
    lot.size -= take;
    remaining -= take;
  }

  state.lots = state.lots.filter((l) => l.size > 1e-12);
  state.realized.total += realized;
  state.realized.byDay[fill.dayISO] = (state.realized.byDay[fill.dayISO] ?? 0) + realized;
};
