# Predexonooor

基于 Predexon（Data API + Trading API）的 TypeScript 交易机器人骨架，目标是在 **Free plan**（无 WebSocket / 无 SmartMoney / 无 Matching）也能先跑通交易闭环，并用 **pm2** 在 VPS 上长期运行。

本期仅支持 venues：**Polymarket + Limitless**，并在两者之间按盘口流动性打分择优执行。

## 快速开始

1) 安装依赖（Node v20.20.2）

```bash
npm i
npm run build
```

2) 设置 API Key

```bash
export PREDEXON_API_KEY="pk_..."
```

3) Trading API：创建账户并启用 venues

```bash
node dist/cli.js health
node dist/cli.js account create
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue polymarket
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue limitless
```

4) 配置与运行（先 dry_run）

```bash
cp config.example.yaml config.local.yaml
node dist/cli.js bot --config config.local.yaml --state state.json
```

## pm2 部署

见 [VPS_PM2.md](file:///workspace/Predexonooor/docs/VPS_PM2.md)
