import { useMemo, useState, type ReactNode } from "react";
import {
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  FolderKanban,
  HandHelping,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  SquareKanban,
  TriangleAlert,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { candidateToTask, useStore } from "./store";
import type {
  AiStatus,
  CandidateTask,
  ExecutionMode,
  HelpRequest,
  Task,
  TaskStatus,
} from "./types";

const statusMap: Record<TaskStatus, [string, string]> = {
  CANDIDATE: ["候选", "bg-violet-50 text-violet-700"],
  PENDING_OWNER_CONFIRMATION: ["待员工确认", "bg-amber-50 text-amber-700"],
  TODO: ["待开始", "bg-slate-100 text-slate-600"],
  IN_PROGRESS: ["进行中", "bg-blue-50 text-blue-700"],
  WAITING_EXTERNAL: ["等待外部", "bg-stone-100 text-stone-500"],
  BLOCKED: ["已阻塞", "bg-red-50 text-red-700"],
  WAITING_HUMAN_CONFIRMATION: ["待人工确认", "bg-purple-50 text-purple-700"],
  WAITING_REVIEW: ["待验收", "bg-amber-50 text-amber-700"],
  DONE: ["已完成", "bg-emerald-50 text-emerald-700"],
  CANCELED: ["已取消", "bg-slate-100 text-slate-400"],
};
const modeMap: Record<ExecutionMode, [string, string]> = {
  HUMAN: ["人工", "bg-slate-100 text-slate-600"],
  AI: ["AI 执行", "bg-violet-50 text-violet-700"],
  HYBRID: ["人机协作", "bg-teal-50 text-teal-700"],
};
const aiMap: Record<AiStatus, string> = {
  QUEUED: "排队中",
  RUNNING: "执行中",
  NEEDS_INPUT: "需要信息",
  FAILED: "执行失败",
  SUCCEEDED: "执行完成",
  CANCELED: "已取消",
};
const executable = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "WAITING_HUMAN_CONFIRMATION",
  "WAITING_REVIEW",
];
const Badge = ({
  children,
  tone = "bg-slate-100 text-slate-600",
}: {
  children: ReactNode;
  tone?: string;
}) => (
  <span
    className={clsx(
      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
      tone,
    )}
  >
    {children}
  </span>
);
const StatusBadge = ({ status }: { status: TaskStatus }) => (
  <Badge tone={statusMap[status][1]}>{statusMap[status][0]}</Badge>
);
const ModeBadge = ({ mode }: { mode: ExecutionMode }) => (
  <Badge tone={modeMap[mode][1]}>
    {mode === "AI" && <Sparkles className="mr-1 h-3 w-3" />}
    {modeMap[mode][0]}
  </Badge>
);

