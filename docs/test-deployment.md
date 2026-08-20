# UCloud 测试环境部署

本部署使用 Docker Compose 运行三个服务：

- `frontend`：Nginx 静态站点，并将 `/api` 反向代理到后端；
- `backend`：FastAPI，启动时自动执行 Alembic 迁移；
- `db`：PostgreSQL 16，仅加入 Docker 内网，不向公网开放 5432。

## 前置条件

- Linux 服务器；
- Docker Engine 与 Docker Compose v2；
- 安全组开放测试站点端口（默认 TCP 8080）；
- 服务器具备访问 GitHub 和容器镜像仓库的网络能力。

## 首次部署

```bash
git clone https://github.com/dernh-abs/AI-task.git ai-task
cd ai-task
cp .env.test.example .env.test
chmod 600 .env.test
```

编辑 `.env.test`，至少替换：

- `POSTGRES_PASSWORD`：数据库专用随机密码；
- `JWT_SECRET`：不少于 32 字节的随机密钥；
- `APP_ORIGIN`：测试环境实际访问地址。

推荐在服务器上生成只含十六进制字符的随机值，避免数据库连接 URL 转义问题：

```bash
openssl rand -hex 32  # POSTGRES_PASSWORD
openssl rand -hex 48  # JWT_SECRET
```

真实 `.env.test` 被 Git 忽略，禁止提交、截图或粘贴到工单。

启动：

```bash
docker compose --env-file .env.test -f compose.test.yml up -d --build
docker compose --env-file .env.test -f compose.test.yml ps
```

检查数据库迁移与健康状态：

```bash
docker compose --env-file .env.test -f compose.test.yml logs --tail=100 backend
curl --fail http://127.0.0.1:8080/api/health
```

健康响应中的 `database` 必须为 `postgresql`。

默认使用 8080 是为了避免覆盖服务器上已有的 80/443 站点。只有在确认现有 Nginx 配置并完成备份后，才可通过反向代理绑定测试域名；不得让 Compose 直接抢占已有端口。

## 更新部署

```bash
git pull --ff-only origin main
docker compose --env-file .env.test -f compose.test.yml up -d --build
docker compose --env-file .env.test -f compose.test.yml ps
```

## 回滚

应用回滚前先记录当前提交。数据库迁移不得通过删除数据卷回滚。

```bash
git log -1 --oneline
git switch --detach <已验证的提交>
docker compose --env-file .env.test -f compose.test.yml up -d --build
```

如新版本包含不可逆数据库迁移，应使用部署前备份恢复，而不是直接执行 Alembic downgrade。

## PostgreSQL 备份

```bash
docker compose --env-file .env.test -f compose.test.yml exec -T db \
  pg_dump -U quanyi -d quanyi_mvp -Fc > quanyi_mvp.dump
```

备份文件包含测试业务数据，应按敏感数据保存，不得提交 Git。

## Ollama

远程服务器未确认已安装 Ollama 前，保持 `AI_MODE=mock`。如果服务器宿主机安装并启动 Ollama：

1. 确认容器能访问 `http://host.docker.internal:11434/v1`；
2. 将 `.env.test` 改为 `AI_MODE=live`、`AI_PROVIDER=ollama`；
3. 重建后端；
4. 完成一次候选提取和一次任务草稿，确认 UI 显示 `LIVE`。

Mock 或 Fallback 结果不得作为 Ollama Live 验收通过的证据。
