# 环境变量配置清单

所有配置统一从 env 文件读取（默认 `.env`，可用 `--env-file` 指定）。

## 必填

- `PREDEXON_API_KEY`：Predexon API Key

## 运行模式

- `MODE`：`dry_run` 或 `live`（默认 `dry_run`）
- `ACCOUNT_ID`：Trading API account id（`MODE=live` 时必填）
- `STATE_PATH`：状态文件路径（默认 `state.json`）

## 扫描与节奏

- `POLL_INTERVAL_SECONDS`：主循环间隔（默认 `20`）
- `MAX_MARKETS_SCAN`：每轮从 Polymarket 拉取 markets 的数量上限（默认 `30`）

## Venue（本期仅支持 Polymarket + Limitless）

- `ENABLED_VENUES`：逗号分隔列表（默认 `polymarket,limitless`）
- `VENUE_PREFER_ORDER`：逗号分隔列表（默认 `polymarket,limitless`）

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

