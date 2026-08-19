# 全意 AI Task OS｜PRD V1.0

## 1. 文档目的
定义全意 AI Task OS V1 的功能、规则、状态、权限、异常处理和验收标准，用于交互设计、Codex Demo开发和后续正式开发。

## 2. V1范围

### P0
项目管理、任务管理、候选任务识别与确认、当前可执行/等待外部分区、三种执行模式、AI执行状态与人工验收、会议任务负责人确认、CLI/API基础操作、风险与跟进提醒。

### P1
开放任务池、AI推荐认领、求助中心、个性化会议摘要、基础积分、外部联系人管理。

## 3. 角色与权限

| 操作 | CEO/负责人 | 普通成员 | AI Agent |
|---|---:|---:|---:|
| 创建项目 | 是 | 可配置 | 否 |
| 创建任务 | 是 | 是 | 通过授权接口 |
| 确认候选任务 | 是 | 来源负责人可确认 | 否 |
| 修改负责人 | 是 | 可申请 | 否 |
| 执行任务 | 是 | 是 | 是 |
| 验收任务 | 是 | 被指定验收人 | 否 |
| 查看全局项目 | 是 | 按权限 | 按授权 |
| 更新外部状态 | 是 | 内部跟进人 | 仅建议 |

## 4. 任务数据结构

必填：title、project_id、owner_id、execution_mode、status、priority。

建议：stage_id、background、objective、deliverable、acceptance_criteria、due_at、source_type、source_reference、assignee_ids、reviewer_id、agent_id、external_dependency、base_points。

执行模式：HUMAN、AI、HYBRID。

业务状态：CANDIDATE、PENDING_OWNER_CONFIRMATION、TODO、IN_PROGRESS、WAITING_EXTERNAL、BLOCKED、WAITING_HUMAN_CONFIRMATION、WAITING_REVIEW、DONE、CANCELED。

AI子状态：QUEUED、RUNNING、NEEDS_INPUT、FAILED、SUCCEEDED、CANCELED。

## 5. 候选任务规则

- 来源：聊天、会议、CLI、Codex、手动输入
- 所有AI识别任务先进入候选任务
- 未经人工确认不得成为正式任务
- 必须保留原始来源和上下文
- 忽略操作记录反馈

## 6. 会议任务规则

1. 会议结束后生成全局纪要。
2. AI提取决策与候选任务。
3. 会议负责人统一确认。
4. 负责人可修改标题、人员、时间、优先级、验收标准。
5. 正式下发后员工二次确认接收。
6. 员工可反馈信息不足、时间冲突、任务识别错误。

## 7. 当前可执行与等待外部

当前可执行包括TODO、IN_PROGRESS、内部可解决的BLOCKED、WAITING_HUMAN_CONFIRMATION、WAITING_REVIEW。

进入WAITING_EXTERNAL时必须填写：外部联系人、等待事项、预计回复时间、内部跟进人。

提醒：正常等待不进入首页主任务区；距预计时间24小时进入提醒；超时标记逾期并通知内部跟进人。

## 8. AI执行规则

1. AI任务必须指定Agent或执行通道。
2. 开始后记录日志。
3. 结果可为完成、需要补充信息、失败。
4. AI完成后进入WAITING_HUMAN_CONFIRMATION。
5. 人工通过后进入WAITING_REVIEW或DONE。
6. 保留输出摘要、文件、工具调用、错误记录和Agent身份。

## 9. 任务完成与流转

点击提交结果后选择：进入验收、转给内部成员、转AI执行、等待外部、直接完成。

若选择等待外部，必须填写外部依赖字段。

## 10. 开放任务池

任务创建者可设为开放认领。成员认领前显示工作量、截止时间和积分。AI只推荐，不自动分配。

## 11. 求助功能

创建求助必填：问题、所属任务、已尝试方案。

处理顺序：AI检索并回答 → 提问人确认 → 未解决则推荐成员 → 人工回答 → 标记解决 → 生成知识草稿与积分。

## 12. 积分规则

小任务5、普通10、复杂20、关键30；开放认领+5；解决求助+5；知识沉淀+3。

不自动评价抽象价值，不绑定薪酬，不做公开强排名。

## 13. CLI/API

```bash
task list
task get <task_id>
task create
task update <task_id>
task claim <task_id>
task start <task_id>
task block <task_id>
task wait-external <task_id>
task submit <task_id>
task complete <task_id>
task ask-help <task_id>
```

每次操作记录操作者身份，Agent只能访问授权项目，重要状态变更保留审计日志。

## 14. 异常处理

- AI识别错误：忽略、修改、记录反馈
- AI执行失败：重试、更换Agent、补充信息、转人工
- 外部等待无时间：允许保存但不自动提醒
- 任务无验收标准：允许创建但标记缺失
- 重复任务：提示关联或继续创建

## 15. Demo验收标准

必须可交互：候选任务创建、修改字段、切换执行模式、模拟AI状态、人工确认、转等待外部、恢复任务、任务验收完成、发布求助、积分变化。

Demo数据至少包含3个项目、10个当前任务、4个候选任务、3个等待外部、2个AI执行任务、2个求助、5名成员、4名外部联系人。
