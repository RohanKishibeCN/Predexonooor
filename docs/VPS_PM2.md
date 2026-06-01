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
cp config.example.yaml config.local.yaml
```

配置项说明在 [config.example.yaml](file:///workspace/Predexonooor/config.example.yaml)。

### 4) Trading API：创建 account 并启用 venues

```bash
export PREDEXON_API_KEY="pk_..."
node dist/cli.js health
node dist/cli.js account create
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue polymarket
node dist/cli.js account enable --account-id <ACCOUNT_ID> --venue limitless
```

把 `account_id` 写进 `config.local.yaml`，第一次建议先 `mode: dry_run` 跑一段时间。

### 5) pm2 启动

```bash
export PREDEXON_API_KEY="pk_..."
pm2 start ecosystem.config.cjs
pm2 logs predexonooor
pm2 save
pm2 startup
```

### 6) 安全与运维

- API key 只放环境变量，不写入仓库
- 先小仓位跑：100u 默认风控很保守，先积累滑点/成交统计
- 观察项：订单失败率、成交滑点、持仓平均持有时间、触发止损比例

