# 全意 AI Task OS · MVP 规划基线文档（v3）

> 文档性质：MVP 功能范围 + 技术决策的**已拍板基线**，后续编码依据。
> 版本：v3 —— 据产品负责人对 v2 的复审修订。**本轮复审的定性结论**：方向已基本正确（与原设计一致性较高），本轮主要加固**实施顺序、事务一致性、并发防重、验收门槛**。无功能性方向错误。
> 规划日期：2026-08-19
> 配套源文件：`07-ai-capability-and-computation-spec.md`（工程规格）、`src/types.ts`（设计意图领域模型）、`src/workHubData.ts`（**现役数据真源**）、`src/AppV2.tsx`（现役前端，含 `WorkHubProvider`/`useHub`）、`src/store.tsx`+`src/data.ts`（**旧分支，现役不用**）、`src/App.tsx`（旧版 UI）。
> 原则：凡决策均标注源文件依据；凡"AI 设计"与"源文件要求"的区别显式区分；凡与原 P0 偏离均声明为新的产品决策并记录于 §4。

---

## 0. MVP 边界与目标

**及格线（一句话）**：一个真实团队能拿它管一个真实项目——**数据不丢、AI 真在跑（含最小执行闭环）、角色与权限真隔离、协作真发生**。

> ⚠️ **优先级重排声明**：原 P0 把「AI 执行、等待外部、基础检索」放 P0、「智能求助」放 P1。本 MVP 将 AI 执行与等待外部保留在 MVP（保身份），将**智能求助初答降级为"时间允许时再做"**。有意识裁剪，非遗漏。

### 必做（MVP 内核）
1. 登录、单团队、项目成员协作权限（非"只能看自己"）。
2. 项目、阶段、任务基础管理（含 CRUD 与阶段流转验收）。
3. 候选任务：支持手动粘贴会议/聊天文本，由 AI 提取；不做真实连接器。
4. 候选人工确认、来源证据、负责人二次接收（`PENDING_OWNER_CONFIRMATION`）。
5. 人工任务提交结果、退回、验收（非空提交）。
6. 等待外部字段、恢复动作、**服务端**临期与逾期提醒。
7. **最小 AI 执行闭环**：发起 AI 协助 → 生成 `AgentRun` → 保存状态与调用日志 → 产出文本/文档草稿 → 人工确认 → 提交验收。
8. 服务端进度计算与基础审计。
9. 智能求助初答 —— **时间允许时再做**（原 P1，本 MVP 降级）。

### 明确不做（Post-MVP）
- Embedding / RAG / 混合搜索 / 知识检索（MVP 不做 → 文档不出现"读取项目知识""检索历史资料"宣传；候选提取仅基于粘贴文本）。
- 真实会议/聊天/企业微信连接器（MVP 用手动粘贴文本替代）。
- 完整权限引擎与 RBAC 细化、多租户 `tenant_id` 隔离（数据模型预留 `team_id`）。
- CLI（**明确移至 Post-MVP**；MVP 接口 = REST API）。
- 健康度完整加权分与风险解释、今日智能排序、重复检测、容量/延期预测、低风险自动创建、Skill 蒸馏。

---

## 1. 技术栈（已拍板）

| 层 | 选型 | 说明 |
|---|---|---|
| 后端框架 | **FastAPI** | 异步、自带 OpenAPI、类型对齐快、接模型方便 |
| 数据库 | **SQLite**（起步） | 零运维，本地跑够用；验证完再迁 Postgres |
| ORM | **SQLModel** | FastAPI 搭档，类型即表 |
| 部署形态 | **本地跑** | 仅本机/局域网，不上云 |
| 前端改造 | **抽 `WorkHubProvider` → 薄 API client → 异步 store/Query → 逐步替换 `useState`** | 不动 UI 组件外观，只换数据来源；**详见 §2** |
| 认证 | 账号密码 + **JWT** | 会话无状态，配合 client token 注入 |
| 密码存储 | **bcrypt 哈希**（明文禁止） | 无歧义 |
| 模型供应商 | **直连 qwen-turbo（DashScope API）** | 去 TokenHub；密钥走环境变量 `QWEN_API_KEY` |
| AI 模式 | `AI_MODE=mock\|live`，**本地默认 mock** | 但正式验收须 ≥1 次 live（见 §3 ⑥、§9） |
| **前后端类型** | **由 FastAPI OpenAPI 自动生成 TS client + 类型** | **禁止手写维护两套**（Python SQLModel/Pydantic ↔ TS 各一份）；后端枚举变更，前端编译期报错（见 §6.1） |

