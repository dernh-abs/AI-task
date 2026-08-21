import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../src/auth.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8");

function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`无法定位运行时区段：${start} -> ${end}`);
  return source.slice(from, to);
}

function requireText(text, message) {
  if (!source.includes(text)) throw new Error(message);
}

function forbidText(haystack, text, message) {
  if (haystack.includes(text)) throw new Error(message);
}

forbidText(source, "initialCandidates", "正式入口不得重新引用 initialCandidates");
forbidText(source, "openTasks", "正式入口不得重新引用静态 openTasks");

const board = between("function ProjectBoard", "function LegacyProjectBoard");
requireText("performTaskAction", "看板必须通过服务端任务动作更新状态");
forbidText(board, "setTimeout", "正式看板不得用计时器模拟状态变化");

const projectChat = between("function ProjectChat", "function TaskPool");
for (const api of ["fetchProjectConversations", "fetchProjectChatMessages", "sendProjectChatMessage"]) {
  if (!projectChat.includes(api)) throw new Error(`项目 AI 缺少真实接口：${api}`);
}
forbidText(projectChat, "setTimeout", "项目 AI 不得用固定延时模拟回答");
forbidText(projectChat, "已连接 6 个任务", "项目 AI 不得写死上下文数量");

const agentCenter = between("function AgentCenter", "function LegacyAgentCenter");
if (!agentCenter.includes("fetchAllAgentRuns")) throw new Error("AI 执行中心必须读取真实 AgentRun");
forbidText(agentCenter, "setTasks", "AI 执行中心不得直接修改任务状态");
forbidText(agentCenter, "setTimeout", "AI 执行中心不得模拟运行进度");

const contribution = between("function ContributionPage", "function AgentCenter");
if (!contribution.includes("fetchContributions") || !contribution.includes("visibleContributions")) {
  throw new Error("贡献页必须读取并筛选真实贡献事件");
}
for (const fake of ['value: "6"', 'value: "4"', 'value: "3"', "4 / 8", "品牌视觉规范初稿", "M0 68 C45"]) {
  forbidText(contribution, fake, `贡献页不得包含演示数据：${fake}`);
}
if (!contribution.includes("未接入")) throw new Error("尚无后端来源的贡献指标必须明确标注未接入");

const projectSpace = between("function ProjectSpace", "function ProjectBoard");
for (const fake of ["首页卖点仍待客户确认", "等待产品参数表", "项目周会 · 8月18日", "需求访谈 · 8月12日"]) {
  forbidText(projectSpace, fake, `项目空间不得包含演示业务记录：${fake}`);
}
if (!projectSpace.includes("项目会议暂未接入")) throw new Error("未接入的项目会议必须明确关闭写入口");

const agentAccess = between("function AgentAccess", "function AiChat");
if (!agentAccess.includes("PreviewOnlyPage")) throw new Error("Agent 接入尚无稳定契约时必须保持只读预览");
forbidText(agentAccess, "codex task create", "不得展示不存在的 Agent CLI 命令");
forbidText(agentAccess, "/tasks/candidates", "不得展示与真实后端不一致的 Agent API");

const dashboard = between("function Dashboard", "function TodayTasksDialog");
forbidText(dashboard, 'task.id === "t-101"', "工作台不得优先选择演示任务 ID");
forbidText(dashboard, '{ label: "逾期", value: 0', "逾期数量必须来自真实截止时间");

const createProject = between("function CreateProject", "function CreateStageModal");
if (!createProject.includes("due_at:form.due")) throw new Error("新建项目不得丢弃用户填写的目标日期");
const createTask = between("function CreateTask", "function CandidateReview");
if (!createTask.includes("due_at:form.due")) throw new Error("新建任务不得丢弃用户填写的截止时间");

forbidText(source, 'task.reviewer || "徐泉"', "任务未设置验收人时不得伪造指定人员");
forbidText(source, "Ollama 正在生成", "前端不得把可变的 AI Provider 写死为 Ollama");

const personalAi = between("function AiChat", "function LegacyAiChat");
if (!personalAi.includes("个人 AI 助手 · 暂未开放") || !personalAi.includes("disabled")) {
  throw new Error("未接入的个人 AI 必须明确关闭写入口");
}

for (const route of ["HelpCenter", "AssetLibrary", "CapabilityLibrary"]) {
  requireText(`function ${route}(){return <PreviewOnlyPage`, `${route} 必须保持只读预览`);
}

const knowledgeSpace = between("function KnowledgeSpace", "function LegacyKnowledgeSpace");
if (!knowledgeSpace.includes("fetchWeComStatus") || !knowledgeSpace.includes("createWeComDocument") || !knowledgeSpace.includes("status?.connected")) {
  throw new Error("KnowledgeSpace 必须通过真实企业微信接口检测连接并创建文档");
}

if (!authSource.includes("if(inviteToken)return <ActivationPage") || !authSource.includes("currentUser={user}")) {
  throw new Error("邀请链接必须优先于当前登录态，并显式确认账号切换");
}

if (!authSource.includes("在此设备保持登录") || !apiSource.includes("window.sessionStorage") || !apiSource.includes("persistent=false")) {
  throw new Error("登录凭据必须默认仅保留到浏览器会话，并由用户主动选择长期登录");
}

console.log("运行时真实性检查通过：P0/P1 正式入口未重新接入已知演示写链路。");
