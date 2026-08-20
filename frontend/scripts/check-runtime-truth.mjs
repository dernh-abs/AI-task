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

const personalAi = between("function AiChat", "function LegacyAiChat");
if (!personalAi.includes("个人 AI 助手 · 暂未开放") || !personalAi.includes("disabled")) {
  throw new Error("未接入的个人 AI 必须明确关闭写入口");
}

for (const route of ["HelpCenter", "KnowledgeSpace", "AssetLibrary", "CapabilityLibrary"]) {
  requireText(`function ${route}(){return <PreviewOnlyPage`, `${route} 必须保持只读预览`);
}

if (!authSource.includes("if(inviteToken)return <ActivationPage") || !authSource.includes("currentUser={user}")) {
  throw new Error("邀请链接必须优先于当前登录态，并显式确认账号切换");
}

if (!authSource.includes("在此设备保持登录") || !apiSource.includes("window.sessionStorage") || !apiSource.includes("persistent=false")) {
  throw new Error("登录凭据必须默认仅保留到浏览器会话，并由用户主动选择长期登录");
}

console.log("运行时真实性检查通过：P0/P1 正式入口未重新接入已知演示写链路。");
