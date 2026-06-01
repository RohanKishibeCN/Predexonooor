from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

from .config import load_config
from .engine import run_bot
from .http import HttpConfig, make_session
from .predexon import DataClient, TradeClient


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="predexonooor")
    p.add_argument("--log-level", default=os.environ.get("LOG_LEVEL", "INFO"))

    sub = p.add_subparsers(dest="cmd", required=True)

    bot = sub.add_parser("bot")
    bot.add_argument("--config", required=True)
    bot.add_argument("--db", default="state.db")

    acct = sub.add_parser("account")
    acct_sub = acct.add_subparsers(dest="acct_cmd", required=True)

    acct_create = acct_sub.add_parser("create")

    acct_list = acct_sub.add_parser("list")

    acct_get = acct_sub.add_parser("get")
    acct_get.add_argument("--account-id", required=True)

    acct_enable = acct_sub.add_parser("enable")
    acct_enable.add_argument("--account-id", required=True)
    acct_enable.add_argument("--venue", required=True)

    health = sub.add_parser("health")

    args = p.parse_args(argv)
    _setup_logging(args.log_level)

    session = make_session(HttpConfig())
    data = DataClient(session=session)
    trade = TradeClient(session=session)

    if args.cmd == "health":
        print(json.dumps({"data": data.health(), "trade": trade.health()}, indent=2))
        return 0

    if args.cmd == "account":
        if args.acct_cmd == "create":
            print(json.dumps(trade.create_account(), indent=2))
            return 0
        if args.acct_cmd == "list":
            print(json.dumps(trade.list_accounts(), indent=2))
            return 0
        if args.acct_cmd == "get":
            print(json.dumps(trade.get_account(account_id=args.account_id), indent=2))
            return 0
        if args.acct_cmd == "enable":
            print(json.dumps(trade.enable_venue(account_id=args.account_id, venue=args.venue), indent=2))
            return 0
        raise RuntimeError("unknown account subcommand")

    if args.cmd == "bot":
        cfg = load_config(Path(args.config))
        run_bot(cfg, data=data, trade=trade, db_path=args.db)
        return 0

    raise RuntimeError("unknown command")