---

## 2. 前端改造路径（已亲核源码，事实基础）

### 2.1 实测源码事实（已亲核，v2 已更正 v1 的错误）
- `src/main.tsx` 直接渲染 `AppV2`。
- `AppV2.tsx:572` `WorkHubProvider` 用 `useState` 维护 `tasks/projects/candidates/helps/assets/knowledgePages/notifications/contributions…`，初始化来自 `workHubData.ts`（`initialTasks` 等）。
- `AppV2.tsx:390` `HubContext`、`392` `useHub()` 是全局数据访问入口。
- `workHubData.ts` 是**现役数据真源**，仅被 `AppV2.tsx:95` import。
- `store.tsx` 与 `data.ts` 是**旧分支**：`store.tsx` 只被旧 `App.tsx:48` 引用，`data.ts` 只被 `store.tsx` 引用；现役 `AppV2` **完全不使用**。
- `localStorage` 当前仅持久化 `quanyi-active-team`（`AppV2:586-597`），其余数据不入本地存储。

> ❗ **v1 错误（已废弃）**：原写"只换 `store.tsx` 数据源"——实测改 `store.tsx` 现役界面零变化。

### 2.2 正确改造顺序（参见 §5 阶段 1 纵向切片）
1. 将 `AppV2` 内的 `WorkHubProvider` 抽离为独立数据层模块（保留 `useHub` 接口，页面无感）。
2. 建薄 API client（baseURL、JWT 注入、统一错误处理、统一错误结构）。
3. **从 OpenAPI 自动生成 TS 类型与 client**（见 §6.1），页面消费生成类型。
4. 页面**逐切片**把 `useState` 本地数据替换为服务端数据；**关键操作不乐观更新**（见 §6.5）。

### 2.3 状态表示三套并存（须统一）
- `types.ts` 大写枚举（贴合 07）：Task 10 状态 + `AiStatus`(6) + `AgentRun`；外加本版新增独立 `STAGE_STATUS`（见 §3 ⑨）。
- `workHubData.ts` 小写：`"candidate"|"todo"|"progress"|"ai"|"confirm"|"review"|"blocked"|"external"|"done"`（**AppV2 实际跑的**）。
- `AppV2` 的 `action()` 用小写别名，且 `ai`/`confirm` 不在任何枚举。

**统一目标**：以 `types.ts`+07 大写枚举为权威，迁移 `workHubData.ts` 与其对齐（删除 `candidate`/`ai`/`confirm` 等非规范值，见 §3 ④ 与 §4 ADR-001）。

---

## 3. 功能域规划（每项：源文件现状 → MVP 决策 → 落地要点）

### ① 数据库
- **现状**：领域模型在 `types.ts`；现役数据在 `workHubData.ts`；无后端、无 DB。
- **决策**：`types.ts` 领域模型落 SQLite + SQLModel；提供 CRUD/查询 API。
- **要点**：后端服务 + SQLModel 表 + **迁移机制**（Alembic 或轻量版本化脚本，空库与上一版本均可迁移，见 §8 测试项）+ 种子数据 + API 层；§2 的 client 替换 `WorkHubProvider` 数据源。

### ② 角色与权限（协作权限，非"只能看自己"）
- **现状**：`User.role` 裸 `string`（`types.ts:4`）；`currentUser` 写死；角色靠 `?role=ceo`（`AppV2:692/860`）；无 token。
- **MVP 决策（协作权限，呼应 07:999/1098）**：
  - CEO / 项目负责人：查看所属团队或授权项目。
  - 项目成员：查看自己参与项目内的任务。
  - 任务负责人：更新执行状态、提交结果。
  - 协作者：查看任务、提交个人产出、同步进展。
  - 验收人：执行验收（通过/退回）。
  - 普通项目成员：按项目配置（默认只读他项目任务或不可见）。
  - 非项目成员：默认不可见。
  - AI：继承发起人的读取范围，写操作受独立授权限制。
- **要点**：账号密码 + JWT + 角色；MVP 单团队、预留 `team_id`，不上 `tenant` 隔离；视角由登录态决定，删 `?role=ceo`。**权限矩阵在阶段 0 冻结（见 §5.0）。**

