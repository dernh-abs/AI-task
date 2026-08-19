# 核心领域模型

## 边界

MVP 为单团队系统，但所有项目数据预留 `team_id`。候选任务是独立实体，不是任务状态。

## 核心实体

| 实体 | 必要关系与职责 |
|---|---|
| User | 登录身份、团队角色，不直接替代项目权限 |
| Team | MVP 只有一个团队，作为项目和成员边界 |
| Project | 属于团队，包含成员和有序阶段 |
| ProjectMember | 项目成员关系及项目角色 |
| Stage | 属于项目；状态为 `PLANNED/ACTIVE/WAITING_REVIEW/DONE` |
| Task | 属于项目和阶段，保存负责人、验收人、执行模式和业务状态 |
| TaskCollaborator | 协作者关系，可提交个人产出但不能提交整体任务 |
| TaskSubmission | 一次不可覆盖的结果提交版本 |
| CandidateTask | 从一份来源快照提取的待确认候选 |
| SourceSnapshot | 保存粘贴原文、哈希、来源类型、创建人和提取版本 |
| ExternalDependency | 等待对象、事项、内部跟进人、预计时间和恢复动作 |
| AgentRun | 与任务关联的 AI 执行生命周期，不替代任务主状态 |
| AiCallLog | 模型、Prompt 版本、模式、耗时、Token、成本和错误 |
| AuditEvent | 记录关键人工和系统决定 |
| ContributionEvent | 幂等的贡献入账事件 |

## 任务业务状态

```text
PENDING_OWNER_CONFIRMATION
TODO
IN_PROGRESS
WAITING_EXTERNAL
BLOCKED
WAITING_HUMAN_CONFIRMATION
WAITING_REVIEW
DONE
CANCELED
```

`CANDIDATE` 不再属于 Task 状态，见 ADR-0001。

## 候选状态

```text
ACTIVE
STASHED
IGNORED
CREATED
LINKED
```

`CREATED` 和 `LINKED` 是终态；一个候选最多创建或关联一个正式任务。

## AI 执行状态

```text
QUEUED
RUNNING
NEEDS_INPUT
FAILED
SUCCEEDED
CANCELED
```

每次运行必须额外记录执行模式：`LIVE/MOCK/FALLBACK`。`FALLBACK` 不得冒充 Live 成功。

## 不变量

1. 没有人工确认记录的候选不能创建正式任务。
2. 分配给其他成员的任务必须先进入 `PENDING_OWNER_CONFIRMATION`。
3. 人工任务没有非空提交内容不能进入 `WAITING_REVIEW`。
4. AI 任务没有成功的 AgentRun 和人工确认不能进入 `WAITING_REVIEW` 或 `DONE`。
5. 只有指定验收人或明确授权角色可以完成验收。
6. `WAITING_EXTERNAL` 必须关联完整 ExternalDependency。
7. `DONE` 只能为 100%；待人工确认最高 90%，待验收最高 95%。
8. 贡献事件、候选创建、验收和提醒都必须幂等。