function Layout() {
  const { reset, state } = useStore();
  const nav = [
    ["/", "工作台", LayoutDashboard],
    ["/projects", "项目", FolderKanban],
    ["/tasks", "任务", ListTodo],
    ["/help", "求助", CircleHelp],
    ["/contribution", "我的贡献", Trophy],
  ] as const;
  const pending = state.candidates.filter((c) => c.state === "ACTIVE").length;
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 w-[232px] border-r border-white/5 bg-[#08152f] text-white shadow-[12px_0_40px_rgba(8,21,47,.08)]">
        <div className="flex h-24 items-center gap-3 px-5">
          <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-[0_10px_25px_rgba(37,99,235,.35)]">
            <Zap className="h-5 w-5 fill-white/10" />
          </div>
          <div>
            <div className="font-bold tracking-tight">全意 Task OS</div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[.13em] text-blue-200/45">
              AI Native Workspace
            </div>
          </div>
        </div>
        <nav className="space-y-1 px-3">
          {nav.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(
                  "group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm transition",
                  isActive
                    ? "bg-gradient-to-r from-blue-600/90 to-blue-500/70 font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,.2)]"
                    : "text-blue-100/55 hover:bg-white/5 hover:text-white",
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mx-5 my-6 border-t border-white/10" />
        <div className="px-3">
          <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-blue-200/30">
            智能工作流
          </div>
          <NavLink
            to="/candidates"
            className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-blue-100/55 hover:bg-white/5 hover:text-white"
          >
            <Inbox className="h-[18px] w-[18px]" />
            候选任务
            {pending > 0 && (
              <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
                {pending}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/external"
            className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-blue-100/55 hover:bg-white/5 hover:text-white"
          >
            <Clock3 className="h-[18px] w-[18px]" />
            等待外部
          </NavLink>
          <NavLink
            to="/agent/r1"
            className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-blue-100/55 hover:bg-white/5 hover:text-white"
          >
            <Bot className="h-[18px] w-[18px]" />
            AI 执行状态
            <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
          </NavLink>
        </div>
        <div className="absolute bottom-5 left-3 right-3">
          <button
            onClick={() => confirm("确定重置全部 Demo 数据？") && reset()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-blue-100/30 hover:bg-white/5 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
            重置 Demo 数据
          </button>
        </div>
      </aside>
      <div className="pl-[232px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-line/80 bg-white/90 px-8 shadow-[0_1px_12px_rgba(15,23,42,.03)] backdrop-blur-xl">
          <div className="relative w-[min(400px,38vw)]">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-xl border border-transparent bg-slate-100/70 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
              placeholder="搜索任务、项目、成员…"
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary">
              <Plus className="h-4 w-4" />
              创建任务
            </button>
            <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-slate-500 shadow-sm">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
            <div className="mx-1 h-7 w-px bg-line" />
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-md">
                泉
              </div>
              <div>
                <div className="text-sm font-semibold">泉哥</div>
                <div className="text-[10px] font-medium text-slate-400">
                  负责人
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/agent/:id" element={<AgentRun />} />
            <Route path="/external" element={<ExternalWaiting />} />
            <Route path="/help" element={<Help />} />
            <Route path="/contribution" element={<Contribution />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
const PageHead = ({
  eyebrow,
  title,
  desc,
  action,
}: {
  eyebrow?: string;
  title: string;
  desc: string;
  action?: ReactNode;
}) => (
  <div className="mb-8 flex items-end justify-between">
    <div>
      {eyebrow && (
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-forest">
          <span className="h-px w-5 bg-forest" />
          {eyebrow}
        </div>
      )}
      <h1 className="text-[30px] font-bold tracking-[-.035em] text-slate-950">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
    </div>
    {action}
  </div>
);
function TaskCard({ task, onClick }: { task: Task; onClick?: () => void }) {
  const { user, project } = useStore();
  return (
    <button
      onClick={onClick}
      className="panel group relative w-full overflow-hidden p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-float"
    >
      <div className="mb-3 flex items-center justify-between">
        <StatusBadge status={task.status} />
        <MoreHorizontal className="h-4 w-4 text-slate-300 transition group-hover:text-blue-500" />
      </div>
      <div className="font-semibold leading-snug text-slate-900">
        {task.title}
      </div>
      <div className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {project(task.projectId)}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-line pt-3.5">
        <ModeBadge mode={task.mode} />
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-blue-50 font-semibold text-blue-600">
            {user(task.ownerId).slice(-1)}
          </div>
          {task.dueAt}
        </div>
      </div>
    </button>
  );
}
function Dashboard() {
  const { state } = useStore();
  const [detail, setDetail] = useState<Task>();
  const current = state.tasks
    .filter(
      (t) => executable.includes(t.status) && t.status !== "WAITING_REVIEW",
    )
    .slice(0, 4);
  const candidates = state.candidates.filter((c) => c.state === "ACTIVE");
  const attention = state.tasks.filter((t) =>
    ["WAITING_REVIEW", "WAITING_HUMAN_CONFIRMATION"].includes(t.status),
  );
  const stats = [
    [
      "今日可执行",
      state.tasks.filter((t) => executable.includes(t.status)).length,
      ListTodo,
      "from-blue-500 to-blue-600",
      "优先推进",
      "/tasks",
    ],
    [
      "待我确认",
      candidates.length,
      Inbox,
      "from-indigo-500 to-violet-500",
      "需要决策",
      "/candidates",
    ],
    [
      "AI 执行中",
      state.runs.filter((r) => ["RUNNING", "QUEUED"].includes(r.status)).length,
      Bot,
      "from-cyan-500 to-blue-500",
      "自动推进",
      "/agent/r1",
    ],
    [
      "已阻塞",
      state.tasks.filter((t) => t.status === "BLOCKED").length,
      TriangleAlert,
      "from-rose-500 to-red-500",
      "立即关注",
      "/tasks",
    ],
  ] as const;
  return (
    <>
      <section className="mb-7 flex items-center justify-between">
        <div>
          <div className="mb-5 flex items-center gap-3">
            {["Dashboard", "Activity", "AI Flow", "Projects"].map((tab, i) => (
              <span
                key={tab}
                className={clsx(
                  "rounded-full border px-5 py-2 text-xs font-semibold",
                  i === 0
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600",
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          <h1 className="max-w-[620px] text-[48px] font-semibold leading-[1.02] tracking-[-.06em] text-slate-950">
            Smart task orchestration
          </h1>
          <p className="mt-4 max-w-[560px] text-sm leading-6 text-slate-500">
            用 AI 自动拾取候选任务、安排执行节奏，并把需要人工判断的节点清晰呈现出来。
          </p>
        </div>
        <NavLink
          className="inline-flex items-center gap-3 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(37,99,235,.24)]"
          to="/candidates"
        >
          处理候选任务
          <ArrowRight className="h-4 w-4" />
        </NavLink>
      </section>

      <div className="grid grid-cols-[1.02fr_.95fr] gap-7">
        <section className="space-y-5">
          <div className="relative overflow-hidden rounded-[34px] bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,.08)] ring-1 ring-slate-100">
            <div className="absolute right-6 top-6 rotate-12 rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold text-white">
              AI Picking
            </div>
            <div className="flex min-h-[190px] items-end gap-6 rounded-[26px] bg-gradient-to-br from-slate-100 via-blue-50 to-white p-6">
              <div className="grid h-24 w-24 place-items-center rounded-full bg-white shadow-[0_18px_45px_rgba(37,99,235,.16)]">
                <Sparkles className="h-10 w-10 text-blue-600" />
              </div>
              <div className="pb-2">
                <div className="text-[13px] font-semibold text-blue-600">
                  今日任务流
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">
                  {candidates.length + attention.length} 个节点需要你判断
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["#candidate", "#review", "#AI-agent", "#external"].map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm"
                      >
                        {tag}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[.92fr_1fr] gap-5">
            <div className="rounded-[28px] bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,.07)] ring-1 ring-slate-100">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">任务能量</h2>
                <MoreHorizontal className="h-4 w-4 text-slate-400" />
              </div>
              <div className="relative mx-auto grid h-44 w-44 place-items-center">
                <svg className="h-44 w-44 -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="47"
                    fill="none"
                    stroke="#e8edf7"
                    strokeWidth="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="47"
                    fill="none"
                    stroke="#2563eb"
                    strokeDasharray="225 296"
                    strokeLinecap="round"
                    strokeWidth="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="32"
                    fill="none"
                    stroke="#93c5fd"
                    strokeDasharray="118 201"
                    strokeLinecap="round"
                    strokeWidth="8"
                  />
                </svg>
                <div className="absolute text-center">
                  <div className="text-2xl font-bold">68%</div>
                  <div className="text-xs text-slate-400">推进健康度</div>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,.07)] ring-1 ring-slate-100">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-base font-semibold">AI 执行节奏</h2>
                <Badge tone="bg-blue-50 text-blue-700">本周</Badge>
              </div>
              <div className="flex h-40 items-end gap-4 border-b border-slate-100 px-2">
                {[38, 72, 48, 62, 44, 74, 68].map((h, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className={clsx(
                        "w-full rounded-t-full bg-gradient-to-t from-blue-500 to-cyan-300",
                        i === 1 && "shadow-[0_0_0_8px_rgba(37,99,235,.08)]",
                      )}
                      style={{ height: `${h}%` }}
                    />
                    <span className="text-[10px] text-slate-400">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-[34px] bg-[#f4f6fb] p-6 shadow-[inset_0_0_0_1px_rgba(226,232,240,.9)]">
            <div className="grid grid-cols-[1fr_.82fr] gap-5">
              <div className="rounded-[26px] bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold">今日必须处理</h2>
                  <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                    {candidates.length + attention.length} Items
                  </span>
                </div>
                <div className="space-y-3">
                  {candidates.slice(0, 2).map((item) => (
                    <NavLink
                      key={item.id}
                      to="/candidates"
                      className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 transition hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-blue-600">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {item.title}
                        </span>
                        <span className="text-xs text-slate-400">
                          候选任务 · 置信度 {item.confidence}%
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
                    </NavLink>
                  ))}
                  {attention.slice(0, 1).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setDetail(item)}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-blue-600">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {item.title}
                        </span>
                        <span className="text-xs text-slate-400">
                          {statusMap[item.status][0]} · 需要人工判断
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[26px] bg-white p-5 shadow-sm">
                <h2 className="mb-5 text-base font-semibold">态势总览</h2>
                <div className="grid grid-cols-2 gap-3">
                  {stats.map(([l, v, I, , hint, href]) => (
                    <NavLink
                      to={href}
                      key={l}
                      className="rounded-[22px] bg-slate-50 p-4 transition hover:bg-blue-50"
                    >
                      <I className="mb-4 h-5 w-5 text-blue-600" />
                      <div className="text-3xl font-semibold tracking-tight">
                        {v}
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        {l}
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400">
                        {hint}
                      </div>
                    </NavLink>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3 rounded-full bg-white p-2 shadow-sm">
              <span className="rounded-full bg-blue-600 px-8 py-3 text-sm font-semibold text-white">
                Try auto plan
              </span>
              <span className="flex-1 text-center text-sm text-slate-500">
                AI 已将聊天、会议和项目状态整理成今日节奏
              </span>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-white">
                <ArrowRight className="h-5 w-5" />
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[.9fr_1.1fr] gap-5">
            <div className="rounded-[28px] bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,.07)] ring-1 ring-slate-100">
              <h2 className="mb-4 text-base font-semibold">当前工作</h2>
              <div className="space-y-3">
                {current.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDetail(t)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-blue-50"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-blue-600 shadow-sm">
                      <Check className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {t.title}
                      </span>
                      <span className="text-xs text-slate-400">{t.dueAt}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-[28px] bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,.07)] ring-1 ring-slate-100">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-base font-semibold">项目曲线</h2>
                <Badge tone="bg-blue-50 text-blue-700">Pro AI chart</Badge>
              </div>
              <svg viewBox="0 0 360 160" className="h-40 w-full">
                <path
                  d="M8 108 C48 64, 80 62, 112 88 S174 124, 202 78 S256 46, 288 76 S330 114, 352 60"
                  fill="none"
                  stroke="#2563eb"
                  strokeLinecap="round"
                  strokeWidth="5"
                />
                <path
                  d="M8 108 C48 64, 80 62, 112 88 S174 124, 202 78 S256 46, 288 76 S330 114, 352 60"
                  fill="none"
                  stroke="#dbeafe"
                  strokeLinecap="round"
                  strokeWidth="14"
                  className="-z-10"
                />
                {[42, 88, 134, 180, 226, 272, 318].map((x, i) => (
                  <circle
                    key={x}
                    cx={x}
                    cy={i === 4 ? 64 : i === 5 ? 86 : 104}
                    fill={i === 4 ? "#2563eb" : "#fff"}
                    r="7"
                    stroke="#bfdbfe"
                    strokeWidth="4"
                  />
                ))}
              </svg>
            </div>
          </div>
        </section>
      </div>
      {detail && (
        <TaskDrawer taskId={detail.id} close={() => setDetail(undefined)} />
      )}
    </>
  );
}
function Mini({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3.5 last:border-0">
      <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>
        {title}
      </div>
      <span className="text-xs font-bold text-slate-800">{value}</span>
    </div>
  );
}

function Projects() {
  const { state, user } = useStore();
  return (
    <>
      <PageHead
        eyebrow="Projects"
        title="项目"
        desc="查看项目进展、风险与当前可执行工作。"
        action={
          <button className="btn-primary">
            <Plus className="h-4 w-4" />
            新建项目
          </button>
        }
      />
      <div className="grid grid-cols-3 gap-5">
        {state.projects.map((p) => {
          const ts = state.tasks.filter((t) => t.projectId === p.id);
          return (
            <NavLink
              to={`/projects/${p.id}`}
              className="panel overflow-hidden transition hover:-translate-y-1 hover:shadow-lg"
              key={p.id}
            >
              <div className="h-1.5" style={{ background: p.color }} />
              <div className="p-6">
                <div className="mb-5 flex items-start justify-between">
                  <div
                    className="grid h-11 w-11 place-items-center rounded-xl text-white"
                    style={{ background: p.color }}
                  >
                    <BriefcaseBusiness className="h-5 w-5" />
                  </div>
                  <Badge
                    tone={
                      p.risk === "高"
                        ? "bg-red-50 text-red-700"
                        : p.risk === "中"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    }
                  >
                    {p.risk}风险
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 h-10 text-sm text-slate-500">
                  {p.description}
                </p>
                <div className="mt-6">
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-slate-400">{p.stage}</span>
                    <span>{p.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.progress}%`, background: p.color }}
                    />
                  </div>
                </div>
                <div className="mt-5 flex justify-between border-t border-line pt-4 text-xs text-slate-500">
                  <span>{user(p.ownerId)} 负责</span>
                  <span>
                    {ts.filter((t) => executable.includes(t.status)).length}{" "}
                    个当前任务
                  </span>
                </div>
              </div>
            </NavLink>
          );
        })}
      </div>
    </>
  );
}
function ProjectDetail() {
  const { id } = useParams();
  const { state, user } = useStore();
  const [tab, setTab] = useState("概览");
  const p = state.projects.find((x) => x.id === id)!;
  const ts = state.tasks.filter((t) => t.projectId === id);
  const [detail, setDetail] = useState<Task>();
  if (!p) return null;
  return (
    <>
      <NavLink
        to="/projects"
        className="mb-5 inline-flex items-center gap-1 text-sm text-slate-500"
      >
        <ArrowLeft className="h-4 w-4" />
        返回项目
      </NavLink>
      <div className="panel relative mb-6 overflow-hidden p-7">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400" />
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
              <h1 className="text-[26px] font-bold tracking-tight">{p.name}</h1>
              <Badge
                tone={
                  p.risk === "高"
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-700"
                }
              >
                {p.risk}风险
              </Badge>
            </div>
            <p className="text-sm text-slate-500">{p.description}</p>
          </div>
          <button className="btn-primary">
            <Plus className="h-4 w-4" />
            新建任务
          </button>
        </div>
        <div className="mt-7 grid grid-cols-[1fr_1fr_1.35fr_1fr] gap-3 border-t border-line pt-5">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <Activity className="h-3.5 w-3.5 text-blue-500" />
              当前阶段
            </div>
            <div className="font-semibold text-slate-900">{p.stage}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <UserRound className="h-3.5 w-3.5 text-indigo-500" />
              项目负责人
            </div>
            <div className="font-semibold text-slate-900">
              {user(p.ownerId)}
            </div>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>总体进度</span>
              <strong className="text-xl text-blue-700">{p.progress}%</strong>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
                style={{ width: `${p.progress}%` }}
              />
            </div>
            <div className="mt-2 text-[10px] text-blue-500">
              正在推进 · {p.stage}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <ListTodo className="h-3.5 w-3.5 text-cyan-600" />
              当前任务
            </div>
            <div className="text-xl font-bold text-slate-900">
              {ts.filter((t) => executable.includes(t.status)).length}
              <span className="ml-1 text-xs font-medium text-slate-400">
                个
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="mb-5 flex gap-1 border-b border-line">
        {["概览", "任务", "阶段", "决策与会议", "成员与外部", "贡献"].map(
          (t) => (
            <button
              onClick={() => setTab(t)}
              key={t}
              className={clsx(
                "border-b-2 px-4 py-3 text-sm",
                tab === t
                  ? "border-forest font-medium text-forest"
                  : "border-transparent text-slate-500",
              )}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {tab === "概览" || tab === "任务" ? (
        <div className="grid grid-cols-[1.6fr_.8fr] gap-5">
          <div>
            <h2 className="mb-3 section-title">当前可执行</h2>
            <div className="grid grid-cols-2 gap-3">
              {ts
                .filter((t) => executable.includes(t.status))
                .map((t) => (
                  <TaskCard key={t.id} task={t} onClick={() => setDetail(t)} />
                ))}
            </div>
          </div>
          <div>
            <h2 className="mb-3 section-title">等待外部</h2>
            <div className="space-y-3">
              {ts
                .filter((t) => t.status === "WAITING_EXTERNAL")
                .map((t) => (
                  <TaskCard key={t.id} task={t} onClick={() => setDetail(t)} />
                ))}
            </div>
            <h2 className="mb-3 mt-6 section-title">最近决策</h2>
            <div className="panel p-4 text-sm">
              <div className="font-medium">Beta 版本保持人工验收</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                核心输出在交付前由项目负责人统一确认。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <Empty label={tab} />
      )}{" "}
      {detail && (
        <TaskDrawer taskId={detail.id} close={() => setDetail(undefined)} />
      )}
    </>
  );
}
const Meta = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs text-slate-400">{label}</div>
    <div className="mt-1 text-sm font-medium">{value}</div>
  </div>
);
const Empty = ({ label }: { label: string }) => (
  <div className="panel grid h-64 place-items-center text-center">
    <div>
      <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
      <div className="font-medium">{label}</div>
      <div className="mt-1 text-sm text-slate-400">
        Demo 中展示该模块的信息结构。
      </div>
    </div>
  </div>
);

function Tasks() {
  const { state } = useStore();
  const [filter, setFilter] = useState("当前可执行");
  const [view, setView] = useState<"list" | "board">("list");
  const [detail, setDetail] = useState<Task>();
  const fs =
    filter === "当前可执行"
      ? state.tasks.filter((t) => executable.includes(t.status))
      : filter === "等待外部"
        ? state.tasks.filter((t) => t.status === "WAITING_EXTERNAL")
        : filter === "AI执行中"
          ? state.tasks.filter((t) => t.agentRunId)
          : filter === "待验收"
            ? state.tasks.filter((t) =>
                ["WAITING_REVIEW", "WAITING_HUMAN_CONFIRMATION"].includes(
                  t.status,
                ),
              )
            : state.tasks.filter((t) => t.status === "DONE");
  return (
    <>
      <PageHead
        eyebrow="My tasks"
        title="我的任务"
        desc="聚焦当前可推进的工作，等待外部事项保持低打扰。"
      />
      <div className="mb-5 flex items-center justify-between">
        <div className="flex gap-2">
          {["当前可执行", "等待外部", "AI执行中", "待验收", "已完成"].map(
            (x) => (
              <button
                key={x}
                onClick={() => setFilter(x)}
                className={clsx(
                  "rounded-xl px-4 py-2 text-sm",
                  filter === x
                    ? "bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,.2)]"
                    : "border border-line bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600",
                )}
              >
                {x}
              </button>
            ),
          )}
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1">
          <button
            onClick={() => setView("list")}
            className={clsx("rounded-lg p-2", view === "list" && "bg-canvas")}
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("board")}
            className={clsx("rounded-lg p-2", view === "board" && "bg-canvas")}
          >
            <SquareKanban className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className={clsx(
          "grid gap-4",
          view === "list" ? "grid-cols-3" : "grid-cols-4",
        )}
      >
        {fs.map((t) => (
          <TaskCard task={t} key={t.id} onClick={() => setDetail(t)} />
        ))}
      </div>
      {!fs.length && <Empty label="暂无任务" />}
      {detail && (
        <TaskDrawer taskId={detail.id} close={() => setDetail(undefined)} />
      )}
    </>
  );
}

function Candidates() {
  const { state, setState, user, project } = useStore();
  const active = state.candidates.filter((c) => c.state === "ACTIVE");
  const [selected, setSelected] = useState(active[0]?.id);
  const [editing, setEditing] = useState<CandidateTask>();
  const c = state.candidates.find((x) => x.id === selected);
  const mark = (id: string, state2: CandidateTask["state"]) =>
    setState((s) => ({
      ...s,
      candidates: s.candidates.map((x) =>
        x.id === id ? { ...x, state: state2 } : x,
      ),
    }));
  const create = (v: CandidateTask) =>
    setState((s) => ({
      ...s,
      candidates: s.candidates.map((x) =>
        x.id === v.id ? { ...v, state: "CREATED" } : x,
      ),
      tasks: [candidateToTask(v), ...s.tasks],
    }));
  return (
    <>
      <PageHead
        eyebrow="AI Capture"
        title="候选任务中心"
        desc="AI 自动拾取工作信号，由你确认后才会创建正式任务。"
        action={
          <Badge tone="bg-violet-50 text-violet-700">
            {active.length} 条待确认
          </Badge>
        }
      />
      <div className="grid min-h-[660px] grid-cols-[420px_1fr] overflow-hidden rounded-2xl border border-line bg-white">
        <div className="border-r border-line bg-[#fbfcfb]">
          <div className="border-b border-line p-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="input pl-10" placeholder="搜索候选任务" />
            </div>
          </div>
          <div className="scrollbar max-h-[590px] overflow-auto">
            {active.map((x) => (
              <button
                key={x.id}
                onClick={() => setSelected(x.id)}
                className={clsx(
                  "w-full border-b border-line p-4 text-left",
                  selected === x.id ? "bg-mint/60" : "hover:bg-canvas",
                )}
              >
                <div className="mb-2 flex justify-between">
                  <Badge
                    tone={
                      x.sourceType === "会议"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-violet-50 text-violet-700"
                    }
                  >
                    {x.sourceType}
                  </Badge>
                  <span className="text-xs text-slate-400">{x.detectedAt}</span>
                </div>
                <div className="font-medium">{x.title}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{x.initiator}</span>
                  <span className="text-forest">置信度 {x.confidence}%</span>
                </div>
                {x.missing.length > 0 && (
                  <div className="mt-2 text-xs text-amber-600">
                    缺少：{x.missing.join("、")}
                  </div>
                )}
              </button>
            ))}
            {!active.length && (
              <div className="p-10 text-center text-sm text-slate-400">
                候选任务已全部处理
              </div>
            )}
          </div>
        </div>
        {c ? (
          <div className="scrollbar max-h-[660px] overflow-auto p-7">
            <div className="flex justify-between">
              <div>
                <div className="mb-2 flex gap-2">
                  <Badge tone="bg-violet-50 text-violet-700">AI 提取</Badge>
                  {c.isMeeting && (
                    <Badge tone="bg-blue-50 text-blue-700">
                      会议负责人确认
                    </Badge>
                  )}
                </div>
                <h2 className="text-xl font-semibold">{c.title}</h2>
              </div>
              <button>
                <MoreHorizontal className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="mt-6 rounded-xl border border-line bg-canvas p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                <MessageSquare className="h-4 w-4" />
                原始来源 · {c.sourceType}
              </div>
              <p className="text-sm leading-6 text-slate-600">{c.sourceText}</p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-5">
              <Meta label="推荐项目" value={project(c.projectId)} />
              <Meta label="推荐负责人" value={user(c.ownerId)} />
              <Meta label="推荐截止时间" value={c.dueAt} />
              <div>
                <div className="text-xs text-slate-400">执行模式</div>
                <div className="mt-1">
                  <ModeBadge mode={c.mode} />
                </div>
              </div>
            </div>
            {[
              ["背景", c.background],
              ["目标", c.objective],
              ["交付物", c.deliverable],
              ["验收标准", c.acceptance || "尚未补全"],
            ].map(([a, b]) => (
              <div className="mt-5" key={a}>
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                  {a}
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600">
                    AI 补全
                  </span>
                </div>
                <p className="text-sm leading-6">{b}</p>
              </div>
            ))}
            <div className="mt-7 flex flex-wrap gap-2 border-t border-line pt-5">
              <button onClick={() => create(c)} className="btn-primary">
                <Check className="h-4 w-4" />
                {c.isMeeting ? "确认下发" : "确认创建"}
              </button>
              <button onClick={() => setEditing(c)} className="btn-secondary">
                修改后创建
              </button>
              <button
                onClick={() => {
                  mark(c.id, "CREATED");
                  alert("已关联到现有任务上下文");
                }}
                className="btn-secondary"
              >
                关联已有任务
              </button>
              <button
                onClick={() => mark(c.id, "STASHED")}
                className="btn-secondary"
              >
                暂存
              </button>
              <button
                onClick={() => mark(c.id, "IGNORED")}
                className="btn-secondary text-slate-400"
              >
                忽略
              </button>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center text-slate-400">
            选择一条候选任务
          </div>
        )}
      </div>
      {editing && (
        <ConfirmDrawer
          candidate={editing}
          close={() => setEditing(undefined)}
          submit={(v) => {
            create(v);
            setEditing(undefined);
          }}
        />
      )}
    </>
  );
}

function ConfirmDrawer({
  candidate,
  close,
  submit,
}: {
  candidate: CandidateTask;
  close: () => void;
  submit: (c: CandidateTask) => void;
}) {
  const { state } = useStore();
  const [v, setV] = useState(candidate);
  const [edited, setEdited] = useState<string[]>([]);
  const set = (k: keyof CandidateTask, val: unknown) => {
    setV((x) => ({ ...x, [k]: val }));
    setEdited((x) => [...x, String(k)]);
  };
  return (
    <Drawer
      title="确认候选任务"
      subtitle="检查 AI 补全信息，修改后标记将消失。"
      close={close}
    >
      <div className="space-y-4">
        <Field label="标题" ai={!edited.includes("title")}>
          <input
            className="input"
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="项目" ai={!edited.includes("projectId")}>
            <select
              className="input"
              value={v.projectId}
              onChange={(e) => set("projectId", e.target.value)}
            >
              {state.projects.map((p) => (
                <option value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="负责人" ai={!edited.includes("ownerId")}>
            <select
              className="input"
              value={v.ownerId}
              onChange={(e) => set("ownerId", e.target.value)}
            >
              {state.users.map((u) => (
                <option value={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>
        </div>
        {(
          ["background", "objective", "deliverable", "acceptance"] as const
        ).map((k) => (
          <Field
            key={k}
            label={
              {
                background: "背景",
                objective: "目标",
                deliverable: "交付物",
                acceptance: "验收标准",
              }[k]
            }
            ai={!edited.includes(k)}
          >
            <textarea
              className="input min-h-20 resize-none"
              value={v[k]}
              onChange={(e) => set(k, e.target.value)}
            />
          </Field>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Field label="执行模式" ai={!edited.includes("mode")}>
            <select
              className="input"
              value={v.mode}
              onChange={(e) => set("mode", e.target.value)}
            >
              <option value="HUMAN">人工</option>
              <option value="AI">AI执行</option>
              <option value="HYBRID">人机协作</option>
            </select>
          </Field>
          <Field label="截止时间" ai={!edited.includes("dueAt")}>
            <input
              type="date"
              className="input"
              value={v.dueAt}
              onChange={(e) => set("dueAt", e.target.value)}
            />
          </Field>
        </div>
        <button onClick={() => submit(v)} className="btn-primary w-full">
          确认并创建任务
        </button>
      </div>
    </Drawer>
  );
}
const Field = ({
  label,
  ai,
  children,
}: {
  label: string;
  ai?: boolean;
  children: ReactNode;
}) => (
  <label>
    <span className="label flex items-center gap-2">
      {label}
      {ai && (
        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600">
          AI
        </span>
      )}
    </span>
    {children}
  </label>
);
function Drawer({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[2px]"
      onMouseDown={close}
    >
      <aside
        onMouseDown={(e) => e.stopPropagation()}
        className="scrollbar absolute inset-y-0 right-0 w-[540px] overflow-auto border-l border-white/70 bg-[#f7f9fc] shadow-[-24px_0_70px_rgba(15,23,42,.16)]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-line bg-white/95 px-7 py-6 backdrop-blur-xl">
          <div>
            <div className="mb-2 h-1 w-8 rounded-full bg-blue-600" />
            <h2 className="max-w-[400px] text-xl font-bold tracking-tight text-slate-950">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1.5 text-xs font-medium text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={close}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-7">{children}</div>
      </aside>
    </div>
  );
}

function TaskDrawer({ taskId, close }: { taskId: string; close: () => void }) {
  const { state, setState, user, project } = useStore();
  const t = state.tasks.find((x) => x.id === taskId);
  const [external, setExternal] = useState(false);
  const [ext, setExt] = useState({
    contactId: "c1",
    item: "",
    followupId: "u4",
    expectedAt: "",
    noExpectedTime: false,
  });
  if (!t) return null;
  const update = (p: Partial<Task>) =>
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, ...p } : x)),
    }));
  const goExternal = () => {
    if (!ext.item || (!ext.expectedAt && !ext.noExpectedTime)) {
      alert("请填写等待事项，并设置预计回复时间或选择暂无预计时间");
      return;
    }
    update({
      status: "WAITING_EXTERNAL",
      external: { ...ext, lastUpdate: new Date().toISOString().slice(0, 10) },
    });
    setExternal(false);
  };
  return (
    <Drawer
      title={t.title}
      subtitle={`${project(t.projectId)} · ${t.source}`}
      close={close}
    >
      <div className="mb-5 flex gap-2 rounded-2xl border border-line bg-white p-3 shadow-sm">
        <StatusBadge status={t.status} />
        <ModeBadge mode={t.mode} />
        <Badge>{t.priority}优先级</Badge>
      </div>
      {t.meetingStage === "EMPLOYEE_CONFIRM" && (
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="font-medium text-blue-800">
            会议任务待员工确认接收
          </div>
          <p className="mt-1 text-xs text-blue-600">
            负责人已确认下发，请反馈是否可以按计划执行。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() =>
                update({ status: "TODO", meetingStage: "ACCEPTED" })
              }
              className="btn-primary"
            >
              确认接收
            </button>
            <button
              onClick={() => update({ meetingStage: "RETURNED" })}
              className="btn-secondary"
            >
              退回补充
            </button>
            <button
              onClick={() => update({ meetingStage: "RESCHEDULE" })}
              className="btn-secondary"
            >
              申请调期
            </button>
            <button
              onClick={() =>
                update({ status: "CANCELED", meetingStage: "ERROR" })
              }
              className="btn-secondary"
            >
              识别错误
            </button>
          </div>
        </div>
      )}
      {t.agentRunId && (
        <NavLink
          to={`/agent/${t.agentRunId}`}
          className="group mb-5 flex items-center justify-between rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 text-blue-700 transition hover:border-blue-200 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-medium">查看 AI 执行详情</div>
              <div className="text-xs text-violet-500">
                步骤、日志、文件和人工确认
              </div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </NavLink>
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        {[
          ["背景", t.background],
          ["目标", t.objective],
          ["交付物", t.deliverable],
          ["验收标准", t.acceptance],
        ].map(([a, b]) => (
          <div
            key={a}
            className="grid grid-cols-[76px_1fr] gap-4 border-b border-line px-5 py-4 last:border-0"
          >
            <div className="pt-0.5 text-xs font-semibold text-slate-400">
              {a}
            </div>
            <p className="text-sm leading-6 text-slate-700">{b}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="border-b border-r border-line p-4">
          <Meta label="负责人" value={user(t.ownerId)} />
        </div>
        <div className="border-b border-line p-4">
          <Meta label="截止时间" value={t.dueAt || "未设置"} />
        </div>
        <div className="border-r border-line p-4">
          <Meta label="基础积分" value={`${t.points} 分`} />
        </div>
        <div className="p-4">
          <Meta label="验收人" value={user(t.reviewerId || "u1")} />
        </div>
      </div>
      {t.status === "WAITING_EXTERNAL" && t.external ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="font-medium">等待：{t.external.item}</div>
          <p className="mt-1 text-xs text-slate-500">
            {state.contacts.find((c) => c.id === t.external?.contactId)?.name} ·{" "}
            {t.external.noExpectedTime
              ? "未设置提醒"
              : `预计 ${t.external.expectedAt}`}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() =>
                update({ status: "IN_PROGRESS", external: undefined })
              }
              className="btn-primary"
            >
              收到反馈并恢复
            </button>
            <button
              onClick={() => {
                update({ status: "DONE" });
                alert("事项已结束");
              }}
              className="btn-secondary"
            >
              事项结束
            </button>
            <button
              onClick={() => {
                setState((s) => ({
                  ...s,
                  tasks: [
                    {
                      ...t,
                      id: `t${Date.now()}`,
                      title: `后续：${t.title}`,
                      status: "TODO",
                      external: undefined,
                    },
                    ...s.tasks.map((x) =>
                      x.id === t.id ? { ...x, status: "DONE" as const } : x,
                    ),
                  ],
                }));
                close();
              }}
              className="btn-secondary"
            >
              创建后续任务
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <button
            onClick={() => setExternal(!external)}
            className="btn-secondary"
          >
            <ExternalLink className="h-4 w-4" />
            转等待外部
          </button>
        </div>
      )}
      {external && (
        <div className="mt-4 space-y-3 rounded-xl border border-line p-4">
          <Field label="外部联系人">
            <select
              className="input"
              value={ext.contactId}
              onChange={(e) => setExt({ ...ext, contactId: e.target.value })}
            >
              {state.contacts.map((c) => (
                <option value={c.id}>
                  {c.name} · {c.company}
                </option>
              ))}
            </select>
          </Field>
          <Field label="等待事项">
            <input
              className="input"
              value={ext.item}
              onChange={(e) => setExt({ ...ext, item: e.target.value })}
            />
          </Field>
          <Field label="内部跟进人">
            <select
              className="input"
              value={ext.followupId}
              onChange={(e) => setExt({ ...ext, followupId: e.target.value })}
            >
              {state.users.map((u) => (
                <option value={u.id}>{u.name}</option>
              ))}
            </select>
          </Field>
          <Field label="预计回复时间">
            <input
              disabled={ext.noExpectedTime}
              type="date"
              className="input"
              value={ext.expectedAt}
              onChange={(e) => setExt({ ...ext, expectedAt: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ext.noExpectedTime}
              onChange={(e) =>
                setExt({
                  ...ext,
                  noExpectedTime: e.target.checked,
                  expectedAt: "",
                })
              }
            />
            特殊事项，暂无预计时间（不自动提醒）
          </label>
          <button onClick={goExternal} className="btn-primary w-full">
            确认进入等待外部
          </button>
        </div>
      )}
      {["WAITING_REVIEW", "WAITING_HUMAN_CONFIRMATION"].includes(t.status) && (
        <div className="mt-6 flex gap-2 border-t border-line pt-5">
          <button
            onClick={() => {
              update({ status: "DONE" });
              setState((s) => ({
                ...s,
                contributions: [
                  ...s.contributions,
                  {
                    id: `n${Date.now()}`,
                    userId: t.ownerId,
                    type: "完成任务",
                    description: t.title,
                    points: t.points,
                    date: new Date().toISOString().slice(0, 10),
                  },
                ],
              }));
            }}
            className="btn-primary"
          >
            <CheckCircle2 className="h-4 w-4" />
            验收通过并完成
          </button>
          <button
            onClick={() => update({ status: "IN_PROGRESS" })}
            className="btn-secondary"
          >
            退回修改
          </button>
        </div>
      )}
    </Drawer>
  );
}

function AgentRun() {
  const { id } = useParams();
  const { state, setState, user, project } = useStore();
  const run = state.runs.find((x) => x.id === id);
  if (!run) return <Empty label="执行记录不存在" />;
  const t = state.tasks.find((x) => x.id === run.taskId)!;
  const agent = state.agents.find((x) => x.id === run.agentId)!;
  const update = (p: Partial<typeof run>) =>
    setState((s) => ({
      ...s,
      runs: s.runs.map((x) => (x.id === run.id ? { ...x, ...p } : x)),
    }));
  const advance = () => {
    if (run.status === "QUEUED")
      update({
        status: "RUNNING",
        progress: 32,
        step: "读取任务上下文",
        logs: [...run.logs, "开始执行并读取任务上下文"],
      });
    else if (run.status === "RUNNING") {
      update({
        status: "SUCCEEDED",
        progress: 100,
        step: "已提交结果",
        logs: [...run.logs, "执行完成，结果已提交人工确认"],
        files: [...run.files, "execution-result.md"],
      });
      setState((s) => ({
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === t.id
            ? {
                ...x,
                status: "WAITING_HUMAN_CONFIRMATION",
                result: "AI 已生成执行结果与说明。",
              }
            : x,
        ),
      }));
    }
  };
  return (
    <>
      <NavLink
        to="/tasks"
        className="mb-5 inline-flex items-center gap-1 text-sm text-slate-500"
      >
        <ArrowLeft className="h-4 w-4" />
        返回任务
      </NavLink>
      <PageHead
        eyebrow="Agent run"
        title={t.title}
        desc={`${project(t.projectId)} · ${user(t.ownerId)} 负责`}
      />
      <div className="panel mb-5 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold">{agent.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                {aiMap[run.status]} · {run.step}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {["RUNNING", "QUEUED"].includes(run.status) && (
              <>
                <button
                  onClick={() =>
                    update({ status: "NEEDS_INPUT", step: "等待人工补充" })
                  }
                  className="btn-secondary"
                >
                  <Pause className="h-4 w-4" />
                  暂停
                </button>
                <button
                  onClick={() => update({ status: "CANCELED", step: "已取消" })}
                  className="btn-secondary"
                >
                  取消
                </button>
              </>
            )}
            <button
              onClick={advance}
              disabled={run.status === "SUCCEEDED"}
              className="btn-primary"
            >
              <Play className="h-4 w-4" />
              {run.status === "QUEUED"
                ? "开始执行"
                : run.status === "RUNNING"
                  ? "模拟完成"
                  : "已完成"}
            </button>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-xs">
            <span>执行进度</span>
            <span>{run.progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-violet"
              style={{ width: `${run.progress}%` }}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[1.4fr_.8fr] gap-5">
        <div className="panel p-6">
          <h2 className="section-title">执行时间线</h2>
          <div className="mt-5 space-y-5">
            {run.logs.map((l, i) => (
              <div className="flex gap-3" key={i}>
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet" />
                <div>
                  <div className="text-sm">{l}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    步骤 {i + 1}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div className="panel p-5">
            <h2 className="section-title">生成文件</h2>
            <div className="mt-3 space-y-2">
              {run.files.map((f) => (
                <div className="flex items-center gap-2 rounded-lg bg-canvas p-3 text-sm">
                  <FileText className="h-4 w-4 text-violet-600" />
                  {f}
                </div>
              ))}
              {!run.files.length && (
                <p className="text-sm text-slate-400">暂无文件</p>
              )}
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="section-title">人工操作</h2>
            <div className="mt-3 space-y-2">
              <button
                onClick={() =>
                  update({ status: "RUNNING", step: "已补充信息，继续执行" })
                }
                className="btn-secondary w-full"
              >
                补充信息
              </button>
              <button
                onClick={() =>
                  update({ agentId: run.agentId === "a1" ? "a2" : "a1" })
                }
                className="btn-secondary w-full"
              >
                切换 Agent
              </button>
              <button
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    tasks: s.tasks.map((x) =>
                      x.id === t.id
                        ? { ...x, mode: "HUMAN", status: "TODO" }
                        : x,
                    ),
                    runs: s.runs.map((x) =>
                      x.id === run.id ? { ...x, status: "CANCELED" } : x,
                    ),
                  }))
                }
                className="btn-secondary w-full"
              >
                转人工执行
              </button>
              {run.status === "FAILED" && (
                <button
                  onClick={() =>
                    update({
                      status: "RUNNING",
                      step: "重新执行",
                      progress: 20,
                    })
                  }
                  className="btn-primary w-full"
                >
                  <RefreshCw className="h-4 w-4" />
                  重试
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ExternalWaiting() {
  const { state, user } = useStore();
  const items = state.tasks.filter((t) => t.status === "WAITING_EXTERNAL");
  const group = (t: Task) => {
    if (t.external?.noExpectedTime || !t.external?.expectedAt)
      return "正常等待";
    const diff =
      (new Date(t.external.expectedAt).getTime() - Date.now()) / 86400000;
    return diff < 0 ? "已逾期" : diff <= 1 ? "临近到期" : "正常等待";
  };
  return (
    <>
      <PageHead
        eyebrow="External waiting"
        title="等待外部"
        desc="降低日常注意力噪音，只在临期和逾期时提升提醒。"
      />
      {["已逾期", "临近到期", "正常等待"].map((g) => (
        <section className="mb-7" key={g}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="section-title">{g}</h2>
            <Badge
              tone={
                g === "已逾期"
                  ? "bg-red-50 text-red-700"
                  : g === "临近到期"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-stone-100 text-stone-500"
              }
            >
              {items.filter((t) => group(t) === g).length}
            </Badge>
          </div>
          <div className="panel divide-y divide-line">
            {items
              .filter((t) => group(t) === g)
              .map((t) => {
                const c = state.contacts.find(
                  (c) => c.id === t.external?.contactId,
                );
                return (
                  <div className="grid grid-cols-[1.4fr_.7fr_.7fr_.8fr_.6fr] items-center gap-4 p-4">
                    <div>
                      <div className="text-sm font-medium">
                        {t.external?.item}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {t.title}
                      </div>
                    </div>
                    <div className="text-sm">
                      {c?.name}
                      <div className="text-xs text-slate-400">{c?.company}</div>
                    </div>
                    <div className="text-sm">
                      {user(t.external?.followupId)}
                    </div>
                    <div className="text-sm text-slate-500">
                      {t.external?.noExpectedTime
                        ? "未设置提醒"
                        : t.external?.expectedAt}
                    </div>
                    <Badge
                      tone={
                        g === "已逾期"
                          ? "bg-red-50 text-red-700"
                          : g === "临近到期"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-stone-100 text-stone-500"
                      }
                    >
                      {g}
                    </Badge>
                  </div>
                );
              })}
            {!items.some((t) => group(t) === g) && (
              <div className="p-6 text-center text-sm text-slate-400">
                暂无事项
              </div>
            )}
          </div>
        </section>
      ))}
    </>
  );
}

function Help() {
  const { state, setState, user } = useStore();
  const [newHelp, setNewHelp] = useState(false);
  const [answering, setAnswering] = useState<string>();
  const [answer, setAnswer] = useState("");
  const act = (
    id: string,
    status: HelpRequest["status"],
    extra: Partial<HelpRequest> = {},
  ) =>
    setState((s) => ({
      ...s,
      helps: s.helps.map((h) => (h.id === id ? { ...h, status, ...extra } : h)),
    }));
  const resolve = (h: HelpRequest) =>
    setState((s) => ({
      ...s,
      helps: s.helps.map((x) =>
        x.id === h.id ? { ...x, status: "RESOLVED" } : x,
      ),
      contributions: [
        ...s.contributions,
        {
          id: `n${Date.now()}`,
          userId: "u2",
          type: "解决求助",
          description: h.question,
          points: 5,
          date: new Date().toISOString().slice(0, 10),
        },
        {
          id: `k${Date.now()}`,
          userId: "u2",
          type: "知识沉淀",
          description: `知识草稿：${h.question}`,
          points: 3,
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    }));
  return (
    <>
      <PageHead
        eyebrow="Help & knowledge"
        title="求助中心"
        desc="先由 AI 检索回答，无法解决时再匹配内部专家。"
        action={
          <button onClick={() => setNewHelp(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            发布求助
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-5">
        {state.helps.map((h) => (
          <div className="panel p-5" key={h.id}>
            <div className="flex justify-between">
              <Badge
                tone={
                  h.urgency === "紧急"
                    ? "bg-red-50 text-red-700"
                    : "bg-slate-100 text-slate-600"
                }
              >
                {h.urgency}
              </Badge>
              <Badge
                tone={
                  h.status === "RESOLVED"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-blue-50 text-blue-700"
                }
              >
                {
                  {
                    AI_ANSWERED: "AI 已回答",
                    NEEDS_EXPERT: "待专家回答",
                    HUMAN_ANSWERED: "人工已回答",
                    RESOLVED: "已解决",
                  }[h.status]
                }
              </Badge>
            </div>
            <h3 className="mt-4 font-semibold">{h.question}</h3>
            <div className="mt-4 rounded-xl bg-violet-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-violet-700">
                <Sparkles className="h-4 w-4" />
                AI 初步回答
              </div>
              <p className="text-sm leading-6 text-slate-600">{h.aiAnswer}</p>
            </div>
            {h.humanAnswer && (
              <div className="mt-3 rounded-xl bg-mint p-4">
                <div className="mb-2 text-xs font-medium text-forest">
                  人工回答
                </div>
                <p className="text-sm">{h.humanAnswer}</p>
              </div>
            )}
            <div className="mt-4 text-xs text-slate-400">
              推荐回答者：{h.recommended.map(user).join("、")}
            </div>
            {h.status === "AI_ANSWERED" && (
              <div className="mt-4 flex gap-2">
                <button onClick={() => resolve(h)} className="btn-primary">
                  已解决
                </button>
                <button
                  onClick={() => act(h.id, "NEEDS_EXPERT")}
                  className="btn-secondary"
                >
                  未解决，推荐成员
                </button>
              </div>
            )}
            {h.status === "NEEDS_EXPERT" && (
              <button
                onClick={() => setAnswering(h.id)}
                className="btn-primary mt-4"
              >
                <HandHelping className="h-4 w-4" />
                人工回答
              </button>
            )}
            {h.status === "HUMAN_ANSWERED" && (
              <button onClick={() => resolve(h)} className="btn-primary mt-4">
                标记解决并沉淀知识
              </button>
            )}
          </div>
        ))}
      </div>
      {newHelp && <NewHelp close={() => setNewHelp(false)} />}{" "}
      {answering && (
        <Drawer title="提交人工回答" close={() => setAnswering(undefined)}>
          <textarea
            className="input min-h-40"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="输入可执行、可沉淀的回答…"
          />
          <button
            onClick={() => {
              act(answering, "HUMAN_ANSWERED", {
                humanAnswer:
                  answer ||
                  "建议先按小范围验证方案执行，并在验收后更新知识条目。",
              });
              setAnswering(undefined);
              setAnswer("");
            }}
            className="btn-primary mt-4 w-full"
          >
            提交回答
          </button>
        </Drawer>
      )}
    </>
  );
}
function NewHelp({ close }: { close: () => void }) {
  const { state, setState } = useStore();
  const [v, setV] = useState({
    question: "",
    taskId: "t1",
    attempted: "",
    urgency: "普通" as "普通" | "紧急",
  });
  return (
    <Drawer
      title="发布求助"
      subtitle="AI 会先补全背景并检索历史知识。"
      close={close}
    >
      <div className="space-y-4">
        <Field label="问题">
          <textarea
            className="input min-h-28"
            value={v.question}
            onChange={(e) => setV({ ...v, question: e.target.value })}
          />
        </Field>
        <Field label="所属任务">
          <select
            className="input"
            value={v.taskId}
            onChange={(e) => setV({ ...v, taskId: e.target.value })}
          >
            {state.tasks.map((t) => (
              <option value={t.id}>{t.title}</option>
            ))}
          </select>
        </Field>
        <Field label="已尝试方案">
          <textarea
            className="input min-h-24"
            value={v.attempted}
            onChange={(e) => setV({ ...v, attempted: e.target.value })}
          />
        </Field>
        <Field label="紧急程度">
          <select
            className="input"
            value={v.urgency}
            onChange={(e) =>
              setV({ ...v, urgency: e.target.value as "普通" | "紧急" })
            }
          >
            <option>普通</option>
            <option>紧急</option>
          </select>
        </Field>
        <button
          onClick={() => {
            if (!v.question || !v.attempted)
              return alert("请填写问题和已尝试方案");
            setState((s) => ({
              ...s,
              helps: [
                {
                  id: `h${Date.now()}`,
                  ...v,
                  status: "AI_ANSWERED",
                  aiAnswer:
                    "AI 已检索历史知识：建议先明确问题边界、当前阻塞与期望结果，再进行小范围验证。",
                  recommended: ["u2", "u5"],
                },
                ...s.helps,
              ],
            }));
            close();
          }}
          className="btn-primary w-full"
        >
          发布并获取 AI 初答
        </button>
      </div>
    </Drawer>
  );
}

function Contribution() {
  const { state, user } = useStore();
  const total = state.contributions.reduce((a, b) => a + b.points, 0);
  const stats = [
    ["本周积分", total, Trophy],
    [
      "完成任务",
      state.contributions.filter((x) => x.type === "完成任务").length,
      CheckCircle2,
    ],
    [
      "解决求助",
      state.contributions.filter((x) => x.type === "解决求助").length,
      HandHelping,
    ],
    [
      "知识沉淀",
      state.contributions.filter((x) => x.type === "知识沉淀").length,
      FileText,
    ],
  ] as const;
  const achievements = [
    ["推进者", Zap, "bg-blue-50 text-blue-600", "连续推动关键任务"],
    [
      "答疑伙伴",
      HandHelping,
      "bg-emerald-50 text-emerald-600",
      "帮助同事解决问题",
    ],
    ["知识共建", FileText, "bg-amber-50 text-amber-600", "沉淀可复用知识"],
    ["AI 协作者", Bot, "bg-violet-50 text-violet-600", "高效使用 AI Agent"],
  ] as const;
  return (
    <>
      <PageHead
        eyebrow="Contribution"
        title="我的贡献"
        desc="记录明确的推进行为，不做强竞争排名，也不绑定绩效。"
      />
      <div className="grid grid-cols-4 gap-4">
        {stats.map(([a, b, I]) => (
          <div className="panel p-5">
            <I className="mb-4 h-5 w-5 text-forest" />
            <div className="text-2xl font-semibold">
              {b}
              {a === "本周积分" ? " 分" : ""}
            </div>
            <div className="mt-1 text-xs text-slate-500">{a}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-[1.4fr_.7fr] gap-5">
        <div className="panel p-6">
          <h2 className="section-title">贡献记录</h2>
          <div className="mt-4 divide-y divide-line">
            {[...state.contributions].reverse().map((n) => (
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-mint text-sm text-forest">
                    {user(n.userId).slice(-1)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{n.description}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {n.type} · {n.date}
                    </div>
                  </div>
                </div>
                <span className="font-semibold text-forest">+{n.points}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="panel p-6">
            <h2 className="section-title">成就徽章</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {achievements.map(([name, Icon, tone, desc]) => (
                <div
                  key={name}
                  className="group rounded-2xl border border-transparent bg-canvas p-4 text-center transition hover:border-blue-100 hover:bg-white hover:shadow-md"
                >
                  <div
                    className={clsx(
                      "mx-auto mb-2 grid h-11 w-11 place-items-center rounded-2xl",
                      tone,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-semibold text-slate-800">
                    {name}
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-400">
                    {desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-forest p-5 text-white">
            <div className="text-sm text-white/60">贡献原则</div>
            <p className="mt-2 text-sm leading-6">
              积分记录推进事实，让主动认领、答疑和知识沉淀被看见。
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
export default function App() {
  return <Layout />;
}
