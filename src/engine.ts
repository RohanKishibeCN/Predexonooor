import crypto from "node:crypto";

import { AppConfig } from "./config.js";
import { RateLimiter } from "./limiter.js";
import { scoreTopOfBook } from "./liquidity.js";
import { quoteLimitlessMarket, quotePolymarketToken, mid, topDepth } from "./quotes.js";
import { DataClient, TradeClient } from "./predexon.js";
import { BotState, exposuresByMarket, loadState, saveState, totalExposure } from "./state.js";
import { RiskLimits, canOpenTrade, initialRiskState } from "./risk.js";

type VenueListing = {
  venue: string;
  tokenId?: string;
  marketSlug?: string;
};

const parseListings = (outcome: any): VenueListing[] => {
  const venues = (outcome?.venues ?? []) as any[];
  return venues.map((v) => ({
    venue: String(v?.venue ?? ""),
    tokenId: v?.token_id ? String(v.token_id) : undefined,
    marketSlug: v?.market_slug ? String(v.market_slug) : undefined
  }));
};

const quoteListing = async (data: DataClient, listing: VenueListing) => {
  if (listing.venue === "polymarket" && listing.tokenId) return await quotePolymarketToken(data, listing.tokenId);
  if (listing.venue === "limitless" && listing.marketSlug) return await quoteLimitlessMarket(data, listing.marketSlug);
  return null;
};

const pickBestLiquidity = async (opts: {
  data: DataClient;
  predexonId: string;
  enabledVenues: Set<string>;
  limiter: RateLimiter;
}): Promise<
  | {
      venue: "polymarket" | "limitless";
      tokenId: string;
      quoteMid: number;
      bestAsk: number;
      bestBid: number;
      bidSize: number;
      askSize: number;
    }
  | null
> => {
  await opts.limiter.wait();
  const outcome = await opts.data.getOutcome(opts.predexonId, true);
  const listings = parseListings(outcome).filter((l) => opts.enabledVenues.has(l.venue));

  let best:
    | {
        score: number;
        venue: "polymarket" | "limitless";
        tokenId: string;
        quoteMid: number;
        bestAsk: number;
        bestBid: number;
        bidSize: number;
        askSize: number;
      }
    | null = null;

  for (const l of listings) {
    await opts.limiter.wait();
    const q = await quoteListing(opts.data, l);
    if (!q) continue;
    const s = scoreTopOfBook(q);
    const tokenId = l.tokenId;
    if (!tokenId) continue;
    const m = mid(q);
    if (!best || s.score > best.score) {
      best = {
        score: s.score,
        venue: q.venue,
        tokenId,
        quoteMid: m,
        bestAsk: q.bestAsk,
        bestBid: q.bestBid,
        bidSize: q.bidSize,
        askSize: q.askSize
      };
    }
  }

  return best;
};

const extractMarketCandidates = (marketsPayload: any): Array<{ title: string; predexonId: string }> => {
  const markets = (marketsPayload?.markets ?? []) as any[];
  const out: Array<{ title: string; predexonId: string }> = [];
  for (const m of markets) {
    const outcomes = (m?.outcomes ?? []) as any[];
    for (const o of outcomes) {
      const predexonId = o?.predexon_id ?? o?.predexonId;
      const price = o?.price;
      if (!predexonId || price === undefined || price === null) continue;
      const p = Number(price);
      if (!Number.isFinite(p)) continue;
      if (p <= 0.05 || p >= 0.95) continue;
      out.push({ title: String(m?.title ?? m?.question ?? ""), predexonId: String(predexonId) });
    }
  }
  return out;
};

