import crypto from "node:crypto";

import { AppConfig } from "./config.js";
import { RateLimiter } from "./limiter.js";
import { scoreTopOfBook } from "./liquidity.js";
import { quoteLimitlessMarket, quotePolymarketToken, mid } from "./quotes.js";
import { DataClient, PredexonApiError, TradeClient } from "./predexon.js";
import { applyFillToLedger, exposuresByMarket, loadState, realizedToday, saveState, totalExposure, type BotState, type Fill } from "./state.js";
import { RiskLimits, canOpenTrade, initialRiskState } from "./risk.js";

type VenueListing = {
  venue: string;
  tokenId?: string;
  marketSlug?: string;
  side?: string;
};

const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toNumber = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseExecutedFill = (resp: any): { ok: boolean; filledSize: number; avgPrice: number; orderId: string } => {
  const status = String(resp?.status ?? "");
  const orderId = String(resp?.orderId ?? "");
  const filled = toNumber(resp?.filled);
  const price = toNumber(resp?.price);

  if (!orderId) return { ok: false, filledSize: 0, avgPrice: 0, orderId: "" };
  if (status !== "filled" && status !== "partial" && status !== "cancelled") return { ok: false, filledSize: 0, avgPrice: 0, orderId };
  if (filled <= 0 || price <= 0) return { ok: false, filledSize: 0, avgPrice: 0, orderId };
  return { ok: true, filledSize: filled, avgPrice: price, orderId };
};

const parseListings = (outcome: any): VenueListing[] => {
  const venues = (outcome?.venues ?? []) as any[];
  return venues.map((v) => ({
    venue: String(v?.venue ?? ""),
    tokenId: v?.token_id ? String(v.token_id) : undefined,
    marketSlug: v?.market_slug ? String(v.market_slug) : undefined,
    side: v?.side ? String(v.side) : undefined
  }));
};

const quoteListing = async (data: DataClient, listing: VenueListing) => {
  if (listing.venue === "polymarket" && listing.tokenId) return await quotePolymarketToken(data, listing.tokenId);
  if (listing.venue === "limitless" && listing.marketSlug) {
    const side = listing.side === "no" ? "no" : "yes";
    return await quoteLimitlessMarket(data, listing.marketSlug, side);
  }
  return null;
};

const pickBestLiquidity = async (opts: {
  data: DataClient;
  predexonId: string;
  enabledVenues: Set<string>;
  limiter: RateLimiter;
  onOutcome404?: (predexonId: string) => void;
}): Promise<
  | {
      venue: "polymarket" | "limitless";
      tokenId?: string;
      marketSlug?: string;
      quoteMid: number;
      bestAsk: number;
      bestBid: number;
      bidSize: number;
      askSize: number;
    }
  | null
