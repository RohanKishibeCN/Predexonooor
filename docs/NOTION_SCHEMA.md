# Notion 日报 Schema（单表）

建议建立一个 Notion Database（Table view），并按以下字段创建属性（属性名区分大小写，代码会按名字匹配；未创建的可选字段会被自动跳过）。

## 必填字段（用于幂等 upsert）

- `Date`：Date
- `Account ID`：Text（Rich text）

## 可选字段（有就写，没有就跳过）

- `Mode`：Select（`live` / `dry_run`）
- `Realized PnL Today`：Number（当日已实现盈亏，来自本 bot 的成交账本）
- `Realized PnL Total`：Number（累计已实现盈亏，来自本 bot 的成交账本）
- `Trades Today`：Number（当日成交笔数）
- `Open Positions`：Number（当前 open 持仓数）
- `Total Exposure USD`：Number（当前总敞口名义）
- `Last Updated`：Date（带时间戳也可）

## 口径说明

- realized PnL 仅统计本程序在 `state.json` 中记录到的成交（fills → FIFO lots → realized），不包含手动交易或其它程序产生的成交。

