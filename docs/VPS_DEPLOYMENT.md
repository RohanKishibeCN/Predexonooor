## VPS 部署（systemd）

### 1) 安装

```bash
sudo apt update
sudo apt install -y python3 python3-venv git
git clone https://github.com/RohanKishibeCN/Predexonooor.git
cd Predexonooor
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

### 2) 账户与入金

1. 设置 API key（只放环境变量，不写入仓库）
2. 创建 account
3. Enable 你要交易的 venue（建议先 Polymarket，再逐个加）
4. 获取 deposit wallet 地址（在 Trading API 的 account 信息里），把 Base USDC 转入
5. 用 `POST /transfers` 把 deposit wallet 资金拨到要交易的 venue

资金与划转文档： https://docs.predexon.com/trading-api/guides/funding-and-withdrawals

### 3) 配置文件

```bash
cp config.example.yaml config.local.yaml
```

建议：
- 第一次先 `mode: dry_run` 跑 24 小时，确认候选信号频率、盘口过滤是否过松/过紧
- 再改 `mode: live`，并填 `account_id`

### 4) systemd service

把下面内容保存为 `/etc/systemd/system/predexonooor.service`（按你实际路径修改）：

```ini
[Unit]
Description=Predexonooor bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/Predexonooor
Environment=PREDEXON_API_KEY=pk_...
ExecStart=/opt/Predexonooor/.venv/bin/python -m predexonooor bot --config /opt/Predexonooor/config.local.yaml --db /opt/Predexonooor/state.db
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用与查看日志：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now predexonooor
sudo journalctl -u predexonooor -f
```

### 5) 安全与运维

- API key 只放环境变量，避免出现在 shell history 或日志里
- VPS 上用非 root 用户运行（上面的 service 可改 User/Group）
- 先小仓位跑：按仓库默认风控阈值启动（100u 假设）
- 观察项：订单失败率、成交滑点、持仓平均持有时间、触发止损比例

