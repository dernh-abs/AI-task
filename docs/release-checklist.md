# MVP 发布与验收清单

## 自动化已通过

- JWT 登录、项目范围隔离与越权拒绝。
- 完整人工任务 E2E：开始 → 非空提交 → 验收退回 → 重新提交 → 验收通过 → DONE。
- 非验收人不能完成任务；陈旧版本写入返回冲突。
- 提交版本不可覆盖；候选确认、结果提交、提醒、AI Run 和贡献事件防重。
- 等待外部字段守卫、24 小时临期、逾期、提醒去重与恢复执行。
- 候选快照、Mock 提取、人工修改、确认建任务与负责人二次接收。
- AgentRun 创建、重复启动复用、草稿、人工确认和提交验收。
- 项目/阶段/任务 CRUD、阶段独立状态、加权进度、健康度与贡献聚合。
- Alembic 可从空库升级到最新、降级到底并再次升级。
- 前端 TypeScript 检查和生产构建通过。
- P0 候选链路统一：所有入口确认后由服务端创建任务，开放认领入口已关闭。
- P1 项目 AI 会话具备持久化、项目权限、真实任务引用和幂等消息写入。
- P1 AI 执行中心直接读取服务端 AgentRun，停止、重试和模拟进度入口已关闭。
- 项目看板只调用服务端合法状态动作，不直接修改前端任务状态。
- `pnpm check:truth` 验证正式入口未重新引用已知 Demo 写链路。

## 发布前必须人工完成

- [ ] 设置强随机 `JWT_SECRET`，并将 `SEED_DEMO_DATA=false`。
- [ ] 执行 `alembic upgrade head`；生产环境保持 `AUTO_CREATE_SCHEMA=false`。
- [ ] 配置正确的 `CORS_ORIGINS` 与前端 `VITE_API_BASE_URL`。
- [ ] 使用有效 `DEEPSEEK_API_KEY`、`AI_PROVIDER=deepseek` 和 `AI_MODE=live` 完成至少一次候选提取 Live 调用。
- [ ] 使用 `deepseek-v4-flash` 完成至少一次任务草稿 Live 调用，并核对调用日志中的模型、Prompt、Token、成本与 `execution_mode=LIVE`。
- [ ] 人工走查桌面端关键路径：登录、建项目、建阶段、建任务、提交/退回/重提/验收、等待外部、候选确认、AI 草稿确认、贡献页。
- [ ] 确认 Fallback 页面明确显示降级原因，不能作为 Live 验收证据。

## 推荐发布命令

```powershell
cd backend
.venv\Scripts\alembic upgrade head
.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm check:truth
pnpm typecheck
pnpm build
```

阶段 7“智能求助”是规划中的可选项，不阻塞 MVP 发布。
