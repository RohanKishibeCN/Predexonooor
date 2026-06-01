## 建设目标（按你的约束）

- **语言与运行时**：全 TypeScript，Node v20.20.2，进程由 pm2 托管。
- **计划从 Free plan 起步**：只用免费且不限量的 Data API endpoints 与 Trading API（不依赖 WebSocket、Smart Money、Matching）。
- **本期 venues**：仅 Polymarket + Limitless。
- **多 venue 但“哪个流动性好选哪个”**：对同一 canonical outcome（`predexon_id`）在两个 venue 的 listings 拉盘口，按 spread 与顶层深度打分择优执行。
- **小资金先跑通**：以 100u 为初始资金，默认风控偏保守，并以“快进快出”管理仓位（TP/SL/时间止损），先把下单/撤单/成交摩擦跑出来。

## Free plan 能力边界（为什么这样设计）

- Free 不可用：WebSocket、Smart Money & Analytics、Cross-Platform Matching（会 403）。
- Free 可用且不限量（不计入月度 quota）：所有 list-markets、所有 orderbook history、Canonical outcome resolve；以及全部 Trading API。参考 https://docs.predexon.com/rate-limits

## 项目结构（TS 版本）

- 配置：env 文件（[.env.example](file:///workspace/Predexonooor/.env.example)）
- Data / Trading API 客户端：[`src/predexon.ts`](file:///workspace/Predexonooor/src/predexon.ts)
- Free tier 限流：[`src/limiter.ts`](file:///workspace/Predexonooor/src/limiter.ts)
- 盘口抽象与抓取：
  - Polymarket orderbook history：[`src/quotes.ts`](file:///workspace/Predexonooor/src/quotes.ts)
  - Limitless orderbook history：同上
- 流动性打分：[`src/liquidity.ts`](file:///workspace/Predexonooor/src/liquidity.ts)
- 风控门禁：[`src/risk.ts`](file:///workspace/Predexonooor/src/risk.ts)
- 状态存储：JSON 文件（state.json）[`src/state.ts`](file:///workspace/Predexonooor/src/state.ts)
- 主循环：[`src/engine.ts`](file:///workspace/Predexonooor/src/engine.ts)
- CLI：[`src/cli.ts`](file:///workspace/Predexonooor/src/cli.ts)
- pm2：[`ecosystem.config.cjs`](file:///workspace/Predexonooor/ecosystem.config.cjs)

## “哪个流动性好选哪个”的具体实现（Polymarket vs Limitless）

1) 用 Polymarket 的 list-markets 拉“高成交量市场”作为候选池（Free 且不限量）  
2) 对每个候选 outcome 的 `predexon_id` 调 `GET /v2/outcomes/{predexon_id}?routable_only=true`，得到 Polymarket 与 Limitless 的 listing 元数据（token_id / market_slug）  
3) 分别取两边近 5 分钟盘口快照，抽取 best bid/ask + 顶层深度  
4) 打分择优：更小 spread + 更大顶层深度 → 分数更高，执行地选分数最高的 venue  
5) 若 spread 超过阈值或顶层深度不足，直接跳过该候选

## 策略形态（快进快出，而非无风险套利）

- 真正的“锁定收益套利”通常要求买 YES + 买 NO，利润在结算时兑现，会锁定资金到到期。
- 你要求快进快出，本期实现采用短持仓管理（TP/SL/时间止损）与严格限额，先验证执行质量与滑点。
