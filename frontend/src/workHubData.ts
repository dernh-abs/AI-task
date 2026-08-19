export type TaskStatus =
  | "candidate"
  | "todo"
  | "progress"
  | "ai"
  | "confirm"
  | "review"
  | "blocked"
  | "external"
  | "done";

export type ExecutionMode = "human" | "ai" | "hybrid";

export type Task = {
  id: string;
  title: string;
  projectId: string;
  project: string;
  owner: string;
  collaborators: string[];
  due: string;
  priority: "高" | "中" | "低";
  status: TaskStatus;
  mode: ExecutionMode;
  progress: number;
  description: string;
  deliverable: string;
  acceptance?: string;
  apiStatus?: "PENDING_OWNER_CONFIRMATION" | "TODO" | "IN_PROGRESS" | "WAITING_EXTERNAL" | "BLOCKED" | "WAITING_HUMAN_CONFIRMATION" | "WAITING_REVIEW" | "DONE" | "CANCELED";
  version?: number;
  reviewer?: string;
  blockedReason?: string;
  source: string;
  nextAction: string;
};

export type Candidate = {
  id: string;
  title: string;
  source: "会议" | "AI Chat" | "文档" | "聊天";
  sourceDetail: string;
  confidence: number;
  suggestedOwner: string;
  suggestedProject: string;
  due: string;
  reason: string;
};

export type Project = {
  id: string;
  name: string;
  client: string;
  stage: string;
  health: "正常" | "有风险" | "需关注";
  progress: number;
  owner: string;
  nextMilestone: string;
  due: string;
  color: string;
};

export type HelpRequest = {
  id: string;
  title: string;
  project: string;
  author: string;
  status: "ai" | "expert" | "answered" | "resolved";
  urgency: "普通" | "紧急";
  aiAnswer: string;
  expert?: string;
};

export type Asset = {
  id: string;
  title: string;
  type: "文档" | "方案" | "会议" | "模板" | "知识";
  scope: string;
  updatedAt: string;
  owner: string;
  summary: string;
  tags: string[];
};

export const initialProjects: Project[] = [
  {
    id: "p-fannal",
    name: "凡诺 AI 官网升级",
    client: "凡诺科技",
    stage: "方案深化",
    health: "有风险",
    progress: 64,
    owner: "徐泉",
    nextMilestone: "确认首页信息架构",
    due: "8月22日",
    color: "#246bfd",
  },
  {
    id: "p-quanyi",
    name: "全意 AI 工作中枢",
    client: "全意内部",
    stage: "交互原型",
    health: "正常",
    progress: 48,
    owner: "廖婉琛",
    nextMilestone: "完成核心工作流评审",
    due: "8月26日",
    color: "#13a86b",
  },
  {
    id: "p-kungfu",
    name: "康福来官网重构",
    client: "康福来",
    stage: "内容准备",
    health: "需关注",
    progress: 31,
    owner: "TRoY",
    nextMilestone: "客户补齐产品资料",
    due: "8月29日",
    color: "#f59e0b",
  },
];

