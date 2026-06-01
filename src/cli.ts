import { Command } from "commander";
import process from "node:process";

import { loadConfig } from "./config.js";
import { runBot } from "./engine.js";
import { DataClient, TradeClient } from "./predexon.js";

const main = async () => {
  const program = new Command();
  program.name("predexonooor");

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
    .requiredOption("--config <path>")
    .option("--state <path>", "state json path", "state.json")
    .action(async (opts) => {
      const cfg = loadConfig(String(opts.config));
      const data = new DataClient();
      const trade = new TradeClient();
      await runBot(cfg, { data, trade, statePath: String(opts.state) });
    });

  await program.parseAsync(process.argv);
};

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + "\n");
  process.exitCode = 1;
});

