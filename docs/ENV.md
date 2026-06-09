# 环境变量配置清单

所有配置统一从 env 文件读取（默认 `.env`，可用 `--env-file` 指定）。

## 必填

- `PREDEXON_DATA_API_KEY`：Predexon Data API Key（推荐）
- `PREDEXON_TRADING_API_KEY`：Predexon Trading API Key（推荐）

兼容项（不推荐）：

- `PREDEXON_API_KEY`：单 key 兼容模式（如果你只有一把 key，或两把 key 临时想用同一把填这里）

## 运行模式

- `MODE`：`dry_run` 或 `live`（默认 `live`）
- `DRY_RUN`：`1`/`0`（优先级高于 `MODE`；`1` 强制 dry-run）
- `ACCOUNT_ID`：Trading API account id（`MODE=live` 且 `DRY_RUN!=1` 时必填）
- `STATE_PATH`：状态文件路径（默认 `state.json`）

## 扫描与节奏

- `POLL_INTERVAL_SECONDS`：主循环间隔（默认 `20`）
- `MAX_MARKETS_SCAN`：每轮从 Polymarket 拉取 markets 的数量上限（默认 `30`）
- `REQUEST_INTERVAL_MS`：全局请求节流间隔（默认 `1100`，Free plan 建议不要小于 1100）
- `REQUEST_TIMEOUT_MS`：单次 HTTP 请求超时（毫秒；默认 `20000`）
- `REQUEST_MAX_RETRIES`：对 429/5xx/超时的重试次数（默认 `3`）
- `OUTCOME_404_TTL_MINUTES`：`/v2/outcomes/{predexon_id}` 返回 404 的负缓存 TTL（默认 `360`）

## 候选过滤

- `MIN_OUTCOME_PRICE`：候选 outcome 最小价格（默认 `0.05`；取值范围 0-1）
- `MAX_OUTCOME_PRICE`：候选 outcome 最大价格（默认 `0.95`；取值范围 0-1）

## Venue（支持 Polymarket + Limitless，以及 Polymarket + Hyperliquid）

- `ENABLED_VENUES`：逗号分隔列表（默认 `polymarket,limitless`）
- `VENUE_PREFER_ORDER`：逗号分隔列表（默认 `polymarket,limitless`）
- 若 `ENABLED_VENUES` 包含 `hyperliquid`：
- `ACCOUNT_ID` 在 `dry_run` 下也必填，因为 Router Quote 与 Trading positions 都是 account-scoped
- bot 会自动切换为：入场用 Router Quote 选 venue，持仓盯市优先用 Trading API positions 的 `currentPrice`
- Hyperliquid market buy 是 `size` 下单，不是 `amount`
- Hyperliquid 单笔最小 notional 约为 `10 USDC`

## 流动性过滤

- `MAX_SPREAD`：最大允许 spread（0-1 小数价格区间；默认 `0.02`）
- `MIN_TOP_DEPTH_USD`：顶层深度的美元名义阈值（默认 `20`）

## 风控（按 100u 启动资金的保守默认值）

- `STARTING_CAPITAL_USD`（默认 `100`）
- `MAX_PER_TRADE_USD`（默认 `5`）
- `MAX_EXPOSURE_PER_MARKET_USD`（默认 `10`）
- `MAX_TOTAL_EXPOSURE_USD`（默认 `30`）
- `MAX_OPEN_POSITIONS`（默认 `3`）
- `DAILY_MAX_LOSS_USD`（默认 `3`）
- `MAX_DRAWDOWN_USD`（默认 `8`）

## 进出场

- `TAKE_PROFIT_PCT`（默认 `0.01`）
- `STOP_LOSS_PCT`（默认 `0.015`）
- `MAX_HOLD_MINUTES`（默认 `60`）
- `SLIPPAGE_GUARD_PCT`（默认 `0.008`）
- `REENTRY_COOLDOWN_SECONDS`：同一 `predexonId` 平仓后重新允许开仓的冷却期（秒；默认 `0`）

## Notion 日报（可选）

- `NOTION_API_TOKEN`：Notion integration token
- `NOTION_DATABASE_ID`：Notion database id（你的日报数据表）
- `NOTION_VERSION`：Notion-Version header（默认 `2022-06-28`）

配套 Notion 字段建议见 [NOTION_SCHEMA.md](file:///workspace/Predexonooor/docs/NOTION_SCHEMA.md)。

## 实例建议

- `pm+lt` 实例：`ENABLED_VENUES=polymarket,limitless`
- `pm+hl` 实例：`ENABLED_VENUES=polymarket,hyperliquid`
- 每个实例单独维护：
- 一份 env，例如 `.env.pm-lt`、`.env.pm-hl`
- 一个 state，例如 `state.pm-lt.json`、`state.pm-hl.json`
- 一个 pm2 app name，例如 `predexonooor-pm-lt`、`predexonooor-pm-hl`

## 参数建议（10u 试水）

如果你只充值 10u，建议先用更保守的风控与更低的请求密度，确认链路稳定后再逐步放开：

- `STARTING_CAPITAL_USD=10`
- `MAX_PER_TRADE_USD=1`
- `MAX_EXPOSURE_PER_MARKET_USD=2`
- `MAX_TOTAL_EXPOSURE_USD=3`
- `MAX_OPEN_POSITIONS=1`
- `DAILY_MAX_LOSS_USD=0.5`
- `MAX_DRAWDOWN_USD=1.5`
- `ENABLED_VENUES=polymarket`（先单 venue 排障，跑稳再加 limitless）
- `MAX_SPREAD=0.03`（更宽松可用 `0.05`）
- `MIN_TOP_DEPTH_USD=5`（更宽松可用 `1`）
- `MAX_MARKETS_SCAN=5`
- `POLL_INTERVAL_SECONDS=120`
- `REQUEST_INTERVAL_MS=1100`
- `MIN_OUTCOME_PRICE=0.02`
- `MAX_OUTCOME_PRICE=0.98`

## 参数建议（pm+hl 最小可成交）

- `ENABLED_VENUES=polymarket,hyperliquid`
- `ACCOUNT_ID=<pm+hl account id>`
- `MAX_PER_TRADE_USD=10`（建议从 `10` 或 `12` 起步）
- `MAX_EXPOSURE_PER_MARKET_USD>=10`
- `MAX_TOTAL_EXPOSURE_USD>=20`
- `MAX_OPEN_POSITIONS=1`
- `POLL_INTERVAL_SECONDS=30` 或更高
- `REQUEST_INTERVAL_MS=1100`