export const initialTasks: Task[] = [
  {
    id: "t-100",
    title: "归档凡诺官网需求访谈结论",
    projectId: "p-fannal",
    project: "凡诺 AI 官网升级",
    owner: "廖婉琛",
    collaborators: ["徐泉"],
    due: "8月18日",
    priority: "中",
    status: "done",
    mode: "hybrid",
    progress: 100,
    description: "整理客户访谈中的目标用户、核心诉求与官网范围，形成后续信息架构的输入。",
    deliverable: "需求访谈结论与范围清单",
    reviewer: "徐泉",
    source: "8月12日需求访谈",
    nextAction: "已完成并归档",
  },
  {
    id: "t-101",
    title: "梳理凡诺官网首页信息架构",
    projectId: "p-fannal",
    project: "凡诺 AI 官网升级",
    owner: "廖婉琛",
    collaborators: ["徐泉", "内容专家"],
    due: "今天 18:00",
    priority: "高",
    status: "progress",
    mode: "hybrid",
    progress: 62,
    description: "基于访谈与现有 PRD，确定首页目标、模块顺序和每个模块的核心行动。",
    deliverable: "首页信息架构 V2 + 模块说明",
    reviewer: "徐泉",
    source: "8月17日项目讨论会",
    nextAction: "补齐解决方案区的内容层级",
  },
  {
    id: "t-102",
    title: "审阅 AI 生成的竞品分析",
    projectId: "p-quanyi",
    project: "全意 AI 工作中枢",
    owner: "徐泉",
    collaborators: ["市场专家"],
    due: "今天 16:30",
    priority: "高",
    status: "confirm",
    mode: "ai",
    progress: 100,
    description: "AI 已完成 6 个同类产品的工作流与界面分析，需要人工确认引用和结论。",
    deliverable: "竞品分析简报",
    reviewer: "廖婉琛",
    source: "AI Chat",
    nextAction: "确认结果后进入项目评审",
  },
  {
    id: "t-103",
    title: "等待客户提供产品参数表",
    projectId: "p-kungfu",
    project: "康福来官网重构",
    owner: "TRoY",
    collaborators: ["客户王经理"],
    due: "预计明天",
    priority: "中",
    status: "external",
    mode: "human",
    progress: 35,
    description: "产品详情页需要完整的产品参数和适用人群说明，已于昨日向客户发起请求。",
    deliverable: "产品参数表.xlsx",
    reviewer: "徐泉",
    source: "项目任务",
    nextAction: "收到资料后恢复内容整理",
  },
  {
    id: "t-104",
    title: "生成全意工作中枢页面文案初稿",
    projectId: "p-quanyi",
    project: "全意 AI 工作中枢",
    owner: "AI · 内容助手",
    collaborators: ["廖婉琛"],
    due: "今天 19:00",
    priority: "中",
    status: "ai",
    mode: "ai",
    progress: 58,
    description: "根据产品定位与页面结构，为关键空态、按钮和状态反馈生成中文文案。",
    deliverable: "界面文案清单",
    reviewer: "廖婉琛",
    source: "任务详情",
    nextAction: "AI 正在整理状态反馈文案",
  },
  {
    id: "t-105",
    title: "确认品牌蓝与状态色规范",
    projectId: "p-fannal",
    project: "凡诺 AI 官网升级",
    owner: "廖婉琛",
    collaborators: ["视觉专家"],
    due: "8月20日",
    priority: "中",
    status: "review",
    mode: "hybrid",
    progress: 90,
    description: "确定品牌主色、信息色、成功/警告/错误色及其在界面中的使用边界。",
    deliverable: "颜色语义规范",
    reviewer: "徐泉",
    source: "设计评审",
    nextAction: "负责人验收并归档",
  },
  {
    id: "t-106",
    title: "移动端导航交互待产品确认",
    projectId: "p-quanyi",
    project: "全意 AI 工作中枢",
    owner: "曹玉祥",
    collaborators: ["廖婉琛"],
    due: "8月21日",
    priority: "中",
    status: "blocked",
    mode: "human",
    progress: 44,
    description: "移动端一级导航数量与入口优先级未确认，当前无法完成响应式方案。",
    deliverable: "移动端导航方案",
    reviewer: "廖婉琛",
    blockedReason: "移动端一级导航数量与入口优先级尚未确认，需要产品负责人明确范围后才能继续响应式方案。",
    source: "设计走查",
    nextAction: "发起产品决策求助",
  },
];

export const initialCandidates: Candidate[] = [
  {
    id: "c-201",
    title: "整理客户对首页核心卖点的反馈",
    source: "会议",
    sourceDetail: "凡诺项目周会 · 8月18日 10:30",
    confidence: 96,
    suggestedOwner: "廖婉琛",
    suggestedProject: "凡诺 AI 官网升级",
    due: "8月20日",
    reason: "会议中明确出现了交付物、负责人和时间要求。",
  },
  {
    id: "c-202",
    title: "补充会议与聊天任务提取入口说明",
    source: "聊天",
    sourceDetail: "全意产品群 · 今天 09:42",
    confidence: 89,
    suggestedOwner: "廖婉琛",
    suggestedProject: "全意 AI 工作中枢",
    due: "8月22日",
    reason: "群聊中明确形成了负责人、交付内容和下一步行动。",
  },
  {
    id: "c-203",
    title: "把客户资料缺失项发给王经理确认",
    source: "文档",
    sourceDetail: "康福来内容盘点表 V3",
    confidence: 84,
    suggestedOwner: "TRoY",
    suggestedProject: "康福来官网重构",
    due: "今天",
    reason: "文档存在 7 个未完成字段，并标记了外部责任人。",
  },
];

