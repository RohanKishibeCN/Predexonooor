# Notion 日报 Schema（单表）

建议建立一个 Notion Database（Table view），并按以下字段创建属性（属性名区分大小写，代码会按名字匹配；未创建的可选字段会被自动跳过）。

## 必填字段（用于幂等 upsert）

- `Date`：Date
- `Account ID`：Text（Rich text）

## 可选字段（有就写，没有就跳过）

- `Mode`：Select（`live` / `dry_run`）

### 运行状态（建议新增：一眼判断双 venue 是否正常）

- `Venues Enabled`：Multi-select（`polymarket` / `limitless`）
- `Polymarket Only`：Checkbox
- `Dual-Venue Healthy`：Checkbox（当 `ENABLED_VENUES` 多于 1 且本 bot 能找到可跨 venue 的候选时为 true）
- `Dual-Venue Coverage %`：Number（`Dual-Venue Candidates / Candidates Canonical * 100`）
- `Candidates Canonical`：Number（本轮 canonical listings 聚合后的 predexon_id 数）
- `Dual-Venue Candidates`：Number（同时具备所有启用 venue 可执行 listing 的候选数）
- `Reject Missing Listing`：Number（缺少某个启用 venue listing 被过滤的数量）
- `Best Null`：Number（报价失败/无盘口导致被过滤的数量）
- `Skip Outcome 404`：Number（outcome 404 被负缓存跳过的数量；新双 venue discovery 路径一般应接近 0）
- `Last Tick At`：Date（最后一次 tick_summary 的时间戳）
- `Realized PnL Today`：Number（当日已实现盈亏，来自本 bot 的成交账本）
- `Realized PnL Total`：Number（累计已实现盈亏，来自本 bot 的成交账本）
- `Trades Today`：Number（当日成交笔数）
- `Open Positions`：Number（当前 open 持仓数）
- `Total Exposure USD`：Number（当前总敞口名义）
- `Last Updated`：Date（带时间戳也可）

## 口径说明

- realized PnL 仅统计本程序在 `state.json` 中记录到的成交（fills → FIFO lots → realized），不包含手动交易或其它程序产生的成交。

