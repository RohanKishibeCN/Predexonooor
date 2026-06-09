# Instances

建议把“实例”当成独立运行单元管理，而不是代码分叉。

每个实例固定 4 个元素：

- 一个 pm2 app name
- 一份 env 文件
- 一个 state 文件
- 一个 account / venue 组合

## 推荐命名

- `predexonooor-pm-lt`
- `predexonooor-pm-hl`

对应文件：

- `.env.pm-lt`
- `.env.pm-hl`
- `state.pm-lt.json`
- `state.pm-hl.json`

## 当前实例模板

### predexonooor-pm-lt

- 用途：Polymarket + Limitless 实盘实例
- `ENABLED_VENUES=polymarket,limitless`
- env：`.env.pm-lt`
- state：`state.pm-lt.json`

### predexonooor-pm-hl

- 用途：Polymarket + Hyperliquid 实盘实例
- `ENABLED_VENUES=polymarket,hyperliquid`
- env：`.env.pm-hl`
- state：`state.pm-hl.json`

## 后续增加实例

只新增以下内容，不新增仓库副本：

- 新 env
- 新 state
- 新 pm2 app
- 新实例登记记录

例如：

- `predexonooor-test-pm-hl`
- `predexonooor-paper-pm-hl`
- `predexonooor-pm-only`
