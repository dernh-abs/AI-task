# ADR-0001：候选任务使用独立实体

- 状态：已接受
- 日期：2026-08-19

## 背景

旧规格同时将候选描述为独立对象和 Task 的 `CANDIDATE` 状态，现役 Demo 还存在两套候选类型，容易造成重复状态机和错误转换。

## 决策

候选使用独立 `CandidateTask` 实体及 `ACTIVE/STASHED/IGNORED/CREATED/LINKED` 生命周期。只有人工确认后才在同一事务中创建正式 Task；Task 主状态不再包含 `CANDIDATE`。

## 影响

- 需要更新 `types.ts`、`workHubData.ts` 和旧工程规格中的状态说明。
- 候选创建任务必须记录确认人、来源快照、证据和幂等键。
- `CREATED` 或 `LINKED` 后不得再次生成任务。

