# UCloud 测试环境部署

本部署使用 Docker Compose 运行三个服务：

- `frontend`：Nginx 静态站点，并将 `/api` 反向代理到后端；
- `backend`：FastAPI，启动时自动执行 Alembic 迁移；
- `db`：PostgreSQL 16，仅加入 Docker 内网，不向公网开放 5432。

## 前置条件

- Linux 服务器；
- Docker Engine 与 Docker Compose v2；
- 直接公网测试时，安全组需开放站点端口；通过宿主机 Nginx 代理时，容器端口应只绑定 `127.0.0.1`；
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
curl --fail http://127.0.0.1:3389/api/health
```

健康响应中的 `database` 必须为 `postgresql`。

示例使用 3389 是为了适配当前测试服务器的防火墙规则，且不得让 Compose 直接抢占已有的 80/443。域名反向代理验收完成后，设置 `APP_BIND_ADDRESS=127.0.0.1`，避免容器端口继续暴露到公网。

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

## 挂载到现有域名子路径

使用 `https://quanyigeo.com/ai-task/` 时，在 `.env.test` 中设置：

```env
APP_ORIGIN=https://quanyigeo.com
APP_BASE_PATH=/ai-task/
APP_API_BASE_URL=/ai-task/api
```

前端构建会同步设置 Vite 静态资源基址、React Router basename 和 API 前缀。宿主机 Nginx 必须将 `/ai-task/api/` 转发到容器的 `/api/`，并将其余 `/ai-task/` 请求去除前缀后转发到前端容器。不要覆盖现有站点的 `/` 或 `/api`。
