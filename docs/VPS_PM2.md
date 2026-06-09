## VPS 部署（pm2，Node v20.20.2）

### 1) 安装

```bash
sudo apt update
sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
sudo npm i -g pm2
```

### 2) 拉代码与构建

```bash
git clone https://github.com/RohanKishibeCN/Predexonooor.git
cd Predexonooor
npm i
npm run build
```

### 3) 配置

```bash
cp .env.example .env
```

把 `.env` 里的 `PREDEXON_API_KEY`、`ACCOUNT_ID` 等参数填好。

如果你要同时跑两个实例，建议从一开始就拆成两份实例配置：

```bash
cp .env.example .env.pm-lt
cp .env.example .env.pm-hl
```

- `pm+lt`：`ENABLED_VENUES=polymarket,limitless`
- `pm+hl`：`ENABLED_VENUES=polymarket,hyperliquid`
- 两个实例分别使用不同的 `ACCOUNT_ID`
- 两个实例分别使用不同的 state 文件，例如 `state.pm-lt.json`、`state.pm-hl.json`

### 4) Trading API：创建 account 并启用 venues

```bash
node dist/cli.js health
node dist/cli.js account create
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue polymarket
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue limitless
```

把 `ACCOUNT_ID` 写进 `.env`，如需先验证逻辑但不下真实订单，可设置 `DRY_RUN=1`（优先级高于 `MODE`）。

### 5) pm2 启动

默认建议一个实例一个 pm2 app：

```bash
pm2 start ecosystem.config.cjs
pm2 logs predexonooor-pm-lt
pm2 logs predexonooor-pm-hl
pm2 save
pm2 startup
```

推荐命名：

- `predexonooor-pm-lt`
- `predexonooor-pm-hl`

如果只想先起一个实例，也可以直接跑：

```bash
node dist/cli.js --env-file .env.pm-hl bot --state state.pm-hl.json
```

### 6) Hyperliquid 资金注意事项

- Hyperliquid 不走普通的 deposit wallet -> venue transfer 路径
- 需要按 Predexon 文档走 Across/Hyperliquid 的专用 funding 流程
- withdraw 也走单独的 per-venue withdraw endpoint
- `pm+hl` 实例即使 `DRY_RUN=1`，也建议配置真实 `ACCOUNT_ID`，因为 Router Quote 与 positions 盯市依赖账户上下文

### 7) 安全与运维

- API key 只放环境变量，不写入仓库
- 先小仓位跑：100u 默认风控很保守，先积累滑点/成交统计
- 观察项：订单失败率、成交滑点、持仓平均持有时间、触发止损比例
- 不要让多个实例共用同一个 `state.json`
- 不要让多个实例长期共用同一份 `.env`