### ③ 任务全生命周期状态机
- **现状**：`types.ts` 10 枚举 + `AiStatus` + `AgentRun`（AI 执行本就独立于主状态）；UI 用小写别名且 `ai`/`confirm` 不在枚举。
- **决策**：
  1. 统一到大写枚举（迁移 `workHubData.ts`）；做语义澄清 + `allowed_transitions` 转移表。
  2. **`WAITING_EXTERNAL` 与 `BLOCKED` 不合并**（边界明确）：前者依赖客户/合作方/供应商等外部对象；后者为内部障碍、信息不足、权限、技术问题。
  3. **AI 执行走 B 方案**：任务主状态停在 `IN_PROGRESS`/`WAITING_HUMAN_CONFIRMATION`，AI 并行 `AgentRun` 记录（`AiStatus`），不占主状态。
  4. **状态机 = 独立模块** `state_machine.py`；API 只调用，不内联规则。
  5. **轻量状态历史表** `task_status_history(token_id, from_status, to_status, actor_id, reason, created_at)`，首日建，满足"不会伪造进度"（07:1106）。
  6. **删除任务主状态中的 `CANDIDATE`**（模型变更，已声明，详见 §4 ADR-001）：候选是独立实体，生命周期由候选表状态机覆盖。
- **要点**：转移表须显式包含 `IN_PROGRESS→WAITING_REVIEW`（人工提交）、`IN_PROGRESS→WAITING_HUMAN_CONFIRMATION`（AI 产出）、`WAITING_HUMAN_CONFIRMATION→WAITING_REVIEW/DONE`、`WAITING_REVIEW→DONE`（仅验收人）、`WAITING_REVIEW→IN_PROGRESS`（退回）。**状态守卫不仅查 from/to，还查 操作人/提交内容/关联数据（见 §6.2）。**

### ④ 候选任务 → 人工确认 → 真实落库创建
- **现状**：`CandidateReview` 弹窗已有（`AppV2:2557`）；有两套候选类型——规范 `CandidateTask`（`types.ts:9`）与 UI 分支 `Candidate`（`workHubData.ts:34`，重写 fork）。
- **决策**：
  1. **保留统一的候选实体**，状态：`ACTIVE / STASHED / IGNORED / CREATED / LINKED`（LINKED=候选已关联已建任务；修正 v2 文档前后不一致）。
  2. **候选来源快照独立存储**：手动粘贴原文存 `source_snapshot` 表（原文 + 来源类型 + 时间戳），不要只把一段文本复制到每条候选里；AI 从此快照提取。
  3. 确认创建 = 真实 API `POST /tasks`（带 `from_candidate_id`、`source_snapshot_id`、确认人、来源证据、备注）→ 落 `tasks` + 候选标记 `CREATED`/`LINKED` + 写审计。**事务化（见 §6.3）。**
  4. 合并双候选：统一到 `CandidateTask`，删除 `Candidate` 分支。
  5. **候选 → 任务起点状态须有条件**：
     - 若候选负责人 == 确认人 → 直接 `TODO`。
     - 若 CEO/会议负责人确认后分配给**其他**成员 → `PENDING_OWNER_CONFIRMATION` → 成员接收/退回补充/申请调整 → `TODO`。不能仅凭 `suggestedOwner` 一律跳过二次接收。
  6. **实施顺序**：候选**数据模型 + 手动候选 + 确认流转**在阶段 2 完成（不依赖模型）；**AI 提取**在阶段 4（Model Gateway 建成后接入），避免顺序倒置。

### ⑤ 进度 / 阶段算法（准确表述）
- **现状（写死假值）**：项目进度 `data.ts`/`AppV2` 硬编码；任务进度靠 `Math.max/min` 硬推；贡献 86 分硬显示。
- **MVP 决策（准确表述）**：
  1. 有检查点（子任务清单）：按检查点权重计算（07:288）。
  2. 无检查点：仅按状态显示默认区间——`BLOCKED`/`WAITING_EXTERNAL` **冻结不增**；`IN_PROGRESS` 负责人可`update` 实际完成度；`WAITING_HUMAN_CONFIRMATION` ≤ 90%；`WAITING_REVIEW` ≤ 95%；验收通过 = 100%（07:298-308）。
  3. 阶段/项目进度按权重聚合（07:314-325）。
  4. **健康度 / 等待外部规则（v2 修正，重要）**：
     - **正常 `WAITING_EXTERNAL` 不影响健康度**（或仅记录外部依赖，不降级）。
     - 距预计回复时间 **≤ 24h** → 标记"有风险"。
     - 已 **逾期** → 标记"需关注"。
     - **关键外部依赖逾期且无替代方案** → 强制"需关注"。
     - 其余：`BLOCKED` → 有风险（内部障碍）；关键路径逾期 → 至少"有风险"（07:369-371）。
  5. 贡献分 = 事件自动入账（`DONE`/求助解答写 `ContributionRecord`），不用模型；**贡献事件唯一键防重复入账（见 §6.4）。**
  6. 计算放服务端；07 端点 `progress-breakdown`/`recalculate-progress`/`health-breakdown`（874-876）直接实现。
