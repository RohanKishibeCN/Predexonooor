## 建设目标（按你的约束）

- 计划从 Free plan 起步：只用免费且不限量的 Data API endpoints 与 Trading API（不依赖 WebSocket、Smart Money、Matching）。
- 多 venue：用 Canonical outcome（`GET /v2/outcomes/{predexon_id}`）拿到可路由/可交易 listings，然后对各 venue 做流动性打分，选择“更容易快进快出”的 venue 作为执行地。
- 小资金先跑通：以 100u 为初始资金，默认风控偏保守，优先避免“资金被锁到到期”。

## Free plan 能力边界（为什么这样设计）

- Free 不可用：WebSocket、Smart Money & Analytics、Cross-Platform Matching（会 403）。
- Free 可用且不限量（不计入月度 quota）：所有 list-markets、所有 orderbook history、Canonical outcome resolve；以及全部 Trading API。参考 https://docs.predexon.com/rate-limits

## 核心模块（仓库内实现）

- 配置（YAML）：[config.example.yaml](file:///workspace/Predexonooor/config.example.yaml)
- Data API 客户端：`predexonooor.predexon.DataClient`
- Trading API 客户端：`predexonooor.predexon.TradeClient`
- 行情/盘口抽象：`predexonooor.quotes.TopOfBook`（当前实现：Polymarket + Limitless）
- 流动性打分：`predexonooor.liquidity.score_top_of_book`
- 风控门禁：`predexonooor.risk`（日亏损/回撤/单笔/总敞口/单市场敞口/最大持仓数）
- 状态存储：SQLite（`state.db`），记录 bot 自己开的仓位，用于退出与敞口统计
- 主循环：`predexonooor.engine.run_bot`

## “哪个流动性好选哪个”的具体实现

1) 只从 Polymarket 拉“高成交量市场”作为候选池（Free 且不限量）  
2) 对候选 outcome 的 `predexon_id` 调 `GET /v2/outcomes/{predexon_id}?routable_only=true`，得到同一 outcome 在各 venue 的 listing（token_id、market_slug 等）  
3) 对每个 listing 取近 5 分钟盘口快照，抽取 best bid/ask 与顶层深度  
4) 用一个简单的 score：更小 spread + 更大顶层深度 → 分数更高，选分数最高的 venue 执行

## 策略形态（为什么只能做到“快进快出”，而非纯无风险）

- 预测市场里真正的“锁定收益”套利通常是买 YES + 买 NO 组合，收益在结算时兑现，天然会产生持仓到到期的资金占用。
- 你要求快进快出，本质上会把“结算确定性”换成“二级市场价格波动/滑点/成交概率”的风险。
- 当前版本的 bot 采用的是：在高流动性盘口上做小仓位短持（TP/SL/时间止损）并严格限额，先跑通交易闭环与成交质量。

## 升级路径（跑通后再考虑）

- 升级 Dev：
  - WebSocket：实时订单/成交/活动、pending trades
  - Smart money：smart-activity、market smart-money positioning
  - Matching：matched-pairs 跨 venue 套利扫描器（cookbook）  
- 升级 Pro：
  - 更高订阅规模与 wildcards（适合做 firehose / 多市场订阅）