export const initialHelpRequests: HelpRequest[] = [
  {
    id: "h-301",
    title: "GEO 方案里如何定义高质量问题库？",
    project: "凡诺 AI 官网升级",
    author: "TRoY",
    status: "expert",
    urgency: "普通",
    aiAnswer: "已找到 3 份历史方案，但客户行业差异较大，建议由 GEO 专家补充判断。",
    expert: "GEO 专家 · 林泽",
  },
  {
    id: "h-302",
    title: "客户迟迟不回产品参数，项目下一步怎么推进？",
    project: "康福来官网重构",
    author: "曹玉祥",
    status: "ai",
    urgency: "紧急",
    aiAnswer: "建议先用已有资料建立缺口清单，并将不依赖参数的内容模块并行推进。",
  },
];

export const initialAssets: Asset[] = [
  {
    id: "a-401",
    title: "全意 AI 工作中枢产品需求 V1",
    type: "文档",
    scope: "企业资产 / 产品",
    updatedAt: "今天 11:20",
    owner: "廖婉琛",
    summary: "产品定位、核心场景、主链路、第一版预览范围和产品边界。",
    tags: ["PRD", "AI 原生", "工作中枢"],
  },
  {
    id: "a-402",
    title: "凡诺项目周会纪要 · 8月18日",
    type: "会议",
    scope: "客户资产 / 凡诺科技",
    updatedAt: "今天 10:58",
    owner: "会议助手",
    summary: "确认首页以品牌可信度和 AI 官网能力为两条主线，提取 3 个候选任务。",
    tags: ["会议", "候选任务"],
  },
  {
    id: "a-403",
    title: "企业官网信息架构检查清单",
    type: "模板",
    scope: "企业资产 / 方法论",
    updatedAt: "昨天 18:10",
    owner: "设计专家",
    summary: "用于首页、产品页和解决方案页的信息架构评审与交付前检查。",
    tags: ["模板", "信息架构", "设计"],
  },
  {
    id: "a-404",
    title: "如何处理等待外部的项目任务",
    type: "知识",
    scope: "企业资产 / 项目知识",
    updatedAt: "8月16日",
    owner: "AI 知识助手",
    summary: "将外部依赖从主注意力中移出，同时保留对象、内容、预计回复时间和恢复动作。",
    tags: ["SOP", "等待外部"],
  },
];

export const openTasks: Task[] = [
  {
    id: "o-501",
    title: "整理 5 个优秀 AI 工作台的空态文案",
    projectId: "p-quanyi",
    project: "全意 AI 工作中枢",
    owner: "待认领",
    collaborators: [],
    due: "8月23日",
    priority: "低",
    status: "todo",
    mode: "human",
    progress: 0,
    description: "收集并归纳 AI 产品在无任务、无结果和首次使用时的引导文案。",
    deliverable: "空态文案参考表",
    source: "开放任务池",
    nextAction: "认领后开始整理",
  },
  {
    id: "o-502",
    title: "检查项目空间移动端文字溢出",
    projectId: "p-quanyi",
    project: "全意 AI 工作中枢",
    owner: "待认领",
    collaborators: [],
    due: "8月24日",
    priority: "中",
    status: "todo",
    mode: "human",
    progress: 0,
    description: "对项目概览、任务列表和资产列表进行移动端文字适配检查。",
    deliverable: "问题截图与修正建议",
    source: "开放任务池",
    nextAction: "认领后开始检查",
  },
];

export const experts = [
  { id: "e-1", name: "产品策略专家", desc: "需求拆解、产品路径、MVP 边界", icon: "策", color: "blue", online: true },
  { id: "e-2", name: "视觉设计专家", desc: "设计系统、视觉审查、界面一致性", icon: "视", color: "violet", online: true },
  { id: "e-3", name: "GEO 增长专家", desc: "AI 搜索可见性、问题库、内容策略", icon: "G", color: "green", online: false },
  { id: "e-4", name: "数据分析专家", desc: "指标体系、数据洞察、报告生成", icon: "数", color: "orange", online: true },
];

export const skills = [
  { id: "s-1", name: "客户需求分析", uses: 38, desc: "读取访谈、会议和资料，输出需求与风险。" },
  { id: "s-2", name: "竞品研究", uses: 26, desc: "按产品、工作流和视觉维度形成对比。" },
  { id: "s-3", name: "UI 设计走查", uses: 19, desc: "检查层级、状态、响应式和交付完整性。" },
  { id: "s-4", name: "会议与聊天任务提取", uses: 54, desc: "从企业微信会议和群聊中识别行动项，按负责人通知并等待确认。" },
];