- **措辞纪律**：单字段人工维护称"人工维护的真实数据"+状态 band，**不得称"算法"**。

### ⑥ 接模型（范围与矛盾已修正）
- **现状**：Demo 零真实调用；`AgentRun` 进度前端演的；07 有完整模型框架。
- **MVP 决策**：
  1. **AI 场景**：① 候选提取（粘贴文本→结构化候选，阶段 4）；② **最小 AI 执行闭环**（阶段 5，产文本/文档草稿）。**智能求助初答降级为"时间允许时再做"**（原 P1）。
  2. **供应商**：直连 qwen-turbo（去 TokenHub），密钥 env `QWEN_API_KEY`；Model Gateway 薄层 `(能力等级, prompt, JSON Schema)` → 结构化输出校验。
  3. **请求结果缓存（非语义缓存）**：key=`hash(输入+知识版本+Prompt版本)`，SQLite；**无 Embedding，不是语义缓存**。
  4. **mock 降级 + 单项目日预算预检**：`BUDGET_EXCEEDED`/调用失败 → 确定性 mock（复用 Demo 硬编码文案），绝不绕过人工门禁。
  5. **`AI_MODE` 默认 `mock`（本地开发/自测不烧额度、不依赖网络）；但正式 MVP 验收必须 ≥1 次 `live` 调用**，记录模型/Prompt 版本/耗时/Token/成本/结果；UI 须明确标识"真实 AI"或"降级结果"。
  - **降级不伪装成功（v2 修正，重要）**：每条 `AgentRun` 与调用日志须记录 `execution_mode = LIVE | MOCK | FALLBACK`、`degraded: bool`、`fallback_reason`。Fallback 结果 UI 必须显式标注"降级演示结果"；**正式验收不得用 fallback 结果代替 live 成功**（见 §8 测试项）。

### ⑦ 最小 AI 执行闭环
- **流程**：发起 AI 协助 → 后端生成 `AgentRun`（关联 `taskId`，`AiStatus=QUEUED→RUNNING`）→ 调 Model Gateway 产出文本/文档草稿 → `AgentRun` 保存 `logs/output/files` → 任务主状态 `IN_PROGRESS→WAITING_HUMAN_CONFIRMATION`（07:816）→ 人确认草稿 → `→WAITING_REVIEW` 提交验收 → 验收人通过 `→DONE`。
- **要点（v2 修正，重要）**：
  - AI 执行全程不在主状态机里"假装完成"；失败 `FAILED/NEEDS_INPUT` 需人工介入。
  - **失败重试次数 / `NEEDS_INPUT` / 超时处理 / 服务重启后卡死任务恢复 / 相同请求防止重复创建 AgentRun**（见 §6.4）。
  - **事务化**：AI 完成须在一个事务内更新 AgentRun + 保存输出 + 改任务状态（见 §6.3）。

### ⑧ 等待外部闭环（服务端提醒）
- **现状**：`types.ts` 有 `ExternalContact` + `ExternalDependency`（`contactId/item/expectedAt/lastUpdate`）；`data.ts` 有 3 个真实种子（`t11/t12/t13`）；`07` 要求（60/245/389/778-779/1106）。
- **MVP 决策**：
  1. 任务进入 `WAITING_EXTERNAL` 须绑定 `ExternalDependency`，**必填字段**：
     - 等待对象 `contact_id`（外部联系人）
     - 等待事项 `item`
     - 预计回复时间 `expected_at`（绝对时间）
     - **内部跟进人 `internal_followup_user_id`（必填，v2 缺失，本轮补）**
     - 恢复动作 `recovery_action`
     - **补充字段（v2 缺失，本轮补）**：`last_followup_at`（最近跟进时间）、`external_feedback_status`（外部反馈状态）、`actual_received_at`（实际收到时间）、`reminder_sent`（提醒是否已发送）
  2. **临期与逾期提醒必须由服务端调度**（如后台巡检任务 / APScheduler / 定时协程），**绝不依赖浏览器定时器**——否则用户关闭页面后提醒失效。提醒唯一键防重复发送（§6.4）。
  3. 恢复动作：成员登录系统记录"已收到外部资料/结果"（`AppV2:2615` 现有逻辑），填 `actual_received_at`，状态回 `IN_PROGRESS`；外部人无系统入口（MVP 不做免登录链接，沿用成员中转）。**事务化：更新依赖 + 改任务状态 + 写历史（§6.3）。**
  4. `WAITING_EXTERNAL` 进度冻结、不伪造（07:1106）；健康度规则见 §3 ⑤ 第 4 点。
