# 全意 AI Task OS MVP

这是从 2026-08-19 高保真 Demo 基线演进的正式 MVP 开发仓库。原交付包保持只读，本仓库是唯一开发主线。

## 目录

- `frontend/`：现役 React/Vite 前端，入口为 `src/AppV2.tsx`
- `backend/`：FastAPI/SQLModel 后端（阶段 1 建立）
- `docs/`：领域契约、权限、状态机、验收和架构决策
- `MVP规划.md`：产品与实施范围基线

## 当前阶段

规划中的必做开发阶段 0–6 已实现。当前处于发布验收：自动化与 Mock 模式已通过；正式 MVP 放行仍须使用有效 `QWEN_API_KEY` 完成至少一次候选提取和一次任务草稿的 Live 验收，详见 `docs/release-checklist.md`。

- 新建项目、阶段和手动任务均走真实 API 与数据库，不再使用前端临时 ID。
- 阶段使用独立 `PLANNED/ACTIVE/WAITING_REVIEW/DONE` 状态机，可在项目空间推进。
- 阶段进度由所属任务聚合；项目进度按阶段权重聚合；风险由阻塞、任务逾期和外部依赖派生。
- 正常等待外部不降级，临期为有风险，逾期为需关注。
- 任务验收通过时在同一事务写贡献事件，唯一约束防止重复入账；贡献页读取真实事件。

阶段 5：最小 AI 执行闭环已实现。

- 任务负责人可创建真实 `AgentRun`，运行依次记录 `QUEUED → RUNNING → SUCCEEDED/FAILED` 与过程日志。
- 相同任务版本和 Prompt 使用唯一请求指纹，重复启动返回原 Run，不创建重复运行。
- 运行保存模式、降级原因、尝试次数、心跳、草稿和错误；服务启动会关闭遗留的 `RUNNING` 卡死记录。
- AI 草稿完成后任务进入 `WAITING_HUMAN_CONFIRMATION`，不会被 AI 直接标记完成。
- 负责人可退回重做，或人工确认后生成不可覆盖的提交版本并进入 `WAITING_REVIEW`。
- 候选提取与任务草稿共用 Live/Mock/Fallback、超时重试、精确缓存、预算和调用日志规则。

阶段 4：Model Gateway 与候选提取闭环已实现。

- `AI_MODE=mock` 默认使用确定性本地提取；`live` 模式直连 Qwen，并设超时、一次重试和单项目日预算预检。
- 每次非缓存调用记录模型、Prompt 版本、模式、耗时、Token、估算成本、降级状态与原因。
- 模型输出先经过严格结构校验；Live 失败使用 `FALLBACK`，前端明确显示降级，不能冒充真实 AI。
- 原文保存为不可变 `SourceSnapshot`，候选为独立实体；人工可修改、忽略或确认。
- 候选确认在同一事务中创建正式任务、更新候选并写审计；重复确认不会生成第二个任务。
- 分配给确认人以外的成员时，正式任务进入 `PENDING_OWNER_CONFIRMATION` 等待二次接收。

阶段 3：等待外部闭环已实现。

- 进入等待外部前强制填写联系人、等待事项、预计时间、内部跟进人和恢复动作。
- `WAITING_EXTERNAL` 冻结任务进度；正常等待不降级，24 小时内标为有风险，逾期标为需关注。
- 服务端后台每 5 分钟巡检，提醒事件按“依赖 + 类型 + 日期”唯一约束防重。
- 内部跟进人或负责人记录收到反馈后，依赖与任务在同一事务中恢复为 `IN_PROGRESS`。
- 前端可创建等待事项、查看期限风险并恢复执行。

阶段 2 的手动任务闭环已实现。

- 服务端状态机：接收 → 开始 → 提交 → 验收通过 / 退回修改。
- 关键操作校验负责人、验收人和 CEO 权限，并使用任务版本号阻止陈旧写入。
- 提交结果保存为不可覆盖的版本；空结果不能提交，退回必须说明原因。
- 每次状态变化同时写入状态历史、审计事件和幂等记录。
- 前端任务详情已接入真实操作接口，并展示结果版本。

阶段 1 的真实数据库、JWT 登录、项目权限、只读 API 与前端贯通继续作为底座。

## 前端基线验证

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

## 本地启动

后端：

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -e ".[test]"
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

前端：

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

本地 Ollama Live 模式（已安装 Ollama 且已下载 `qwen2.5:7b`）：

```powershell
cd backend
$env:AI_MODE="live"
$env:AI_PROVIDER="ollama"
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434/v1"
$env:OLLAMA_MODEL="qwen2.5:7b"
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

若 `ollama` 未加入 PATH，可直接运行 `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`。后端通过 HTTP 接口连接 Ollama，命令行是否在 PATH 中不影响已启动服务的模型调用。

## PostgreSQL 测试环境部署

仓库提供 `compose.test.yml`，使用 PostgreSQL 16、FastAPI 和 Nginx 构建同源测试环境。真实数据库密码和 JWT 密钥只保存在服务器端 `.env.test`，不得提交 Git。

完整步骤见 [`docs/test-deployment.md`](docs/test-deployment.md)。

演示账号：

- 任务成员：`member@quanyi.local` / `mvp-member-2026`
- CEO / 验收人：`ceo@quanyi.local` / `mvp-ceo-2026`
- 无项目权限成员：`observer@quanyi.local` / `mvp-observer-2026`

## 开发原则

1. 每个阶段按“数据库 → API → 权限 → 前端 → 测试 → 验收”纵向交付。
2. 任务状态只能由服务端领域服务变更，前端不得直接假定成功。
3. 候选确认、结果提交、验收、贡献入账和 AI 运行必须防重并保留审计。
4. AI 输出始终标识 `LIVE`、`MOCK` 或 `FALLBACK`，不能用降级结果冒充真实模型结果。
