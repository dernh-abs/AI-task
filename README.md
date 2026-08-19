# 全意 AI Task OS MVP

这是从 2026-08-19 高保真 Demo 基线演进的正式 MVP 开发仓库。原交付包保持只读，本仓库是唯一开发主线。

## 目录

- `frontend/`：现役 React/Vite 前端，入口为 `src/AppV2.tsx`
- `backend/`：FastAPI/SQLModel 后端（阶段 1 建立）
- `docs/`：领域契约、权限、状态机、验收和架构决策
- `MVP规划.md`：产品与实施范围基线

## 当前阶段

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

演示账号：

- 任务成员：`member@quanyi.local` / `mvp-member-2026`
- CEO / 验收人：`ceo@quanyi.local` / `mvp-ceo-2026`
- 无项目权限成员：`observer@quanyi.local` / `mvp-observer-2026`

## 开发原则

1. 每个阶段按“数据库 → API → 权限 → 前端 → 测试 → 验收”纵向交付。
2. 任务状态只能由服务端领域服务变更，前端不得直接假定成功。
3. 候选确认、结果提交、验收、贡献入账和 AI 运行必须防重并保留审计。
4. AI 输出始终标识 `LIVE`、`MOCK` 或 `FALLBACK`，不能用降级结果冒充真实模型结果。
