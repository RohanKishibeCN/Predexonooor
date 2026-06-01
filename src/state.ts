import fs from "node:fs";

export type Position = {
  id: string;
  predexonId: string;
  venue: "polymarket" | "limitless";
  tokenId: string;
  size: number;
  entryPrice: number;
  entryTs: number;
  takeProfit: number;
  stopLoss: number;
  maxHoldUntil: number;
  status: "open" | "closed";
};

export type BotState = {
  positions: Position[];
};

export const loadState = (path: string): BotState => {
  if (!fs.existsSync(path)) return { positions: [] };
  const raw = JSON.parse(fs.readFileSync(path, "utf8")) as BotState;
  if (!raw || typeof raw !== "object") return { positions: [] };
  return { positions: Array.isArray(raw.positions) ? raw.positions : [] };
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