- **验收项**：可创建带外部依赖的任务、服务端触发临期/逾期提醒、能恢复并续跑。

### ⑨ 项目 / 阶段管理
- **现状**：`Project` 有 `stage` 单字段（`data.ts`）；`AppV2:1290` 阶段条仅为展示；无阶段 CRUD、无阶段流转验收。
- **MVP 决策**：
  1. 项目 CRUD（名称/客户/成员/目标）。
  2. **阶段状态独立枚举（v2 修正，重要）**：`STAGE_STATUS = PLANNED | ACTIVE | WAITING_REVIEW | DONE`。**阶段不使用任务状态**，避免数据模型混乱。
  3. 阶段进度由任务聚合（07:314）；阶段风险由其下任务的 `BLOCKED`/`WAITING_EXTERNAL`/`OVERDUE` **派生**，不让阶段直接进入任务状态。
  4. 阶段流转 + 验收：阶段负责人确认完成才进入 `WAITING_REVIEW`/`DONE`（07:320）。
- **实施顺序**：阶段 CRUD 可提前（阶段 2 左右）；但阶段/项目**聚合计算**在任务闭环稳定后（阶段 6），否则任务规则频变会反复改聚合算法。

### ⑩ 任务提交与验收（非空提交，MVP 不上传文件）
- **源文件**：落点 `WAITING_REVIEW`（07:817）；`reviewerId` 字段 `types.ts:8`；门禁 `reviewer===currentUser`（`AppV2:2598/2608`）；`deliverable/acceptance/result?` 字段已存在。
- **v2 修正点（重要）**：
  1. 人工任务提交**必须填写至少一项**：结果说明 / 文件或资产引用 / 外部链接。
  2. **附件范围（本轮明确）**：MVP **必须支持**结果文本 + 外部 URL；**可以支持**引用系统内已有资产；**暂不支持直接上传新文件**（避免引入本地对象存储/附件表/下载接口的风险）。如后续需要上传，再补本地对象存储目录 + 附件元数据表 + 权限 + 下载接口。
  3. 提交时展示验收标准（`acceptance`），允许逐项说明。
  4. 提交后 → `WAITING_REVIEW`（**不可空提交直接进入待验收**）。
  5. 仅指定验收人或授权角色可：通过（`→DONE`）/ 退回（须填原因 `→IN_PROGRESS`）。
  6. **保留每一次提交版本**，不覆盖历史结果（提交历史表）。**事务化：写提交版本 + 改状态 + 写历史（§6.3）。**
  7. 多人参与：协作者提交个人产出 → 负责人汇总 → 负责人提交整体结果 → 验收人验收。
- **要点**：`reviewerId` 门禁用第 ② 项真登录态校验（替换 Demo 名字比对）。**事务化：验收通过须在一个事务内改状态 + 记贡献 + 写审计（§6.3）。**

---

## 4. 领域决策记录（ADR）与偏差说明

> 目的：解决 v2 中"既以 `types.ts+07` 为权威、又删除其中 `CANDIDATE`"的表述矛盾。凡对原规格的领域模型变更，均在此显式记录，避免后续开发者按旧规格重新加回被删项。

### ADR-001：候选任务从 Task 主状态拆为独立 Candidate 实体
- **背景**：`types.ts` 的 `TaskStatus` 含 `CANDIDATE`（`types.ts:1` 首位），但全量 grep 仅 2 处命中（枚举声明 + 旧 `App.tsx:59` 死样式标签），无任何任务实例化；`candidateToTask` 转换器跳过它；候选生命周期已由 `CandidateTask.state`（ACTIVE/STASHED/IGNORED/CREATED/LINKED）完整覆盖。
- **决策**：从 `TaskStatus` 枚举**删除 `CANDIDATE`**；候选作为独立 `Candidate` 实体（`CandidateTask`），其状态机自洽。**任务一旦创建即 `TODO` 起。**
- **影响**：`types.ts` 须同步更新（或生成新领域模型）；任何"候选→任务"流程走 `ACTIVE→CREATED/LINKED` 候选态，不污染任务主状态。
- **状态**：已拍板，MVP 执行。