> => {
  await opts.limiter.wait();
  let outcome: any;
  try {
    outcome = await opts.data.getOutcome(opts.predexonId, true);
  } catch (e: any) {
    if (e instanceof PredexonApiError && e.statusCode === 404) {
      if (opts.onOutcome404) opts.onOutcome404(opts.predexonId);
      return null;
    }
    process.stdout.write(
      JSON.stringify(
        { event: "outcome_error", predexonId: opts.predexonId, statusCode: e?.statusCode, message: String(e?.message ?? e) },
        null,
        2
      ) + "\n"
    );
    return null;
  }
  const listings = parseListings(outcome).filter((l) => opts.enabledVenues.has(l.venue));

  let best:
    | {
        score: number;
        venue: "polymarket" | "limitless";
        tokenId?: string;
        marketSlug?: string;
        quoteMid: number;
        bestAsk: number;
        bestBid: number;
        bidSize: number;
        askSize: number;
      }
    | null = null;

  for (const l of listings) {
    await opts.limiter.wait();
    let q: any = null;
    try {
      q = await quoteListing(opts.data, l);
    } catch (e: any) {
      process.stdout.write(
        JSON.stringify(
          { event: "quote_error", predexonId: opts.predexonId, venue: l.venue, statusCode: e?.statusCode, message: String(e?.message ?? e) },
          null,
          2
        ) + "\n"
      );
      continue;
    }
    if (!q) continue;
    const s = scoreTopOfBook(q);
    const tokenId = q.venue === "polymarket" ? l.tokenId : undefined;
    const marketSlug = q.venue === "limitless" ? l.marketSlug : undefined;
    if (q.venue === "polymarket" && !tokenId) continue;
    if (q.venue === "limitless" && !marketSlug) continue;
    const m = mid(q);
    if (!best || s.score > best.score) {
      best = {
        score: s.score,
        venue: q.venue,
        tokenId,
        marketSlug,
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

  const outcome404Until = new Map<string, number>();
  const outcome404TtlMs = 6 * 60 * 60_000;
  let outcome404Count = 0;
  let lastOutcome404LogAt = 0;

  const onOutcome404 = (predexonId: string): void => {
    outcome404Until.set(predexonId, Date.now() + outcome404TtlMs);
    outcome404Count += 1;
    const now = Date.now();
    if (now - lastOutcome404LogAt >= 60_000) {
      lastOutcome404LogAt = now;
      process.stdout.write(JSON.stringify({ event: "skip_outcome_404_batch", count: outcome404Count }, null, 2) + "\n");
      outcome404Count = 0;
    }
  };

  const syncRealizedRisk = (): void => {
    const day = todayISO();
    if (riskState.dayKey !== day) riskState.dayKey = day;
    riskState.realizedPnlToday = realizedToday(state, day);
  };

  while (true) {
    syncRealizedRisk();
    const openPositions = state.positions.filter((p) => p.status === "open");

    for (const pos of openPositions) {
      let qMid: number | null = null;
      let bestBid: number | null = null;
      let bestAsk: number | null = null;

      await limiter.wait();
      if (pos.venue === "polymarket") {
        if (!pos.tokenId) continue;
        let q: any = null;
        try {
          q = await quotePolymarketToken(opts.data, pos.tokenId);
        } catch (e: any) {
          process.stdout.write(
            JSON.stringify(
              { event: "quote_error", predexonId: pos.predexonId, venue: "polymarket", statusCode: e?.statusCode, message: String(e?.message ?? e) },
              null,
              2
            ) + "\n"
          );
          continue;
        }
        if (q) {
          qMid = mid(q);
          bestBid = q.bestBid;
          bestAsk = q.bestAsk;
        }
      } else if (pos.venue === "limitless") {
        let outcome: any;
        try {
          outcome = await opts.data.getOutcome(pos.predexonId, true);
        } catch (e: any) {
          if (e instanceof PredexonApiError && e.statusCode === 404) continue;
          process.stdout.write(
            JSON.stringify(
              { event: "outcome_error", predexonId: pos.predexonId, statusCode: e?.statusCode, message: String(e?.message ?? e) },
              null,
              2
            ) + "\n"
          );
          continue;
        }
        const listing = parseListings(outcome).find((l) => l.venue === "limitless");
        if (listing?.marketSlug) {
          const side = listing.side === "no" ? "no" : "yes";
          let q: any = null;
          try {
            q = await quoteLimitlessMarket(opts.data, listing.marketSlug, side);
          } catch (e: any) {
            process.stdout.write(
              JSON.stringify(
                { event: "quote_error", predexonId: pos.predexonId, venue: "limitless", statusCode: e?.statusCode, message: String(e?.message ?? e) },
                null,
                2
              ) + "\n"
            );
            continue;
          }
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
        const resp = await opts.trade.placeOrder({
          accountId: cfg.accountId,
          venue: pos.venue,
          predexonId: pos.predexonId,
          side: "sell",
          type: "market",
          size: pos.size,
          clientId
        });
        const exec = parseExecutedFill(resp);
        if (exec.ok) {
          const fill: Fill = {
            id: crypto.randomUUID(),
            ts: Date.now(),
            dayISO: todayISO(),
            accountId: cfg.accountId,
            venue: pos.venue,
            predexonId: pos.predexonId,
            side: "sell",
            filledSize: exec.filledSize,
            avgPrice: exec.avgPrice,
            orderId: exec.orderId,
            clientId
          };
          applyFillToLedger(state, fill);
          syncRealizedRisk();
          if (exec.filledSize + 1e-9 < pos.size) {
            pos.size -= exec.filledSize;
            saveState(opts.statePath, state);
            continue;
          }
        }
      } else {
        const fill: Fill = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          dayISO: todayISO(),
          accountId: cfg.accountId || "dry_run",
          venue: pos.venue,
          predexonId: pos.predexonId,
          side: "sell",
          filledSize: pos.size,
          avgPrice: exitPrice,
          orderId: `dryrun:${crypto.randomUUID()}`,
          clientId: "dryrun"
        };
        applyFillToLedger(state, fill);
        syncRealizedRisk();
      }

      pos.status = "closed";
      saveState(opts.statePath, state);
    }

    let openAfter = state.positions.filter((p) => p.status === "open");
    if (openAfter.length < cfg.risk.maxOpenPositions) {
      await limiter.wait();
      const marketsPayload = await opts.data.listCanonicalMarkets({ limit: cfg.maxMarketsScan });
      const candidates = extractMarketCandidates(marketsPayload);

      for (const c of candidates) {
        openAfter = state.positions.filter((p) => p.status === "open");
        if (openAfter.length >= cfg.risk.maxOpenPositions) break;
        if (openAfter.some((p) => p.predexonId === c.predexonId && p.status === "open")) continue;

        const expByMarket = exposuresByMarket(state);
        const expTotal = totalExposure(state);

        const blockedUntil = outcome404Until.get(c.predexonId);
        if (blockedUntil && blockedUntil > Date.now()) continue;

        const best = await pickBestLiquidity({
          data: opts.data,
          predexonId: c.predexonId,
          enabledVenues,
          limiter,
          onOutcome404
        });
        if (!best) continue;

        const spread = best.bestAsk - best.bestBid;
        if (spread > cfg.liquidity.maxSpread) continue;

        const depthShares = Math.min(best.bidSize, best.askSize);
        if (depthShares * best.quoteMid < cfg.liquidity.minTopDepthUsd) continue;

        const intendedNotional = Math.min(cfg.risk.maxPerTradeUsd, cfg.risk.maxTotalExposureUsd - expTotal);
        if (intendedNotional <= 0) continue;
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

        process.stdout.write(
          JSON.stringify(
            {
              event: "enter_signal",
              venue: best.venue,
              title: c.title,
              predexonId: c.predexonId,
              spread,
              bestBid: best.bestBid,
              bestAsk: best.bestAsk,
              intendedNotional
            },
            null,
            2
          ) + "\n"
        );

        if (cfg.mode === "live") {
          const clientId = crypto.randomUUID();
          const resp = await opts.trade.placeOrder({
            accountId: cfg.accountId,
            venue: best.venue,
            predexonId: c.predexonId,
            side: "buy",
            type: "market",
            amount: intendedNotional,
            clientId
          });
          const exec = parseExecutedFill(resp);
          if (!exec.ok) {
            continue;
          }
          const entryPrice = exec.avgPrice;
          const filledSize = exec.filledSize;
          const tp = entryPrice * (1 + cfg.execution.entry.takeProfitPct);
          const sl = entryPrice * (1 - cfg.execution.entry.stopLossPct);
          const maxHoldUntil = Date.now() + cfg.execution.entry.maxHoldMinutes * 60_000;

          const fill: Fill = {
            id: crypto.randomUUID(),
            ts: Date.now(),
            dayISO: todayISO(),
            accountId: cfg.accountId,
            venue: best.venue,
            predexonId: c.predexonId,
            side: "buy",
            filledSize,
            avgPrice: entryPrice,
            orderId: exec.orderId,
            clientId
          };
          applyFillToLedger(state, fill);
          syncRealizedRisk();

          state.positions.push({
            id: crypto.randomUUID(),
            predexonId: c.predexonId,
            venue: best.venue,
            tokenId: best.venue === "polymarket" ? best.tokenId : undefined,
            size: filledSize,
            entryPrice,
            entryTs: Date.now(),
            takeProfit: tp,
            stopLoss: sl,
            maxHoldUntil,
            status: "open"
          });
          saveState(opts.statePath, state);
          continue;
        }

        const entryPrice = Math.min(0.999, best.bestAsk * (1 + cfg.execution.slippageGuardPct));
        const size = Math.max(0.01, intendedNotional / entryPrice);
        const tp = entryPrice * (1 + cfg.execution.entry.takeProfitPct);
        const sl = entryPrice * (1 - cfg.execution.entry.stopLossPct);
        const maxHoldUntil = Date.now() + cfg.execution.entry.maxHoldMinutes * 60_000;

        const fill: Fill = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          dayISO: todayISO(),
          accountId: cfg.accountId || "dry_run",
          venue: best.venue,
          predexonId: c.predexonId,
          side: "buy",
          filledSize: size,
          avgPrice: entryPrice,
          orderId: `dryrun:${crypto.randomUUID()}`,
          clientId: "dryrun"
        };
        applyFillToLedger(state, fill);
        syncRealizedRisk();

        state.positions.push({
          id: crypto.randomUUID(),
          predexonId: c.predexonId,
          venue: best.venue,
          tokenId: best.venue === "polymarket" ? best.tokenId : undefined,
          size,
          entryPrice,
          entryTs: Date.now(),
          takeProfit: tp,
          stopLoss: sl,
          maxHoldUntil,
          status: "open"
        });
        saveState(opts.statePath, state);
      }
    }

    await new Promise((r) => setTimeout(r, cfg.pollIntervalSeconds * 1000));
  }
};
