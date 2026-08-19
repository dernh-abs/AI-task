# 全意 AI Task OS MVP

这是从 2026-08-19 高保真 Demo 基线演进的正式 MVP 开发仓库。原交付包保持只读，本仓库是唯一开发主线。

## 目录

- `frontend/`：现役 React/Vite 前端，入口为 `src/AppV2.tsx`
- `backend/`：FastAPI/SQLModel 后端（阶段 1 建立）
- `docs/`：领域契约、权限、状态机、验收和架构决策
- `MVP规划.md`：产品与实施范围基线

## 当前阶段

阶段 0：冻结领域契约与验收边界。

## 前端基线验证

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

## 开发原则

1. 每个阶段按“数据库 → API → 权限 → 前端 → 测试 → 验收”纵向交付。
2. 任务状态只能由服务端领域服务变更，前端不得直接假定成功。
3. 候选确认、结果提交、验收、贡献入账和 AI 运行必须防重并保留审计。
4. AI 输出始终标识 `LIVE`、`MOCK` 或 `FALLBACK`，不能用降级结果冒充真实模型结果。