### 与原 P0 / 07 规格的偏差表（须记录在案，便于评审对齐）
| 偏差项 | 原规格 | MVP 决策 | 性质 |
|---|---|---|---|
| 候选 `CANDIDATE` 任务态 | 07 生命周期含 `CANDIDATE→TODO` | 删枚举，候选独立实体（ADR-001） | 模型变更，已声明 |
| AI/Agent 执行 | P0 要求 | **保留在 MVP**（最小闭环） | 一致（v2 已恢复） |
| 等待外部 | P0 要求 | **保留在 MVP** + 服务端提醒 | 一致（v2 已恢复） |
| 基础检索 / RAG / Embedding | 07 列为 P0 | **推迟 Post-MVP** | 裁剪，已声明 |
| 智能求助初答 | P1 | 降级为"时间允许时再做" | 优先级重排，已声明 |
| CLI | P0（PRD/产品定义） | **推迟 Post-MVP** | 裁剪，已声明 |
| 健康度完整加权分 | 07 | 简化规则（MVP） | 降级，已声明 |
| 多租户 tenant 隔离 | 07:999 强制 tenant_id/team_id | 单团队、预留 team_id | 裁剪，已声明 |

---

## 5. 实施顺序：阶段 0 冻结契约 + 阶段 1–7 纵向切片

> **v2 最大工作流风险**：阶段一一次性完成"后端+DB+登录+权限+前端抽取+状态机+项目阶段"，范围过大，可能做一两周期无完整可演示链路。v3 改为**纵向切片**：每个阶段都完成"DB→API→权限→前端→测试→验收"的最小贯通。

### 阶段 0：冻结契约（编码前必做）
产出四份可直接测试的表格，**产品/前端/后端对同一状态、字段、权限无不同解释**：
1. **状态转移矩阵**：每一步 `from → to`，含允许的操作人、必填校验（见 §6.2 守卫清单）。
2. **角色—资源—操作权限矩阵**：CEO/项目负责人/成员/协作者/验收人/非成员 × 项目/阶段/任务/候选/外部依赖/AI Run 的 读/写/验收/删除。
3. **核心实体及字段字典**：Task / Candidate / SourceSnapshot / ExternalDependency / Stage / Project / AgentRun / 提交版本 / 贡献 / 审计 / 用户，含类型与必填。
4. **MVP 验收用例矩阵**：每条验收项对应阶段与测试（对齐 §8）。
- 同时完成 §4 偏差记录（ADR-001 + 偏差表）。
- **完成标准**：三方对契约无歧义。

### 阶段 1：最小贯通骨架（只读链路）
只打通一条只读链路，同时完成基建：
```
初始化数据库 → 登录 → 获取当前用户 → 获取一个项目 → 获取项目任务 → AppV2 展示服务端数据
```
同时完成：数据库迁移机制、种子数据、API client、**JWT 注入、统一错误结构、OpenAPI 类型生成（§6.1）**。
- **不一次替换整个 `WorkHubProvider`**，只让"读取一条链路"走服务端；其余仍本地，逐步迁移。

### 阶段 2：人工任务完整闭环（核心，零 AI 依赖）
先打通最核心、完全不依赖 AI 的链路：
```
创建任务 → 分配成员 → 成员接收 → 开始任务 → 提交非空结果 → 验收人退回 → 重新提交 → 验收通过 → DONE
```
同时完成：状态机守卫、权限校验、提交版本、**状态历史、审计事件、防重复提交、`PENDING_OWNER_CONFIRMATION` 二次接收、进度计算（状态 band）**。
- 候选**数据模型 + 手动候选 + 确认流转**（不含 AI 提取）、项目/阶段 CRUD 也可落入本阶段。
- **完成后系统已能真实管理任务。**

### 阶段 3：等待外部闭环
```
进行中 → 填写外部依赖（必填项见 §3 ⑧）→ WAITING_EXTERNAL → 服务端临期/逾期检查 → 通知内部跟进人 → 记录收到反馈 → 恢复 IN_PROGRESS
```
- 提醒由**服务端调度**（后台巡检），不依赖浏览器定时器；提醒唯一键防重。

### 阶段 4：Model Gateway 与候选 AI 提取（顺序已修正）
**先建 Model Gateway 最小骨架**（不依赖业务）：
- `execution_mode = LIVE/MOCK/FALLBACK`、`degraded`、`fallback_reason`
- JSON Schema 校验、Prompt 版本、调用日志、超时与重试、成本与预算、精确结果缓存
再接入业务：
```
保存粘贴原文快照(source_snapshot) → AI 提取多个候选 → 人工修改 → 确认或忽略 → 创建任务 → 负责人二次接收
```
- 原文存 `source_snapshot`，不复制进每条候选。

