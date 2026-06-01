# Predexonooor

基于 Predexon（Data API + Trading API）的 VPS 自动化交易机器人骨架，面向 Free plan 也能先跑通的“低频快进快出”策略框架。

## 目标

- Free plan 可运行：不依赖 WebSocket、Smart Money、Matching（这些在 Free 上会 403）
- 多 venue 执行：通过 Canonical outcome（`predexon_id`）解析可交易 listings，并用 Trading API 选择流动性更好的 venue 下单
- 先保命再扩展：默认风控按 100u 资金保守配置，先跑通并积累真实成交与滑点数据

参考文档：
- Rate limits / free endpoints: https://docs.predexon.com/rate-limits
- Canonical outcome: https://docs.predexon.com/api-reference/canonical/outcome
- Trading API overview: https://docs.predexon.com/execution/overview
- Best practices: https://docs.predexon.com/start-here/best-practices

## 快速开始（本地或 VPS）

1) 安装依赖

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

2) 配置 API Key

```bash
export PREDEXON_API_KEY="pk_..."
```

3) 创建账户与启用 venue

```bash
python -m predexonooor health
python -m predexonooor account create
python -m predexonooor account enable --account-id <ACCOUNT_ID> --venue polymarket
python -m predexonooor account enable --account-id <ACCOUNT_ID> --venue limitless
```

4) 配置并运行（默认 dry_run）

```bash
cp config.example.yaml config.local.yaml
python -m predexonooor bot --config config.local.yaml --db state.db
```

## 运行模式

- `mode: dry_run`：只打印信号与风控决策，不会下单
- `mode: live`：真实下单，必须填写 `account_id`

## 部署

见 [docs/VPS_DEPLOYMENT.md](file:///workspace/Predexonooor/docs/VPS_DEPLOYMENT.md)。
