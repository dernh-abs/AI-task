# Codex Demo Build Prompt

请基于当前目录中的以下文档，构建一个可交互的桌面端产品 Demo：

- 01-product-definition.md
- 02-information-architecture.md
- 03-user-flows.md
- 04-wireframe-spec.md
- 05-prd.md

## 项目目标
构建“全意 AI Task OS”桌面端可交互 Demo，用于内部评审产品逻辑与页面流程。

重点验证：自动拾取候选任务、人工确认创建、当前可执行与等待外部分区、三种执行模式、AI执行状态与人工验收、会议任务负责人确认、求助与轻量积分。

## 技术要求
- React
- TypeScript
- Tailwind CSS
- Vite
- 本地模拟数据
- 状态保存在前端内存或localStorage
- 不接真实后端
- 不需要登录
- 桌面端优先，适配1280px以上

## 视觉要求
专业、克制、AI原生、轻量B端；不使用卡通化游戏视觉。等待外部使用低饱和样式，AI执行状态使用明确图标和进度。

## 必须实现的页面
首页工作台、候选任务中心、候选任务确认抽屉、项目列表、项目详情、我的任务、任务详情、AI执行详情、等待外部列表、求助中心、我的贡献。

## 必须实现的交互流程

1. 候选任务确认：查看来源、修改字段、确认创建。
2. AI执行：排队中→执行中→完成→待人工确认→待验收/已完成。
3. 等待外部：填写外部依赖→移出当前可执行→收到反馈→恢复或创建后续任务。
4. 会议任务：负责人确认→员工确认接收→可退回补充。
5. 求助：AI初答→未解决→推荐成员→人工回答→标记解决→积分变化。

## 模拟数据
成员：泉哥、产品经理A、产品经理B、产品运营、全栈工程师。

项目：MedKungFu、FANNAL、全意品牌。

至少准备4条候选任务、10条当前任务、3条等待外部、2条AI执行任务、2条求助、4名外部联系人。

## 组件建议
Sidebar、Topbar、StatCard、TaskCard、CandidateTaskCard、StatusBadge、ExecutionModeBadge、ProjectCard、ExternalWaitingCard、AgentRunPanel、TaskDetailDrawer、ConfirmTaskDrawer、HelpRequestCard、PointsSummary。

## 类型建议
User、Project、Task、CandidateTask、Agent、AgentRun、ExternalContact、HelpRequest、ContributionRecord。

## 验收要求
项目可直接运行、无TypeScript报错、主要页面可访问、五条核心流程可完整点击演示、数据变化当前会话可见、README写明运行方式和Demo操作路径。

请先阅读全部产品文档，再开始搭建。不要自行扩展OA、CRM、审批、考勤等范围外功能。