export const runBot = async (cfg: AppConfig, opts: { data: DataClient; trade: TradeClient; statePath: string }) => {
  const enabledVenues = new Set(cfg.venues.enabled);
  const limiter = new RateLimiter(1100);

  const limits: RiskLimits = { ...cfg.risk };
  const riskState = initialRiskState(limits);

  const state: BotState = loadState(opts.statePath);

  const health = { data: await opts.data.health(), trade: await opts.trade.health() };
  process.stdout.write(JSON.stringify({ health }, null, 2) + "\n");

  while (true) {
    const openPositions = state.positions.filter((p) => p.status === "open");
    const expByMarket = exposuresByMarket(state);
    const expTotal = totalExposure(state);

    for (const pos of openPositions) {
      let qMid: number | null = null;
      let bestBid: number | null = null;
      let bestAsk: number | null = null;

      await limiter.wait();
      if (pos.venue === "polymarket") {
        const q = await quotePolymarketToken(opts.data, pos.tokenId);
        if (q) {
          qMid = mid(q);
          bestBid = q.bestBid;
          bestAsk = q.bestAsk;
        }
      } else if (pos.venue === "limitless") {
        const outcome = await opts.data.getOutcome(pos.predexonId, true);
        const listing = parseListings(outcome).find((l) => l.venue === "limitless");
        if (listing?.marketSlug) {
          const q = await quoteLimitlessMarket(opts.data, listing.marketSlug);
          if (q) {
            qMid = mid(q);
            bestBid = q.bestBid;
            bestAsk = q.bestAsk;
          }
        }
      }

      if (qMid === null || bestBid === null || bestAsk === null) continue;

      const now = Date.now();
      const shouldExit =
        qMid >= pos.takeProfit || qMid <= pos.stopLoss || now >= pos.maxHoldUntil;

      if (!shouldExit) continue;

      const exitPrice = Math.max(0.001, Math.min(0.999, bestBid * (1 - cfg.execution.slippageGuardPct)));
      process.stdout.write(
        JSON.stringify(
          {
            event: "exit_signal",
            posId: pos.id,
            venue: pos.venue,
            mid: qMid,
            bestBid,
            bestAsk,
            exitPrice
          },
          null,
          2
        ) + "\n"
      );

      if (cfg.mode === "live") {
        const clientId = crypto.randomUUID();
        await opts.trade.placeOrder({
          accountId: cfg.accountId,
          venue: pos.venue,
          tokenId: pos.tokenId,
          side: "sell",
          type: "limit",
          size: pos.size,
          price: exitPrice,
          clientId
        });
      }

      pos.status = "closed";
      saveState(opts.statePath, state);
    }

    const openAfter = state.positions.filter((p) => p.status === "open");
    if (openAfter.length < cfg.risk.maxOpenPositions) {
      await limiter.wait();
      const marketsPayload = await opts.data.listPolymarketMarkets({ limit: cfg.maxMarketsScan });
      const candidates = extractMarketCandidates(marketsPayload);

      for (const c of candidates) {
        if (openAfter.some((p) => p.predexonId === c.predexonId && p.status === "open")) continue;

        const best = await pickBestLiquidity({
          data: opts.data,
          predexonId: c.predexonId,
          enabledVenues,
          limiter
        });
        if (!best) continue;

        const spread = best.bestAsk - best.bestBid;
        if (spread > cfg.liquidity.maxSpread) continue;

        const depthShares = Math.min(best.bidSize, best.askSize);
        if (depthShares * best.quoteMid < cfg.liquidity.minTopDepthUsd) continue;

        const intendedNotional = Math.min(cfg.risk.maxPerTradeUsd, cfg.risk.maxTotalExposureUsd - expTotal);
        const marketExp = expByMarket[c.predexonId] ?? 0;
        const gate = canOpenTrade({
          limits,
          state: riskState,
          openPositions: openAfter.length,
          totalExposure: expTotal,
          marketExposure: marketExp,
          intendedNotional
        });
        if (!gate.ok) continue;

        const entryPrice = Math.min(0.999, best.bestAsk * (1 + cfg.execution.slippageGuardPct));
        const size = Math.max(0.01, intendedNotional / entryPrice);
        const tp = entryPrice * (1 + cfg.execution.entry.takeProfitPct);
        const sl = entryPrice * (1 - cfg.execution.entry.stopLossPct);
        const maxHoldUntil = Date.now() + cfg.execution.entry.maxHoldMinutes * 60_000;

        process.stdout.write(
          JSON.stringify(
            {
              event: "enter_candidate",
              venue: best.venue,
              title: c.title,
              predexonId: c.predexonId,
              spread,
              entryPrice,
              size
            },
            null,
            2
          ) + "\n"
        );

        if (cfg.mode === "live") {
          const clientId = crypto.randomUUID();
          await opts.trade.placeOrder({
            accountId: cfg.accountId,
            venue: best.venue,
            tokenId: best.tokenId,
            side: "buy",
            type: "limit",
            size,
            price: entryPrice,
            clientId
          });
        }

        state.positions.push({
          id: crypto.randomUUID(),
          predexonId: c.predexonId,
          venue: best.venue,
          tokenId: best.tokenId,
          size,
          entryPrice,
          entryTs: Date.now(),
          takeProfit: tp,
          stopLoss: sl,
          maxHoldUntil,
          status: "open"
        });
        saveState(opts.statePath, state);

        if (state.positions.filter((p) => p.status === "open").length >= cfg.risk.maxOpenPositions) break;
      }
    }

    await new Promise((r) => setTimeout(r, cfg.pollIntervalSeconds * 1000));
  }
};
