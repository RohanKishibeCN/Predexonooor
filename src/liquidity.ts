import { TopOfBook, spread, topDepth } from "./quotes.js";

export type LiquidityScore = {
  venue: "polymarket" | "limitless";
  score: number;
  spread: number;
  topDepth: number;
};

export const scoreTopOfBook = (q: TopOfBook): LiquidityScore => {
  const s = spread(q);
  const d = topDepth(q);
  const score = -s * 100 + Math.log1p(Math.max(0, d));
  return { venue: q.venue, score, spread: s, topDepth: d };
};

