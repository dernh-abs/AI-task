# MVP 可写入口真实性清单（P0/P1）

更新日期：2026-08-20

状态定义：`REAL` 表示服务端鉴权并持久化；`READ_ONLY` 表示只读展示；`DISABLED` 表示能力尚未接入且入口不可执行。

| 页面 / 入口 | 状态 | 服务端依据或边界 |
| --- | --- | --- |
| 新建项目、阶段、任务 | REAL | Project / Stage / Task API；成功后使用服务端返回对象 |
| 任务接收、开始、等待外部、恢复、提交、退回、验收 | REAL | `/api/tasks/{id}/actions/{action}`；版本冲突和角色权限由服务端校验 |
| 项目看板流转 | REAL | 仅映射 `ACCEPT/START/RESUME_EXTERNAL/RETURN/APPROVE`；其余动作进入任务详情 |
| 候选提取、修改、确认、忽略 | REAL | Candidate API；确认幂等并由服务端创建正式任务 |
| 开放任务认领 | DISABLED | MVP 不实现认领模型，标签页和静态任务入口已移除 |
| AI 生成任务草稿、重做 | REAL | AgentRun API；仅 `SUCCEEDED` 显示生成成功，`NEEDS_INPUT/FAILED` 明确失败原因 |
| AI 执行中心 | READ_ONLY | 读取 `/api/agent-runs`；不模拟进度、停止或重试 |
| 项目 AI 对话 | REAL | 项目会话和消息持久化；项目成员权限；只装载真实项目任务 |
| 从项目 AI 回答提取候选 | REAL | 回答进入统一 Candidate Extraction，仍需人工确认 |
| 个人跨项目 AI | DISABLED | 未接入权限上下文与持久化，入口引导至项目空间 |
| 全局搜索 | READ_ONLY | 只搜索服务端返回的任务和项目 |
| 通知中心 | DISABLED | 通知读取和已读状态尚无服务端接口，不展示演示未读数 |
| 任务留言、@通知、成员邀请 | DISABLED | 任务详情明确标注暂未开放 |
| 智能求助、知识、资产、能力库 | READ_ONLY | P2 能力边界预览；所有业务写入口关闭 |
| 账号密码、团队邀请与撤销 | REAL | 账号与团队 API；一次性邀请令牌由服务端生成 |
| 通知偏好、AI 偏好 | DISABLED | 设置页只读预览，不显示保存成功 |

## 阻断规则

- 成功提示必须发生在服务端成功响应之后，并能通过刷新重新观察。
- 未实现能力只能只读或禁用，不得用本地数组、固定回答或计时器模拟完成。
- `LIVE`、`MOCK`、`FALLBACK` 和 AgentRun 状态只使用服务端字段。
- 项目 AI 不得宣称读取尚未接入的会议或资产。
- 每次前端交付运行 `pnpm check:truth`，防止正式入口重新引用已知演示链路。