### 阶段 5：最小 AI 执行闭环
```
创建 AgentRun → QUEUED → RUNNING → 保存调用日志 → 输出草稿 → WAITING_HUMAN_CONFIRMATION → 人工确认 → WAITING_REVIEW → 验收
```
- 必加：失败重试次数、`NEEDS_INPUT`、超时处理、**服务重启后 `RUNNING` 卡死任务恢复**、**相同请求防重复创建 AgentRun**。
- Fallback 结果明确标记，不冒充 live 成功。

### 阶段 6：项目 / 阶段聚合
- 项目与阶段 CRUD 可提前（阶段 2）做；**进度/健康度/贡献聚合**在任务闭环稳定后完成，避免任务规则频变反复改聚合。
- 阶段进度 = 任务加权聚合；阶段风险 = 任务 `BLOCKED`/`WAITING_EXTERNAL`/`OVERDUE` 派生；阶段状态用 `STAGE_STATUS`。

### 阶段 7：智能求助（可选，不阻塞 MVP）
维持可选。

---

## 6. 防错机制（v2 复审新增，关键）

### 6.1 API 类型自动生成，禁止手写两套
- 从 FastAPI OpenAPI 自动生成 **TS client + 请求/响应类型**。
- 后端枚举/`Pydantic`/`SQLModel` 变更 → 前端编译期报错，杜绝前后端枚举漂移。
- 不手工维护 Python 侧与 TS 侧各一份类型。

### 6.2 状态机守卫须检查"上下文"，不止 from/to
`state_machine.can_transition(from, to, actor, payload, context)` 同时校验：
- 当前状态 `from` + 目标状态 `to`（转移表）
- 当前操作人 `actor`（角色/owner/reviewer/协作者）
- 提交内容 `payload`（如：转 `WAITING_REVIEW` 必须非空结果；通过验收必须是 reviewer）
- 关联数据 `context`（如：转 `WAITING_EXTERNAL` 必须有外部依赖字段；AI 结果确认必须有成功的 AgentRun；`DONE` 后重新打开必须填原因）
- 所有守卫集中在领域服务 / 状态机模块，**不散落 API 路由**。

### 6.3 关键操作必须事务化
以下操作必须在一个 DB 事务内完成，否则中途报错产生半完成数据：
- **候选确认**：创建任务 + 更新候选 + 写审计
- **提交结果**：写提交版本 + 改状态 + 写历史
- **验收通过**：改状态 + 记贡献 + 写审计
- **外部恢复**：更新依赖 + 改任务状态 + 写历史
- **AI 完成**：更新 AgentRun + 保存输出 + 改任务状态

### 6.4 幂等性与并发控制
易重复的操作及对策：
- 双击确认候选 → `Idempotency-Key`（请求头）+ 候选唯一约束（同一候选只允许一次 `CREATED`）
- 重复提交结果 → 提交版本表 append（不原地更新），配合乐观锁 `version`/`updated_at`
- 重复验收 → 验收事件唯一键（同一任务同一次提交只允许一次贡献入账）
- 重复启动 AI → 相同请求指纹唯一约束，防重复创建 `AgentRun`
- 提醒重复执行 → 提醒唯一键（`task_id + 提醒类型 + 日期`）
- 重复发贡献分 → 贡献事件唯一键（`task_id + 事件类型 + 版本`）
- 通用：关键写操作带 `Idempotency-Key`；DB 层关键唯一约束；`version`/`updated_at` 乐观锁防止并发覆盖。

### 6.5 关键状态不做乐观更新
- **不乐观更新**（须等服务器确认后才改 UI）：状态流转、候选确认、验收通过、权限变更、AI Run 启动、贡献入账。
- **可乐观更新**（低风险）：评论、标题草稿、筛选状态。

### 6.6 每个切片固定完成标准
每项功能同时满足以下条件才算完成：
- 数据表与迁移
- API 与参数校验
- 权限检查
- 审计记录
- 前端完整状态（Loading / 空数据 / 失败 / 重试）
- 单元测试
- API 集成测试
- 至少一条端到端（E2E）测试
- 验收记录
- 回滚方式（迁移可降级 / 特性开关）

---

## 7. MVP 验收清单（对齐 07 §17，取相关子集 + 本版新增）

