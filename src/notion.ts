export type NotionConfig = {
  token: string;
  databaseId: string;
  version: string;
};

export class NotionApiError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(`Notion API error ${statusCode}: ${message}`);
    this.statusCode = statusCode;
  }
}

export const loadNotionConfigFromEnv = (): NotionConfig | null => {
  const token = String(process.env.NOTION_API_TOKEN ?? "").trim();
  const databaseId = String(process.env.NOTION_DATABASE_ID ?? "").trim();
  const version = String(process.env.NOTION_VERSION ?? "2022-06-28").trim() || "2022-06-28";
  if (!token || !databaseId) return null;
  return { token, databaseId, version };
};

const request = async (cfg: NotionConfig, url: string, init: RequestInit = {}): Promise<any> => {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "notion-version": cfg.version,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const payload = await (async () => {
    try {
      return await res.json();
    } catch {
      return {};
    }
  })();
  if (!res.ok) {
    throw new NotionApiError(res.status, String(payload?.message ?? payload?.error ?? "unknown"));
  }
  return payload;
};

export type NotionDatabase = {
  id: string;
  properties: Record<string, { type: string }>;
};

export class NotionClient {
  cfg: NotionConfig;
  baseUrl = "https://api.notion.com/v1";
  cachedDb: NotionDatabase | null = null;

  constructor(cfg: NotionConfig) {
    this.cfg = cfg;
  }

  async getDatabase(): Promise<NotionDatabase> {
    if (this.cachedDb) return this.cachedDb;
    const db = await request(this.cfg, `${this.baseUrl}/databases/${this.cfg.databaseId}`, { method: "GET" });
    this.cachedDb = { id: String(db?.id ?? ""), properties: (db?.properties ?? {}) as any };
    return this.cachedDb;
  }

  async findDailyRow(opts: { dateISO: string; accountId: string }): Promise<string | null> {
    const db = await this.getDatabase();
    if (!db.properties["Date"]) throw new Error('Notion database missing property "Date"');
    if (!db.properties["Account ID"]) throw new Error('Notion database missing property "Account ID"');

    const payload = {
      filter: {
        and: [
          { property: "Date", date: { equals: opts.dateISO } },
          { property: "Account ID", rich_text: { equals: opts.accountId } }
        ]
      },
      page_size: 1
    };
    const res = await request(this.cfg, `${this.baseUrl}/databases/${this.cfg.databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const first = (res?.results ?? [])[0];
    const id = first?.id ? String(first.id) : "";
    return id || null;
  }

  buildProperties(input: {
    dateISO: string;
    accountId: string;
    mode?: string;
    realizedPnlToday?: number;
    realizedPnlTotal?: number;
    tradesToday?: number;
    openPositions?: number;
    totalExposureUsd?: number;
    updatedAtISO?: string;
  }): Record<string, any> {
    const props: Record<string, any> = {};
    const setIfExists = (db: NotionDatabase, key: string, value: any) => {
      if (db.properties[key]) props[key] = value;
    };

    const db = this.cachedDb;
    if (!db) return props;

    setIfExists(db, "Date", { date: { start: input.dateISO } });
    setIfExists(db, "Account ID", { rich_text: [{ type: "text", text: { content: input.accountId } }] });

    if (input.mode !== undefined) setIfExists(db, "Mode", { select: { name: input.mode } });
    if (input.realizedPnlToday !== undefined) setIfExists(db, "Realized PnL Today", { number: input.realizedPnlToday });
    if (input.realizedPnlTotal !== undefined) setIfExists(db, "Realized PnL Total", { number: input.realizedPnlTotal });
    if (input.tradesToday !== undefined) setIfExists(db, "Trades Today", { number: input.tradesToday });
    if (input.openPositions !== undefined) setIfExists(db, "Open Positions", { number: input.openPositions });
    if (input.totalExposureUsd !== undefined) setIfExists(db, "Total Exposure USD", { number: input.totalExposureUsd });
    if (input.updatedAtISO !== undefined) setIfExists(db, "Last Updated", { date: { start: input.updatedAtISO } });

    return props;
  }

  async upsertDailyRow(input: {
    dateISO: string;
    accountId: string;
    mode?: string;
    realizedPnlToday?: number;
    realizedPnlTotal?: number;
    tradesToday?: number;
    openPositions?: number;
    totalExposureUsd?: number;
  }): Promise<{ pageId: string; created: boolean }> {
    const db = await this.getDatabase();
    const pageId = await this.findDailyRow({ dateISO: input.dateISO, accountId: input.accountId });

    const properties = this.buildProperties({
      ...input,
      updatedAtISO: new Date().toISOString()
    });

    if (pageId) {
      await request(this.cfg, `${this.baseUrl}/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties })
      });
      return { pageId, created: false };
    }

    const created = await request(this.cfg, `${this.baseUrl}/pages`, {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: this.cfg.databaseId },
        properties
      })
    });
    return { pageId: String(created?.id ?? ""), created: true };
  }
}

