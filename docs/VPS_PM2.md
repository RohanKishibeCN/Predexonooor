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

### 4) Trading API：创建 account 并启用 venues

```bash
node dist/cli.js health
node dist/cli.js account create
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue polymarket
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue limitless
```

把 `ACCOUNT_ID` 写进 `.env`，第一次建议先 `MODE=dry_run` 跑一段时间。

### 5) pm2 启动

```bash
pm2 start ecosystem.config.cjs
pm2 logs predexonooor
pm2 save
pm2 startup
```

### 6) 安全与运维

- API key 只放环境变量，不写入仓库
- 先小仓位跑：100u 默认风控很保守，先积累滑点/成交统计
- 观察项：订单失败率、成交滑点、持仓平均持有时间、触发止损比例
