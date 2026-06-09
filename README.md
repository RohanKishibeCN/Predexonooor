# Predexonooor

基于 Predexon（Data API + Trading API）的 TypeScript 交易机器人骨架，目标是在 **Free plan**（无 WebSocket / 无 SmartMoney / 无 Matching）也能先跑通交易闭环，并用 **pm2** 在 VPS 上长期运行。

当前支持两种实盘实例形态：

- **Polymarket + Limitless**：沿用 Data API orderbook 打分择优执行
- **Polymarket + Hyperliquid**：使用 Trading API Router Quote 选 venue，并保持单 venue 下单

## 快速开始

1) 安装依赖（Node v20.20.2）

```bash
npm i
npm run build
```

2) 配置（统一用 env 文件）

```bash
cp .env.example .env.pm-lt
cp .env.example .env.pm-hl
```

参数清单见 [ENV.md](file:///workspace/Predexonooor/docs/ENV.md)

3) Trading API：创建账户并启用 venues

```bash
node dist/cli.js health
node dist/cli.js account create
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue polymarket
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue limitless
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue hyperliquid
```

把不同实例的 `ACCOUNT_ID` 分别回填进 `.env.pm-lt` / `.env.pm-hl`，然后运行（先 dry_run）

```bash
node dist/cli.js --env-file .env.pm-lt bot --state state.pm-lt.json
node dist/cli.js --env-file .env.pm-hl bot --state state.pm-hl.json
```

## pm2 部署

见 [VPS_PM2.md](file:///workspace/Predexonooor/docs/VPS_PM2.md)
