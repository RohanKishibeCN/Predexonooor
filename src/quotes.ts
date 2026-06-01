import { DataClient, nowMs } from "./predexon.js";

export type TopOfBook = {
  venue: "polymarket" | "limitless";
  bestBid: number;
  bestAsk: number;
  bidSize: number;
  askSize: number;
};

export const spread = (q: TopOfBook): number => Math.max(0, q.bestAsk - q.bestBid);
export const mid = (q: TopOfBook): number => (q.bestAsk + q.bestBid) / 2;
export const topDepth = (q: TopOfBook): number => Math.min(q.bidSize, q.askSize);

const extractBest = (levels: Array<{ price: number; size: number }>, side: "bid" | "ask"): { price: number; size: number } => {
  if (!levels.length) return { price: 0, size: 0 };
  const prices = levels.map((l) => Number(l.price)).filter((p) => Number.isFinite(p));
  if (!prices.length) return { price: 0, size: 0 };
  const bestPrice = side === "bid" ? Math.max(...prices) : Math.min(...prices);
  const best = levels.find((l) => Number(l.price) === bestPrice);
  return { price: bestPrice, size: Number(best?.size ?? 0) };
};

export const quotePolymarketToken = async (
  data: DataClient,
  tokenId: string,
  lookbackMs = 5 * 60 * 1000
): Promise<TopOfBook | null> => {
  const endMs = nowMs();
  const startMs = endMs - lookbackMs;
  const payload = await data.polymarketOrderbooks({ tokenId, startMs, endMs, limit: 1 });
  const snaps = (payload?.snapshots ?? []) as any[];
  if (!snaps.length) return null;
  const s = snaps[snaps.length - 1];
  const bids = (s?.bids ?? []) as any[];
  const asks = (s?.asks ?? []) as any[];
  const b = extractBest(bids, "bid");
  const a = extractBest(asks, "ask");
  if (b.price <= 0 || a.price <= 0) return null;
  return { venue: "polymarket", bestBid: b.price, bestAsk: a.price, bidSize: b.size, askSize: a.size };
};

export const quoteLimitlessMarket = async (
  data: DataClient,
  marketSlug: string,
  side: "yes" | "no" = "yes",
  lookbackMs = 5 * 60 * 1000
): Promise<TopOfBook | null> => {
  const endMs = nowMs();
  const startMs = endMs - lookbackMs;
  const payload = await data.limitlessOrderbooks({ marketSlug, startMs, endMs, limit: 1 });
  const snaps = (payload?.snapshots ?? []) as any[];
  if (!snaps.length) return null;
  const s = snaps[snaps.length - 1];
  const bids = (s?.bids ?? []) as any[];
  const asks = (s?.asks ?? []) as any[];
  const b = extractBest(bids, "bid");
  const a = extractBest(asks, "ask");
  if (b.price <= 0 || a.price <= 0) return null;
  if (side === "yes") {
    return { venue: "limitless", bestBid: b.price, bestAsk: a.price, bidSize: b.size, askSize: a.size };
  }
  const bestBid = 1 - a.price;
  const bestAsk = 1 - b.price;
  const bidSize = a.size;
  const askSize = b.size;
  return { venue: "limitless", bestBid, bestAsk, bidSize, askSize };
};
