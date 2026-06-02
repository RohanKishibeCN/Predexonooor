export type Venue = "polymarket" | "limitless";

export class PredexonApiError extends Error {
  statusCode: number;
  errorCode?: string;
  requestId?: string;

  constructor(opts: { statusCode: number; errorCode?: string; message?: string; requestId?: string }) {
    super(`Predexon API error ${opts.statusCode}: ${opts.errorCode ?? ""} ${opts.message ?? ""} (${opts.requestId ?? ""})`);
    this.statusCode = opts.statusCode;
    this.errorCode = opts.errorCode;
    this.requestId = opts.requestId;
  }
}

const pickApiKey = (url: string): string => {
  const host = new URL(url).host;
  const fallback = String(process.env.PREDEXON_API_KEY ?? "").trim();

  if (host === "api.predexon.com") {
    return String(process.env.PREDEXON_DATA_API_KEY ?? fallback).trim();
  }

  if (host === "trade.predexon.com") {
    return String(process.env.PREDEXON_TRADING_API_KEY ?? fallback).trim();
  }

  return fallback;
};

const withApiKey = (url: string, headers?: HeadersInit): HeadersInit => {
  const k = pickApiKey(url);
  if (!k) throw new Error("Missing Predexon API key (set PREDEXON_DATA_API_KEY / PREDEXON_TRADING_API_KEY)");
  return { ...(headers ?? {}), "x-api-key": k };
};

const parseJsonSafe = async (res: Response): Promise<any> => {
  try {
    return await res.json();
  } catch {
    return {};
  }
};

const request = async (url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<any> => {
  const timeoutMs = init.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: withApiKey(url, init.headers) });
    if (res.ok) return await res.json();
    const payload = await parseJsonSafe(res);
    throw new PredexonApiError({
      statusCode: res.status,
      errorCode: payload?.error,
      message: payload?.message,
      requestId: payload?.requestId ?? res.headers.get("x-request-id") ?? undefined
    });
  } finally {
    clearTimeout(t);
  }
};

export class DataClient {
  baseUrl = "https://api.predexon.com";

  health(): Promise<any> {
    return this.listPolymarketMarkets({ limit: 1 });
  }

  listPolymarketMarkets(params: { status?: string; sort?: string; limit?: number }): Promise<any> {
    const u = new URL(`${this.baseUrl}/v2/polymarket/markets`);
    u.searchParams.set("status", params.status ?? "open");
    u.searchParams.set("sort", params.sort ?? "volume");
    u.searchParams.set("limit", String(params.limit ?? 30));
    return request(u.toString());
  }

  getOutcome(predexonId: string, routableOnly = true): Promise<any> {
    const u = new URL(`${this.baseUrl}/v2/outcomes/${predexonId}`);
    u.searchParams.set("routable_only", String(routableOnly));
    return request(u.toString());
  }

  polymarketOrderbooks(params: { tokenId: string; startMs: number; endMs: number; limit?: number }): Promise<any> {
    const u = new URL(`${this.baseUrl}/v2/polymarket/orderbooks`);
    u.searchParams.set("token_id", params.tokenId);
    u.searchParams.set("start_time", String(params.startMs));
    u.searchParams.set("end_time", String(params.endMs));
    u.searchParams.set("limit", String(params.limit ?? 1));
    return request(u.toString());
  }

  limitlessOrderbooks(params: { marketSlug: string; startMs: number; endMs: number; limit?: number }): Promise<any> {
    const u = new URL(`${this.baseUrl}/v2/limitless/orderbooks`);
    u.searchParams.set("market_slug", params.marketSlug);
    u.searchParams.set("start_time", String(params.startMs));
    u.searchParams.set("end_time", String(params.endMs));
    u.searchParams.set("limit", String(params.limit ?? 1));
    return request(u.toString());
  }
}

export class TradeClient {
  baseUrl = "https://trade.predexon.com";

  health(): Promise<any> {
    return request(`${this.baseUrl}/health`);
  }

  createAccount(): Promise<any> {
    return request(`${this.baseUrl}/api/accounts/create`, { method: "POST" });
  }

  listAccounts(): Promise<any> {
    return request(`${this.baseUrl}/api/accounts`);
  }

  getAccount(accountId: string): Promise<any> {
    return request(`${this.baseUrl}/api/accounts/${accountId}`);
  }

  enableVenue(accountId: string, venue: Venue): Promise<any> {
    return request(`${this.baseUrl}/api/accounts/${accountId}/enable`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ venue })
    });
  }

  getBalance(accountId: string, aggregated = false): Promise<any> {
    const u = new URL(`${this.baseUrl}/api/accounts/${accountId}/balance`);
    u.searchParams.set("aggregated", String(aggregated));
    return request(u.toString());
  }

  getPositions(accountId: string, aggregated = false): Promise<any> {
    const u = new URL(`${this.baseUrl}/api/accounts/${accountId}/positions`);
    u.searchParams.set("aggregated", String(aggregated));
    return request(u.toString());
  }

  getDepositInfo(accountId: string): Promise<any> {
    return request(`${this.baseUrl}/api/accounts/${accountId}/deposit-info`);
  }

  placeOrder(params: {
    accountId: string;
    venue: Venue;
    predexonId?: string;
    market?: { tokenId?: string; marketSlug?: string };
    side: "buy" | "sell";
    type: "market" | "limit";
    amount?: number;
    size?: number;
    price?: number;
    clientId?: string;
  }): Promise<any> {
    const payload: any = {
      venue: params.venue,
      side: params.side,
      type: params.type
    };
    if (params.predexonId) payload.predexonId = params.predexonId;
    if (params.market) payload.market = params.market;
    if (params.amount !== undefined) payload.amount = String(params.amount);
    if (params.size !== undefined) payload.size = String(params.size);
    if (params.price !== undefined) payload.price = String(params.price);
    if (params.clientId) payload.clientId = params.clientId;

    return request(`${this.baseUrl}/api/accounts/${params.accountId}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
}

export const nowMs = (): number => Date.now();