- [ ] 所有持久数据来自后端 DB，刷新/换浏览器不丢，非全员同一套模拟数据
- [ ] 登录态决定角色与可见范围；按协作权限（非仅自己任务）隔离；`DONE` 只能由 `reviewerId`==登录用户或授权角色完成
- [ ] 任务状态流转经后端 `state_machine` 校验（含 actor/payload/context 守卫），非法跳转被拒；每次流转写历史表
- [ ] 阻塞 / 等待外部 **冻结且不伪造进度**；`WAITING_HUMAN_CONFIRMATION`≤90%、`WAITING_REVIEW`≤95%、验收通过=100%
- [ ] **正常 `WAITING_EXTERNAL` 不降级**；距 `expected_at` ≤24h=有风险；逾期=需关注；关键外部依赖逾期无替代=强制需关注
- [ ] 候选确认创建真实落库，溯源保留（source_snapshot/确认人/备注）；CEO 分配他人走 `PENDING_OWNER_CONFIRMATION`；同一候选重复确认只生成一个任务
- [ ] 阶段使用独立 `STAGE_STATUS`；阶段进度随任务聚合、风险派生；可流转验收
- [ ] 等待外部任务可建（含 `internal_followup_user_id` 等必填）、**服务端**触发临期/逾期提醒、可恢复续跑
- [ ] **提交验收非空**（结果/资产/链接至少一项）；保留提交版本；退回须填原因；MVP 不支持上传新文件
- [ ] 项目进度/健康度/贡献分由服务端算法计算，无写死值；贡献事件防重复入账
- [ ] **最小 AI 执行闭环打通**：AgentRun 生成→草稿→人确认→提交验收；含重试/超时/重启恢复/防重复创建
- [ ] AI 回复来自真实 qwen-turbo（或确定性 mock 降级），调用记日志含成本；`execution_mode`/`degraded`/`fallback_reason` 完整；**验收须 ≥1 次 live 且 UI 标识真假**；**正式验收不得用 fallback 结果代替**
- [ ] 预算/降级开关可配置，默认 mock 离线可跑
- [ ] 前后端类型由 OpenAPI 自动生成，无两套手工维护

---

## 8. 最小测试集（优先覆盖最易产生严重数据错误的部分）

1. 所有合法与非法状态转移（含守卫：转 `WAITING_EXTERNAL` 须有外部依赖、提交须非空、`DONE` 后重开须填原因）
2. CEO / 负责人 / 协作者 / 验收人的权限矩阵
3. 空结果不能提交
4. 非验收人不能完成任务（通过验收）
5. 同一候选重复确认只生成一个任务（`Idempotency-Key` + 唯一约束）
6. 同一任务重复验收只发一次贡献分（贡献事件唯一键）
7. 等待外部临期与逾期边界（≤24h / 已逾期）
8. AI 输出不符合 Schema 时不能创建候选
9. Live 失败后正确标记 `FALLBACK` / `degraded=true` / `fallback_reason`
10. 服务重启后 `RUNNING` 状态能够恢复或失败关闭
11. 数据库迁移从空库和上一版本都能成功
12. 一条完整人工任务 E2E（创建→分配→接收→提交→退回→重提→验收→DONE）
13. 一条完整 AI 任务 E2E（AgentRun → 草稿 → 确认 → 验收）

---

## 9. 关键风险

1. **前端数据层抽取是真实工程**（v1 误判为"换 store.tsx"）：`WorkHubProvider` 内 `useState` 全部需变异步，影响面大，必须按切片分步替换（§5）。
2. **状态三表示并存**：统一到大写枚举需迁移 `workHubData.ts`，易漏改引用点（§2.3）。
3. **范围扩大导致成本上升**：AI 执行闭环 + 等待外部 + 项目/阶段管理拉回 MVP，后端工作量明显高于 v1"轻量"设想——已认可该取舍。
4. **双候选合并**：删 `Candidate` 分支须核对 `AppV2` 全部引用，防回归（§3 ④）。
5. **降级兜底**：`AI_MODE` 默认 mock 须保证纯本地可跑；但验收强制 live，避免"全程 mock 通过"（§3 ⑥）。
6. **成本控制**：qwen-turbo 计费，预算阈值与降级须先做对。
7. **并发/一致性（v3 新增）**：关键操作须事务化 + 幂等（双击确认、重复验收、重复 AI 启动、提醒重发）——不做会产生半完成数据与重复入账（§6.3/6.4）。
8. **服务端提醒（v3 新增）**：临期/逾期提醒必须服务端调度，不能依赖浏览器定时器，否则关闭页面即失效（§3 ⑧）。
9. **实施顺序（v3 新增）**：阶段 0 冻结契约、阶段 1 起纵向切片；避免水平铺地基导致"做一两周期无完整可演示链路"（§5）。
