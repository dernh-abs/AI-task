# 任务状态机

状态变更由后端领域服务统一执行。一次转换必须同时校验当前状态、操作者、提交载荷和关联实体，并在同一事务中写状态历史与审计。

| 起始状态 | 操作 | 目标状态 | 主要守卫 | 必要副作用 |
|---|---|---|---|---|
| PENDING_OWNER_CONFIRMATION | 负责人接收 | TODO | actor 是负责人 | 接收记录、审计 |
| PENDING_OWNER_CONFIRMATION | 退回补充 | PENDING_OWNER_CONFIRMATION | actor 是负责人；原因非空 | 通知创建人、审计 |
| TODO | 开始 | IN_PROGRESS | actor 是负责人 | 状态历史 |
| IN_PROGRESS | 提交人工结果 | WAITING_REVIEW | actor 是负责人；结果/URL/资产至少一项 | 新增提交版本、通知验收人 |
| IN_PROGRESS | 启动 AI 协助 | IN_PROGRESS | actor 有权限；无活跃重复 Run | 创建 AgentRun |
| IN_PROGRESS | AI 提交产出 | WAITING_HUMAN_CONFIRMATION | AgentRun=SUCCEEDED；存在输出 | 保存输出、通知负责人 |
| WAITING_HUMAN_CONFIRMATION | 确认 AI 结果 | WAITING_REVIEW | actor 是负责人；确认记录存在 | 创建提交版本、通知验收人 |
| WAITING_HUMAN_CONFIRMATION | 要求修改 | IN_PROGRESS | actor 是负责人；意见非空 | 新建或恢复 AgentRun |
| WAITING_REVIEW | 验收通过 | DONE | actor 是验收人或授权角色 | 100% 进度、贡献事件、审计 |
| WAITING_REVIEW | 退回修改 | IN_PROGRESS | actor 是验收人；原因非空 | 退回记录、通知负责人 |
| TODO/IN_PROGRESS/BLOCKED | 转等待外部 | WAITING_EXTERNAL | ExternalDependency 字段完整 | 创建依赖、安排提醒 |
| WAITING_EXTERNAL | 收到反馈 | IN_PROGRESS | actor 是内部跟进人或负责人 | 完成依赖、取消未发提醒 |
| TODO/IN_PROGRESS | 标记阻塞 | BLOCKED | 原因非空 | 阻塞记录、风险更新 |
| BLOCKED | 解除阻塞 | IN_PROGRESS | 解除说明非空 | 恢复记录 |
| 非终态 | 取消 | CANCELED | actor 有取消权限；原因非空 | 审计、取消活跃运行/提醒 |

## 服务接口约束

领域服务使用命令式接口，不允许 API 路由直接修改 `task.status`：

```text
apply_transition(task_id, action, actor, payload, idempotency_key)
```

对于版本冲突返回 `409 CONFLICT`；权限不足返回 `403 FORBIDDEN`；守卫不满足返回结构化 `422 INVALID_TRANSITION`。

