import { Command } from "commander";
import process from "node:process";
import dotenv from "dotenv";

import { loadConfigFromEnv } from "./config.js";
import { runBot } from "./engine.js";
import { loadNotionConfigFromEnv, NotionClient } from "./notion.js";
import { DataClient, TradeClient } from "./predexon.js";
import { loadState, realizedToday, totalExposure } from "./state.js";

const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toBool = (v: unknown): boolean => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
};

const main = async () => {
  const program = new Command();
  program.name("predexonooor");
  program.option("--env-file <path>", "env file path", ".env");

  program
    .command("health")
    .action(async () => {
      const data = new DataClient();
      const trade = new TradeClient();
      const out = { data: await data.health(), trade: await trade.health() };
      process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    });

  const account = program.command("account");

  account
    .command("create")
    .action(async () => {
      const trade = new TradeClient();
      process.stdout.write(JSON.stringify(await trade.createAccount(), null, 2) + "\n");
    });

  account
    .command("list")
    .action(async () => {
      const trade = new TradeClient();
      process.stdout.write(JSON.stringify(await trade.listAccounts(), null, 2) + "\n");
    });

  account
    .command("get")
    .requiredOption("--account-id <id>")
    .action(async (opts) => {
      const trade = new TradeClient();
      process.stdout.write(JSON.stringify(await trade.getAccount(String(opts.accountId)), null, 2) + "\n");
    });

  account
    .command("enable")
    .requiredOption("--account-id <id>")
    .requiredOption("--venue <venue>")
    .action(async (opts) => {
      const trade = new TradeClient();
      process.stdout.write(JSON.stringify(await trade.enableVenue(String(opts.accountId), String(opts.venue) as any), null, 2) + "\n");
    });

  program
    .command("bot")
    .option("--state <path>", "state json path")
    .action(async (opts) => {
      const statePath = String(opts.state ?? process.env.STATE_PATH ?? "state.json");
      const cfg = loadConfigFromEnv();
      const data = new DataClient();
      const trade = new TradeClient();
      await runBot(cfg, { data, trade, statePath });
    });

  program
    .command("notion-daily")
    .option("--date <yyyy-mm-dd>", "report date (local day)")
    .option("--state <path>", "state json path")
    .option("--account-id <id>", "account id (override ACCOUNT_ID)")
    .action(async (opts) => {
      const cfg = loadNotionConfigFromEnv();
      if (!cfg) throw new Error("NOTION_API_TOKEN and NOTION_DATABASE_ID are required");

      const statePath = String(opts.state ?? process.env.STATE_PATH ?? "state.json");
      const state = loadState(statePath);

      const dateISO = String(opts.date ?? todayISO());
      const accountId = String(opts.accountId ?? process.env.ACCOUNT_ID ?? "").trim();
      if (!accountId) throw new Error("ACCOUNT_ID is required (or pass --account-id)");

      const mode = toBool(process.env.DRY_RUN) ? "dry_run" : String(process.env.MODE ?? "live");
      const realizedTodayUsd = realizedToday(state, dateISO);
      const realizedTotalUsd = Number(state.realized?.total ?? 0);
      const tradesToday = state.fills.filter((f) => f.dayISO === dateISO && f.accountId === accountId).length;
      const openPositions = state.positions.filter((p) => p.status === "open").length;
      const totalExposureUsd = totalExposure(state);

      const notion = new NotionClient(cfg);
      const res = await notion.upsertDailyRow({
        dateISO,
        accountId,
        mode,
        realizedPnlToday: realizedTodayUsd,
        realizedPnlTotal: realizedTotalUsd,
        tradesToday,
        openPositions,
        totalExposureUsd
      });
      process.stdout.write(JSON.stringify({ ok: true, ...res }, null, 2) + "\n");
    });

  await program.parseAsync(process.argv);
};

const boot = async () => {
  const envFile = (() => {
    const idx = process.argv.findIndex((a) => a === "--env-file");
    if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
    return ".env";
  })();
  dotenv.config({ path: envFile });
  await main();
};

boot().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + "\n");
  process.exitCode = 1;
});
