# 应用阶段数据与账号初始化

## 底线

- 正式配置必须使用 `SEED_DEMO_DATA=false`。
- 不直接覆盖测试数据库；先做数据库快照，优先为应用阶段创建新数据库。
- 清理工具默认只审计。只有显式传入执行开关和固定确认短语才会删除业务数据。
- 首位管理员通过服务器 CLI 创建，仓库和环境变量中不得保存默认密码。
- 后续账号只允许通过 72 小时有效的一次性邀请链接激活。

## 1. 迁移空数据库

应用阶段使用新的 Compose 项目名和数据卷，保留原测试库但不复用：

```bash
docker compose --env-file .env.application -f compose.test.yml -p ai-task-app up -d --build
```

确认 `.env.application` 中 `POSTGRES_DB=quanyi_app` 且 `SEED_DEMO_DATA=false`。

```bash
cd /app
alembic upgrade head
```

## 2. 审计现有数据库

```bash
python -m app.data_admin
```

如必须复用当前数据库，先备份并关闭 Seed，再执行：

```bash
python -m app.data_admin --execute --confirm RESET_APPLICATION_DATA
```

## 3. 创建首位管理员

```bash
python -m app.admin_cli create-admin --email owner@example.com --name "团队负责人" --team "团队名称"
```

命令会在终端中交互式读取两次密码，不会把密码写入命令历史。

## 4. 邀请后续成员

管理员登录后进入“我的团队”，点击“邀请成员”，生成一次性链接并通过可信渠道单独发送。成员在激活页设置自己的姓名和密码；链接使用后立即失效。
