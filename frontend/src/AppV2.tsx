import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  AtSign,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  FilePlus2,
  FileText,
  FileUp,
  Folder,
  FolderPlus,
  FolderKanban,
  Gauge,
  GripVertical,
  HandHelping,
  Inbox,
  LayoutDashboard,
  Library,
  Link2,
  ListChecks,
  ListTodo,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  PanelRight,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  Target,
  Trophy,
  Upload,
  UserRound,
  UserPlus,
  Users,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  experts,
  initialAssets,
  initialCandidates,
  initialHelpRequests,
  initialProjects,
  initialTasks,
  openTasks,
  skills,
  type Asset,
  type Candidate,
  type ExecutionMode,
  type HelpRequest,
  type Project,
  type Task,
  type TaskStatus,
} from "./workHubData";
import { ApiError, confirmCandidate, createCandidateExtraction, createProject, createStage, createTask, createTeamInvitation, fetchAgentRuns, fetchContributions, fetchExternalContacts, fetchExternalDependency, fetchProjects, fetchTaskSubmissions, fetchTasks, fetchTeams, ignoreCandidate, performTaskAction, startAgentRun, updateCandidate, updateStage, type ApiAgentRun, type ApiCandidate, type ApiContribution, type ApiExternalContact, type ApiExternalDependency, type ApiProject, type ApiSubmission, type ApiTask, type ApiTaskActionRequest, type ApiTeam } from "./api";
import { useAuth } from "./auth";
import "./workHub.css";

const apiStatusMap: Record<ApiTask["status"], TaskStatus> = {
  PENDING_OWNER_CONFIRMATION: "todo", TODO: "todo", IN_PROGRESS: "progress",
  WAITING_EXTERNAL: "external", BLOCKED: "blocked", WAITING_HUMAN_CONFIRMATION: "confirm",
  WAITING_REVIEW: "review", DONE: "done", CANCELED: "done",
};
const apiModeMap: Record<ApiTask["execution_mode"], ExecutionMode> = { HUMAN: "human", AI: "ai", HYBRID: "hybrid" };
const formatApiDate = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value)) : "未设置";
const projectFromApi = (item: ApiProject, index: number): Project => ({ id:item.id, name:item.name, client:item.client, stage:item.current_stage, health:item.health, progress:item.progress, owner:item.owner_name, nextMilestone:item.next_milestone, due:formatApiDate(item.due_at), color:["#246bfd","#13a86b","#f59e0b"][index % 3], stages:item.stages });
const taskFromApi = (item: ApiTask): Task => ({ id:item.id, title:item.title, projectId:item.project_id, project:item.project_name, owner:item.owner_name, collaborators:[], reviewer:item.reviewer_name, due:formatApiDate(item.due_at), priority:item.priority === "HIGH" ? "高" : item.priority === "LOW" ? "低" : "中", status:apiStatusMap[item.status], apiStatus:item.status, version:item.version, mode:apiModeMap[item.execution_mode], progress:item.progress, description:item.description, deliverable:item.deliverable, acceptance:item.acceptance, source:item.source, nextAction:item.status === "WAITING_REVIEW" ? "等待验收人确认交付物" : item.status === "IN_PROGRESS" ? "继续执行并提交结果" : "按任务状态继续推进" });

type HubContextValue = {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  candidates: Candidate[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  helps: HelpRequest[];
  setHelps: React.Dispatch<React.SetStateAction<HelpRequest[]>>;
  assets: Asset[];
  setAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
  knowledgePages: KnowledgePage[];
  setKnowledgePages: React.Dispatch<React.SetStateAction<KnowledgePage[]>>;
  notifications: HubNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<HubNotification[]>>;
  contributions: string[];
  setContributions: React.Dispatch<React.SetStateAction<string[]>>;
  activeTeamId: string;
  setActiveTeamId: React.Dispatch<React.SetStateAction<string>>;
  teams: TeamWorkspace[];
  notify: (message: string) => void;
  addNotification: (notification: Omit<HubNotification, "id" | "createdAt" | "read">) => void;
  openTask: (task: Task) => void;
  openAsset: (asset: Asset) => void;
  openPreview: (preview: FlowPreview) => void;
  openCandidate: (candidate: Candidate) => void;
  startChatWith: (prompt: string) => void;
};

type FlowPreview = {
  eyebrow?: string;
  title: string;
  description: string;
  items?: { title: string; detail?: string }[];
  note?: string;
  primaryLabel?: string;
  primaryRoute?: string;
};

type HubNotification = {
  id: string;
  kind: "task" | "chat" | "page" | "extraction" | "system";
  title: string;
  detail: string;
  createdAt: string;
  read: boolean;
  taskId?: string;
  pageId?: string;
  route?: string;
};

type ExtractionSource = "meeting" | "chat";

type ExtractedTask = {
  id: string;
  title: string;
  owner: string;
  due: string;
  confidence: number;
  status: "待负责人确认" | "已确认";
  deliverable: string;
  reviewer: string;
};

type ExtractionBatch = {
  id: ExtractionSource;
  sourceLabel: string;
  title: string;
  context: string;
  summary: string;
  projectId: string;
  project: string;
  tasks: ExtractedTask[];
};

type KnowledgePage = {
  id: string;
  title: string;
  space: "全意内部" | "凡诺科技" | "康福来";
  parent: string;
  content: string;
  updatedAt: string;
  owner: string;
  assetIds: string[];
};

type ChatContextItem = {
  id: string;
  label: string;
  kind: "file" | "expert" | "skill" | "connector";
};

function ChatContextPicker({ project, selected, onChange }: { project?: Project; selected: ChatContextItem[]; onChange: (items: ChatContextItem[]) => void }) {
  const { notify } = useHub();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"root" | ChatContextItem["kind"]>("root");
  const pickerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSection("root");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const addItem = (item: ChatContextItem) => {
    if (!selected.some((entry) => entry.id === item.id)) onChange([...selected, item]);
    notify(`已将「${item.label}」加入本次对话上下文`);
    setOpen(false);
    setSection("root");
  };
  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const next = files.map((file) => ({ id: `local-${file.name}-${file.lastModified}`, label: file.name, kind: "file" as const }));
    onChange([...selected, ...next.filter((item) => !selected.some((entry) => entry.id === item.id))]);
    notify(`已添加 ${files.length} 个本地文件`);
    event.target.value = "";
    setOpen(false);
    setSection("root");
  };
  const sections = [
    { id: "file" as const, icon: <Paperclip size={17}/>, title: "添加文件", detail: project ? "本地文件或当前项目资产" : "本地文件或已有资产" },
    { id: "expert" as const, icon: <Users size={17}/>, title: "专家", detail: "让专业角色参与本次回答" },
    { id: "skill" as const, icon: <WandSparkles size={17}/>, title: "Skills", detail: "调用可复用的工作方法" },
    { id: "connector" as const, icon: <Link2 size={17}/>, title: "连接器", detail: "读取已授权的外部信息" },
  ];
  return (
    <div className="chat-context-picker" ref={pickerRef}>
      <button type="button" className={open ? "context-trigger active" : "context-trigger"} aria-label="添加对话上下文" aria-expanded={open} onClick={() => {setOpen((value) => !value); setSection("root");}}><Paperclip size={18}/></button>
      <input ref={fileRef} className="context-file-input" type="file" multiple onChange={chooseFiles}/>
      {open && <div className="context-picker-popover">
        <header>
          {section !== "root" && <button type="button" onClick={() => setSection("root")} aria-label="返回"><ArrowLeft size={16}/></button>}
          <div><span>{section === "root" ? "添加到对话" : sections.find((item) => item.id === section)?.title}</span><small>{project ? `当前范围：${project.name}` : "仅用于本次个人对话"}</small></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="关闭"><X size={16}/></button>
        </header>
        {section === "root" && <div className="context-picker-list">{sections.map((item) => <button type="button" key={item.id} onClick={() => setSection(item.id)}><i>{item.icon}</i><span>{item.title}<small>{item.detail}</small></span><ChevronRight size={15}/></button>)}</div>}
        {section === "file" && <div className="context-picker-list">
          <button type="button" onClick={() => fileRef.current?.click()}><i><FileUp size={17}/></i><span>从本地上传<small>支持一次选择多个文件</small></span><ChevronRight size={15}/></button>
          <button type="button" onClick={() => addItem({id: project ? `project-assets-${project.id}` : "asset-library", label: project ? `${project.name} · 项目资产` : "资产库文件", kind:"file"})}><i><Library size={17}/></i><span>{project ? "当前项目资产" : "从资产库选择"}<small>{project ? "只读取当前项目已关联的资料" : "从你有权限的资产中选择"}</small></span><ChevronRight size={15}/></button>
          {!project && <button type="button" onClick={() => addItem({id:"recent-file",label:"最近使用的文件",kind:"file"})}><i><Clock3 size={17}/></i><span>最近使用<small>快速引用最近打开的文件</small></span><ChevronRight size={15}/></button>}
        </div>}
        {section === "expert" && <div className="context-picker-list context-picker-options">{experts.slice(0, 4).map((expert) => <button type="button" key={expert.id} onClick={() => addItem({id:expert.id,label:expert.name,kind:"expert"})}><i className={`expert-dot ${expert.color}`}>{expert.icon}</i><span>{expert.name}<small>{expert.desc}</small></span>{expert.online && <em>可用</em>}</button>)}<button type="button" className="context-more-option" onClick={() => notify("已打开专家库，可继续查找更多专业角色")}><Plus size={16}/><span>召唤更多专家</span></button></div>}
        {section === "skill" && <div className="context-picker-list context-picker-options">{skills.map((skill) => <button type="button" key={skill.id} onClick={() => addItem({id:skill.id,label:skill.name,kind:"skill"})}><i><WandSparkles size={17}/></i><span>{skill.name}<small>{skill.desc}</small></span></button>)}</div>}
        {section === "connector" && <div className="context-picker-list context-picker-options">{[
          {id:"wechat",label:"企业微信",detail:"会议、群聊与文档",ready:true},
          {id:"drive",label:"企业云盘",detail:"共享文件与团队资料",ready:true},
          {id:"feishu",label:"飞书",detail:"消息、文档与日历",ready:false},
        ].map((connector) => <button type="button" key={connector.id} onClick={() => connector.ready ? addItem({id:connector.id,label:connector.label,kind:"connector"}) : notify(`${connector.label} 尚未连接，可在连接器管理中授权`)}><i><Link2 size={17}/></i><span>{connector.label}<small>{connector.detail}</small></span><em className={connector.ready ? "ready" : "not-ready"}>{connector.ready ? "已连接" : "去连接"}</em></button>)}</div>}
      </div>}
    </div>
  );
}

function ChatContextChips({ items, onChange }: { items: ChatContextItem[]; onChange: (items: ChatContextItem[]) => void }) {
  if (!items.length) return null;
  return <div className="chat-context-chips">{items.map((item) => <span key={item.id}>{item.kind === "expert" ? <Users size={13}/> : item.kind === "skill" ? <WandSparkles size={13}/> : item.kind === "connector" ? <Link2 size={13}/> : <FileText size={13}/>}<span className="context-chip-label">{item.label}</span><button type="button" aria-label={`移除${item.label}`} onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}><X size={12}/></button></span>)}</div>;
}

const teamMemberProfiles = [
  { name: "徐泉", role: "CEO" },
  { name: "廖婉琛", role: "成员" },
  { name: "曹玉祥", role: "成员" },
  { name: "TRoY", role: "成员" },
  { name: "顾一健", role: "成员" },
  { name: "项仪", role: "成员" },
  { name: "项白", role: "成员" },
  { name: "谭莉", role: "成员" },
  { name: "熊樱", role: "成员" },
] as const;

const teamMembers = teamMemberProfiles.map((member) => member.name);
const memberRole = (name: string) => teamMemberProfiles.find((member) => member.name === name)?.role || "成员";

type TeamWorkspace = {
  id: string;
  name: string;
  description: string;
  role: "CEO" | "成员";
  members: string[];
  projects: string[];
  tone: "blue" | "violet" | "amber";
  memberDetails?: ApiTeam["members"];
};

const teamFromApi = (team: ApiTeam, index: number): TeamWorkspace => ({
  id: team.id,
  name: team.name,
  description: "真实团队协作空间；成员与项目范围由服务端权限控制。",
  role: team.role === "CEO" ? "CEO" : "成员",
  members: team.members.filter((member) => member.is_active).map((member) => member.name),
  memberDetails: team.members,
  projects: team.project_names,
  tone: (["blue", "violet", "amber"] as const)[index % 3],
});

const emptyTeam: TeamWorkspace = { id:"", name:"尚未加入团队", description:"请通过管理员邀请加入团队。", role:"成员", members:[], projects:[], tone:"blue", memberDetails:[] };

const extractionBatches: Record<ExtractionSource, ExtractionBatch> = {
  meeting: {
    id: "meeting",
    sourceLabel: "企业微信会议",
    title: "凡诺项目周会 · 8月18日",
    context: "42 分钟 · 6 位参与者 · 会后自动提取",
    summary: "首页先建立品牌可信度，再说明 AI 官网能力；核心卖点与移动端范围需要分别确认。",
    projectId: "p-fannal",
    project: "凡诺 AI 官网升级",
    tasks: [
      { id: "ext-m-1", title: "整理客户对首页核心卖点的反馈", owner: "廖婉琛", reviewer: "徐泉", due: "8月20日", confidence: 96, status: "待负责人确认", deliverable: "客户反馈要点与页面调整建议" },
      { id: "ext-m-2", title: "补充首页解决方案模块的案例依据", owner: "廖婉琛", reviewer: "徐泉", due: "8月22日", confidence: 91, status: "待负责人确认", deliverable: "案例证据与可引用来源" },
      { id: "ext-m-3", title: "下次周会前确认移动端导航范围", owner: "曹玉祥", reviewer: "徐泉", due: "8月21日", confidence: 94, status: "已确认", deliverable: "移动端一级导航范围" },
    ],
  },
  chat: {
    id: "chat",
    sourceLabel: "企业微信聊天",
    title: "全意产品群 · 今天 09:42",
    context: "186 条消息 · 7 位成员 · 持续自动识别",
    summary: "聊天中形成了工作台入口、机器人权限和移动端通知三个明确行动项。",
    projectId: "p-quanyi",
    project: "全意 AI 工作中枢",
    tasks: [
      { id: "ext-c-1", title: "补充会议与聊天任务提取入口说明", owner: "廖婉琛", reviewer: "曹玉祥", due: "今天 18:00", confidence: 93, status: "待负责人确认", deliverable: "工作台入口与用户路径说明" },
      { id: "ext-c-2", title: "确认企业微信机器人可读取的群聊范围", owner: "曹玉祥", reviewer: "徐泉", due: "8月21日", confidence: 88, status: "待负责人确认", deliverable: "机器人权限边界清单" },
      { id: "ext-c-3", title: "补充移动端个人任务通知规则", owner: "顾一健", reviewer: "曹玉祥", due: "8月22日", confidence: 86, status: "待负责人确认", deliverable: "移动端通知状态说明" },
    ],
  },
};

const initialKnowledgePages: KnowledgePage[] = [
  {
    id: "kp-001",
    title: "全意 AI 工作中枢协作说明",
    space: "全意内部",
    parent: "产品与研发",
    content: "这是一份持续更新的工作说明。\n\n任务中的 @ 用于一次性协作请求；AI 对话邀请用于多人共同工作；知识页面中的 @ 用于围绕具体内容持续共建。\n\n@曹玉祥 请补充移动端通知与知识空间动态的边界说明。",
    updatedAt: "刚刚自动保存",
    owner: "廖婉琛",
    assetIds: ["a-401"],
  },
  {
    id: "kp-002",
    title: "凡诺官网首页信息架构",
    space: "凡诺科技",
    parent: "项目知识",
    content: "首页需要先建立品牌可信度，再说明 AI 官网能力。\n\n待补充：解决方案区的客户证据与页面行动路径。",
    updatedAt: "今天 10:46",
    owner: "廖婉琛",
    assetIds: ["a-402", "a-403"],
  },
  {
    id: "kp-003",
    title: "外部资料等待处理规范",
    space: "全意内部",
    parent: "项目方法论",
    content: "把等待对象、等待内容、预计回复时间和恢复动作同时记录，避免外部依赖长期占用主注意力。",
    updatedAt: "昨天 18:20",
    owner: "AI 知识助手",
    assetIds: ["a-404"],
  },
];

const initialNotifications: HubNotification[] = [
  { id: "n-ext-1", kind: "extraction", title: "项目周会有 2 项任务分给你", detail: "凡诺项目周会 · 请确认负责人、截止时间和交付物", createdAt: "刚刚", read: false, route: "/?assigned=1&source=meeting" },
  { id: "n-ext-2", kind: "extraction", title: "群聊中识别到 1 项你的任务", detail: "企业微信「全意产品群」· 补充任务提取入口说明", createdAt: "2 分钟前", read: false, route: "/?assigned=1&source=chat" },
  { id: "n-1", kind: "task", title: "曹玉祥在任务中 @了你", detail: "移动端导航交互待产品确认 · 请确认一级入口优先级", createdAt: "3 分钟前", read: false, taskId: "t-106" },
  { id: "n-2", kind: "page", title: "徐泉在知识页面中提及了你", detail: "凡诺官网首页信息架构 · 缺少的客户资料我列出来了", createdAt: "18 分钟前", read: false, pageId: "kp-002", route: "/knowledge?page=kp-002" },
  { id: "n-3", kind: "chat", title: "徐泉邀请你加入 AI 工作会话", detail: "全意工作中枢协作方式梳理 · 可查看全部历史对话", createdAt: "1 小时前", read: false, route: "/ai" },
];

const HubContext = createContext<HubContextValue | null>(null);

function useHub() {
  const value = useContext(HubContext);
  if (!value) throw new Error("HubContext is missing");
  return value;
}

const statusMeta: Record<TaskStatus, { label: string; tone: string }> = {
  candidate: { label: "候选", tone: "violet" },
  todo: { label: "待开始", tone: "neutral" },
  progress: { label: "进行中", tone: "blue" },
  ai: { label: "AI 执行中", tone: "cyan" },
  confirm: { label: "待我确认", tone: "violet" },
  review: { label: "待验收", tone: "amber" },
  blocked: { label: "已阻塞", tone: "red" },
  external: { label: "等待外部", tone: "muted" },
  done: { label: "已完成", tone: "green" },
};

const modeMeta: Record<ExecutionMode, { label: string; icon: ReactNode }> = {
  human: { label: "人工", icon: <UserRound size={13} /> },
  ai: { label: "AI", icon: <Sparkles size={13} /> },
  hybrid: { label: "人机协作", icon: <Users size={13} /> },
};

function StatusPill({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status];
  return <span className={"status-pill " + meta.tone}>{meta.label}</span>;
}

function ModePill({ mode }: { mode: ExecutionMode }) {
  const meta = modeMeta[mode];
  return (
    <span className={"mode-pill " + mode}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return <span className={"avatar " + size} aria-label={name} title={name}>{name.replace("AI · ", "").slice(0, 1)}</span>;
}

function TaskParticipants({ task }: { task: Task }) {
  const people = Array.from(new Set([task.owner, ...task.collaborators]));
  return (
    <span className="task-participants" aria-label={`执行成员：${people.join("、")}`} title={people.join("、")}>
      <span className="task-participant-avatars">{people.slice(0, 4).map((name) => <Avatar name={name} size="sm" key={name}/>)}</span>
      <small>{people.length > 1 ? `${task.owner} 等 ${people.length} 人` : task.owner}</small>
    </span>
  );
}

type AssistantLifeState = "idle" | "thinking" | "active";

function AssistantLifeOrb({ size = "medium", state = "idle", label = "AI 助手" }: { size?: "tiny" | "small" | "medium" | "large" | "dashboard"; state?: AssistantLifeState; label?: string }) {
  const iconSize = size === "tiny" ? 12 : size === "small" ? 15 : size === "medium" ? 21 : 29;
  return (
    <span className={`assistant-life size-${size} is-${state}`} role="img" aria-label={`${label} · ${state === "thinking" ? "正在思考" : state === "active" ? "正在回应" : "随时可用"}`}>
      <span className="assistant-life-glow" />
      <span className="assistant-life-orbit orbit-one"><i /></span>
      <span className="assistant-life-orbit orbit-two"><i /></span>
      <span className="assistant-life-core"><Sparkles size={iconSize} /></span>
      <span className="assistant-life-signal"><i /><i /><i /></span>
    </span>
  );
}

const mentionPattern = /(@(?:资产|页面)?「[^」\n]+」|@[A-Za-z0-9_\u3400-\u9fff·-]+)(?=\s|$|[，。！？、；：,.!?;:])/g;

function MentionText({ text }: { text: string }) {
  return <>{text.split(mentionPattern).map((part, index) => part.startsWith("@") && part.length > 1 ? <span className="mention-chip" key={part + index}>{part}</span> : <span key={index}>{part}</span>)}</>;
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function AppModal({
  title,
  subtitle,
  children,
  onClose,
  size = "md",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className={"app-modal " + size}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

function FlowPreviewDialog({ preview, onClose }: { preview: FlowPreview; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <AppModal title={preview.title} subtitle={preview.description} onClose={onClose} size="lg">
      <div className="flow-preview-dialog">
        {preview.eyebrow && <span className="section-kicker">{preview.eyebrow}</span>}
        {preview.items?.length ? (
          <div className="flow-preview-list">
            {preview.items.map((item, index) => (
              <div key={item.title}>
                <span>{index + 1}</span>
                <p><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</p>
              </div>
            ))}
          </div>
        ) : null}
        {preview.note && <div className="flow-preview-note"><CheckCircle2 size={17}/><span>{preview.note}</span></div>}
        <footer className="modal-actions">
          <button className="button secondary" onClick={onClose}>返回当前页面</button>
          {preview.primaryLabel && <button className="button primary" onClick={() => { onClose(); if (preview.primaryRoute) navigate(preview.primaryRoute); }}>{preview.primaryLabel}<ArrowRight size={15}/></button>}
        </footer>
      </div>
    </AppModal>
  );
}

function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}

function WorkHubProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [helps, setHelps] = useState<HelpRequest[]>(initialHelpRequests);
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [knowledgePages, setKnowledgePages] = useState<KnowledgePage[]>(initialKnowledgePages);
  const [notifications, setNotifications] = useState<HubNotification[]>(initialNotifications);
  const [teams, setTeams] = useState<TeamWorkspace[]>([]);
  const [contributions, setContributions] = useState<string[]>([
    "完成任务「品牌视觉规范初稿」 · +8",
    "解决求助「GEO 问题库结构」 · +5",
    "沉淀知识「等待外部任务处理 SOP」 · +3",
  ]);
  const [activeTeamId, setActiveTeamId] = useState(() => {
    const savedTeamId = window.localStorage.getItem("quanyi-active-team");
    return savedTeamId || "";
  });
  const [toast, setToast] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [chatPrompt, setChatPrompt] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [flowPreview, setFlowPreview] = useState<FlowPreview | null>(null);

  useEffect(() => {
    window.localStorage.setItem("quanyi-active-team", activeTeamId);
  }, [activeTeamId]);

  useEffect(() => {
    let active = true;
    setDataLoading(true);
    setDataError("");
    Promise.all([fetchProjects(), fetchTasks(), fetchTeams()]).then(([projectRows, taskRows, teamRows]) => {
      if (!active) return;
      setProjects(projectRows.map(projectFromApi));
      setTasks(taskRows.map(taskFromApi));
      const mappedTeams = teamRows.map(teamFromApi);
      setTeams(mappedTeams);
      setActiveTeamId((current) => mappedTeams.some((team) => team.id === current) ? current : mappedTeams[0]?.id || "");
    }).catch(() => {
      if (active) setDataError("无法读取服务端项目数据，请确认后端已启动");
    }).finally(() => {
      if (active) setDataLoading(false);
    });
    return () => { active = false; };
  }, [user.id]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const addNotification = (notification: Omit<HubNotification, "id" | "createdAt" | "read">) => {
    setNotifications((items) => [
      {
        ...notification,
        id: "n-" + Date.now(),
        createdAt: "刚刚",
        read: false,
      },
      ...items,
    ]);
  };

  const value: HubContextValue = {
    tasks,
    setTasks,
    candidates,
    setCandidates,
    projects,
    setProjects,
    helps,
    setHelps,
    assets,
    setAssets,
    knowledgePages,
    setKnowledgePages,
    notifications,
    setNotifications,
    contributions,
    setContributions,
    activeTeamId,
    setActiveTeamId,
    teams,
    notify,
    addNotification,
    openTask: (task) => navigate(task.status === "ai" ? "/agent?run=run-" + task.id : "/tasks/" + task.id),
    openAsset: setSelectedAsset,
    openPreview: setFlowPreview,
    openCandidate: setSelectedCandidate,
    startChatWith: setChatPrompt,
  };

  return (
    <HubContext.Provider value={value}>
      {dataLoading ? <main className="hub-data-state">正在读取项目与任务…</main> : dataError ? <main className="hub-data-state error"><AlertCircle size={20}/>{dataError}<button onClick={() => window.location.reload()}>重新加载</button></main> : children}
      {selectedCandidate && (
        <CandidateReview
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
      {chatPrompt && (
        <ChatLaunch
          prompt={chatPrompt}
          onClose={() => setChatPrompt("")}
        />
      )}
      {selectedAsset && <AssetDetail asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}
      {flowPreview && <FlowPreviewDialog preview={flowPreview} onClose={() => setFlowPreview(null)} />}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </HubContext.Provider>
  );
}

const mainNav = [
  { to: "/", label: "工作台", icon: LayoutDashboard },
  { to: "/projects", label: "项目空间", icon: FolderKanban },
  { to: "/tasks", label: "任务池", icon: ListTodo },
  { to: "/help", label: "智能求助", icon: CircleHelp },
];

const resourceNav = [
  { to: "/knowledge", label: "知识空间", icon: BookOpen },
  { to: "/assets", label: "资产库", icon: Library },
  { to: "/capabilities", label: "能力库", icon: Boxes },
  { to: "/contribution", label: "我的贡献", icon: Trophy },
];

function Sidebar({ mobileOpen, closeMobile }: { mobileOpen: boolean; closeMobile: () => void }) {
  const { activeTeamId, candidates, tasks, teams } = useHub();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const runCount = tasks.filter((task) => task.status === "ai").length;
  const previewIdentity = { name: user.name, role: user.role === "CEO" ? "CEO" : "团队成员" };
  const activeTeam = teams.find((team) => team.id === activeTeamId) || teams[0] || emptyTeam;
  return (
    <>
      {mobileOpen && <button aria-label="关闭导航" className="mobile-scrim" onClick={closeMobile} />}
      <aside className={"sidebar " + (mobileOpen ? "mobile-open " : "") + (collapsed ? "collapsed" : "")}>
        <div className="brand">
          <span className="brand-mark"><Zap size={20} fill="currentColor" /></span>
          <div className="brand-copy">
            <strong>全意</strong>
            <span>AI Work Hub</span>
          </div>
          <button className="sidebar-collapse" aria-label={collapsed ? "展开侧栏" : "收起侧栏"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
            <SquareKanban size={17} />
          </button>
        </div>

        <nav className="sidebar-nav" onClick={closeMobile}>
          <div className="nav-group">
            <div className="nav-group-label">工作</div>
            {mainNav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className="nav-item" aria-label={item.label} title={item.label}>
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.to === "/tasks" && candidates.length > 0 && (
                  <em>{candidates.length}</em>
                )}
              </NavLink>
            ))}
          </div>
          <div className="nav-group">
            <div className="nav-group-label">知识与能力</div>
            {resourceNav.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav-item" aria-label={item.label} title={item.label}>
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
          <div className="nav-group">
            <div className="nav-group-label">AI 运行</div>
            <NavLink to="/agent" className="nav-item" aria-label="AI 执行中心" title="AI 执行中心">
              <Bot size={18} />
              <span>AI 执行中心</span>
              {runCount > 0 && <i className="live-dot" />}
            </NavLink>
            <NavLink to="/access" className="nav-item" aria-label="Agent 接入" title="Agent 接入">
              <Code2 size={18} />
              <span>Agent 接入</span>
            </NavLink>
          </div>
        </nav>

        <div className="sidebar-bottom">
          <button className="sidebar-ai" onClick={() => navigate("/ai")} aria-label="问问 AI 助手" title="问问 AI 助手">
            <span className="assistant-orb small"><Sparkles size={16} /></span>
            <span>
              <strong>问问 AI 助手</strong>
              <small>搜索、分析或创建任务</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <NavLink to="/teams" className="nav-item quiet team-nav-entry" aria-label="我的团队" title="我的团队">
            <Users size={18} />
            <span><strong>我的团队</strong><small>{activeTeam.name}</small></span>
            <ChevronRight size={15} />
          </NavLink>
          <button className="nav-item quiet" aria-label="设置" title="设置" onClick={() => navigate("/settings")}>
            <Settings size={18} />
            <span>设置</span>
          </button>
          <button className="sidebar-signout" onClick={logout}>退出当前账号</button>
          <button className="user-card" onClick={() => navigate("/settings")} aria-label="打开个人设置">
            <Avatar name={previewIdentity.name} />
            <span>
              <strong>{previewIdentity.name}</strong>
              <small>{previewIdentity.role}</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ openMobile }: { openMobile: () => void }) {
  const { notifications } = useHub();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const unreadCount = notifications.filter((item) => !item.read).length;
  return (
    <>
      <header className="topbar">
        <button className="mobile-menu" onClick={openMobile} aria-label="打开导航">
          <Menu size={20} />
        </button>
        <button className="global-search" onClick={() => setSearchOpen(true)}>
          <Search size={17} />
          <span>搜索任务、项目、资产或直接问 AI...</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="topbar-actions">
          <button className="button primary compact" onClick={() => setCreateOpen(true)} aria-label="新建任务" title="新建任务">
            <Plus size={16} />
            <span>新建任务</span>
          </button>
          <div className="popover-wrap">
            <button className="icon-button notice-button" onClick={() => setNoticeOpen(!noticeOpen)} aria-label="通知">
              <Bell size={18} />
              {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
            {noticeOpen && <NotificationPopover close={() => setNoticeOpen(false)} />}
          </div>
          <button className="topbar-avatar" onClick={() => navigate("/settings")} aria-label="打开个人设置"><Avatar name={user.name} /></button>
        </div>
      </header>
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {createOpen && <CreateTask onClose={() => setCreateOpen(false)} />}
    </>
  );
}

function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  return (
    <div className="work-hub">
      <Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
      <div className="app-column">
        <Topbar openMobile={() => setMobileOpen(true)} />
        <main
          className={`main-content${location.pathname === "/" ? " dashboard-content" : ""}`}
          key={location.pathname}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectSpace />} />
            <Route path="/tasks" element={<TaskPool />} />
            <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
            <Route path="/help" element={<HelpCenter />} />
            <Route path="/knowledge" element={<KnowledgeSpace />} />
            <Route path="/assets" element={<AssetLibrary />} />
            <Route path="/capabilities" element={<CapabilityLibrary />} />
            <Route path="/contribution" element={<ContributionPage />} />
            <Route path="/agent" element={<AgentCenter />} />
            <Route path="/access" element={<AgentAccess />} />
            <Route path="/ai" element={<AiChat />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Dashboard() {
  const { tasks, candidates, activeTeamId, teams, openTask, openCandidate, openPreview } = useHub();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const dashboardView = user.role === "CEO" ? "ceo" : "member";
  const requestedExtraction = queryParams.get("extract") as ExtractionSource | null;
  const legacyMineRequest = queryParams.get("view") === "mine";
  const requestedAssigned = queryParams.get("assigned") === "1" || legacyMineRequest;
  const requestedAssignedSource = (queryParams.get("source") || (legacyMineRequest ? requestedExtraction : null)) as ExtractionSource | null;
  const [extractionOpen, setExtractionOpen] = useState<ExtractionSource | null>(requestedAssigned ? null : requestedExtraction);
  const [assignedOpen, setAssignedOpen] = useState(requestedAssigned);
  const [assignedSource, setAssignedSource] = useState<ExtractionSource | null>(requestedAssignedSource);
  const [todayOpen, setTodayOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const activeTeam = teams.find((team) => team.id === activeTeamId) || teams[0] || emptyTeam;
  const currentUser = user.name;
  const personalTasks = tasks
    .filter((task) => task.owner === currentUser || task.collaborators.includes(currentUser))
    .filter((task) => !["done", "external"].includes(task.status));
  const primaryPersonalTask = personalTasks.find((task) => task.id === "t-101") || personalTasks[0];
  const todayTasks = personalTasks.filter((task) => task.due.includes("今天"));
  const remainingPersonalTasks = personalTasks
    .filter((task) => task.id !== primaryPersonalTask?.id)
    .sort((a, b) => (["blocked", "review", "confirm", "progress", "ai"].indexOf(a.status) - ["blocked", "review", "confirm", "progress", "ai"].indexOf(b.status)))
    .slice(0, 3);
  const pendingAssignments = Object.values(extractionBatches)
    .flatMap((batch) => batch.tasks)
    .filter((task) => task.owner === currentUser && task.status === "待负责人确认");
  const pendingDistributionCount = Object.values(extractionBatches)
    .flatMap((batch) => batch.tasks)
    .filter((task) => task.status === "待负责人确认").length;
  const managerDecisions = tasks
    .filter((task) => (task.apiStatus === "WAITING_HUMAN_CONFIRMATION" && task.owner === currentUser)
      || (task.apiStatus === "WAITING_REVIEW" && task.reviewer === currentUser)
      || (task.apiStatus === "PENDING_OWNER_CONFIRMATION" && task.owner === currentUser))
    .map((task) => task.apiStatus === "WAITING_REVIEW"
      ? { task, tag:"结果验收", detail:"负责人已提交结果，等待验收决定", waiting:"待你处理", action:"立即验收" }
      : task.apiStatus === "WAITING_HUMAN_CONFIRMATION"
        ? { task, tag:"AI 草稿确认", detail:"AI 已生成草稿，确认后才能提交验收", waiting:"待你确认", action:"查看草稿" }
        : { task, tag:"任务接收", detail:"新任务等待负责人确认接收", waiting:"待你确认", action:"确认任务" });
  const managerExceptions = tasks
    .filter((task) => ["blocked", "external"].includes(task.status))
    .map((task) => task.status === "blocked"
      ? { task, issue:"任务已阻塞", tone:"red", suggestion:"协调资源" }
      : { task, issue:"等待外部", tone:"amber", suggestion:"查看依赖" });
  const receiverMetrics = [
    { label: "未完成", value: personalTasks.length, note: "我的全部进行中任务", icon: ListChecks, tone: "blue", action: () => navigate("/tasks") },
    { label: "今天", value: todayTasks.length, note: "今天必须完成", icon: Clock3, tone: "violet", action: () => { setTodayOpen(true); setAssignedOpen(false); setExtractionOpen(null); } },
    { label: "逾期", value: 0, note: "目前没有逾期任务", icon: AlertCircle, tone: "green", action: () => openPreview({ eyebrow: "任务状态", title: "目前没有逾期任务", description: "你的任务都在计划时间内。下一项最近截止任务是「梳理凡诺官网首页信息架构」 · 今天 18:00。", primaryLabel: "查看全部任务", primaryRoute: "/tasks" }) },
    { label: "待接收", value: pendingAssignments.length, note: "确认后进入任务池", icon: Inbox, tone: "cyan", action: () => { setAssignedSource(null); setAssignedOpen(true); setExtractionOpen(null); } },
  ];
  const dispatcherMetrics = [
    { label: "待我决策", value: managerDecisions.length, note: "不处理将影响团队推进", icon: Target, tone: "blue", action: () => navigate("/tasks?focus=decisions") },
    { label: "逾期 / 临期", value: 2, note: "今天需要跟进", icon: Clock3, tone: "orange", action: () => navigate("/tasks") },
    { label: "阻塞 / 求助", value: tasks.filter((task) => ["blocked", "external"].includes(task.status)).length, note: "需要协调资源或方向", icon: AlertCircle, tone: "red", action: () => navigate("/help") },
    { label: "待分配", value: pendingDistributionCount, note: "来自会议与聊天", icon: Inbox, tone: "violet", action: () => openExtraction("meeting") },
  ];
  const metrics = dashboardView === "ceo" ? dispatcherMetrics : receiverMetrics;

  useEffect(() => {
    if (requestedAssigned) {
      setAssignedSource(requestedAssignedSource);
      setAssignedOpen(true);
      setExtractionOpen(null);
    } else if (requestedExtraction && extractionBatches[requestedExtraction]) {
      setExtractionOpen(requestedExtraction);
    }
  }, [requestedAssigned, requestedAssignedSource, requestedExtraction]);

  const openExtraction = (source: ExtractionSource) => {
    setExtractionOpen(source);
    setAssignedOpen(false);
    setTodayOpen(false);
  };

  const submitAssistantPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = assistantPrompt.trim();
    if (!prompt) return;
    navigate("/ai?prompt=" + encodeURIComponent(prompt));
  };

  const assistantCard = (
    <section className="panel ai-assistant-card">
      <div className="panel-title-row">
        <div className="assistant-card-heading">
          <AssistantLifeOrb size="tiny" />
          <div>
            <h2>AI 助手</h2>
            <p>跨项目、任务和资产工作</p>
          </div>
        </div>
      </div>
      <div className="assistant-life-stage" role="status" aria-live="polite">
        <AssistantLifeOrb size="dashboard" state="idle" />
        <span className="assistant-life-copy">
          <strong><i />随时可用</strong>
          <small>从这里发起，完整对话会在 AI 助手中打开</small>
        </span>
      </div>
      <form className="assistant-input" onSubmit={submitAssistantPrompt}>
        <Paperclip size={16} />
        <input
          value={assistantPrompt}
          onChange={(event) => setAssistantPrompt(event.target.value)}
          placeholder="问我任何与工作有关的问题..."
          aria-label="向工作台 AI 助手提问"
        />
        <button type="submit" disabled={!assistantPrompt.trim()} aria-label="发送给 AI 助手"><ArrowRight size={15} /></button>
      </form>
    </section>
  );

  return (
    <>
      <div className={"dashboard-screen dashboard-view-" + dashboardView}>
        <PageHeader
          eyebrow={dashboardView === "ceo" ? "CEO · 任务分配者" : "AI 产品经理 · 团队成员"}
          title={dashboardView === "ceo" ? "早上好，徐泉" : "早上好，婉琛"}
          description={dashboardView === "ceo" ? "先处理影响团队继续推进的决策，再关注异常和待分发任务。" : "先完成今天必须推进的任务，再处理新分配与协作事项。"}
          action={
            <div className="dashboard-header-actions">
              <button className="dashboard-team-button" onClick={() => navigate("/teams")}>
                <TeamMemberStack members={activeTeam.members} limit={4} />
                <span className="dashboard-team-copy"><small>当前团队</small><strong>{activeTeam.name}</strong></span>
                <ChevronRight size={16} />
              </button>
            </div>
          }
        />

        <section className="metrics-grid">
          {metrics.map((metric) => (
            <button className="metric-card" key={metric.label} onClick={metric.action}>
              <span className={"metric-icon " + metric.tone}><metric.icon size={18} /></span>
              <div className="metric-label">{metric.label}</div>
              <div className="metric-value">{metric.value}</div>
              <div className="metric-note">{metric.note}<ChevronRight size={14} /></div>
            </button>
          ))}
        </section>

        <div className="dashboard-grid">
        {dashboardView === "member" ? <>
          <div className="dashboard-main">
            <section className="panel next-action-card">
              <button className="text-button next-action-link" onClick={() => navigate("/tasks")}>全部任务 <ArrowRight size={15} /></button>
              <div className="next-action-content">
                <div className="next-action-copy">
                  <div className="next-action-summary">
                    <span className="next-action-eyebrow">今天的第一件事</span>
                    <h3>{primaryPersonalTask?.title}</h3>
                    <p>{primaryPersonalTask?.description}</p>
                    <div className="task-inline-meta">
                      {primaryPersonalTask && <ModePill mode={primaryPersonalTask.mode} />}
                      <span><BriefcaseBusiness size={14} /> {primaryPersonalTask?.project}</span>
                      <span><Clock3 size={14} /> {primaryPersonalTask?.due}</span>
                    </div>
                  </div>
                  <div className="button-row">
                    <button className="button primary" onClick={() => primaryPersonalTask && openTask(primaryPersonalTask)}>继续处理 <ArrowRight size={16} /></button>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel focus-panel">
              <div className="panel-title-row">
                <div><span className="priority-rank secondary">完成今日重点后</span><div className="focus-title"><h2>我的未完成任务</h2><span>{remainingPersonalTasks.length}</span></div></div>
                <button className="text-button" onClick={() => navigate("/tasks")}>查看任务池 <ArrowRight size={15}/></button>
              </div>
              <div className="task-list">
                {remainingPersonalTasks.map((task, index) => (
                  <button className="task-row" key={task.id} onClick={() => openTask(task)}>
                    <span className="task-order">{index + 1}</span>
                    <div className="task-row-main"><strong>{task.title}</strong><span>{task.project} · 下一步：{task.nextAction}</span></div>
                    <ModePill mode={task.mode} />
                    <StatusPill status={task.status} />
                    <span className="task-due">{task.due}</span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </section>
          </div>

          <aside className="dashboard-aside receiver-aside">
            <section className="panel assignment-inbox-panel">
              <div className="panel-title-row">
                <div><h2>AI 任务提取</h2><p>会议与聊天中分给我的候选任务</p></div>
                <button className="text-button" onClick={() => {setAssignedSource(null); setAssignedOpen(true); setExtractionOpen(null);}}>查看全部 <ArrowRight size={14}/></button>
              </div>
              <div className="dispatcher-extraction-grid member-extraction-grid">
                {(["meeting", "chat"] as const).map((source) => {const assigned = extractionBatches[source].tasks.filter((task) => task.owner === currentUser && task.status === "待负责人确认"); return <button key={source} onClick={() => {setAssignedSource(source); setAssignedOpen(true); setExtractionOpen(null);}}><span className={"extraction-source-icon " + source}>{source === "meeting" ? <MessageSquareText size={16}/> : <Users size={16}/>}</span><span><strong>{source === "meeting" ? "会议" : "聊天"} {assigned.length} 项</strong><small>待我确认</small></span><ChevronRight size={14}/></button>;})}
              </div>
            </section>
            {assistantCard}
          </aside>
        </> : <>
          <div className="dashboard-main dispatcher-main">
            <section className="panel manager-decision-panel">
              <div className="panel-title-row">
                <div><h2>今天需要我决定</h2></div>
                <button className="text-button" onClick={() => navigate("/tasks")}>查看全部 <ArrowRight size={15}/></button>
              </div>
              <div className="manager-decision-list">
                {managerDecisions.slice(0, 2).map((item, index) => item.task ? <div className="manager-decision-row" key={item.task.id}>
                  <span className="decision-order">{index + 1}</span>
                  <div className="decision-copy"><span>{item.tag}</span><strong>{item.task.title}</strong><small>{item.detail} · {item.waiting}</small></div>
                  <div className="decision-owner"><Avatar name={item.task.owner} size="sm"/><span>{item.task.owner}<small>{item.task.project}</small></span></div>
                  <button className="button secondary compact" onClick={() => item.task && openTask(item.task)}>{item.action}<ArrowRight size={14}/></button>
                </div> : null)}
              </div>
            </section>

            <section className="panel focus-panel manager-exception-panel">
              <div className="panel-title-row">
                <div><div className="focus-title"><h2>执行异常</h2><span>{managerExceptions.length}</span></div></div>
                <button className="text-button" onClick={() => navigate("/tasks")}>团队任务 <ArrowRight size={15}/></button>
              </div>
              <div className="manager-exception-list">
                {managerExceptions.slice(0, 2).map((item) => item.task ? <button key={item.task.id} onClick={() => item.task && openTask(item.task)}>
                  <span className={"exception-signal " + item.tone}/>
                  <div><strong>{item.task.title}</strong><small>{item.task.project} · {item.task.owner}</small></div>
                  <span className={"exception-label " + item.tone}>{item.issue}</span>
                  <em>{item.suggestion}</em>
                  <ChevronRight size={15}/>
                </button> : null)}
              </div>
            </section>
          </div>

          <aside className="dashboard-aside dispatcher-aside">
            <section className="panel candidate-panel">
              <div className="panel-title-row">
                <div><h2>AI 任务提取</h2><p>来自会议与聊天的候选任务</p></div>
                <button className="text-button" onClick={() => openExtraction("meeting")}>查看全部 <ArrowRight size={14}/></button>
              </div>
              <div className="dispatcher-extraction-grid">
                {(["meeting", "chat"] as const).map((source) => {const batch = extractionBatches[source]; const pending = batch.tasks.filter((task) => task.status === "待负责人确认").length; return <button key={source} onClick={() => openExtraction(source)}><span className={"extraction-source-icon " + source}>{source === "meeting" ? <MessageSquareText size={16}/> : <Users size={16}/>}</span><span><strong>{source === "meeting" ? "会议" : "聊天"} {batch.tasks.length} 项</strong><small>待分发 {pending}</small></span><ChevronRight size={14}/></button>;})}
              </div>
            </section>
            {assistantCard}
          </aside>
        </>}
        </div>
      </div>
      {extractionOpen && <TaskExtractionReview initialSource={extractionOpen} onClose={() => {setExtractionOpen(null); if (requestedExtraction) navigate("/", {replace:true});}} />}
      {assignedOpen && <MyAssignedTasksReview initialSource={assignedSource} onClose={() => {setAssignedOpen(false); if (requestedAssigned) navigate("/", {replace:true});}} />}
      {todayOpen && <TodayTasksDialog tasks={todayTasks} onClose={() => setTodayOpen(false)} onOpenTask={(task) => {setTodayOpen(false); openTask(task);}} />}
    </>
  );
}

function TodayTasksDialog({ tasks, onClose, onOpenTask }: { tasks: Task[]; onClose: () => void; onOpenTask: (task: Task) => void }) {
  return (
    <AppModal title="今天必须完成" subtitle={`今天共有 ${tasks.length} 项任务到期，先查看清单，再选择要处理的任务`} onClose={onClose} size="lg">
      <div className="today-task-list">
        {tasks.map((task, index) => (
          <button className="today-task-card" key={task.id} onClick={() => onOpenTask(task)}>
            <span className="today-task-order">{index + 1}</span>
            <div className="today-task-copy">
              <span>{task.project}</span>
              <strong>{task.title}</strong>
              <p>{task.description}</p>
              <div>
                <ModePill mode={task.mode} />
                <StatusPill status={task.status} />
                <span className="today-task-owner"><Avatar name={task.owner} size="sm" /> {task.owner}</span>
              </div>
            </div>
            <span className="today-task-due"><small>截止时间</small><strong>{task.due}</strong></span>
            <ChevronRight size={18} />
          </button>
        ))}
        {!tasks.length && <EmptyState icon={<Clock3 />} title="今天没有到期任务" description="可以返回工作台继续处理其他进行中的任务。" />}
      </div>
      <footer className="modal-actions today-task-footer">
        <button className="button secondary" onClick={onClose}>关闭</button>
        <button className="button primary" onClick={() => tasks[0] && onOpenTask(tasks[0])} disabled={!tasks.length}>处理第一项</button>
      </footer>
    </AppModal>
  );
}

function ProjectsPage() {
  const { projects, setProjects, tasks, notify } = useHub();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("全部");
  const [view, setView] = useState<"卡片" | "组合">("卡片");
  const [createOpen, setCreateOpen] = useState(false);
  const filtered = projects.filter((project) => filter === "全部" || project.health === filter);
  return (
    <>
      <PageHeader
        title="项目空间"
        description="围绕阶段、下一步、风险和上下文推进项目，而不是只看一个百分比。"
        action={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> 新建项目</button>}
      />
      <div className="toolbar">
        <div className="segmented">
          {["全部", "正常", "有风险", "需关注"].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <button className={"button secondary compact " + (view === "组合" ? "active" : "")} onClick={() => setView((value) => value === "卡片" ? "组合" : "卡片")}><BarChart3 size={16} /> {view === "卡片" ? "组合视图" : "卡片视图"}</button>
      </div>
      {view === "卡片" ? <div className="project-grid">
        {filtered.map((project) => {
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          return (
            <button className="project-card" key={project.id} onClick={() => navigate("/projects/" + project.id)}>
              <div className="project-card-head">
                <span className="project-mark" style={{ background: project.color }}>{project.client.slice(0, 1)}</span>
                <div>
                  <strong>{project.name}</strong>
                  <span>{project.client}</span>
                </div>
                <span className={"health-pill " + project.health}>{project.health}</span>
              </div>
              <div className="project-stage">
                <span>当前阶段</span>
                <strong>{project.stage}</strong>
              </div>
              <div className="progress-track"><i style={{ width: project.progress + "%", background: project.color }} /></div>
              <div className="project-stats">
                <span><strong>{project.progress}%</strong> 总进度</span>
                <span><strong>{projectTasks.length}</strong> 个任务</span>
                <span><strong>{projectTasks.filter((task) => task.status === "blocked").length}</strong> 个阻塞</span>
              </div>
              <div className="project-next">
                <span><Target size={15} /> 下一里程碑</span>
                <strong>{project.nextMilestone}</strong>
                <small>{project.due}</small>
              </div>
              <div className="project-card-foot">
                <span><Avatar name={project.owner} size="sm" /> {project.owner}</span>
                <span>进入空间 <ArrowRight size={15} /></span>
              </div>
            </button>
          );
        })}
      </div> : <section className="panel portfolio-view">
        <header><span>项目</span><span>健康度</span><span>当前阶段</span><span>下一里程碑</span><span>负责人</span><span>进度</span></header>
        {filtered.map((project) => <button key={project.id} onClick={() => navigate("/projects/" + project.id)}><span><i style={{background:project.color}} /><strong>{project.name}</strong><small>{project.client}</small></span><span><em className={"health-pill " + project.health}>{project.health}</em></span><span>{project.stage}</span><span><strong>{project.nextMilestone}</strong><small>{project.due}</small></span><span><Avatar name={project.owner} size="sm"/>{project.owner}</span><span>{project.progress}%<ChevronRight size={15}/></span></button>)}
      </section>}
      {createOpen && <CreateProject onClose={() => setCreateOpen(false)} onCreate={(project) => { setProjects((items) => [project, ...items]); setCreateOpen(false); notify("项目已创建，已进入项目空间"); navigate("/projects/" + project.id); }} />}
    </>
  );
}

function CreateProject({ onClose, onCreate }: { onClose: () => void; onCreate: (project: Project) => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", client: "", owner: user.name, due: "", milestone: "完成项目启动与范围确认" });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.client.trim()) return;
    setBusy(true);setError("");
    try {const created=await createProject({name:form.name.trim(),client:form.client.trim(),objective:`完成 ${form.name.trim()} 的项目目标`,next_milestone:form.milestone,due_at:null});onCreate(projectFromApi(created,0));}
    catch(reason){setError(reason instanceof ApiError?reason.message:"项目创建失败");}
    finally{setBusy(false);}
  };
  return <AppModal title="新建项目" subtitle="创建后进入独立项目空间，再逐步补充任务、资产、会议与 AI 上下文。" onClose={onClose} size="lg">
    <form className="form-stack" onSubmit={submit}>
      <label><span>项目名称 *</span><input autoFocus value={form.name} onChange={(event) => setForm({...form,name:event.target.value})} placeholder="例如：客户官网升级"/></label>
      <div className="form-grid"><label><span>客户 / 组织 *</span><input value={form.client} onChange={(event) => setForm({...form,client:event.target.value})} placeholder="例如：全意内部"/></label><label><span>负责人</span><input value={form.owner} disabled /></label></div>
      <div className="form-grid"><label><span>目标日期</span><input value={form.due} onChange={(event) => setForm({...form,due:event.target.value})}/></label><label><span>第一个里程碑</span><input value={form.milestone} onChange={(event) => setForm({...form,milestone:event.target.value})}/></label></div>
      <div className="ai-form-tip"><Sparkles size={17}/><span>创建后 AI 会根据项目目标建议第一批任务，但不会直接分发。</span></div>
      {error&&<p className="login-error">{error}</p>}
      <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!form.name.trim() || !form.client.trim() || busy}>{busy?"创建中…":"创建并进入项目"}</button></footer>
    </form>
  </AppModal>;
}

function CreateStageModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: (project: Project) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {event.preventDefault();if(!name.trim())return;setBusy(true);setError("");try{const result=await createStage(project.id,{name:name.trim(),owner_id:user.id,weight});onSaved(projectFromApi(result,0));}catch(reason){setError(reason instanceof ApiError?reason.message:"阶段创建失败");}finally{setBusy(false);}};
  return <AppModal title="新增项目阶段" subtitle="阶段使用独立状态，进度和风险由所属任务在服务端聚合。" onClose={onClose}><form className="form-stack" onSubmit={submit}><label><span>阶段名称</span><input autoFocus value={name} onChange={(event)=>setName(event.target.value)} placeholder="例如：方案设计"/></label><label><span>聚合权重</span><input type="number" min="0.1" max="100" step="0.1" value={weight} onChange={(event)=>setWeight(Number(event.target.value))}/></label>{error&&<p className="login-error">{error}</p>}<footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!name.trim()||busy}>{busy?"创建中…":"创建阶段"}</button></footer></form></AppModal>;
}

function ProjectSpace() {
  const { projectId = "" } = useParams();
  const { projects, setProjects, tasks, assets, openTask, openAsset, openPreview, notify } = useHub();
  const navigate = useNavigate();
  const location = useLocation();
  const project = projects.find((item) => item.id === projectId);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") === "ai" ? "AI 协作" : "总览");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createStageOpen, setCreateStageOpen] = useState(false);
  if (!project) return <Navigate to="/projects" replace />;
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const projectAssets = assets.filter((asset) => asset.scope.includes(project.client) || project.id === "p-quanyi");
  const tabs = ["总览", "任务", "AI 协作", "资产", "会议"];
  const advanceStage = async (stage: NonNullable<Project["stages"]>[number]) => {const next=stage.status==="PLANNED"?"ACTIVE":stage.status==="ACTIVE"?"WAITING_REVIEW":stage.status==="WAITING_REVIEW"?"DONE":null;if(!next)return;try{const result=await updateStage(stage.id,{status:next});setProjects((items)=>items.map((item)=>item.id===project.id?projectFromApi(result,0):item));notify("阶段状态已更新");}catch(reason){notify(reason instanceof ApiError?reason.message:"阶段更新失败");}};
  return (
    <div className={`project-space-page${tab === "AI 协作" ? " is-ai-chat" : ""}`}>
      <button className="back-button" onClick={() => navigate("/projects")}><ArrowLeft size={16} /> 返回项目</button>
      <section className="project-hero">
        <div className="project-identity">
          <span className="project-mark large" style={{ background: project.color }}>{project.client.slice(0, 1)}</span>
          <div>
            <span className="section-kicker">{project.client}</span>
            <h1>{project.name}</h1>
            <p>负责人 {project.owner} · 目标交付 {project.due}</p>
          </div>
        </div>
        <div className="project-hero-actions">
          <span className={"health-pill " + project.health}>{project.health}</span>
          <button className="button secondary" onClick={() => setTab("AI 协作")}><Sparkles size={16} /> AI 协作</button>
          <button className="button primary" onClick={() => setCreateTaskOpen(true)}><Plus size={16} /> 添加任务</button>
        </div>
      </section>
      <div className="project-tabs">
        {tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </div>

      {tab === "总览" && (
        <div className="project-overview-grid">
          <div className="project-overview-main">
            <section className="panel stage-panel">
              <div className="panel-title-row"><div><h2>项目阶段</h2><p>当前位于「{project.stage}」</p></div><div className="stage-panel-actions"><strong>{project.progress}%</strong><button className="button secondary compact" onClick={()=>setCreateStageOpen(true)}><Plus size={14}/> 新增阶段</button></div></div>
              <div className="stage-steps">
                {(project.stages?.length ? project.stages : [{id:"demo-stage",name:project.stage,position:1,status:"ACTIVE" as const,progress:project.progress,health:project.health}]).map((stage, index) => (
                  <div className={"stage-step " + (stage.status === "DONE" ? "complete" : stage.status === "ACTIVE" || stage.status === "WAITING_REVIEW" ? "current" : "")} key={stage.id}>
                    <span>{stage.status === "DONE" ? <Check size={14} /> : index + 1}</span>
                    <strong>{stage.name}<small>{stage.progress}% · {stage.health}</small></strong>
                    {stage.id!=="demo-stage"&&stage.status!=="DONE"&&<button className="text-button" onClick={()=>advanceStage(stage)}>{stage.status==="PLANNED"?"启动":stage.status==="ACTIVE"?"提交阶段验收":"验收通过"}</button>}
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-title-row"><div><h2>可执行任务</h2><p>优先显示当前阶段真正能推进的事项。</p></div><button className="text-button" onClick={() => setTab("任务")}>查看看板 <ArrowRight size={15} /></button></div>
              <div className="task-list">
                {projectTasks.filter((task) => task.status !== "external").map((task) => (
                  <button className="task-row" key={task.id} onClick={() => openTask(task)}>
                    <span className={"priority-dot " + task.priority} />
                    <div className="task-row-main"><strong>{task.title}</strong><span>{task.status === "blocked" && task.blockedReason ? `阻塞原因：${task.blockedReason}` : task.nextAction}</span></div>
                    <TaskParticipants task={task}/><ModePill mode={task.mode} /><StatusPill status={task.status}/><ChevronRight size={16}/>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <aside className="project-overview-side">
            <section className="panel risk-card">
              <div className="panel-title-row"><h2>风险与依赖</h2><AlertCircle size={18}/></div>
              <div className="risk-item amber"><strong>首页卖点仍待客户确认</strong><span>可能影响方案深化节点</span><button onClick={() => navigate("/help")}>发起协作</button></div>
              <div className="risk-item muted"><strong>等待产品参数表</strong><span>预计明天收到客户反馈</span></div>
            </section>
            <section className="panel">
              <div className="panel-title-row"><h2>最近资产</h2><button className="icon-button" onClick={() => setTab("资产")}><ChevronRight size={16}/></button></div>
              <div className="mini-file-list">{projectAssets.slice(0,3).map((asset) => <button key={asset.id} onClick={() => openAsset(asset)}><span><FileText size={16}/></span><p><strong>{asset.title}</strong><small>{asset.updatedAt}</small></p><ChevronRight size={14}/></button>)}</div>
            </section>
          </aside>
        </div>
      )}

      {tab === "任务" && <ProjectBoard tasks={projectTasks} />}
      {tab === "AI 协作" && <ProjectChat project={project} />}
      {tab === "资产" && (
        <section className="panel tab-panel">
          <div className="panel-title-row"><div><h2>项目资产</h2><p>任务、会议、交付物和项目知识共享同一上下文。</p></div><button className="button primary" onClick={() => navigate("/knowledge?create=1&space=" + encodeURIComponent(project.client))}><FilePlus2 size={16}/> 新建页面</button></div>
          <AssetTable assets={projectAssets.length ? projectAssets : assets.slice(0,3)} onSelect={openAsset} />
        </section>
      )}
      {tab === "会议" && (
        <section className="panel tab-panel">
          <div className="panel-title-row"><div><h2>会议与行动项</h2><p>会议结束后先审核候选任务，再正式进入执行。</p></div><button className="button primary" onClick={() => openPreview({eyebrow:"会议记录",title:"开始记录项目会议",description:"会议开始后会持续生成转写，结束时提取结论、风险和候选任务。",items:[{title:"确认参会成员",detail:"默认加入项目成员，也可邀请外部参与者"},{title:"记录或上传会议",detail:"支持实时转写与会后上传"},{title:"人工审核行动项",detail:"审核后才会成为正式任务"}],note:"原始转写会作为会议资产保存在当前项目。",primaryLabel:"进入会议记录"})}><Plus size={16}/> 记录会议</button></div>
          <div className="meeting-list">
            <div><span className="meeting-icon"><MessageSquareText size={18}/></span><p><strong>项目周会 · 8月18日</strong><small>42 分钟 · 6 位参与者 · 提取 3 个行动项</small></p><StatusPill status="candidate"/><button className="button secondary compact" onClick={() => openPreview({eyebrow:"会议纪要",title:"项目周会 · 8月18日",description:"首页优先建立品牌可信度和 AI 官网能力认知；核心卖点需在周三前确认。",items:[{title:"整理客户对首页卖点的反馈",detail:"负责人：廖婉琛 · 待审核"},{title:"补充解决方案案例依据",detail:"负责人：廖婉琛 · 待审核"},{title:"确认移动端导航范围",detail:"负责人：曹玉祥 · 待审核"}],primaryLabel:"去审核候选任务",primaryRoute:"/tasks"})}>查看纪要</button></div>
            <div><span className="meeting-icon muted"><MessageSquareText size={18}/></span><p><strong>需求访谈 · 8月12日</strong><small>58 分钟 · 已确认 5 个任务</small></p><StatusPill status="done"/><button className="button secondary compact" onClick={() => openPreview({eyebrow:"会议纪要",title:"需求访谈 · 8月12日",description:"访谈围绕用户角色、核心任务与资产协作方式展开。",items:[{title:"明确项目负责人与协作者边界"},{title:"区分知识页面和文件资产"},{title:"补齐 AI 执行的人工确认节点"}],note:"5 个行动项已审核并进入任务池。",primaryLabel:"查看相关任务",primaryRoute:"/tasks"})}>查看纪要</button></div>
          </div>
        </section>
      )}
      {createTaskOpen && <CreateTask onClose={() => setCreateTaskOpen(false)} defaultProjectId={project.id} />}
      {createStageOpen && <CreateStageModal project={project} onClose={()=>setCreateStageOpen(false)} onSaved={(saved)=>{setProjects((items)=>items.map((item)=>item.id===saved.id?saved:item));setCreateStageOpen(false);notify("阶段已创建");}}/>}
    </div>
  );
}

function ProjectBoard({ tasks }: { tasks: Task[] }) {
  type BoardColumnKey = "todo" | "active" | "review" | "waiting" | "done";
  const { openTask, setTasks, notify } = useHub();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<BoardColumnKey | null>(null);
  const [moveTask, setMoveTask] = useState<Task | null>(null);
  const [decisionTask, setDecisionTask] = useState<Task | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [waitingTask, setWaitingTask] = useState<Task | null>(null);
  const [waitingType, setWaitingType] = useState<"blocked" | "external">("blocked");
  const [waitingReason, setWaitingReason] = useState("");
  const draggedWithPointer = useRef(false);
  const columns: { key: BoardColumnKey; label: string; hint: string; statuses: TaskStatus[] }[] = [
    { key: "todo", label: "待开始", hint: "尚未启动", statuses: ["todo"] },
    { key: "active", label: "进行中", hint: "持续推进", statuses: ["progress", "ai"] },
    { key: "review", label: "待确认 / 验收", hint: "等待人工判断", statuses: ["confirm", "review"] },
    { key: "waiting", label: "阻塞 / 等待", hint: "需记录原因", statuses: ["blocked", "external"] },
    { key: "done", label: "已完成", hint: "验收后归档", statuses: ["done"] },
  ];
  const taskColumn = (task: Task): BoardColumnKey => columns.find((column) => column.statuses.includes(task.status))?.key || "todo";
  const draggedTask = tasks.find((task) => task.id === draggedTaskId) || null;
  const canMove = (task: Task, target: BoardColumnKey) => {
    const current = taskColumn(task);
    if (current === target || task.status === "done") return false;
    if (target === "done") return current === "review";
    if (target === "review") return current === "active";
    if (target === "active") return current === "todo" || current === "waiting" || current === "review";
    if (target === "todo") return current === "active" || current === "waiting";
    return target === "waiting" && current !== "done";
  };
  const updateTask = (task: Task, status: TaskStatus, nextAction: string, message: string, progress?: number, patch: Partial<Task> = {}) => {
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status, nextAction, ...(progress === undefined ? {} : { progress }), ...patch } : item));
    notify(message);
  };
  const requestMove = (task: Task, target: BoardColumnKey) => {
    const current = taskColumn(task);
    setMoveTask(null);
    if (current === target) return;
    if (!canMove(task, target)) {
      notify(target === "done" ? "请先提交到待确认 / 验收，再完成验收决策" : "当前状态不能直接流转到这里");
      return;
    }
    if (target === "done" || (current === "review" && target === "active")) {
      setDecisionTask(task);
      setDecisionNote("");
      return;
    }
    if (target === "waiting") {
      setWaitingTask(task);
      setWaitingType(task.status === "external" ? "external" : "blocked");
      setWaitingReason("");
      return;
    }
    if (target === "review") {
      const status: TaskStatus = task.mode === "ai" ? "confirm" : "review";
      updateTask(task, status, task.mode === "ai" ? "确认 AI 结果后进入验收" : "等待验收人检查交付物", "任务已提交人工确认，不会自动完成", Math.max(task.progress, 90));
      return;
    }
    if (target === "active") {
      updateTask(task, task.mode === "ai" ? "ai" : "progress", task.mode === "ai" ? "AI 正在继续执行" : "继续推进下一步工作", "任务已恢复进行中", Math.max(task.progress, 10), { blockedReason: undefined });
      return;
    }
    updateTask(task, "todo", "确认优先级后开始执行", "任务已放回待开始", 0);
  };
  const handleDragStart = (event: DragEvent<HTMLButtonElement>, task: Task) => {
    draggedWithPointer.current = true;
    setDraggedTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  };
  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setHoveredColumn(null);
    window.setTimeout(() => { draggedWithPointer.current = false; }, 0);
  };
  const handleDrop = (event: DragEvent<HTMLElement>, target: BoardColumnKey) => {
    event.preventDefault();
    const task = tasks.find((item) => item.id === (draggedTaskId || event.dataTransfer.getData("text/plain")));
    setDraggedTaskId(null);
    setHoveredColumn(null);
    if (task) requestMove(task, target);
  };
  const approve = () => {
    if (!decisionTask) return;
    updateTask(decisionTask, "done", "已验收并归档", "验收已通过，任务正式完成", 100);
    setDecisionTask(null);
    setDecisionNote("");
  };
  const reject = () => {
    if (!decisionTask || !decisionNote.trim()) return;
    updateTask(decisionTask, "progress", "根据验收意见修改后重新提交", "已退回修改，验收意见已记录", Math.min(decisionTask.progress, 90));
    setDecisionTask(null);
    setDecisionNote("");
  };
  const confirmWaiting = () => {
    if (!waitingTask || !waitingReason.trim()) return;
    updateTask(waitingTask, waitingType, waitingType === "blocked" ? "解决阻塞后恢复执行" : "收到外部资料后恢复执行", waitingType === "blocked" ? "已标记为阻塞并记录原因" : "已转为等待外部并记录等待对象", undefined, { blockedReason: waitingType === "blocked" ? waitingReason.trim() : undefined });
    setWaitingTask(null);
    setWaitingReason("");
  };
  return (
    <div className="project-board-wrap">
      <div className="kanban-interaction-guide">
        <span><GripVertical size={15}/> 拖动手柄流转状态</span>
        <span><ShieldCheck size={15}/> “已完成”必须经过人工验收</span>
      </div>
      <div className="board-scroll">
      <div className="kanban-board">
        {columns.map((column) => {
          const columnTasks = tasks.filter((task) => column.statuses.includes(task.status));
          const activeDrop = hoveredColumn === column.key && draggedTask;
          const validDrop = !!(activeDrop && canMove(activeDrop, column.key));
          return (
            <section
              className={`kanban-column${activeDrop ? validDrop ? " is-valid-drop" : " is-invalid-drop" : ""}${draggedTask ? " is-dragging-board" : ""}`}
              key={column.key}
              onDragEnter={() => setHoveredColumn(column.key)}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = validDrop ? "move" : "none"; }}
              onDrop={(event) => handleDrop(event, column.key)}
            >
              <header><div><strong>{column.label}</strong><small>{column.hint}</small></div><span>{columnTasks.length}</span></header>
              <div className="kanban-list">
                {columnTasks.map((task) => (
                  <article className={`kanban-card${draggedTaskId === task.id ? " is-dragging" : ""}`} key={task.id}>
                    <div className="kanban-card-top"><span className={"priority-dot " + task.priority}/><div><StatusPill status={task.status}/>{task.status !== "done" && <button className="kanban-drag-handle" draggable aria-label={`流转任务：${task.title}`} title="拖动流转状态；点击选择状态" onDragStart={(event) => handleDragStart(event, task)} onDragEnd={handleDragEnd} onClick={(event) => {event.stopPropagation(); if (!draggedWithPointer.current) setMoveTask(task);}}><GripVertical size={15}/></button>}</div></div>
                    <button className="kanban-card-open" onClick={() => openTask(task)}>
                      <strong>{task.title}</strong>
                      <small>{task.status === "blocked" && task.blockedReason ? `阻塞原因：${task.blockedReason}` : task.nextAction}</small>
                    </button>
                    <footer><ModePill mode={task.mode}/><span>{task.due}</span></footer>
                  </article>
                ))}
                {!columnTasks.length && <div className="kanban-empty">{activeDrop ? validDrop ? "松开后流转到这里" : column.key === "done" ? "需先提交验收" : "不能直接流转到这里" : "暂无任务"}</div>}
              </div>
            </section>
          );
        })}
      </div>
      </div>
      {moveTask && <AppModal title="流转任务状态" subtitle="点击选择目标状态；拖动与这里的规则一致。" onClose={() => setMoveTask(null)} size="sm"><div className="board-move-dialog"><div className="board-task-summary"><StatusPill status={moveTask.status}/><strong>{moveTask.title}</strong></div><div className="board-move-options">{columns.map((column) => {const available = canMove(moveTask, column.key); return <button key={column.key} disabled={!available} onClick={() => requestMove(moveTask, column.key)}><span><strong>{column.label}</strong><small>{column.key === "done" ? "选择后仍需完成验收决策" : column.hint}</small></span>{column.key === "done" && <ShieldCheck size={16}/>}<ChevronRight size={16}/></button>;})}</div><footer className="modal-actions"><button className="button secondary" onClick={() => setMoveTask(null)}>取消</button></footer></div></AppModal>}
      {decisionTask && <AppModal title="验收任务交付物" subtitle="拖动只发起验收，只有明确选择验收结果后才会改变任务状态。" onClose={() => {setDecisionTask(null); setDecisionNote("");}} size="md"><div className="board-decision-dialog"><div className="board-decision-rule"><ShieldCheck size={20}/><p><strong>人工验收节点</strong><span>系统不会因拖到“已完成”而自动完成任务。</span></p></div><div className="board-task-summary"><StatusPill status={decisionTask.status}/><div><strong>{decisionTask.title}</strong><small>交付物：{decisionTask.deliverable}</small></div></div><label className="board-decision-note"><span>验收意见</span><textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="通过时可补充说明；退回修改时请写明需要调整的内容。"/><small>退回修改必须填写意见，验收通过可直接确认。</small></label><footer className="modal-actions"><button className="button secondary" onClick={() => {setDecisionTask(null); setDecisionNote("");}}>暂不处理</button><button className="button review-reject" disabled={!decisionNote.trim()} onClick={reject}>退回修改</button><button className="button primary" onClick={approve}><Check size={16}/> 验收通过并完成</button></footer></div></AppModal>}
      {waitingTask && <AppModal title="记录阻塞或等待" subtitle="选择真实状态并留下恢复任务所需的信息。" onClose={() => {setWaitingTask(null); setWaitingReason("");}} size="md"><div className="board-waiting-dialog"><div className="board-task-summary"><StatusPill status={waitingTask.status}/><strong>{waitingTask.title}</strong></div><div className="waiting-type-options"><button className={waitingType === "blocked" ? "active blocked" : ""} onClick={() => setWaitingType("blocked")}><AlertCircle size={18}/><span><strong>已阻塞</strong><small>内部决策、资源或方案卡住，需要主动解决</small></span></button><button className={waitingType === "external" ? "active external" : ""} onClick={() => setWaitingType("external")}><Clock3 size={18}/><span><strong>等待外部</strong><small>正在等待客户、供应商或外部资料回复</small></span></button></div><label className="board-decision-note"><span>{waitingType === "blocked" ? "阻塞原因" : "等待对象与内容"}</span><textarea value={waitingReason} onChange={(event) => setWaitingReason(event.target.value)} placeholder={waitingType === "blocked" ? "说明卡在哪里、需要谁做什么决定…" : "说明在等谁、什么资料，以及预计回复时间…"}/></label><footer className="modal-actions"><button className="button secondary" onClick={() => {setWaitingTask(null); setWaitingReason("");}}>取消</button><button className="button primary" disabled={!waitingReason.trim()} onClick={confirmWaiting}>确认流转</button></footer></div></AppModal>}
    </div>
  );
}

function ProjectChat({ project }: { project: Project }) {
  const { notify, openCandidate, openPreview } = useHub();
  const location = useLocation();
  const launchPrompt = new URLSearchParams(location.search).get("prompt") || "";
  const [text, setText] = useState("");
  const [activeSession, setActiveSession] = useState(() => launchPrompt ? "专家协作 · 新对话" : "项目风险与下一步");
  const [messages, setMessages] = useState<{ role: "user" | "ai" | "system"; text: string }[]>(() => launchPrompt ? [
    { role: "user", text: launchPrompt },
    { role: "ai", text: `已进入「${project.name}」项目协作。我会让所选专家基于本项目的任务、会议和资产开始分析，并在这里返回结果。` },
  ] : [
    { role: "user", text: "帮我总结一下这个项目现在卡在哪里？" },
    { role: "ai", text: "当前主要风险是首页核心卖点仍待客户确认；建议先推进不依赖客户反馈的信息架构，并把卖点确认设为明天的外部等待提醒。" },
  ]);
  const [members, setMembers] = useState(() => Array.from(new Set([project.owner, "曹玉祥"])));
  const [memberPanel, setMemberPanel] = useState(false);
  const [chatContexts, setChatContexts] = useState<ChatContextItem[]>([]);
  const [thinking, setThinking] = useState(false);
  const inviteMember = (name: string) => {
    if (members.includes(name)) return;
    setMembers((items) => [...items, name]);
    setMessages((items) => [...items, { role: "system", text: name + " 已加入本项目 AI 协作 · 可查看完整历史并继续向 AI 提问" }]);
    notify("已邀请 " + name + " 加入「" + project.name + "」项目 AI 协作");
  };
  const send = () => {
    if (!text.trim() || thinking) return;
    const message = text;
    setMessages((items) => [...items, { role: "user", text: message }]);
    setText("");
    setThinking(true);
    window.setTimeout(() => {
      setMessages((items) => [...items, { role: "ai", text: "我已结合项目任务、会议和资产生成建议，并准备了 1 个候选任务，确认后可以进入任务池。" }]);
      setThinking(false);
    }, 1050);
  };
  const startSession = () => {
    setActiveSession("未命名项目对话");
    setMessages([{ role: "ai", text: "新对话已连接当前项目上下文。你希望先分析任务、风险、会议还是资产？" }]);
    notify("已新建项目对话");
  };
  return (
    <div className="project-chat-layout">
      <aside className="chat-sessions panel">
        <div className="panel-title-row"><h2>项目对话</h2><button className="icon-button" onClick={startSession} aria-label="新建项目对话"><Plus size={16}/></button></div>
        {["项目风险与下一步", "首页信息架构讨论", "会议行动项整理"].map((name, index) => <button className={activeSession === name ? "active" : ""} key={name} onClick={() => {setActiveSession(name); setMessages([{role:"ai",text:"已打开「" + name + "」的历史记录。你可以继续基于同一项目上下文向 AI 提问。"}]);}}><MessageSquareText size={15}/><span><strong>{name}</strong><small>{index === 0 ? "刚刚" : index + 1 + " 天前"}</small></span></button>)}
      </aside>
      <section className="project-chat-main panel">
        <header>
          <AssistantLifeOrb size="small" />
          <div><strong>{project.name} · 项目 AI 协作</strong><small>仅限本项目 · 已连接 6 个任务、4 份资产、2 次会议</small></div>
          <div className="project-chat-header-actions">
            <div className="avatar-stack compact">{members.slice(0, 3).map((name) => <Avatar name={name} size="sm" key={name}/>)}</div>
            <button className="button primary compact" onClick={() => setMemberPanel(true)}><UserPlus size={15}/> 邀请项目成员</button>
          </div>
        </header>
        <div className="chat-messages">
          <div className="project-scope-note"><FolderKanban size={15}/><span><strong>项目边界已锁定</strong>AI 只读取「{project.name}」中的任务、会议、资产和项目沟通，不会读取你的其他项目或个人工作。</span></div>
          {messages.map((message, index) => message.role === "system" ? <div className="chat-system-message" key={index}><Users size={13}/>{message.text}</div> : <div className={"chat-message " + message.role} key={index}>{message.role === "ai" && <AssistantLifeOrb size="tiny" state="active" />}<p>{message.text}</p></div>)}
          {thinking && <div className="chat-message ai is-thinking"><AssistantLifeOrb size="tiny" state="thinking" /><div className="ai-thinking-copy"><strong>正在理解项目上下文</strong><span className="thinking-dots"><i/><i/><i/></span><small>连接任务、会议与资产...</small></div></div>}
          <div className="inline-candidate">
            <span><Sparkles size={16}/></span>
            <div><small>候选任务</small><strong>明天跟进客户确认首页核心卖点</strong><p>建议负责人：{project.owner} · 截止：明天 17:00</p></div>
            <button className="button primary compact" onClick={() => openCandidate({id:"c-project-" + Date.now(),title:"明天跟进客户确认首页核心卖点",source:"AI Chat",sourceDetail:project.name + " · 项目对话",confidence:91,suggestedOwner:project.owner,suggestedProject:project.name,due:"明天 17:00",reason:"项目风险分析中识别到明确的外部确认对象、负责人和时间要求。"})}>审核创建</button>
          </div>
          <div className="project-handoff-card">
            <span className="handoff-file-icon"><FileText size={18}/></span>
            <div><small>项目交付物 · 可交接</small><strong>{project.name} 开发说明.md</strong><p>已整理目标、页面范围、状态说明与验收标准。邀请研发后，对方可先阅读完整 AI 历史，再直接向 AI 追问实现细节。</p></div>
            <div className="handoff-actions"><button className="button secondary compact" onClick={() => openPreview({eyebrow:"项目交付物",title:project.name + " 开发说明.md",description:"这份说明由当前项目 AI 对话持续整理，并与本项目任务、会议和资产保持关联。",items:[{title:"产品目标与范围",detail:"明确本次交付包含与不包含的内容"},{title:"页面、状态与交互",detail:"覆盖正常、加载、空白、失败和恢复路径"},{title:"研发验收标准",detail:"按任务节点逐项确认，不依赖聊天口头同步"}],note:"邀请成员后，对方可以查看生成这份文档的完整 AI 对话。",primaryLabel:"返回项目 AI 协作"})}>预览说明</button><button className="button primary compact" onClick={() => setMemberPanel(true)}><UserPlus size={15}/> 邀请成员接手</button></div>
          </div>
        </div>
        <form className="chat-composer" onSubmit={(event) => {event.preventDefault(); send();}}>
          <ChatContextChips items={chatContexts} onChange={setChatContexts}/>
          <ChatContextPicker project={project} selected={chatContexts} onChange={setChatContexts}/>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="询问项目进展，或让 AI 执行一个动作..." />
          <button className="send-button" aria-label="发送" disabled={!text.trim() || thinking}><Send size={16}/></button>
        </form>
      </section>
      <aside className="chat-context panel">
        <h2>项目工作范围</h2>
        <div className="context-section"><span>协作成员</span><div className="avatar-stack">{members.map((name) => <Avatar name={name} key={name}/>)}</div><button className="text-button" onClick={() => setMemberPanel(true)}>管理成员 <ChevronRight size={14}/></button><p>成员共享本项目 AI 历史，并各自继续向 AI 提问。</p></div>
        <div className="context-section"><span>已连接能力</span><strong><WandSparkles size={15}/> 产品策略专家</strong><strong><Boxes size={15}/> 客户需求分析</strong></div>
        <div className="context-section"><span>项目资料</span><p>6 个项目任务</p><p>4 份项目资产</p><p>2 次项目会议</p></div>
        <div className="project-boundary-card"><CheckCircle2 size={16}/><p><strong>不会跨出本项目</strong><span>个人待办和其他项目不会进入这段对话。</span></p></div>
      </aside>
      {memberPanel && <ChatMemberPanel members={members} onInvite={inviteMember} onClose={() => setMemberPanel(false)} title={project.name + " 协作成员"} accessLabel="已加入项目 AI 协作" inviteLabel="邀请成员接手项目" footerText="被邀请人可以查看本项目完整 AI 历史、关联任务与交付物，并继续向 AI 询问实现细节。" />}
    </div>
  );
}

function TaskPool() {
  const { tasks, candidates, setTasks, notify, openTask, openCandidate } = useHub();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const decisionOnly = new URLSearchParams(location.search).get("focus") === "decisions";
  const [tab, setTab] = useState("我的任务");
  const [claimed, setClaimed] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [query, setQuery] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const filteredTasks = tasks.filter((task) => {
    const matchesQuery = task.title.includes(query) || task.project.includes(query);
    const matchesOwner = !ownedOnly || task.owner === "廖婉琛";
    const matchesDecision = !decisionOnly
      || (task.apiStatus === "WAITING_HUMAN_CONFIRMATION" && task.owner === user.name)
      || (task.apiStatus === "WAITING_REVIEW" && task.reviewer === user.name)
      || (task.apiStatus === "PENDING_OWNER_CONFIRMATION" && task.owner === user.name);
    return matchesQuery && matchesOwner && matchesDecision;
  });
  const activeTasks = filteredTasks.filter((task) => task.status !== "done" && (statusFilter === "全部状态" || statusMeta[task.status].label === statusFilter));
  const completedTasks = filteredTasks.filter((task) => task.status === "done");
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const claim = (task: Task) => {
    setClaimed((ids) => [...ids, task.id]);
    setTasks((items) => [{ ...task, owner: "廖婉琛", source: "开放任务池" }, ...items]);
    notify("任务已认领，已加入「我的任务」");
  };
  return (
    <>
      <PageHeader title="任务池" description="进行中任务、已完成归档、开放认领和 AI 候选任务在一个地方完成流转。" action={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16}/> 新建任务</button>} />
      <div className="tab-bar">
        {["我的任务", "开放任务", "候选任务", "已完成任务"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}{item === "候选任务" && <span>{candidates.length}</span>}{item === "已完成任务" && <span>{completedCount}</span>}</button>)}
      </div>
      {(tab === "我的任务" || tab === "已完成任务") && (
        <section className="panel table-panel">
          <div className="table-toolbar">
            <label className="table-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务或项目" /></label>
            {decisionOnly && <button className="task-focus-filter" onClick={() => navigate("/tasks", {replace:true})}><Target size={14}/> 待我决策 <X size={13}/></button>}
            {tab === "我的任务" && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>全部状态</option><option>进行中</option><option>AI 执行中</option><option>待我确认</option><option>待验收</option><option>已阻塞</option><option>等待外部</option></select>}
            <button className={"button secondary compact " + (ownedOnly ? "active" : "")} onClick={() => setOwnedOnly((value) => !value)}><Users size={15}/> {ownedOnly ? "已筛选：我负责的" : "我负责的"}</button>
          </div>
          <TaskTable tasks={tab === "已完成任务" ? completedTasks : activeTasks} onOpen={openTask} />
        </section>
      )}
      {tab === "开放任务" && (
        <div className="open-task-grid">
          {openTasks.map((task) => (
            <article className="open-task-card" key={task.id}>
              <div><StatusPill status="todo"/><span className="points-tag">+8 贡献分</span></div>
              <h3>{task.title}</h3><p>{task.description}</p>
              <div className="open-task-meta"><span><BriefcaseBusiness size={14}/>{task.project}</span><span><Clock3 size={14}/>{task.due}</span></div>
              <button disabled={claimed.includes(task.id)} className={"button full " + (claimed.includes(task.id) ? "disabled" : "primary")} onClick={() => claim(task)}>{claimed.includes(task.id) ? <><Check size={16}/> 已认领</> : "认领任务"}</button>
            </article>
          ))}
        </div>
      )}
      {tab === "候选任务" && (
        <section className="candidate-review-list">
          <div className="candidate-info-banner"><Sparkles size={20}/><div><strong>AI 只负责发现，正式创建前由你确认</strong><span>检查负责人、截止时间、项目与交付物，避免错误任务进入团队。</span></div></div>
          {candidates.map((candidate) => (
            <button className="candidate-wide" key={candidate.id} onClick={() => openCandidate(candidate)}>
              <span className="source-icon large"><Sparkles size={18}/></span>
              <div className="candidate-wide-main"><span>{candidate.source} · {candidate.sourceDetail}</span><strong>{candidate.title}</strong><small>{candidate.reason}</small></div>
              <div className="candidate-suggestion"><span>建议负责人</span><strong>{candidate.suggestedOwner}</strong></div>
              <div className="confidence"><span>{candidate.confidence}%</span><small>置信度</small></div>
              <span className="button primary compact">审核</span>
            </button>
          ))}
          {!candidates.length && <EmptyState icon={<CheckCircle2/>} title="候选任务已处理完" description="AI 新发现的任务会先进入这里，等待人工确认。" />}
        </section>
      )}
      {createOpen && <CreateTask onClose={() => setCreateOpen(false)} />}
    </>
  );
}

function TaskTable({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  return (
    <div className="data-table">
      <div className="data-row header"><span>任务</span><span>状态</span><span>执行方式</span><span>负责人</span><span>截止时间</span><span /></div>
      {tasks.map((task) => (
        <button className="data-row" key={task.id} onClick={() => onOpen(task)}>
          <span className="title-cell"><i className={"priority-dot " + task.priority}/><span><strong>{task.title}</strong><small>{task.project}</small></span></span>
          <span><StatusPill status={task.status}/></span>
          <span><ModePill mode={task.mode}/></span>
          <span className="owner-cell"><Avatar name={task.owner} size="sm"/>{task.owner}</span>
          <span className="due-cell">{task.due}</span>
          <span><ChevronRight size={16}/></span>
        </button>
      ))}
      {!tasks.length && <EmptyState icon={<ListChecks/>} title="没有匹配的任务" description="调整筛选条件，或创建一个新任务。" />}
    </div>
  );
}

function HelpCenter() {
  const { helps, setHelps, notify, setAssets, setContributions } = useHub();
  const [createOpen, setCreateOpen] = useState(false);
  const update = (id: string, patch: Partial<HelpRequest>) => setHelps((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const resolve = (help: HelpRequest) => {
    update(help.id, { status: "resolved" });
    setAssets((items) => [{ id: "a-" + Date.now(), title: help.title, type: "知识", scope: "企业资产 / 求助沉淀", updatedAt: "刚刚", owner: help.author, summary: help.aiAnswer, tags: ["求助", "知识沉淀"] }, ...items]);
    setContributions((items) => ["解决求助「" + help.title + "」 · +5", ...items]);
    notify("求助已解决，并生成一份知识草稿");
  };
  return (
    <>
      <PageHeader title="智能求助" description="AI 先检索和分析；无法解决时再把问题推给最合适的人。" action={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16}/> 发布求助</button>} />
      <div className="help-layout">
        <section className="help-feed">
          {helps.map((help) => (
            <article className="help-card" key={help.id}>
              <header><div><span className={"urgency " + help.urgency}>{help.urgency}</span><span>{help.project}</span></div><span className={"help-status " + help.status}>{help.status === "ai" ? "AI 已回答" : help.status === "expert" ? "等待专家" : help.status === "answered" ? "专家已回答" : "已解决"}</span></header>
              <h2>{help.title}</h2><div className="help-author"><Avatar name={help.author} size="sm"/><span>{help.author} 发起</span></div>
              <div className="ai-answer"><span className="assistant-orb tiny"><Sparkles size={12}/></span><div><strong>AI 初步分析</strong><p>{help.aiAnswer}</p></div></div>
              {help.expert && <div className="expert-routing"><Users size={17}/><span>已推荐并推送给 <strong>{help.expert}</strong></span></div>}
              {help.status !== "resolved" && <footer><button className="button primary compact" onClick={() => resolve(help)}>已解决，沉淀知识</button>{help.status === "ai" && <button className="button secondary compact" onClick={() => {update(help.id,{ status:"expert", expert:"产品策略专家 · 叶青" }); notify("已推送给最合适的专家");}}>仍未解决，转给专家</button>}</footer>}
            </article>
          ))}
        </section>
        <aside className="help-aside">
          <section className="panel help-guide"><span className="assistant-orb small"><Sparkles size={16}/></span><h2>让问题更快被解决</h2><p>写清楚当前目标、已经尝试过什么、卡在哪里，以及期望获得什么结果。</p><ul><li><Check size={14}/> AI 先检索企业和项目资产</li><li><Check size={14}/> 自动推荐最合适的成员或专家</li><li><Check size={14}/> 解决后可一键沉淀为知识</li></ul></section>
          <section className="panel"><div className="panel-title-row"><h2>本周求助贡献</h2><Trophy size={18}/></div><div className="helper-ranking"><span><Avatar name="曹玉祥"/><strong>曹玉祥</strong><em>解决 4 次</em></span><span><Avatar name="TRoY"/><strong>TRoY</strong><em>解决 3 次</em></span></div></section>
        </aside>
      </div>
      {createOpen && <CreateHelp onClose={() => setCreateOpen(false)} />}
    </>
  );
}

function KnowledgeSpace() {
  const { knowledgePages, setKnowledgePages, assets, setAssets, notify, openPreview, openAsset } = useHub();
  const location = useLocation();
  const requestedPage = new URLSearchParams(location.search).get("page");
  const requestedCreate = new URLSearchParams(location.search).get("create") === "1";
  const requestedSpace = new URLSearchParams(location.search).get("space") as KnowledgePage["space"] | null;
  const [selectedId, setSelectedId] = useState(requestedPage || knowledgePages[0]?.id || "");
  const [createOpen, setCreateOpen] = useState(requestedCreate);
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertLine, setInsertLine] = useState(0);
  const [inlineBlocks, setInlineBlocks] = useState<Array<{id:string;pageId:string;anchor:number;type:"image"|"file"|"table";title:string;src?:string;caption:string}>>([]);
  const [activityFilter, setActivityFilter] = useState<"全部动态" | "与我相关">("全部动态");
  const [rightOpen, setRightOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionType, setMentionType] = useState<"同事" | "资产" | "页面">("同事");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageQuery, setPageQuery] = useState("");
  const knowledgeActivities = [
    { id: "ka-1", pageId: "kp-002", actor: "徐泉", action: "在页面中提及了你", detail: "@廖婉琛 缺少的客户资料我列出来了，请确认是否需要本周补齐。", time: "18 分钟前", relatedToMe: true, kind: "mention" },
    { id: "ka-2", pageId: "kp-001", actor: "曹玉祥", action: "回复了你的提及", detail: "我会补充移动端通知与知识页面共建的边界说明。", time: "35 分钟前", relatedToMe: true, kind: "reply" },
    { id: "ka-3", pageId: "kp-003", actor: "AI 知识助手", action: "发布了知识快照", detail: "《外部资料等待处理规范》已沉淀为可引用资产。", time: "昨天 18:20", relatedToMe: false, kind: "publish" },
    { id: "ka-4", pageId: "kp-002", actor: "TRoY", action: "更新了页面内容", detail: "补充了解决方案区的客户证据和页面行动路径。", time: "昨天 16:08", relatedToMe: false, kind: "edit" },
  ] as const;
  const selected = knowledgePages.find((page) => page.id === selectedId) || knowledgePages[0];
  const visibleActivities = knowledgeActivities.filter((item) => activityFilter === "全部动态" || item.relatedToMe);
  const currentPageMentions = knowledgeActivities.filter((item) => item.pageId === selected?.id && item.kind === "mention").length;
  const spaces = ["全意内部", "凡诺科技", "康福来"] as const;

  useEffect(() => {
    if (requestedPage && knowledgePages.some((page) => page.id === requestedPage)) setSelectedId(requestedPage);
  }, [requestedPage]);
  useEffect(() => { if (requestedCreate) setCreateOpen(true); }, [requestedCreate]);
  useEffect(() => { setInsertLine(0); setInsertOpen(false); }, [selectedId]);

  if (!selected) return <EmptyState icon={<BookOpen/>} title="还没有知识页面" description="新建一个空白页面，开始整理和共建团队知识。" action={<button className="button primary" onClick={() => setCreateOpen(true)}>新建页面</button>} />;

  const updateSelected = (patch: Partial<KnowledgePage>) => {
    setKnowledgePages((pages) => pages.map((page) => page.id === selected.id ? { ...page, ...patch, updatedAt: "刚刚自动保存" } : page));
  };
  const insertMention = (value: string, type: "同事" | "资产" | "页面", id?: string) => {
    const token = type === "同事" ? "@" + value : "@" + type + "「" + value + "」";
    const lines = selected.content.split("\n");
    lines[insertLine] = (lines[insertLine] || "").replace(/@[^@\s]*$/, token + " ");
    updateSelected({
      content: lines.join("\n"),
      assetIds: type === "资产" && id ? Array.from(new Set([...selected.assetIds, id])) : selected.assetIds,
    });
    setMentionOpen(false);
  };
  const publishSnapshot = () => {
    const exists = assets.some((asset) => asset.title === selected.title + " · 发布快照");
    if (!exists) setAssets((items) => [{ id: "a-pub-" + Date.now(), title: selected.title + " · 发布快照", type: "文档", scope: "企业资产 / 知识快照", updatedAt: "刚刚", owner: "廖婉琛", summary: selected.content.slice(0, 80) || "知识页面发布快照", tags: ["知识快照", selected.space] }, ...items]);
    notify(exists ? "该页面已经发布过快照，可在资产库查看" : "页面已发布为资产快照，后续编辑不会覆盖该版本");
  };
  const insertTable = () => {
    setInlineBlocks((blocks) => [...blocks, {id:"kb-"+Date.now(),pageId:selected.id,anchor:insertLine,type:"table",title:"表格",caption:""}]);
    setInsertOpen(false);
    notify("表格已插入，可直接修改单元格内容");
  };
  const insertLocalFile = (file: File, type: "image" | "file") => {
    setInlineBlocks((blocks) => [...blocks, {id:"kb-"+Date.now(),pageId:selected.id,anchor:insertLine,type,title:file.name,src:type === "image" ? URL.createObjectURL(file) : undefined,caption:""}]);
    setInsertOpen(false);
    notify(type === "image" ? "图片已插入正文，可在下方补充说明" : "文件已插入正文，可补充用途说明");
  };
  const updateInlineCaption = (id: string, caption: string) => setInlineBlocks((blocks) => blocks.map((block) => block.id === id ? {...block,caption} : block));
  const removeInlineBlock = (id: string) => setInlineBlocks((blocks) => blocks.filter((block) => block.id !== id));
  const updateContentLine = (lineIndex: number, value: string) => {
    const lines = selected.content.split("\n");
    const replacement = value.split("\n");
    lines.splice(lineIndex, 1, ...replacement);
    updateSelected({content:lines.join("\n")});
    setInsertLine(lineIndex + replacement.length - 1);
  };
  const mentionItems = mentionType === "同事" ? teamMembers.filter((name) => name !== "廖婉琛").map((name) => ({ id: name, name, meta: memberRole(name) })) : mentionType === "资产" ? assets.map((asset) => ({ id: asset.id, name: asset.title, meta: asset.type + " · " + asset.scope })) : knowledgePages.filter((page) => page.id !== selected.id).map((page) => ({ id: page.id, name: page.title, meta: page.space + " · " + page.parent }));

  return (
    <div className={`knowledge-workspace${rightOpen ? " activity-open" : ""}`}>
      <aside className="knowledge-sidebar">
        <header><div><BookOpen size={19}/><strong>知识空间</strong></div><button className="icon-button" onClick={() => setCreateOpen(true)} aria-label="新建页面"><Plus size={17}/></button></header>
        <label><Search size={15}/><input value={pageQuery} onChange={(event) => setPageQuery(event.target.value)} placeholder="搜索页面..." /></label>
        <div className="knowledge-tree-scroll">
          {spaces.map((space) => <section key={space}><div className="knowledge-space-name"><ChevronDown size={14}/><span className={"tree-dot " + (space === "全意内部" ? "green" : space === "凡诺科技" ? "blue" : "orange")}/><strong>{space}</strong></div>{knowledgePages.filter((page) => page.space === space && page.title.includes(pageQuery)).map((page) => <button className={page.id === selected.id ? "active" : ""} key={page.id} onClick={() => setSelectedId(page.id)}><BookOpen size={15}/><span><strong>{page.title}</strong><small>{page.parent} · {page.updatedAt}</small></span><MoreHorizontal size={15}/></button>)}</section>)}
          {pageQuery && !knowledgePages.some((page) => page.title.includes(pageQuery)) && <EmptyState icon={<Search/>} title="没有匹配页面" description="换一个关键词，或新建页面。" />}
        </div>
        <button className="new-knowledge-page" onClick={() => setCreateOpen(true)}><Plus size={16}/> 新建页面</button>
        <div className="knowledge-assets-link"><Library size={16}/><p><strong>资产库</strong><small>文件和正式交付物独立管理</small></p><NavLink to="/assets"><ChevronRight size={15}/></NavLink></div>
      </aside>

      <section className="knowledge-page-area">
        <header className="knowledge-toolbar">
          <div><span>{selected.space}</span><ChevronRight size={13}/><strong>{selected.parent}</strong></div>
          <div className="knowledge-toolbar-actions"><div className="presence"><Avatar name="廖婉琛" size="sm"/><Avatar name="曹玉祥" size="sm"/><span>2 人在线</span></div><button className={`button secondary compact${rightOpen ? " active" : ""}`} aria-expanded={rightOpen} aria-controls="knowledge-activity-drawer" onClick={() => setRightOpen(!rightOpen)}><Activity size={15}/> 空间动态</button><button className="button secondary compact" onClick={publishSnapshot}>发布为资产</button><button className="icon-button" onClick={() => openPreview({eyebrow:"页面操作",title:"页面管理与权限",description:"当前页面由廖婉琛创建，属于「" + selected.space + "」。",items:[{title:"移动页面",detail:"调整所属空间或上级页面"},{title:"权限设置",detail:"当前空间成员可编辑，其他成员只读"},{title:"版本历史",detail:"查看自动保存记录并恢复旧版本"}],note:"删除、移动和权限变更都会保留审计记录。",primaryLabel:"查看版本记录"})}><MoreHorizontal size={17}/></button></div>
        </header>
        <div className="knowledge-canvas-scroll">
          <article className="knowledge-canvas">
            <div className="page-status-line"><span><CheckCircle2 size={14}/> {selected.updatedAt}</span><span>正文支持图片、文件和表格内容块</span></div>
            <textarea className="knowledge-title-input" rows={2} value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })}/>
            <div className="knowledge-meta"><span><Avatar name={selected.owner} size="sm"/> {selected.owner}</span><span>·</span><span>{selected.space}</span><span>·</span><span>持续共建</span>{currentPageMentions > 0 && <><span>·</span><span>{currentPageMentions} 条提及</span></>}</div>
            <div className="knowledge-editor-wrap">
              <div className="knowledge-block-editor">
                {selected.content.split("\n").map((line,lineIndex) => <div className="knowledge-flow-unit" key={`${selected.id}-${lineIndex}`}>
                  <div className={`knowledge-text-block${insertLine === lineIndex ? " active" : ""}`}>
                    {insertLine === lineIndex && <div className="knowledge-block-insert">
                      <button className="knowledge-insert-trigger" aria-label="插入内容" aria-expanded={insertOpen} onClick={() => setInsertOpen((value) => !value)}><Plus size={17}/></button>
                      {insertOpen && <div className="knowledge-insert-menu" role="menu">
                        <button role="menuitem" onClick={() => imageInputRef.current?.click()}><span><Upload size={16}/></span><p><strong>图片</strong><small>插入在当前段落后，并添加说明</small></p></button>
                        <button role="menuitem" onClick={() => fileInputRef.current?.click()}><span><FileUp size={16}/></span><p><strong>文件</strong><small>插入在当前段落后，并补充用途</small></p></button>
                        <button role="menuitem" onClick={insertTable}><span><BarChart3 size={16}/></span><p><strong>表格</strong><small>插入在当前段落后，可直接编辑</small></p></button>
                      </div>}
                    </div>}
                    <textarea rows={Math.max(1,Math.ceil(line.length/54))} value={line} onFocus={() => {setInsertLine(lineIndex);setInsertOpen(false);}} onChange={(event) => {updateContentLine(lineIndex,event.target.value);setMentionOpen(/@[^@\s]*$/.test(event.target.value));}} placeholder={lineIndex === 0 ? "输入正文；当前行左侧的 ＋ 可插入图片、文件和表格…" : "输入内容"}/>
                  </div>
                  {mentionOpen && insertLine === lineIndex && <div className="knowledge-mention-menu"><header>{(["同事", "资产", "页面"] as const).map((item) => <button className={mentionType === item ? "active" : ""} key={item} onClick={() => setMentionType(item)}>{item}</button>)}</header><div>{mentionItems.map((item) => <button key={item.id} onClick={() => insertMention(item.name, mentionType, item.id)}>{mentionType === "同事" ? <Avatar name={item.name} size="sm"/> : mentionType === "资产" ? <FileText size={16}/> : <BookOpen size={16}/>}<p><strong>{item.name}</strong><small>{item.meta}</small></p><span>插入</span></button>)}</div></div>}
                  {inlineBlocks.filter((block) => block.pageId === selected.id && block.anchor === lineIndex).map((block) => <section className={`knowledge-inline-block ${block.type}`} key={block.id}>
                    <button className="knowledge-block-remove" aria-label={`删除${block.title}`} onClick={() => removeInlineBlock(block.id)}><X size={14}/></button>
                    {block.type === "image" && <img src={block.src} alt={block.caption || block.title}/>} 
                    {block.type === "file" && <div className="knowledge-inline-file"><span><FileText size={19}/></span><p><strong>{block.title}</strong><small>正文内文件</small></p></div>}
                    {block.type === "table" && <table><tbody><tr><th contentEditable suppressContentEditableWarning>列 1</th><th contentEditable suppressContentEditableWarning>列 2</th><th contentEditable suppressContentEditableWarning>列 3</th></tr><tr><td contentEditable suppressContentEditableWarning>内容</td><td contentEditable suppressContentEditableWarning>内容</td><td contentEditable suppressContentEditableWarning>内容</td></tr></tbody></table>}
                    {block.type !== "table" && <input value={block.caption} onChange={(event) => updateInlineCaption(block.id,event.target.value)} placeholder={block.type === "image" ? "添加图片说明…" : "添加文件用途说明…"}/>} 
                  </section>)}
                </div>)}
                <input ref={imageInputRef} className="knowledge-hidden-input" type="file" accept="image/*" onChange={(event) => {const file=event.target.files?.[0]; if(file) insertLocalFile(file,"image"); event.currentTarget.value="";}} />
                <input ref={fileInputRef} className="knowledge-hidden-input" type="file" onChange={(event) => {const file=event.target.files?.[0]; if(file) insertLocalFile(file,"file"); event.currentTarget.value="";}} />
              </div>
            </div>
          </article>
        </div>
      </section>

      {rightOpen && <aside id="knowledge-activity-drawer" className="knowledge-collaboration knowledge-global-activity" aria-label="知识空间动态">
        <header className="knowledge-activity-head"><div><p><strong>知识空间动态</strong><small>全部空间的提及、回复与内容更新</small></p></div><button className="icon-button" onClick={() => setRightOpen(false)} aria-label="关闭空间动态"><X size={17}/></button></header>
        <div className="knowledge-activity-filter">{(["全部动态", "与我相关"] as const).map((filter) => <button className={activityFilter === filter ? "active" : ""} key={filter} onClick={() => setActivityFilter(filter)}>{filter}{filter === "与我相关" && <span>{knowledgeActivities.filter((item) => item.relatedToMe).length}</span>}</button>)}</div>
        <div className="knowledge-global-feed">{visibleActivities.length ? visibleActivities.map((item) => {const page = knowledgePages.find((candidate) => candidate.id === item.pageId); return <button key={item.id} onClick={() => {if (page) setSelectedId(page.id); notify("已定位到「" + (page?.title || "知识页面") + "」");}}><Avatar name={item.actor}/><div><header><strong>{item.actor}</strong><small>{item.time}</small></header><p>{item.action}</p><blockquote><MentionText text={item.detail}/></blockquote><footer><BookOpen size={13}/><span>{page?.space || "知识空间"} · {page?.title || "页面已归档"}</span><ChevronRight size={14}/></footer></div></button>}) : <EmptyState icon={<Activity/>} title="暂无相关动态" description="当有人在知识页面中提及或回复你时，会集中出现在这里。" />}</div>
        <div className="knowledge-activity-note"><AtSign size={14}/><p><strong>页面正文负责共建</strong><small>在正文中使用 @ 通知同事；这里仅汇总跨页面事件，不重复创建一套评论区。</small></p></div>
      </aside>}

      {createOpen && <CreateKnowledgePage defaultSpace={requestedSpace || undefined} onClose={() => setCreateOpen(false)} onCreate={(page) => {setKnowledgePages((items) => [page, ...items]); setSelectedId(page.id); setCreateOpen(false); notify("空白页面已创建，可以开始编辑");}} />}
    </div>
  );
}

function CreateKnowledgePage({ onClose, onCreate, defaultSpace }: { onClose: () => void; onCreate: (page: KnowledgePage) => void; defaultSpace?: KnowledgePage["space"] }) {
  const [title, setTitle] = useState("");
  const [space, setSpace] = useState<KnowledgePage["space"]>(defaultSpace || "全意内部");
  const [template, setTemplate] = useState("空白页面");
  return <AppModal title="新建知识页面" subtitle="页面用于持续编辑与协作，不会自动进入资产库。" onClose={onClose}><form className="form-stack" onSubmit={(event) => {event.preventDefault(); if (!title.trim()) return; onCreate({id:"kp-"+Date.now(),title:title.trim(),space,parent:space === "全意内部" ? "产品与研发" : "项目知识",content:template === "空白页面" ? "" : template === "会议记录" ? "会议主题\n\n参与成员\n\n讨论结论\n\n下一步行动" : "背景\n\n目标\n\n当前进展\n\n风险与下一步",updatedAt:"刚刚自动保存",owner:"廖婉琛",assetIds:[]});}}><label><span>页面标题 *</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：客户访谈结论"/></label><label><span>所属空间</span><select value={space} onChange={(event) => setSpace(event.target.value as KnowledgePage["space"])}><option>全意内部</option><option>凡诺科技</option><option>康福来</option></select></label><label><span>开始方式</span><div className="page-template-options">{["空白页面","会议记录","项目说明"].map((item) => <button type="button" className={template === item ? "active" : ""} key={item} onClick={() => setTemplate(item)}><BookOpen size={17}/><strong>{item}</strong><small>{item === "空白页面" ? "自由组织内容" : "带基础结构"}</small></button>)}</div></label><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!title.trim()}>创建并编辑</button></footer></form></AppModal>;
}

function AssetReferencePicker({ assets, selectedIds, onSelect, onClose }: { assets: Asset[]; selectedIds: string[]; onSelect: (asset: Asset) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const results = assets.filter((asset) => asset.title.includes(query));
  return <AppModal title="引用资产" subtitle="资产保留在资产库中，页面只建立引用关系。" onClose={onClose} size="lg"><label className="search-modal-input"><Search size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件、方案或会议资料..."/></label><div className="asset-reference-list">{results.map((asset) => <button key={asset.id} disabled={selectedIds.includes(asset.id)} onClick={() => onSelect(asset)}><span className={"file-type " + asset.type}><FileText size={17}/></span><p><strong>{asset.title}</strong><small>{asset.scope} · {asset.updatedAt}</small></p><span>{selectedIds.includes(asset.id) ? "已引用" : "引用"}</span></button>)}</div></AppModal>;
}

type AssetFolder = {
  id: string;
  name: string;
  parentId: string | null;
  owner: string;
  updatedAt: string;
  description: string;
};

const initialAssetFolders: AssetFolder[] = [
  { id: "company", name: "公司资产", parentId: null, owner: "廖婉琛", updatedAt: "今天 11:20", description: "公司品牌、制度、通用方法与内部资料" },
  { id: "fannal", name: "凡诺 AI 官网升级", parentId: null, owner: "徐泉", updatedAt: "今天 10:58", description: "凡诺客户与项目资料统一存放" },
  { id: "quanyi", name: "全意 AI 工作中枢", parentId: null, owner: "廖婉琛", updatedAt: "今天 11:20", description: "全意工作中枢项目资料" },
  { id: "kangfulai", name: "康福来官网重构", parentId: null, owner: "TRoY", updatedAt: "昨天 18:10", description: "康福来客户与项目资料统一存放" },
  { id: "comply", name: "Comply 项目", parentId: null, owner: "顾一健", updatedAt: "8月16日", description: "Comply 客户与项目资料统一存放" },
  { id: "company-brand", name: "品牌与权益", parentId: "company", owner: "廖婉琛", updatedAt: "今天 09:30", description: "品牌规范、公司介绍和对外权益资料" },
  { id: "company-method", name: "通用方法与模板", parentId: "company", owner: "曹玉祥", updatedAt: "昨天 18:10", description: "可跨项目复用的方法、清单和模板" },
  { id: "fannal-meeting", name: "会议记录", parentId: "fannal", owner: "会议助手", updatedAt: "今天 10:58", description: "项目会议纪要与相关附件" },
  { id: "fannal-delivery", name: "正式交付", parentId: "fannal", owner: "徐泉", updatedAt: "8月17日", description: "对客户发布的正式版本" },
  { id: "quanyi-product", name: "产品需求", parentId: "quanyi", owner: "廖婉琛", updatedAt: "今天 11:20", description: "需求、流程与版本范围" },
  { id: "quanyi-design", name: "设计与预览", parentId: "quanyi", owner: "曹玉祥", updatedAt: "今天 10:46", description: "界面设计、交互说明与预览文件" },
  { id: "kangfulai-content", name: "客户资料", parentId: "kangfulai", owner: "TRoY", updatedAt: "昨天 17:42", description: "客户提供的产品、品牌与内容资料" },
];

function defaultAssetFolder(asset: Asset) {
  if (asset.scope.includes("凡诺") || asset.title.includes("凡诺")) return asset.type === "会议" ? "fannal-meeting" : "fannal";
  if (asset.scope.includes("康福来") || asset.title.includes("康福来")) return "kangfulai-content";
  if (asset.title.includes("全意 AI 工作中枢")) return "quanyi-product";
  if (asset.type === "模板" || asset.type === "知识") return "company-method";
  return "company";
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + " MB";
  return Math.max(1, Math.round(size / 1024)) + " KB";
}

function AssetLibrary() {
  const { assets, setAssets, notify } = useHub();
  const [folders, setFolders] = useState<AssetFolder[]>(initialAssetFolders);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部类型");
  const [sort, setSort] = useState("最近更新");
  const [assetFolders, setAssetFolders] = useState<Record<string, string | null>>(() => Object.fromEntries(assets.map((asset) => [asset.id, defaultAssetFolder(asset)])));
  const [fileSizes, setFileSizes] = useState<Record<string, string>>({
    "a-401": "28.4 KB",
    "a-402": "186 KB",
    "a-403": "42.1 KB",
    "a-404": "16.8 KB",
  });
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const currentFolder = folders.find((folder) => folder.id === currentFolderId) || null;
  const trail = useMemo(() => {
    const result: AssetFolder[] = [];
    let cursor = currentFolder;
    while (cursor) {
      result.unshift(cursor);
      cursor = folders.find((folder) => folder.id === cursor!.parentId) || null;
    }
    return result;
  }, [currentFolder, folders]);

  useEffect(() => {
    setAssetFolders((locations) => {
      const next = { ...locations };
      assets.forEach((asset) => { if (!(asset.id in next)) next[asset.id] = defaultAssetFolder(asset); });
      return next;
    });
  }, [assets]);

  const folderRows = folders
    .filter((folder) => folder.parentId === currentFolderId && (typeFilter === "全部类型" || typeFilter === "文件夹") && folder.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === "按名称" ? a.name.localeCompare(b.name, "zh-CN") : 0);
  const assetRows = assets
    .filter((asset) => assetFolders[asset.id] === currentFolderId && typeFilter !== "文件夹" && (typeFilter === "全部类型" || asset.type === typeFilter) && asset.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === "按名称" ? a.title.localeCompare(b.title, "zh-CN") : sort === "按类型" ? a.type.localeCompare(b.type, "zh-CN") : 0);
  const visibleIds = [...folderRows.map((folder) => folder.id), ...assetRows.map((asset) => asset.id)];
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const locationName = currentFolder?.name || "资产库";

  const openFolder = (id: string | null) => {
    setCurrentFolderId(id);
    setSelectedIds([]);
    setQuery("");
    setCreatingFolder(false);
    setNewFolderName("");
  };

  const saveFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    setFolders((items) => [{ id: "folder-" + Date.now(), name, parentId: currentFolderId, owner: "廖婉琛", updatedAt: "刚刚", description: "新建文件夹" }, ...items]);
    setCreatingFolder(false);
    setNewFolderName("");
    notify("文件夹「" + name + "」已创建");
  };

  const uploadFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const time = Date.now();
    const incoming = Array.from(files).map((file, index) => {
      const lowerName = file.name.toLowerCase();
      const type: Asset["type"] = lowerName.includes("会议") ? "会议" : /\.(ppt|pptx|key)$/.test(lowerName) ? "方案" : lowerName.includes("模板") ? "模板" : "文档";
      return { id: "a-upload-" + time + "-" + index, title: file.name, type, scope: trail.length ? trail.map((folder) => folder.name).join(" / ") : "资产库", updatedAt: "刚刚", owner: "廖婉琛", summary: "上传至" + locationName + "的文件。", tags: [file.name.split(".").pop()?.toUpperCase() || "文件"], rawSize: file.size };
    });
    setAssets((items) => [...incoming.map(({ rawSize: _rawSize, ...asset }) => asset), ...items]);
    setAssetFolders((locations) => ({ ...locations, ...Object.fromEntries(incoming.map((asset) => [asset.id, currentFolderId])) }));
    setFileSizes((sizes) => ({ ...sizes, ...Object.fromEntries(incoming.map((asset) => [asset.id, formatFileSize(asset.rawSize)])) }));
    notify(incoming.length + " 个文件已上传到「" + locationName + "」");
  };

  const toggleSelected = (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);

  return (
    <>
      <PageHeader title="资产库" description="像电脑文件夹一样管理资料；公司内容放进公司资产，客户资料直接进入对应项目文件夹。" />
      <section className="panel file-manager">
        <header className="file-manager-head">
          <div className="file-breadcrumb"><button onClick={() => openFolder(null)}><Folder size={17}/> 资产库</button>{trail.map((folder) => <span key={folder.id}><ChevronRight size={14}/><button onClick={() => openFolder(folder.id)}>{folder.name}</button></span>)}</div>
          <div className="file-manager-view-note"><Library size={15}/><span>文件与知识页面分开管理</span></div>
        </header>

        <div className="file-manager-toolbar">
          <div className="file-manager-actions">
            <button className="button secondary" onClick={() => {setCreatingFolder(true); setNewFolderName("");}}><FolderPlus size={16}/> 新建文件夹</button>
            <button className="button secondary" onClick={() => uploadInputRef.current?.click()}><FileUp size={16}/> 上传文件</button>
            <input ref={uploadInputRef} className="hidden-file-input" type="file" multiple onChange={(event) => {uploadFiles(event.currentTarget.files); event.currentTarget.value = "";}} />
            <span>存储空间已用 880 KB / 5.00 GB</span>
          </div>
          <div className="file-manager-filters">
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>全部类型</option><option>文件夹</option><option>文档</option><option>会议</option><option>方案</option><option>模板</option><option>知识</option></select>
            <select value={sort} onChange={(event) => setSort(event.target.value)}><option>最近更新</option><option>按名称</option><option>按类型</option></select>
            <label><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件或文件夹..." /></label>
          </div>
        </div>

        {selectedIds.length > 0 && <div className="file-selection-bar"><span>已选择 {selectedIds.length} 项</span><button onClick={() => setSelectedIds([])}>取消选择</button></div>}

        <div className="file-table">
          <div className="file-table-header"><input type="checkbox" aria-label="选择当前页面全部项目" checked={allSelected} onChange={() => setSelectedIds(allSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...selectedIds, ...visibleIds])))} /><span>名称</span><span>类型</span><span>更新人</span><span>更新时间</span><span>大小</span></div>
          {creatingFolder && <div className="file-row creating"><input type="checkbox" disabled/><div className="file-name-cell"><span className="folder-file-icon"><Folder size={19}/></span><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => {if (event.key === "Enter") saveFolder(); if (event.key === "Escape") {setCreatingFolder(false);setNewFolderName("");}}} placeholder="输入文件夹名称"/><button aria-label="确认新建文件夹" disabled={!newFolderName.trim()} onClick={saveFolder}><Check size={15}/></button><button aria-label="取消新建文件夹" onClick={() => {setCreatingFolder(false);setNewFolderName("");}}><X size={15}/></button></div><span>文件夹</span><span>廖婉琛</span><span>刚刚</span><span>—</span></div>}
          {folderRows.map((folder) => <div className={"file-row " + (selectedIds.includes(folder.id) ? "selected" : "")} key={folder.id} role="button" tabIndex={0} onClick={() => openFolder(folder.id)} onKeyDown={(event) => {if (event.key === "Enter") openFolder(folder.id);}}><input type="checkbox" aria-label={"选择文件夹 " + folder.name} checked={selectedIds.includes(folder.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(folder.id)}/><div className="file-name-cell"><span className="folder-file-icon"><Folder size={19}/></span><p><strong>{folder.name}</strong><small>{folder.description}</small></p></div><span>文件夹</span><span className="file-owner"><Avatar name={folder.owner} size="sm"/>{folder.owner}</span><span>{folder.updatedAt}</span><span>—</span></div>)}
          {assetRows.map((asset) => <div className={"file-row " + (selectedIds.includes(asset.id) ? "selected" : "")} key={asset.id} role="button" tabIndex={0} onClick={() => setSelected(asset)} onKeyDown={(event) => {if (event.key === "Enter") setSelected(asset);}}><input type="checkbox" aria-label={"选择文件 " + asset.title} checked={selectedIds.includes(asset.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(asset.id)}/><div className="file-name-cell"><span className={"document-file-icon " + asset.type}><FileText size={19}/></span><p><strong>{asset.title}</strong><small>{asset.summary}</small></p></div><span>{asset.type}</span><span className="file-owner"><Avatar name={asset.owner} size="sm"/>{asset.owner}</span><span>{asset.updatedAt}</span><span>{fileSizes[asset.id] || "24.6 KB"}</span></div>)}
          {!creatingFolder && !folderRows.length && !assetRows.length && <div className="file-manager-empty"><Folder size={30}/><strong>{query ? "没有找到相关文件" : "这个文件夹还是空的"}</strong><span>{query ? "换个关键词试试" : "可以直接新建文件夹或上传文件"}</span></div>}
        </div>
      </section>
      {selected && <AssetDetail asset={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function AssetTable({ assets, onSelect }: { assets: Asset[]; onSelect?: (asset: Asset) => void }) {
  return (
    <div className="asset-table">
      {assets.map((asset) => (
        <button key={asset.id} onClick={() => onSelect?.(asset)}>
          <span className={"file-type " + asset.type}>{asset.type === "会议" ? <MessageSquareText size={18}/> : <FileText size={18}/>}</span>
          <span className="asset-name"><strong>{asset.title}</strong><small>{asset.scope}</small></span>
          <span className="asset-tags">{asset.tags.slice(0,2).map((tag) => <em key={tag}>{tag}</em>)}</span>
          <span className="asset-owner"><Avatar name={asset.owner} size="sm"/>{asset.owner}</span>
          <span className="asset-time">{asset.updatedAt}</span>
          <MoreHorizontal size={17}/>
        </button>
      ))}
    </div>
  );
}

function CapabilityLibrary() {
  const { startChatWith, notify, openPreview } = useHub();
  const [tab, setTab] = useState("专家团");
  const [runningSkill, setRunningSkill] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [customSkills, setCustomSkills] = useState<{id:string;name:string;uses:number;desc:string}[]>([]);
  return (
    <>
      <PageHeader title="能力库" description="通过专家与 Skill，把方法、资料和执行能力接入真实工作流。" action={<button className="button secondary" onClick={() => setCreateOpen(true)}><Plus size={16}/> 创建 Skill</button>} />
      <div className="tab-bar">
        {["专家团", "Skills", "已连接工具"].map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === "专家团" && (
        <div className="expert-grid">
          {experts.map((expert) => (
            <article className="expert-card" key={expert.id}>
              <header><span className={"expert-avatar " + expert.color}>{expert.icon}</span><i className={expert.online ? "online" : ""}/><button className="icon-button" onClick={() => openPreview({eyebrow:"专家能力",title:expert.name,description:expert.desc,items:[{title:"可读取项目上下文",detail:"仅限你有权限访问的任务、会议和资产"},{title:"可生成分析结果",detail:"结果回到同一 AI 对话"},{title:"可创建候选任务",detail:"正式创建前需要人工确认"}],note:expert.online ? "专家当前在线，可立即发起协作。" : "专家当前离线，发起后会进入等待队列。",primaryLabel:"发起协作",primaryRoute:"/ai"})}><MoreHorizontal size={17}/></button></header>
              <h2>{expert.name}</h2><p>{expert.desc}</p>
              <div className="expert-capabilities"><span>可读取项目上下文</span><span>可创建任务</span><span>可调用 Skill</span></div>
              <button className="button primary full" onClick={() => startChatWith("让" + expert.name + "读取当前项目资料，并帮我分析下一步。")}><MessageSquareText size={16}/> 发起协作</button>
            </article>
          ))}
        </div>
      )}
      {tab === "Skills" && (
        <div className="skill-list">
          {[...customSkills, ...skills].map((skill) => (
            <article className="skill-row" key={skill.id}>
              <span className="skill-icon"><WandSparkles size={20}/></span><div><h2>{skill.name}</h2><p>{skill.desc}</p><small>本月调用 {skill.uses} 次</small></div>
              <div className="skill-permissions"><span><Library size={14}/> 资产</span><span><FolderKanban size={14}/> 项目</span><span><ListTodo size={14}/> 任务</span></div>
              <button className="button primary compact" onClick={() => setRunningSkill(skill.name)}><Play size={15}/> 运行</button>
            </article>
          ))}
        </div>
      )}
      {tab === "已连接工具" && (
        <div className="connections-grid">
          {["Codex CLI", "企业微信", "飞书文档", "Web Search"].map((name, index) => <article key={name}><span>{index === 0 ? <Code2/> : index === 1 ? <MessageSquareText/> : index === 2 ? <FileText/> : <Search/>}</span><div><strong>{name}</strong><small>{index < 3 ? "已连接" : "按需调用"}</small></div><i className={index < 3 ? "connected" : ""}/><button className="button secondary compact" onClick={() => notify(name + " 连接状态正常")}>管理</button></article>)}
        </div>
      )}
      {runningSkill && <RunSkill name={runningSkill} onClose={() => setRunningSkill(null)} />}
      {createOpen && <CreateSkill onClose={() => setCreateOpen(false)} onCreate={(skill) => {setCustomSkills((items) => [skill, ...items]);setCreateOpen(false);notify("Skill 已创建为草稿，可在能力库继续配置");setTab("Skills");}} />}
    </>
  );
}

function CreateSkill({ onClose, onCreate }: { onClose: () => void; onCreate: (skill: {id:string;name:string;uses:number;desc:string}) => void }) {
  const [form, setForm] = useState({name:"",desc:"",source:"项目任务、会议与资产"});
  return <AppModal title="创建 Skill" subtitle="定义清楚输入、处理目标和输出，创建后先以草稿方式试运行。" onClose={onClose} size="lg"><form className="form-stack" onSubmit={(event) => {event.preventDefault();if(!form.name.trim() || !form.desc.trim()) return;onCreate({id:"s-" + Date.now(),name:form.name.trim(),uses:0,desc:form.desc.trim()});}}><label><span>Skill 名称 *</span><input autoFocus value={form.name} onChange={(event) => setForm({...form,name:event.target.value})} placeholder="例如：项目风险检查"/></label><label><span>要解决什么问题？ *</span><textarea value={form.desc} onChange={(event) => setForm({...form,desc:event.target.value})} placeholder="说明适用场景、处理目标与输出结果"/></label><label><span>默认读取范围</span><select value={form.source} onChange={(event) => setForm({...form,source:event.target.value})}><option>项目任务、会议与资产</option><option>仅当前页面与引用资产</option><option>由每次运行时选择</option></select></label><div className="permission-note"><CheckCircle2 size={17}/><span>草稿 Skill 不会直接修改正式任务；生成的行动项需要人工确认。</span></div><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!form.name.trim() || !form.desc.trim()}>创建 Skill 草稿</button></footer></form></AppModal>;
}

function ContributionPage() {
  const { openPreview } = useHub();
  const [period, setPeriod] = useState<"本月" | "本季度">("本月");
  const [contributions, setContributions] = useState<ApiContribution[]>([]);
  useEffect(()=>{fetchContributions().then(setContributions).catch(()=>setContributions([]));},[]);
  const totalPoints = contributions.reduce((sum,item)=>sum+item.points,0);
  return (
    <>
      <PageHeader title="我的贡献" description="让主动认领、解决问题和知识沉淀被看见，不与绩效直接绑定。" />
      <section className="contribution-hero">
        <div><span className="contribution-medal"><Trophy size={28}/></span><p><small>真实贡献事件</small><strong>{totalPoints}</strong><em>分</em><span>{contributions.length} 次已验收任务入账</span></p></div>
        <div className="contribution-sparkline"><svg viewBox="0 0 300 80"><path d="M0 68 C45 66 58 45 96 50 S150 24 184 36 S242 8 300 14"/><path className="fill" d="M0 68 C45 66 58 45 96 50 S150 24 184 36 S242 8 300 14 L300 80 L0 80Z"/></svg></div>
      </section>
      <div className="contribution-grid">
        {[
          { label: "完成任务", value: String(contributions.length), Icon: CheckCircle2, tone: "blue" },
          { label: "解决求助", value: "6", Icon: HandHelping, tone: "green" },
          { label: "知识沉淀", value: "4", Icon: FileText, tone: "violet" },
          { label: "开放任务", value: "3", Icon: Target, tone: "orange" },
        ].map(({ label, value, Icon, tone }) => <button key={label} onClick={() => openPreview({eyebrow:"贡献明细",title:label + " · " + period,description:"共记录 " + value + " 次真实发生的团队推进行为。",items:label === "完成任务" ? [{title:"品牌视觉规范初稿",detail:"今天 11:20 · +8"},{title:"移动端状态覆盖检查",detail:"8月17日 · +6"},{title:"官网信息架构评审",detail:"8月15日 · +5"}] : label === "解决求助" ? [{title:"GEO 问题库结构",detail:"昨天 16:42 · +5"},{title:"客户资料缺口推进",detail:"8月16日 · +4"}] : label === "知识沉淀" ? [{title:"等待外部任务处理 SOP",detail:"8月16日 · +3"},{title:"任务协作方式说明",detail:"8月14日 · +3"}] : [{title:"空态文案整理",detail:"开放任务 · 待认领"},{title:"移动端文字溢出检查",detail:"开放任务 · 待认领"}],note:"贡献只用于呈现协作与知识影响，不直接绑定绩效。",primaryLabel:label === "开放任务" ? "进入任务池" : "查看贡献记录",primaryRoute:label === "开放任务" ? "/tasks" : undefined})}><span className={"metric-icon " + tone}><Icon size={18}/></span><strong>{value}</strong><small>{label}</small><ChevronRight size={15}/></button>)}
      </div>
      <div className="contribution-layout">
        <section className="panel"><div className="panel-title-row"><div><h2>贡献记录</h2><p>仅展示服务端在验收通过时写入的幂等事件。</p></div><button className="button secondary compact" onClick={() => setPeriod((value) => value === "本月" ? "本季度" : "本月")}>{period} <ChevronDown size={14}/></button></div><div className="timeline-list">{contributions.map((item) => <div key={item.id}><span className="timeline-dot"/><p><strong>任务验收通过 · +{item.points} 分</strong><small>{new Date(item.created_at).toLocaleString("zh-CN")} · 提交版本 V{item.submission_version}</small></p></div>)}{!contributions.length&&<p className="empty-inline">暂无真实贡献事件；任务验收通过后自动入账。</p>}</div></section>
        <aside className="panel achievement-panel"><div className="panel-title-row"><h2>成就徽章</h2><span>4 / 8</span></div>{[
          { name: "推进者", desc: "连续推动关键任务", Icon: Zap },
          { name: "答疑伙伴", desc: "帮助同事解决问题", Icon: HandHelping },
          { name: "知识共建", desc: "沉淀可复用知识", Icon: Library },
        ].map(({ name, desc, Icon }) => <div className="achievement" key={name}><span><Icon size={18}/></span><p><strong>{name}</strong><small>{desc}</small></p><CheckCircle2 size={17}/></div>)}</aside>
      </div>
    </>
  );
}

function AgentCenter() {
  const { tasks, setTasks, openTask, notify, openPreview } = useHub();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedRunId = new URLSearchParams(location.search).get("run") || "";
  const aiTasks = tasks.filter((task) => ["ai", "confirm"].includes(task.status));
  type AgentRunView = {
    id: string;
    taskId?: string;
    title: string;
    project: string;
    status: "ai" | "confirm" | "done";
    progress: number;
    nextAction: string;
    agent: string;
    source: string;
    updated: string;
    output: string;
    outputDetail: string;
    issue?: boolean;
  };
  const liveRuns: AgentRunView[] = aiTasks.map((task) => ({
    id: "run-" + task.id,
    taskId: task.id,
    title: task.title,
    project: task.project,
    status: task.status as "ai" | "confirm",
    progress: task.progress,
    nextAction: task.nextAction,
    agent: task.id === "t-102" ? "内容研究 Agent" : "内容助手 Agent",
    source: task.source,
    updated: task.status === "confirm" ? "8 分钟前" : "刚刚更新",
    output: task.id === "t-102" ? "竞品分析简报_v1.pdf" : "界面文案清单_v0.8.md",
    outputDetail: task.id === "t-102" ? "已整理 6 个同类产品" : "已生成 36 条界面文案",
    issue: task.id === "t-102",
  }));
  const archivedRuns: AgentRunView[] = [
    { id:"run-history-1", title:"检查品牌色状态覆盖", project:"全意 AI 工作中枢", status:"done", progress:100, nextAction:"结果已确认并归档", agent:"UI 巡检 Agent", source:"项目任务", updated:"昨天 17:42", output:"品牌状态检查报告.pdf", outputDetail:"完成 24 个界面状态检查" },
  ];
  const [runOverrides, setRunOverrides] = useState<Record<string, Partial<AgentRunView>>>({});
  const [followUpText, setFollowUpText] = useState("");
  const [followUpMessages, setFollowUpMessages] = useState<Record<string, string[]>>({});
  const runs = [...liveRuns, ...archivedRuns].map((run) => ({ ...run, ...runOverrides[run.id] }));
  const [selectedId, setSelectedId] = useState(requestedRunId);
  const [runFilter, setRunFilter] = useState<"all" | "ai" | "confirm" | "done">("all");
  const [retryRecovered, setRetryRecovered] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
  const selectedRun = runs.find((run) => run.id === selectedId);
  const selectedTask = selectedRun?.taskId ? tasks.find((task) => task.id === selectedRun.taskId) : undefined;
  const visibleRuns = runFilter === "all" ? runs : runs.filter((run) => run.status === runFilter);
  const statusLabel = (status: AgentRunView["status"]) => status === "ai" ? "执行中" : status === "confirm" ? "待确认" : "已完成";
  useEffect(() => {
    if (requestedRunId) setSelectedId(requestedRunId);
  }, [requestedRunId]);
  const submit = () => {
    if (!selectedRun) return;
    const revisionCount = (followUpMessages[selectedRun.id] ?? []).length;
    const nextOutput = revisionCount > 0 && selectedRun.id === "run-t-102" ? `竞品分析简报_v${revisionCount + 1}.pdf` : selectedRun.output;
    setRunOverrides((items) => ({
      ...items,
      [selectedRun.id]: {
        ...items[selectedRun.id],
        status: "confirm",
        progress: 100,
        nextAction: "等待负责人确认 AI 结果",
        updated: "刚刚完成",
        output: nextOutput,
        outputDetail: revisionCount > 0 ? `已根据第 ${revisionCount} 次补充要求完成更新` : selectedRun.outputDetail,
      },
    }));
    if (selectedTask) {
      setTasks((items) => items.map((task) => task.id === selectedTask.id ? { ...task, status: "confirm", progress: 100, nextAction: "等待负责人确认 AI 结果" } : task));
    }
    notify("AI 结果已提交，等待人工确认");
  };
  const sendFollowUp = () => {
    if (!selectedRun || selectedRun.status === "ai" || !followUpText.trim()) return;
    const requirement = followUpText.trim();
    const resumedProgress = selectedRun.status === "done" ? 24 : 68;
    setFollowUpMessages((items) => ({ ...items, [selectedRun.id]: [...(items[selectedRun.id] ?? []), requirement] }));
    setRunOverrides((items) => ({ ...items, [selectedRun.id]: { status: "ai", progress: resumedProgress, nextAction: "正在根据补充要求继续完善产物", updated: "刚刚收到补充要求", issue: false } }));
    if (selectedTask) {
      setTasks((items) => items.map((task) => task.id === selectedTask.id ? { ...task, status: "ai", progress: resumedProgress, nextAction: "AI 正在根据补充要求继续处理" } : task));
    }
    setFollowUpText("");
    setRetryRecovered(true);
    notify("已补充要求，AI 已重新开始执行");
  };
  if (selectedRun) {
    const stepNames = selectedRun.id === "run-history-2" ? ["读取会议转写", "识别行动项", "匹配负责人和时间", "分发并归档"] : ["读取项目上下文", "生成任务所需内容", "检查一致性与可读性", "提交结果等待确认"];
    const currentFollowUps = followUpMessages[selectedRun.id] ?? [];
    const canFollowUp = selectedRun.status === "confirm" || selectedRun.status === "done";
    const outputExtension = selectedRun.output.includes(".") ? selectedRun.output.slice(selectedRun.output.lastIndexOf(".")) : "";
    const baseOutputName = selectedRun.output.replace(/_v\d+(?=\.)/i, "").replace(/_v\d+$/i, "").replace(outputExtension, "");
    const outputVersions = Array.from({ length: currentFollowUps.length + 1 }, (_, index) => ({
      version: `V${index + 1}`,
      file: index === currentFollowUps.length && selectedRun.status !== "ai" ? selectedRun.output : `${baseOutputName}_v${index + 1}${outputExtension}`,
      note: index === 0 ? "首次执行产物" : selectedRun.status === "ai" && index === currentFollowUps.length ? `正在处理：${currentFollowUps[index - 1]}` : currentFollowUps[index - 1],
      current: index === currentFollowUps.length,
      pending: selectedRun.status === "ai" && index === currentFollowUps.length,
    }));
    return (
      <div className="agent-run-detail-page">
        <header className="agent-run-detail-header panel">
          <button className="task-detail-back" onClick={() => {setSelectedId(""); if (requestedRunId) navigate("/agent", {replace:true});}}><ArrowLeft size={16}/> 返回执行任务</button>
          <div><span className="section-kicker">AI RUN · {selectedRun.id.toUpperCase()}</span><h1>{selectedRun.title}</h1><p>{selectedRun.project} · {selectedRun.agent}</p></div>
          <div className="agent-run-header-actions">
            <span className={"agent-state-badge " + selectedRun.status}>{statusLabel(selectedRun.status)}</span>
            {selectedTask && <button className="button secondary compact" onClick={() => openTask(selectedTask)}>打开关联任务</button>}
            {selectedRun.status === "confirm" && selectedTask && <button className="button primary compact" onClick={() => openTask(selectedTask)}>去确认结果</button>}
            {selectedRun.status === "ai" && <button className="button primary compact" onClick={submit}>模拟完成并提交确认</button>}
            {selectedRun.status === "done" && <button className="button secondary compact" onClick={() => openPreview({eyebrow:"归档记录",title:selectedRun.title,description:"这项 AI 执行已完成并通过人工确认。",items:[{title:"最终产物",detail:selectedRun.output},{title:"完成时间",detail:selectedRun.updated},{title:"归属项目",detail:selectedRun.project}],note:"归档记录保留完整执行链路。"})}>查看归档记录</button>}
          </div>
        </header>
        <div className="agent-run-detail-grid">
          <section className="agent-run-workspace panel">
            <div className="agent-progress"><div><span>整体进度</span><strong>{selectedRun.progress}%</strong></div><div className="progress-track"><i style={{width:selectedRun.progress + "%"}}/></div><small>{selectedRun.nextAction}</small></div>
            <div className="agent-steps">
              {stepNames.map((name,index) => { const state = selectedRun.status === "ai" ? (index < 2 ? "已完成" : index === 2 ? "执行中" : "待开始") : "已完成"; return <div className={state === "执行中" ? "active" : state === "已完成" ? "complete" : ""} key={name}><span>{state === "已完成" ? <Check size={14}/> : index + 1}</span><p><strong>{name}</strong><small>{state}</small></p>{state === "执行中" && <i className="step-loader"/>}</div>;})}
            </div>
            {selectedRun.issue && !retryRecovered ? <div className="run-recovery-state error"><span><AlertCircle size={17}/></span><p><strong>1 个参考页面读取失败</strong><small>不影响现有产物，可单独重试该步骤。</small></p><button className="button secondary compact" onClick={() => {setRetryRecovered(true); notify("失败步骤已重新执行成功");}}>重试失败步骤</button></div> : <div className={"run-recovery-state " + (selectedRun.status === "ai" ? "running" : "recovered")}><span>{selectedRun.status === "ai" ? <Activity size={17}/> : <CheckCircle2 size={17}/>}</span><p><strong>{selectedRun.status === "ai" ? "AI 正在持续执行" : selectedRun.status === "confirm" ? "执行已完成，等待人工确认" : "任务结果已确认归档"}</strong><small>{selectedRun.status === "ai" ? "离开本页不会中断执行，状态会自动更新。" : selectedRun.nextAction}</small></p></div>}
            <div className="agent-output agent-output-versions">
              <div className="panel-title-row"><div><h3>执行产物</h3><p>每次补充要求生成一个新版本，旧版本持续保留。</p></div><button className="text-button" onClick={() => openPreview({eyebrow:"AI 执行记录",title:selectedRun.title + " · 详细记录",description:"按时间记录本次任务的读取范围、关键步骤、异常恢复和人工确认。",items:[{title:"开始读取上下文",detail:selectedRun.source + " · 权限校验通过"},{title:"执行核心步骤",detail:selectedRun.agent + " 已完成主要处理"},{title:"生成当前产物",detail:selectedRun.outputDetail},{title:"当前状态",detail:statusLabel(selectedRun.status) + " · " + selectedRun.updated}],note:"记录会保留关键步骤、异常处理和最终产物。"})}>查看执行记录</button></div>
              <div className="agent-version-list">
                {outputVersions.map((item) => <div className={`${item.current ? "current" : ""} ${item.pending ? "pending" : ""}`} key={item.version}><span className="version-index">{item.version}</span><FileText size={18}/><p><strong>{item.pending ? `正在生成 ${item.file}` : item.file}</strong><small>{item.note}</small></p>{item.current && <em>{item.pending ? "生成中" : "当前版本"}</em>}<button className="button secondary compact" disabled={item.pending} onClick={() => openPreview({eyebrow:`产物 ${item.version}`,title:item.file,description:item.note,items:[{title:"任务目标",detail:selectedRun.title},{title:"版本",detail:item.version},{title:"当前状态",detail:item.current ? statusLabel(selectedRun.status) : "历史版本"}],note:item.current ? "确认前不会覆盖正式资产。" : "该历史版本仅供对照，不会覆盖当前产物。"})}>{item.pending ? "处理中" : "预览"}</button></div>)}
              </div>
            </div>
            <div className={"run-followup-panel run-iteration-composer " + selectedRun.status}>
              <div className="run-followup-head"><span><MessageSquareText size={16}/></span><p><strong>继续完善当前产物</strong><small>只记录本次修改指令与新版本，不复制 AI 助手中的原始聊天。</small></p></div>
              {currentFollowUps.length > 0 && <div className="run-followup-latest"><span>最近一次修改</span><strong>{currentFollowUps[currentFollowUps.length - 1]}</strong></div>}
              {canFollowUp ? <form onSubmit={(event) => {event.preventDefault();sendFollowUp();}}><input value={followUpText} onChange={(event) => setFollowUpText(event.target.value)} placeholder="说明要修改的地方，例如：补充价格维度对比，并生成 V2…" aria-label="补充本次 AI 执行要求"/><button className="button primary" type="submit" disabled={!followUpText.trim()} aria-label="发送修改要求"><Send size={16}/></button></form> : <div className="run-followup-running"><i className="run-live-dot"/>AI 正根据修改要求生成新版本，完成后会重新进入待确认</div>}
            </div>
          </section>
          <aside className="agent-run-context panel"><h2>任务上下文</h2><div className="context-section"><span>执行 Agent</span><strong><Bot size={15}/>{selectedRun.agent}</strong><strong><WandSparkles size={15}/> 页面与内容处理</strong></div><div className="context-section"><span>任务来源</span><p>{selectedRun.source}</p><p>{selectedRun.project}</p></div><div className="context-section"><span>读取资料</span><p>产品需求 V1</p><p>页面结构说明</p><p>品牌语言规范</p></div>{selectedRun.status === "ai" && <div className="context-section"><span>人工控制</span><button className="button secondary full" onClick={() => openPreview({eyebrow:"人工介入",title:"补充本次执行信息",description:"补充的信息会进入当前运行，不会修改原始项目资料。",items:[{title:"补充判断标准",detail:"说明新的限制或目标"},{title:"引用相关资料",detail:"只在当前运行中读取"},{title:"继续执行",detail:"Agent 从当前步骤恢复"}],note:"提交后会保留人工介入记录。",primaryLabel:"确认补充并继续"})}>补充执行信息</button><button className="text-button danger" onClick={() => setStopConfirm(true)}>停止执行</button></div>}</aside>
        </div>
        {stopConfirm && selectedTask && <AppModal title="停止这次 AI 执行？" subtitle="已生成的产物会保留，任务将转为阻塞状态，之后可以从任务详情重新启动。" onClose={() => setStopConfirm(false)} size="sm"><div className="flow-preview-dialog"><div className="flow-preview-note danger"><AlertCircle size={17}/><span>停止后不会继续消耗执行资源，但未完成步骤需要重新运行。</span></div><footer className="modal-actions"><button className="button secondary" onClick={() => setStopConfirm(false)}>继续执行</button><button className="button danger-solid" onClick={() => {setTasks((items) => items.map((task) => task.id === selectedTask.id ? {...task,status:"blocked",blockedReason:"AI 执行被人工停止，需确认当前产物是否可复用以及是否重新启动。",nextAction:"决定是否重新启动 AI 执行"} : task));setStopConfirm(false);setSelectedId("");notify("AI 执行已停止，当前产物已保留");}}>确认停止</button></footer></div></AppModal>}
      </div>
    );
  }
  const filterTabs: Array<{key:typeof runFilter;label:string;count:number}> = [
    {key:"all",label:"全部任务",count:runs.length},
    {key:"ai",label:"执行中",count:runs.filter((run) => run.status === "ai").length},
    {key:"confirm",label:"待确认",count:runs.filter((run) => run.status === "confirm").length},
    {key:"done",label:"已完成",count:runs.filter((run) => run.status === "done").length},
  ];
  const activeVisibleRuns = visibleRuns.filter((run) => run.status !== "done");
  const completedVisibleRuns = visibleRuns.filter((run) => run.status === "done");
  const standardVisibleRuns = runFilter === "done" ? completedVisibleRuns : activeVisibleRuns;
  const openRun = (run: AgentRunView) => {
    setRetryRecovered(false);
    setSelectedId(run.id);
  };
  return (
    <div className="agent-center-overview">
      <PageHeader title="AI 执行中心" description="集中查看 AI 任务的执行进度、待确认结果和已完成产物。" action={<button className="button secondary" onClick={() => openPreview({eyebrow:"AI 执行记录",title:"最近 7 天执行记录",description:"按任务查看 Agent 的输入范围、执行步骤、产物与人工介入结果。",items:runs.map((run) => ({title:run.title,detail:statusLabel(run.status) + " · " + run.updated})),note:"记录包括执行步骤、产物版本与人工介入情况。"})}><Activity size={16}/> 查看运行记录</button>} />
      <section className="agent-summary-strip">
        <div><span className="metric-icon cyan"><Bot size={18}/></span><p><small>AI 执行中</small><strong>{runs.filter((run) => run.status === "ai").length}</strong></p></div>
        <div><span className="metric-icon violet"><Inbox size={18}/></span><p><small>等待我确认</small><strong>{runs.filter((run) => run.status === "confirm").length}</strong></p></div>
        <div><span className="metric-icon green"><CheckCircle2 size={18}/></span><p><small>近 7 天完成</small><strong>{runs.filter((run) => run.status === "done").length}</strong></p></div>
      </section>
      <div className="agent-center-toolbar"><div className="agent-filter-tabs">{filterTabs.map((tab) => <button className={runFilter === tab.key ? "active" : ""} key={tab.key} onClick={() => setRunFilter(tab.key)}>{tab.label}<span>{tab.count}</span></button>)}</div><span>已完成可查看结果，执行中会在后台持续推进</span></div>
      {visibleRuns.length ? (
        <section className="agent-run-overview-layout">
          {standardVisibleRuns.length > 0 && <div className="agent-active-run-grid">
          {standardVisibleRuns.map((run) => {
            const isRunning = run.status === "ai";
            const isDone = run.status === "done";
      return (
        <button className={"agent-run-card " + run.status} key={run.id} onClick={() => openRun(run)}>
          <header>
            <span className="agent-card-identity">
              <span className="agent-card-icon">{isDone ? <CheckCircle2 size={19}/> : <Bot size={19}/>}</span>
              <span className="agent-card-name">{run.agent}</span>
            </span>
            <span className={"agent-state-badge " + run.status}>{statusLabel(run.status)}</span>
          </header>
          <div className="agent-card-title"><h2>{run.title}</h2><p>{run.project}</p></div>
                <div className="agent-card-progress">
                  <div><span>{isRunning ? "AI 正在后台执行" : run.nextAction}</span><strong>{run.progress}%</strong></div>
                  <div className="progress-track"><i style={{width:run.progress + "%"}}/></div>
                </div>
                <dl><div><dt>任务来源</dt><dd>{run.source}</dd></div><div><dt>{isDone ? "最终产物" : "当前产物"}</dt><dd>{run.output}</dd></div></dl>
                <footer>
                  <span>{run.updated}</span>
                  <strong className={isRunning ? "passive" : ""}>{isRunning ? <><i className="run-live-dot"/>后台执行，无需操作</> : isDone ? <>查看结果 <ArrowRight size={15}/></> : <>去确认结果 <ArrowRight size={15}/></>}</strong>
                </footer>
              </button>
            );
          })}
          </div>}
          {runFilter === "all" && <aside className="agent-completed-module">
            <header><div><span>已完成</span><small>执行产物已归档</small></div><button onClick={() => setRunFilter("done")}>查看更多已完成 <ArrowRight size={14}/></button></header>
            <div className="agent-completed-grid">
              {completedVisibleRuns.map((run) => <button className="agent-completed-tile" key={run.id} onClick={() => openRun(run)}>
                <span className="agent-completed-icon"><CheckCircle2 size={16}/></span>
                <div><small>{run.agent}</small><strong>{run.title}</strong><span>{run.updated}</span></div>
                <ChevronRight size={15}/>
              </button>)}
            </div>
          </aside>}
        </section>
      ) : <EmptyState icon={<Bot/>} title="这个分类下还没有任务" description="新的 AI 执行会自动出现在这里。" />}
    </div>
  );
}

function AgentAccess() {
  const { notify, openPreview } = useHub();
  const [copied, setCopied] = useState(false);
  const copy = () => { setCopied(true); notify("示例命令已复制"); window.setTimeout(() => setCopied(false), 1800); };
  return (
    <>
      <PageHeader title="Agent 接入" description="让 Codex 和其他 Agent 查询、创建、更新任务，并提交结果等待人工确认。" action={<span className="connection-status"><i/> API 服务正常</span>} />
      <div className="access-layout">
        <section className="panel access-start"><span className="access-icon"><Code2 size={24}/></span><div><span className="section-kicker">CLI / API</span><h2>把 AI 变成系统里的真实使用者</h2><p>Agent 可以在权限范围内读取项目上下文、创建候选任务、更新执行状态和提交交付物。所有关键节点仍保留人工确认。</p></div><div className="code-block"><header><span>Codex CLI</span><button onClick={copy}>{copied ? <Check size={15}/> : <Code2 size={15}/>} {copied ? "已复制" : "复制"}</button></header><pre>codex task create --project p-quanyi{"\n"}  --title "检查移动端状态覆盖"{"\n"}  --mode hybrid --confirm</pre></div></section>
        <aside className="panel permission-card"><h2>权限原则</h2>{[["查询项目与任务","允许"],["创建候选任务","允许"],["更新执行状态","允许"],["直接完成业务任务","需人工确认"]].map(([name,status]) => <div key={name}><span>{name}</span><strong className={status.includes("人工") ? "warning" : ""}>{status}</strong></div>)}</aside>
      </div>
      <section className="panel api-table-panel"><div className="panel-title-row"><div><h2>基础接口</h2><p>第一版只展示核心工作闭环所需能力。</p></div><button className="button secondary compact" onClick={() => openPreview({eyebrow:"开发文档",title:"Agent API 接入说明",description:"接口按读取、候选创建、状态更新和人工确认四类能力组织。",items:[{title:"1. 获取访问凭证",detail:"按成员权限生成短期 Token"},{title:"2. 读取项目上下文",detail:"只能读取调用者有权访问的范围"},{title:"3. 创建候选或提交结果",detail:"关键动作进入人工确认"},{title:"4. 监听状态回调",detail:"处理成功、失败与重试结果"}],note:"示例请求、字段和错误码会由研发文档统一维护。",primaryLabel:"复制接入示例"})}>查看 API 文档 <ArrowRight size={15}/></button></div><div className="api-list">{[["POST","/tasks/candidates","创建候选任务"],["PATCH","/tasks/:id/status","更新任务状态"],["POST","/runs/:id/result","提交 AI 执行结果"],["POST","/confirmations","请求人工确认"],["GET","/projects/:id/context","读取项目上下文"]].map(([method,path,desc]) => <button key={path} onClick={() => openPreview({eyebrow:"接口详情",title:method + " " + path,description:desc,items:[{title:"权限校验",detail:"继承当前成员与项目权限"},{title:"请求结果",detail:method === "GET" ? "返回结构化项目上下文" : "返回操作记录与下一状态"},{title:"异常恢复",detail:"重复请求使用幂等键，失败可安全重试"}],note:"关键写入操作会生成审计记录。"})}><span className={"method " + method.toLowerCase()}>{method}</span><code>{path}</code><span>{desc}</span><ChevronRight size={15}/></button>)}</div></section>
    </>
  );
}

function AiChat() {
  const { openCandidate, notify, openPreview } = useHub();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedPrompt = new URLSearchParams(location.search).get("prompt") || "";
  const [text, setText] = useState("");
  const [chatContexts, setChatContexts] = useState<ChatContextItem[]>([]);
  const [thinking, setThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const thinkingTimerRef = useRef<number | null>(null);
  const streamTimerRef = useRef<number | null>(null);
  const handledPromptRef = useRef("");
  const [messages, setMessages] = useState<{ role: "ai" | "user" | "system"; text: string }[]>([
    { role: "ai", text: "早上好。我是你的个人全局助手，可以在你有权限的范围内汇总项目、任务、会议、求助和资产。今天想先推进什么？" },
  ]);
  const [generated, setGenerated] = useState<Candidate | null>(null);
  const [members, setMembers] = useState(["廖婉琛"]);
  const [memberPanel, setMemberPanel] = useState(false);
  const [activeSession, setActiveSession] = useState("规划今天的重点工作");
  useEffect(() => () => {
    if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current);
    if (streamTimerRef.current) window.clearInterval(streamTimerRef.current);
  }, []);
  const cancelReplyMotion = () => {
    if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current);
    if (streamTimerRef.current) window.clearInterval(streamTimerRef.current);
    thinkingTimerRef.current = null;
    streamTimerRef.current = null;
    setThinking(false);
    setStreamingText("");
  };
  const inviteMember = (name: string) => {
    if (members.includes(name)) return;
    setMembers((items) => [...items, name]);
    notify("已向 " + name + " 开放本次 AI 对话，可查看全部历史并继续向 AI 提问");
    window.setTimeout(() => {
      setMessages((items) => [...items, { role: "system", text: "已向 " + name + " 开放本次会话 · 对方可查看全部历史并向 AI 提问" }]);
    }, 450);
  };
  const send = (preset?: string) => {
    const message = preset || text;
    if (!message.trim() || thinking || streamingText) return;
    setMessages((items) => [...items, { role: "user", text: message }]);
    setGenerated(null);
    setText("");
    setThinking(true);
    const reply = "我已读取「全意 AI 工作中枢」的需求、任务与最近会议。当前最需要补齐的是移动端状态覆盖，我为你生成了一个候选任务。正式创建前请确认负责人、截止时间和交付物。";
    thinkingTimerRef.current = window.setTimeout(() => {
      setThinking(false);
      setStreamingText(reply.slice(0, 1));
      let characterIndex = 1;
      streamTimerRef.current = window.setInterval(() => {
        characterIndex += 1;
        setStreamingText(reply.slice(0, characterIndex));
        if (characterIndex >= reply.length) {
          if (streamTimerRef.current) window.clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
          setMessages((items) => [...items, { role: "ai", text: reply }]);
          setStreamingText("");
          setGenerated({
            id: "c-chat-" + Date.now(),
            title: "补齐移动端任务详情的异常与恢复状态",
            source: "AI Chat",
            sourceDetail: "当前对话 · 刚刚",
            confidence: 93,
            suggestedOwner: "廖婉琛",
            suggestedProject: "全意 AI 工作中枢",
            due: "8月21日",
            reason: "需求明确要求完整呈现加载、失败、权限和恢复路径。",
          });
        }
      }, 34);
    }, 850);
  };
  useEffect(() => {
    if (!requestedPrompt || handledPromptRef.current === requestedPrompt) return;
    handledPromptRef.current = requestedPrompt;
    setActiveSession(requestedPrompt.length > 18 ? requestedPrompt.slice(0, 18) + "…" : requestedPrompt);
    send(requestedPrompt);
    navigate("/ai", {replace:true});
  }, [requestedPrompt]);
  const startNewChat = () => {
    cancelReplyMotion();
    setActiveSession("新对话");
    setMessages([{ role: "ai", text: "新的个人工作会话已创建。你可以直接说今天要推进什么，也可以指定某个项目、任务或资料。" }]);
    setGenerated(null);
    setText("");
    notify("已创建新的 AI 工作会话");
  };
  const openSession = (name: string) => {
    cancelReplyMotion();
    setActiveSession(name);
    setGenerated(null);
    setMessages([{role:"ai",text:"已打开「" + name + "」的完整历史。我会继续按你的个人权限读取相关项目、任务与资产；没有被明确选中的项目不会自动成为共享项目空间。"}]);
  };
  return (
    <div className="ai-workspace">
      <aside className="ai-sessions">
        <div className="ai-session-head"><strong>AI Chat</strong><button className="icon-button" onClick={startNewChat} aria-label="新建对话"><Plus size={17}/></button></div>
        <button className="new-chat-button" onClick={startNewChat}><Plus size={16}/> 新建对话</button>
        <small>今天</small>
        {["规划今天的重点工作", "检查项目当前风险", "从周会提取任务"].map((item,index) => <button className={"session-item " + (activeSession === item ? "active" : "")} key={item} onClick={() => openSession(item)}><MessageSquareText size={15}/><span><strong>{item}</strong><small>{index === 0 ? "刚刚" : "2 小时前"}</small></span></button>)}
        <small>最近 7 天</small>
        {["凡诺官网竞品分析", "康福来资料缺口"].map((item) => <button className={"session-item " + (activeSession === item ? "active" : "")} key={item} onClick={() => openSession(item)}><MessageSquareText size={15}/><span><strong>{item}</strong><small>昨天</small></span></button>)}
      </aside>
      <section className="ai-chat-main">
        <header><AssistantLifeOrb size="small" /><div><strong>问问 AI 助手</strong><small><i/> 个人全局工作入口 · 默认仅你可见</small></div><div className="ai-chat-header-actions"><span className="personal-session-pill"><UserRound size={14}/> 个人会话</span><button className="button secondary compact" onClick={() => openPreview({eyebrow:"个人 AI 工作范围",title:"管理本次全局工作上下文",description:"助手会在你有权限的范围内跨项目检索，但不会自动把任何项目对话开放给其他人。",items:[{title:"今日任务与待确认",detail:"4 个今日重点 · 2 个待确认结果"},{title:"可访问项目",detail:"凡诺 AI 官网升级、全意 AI 工作中枢、康福来官网重构"},{title:"企业会议、聊天和资产",detail:"可按你的权限查找、汇总并生成候选任务"}],note:"需要多人围绕一个项目持续协作时，请进入该项目的「AI 协作」。",primaryLabel:"保存工作范围"})}><Settings size={15}/> 工作范围</button></div></header>
        <div className="ai-chat-scroll">
          {messages.length === 1 && !thinking && !streamingText && <div className="chat-welcome"><AssistantLifeOrb size="large" /><h1>今天想推进什么？</h1><p>从你的全部工作中查找信息、安排优先级或直接推进一项个人任务。</p><div>{["帮我安排今天最重要的 3 件事", "汇总所有项目的风险", "找出本周需要我确认的任务"].map((item) => <button key={item} onClick={() => send(item)}>{item}<ArrowRight size={14}/></button>)}</div></div>}
          <div className="ai-message-stream">
            {messages.map((message,index) => message.role === "system" ? <div className="chat-system-message" key={index}><Users size={13}/>{message.text}</div> : <div className={"chat-message " + message.role} key={index}>{message.role === "ai" ? <AssistantLifeOrb size="tiny" state="active" /> : null}<p>{message.text}</p></div>)}
            {thinking && <div className="chat-message ai is-thinking"><AssistantLifeOrb size="tiny" state="thinking" /><div className="ai-thinking-copy"><strong>正在组织回答</strong><span className="thinking-dots"><i/><i/><i/></span><small>读取项目、任务与最近会议...</small></div></div>}
            {streamingText && <div className="chat-message ai is-streaming"><AssistantLifeOrb size="tiny" state="active" /><p className="streaming-reply">{streamingText}<i className="stream-cursor" /></p></div>}
            {generated && <div className="chat-candidate-card"><header><span><Sparkles size={16}/> AI 发现了一个候选任务</span><em>{generated.confidence}% 置信度</em></header><h3>{generated.title}</h3><p>{generated.reason}</p><div><span>项目：{generated.suggestedProject}</span><span>负责人：{generated.suggestedOwner}</span><span>截止：{generated.due}</span></div><footer><button className="button secondary compact" onClick={() => setGenerated(null)}>暂不创建</button><button className="button primary compact" onClick={() => openCandidate(generated)}>审核并创建</button></footer></div>}
          </div>
        </div>
        <form className="ai-composer" onSubmit={(event) => {event.preventDefault(); send();}}>
          <div className="ai-composer-surface">
            {chatContexts.length > 0 && <div className="ai-composer-context-row"><ChatContextChips items={chatContexts} onChange={setChatContexts}/></div>}
            <div className="ai-composer-input-row"><ChatContextPicker selected={chatContexts} onChange={setChatContexts}/><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="直接向 AI 描述目标，或 @专家 / 调用 Skill..." /><button className="send-button" aria-label="发送" disabled={!text.trim() || thinking || Boolean(streamingText)}><ArrowRight size={17}/></button></div>
          </div>
          <footer><span><Sparkles size={13}/> AI 可能出错，关键任务会等待你确认</span><span>Enter 发送</span></footer>
        </form>
      </section>
      <aside className="ai-context-panel">
        <h2>个人工作范围</h2>
        <div className="context-card"><span>可用专家</span><div className="avatar-stack"><Avatar name="产"/><Avatar name="视"/><Avatar name="数"/></div><button onClick={() => openPreview({eyebrow:"专家管理",title:"本次会话可用专家",description:"专家会在同一对话中读取已授权上下文并返回结果。",items:[{title:"产品策略专家",detail:"需求拆解、路径与 MVP 边界"},{title:"视觉设计专家",detail:"界面一致性与设计系统"},{title:"数据分析专家",detail:"指标体系与数据洞察"}],note:"调用专家不会把会话开放给其他成员。",primaryLabel:"完成选择"})}>管理 <ChevronRight size={14}/></button></div>
        <div className="context-card skill-context-card"><span>推荐 Skill</span><button onClick={() => {setText("运行 UI 设计走查，检查当前工作流的入口、反馈和异常状态。");notify("已把「UI 设计走查」加入输入框");}}><WandSparkles size={16}/> UI 设计走查</button><button onClick={() => {setText("从最近的企业微信会议和群聊中提取行动项，按负责人生成待确认任务。");notify("已把「会议 / 聊天任务提取」加入输入框");}}><WandSparkles size={16}/> 会议 / 聊天任务提取</button></div>
        <div className="context-card optional-share-card"><span>临时共享</span><strong><Users size={16}/> {members.length === 1 ? "当前仅你可见" : members.length + " 人可访问"}</strong><button onClick={() => setMemberPanel(true)}>共享本次会话 <ChevronRight size={14}/></button><small>只共享这段历史；长期项目协作请进入项目空间。</small></div>
        <div className="privacy-note"><CheckCircle2 size={16}/><p><strong>个人权限范围内读取</strong><span>AI 只读取你能访问的内容，也不会自动把结果公开给项目成员。</span></p></div>
      </aside>
      {memberPanel && <ChatMemberPanel members={members} onInvite={inviteMember} onClose={() => setMemberPanel(false)} title="临时共享个人 AI 会话" accessLabel="可访问这段个人会话" inviteLabel="选择临时查看人" footerText="共享只对这一段会话生效。若需要围绕项目持续协作，请进入对应项目的「AI 协作」。" />}
    </div>
  );
}

function ChatMemberPanel({ members, onInvite, onClose, title = "会话成员", accessLabel = "可访问本会话", inviteLabel = "邀请团队成员", footerText = "被邀请人可以查看全部历史和后续消息，并使用同一上下文独立向 AI 提问。" }: { members: string[]; onInvite: (name: string) => void; onClose: () => void; title?: string; accessLabel?: string; inviteLabel?: string; footerText?: string }) {
  const invitees = teamMembers.filter((name) => !members.includes(name));
  return (
    <div className="chat-member-backdrop" onMouseDown={onClose}>
      <aside className="chat-member-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>{title}</span><strong>{members.length} 人可访问</strong></div><button className="icon-button" onClick={onClose} aria-label="关闭成员面板"><X size={18}/></button></header>
        <section><small>{accessLabel}</small>{members.map((name, index) => <div className="member-row" key={name}><Avatar name={name}/><p><strong>{name}</strong><span>{index === 0 ? "会话所有者 · " + memberRole(name) : memberRole(name) + " · 可查看全部历史并向 AI 提问"}</span></p><em>{index === 0 ? "所有者" : "可访问"}</em></div>)}</section>
        <section><small>{inviteLabel}</small>{invitees.map((name) => <div className="member-row" key={name}><Avatar name={name}/><p><strong>{name}</strong><span>{memberRole(name)}</span></p><button className="button secondary compact" onClick={() => onInvite(name)}>邀请</button></div>)}</section>
        <footer><CheckCircle2 size={15}/><span>{footerText}</span></footer>
      </aside>
    </div>
  );
}

function NotificationPopover({ close }: { close: () => void }) {
  const { notifications, setNotifications, tasks, openTask } = useHub();
  const navigate = useNavigate();
  const unreadCount = notifications.filter((item) => !item.read).length;
  const openNotification = (notification: HubNotification) => {
    setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
    if (notification.taskId) {
      const task = tasks.find((item) => item.id === notification.taskId);
      if (task) openTask(task);
    } else if (notification.route) {
      navigate(notification.route);
    }
    close();
  };
  return (
    <div className="notification-popover">
      <header><span><strong>通知</strong>{unreadCount > 0 && <em>{unreadCount} 条未读</em>}</span><button onClick={close} aria-label="关闭通知"><X size={15}/></button></header>
      <div className="notification-list">
        {notifications.length ? notifications.slice(0, 6).map((notification) => (
          <button className={notification.read ? "read" : ""} key={notification.id} onClick={() => openNotification(notification)}>
            <span className={"notification-icon " + (notification.kind === "task" ? "blue" : notification.kind === "page" ? "green" : notification.kind === "chat" ? "violet" : notification.kind === "extraction" ? "cyan" : "amber")}>
              {notification.kind === "task" ? <AtSign size={15}/> : notification.kind === "page" ? <BookOpen size={15}/> : notification.kind === "chat" ? <Users size={15}/> : notification.kind === "extraction" ? <Sparkles size={15}/> : <Bell size={15}/>}
            </span>
            <p><strong>{notification.title}</strong><span>{notification.detail}</span><small>{notification.createdAt}</small></p>
            {!notification.read && <i />}
          </button>
        )) : <div className="notification-empty"><CheckCircle2 size={22}/><span>暂时没有新通知</span></div>}
      </div>
      <footer><button onClick={() => setNotifications((items) => items.map((item) => ({ ...item, read: true })))}>全部标为已读</button></footer>
    </div>
  );
}

function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { tasks, assets, openTask, openAsset } = useHub();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const results = query ? tasks.filter((task) => task.title.includes(query)).slice(0,3) : tasks.slice(0,2);
  return (
    <AppModal title="全局搜索" subtitle="搜索任务、项目和资产，或让 AI 继续处理。" onClose={onClose} size="lg">
      <label className="search-modal-input"><Search size={20}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词..." /><kbd>ESC</kbd></label>
      <div className="search-results"><small>任务</small>{results.map((task) => <button key={task.id} onClick={() => {onClose(); openTask(task);}}><ListTodo size={17}/><span><strong>{task.title}</strong><small>{task.project}</small></span><StatusPill status={task.status}/></button>)}<small>资产</small>{assets.filter((asset) => !query || asset.title.includes(query)).slice(0,2).map((asset) => <button key={asset.id} onClick={() => {onClose();openAsset(asset);}}><FileText size={17}/><span><strong>{asset.title}</strong><small>{asset.scope}</small></span><ChevronRight size={15}/></button>)}</div>
      <button className="ask-ai-search" onClick={() => {onClose();navigate("/ai?prompt=" + encodeURIComponent("搜索并总结：" + (query || "当前工作")));}}><Sparkles size={17}/><span>让 AI 搜索并总结「{query || "当前工作"}」</span><ArrowRight size={16}/></button>
    </AppModal>
  );
}

function CreateTask({ onClose, defaultProjectId }: { onClose: () => void; defaultProjectId?: string }) {
  const { projects, setTasks, notify } = useHub();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", projectId: defaultProjectId || projects[0].id, owner: user.name, reviewer: user.role === "CEO" ? user.name : "徐泉", due: "", mode: "hybrid" as ExecutionMode, deliverable: "" });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const created = await createTask({project_id:form.projectId,stage_id:null,title:form.title.trim(),description:"从快速新建创建的任务，可在详情中继续补充背景。",deliverable:form.deliverable.trim()||"待补充交付物",acceptance:form.deliverable.trim()||"负责人提交非空结果并由验收人确认",owner_id:user.id,reviewer_id:user.role==="CEO"?user.id:"u-ceo",execution_mode:form.mode==="human"?"HUMAN":form.mode==="ai"?"AI":"HYBRID",priority:"MEDIUM",due_at:null});
      setTasks((items) => [taskFromApi(created), ...items]);
      notify("任务已真实创建并加入任务池");
      onClose();
    } catch (reason) {
      notify(reason instanceof ApiError ? reason.message : "任务创建失败");
    } finally {setBusy(false);}
  };
  return (
    <AppModal title="新建任务" subtitle="先保留最少必要信息，详情可由 AI 继续补全。" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label><span>任务标题 *</span><input autoFocus value={form.title} onChange={(event) => setForm({...form,title:event.target.value})} placeholder="要完成什么？" /></label>
        <div className="form-grid"><label><span>所属项目</span><select value={form.projectId} onChange={(event) => setForm({...form,projectId:event.target.value})}>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label><span>负责人</span><input value={form.owner} disabled /></label></div>
        <div className="form-grid"><label><span>交付给 / 验收人</span><input value={form.reviewer} disabled /></label><label><span>交付物</span><input value={form.deliverable} onChange={(event) => setForm({...form,deliverable:event.target.value})} placeholder="例如：信息架构 V2" /></label></div>
        <div className="form-grid"><label><span>截止时间</span><input value={form.due} onChange={(event) => setForm({...form,due:event.target.value})}/></label><label><span>执行方式</span><select value={form.mode} onChange={(event) => setForm({...form,mode:event.target.value as ExecutionMode})}><option value="human">人工</option><option value="ai">AI</option><option value="hybrid">人机协作</option></select></label></div>
        <div className="ai-form-tip"><Sparkles size={17}/><span>创建后 AI 会根据项目上下文建议执行步骤、风险与参考资料。</span></div>
        <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!form.title.trim()||busy}>{busy?"创建中…":"创建任务"}</button></footer>
      </form>
    </AppModal>
  );
}

function CandidateReview({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { projects, setTasks, setCandidates, notify } = useHub();
  const suggestedProject = projects.find((project) => project.name === candidate.suggestedProject) || projects[0];
  const [form, setForm] = useState({ title: candidate.title, owner: candidate.suggestedOwner, reviewer: candidate.suggestedOwner === "徐泉" ? "廖婉琛" : "徐泉", projectId: suggestedProject.id, due: candidate.due, mode: "hybrid" as ExecutionMode, deliverable: "可审核的工作结果" });
  const create = () => {
    const project = projects.find((item) => item.id === form.projectId)!;
    setTasks((items) => [{ id: "t-" + Date.now(), title: form.title, projectId: project.id, project: project.name, owner: form.owner, collaborators: [], reviewer: form.reviewer, due: form.due, priority: "中", status: "todo", mode: form.mode, progress: 0, description: candidate.reason, deliverable: form.deliverable, source: candidate.source + " · " + candidate.sourceDetail, nextAction: "负责人确认后开始执行" }, ...items]);
    setCandidates((items) => items.filter((item) => item.id !== candidate.id));
    notify("候选任务已确认并正式创建");
    onClose();
  };
  return (
    <AppModal title="审核候选任务" subtitle="AI 已完成提取，但正式进入团队前仍由你确认。" onClose={onClose} size="lg">
      <div className="candidate-source-box"><span className="source-icon large"><Sparkles size={18}/></span><div><span>{candidate.source} · {candidate.sourceDetail}</span><strong>{candidate.confidence}% 置信度</strong><p>{candidate.reason}</p></div></div>
      <div className="form-stack">
        <label><span>任务标题</span><input value={form.title} onChange={(event) => setForm({...form,title:event.target.value})}/></label>
        <div className="form-grid"><label><span>所属项目</span><select value={form.projectId} onChange={(event) => setForm({...form,projectId:event.target.value})}>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><label><span>负责人</span><select value={form.owner} onChange={(event) => setForm({...form,owner:event.target.value})}>{teamMembers.map((name) => <option key={name}>{name}</option>)}</select></label></div>
        <div className="form-grid"><label><span>截止时间</span><input value={form.due} onChange={(event) => setForm({...form,due:event.target.value})}/></label><label><span>执行方式</span><select value={form.mode} onChange={(event) => setForm({...form,mode:event.target.value as ExecutionMode})}><option value="human">人工</option><option value="ai">AI 执行</option><option value="hybrid">人机协作</option></select></label></div>
        <div className="form-grid"><label><span>交付物 / 验收标准</span><input value={form.deliverable} onChange={(event) => setForm({...form,deliverable:event.target.value})}/></label><label><span>交付给 / 验收人</span><select value={form.reviewer} onChange={(event) => setForm({...form,reviewer:event.target.value})}>{teamMembers.filter((name) => name !== form.owner).map((name) => <option key={name}>{name}</option>)}</select></label></div>
      </div>
      <footer className="modal-actions"><button className="text-button danger" onClick={() => {setCandidates((items) => items.filter((item) => item.id !== candidate.id)); onClose();}}>忽略候选</button><span className="action-spacer"/><button className="button secondary" onClick={onClose}>稍后处理</button><button className="button primary" onClick={create}><Check size={16}/> 确认创建</button></footer>
    </AppModal>
  );
}

function SubmitResultModal({ task, busy, onClose, onSubmit }: { task: Task; busy: boolean; onClose: () => void; onSubmit: (payload: ApiTaskActionRequest) => void }) {
  const [summary, setSummary] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const valid = Boolean(summary.trim() || externalUrl.trim());
  return <AppModal title="提交任务结果" subtitle="提交后进入待验收；本次内容会保存为不可覆盖的版本。" onClose={onClose} size="lg"><form className="form-stack" onSubmit={(event) => {event.preventDefault();if(valid)onSubmit({expected_version:task.version || 1,summary:summary.trim(),external_url:externalUrl.trim() || null,asset_reference:null,reason:""});}}><div className="permission-note"><ShieldCheck size={17}/><span>验收标准：{task.acceptance || task.deliverable}</span></div><label><span>结果说明</span><textarea autoFocus value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="说明完成了什么、关键结论和仍需关注的事项"/></label><label><span>结果链接（可选）</span><input value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://..."/></label><small className="field-guidance">结果说明或链接至少填写一项，不能空提交。</small><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!valid || busy}>{busy?"正在提交…":"提交验收"}</button></footer></form></AppModal>;
}

function WaitExternalModal({ task, userId, busy, onClose, onSubmit }: { task: Task; userId: string; busy: boolean; onClose: () => void; onSubmit: (payload: ApiTaskActionRequest) => void }) {
  const [contacts, setContacts] = useState<ApiExternalContact[]>([]);
  const [contactId, setContactId] = useState("");
  const [item, setItem] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [recoveryAction, setRecoveryAction] = useState("");
  useEffect(() => {fetchExternalContacts().then((items) => {setContacts(items);setContactId((value) => value || items[0]?.id || "");}).catch(() => setContacts([]));}, []);
  const valid = Boolean(contactId && item.trim() && expectedAt && recoveryAction.trim());
  return <AppModal title="等待外部反馈" subtitle="任务进度会冻结；服务端将在预计时间前 24 小时及逾期后提醒内部跟进人。" onClose={onClose} size="lg"><form className="form-stack" onSubmit={(event) => {event.preventDefault();if(valid)onSubmit({expected_version:task.version || 1,summary:"",external_url:null,asset_reference:null,reason:"",contact_id:contactId,item:item.trim(),expected_at:new Date(expectedAt).toISOString(),internal_followup_user_id:userId,recovery_action:recoveryAction.trim()});}}><label><span>等待对象</span><select value={contactId} onChange={(event) => setContactId(event.target.value)}>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.organization}</option>)}</select></label><label><span>等待事项</span><textarea autoFocus value={item} onChange={(event) => setItem(event.target.value)} placeholder="例如：客户确认首页最终文案"/></label><label><span>预计回复时间</span><input type="datetime-local" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)}/></label><label><span>收到反馈后的恢复动作</span><input value={recoveryAction} onChange={(event) => setRecoveryAction(event.target.value)} placeholder="例如：继续制作首页并提交验收"/></label><div className="permission-note"><Bell size={17}/><span>内部跟进人：当前负责人。提醒由服务端执行，关闭浏览器也不会中断。</span></div><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!valid || busy}>{busy ? "处理中…" : "确认等待"}</button></footer></form></AppModal>;
}

function TaskDetailPage() {
  const { tasks, setTasks, notify, addNotification, startChatWith, openPreview } = useHub();
  const { user } = useAuth();
  const { taskId } = useParams();
  const navigate = useNavigate();
  const task = tasks.find((item) => item.id === taskId);
  const [comment, setComment] = useState("");
  const [mentionMenu, setMentionMenu] = useState(false);
  const [reviewReminderSent, setReviewReminderSent] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [aiRevisionOpen, setAiRevisionOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [externalDependency, setExternalDependency] = useState<ApiExternalDependency | null>(null);
  const [agentRuns, setAgentRuns] = useState<ApiAgentRun[]>([]);
  const [activities, setActivities] = useState([
    { author: "AI 助手", text: "已根据项目上下文补充了执行建议。", time: "10 分钟前" },
    { author: task?.owner || "任务负责人", text: "更新了下一步行动。", time: "今天 10:20" },
  ]);
  useEffect(() => {
    if (!taskId) return;
    fetchTaskSubmissions(taskId).then(setSubmissions).catch(() => setSubmissions([]));
    fetchExternalDependency(taskId).then(setExternalDependency).catch(() => setExternalDependency(null));
    fetchAgentRuns(taskId).then(setAgentRuns).catch(() => setAgentRuns([]));
  }, [taskId]);
  if (!task) return <EmptyState icon={<ListTodo/>} title="没有找到这个任务" description="任务可能已被归档或删除。" action={<button className="button primary" onClick={() => navigate("/tasks")}>返回任务池</button>} />;
  const currentUser = user.name;
  const reviewer = task.reviewer || "徐泉";
  const isTaskOwner = task.owner === currentUser;
  const isReviewer = reviewer === currentUser;
  const replaceTask = (apiTask: ApiTask) => {
    setTasks((items) => items.map((item) => item.id === apiTask.id ? taskFromApi(apiTask) : item));
  };
  const runAction = async (actionName: "ACCEPT" | "START" | "SUBMIT" | "APPROVE" | "RETURN" | "WAIT_EXTERNAL" | "RESUME_EXTERNAL" | "CONFIRM_AI" | "REVISE_AI" | "CANCEL", payload: ApiTaskActionRequest, successMessage: string) => {
    setActionBusy(true);
    try {
      const result = await performTaskAction(task.id, actionName, payload);
      replaceTask(result.task);
      setSubmissions(await fetchTaskSubmissions(task.id));
      setExternalDependency(await fetchExternalDependency(task.id));
      setAgentRuns(await fetchAgentRuns(task.id));
      notify(successMessage);
      return true;
    } catch (reason) {
      notify(reason instanceof ApiError ? reason.message : "操作未完成，请刷新后重试");
      return false;
    } finally {
      setActionBusy(false);
    }
  };
  const action = async () => {
    if (task.apiStatus === "PENDING_OWNER_CONFIRMATION") await runAction("ACCEPT", { expected_version: task.version || 1, summary: "", external_url: null, asset_reference: null, reason: "" }, "任务已接收");
    else if (task.apiStatus === "TODO") await runAction("START", { expected_version: task.version || 1, summary: "", external_url: null, asset_reference: null, reason: "" }, "任务已开始");
    else if (task.apiStatus === "IN_PROGRESS") setSubmissionOpen(true);
    else if (task.apiStatus === "WAITING_EXTERNAL") await runAction("RESUME_EXTERNAL", { expected_version: task.version || 1, summary: "", external_url: null, asset_reference: null, reason: "" }, "已记录收到外部反馈，任务恢复执行");
    else if (task.apiStatus === "WAITING_HUMAN_CONFIRMATION" && agentRuns[0]) await runAction("CONFIRM_AI", { expected_version: task.version || 1, summary: "", external_url: null, asset_reference: null, reason: "", agent_run_id: agentRuns[0].id }, "AI 草稿已由人工确认并提交验收");
    else if (task.apiStatus === "WAITING_REVIEW" && isReviewer) await runAction("APPROVE", { expected_version: task.version || 1, summary: "", external_url: null, asset_reference: null, reason: "" }, "任务已验收完成");
    else if (task.apiStatus === "WAITING_REVIEW" && isTaskOwner && !reviewReminderSent) {
      addNotification({ kind: "task", title: `${task.owner}提醒你验收任务`, detail: `${task.title} · 交付物：${task.deliverable}`, taskId: task.id });
      setActivities((items) => [...items, { author: currentUser, text: `已提醒 @${reviewer} 验收交付物「${task.deliverable}」`, time: "刚刚" }]);
      setReviewReminderSent(true);
      notify(`已提醒 ${reviewer} 验收，对方已收到任务通知`);
    }
    else if (task.status === "blocked") navigate("/help");
  };
  const actionLabel = actionBusy ? "处理中…" : task.apiStatus === "PENDING_OWNER_CONFIRMATION" ? "接收任务" : task.apiStatus === "TODO" ? "开始任务" : task.apiStatus === "IN_PROGRESS" ? "提交结果" : task.apiStatus === "WAITING_EXTERNAL" ? "已收到反馈，恢复执行" : task.apiStatus === "WAITING_HUMAN_CONFIRMATION" ? "确认 AI 草稿并提交验收" : task.apiStatus === "WAITING_REVIEW" ? isReviewer ? "验收通过" : isTaskOwner ? reviewReminderSent ? `已提醒 ${reviewer}` : `提醒 ${reviewer} 验收` : `等待 ${reviewer} 验收` : task.status === "blocked" ? "发起求助" : "已完成";
  const actionDisabled = actionBusy || task.status === "done" || (task.apiStatus === "WAITING_REVIEW" && ((!isReviewer && !isTaskOwner) || reviewReminderSent));
  const generateAiDraft = async (revisionInstruction = "") => {
    setActionBusy(true);
    setAiBusy(true);
    try {
      const result = await startAgentRun(task.id, revisionInstruction);
      setAgentRuns((items) => [result.run, ...items.filter((item) => item.id !== result.run.id)]);
      setTasks((await fetchTasks()).map(taskFromApi));
      notify(result.run.execution_mode === "FALLBACK" ? "AI Live 调用失败，已生成明确标识的降级草稿" : "AI 草稿已生成，等待你人工确认");
      return true;
    } catch (reason) {
      notify(reason instanceof ApiError ? reason.message : "AI 运行启动失败");
      return false;
    } finally {
      setAiBusy(false);
      setActionBusy(false);
    }
  };
  const startAiAssistance = () => { void generateAiDraft(); };
  const reviseAiDraft = async (feedback: string) => {
    setActionBusy(true);
    setAiBusy(true);
    let revisionSaved = false;
    try {
      const revised = await performTaskAction(task.id, "REVISE_AI", {expected_version:task.version||1,summary:"",external_url:null,asset_reference:null,reason:feedback,agent_run_id:agentRuns[0]?.id||null});
      revisionSaved = true;
      replaceTask(revised.task);
      setAiRevisionOpen(false);
      setReturnReason("");
      const result = await startAgentRun(task.id, feedback);
      setAgentRuns((items) => [result.run, ...items.filter((item) => item.id !== result.run.id)]);
      setTasks((await fetchTasks()).map(taskFromApi));
      notify(result.run.execution_mode === "FALLBACK" ? "重做要求已保存；Live 调用失败，已生成降级草稿" : "AI 已按修改要求生成新草稿，等待你确认");
    } catch (reason) {
      if (revisionSaved) {
        notify("修改要求已保存，但 AI 重新生成失败；任务已恢复进行中，可点击“AI 协助生成草稿”重试");
      } else {
        notify(reason instanceof ApiError ? reason.message : "重做请求未完成，请刷新后重试");
      }
    } finally {
      setAiBusy(false);
      setActionBusy(false);
    }
  };
  const insertMention = (name: string) => {
    setComment((value) => value.replace(/@[^@\s]*$/, "@" + name + " "));
    setMentionMenu(false);
  };
  const submitComment = (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    const mentioned = teamMembers.filter((name) => comment.includes("@" + name));
    setActivities((items) => [...items, { author: currentUser, text: comment.trim(), time: "刚刚" }]);
    if (mentioned.length) {
      setTasks((items) => items.map((item) => item.id === task.id ? { ...item, collaborators: Array.from(new Set([...item.collaborators, ...mentioned])) } : item));
      notify("已通知 " + mentioned.join("、") + "，对方可直接打开这条协作消息");
    } else {
      notify("任务进展已同步");
    }
    setComment("");
    setMentionMenu(false);
  };
  return (
    <div className="task-detail-page">
      <header className="task-detail-header">
        <button className="task-detail-back" onClick={() => navigate(-1)}><ArrowLeft size={16}/> 返回</button>
        <div className="task-detail-heading">
          <div><span><NavLink to="/tasks">任务池</NavLink><ChevronRight size={13}/>{task.project}</span><h1>{task.title}</h1></div>
          <div className="task-detail-header-actions">
            {(task.apiStatus === "TODO" || task.apiStatus === "IN_PROGRESS") && isTaskOwner && <button className="button secondary" disabled={actionBusy} onClick={() => setExternalOpen(true)}><Clock3 size={16}/> 等待外部</button>}
            {task.apiStatus === "IN_PROGRESS" && isTaskOwner && <button className="button secondary" disabled={actionBusy} onClick={startAiAssistance}>{aiBusy ? <Activity size={16}/> : <Sparkles size={16}/>} {aiBusy ? "Ollama 正在生成…（首次可能约 2 分钟）" : "AI 协助生成草稿"}</button>}
            {task.apiStatus === "WAITING_HUMAN_CONFIRMATION" && isTaskOwner && <button className="button secondary" disabled={actionBusy} onClick={() => setAiRevisionOpen(true)}><ArrowLeft size={16}/> 要求 AI 重做</button>}
            {task.apiStatus === "WAITING_REVIEW" && isReviewer && <button className="button secondary" disabled={actionBusy} onClick={() => setReturnOpen(true)}><ArrowLeft size={16}/> 退回修改</button>}
            <button disabled={actionDisabled} className={"button primary " + (actionDisabled ? "disabled" : "")} onClick={action}>{task.status === "ai" ? <Activity size={16}/> : task.status === "review" && isTaskOwner ? <Bell size={16}/> : <ArrowRight size={16}/>} {actionLabel}</button>
          </div>
        </div>
      </header>
      <div className="task-detail-content">
        <main className="task-detail-main">
          <section className="task-overview-card">
            <div className="task-overview-topline">
              <div className="task-summary-row"><StatusPill status={task.status}/><ModePill mode={task.mode}/><span className={"priority-tag " + task.priority}>{task.priority}优先级</span></div>
              <span className="task-overview-owner"><Avatar name={task.owner} size="sm"/>{task.owner}负责</span>
            </div>
            <div className="task-progress-block"><div><span>推进进度</span><strong>{task.progress}%</strong></div><div className="progress-track"><i style={{width:task.progress + "%"}}/></div><p><Target size={15}/> 下一步：{task.nextAction}</p></div>
            {task.status === "blocked" && <div className="task-blocked-reason"><AlertCircle size={18}/><p><span>阻塞原因</span><strong>{task.blockedReason || task.description || "当前任务存在未解决的依赖，需要负责人补充阻塞原因。"}</strong><small>发起求助时会自动带上这段背景。</small></p></div>}
            {externalDependency && <div className={"task-external-dependency " + externalDependency.reminder_level.toLowerCase()}><Clock3 size={18}/><div><span>等待 {externalDependency.contact_name} · {externalDependency.reminder_level === "OVERDUE" ? "已逾期" : externalDependency.reminder_level === "UPCOMING" ? "24 小时内到期" : externalDependency.reminder_level === "RECEIVED" ? "已收到" : "正常等待"}</span><strong>{externalDependency.item}</strong><small>预计 {new Date(externalDependency.expected_at).toLocaleString("zh-CN")} · 跟进人 {externalDependency.internal_followup_user_name}</small><p>恢复动作：{externalDependency.recovery_action}</p></div></div>}
            <div className="task-brief-grid">
              <div className="task-background"><h2>任务背景</h2><p>{task.description}</p></div>
              <div className="task-handoff-card"><div><FileText size={18}/><p><span>交付物 / 验收标准</span><strong>{task.deliverable}</strong></p></div><div><ShieldCheck size={18}/><p><span>交付给 / 验收人</span><strong><Avatar name={reviewer} size="sm"/>{reviewer}</strong></p></div></div>
            </div>
          </section>

          <div className="task-detail-lower">
            <section className="task-detail-section ai-suggestion"><h2><Sparkles size={17}/> AI 建议</h2><ol><li><span>1</span>先确认当前交付物的判断标准</li><li><span>2</span>读取项目最近会议与相关资产</li><li><span>3</span>完成初稿后交由 {reviewer} 验收</li></ol><div><button onClick={() => startChatWith("让产品策略专家读取任务「" + task.title + "」及项目上下文，帮我判断下一步。") }><WandSparkles size={15}/> 调用产品策略专家</button><button onClick={() => openPreview({eyebrow:"运行 Skill",title:"需求分析 · " + task.title,description:"Skill 将读取任务背景、项目会议和相关资产，输出需求缺口与下一步建议。",items:[{title:"确认读取范围",detail:task.project + " · 当前任务与关联资产"},{title:"开始分析",detail:"预计 1–2 分钟，可在 AI 执行中心查看"},{title:"人工确认结果",detail:"候选行动不会直接成为正式任务"}],note:"运行记录会关联回当前任务。",primaryLabel:"进入 AI 执行中心",primaryRoute:"/agent"})}><Boxes size={15}/> 运行需求分析 Skill</button></div></section>
            {agentRuns[0]?.output_text && <section className="task-detail-section agent-draft-result"><div className="drawer-section-title"><h3><Bot size={16}/> AI 运行草稿</h3><span>{agentRuns[0].status}</span></div><div className={"ai-mode-banner "+(agentRuns[0].execution_mode||"mock").toLowerCase()}><Sparkles size={16}/><span><strong>{agentRuns[0].execution_mode==="LIVE"?"真实 AI":agentRuns[0].execution_mode==="FALLBACK"?"降级草稿":"本地 Mock 草稿"}</strong><small>{agentRuns[0].fallback_reason||`Prompt ${agentRuns[0].prompt_version} · 尝试 ${agentRuns[0].attempt_count}/${agentRuns[0].max_attempts}`}</small></span></div><pre>{agentRuns[0].output_text}</pre><p><ShieldCheck size={14}/> AI 不会自动完成任务；负责人确认后才进入验收。</p></section>}
            {submissions.length > 0 && <section className="task-detail-section submission-history"><div className="drawer-section-title"><h3>结果版本</h3><span>{submissions.length} 个不可覆盖版本</span></div><div className="submission-version-list">{submissions.map((item) => <article key={item.id}><span>V{item.version}</span><div><strong>{item.summary || "已提交外部结果"}</strong>{item.external_url && <a href={item.external_url} target="_blank" rel="noreferrer"><Link2 size={14}/> 打开结果链接</a>}<small>提交人 {item.submitted_by} · {new Date(item.created_at).toLocaleString("zh-CN")}</small></div></article>)}</div></section>}
            <section className="task-detail-section activity-section">
              <div className="drawer-section-title"><h3>进展与协作</h3><span>{task.collaborators.length} 位协作者</span></div>
              <div className="task-activity-feed">{activities.map((activity, index) => <div className="activity-item" key={activity.author + index}><Avatar name={activity.author} size="sm"/><p><strong>{activity.author}</strong><span><MentionText text={activity.text}/></span><small>{activity.time}</small></p></div>)}</div>
              <form className="mention-composer" onSubmit={submitComment}>
                {mentionMenu && <div className="mention-menu"><small>选择要通知的同事</small>{teamMembers.filter((name) => name !== "廖婉琛").map((name) => <button type="button" key={name} onClick={() => insertMention(name)}><Avatar name={name} size="sm"/><span>{name}</span><em>{memberRole(name)}</em></button>)}</div>}
                {teamMembers.some((name) => comment.includes("@" + name)) && <div className="composer-mentions">{teamMembers.filter((name) => comment.includes("@" + name)).map((name) => <span className="mention-chip" key={name}>@{name}</span>)}</div>}
                <input value={comment} onChange={(event) => {const value = event.target.value; setComment(value); setMentionMenu(/@[^@\s]*$/.test(value));}} placeholder="同步进展，或 @同事协作..." />
                <button type="button" className="mention-trigger" onClick={() => {setComment((value) => value + (value.endsWith(" ") || !value ? "@" : " @")); setMentionMenu(true);}} aria-label="提及同事"><AtSign size={15}/></button>
                <button className="send-progress" disabled={!comment.trim()} aria-label="发送协作消息"><Send size={15}/></button>
              </form>
            </section>
          </div>
        </main>

        <aside className="task-detail-aside">
          <section className="task-side-panel">
            <div className="task-side-group"><h2>任务信息</h2><dl><div><dt>负责人</dt><dd><Avatar name={task.owner} size="sm"/>{task.owner}</dd></div><div><dt>交付给</dt><dd><Avatar name={reviewer} size="sm"/>{reviewer} · 验收人</dd></div><div><dt>截止时间</dt><dd><Clock3 size={15}/>{task.due}</dd></div><div><dt>执行方式</dt><dd><ModePill mode={task.mode}/></dd></div>{task.status === "blocked" && <div className="task-side-blocked"><dt>阻塞原因</dt><dd>{task.blockedReason || task.description || "等待补充阻塞原因"}</dd></div>}<div><dt>原始来源</dt><dd><MessageSquareText size={15}/>{task.source}</dd></div></dl></div>
            <div className="task-side-group"><h2>协作成员</h2><div className="task-collaborators">{task.collaborators.length ? task.collaborators.map((name) => <span key={name}><Avatar name={name} size="sm"/>{name}</span>) : <p>暂时没有其他协作者</p>}</div><button className="button secondary compact full" onClick={() => {setComment((value) => value + (value ? " @" : "@")); setMentionMenu(true);}}><UserPlus size={15}/> 邀请成员协作</button></div>
            <div className="task-side-group"><h2>关联上下文</h2><button className="task-context-link" onClick={() => navigate("/projects/" + task.projectId)}><FolderKanban size={16}/><span><strong>{task.project}</strong><small>所属项目</small></span><ChevronRight size={15}/></button><button className="task-context-link" onClick={() => task.source.includes("AI Chat") ? navigate("/ai") : openPreview({eyebrow:"任务来源",title:task.source,description:"该任务从原始工作内容中提取并经人工确认后进入任务池。",items:[{title:"查看原始内容",detail:"保留会议、聊天或文档中的上下文"},{title:"查看提取记录",detail:"展示 AI 识别的负责人、时间和交付物"},{title:"回到当前任务",detail:"任务状态和协作记录不会受影响"}],note:"来源内容只读，修改任务不会覆盖原始记录。"})}><MessageSquareText size={16}/><span><strong>{task.source}</strong><small>任务来源</small></span><ChevronRight size={15}/></button></div>
          </section>
        </aside>
      </div>
      {submissionOpen && <SubmitResultModal task={task} busy={actionBusy} onClose={() => setSubmissionOpen(false)} onSubmit={async (payload) => {if (await runAction("SUBMIT", payload, "结果已提交，正在等待验收")) setSubmissionOpen(false);}}/>}
      {externalOpen && <WaitExternalModal task={task} userId={user.id} busy={actionBusy} onClose={() => setExternalOpen(false)} onSubmit={async (payload) => {if (await runAction("WAIT_EXTERNAL", payload, "任务已进入等待外部，服务端会按时提醒")) setExternalOpen(false);}}/>}
      {aiRevisionOpen && <AppModal title="要求 AI 重做" subtitle="提交后会保存修改要求，并立即调用 AI 生成一版新草稿。" onClose={() => setAiRevisionOpen(false)}><form className="form-stack" onSubmit={async (event) => {event.preventDefault();const feedback=returnReason.trim();if (!feedback) return;await reviseAiDraft(feedback);}}><label><span>修改要求</span><textarea autoFocus value={returnReason} onChange={(event)=>setReturnReason(event.target.value)} placeholder="说明缺少哪些信息、哪些结论需要调整"/></label><small className="field-guidance">修改要求会进入 AI 上下文，新草稿生成后将替换当前展示。</small><footer className="modal-actions"><button type="button" className="button secondary" disabled={actionBusy} onClick={()=>setAiRevisionOpen(false)}>取消</button><button className="button primary" disabled={!returnReason.trim()||actionBusy}>{actionBusy ? "AI 正在重新生成…" : "确认并重新生成"}</button></footer></form></AppModal>}
      {returnOpen && <AppModal title="退回修改" subtitle="退回原因会进入状态历史，负责人可据此修改后再次提交。" onClose={() => setReturnOpen(false)}><form className="form-stack" onSubmit={async (event) => {event.preventDefault();if (!returnReason.trim()) return;if (await runAction("RETURN", {expected_version:task.version || 1,summary:"",external_url:null,asset_reference:null,reason:returnReason.trim()}, "任务已退回负责人修改")) {setReturnOpen(false);setReturnReason("");}}}><label><span>退回原因</span><textarea autoFocus value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="请明确说明未通过的标准和需要修改的内容"/></label><small className="field-guidance">退回必须填写原因，避免负责人无依据返工。</small><footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setReturnOpen(false)}>取消</button><button className="button primary" disabled={!returnReason.trim() || actionBusy}>{actionBusy ? "处理中…" : "确认退回"}</button></footer></form></AppModal>}
    </div>
  );
}

function TaskExtractionReview({ initialSource, onClose }: { initialSource: ExtractionSource; onClose: () => void }) {
  const { projects, setTasks, notify } = useHub();
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [title, setTitle] = useState(initialSource === "meeting" ? "会议行动项" : "聊天行动项");
  const [content, setContent] = useState("");
  const [candidates, setCandidates] = useState<ApiCandidate[]>([]);
  const [mode, setMode] = useState<"LIVE"|"MOCK"|"FALLBACK"|null>(null);
  const [fallbackReason, setFallbackReason] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const extract = async () => {setBusy(true);setError("");try{const result=await createCandidateExtraction({project_id:projectId,source_type:initialSource==="meeting"?"MEETING":"CHAT",title,content});setCandidates(result.candidates);setMode(result.execution_mode);setFallbackReason(result.fallback_reason);notify(`已生成 ${result.candidates.length} 个候选，须人工确认后才会创建任务`);}catch(reason){setError(reason instanceof ApiError?reason.message:"候选提取失败");}finally{setBusy(false);}};
  const save = async (candidate: ApiCandidate) => {setBusy(true);try{const updated=await updateCandidate(candidate.id,{expected_version:candidate.version,title:candidate.title,deliverable:candidate.deliverable,description:candidate.description,owner_id:candidate.owner_id,reviewer_id:candidate.reviewer_id,due_at:candidate.due_at});setCandidates((items)=>items.map((item)=>item.id===updated.id?updated:item));notify("候选修改已保存");}catch(reason){notify(reason instanceof ApiError?reason.message:"保存失败");}finally{setBusy(false);}};
  const confirm = async (candidate: ApiCandidate) => {setBusy(true);try{const result=await confirmCandidate(candidate.id,candidate.version);setCandidates((items)=>items.map((item)=>item.id===candidate.id?result.candidate:item));setTasks((items)=>[taskFromApi(result.task),...items.filter((item)=>item.id!==result.task.id)]);notify("候选已确认并创建正式任务");}catch(reason){notify(reason instanceof ApiError?reason.message:"确认失败");}finally{setBusy(false);}};
  const ignore = async (candidate: ApiCandidate) => {setBusy(true);try{const result=await ignoreCandidate(candidate.id);setCandidates((items)=>items.map((item)=>item.id===result.id?result:item));notify("候选已忽略");}catch(reason){notify(reason instanceof ApiError?reason.message:"忽略失败");}finally{setBusy(false);}};
  return <AppModal title="AI 候选任务提取" subtitle="原文保存为不可变快照；AI 只生成候选，正式任务必须人工确认。" onClose={onClose} size="xl"><div className="candidate-live-workflow"><section className="form-stack"><label><span>所属项目</span><select value={projectId} onChange={(event)=>setProjectId(event.target.value)}>{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label><span>来源标题</span><input value={title} onChange={(event)=>setTitle(event.target.value)}/></label><label><span>粘贴{initialSource==="meeting"?"会议纪要":"聊天原文"}</span><textarea value={content} onChange={(event)=>setContent(event.target.value)} placeholder="每行一个明确行动项时，Mock 模式也可稳定提取。"/></label>{error&&<p className="login-error">{error}</p>}<button className="button primary" disabled={busy||content.trim().length<4||!projectId} onClick={extract}><Sparkles size={16}/>{busy?"处理中…":"保存快照并提取候选"}</button></section>{mode&&<div className={"ai-mode-banner "+mode.toLowerCase()}><Bot size={17}/><span><strong>{mode==="LIVE"?"真实 AI":mode==="FALLBACK"?"降级结果":"本地 Mock"}</strong><small>{mode==="FALLBACK"?`Live 调用失败，原因：${fallbackReason||"未知"}`:mode==="MOCK"?"确定性本地结果，不计入正式 Live 验收":"结果由 Qwen 实时生成并记录调用日志"}</small></span></div>}<div className="candidate-review-list">{candidates.map((candidate)=><article key={candidate.id} className={candidate.status!=="ACTIVE"?"resolved":""}><header><span>置信度 {candidate.confidence}%</span><em>{candidate.status}</em></header><input value={candidate.title} disabled={candidate.status!=="ACTIVE"} onChange={(event)=>setCandidates((items)=>items.map((item)=>item.id===candidate.id?{...item,title:event.target.value}:item))}/><textarea value={candidate.deliverable} disabled={candidate.status!=="ACTIVE"} onChange={(event)=>setCandidates((items)=>items.map((item)=>item.id===candidate.id?{...item,deliverable:event.target.value}:item))}/><small>证据：{candidate.evidence}</small>{candidate.status==="ACTIVE"&&<footer><button className="button secondary compact" disabled={busy} onClick={()=>ignore(candidate)}>忽略</button><button className="button secondary compact" disabled={busy} onClick={()=>save(candidate)}>保存修改</button><button className="button primary compact" disabled={busy||!candidate.owner_id||!candidate.reviewer_id} onClick={()=>confirm(candidate)}>确认创建任务</button></footer>}</article>)}</div></div><footer className="modal-actions"><button className="button secondary" onClick={onClose}>关闭</button></footer></AppModal>;
}

function LegacyTaskExtractionReview({ initialSource, onClose }: { initialSource: ExtractionSource; onClose: () => void }) {
  const { setTasks, notify, addNotification, projects, openPreview } = useHub();
  const [source, setSource] = useState<ExtractionSource>(initialSource);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => Object.values(extractionBatches).flatMap((batch) => batch.tasks.filter((task) => task.status !== "已确认").map((task) => task.id)));
  const batch = extractionBatches[source];
  const selectedVisibleTasks = batch.tasks.filter((task) => selectedIds.includes(task.id) && task.status !== "已确认");

  const toggleTask = (task: ExtractedTask) => {
    if (task.status === "已确认") return;
    setSelectedIds((ids) => ids.includes(task.id) ? ids.filter((id) => id !== task.id) : [...ids, task.id]);
  };

  const create = () => {
    if (!selectedVisibleTasks.length) return;
    const project = projects.find((item) => item.id === batch.projectId) || projects[0];
    const createdAt = Date.now();
    setTasks((tasks) => [...selectedVisibleTasks.map((item, index) => ({ id: "ext-" + createdAt + "-" + index, title: item.title, projectId: project.id, project: project.name, owner: item.owner, collaborators: [], reviewer: item.reviewer, due: item.due, priority: item.confidence >= 93 ? "高" as const : "中" as const, status: "todo" as const, mode: "human" as const, progress: 0, description: "由 AI 从" + batch.sourceLabel + "「" + batch.title + "」中提取，并经负责人确认。", deliverable: item.deliverable, source: batch.sourceLabel + " · " + batch.title, nextAction: "负责人开始执行并同步进展" })), ...tasks]);
    addNotification({ kind: "system", title: "已分发 " + selectedVisibleTasks.length + " 项任务", detail: "每位负责人已收到自己的任务，并保留原始" + (source === "meeting" ? "会议" : "聊天") + "上下文", route: "/tasks" });
    notify("已分发 " + selectedVisibleTasks.length + " 个任务；每位负责人只会收到分给自己的内容");
    onClose();
  };

  return (
    <AppModal title="AI 提取批次详情" subtitle="组织者视角：审核一次会议或聊天提取出的全部任务，再统一分发给负责人" onClose={onClose} size="xl">
      <div className="extraction-source-tabs">{(["meeting", "chat"] as const).map((item) => <button className={source === item ? "active" : ""} key={item} onClick={() => setSource(item)}>{item === "meeting" ? <MessageSquareText size={16}/> : <Users size={16}/>}<span><strong>{extractionBatches[item].sourceLabel}</strong><small>{extractionBatches[item].tasks.length} 项任务</small></span></button>)}</div>

      <section className="extraction-summary">
        <span className={"extraction-source-icon large " + source}>{source === "meeting" ? <MessageSquareText size={20}/> : <Users size={20}/>}</span>
        <div><span>{batch.sourceLabel} · 已连接企业微信</span><h3>{batch.title}</h3><p>{batch.summary}</p><small>{batch.context} · 关联项目：{batch.project}</small></div>
        <button className="button secondary compact" onClick={() => openPreview({eyebrow:batch.sourceLabel + "原文",title:batch.title,description:source === "meeting" ? "查看完整会议纪要、转写与行动项对应片段。" : "查看任务被识别时的群聊上下文，消息仅在当前成员权限范围内展示。",items:batch.tasks.map((task) => ({title:task.title,detail:"原文中明确出现负责人、截止时间或交付结果"})),note:"任务始终保留来源，可从任务详情回到原始上下文。"})}>查看原始内容</button>
      </section>

      <div className="extraction-management-bar"><div><span>本批次全部任务</span><strong>{batch.tasks.length} 项 · 涉及 {new Set(batch.tasks.map((task) => task.owner)).size} 位负责人</strong></div></div>

      <div className="extracted-task-list">
        <header><span>选择</span><span>任务与交付物</span><span>负责人</span><span>截止时间</span><span>状态</span><span/></header>
        {batch.tasks.map((item) => <div className={item.owner === "廖婉琛" ? "mine" : ""} key={item.id}><button className={"extraction-check " + (selectedIds.includes(item.id) ? "checked" : "")} disabled={item.status === "已确认"} onClick={() => toggleTask(item)} aria-label={selectedIds.includes(item.id) ? "取消选择" : "选择任务"}>{selectedIds.includes(item.id) || item.status === "已确认" ? <Check size={14}/> : null}</button><p><strong>{item.title}</strong><small>交付物：{item.deliverable} · 验收人：{item.reviewer} · AI 置信度 {item.confidence}%</small></p><span className="extraction-owner"><Avatar name={item.owner} size="sm"/>{item.owner}{item.owner === "廖婉琛" && <em>我</em>}</span><span>{item.due}</span><span className={"extraction-status " + (item.status === "已确认" ? "done" : "pending")}>{item.status}</span><button className="icon-button" onClick={() => openPreview({eyebrow:"提取任务详情",title:item.title,description:"AI 从原始" + (source === "meeting" ? "会议" : "聊天") + "中识别出的候选任务。",items:[{title:"负责人",detail:item.owner},{title:"交付给 / 验收人",detail:item.reviewer},{title:"截止时间",detail:item.due},{title:"交付物",detail:item.deliverable},{title:"识别置信度",detail:item.confidence + "%"}],note:"确认前可以调整负责人、时间与交付标准。",primaryLabel:"保存调整"})}><MoreHorizontal size={16}/></button></div>)}
      </div>

      <footer className="modal-actions extraction-footer"><button className="button secondary" onClick={onClose}>稍后处理</button><button className="button primary" disabled={!selectedVisibleTasks.length} onClick={create}>确认并分发 {selectedVisibleTasks.length} 项</button></footer>
    </AppModal>
  );
}

function MyAssignedTasksReview({ initialSource, onClose }: { initialSource: ExtractionSource | null; onClose: () => void }) {
  const { setTasks, notify, addNotification, projects } = useHub();
  const [filter, setFilter] = useState<"all" | ExtractionSource>(initialSource || "all");
  const assignedItems = (["meeting", "chat"] as const).flatMap((source) => {
    const batch = extractionBatches[source];
    return batch.tasks.filter((task) => task.owner === "廖婉琛" && task.status !== "已确认").map((task) => ({ source, batch, task }));
  });
  const visibleItems = filter === "all" ? assignedItems : assignedItems.filter((item) => item.source === filter);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => assignedItems.map((item) => item.task.id));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string,{title:string;due:string;deliverable:string;reviewer:string}>>(() => Object.fromEntries(assignedItems.map(({task}) => [task.id,{title:task.title,due:task.due,deliverable:task.deliverable,reviewer:task.reviewer}])));
  const selectedVisibleItems = visibleItems.filter((item) => selectedIds.includes(item.task.id));
  const toggle = (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const updateDraft = (id: string, patch: Partial<{title:string;due:string;deliverable:string;reviewer:string}>) => setDrafts((items) => ({...items,[id]:{...items[id],...patch}}));
  const accept = () => {
    if (!selectedVisibleItems.length) return;
    const createdAt = Date.now();
    const createdTasks: Task[] = selectedVisibleItems.map(({ batch, task }, index) => {
      const project = projects.find((item) => item.id === batch.projectId) || projects[0];
      const draft = drafts[task.id] || task;
      return { id: "mine-ext-" + createdAt + "-" + index, title: draft.title, projectId: project.id, project: project.name, owner: "廖婉琛", collaborators: [], reviewer: draft.reviewer, due: draft.due, priority: task.confidence >= 93 ? "高" : "中", status: "todo", mode: "human", progress: 0, description: "AI 从" + batch.sourceLabel + "「" + batch.title + "」中识别并分配给我，已由我确认接收。", deliverable: draft.deliverable, source: batch.sourceLabel + " · " + batch.title, nextAction: "开始执行并同步首次进展" };
    });
    setTasks((tasks) => [...createdTasks, ...tasks]);
    addNotification({ kind: "system", title: "已接收 " + createdTasks.length + " 项 AI 分配", detail: "任务已进入「我的任务」，原始会议或聊天来源仍可追溯", route: "/tasks" });
    notify("已接收 " + createdTasks.length + " 项任务并加入我的任务池");
    onClose();
  };
  const meetingCount = assignedItems.filter((item) => item.source === "meeting").length;
  const chatCount = assignedItems.filter((item) => item.source === "chat").length;
  return (
    <AppModal title="待我确认的 AI 分配" subtitle="直接查看并编辑会议或聊天中分给你的任务，确认后进入个人任务池" onClose={onClose} size="lg">
      <div className="assigned-filter-tabs">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部 <span>{assignedItems.length}</span></button>
        <button className={filter === "meeting" ? "active" : ""} onClick={() => setFilter("meeting")}>会议 <span>{meetingCount}</span></button>
        <button className={filter === "chat" ? "active" : ""} onClick={() => setFilter("chat")}>聊天 <span>{chatCount}</span></button>
      </div>
      <div className="assigned-personal-list">
        {visibleItems.map(({ source, batch, task }) => {const draft=drafts[task.id] || task; const editing=editingId===task.id; return <article key={task.id} className={(selectedIds.includes(task.id) ? "selected" : "") + (editing ? " editing" : "")}>
          <button className={"extraction-check " + (selectedIds.includes(task.id) ? "checked" : "")} onClick={() => toggle(task.id)} aria-label={selectedIds.includes(task.id) ? "取消选择" : "选择任务"}>{selectedIds.includes(task.id) && <Check size={14}/>}</button>
          <span className={"extraction-source-icon " + source}>{source === "meeting" ? <MessageSquareText size={16}/> : <Users size={16}/>}</span>
          <div className="assigned-item-copy">{editing ? <div className="assigned-edit-fields"><label><span>任务标题</span><input value={draft.title} onChange={(event) => updateDraft(task.id,{title:event.target.value})}/></label><div><label><span>交付物</span><input value={draft.deliverable} onChange={(event) => updateDraft(task.id,{deliverable:event.target.value})}/></label><label><span>交付给 / 验收人</span><select value={draft.reviewer} onChange={(event) => updateDraft(task.id,{reviewer:event.target.value})}>{teamMembers.filter((name) => name !== "廖婉琛").map((name) => <option key={name}>{name}</option>)}</select></label><label><span>截止时间</span><input value={draft.due} onChange={(event) => updateDraft(task.id,{due:event.target.value})}/></label></div></div> : <><small>{batch.sourceLabel} · {batch.title}</small><strong>{draft.title}</strong><p className="assigned-commitment"><span><FileText size={13}/><em>交付物</em>{draft.deliverable}</span></p></>}</div>
          {!editing && <div className="assigned-item-meta"><span className="assigned-due"><small>截止时间</small><strong>{draft.due}</strong></span><span className="assigned-reviewer"><small>验收人</small><strong><Avatar name={draft.reviewer} size="sm"/>{draft.reviewer}</strong></span></div>}
          <button className="button secondary compact" onClick={() => setEditingId(editing ? null : task.id)}>{editing ? "完成" : "编辑"}</button>
        </article>;})}
        {!visibleItems.length && <EmptyState icon={<Inbox/>} title="这个来源没有待确认任务" description="可以切换到全部、会议或聊天查看其他任务。" />}
      </div>
      <footer className="modal-actions assigned-footer"><button className="button secondary" onClick={onClose}>稍后处理</button><button className="button primary" disabled={!selectedVisibleItems.length} onClick={accept}>接收 {selectedVisibleItems.length} 项并加入我的任务</button></footer>
    </AppModal>
  );
}

function CreateHelp({ onClose }: { onClose: () => void }) {
  const { setHelps, notify } = useHub();
  const [form, setForm] = useState({ title:"", project:"全意 AI 工作中枢", tried:"", urgency:"普通" as "普通"|"紧急" });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if(!form.title.trim() || !form.tried.trim()) return;
    setHelps((items) => [{ id:"h-" + Date.now(), title:form.title, project:form.project, author:"廖婉琛", status:"ai", urgency:form.urgency, aiAnswer:"AI 已开始检索相关项目资料和企业知识，将先给出可执行建议；如无法解决，可继续转给专家。" }, ...items]);
    notify("求助已发布，AI 正在检索相关知识");
    onClose();
  };
  return (
    <AppModal title="发布求助" subtitle="先说明目标与已尝试方案，AI 才能更准确地检索和路由。" onClose={onClose}>
      <form className="form-stack" onSubmit={submit}><label><span>遇到什么问题？ *</span><textarea autoFocus value={form.title} onChange={(event) => setForm({...form,title:event.target.value})} placeholder="描述具体问题和期望结果"/></label><label><span>所属项目</span><select value={form.project} onChange={(event) => setForm({...form,project:event.target.value})}><option>全意 AI 工作中枢</option><option>凡诺 AI 官网升级</option><option>康福来官网重构</option></select></label><label><span>已经尝试过什么？ *</span><textarea value={form.tried} onChange={(event) => setForm({...form,tried:event.target.value})} placeholder="避免重复建议，也方便专家快速理解上下文"/></label><label><span>紧急程度</span><div className="choice-row">{["普通","紧急"].map((item) => <button type="button" className={form.urgency === item ? "active" : ""} key={item} onClick={() => setForm({...form,urgency:item as "普通"|"紧急"})}>{item}</button>)}</div></label><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!form.title.trim() || !form.tried.trim()}><Sparkles size={16}/> 发布并让 AI 分析</button></footer></form>
    </AppModal>
  );
}

function AssetDetail({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { notify } = useHub();
  const [immersive, setImmersive] = useState(false);
  const preview = asset.scope.includes("知识快照") ? ["页面发布内容", asset.summary, "版本说明", "这是知识页面在发布时形成的稳定快照。知识空间中的后续编辑不会覆盖此版本，可继续被任务、项目和其他页面引用。"] : asset.type === "会议" ? ["会议结论", "首页优先建立品牌可信度和 AI 官网能力认知。", "客户需要在周三前确认核心卖点与案例使用范围。", "已从会议中提取 3 个候选任务，等待负责人审核。"] : asset.type === "模板" ? ["使用说明", "在首页、产品页和解决方案页交付前完成以下检查：", "□ 页面目标是否只有一个主行动", "□ 信息层级是否支持快速浏览", "□ 每个模块是否有明确的内容责任人", "□ 移动端状态是否完整"] : asset.type === "知识" ? ["处理原则", "等待外部不等于暂停项目。需要同时记录等待对象、等待内容、预计回复时间和恢复动作。", "可以并行推进不依赖外部资料的模块，并在收到资料后自动恢复主任务。"] : ["产品背景", "全意 AI 工作中枢用于连接项目、任务、AI 执行、团队协作和企业知识。", "核心工作方式", "人工负责判断与确认，AI 负责检索、分析和执行；任务、页面与资产通过引用关系形成完整上下文。", "第一版范围", "覆盖工作台、项目空间、任务池、AI Chat、知识空间、资产库与能力库。"];
  return (
    <div className={"drawer-backdrop " + (immersive ? "immersive" : "")} onMouseDown={onClose}><aside className={"asset-drawer expanded " + (immersive ? "immersive" : "")} onMouseDown={(event) => event.stopPropagation()}><header className="drawer-header"><div><span>{asset.scope}</span><h2>{asset.title}</h2></div><button className="icon-button" onClick={onClose}><X size={18}/></button></header><div className="drawer-scroll"><div className="document-cover"><span className={"file-type " + asset.type}><FileText size={22}/></span><p><strong>{asset.type}</strong><span>由 {asset.owner} 更新于 {asset.updatedAt}</span></p><em>V1.3</em></div><section className="asset-content-preview"><header><span>内容预览</span><button className="text-button" onClick={() => setImmersive((value) => !value)}>{immersive ? "退出沉浸" : "沉浸查看"} <ArrowRight size={14}/></button></header><article><div className="asset-preview-title"><span className={"file-type " + asset.type}><FileText size={22}/></span><div><strong>{asset.title}</strong><small>{asset.summary}</small></div></div>{preview.map((paragraph,index) => index % 3 === 0 ? <h3 key={index}>{paragraph}</h3> : <p key={index}>{paragraph}</p>)}</article></section><section className="document-body"><h3>在哪些地方被引用</h3><div className="linked-items"><span><BookOpen size={16}/> 全意 AI 工作中枢协作说明</span><span><FolderKanban size={16}/> 全意 AI 工作中枢</span><span><ListTodo size={16}/> 3 个关联任务</span></div><h3>标签与版本</h3><div className="tag-row">{asset.tags.map((tag) => <span key={tag}>{tag}</span>)}<span>当前版本 V1.3</span></div></section></div><footer className="drawer-actions"><button className="button secondary" onClick={() => notify("已复制资产引用，可在页面或任务中粘贴")}><Paperclip size={16}/> 复制引用</button><button className="button primary" onClick={() => notify("已打开原始文件；在真实系统中会调用对应文件应用")}>打开原文件</button></footer></aside></div>
  );
}

function CreateAsset({ onClose, onCreate: saveAsset }: { onClose: () => void; onCreate: (asset: Asset) => void }) {
  const [form,setForm] = useState({title:"",type:"文档" as Asset["type"],scope:"公司资产",summary:""});
  const [fileName, setFileName] = useState("");
  const onCreate = (asset: Asset) => saveAsset({ ...asset, owner: "廖婉琛" });
  return (
    <AppModal title="上传资料到资产库" subtitle="文件作为独立资产保存，可被多个知识页面、任务和项目引用。" onClose={onClose}><form className="form-stack" onSubmit={(event) => {event.preventDefault(); const title = form.title.trim() || fileName; if(title) onCreate({id:"a-"+Date.now(),title,type:form.type,scope:form.scope,updatedAt:"刚刚",owner:"廖婉琛",summary:form.summary || "已上传资料，等待补充摘要。",tags:["上传资料"]});}}><label className="asset-upload-zone"><input type="file" onChange={(event) => {const file = event.target.files?.[0]; if (file) {setFileName(file.name); if (!form.title) setForm({...form,title:file.name});}}}/><span><Upload size={22}/></span><strong>{fileName || "选择文件或拖放到这里"}</strong><small>支持文档、表格、演示稿、PDF、图片和压缩包</small></label><label><span>资产名称 *</span><input value={form.title} onChange={(event) => setForm({...form,title:event.target.value})} placeholder="可使用文件名，也可以重新命名"/></label><div className="form-grid"><label><span>类型</span><select value={form.type} onChange={(event) => setForm({...form,type:event.target.value as Asset["type"]})}><option>文档</option><option>方案</option><option>会议</option><option>模板</option><option>知识</option></select></label><label><span>存放文件夹</span><select value={form.scope} onChange={(event) => setForm({...form,scope:event.target.value})}><option>公司资产</option><option>凡诺 AI 官网升级</option><option>全意 AI 工作中枢</option><option>康福来官网重构</option><option>Comply 项目</option></select></label></div><label><span>内容摘要</span><textarea value={form.summary} onChange={(event) => setForm({...form,summary:event.target.value})} placeholder="说明这份资料是什么、可用于什么场景"/></label><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!(form.title.trim() || fileName)}>保存到资产库</button></footer></form></AppModal>
  );
}

function RunSkill({ name, onClose }: { name: string; onClose: () => void }) {
  const { notify } = useHub();
  const [running,setRunning] = useState(false);
  return (
    <AppModal title={"运行 Skill · " + name} subtitle="选择上下文和目标，运行结果仍会进入人工确认。" onClose={onClose}><div className="form-stack"><label><span>关联项目</span><select><option>全意 AI 工作中枢</option><option>凡诺 AI 官网升级</option></select></label><label><span>希望完成什么？</span><textarea defaultValue="读取当前项目资料，分析存在的问题并给出下一步建议。"/></label><div className="permission-note"><CheckCircle2 size={17}/><span>本次可读取：项目任务、会议、相关资产；可创建候选任务，不会直接分发。</span></div><footer className="modal-actions"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={running} onClick={() => {setRunning(true);window.setTimeout(() => {notify(name + " 已开始运行，可在 AI 执行中心查看");onClose();},700);}}>{running ? "正在启动..." : <><Play size={15}/> 开始运行</>}</button></footer></div></AppModal>
  );
}

function ChatLaunch({ prompt, onClose }: { prompt: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { openPreview, projects, tasks, assets } = useHub();
  const [scope, setScope] = useState<"project" | "personal">("project");
  const [projectId, setProjectId] = useState("");
  const [includeTasks, setIncludeTasks] = useState(true);
  const selectedProject = projects.find((project) => project.id === projectId);
  const effectivePrompt = scope === "personal"
    ? prompt.replace("读取当前项目资料，并帮我分析下一步。", "协助我完成一项个人工作，并根据我的描述继续推进。")
    : prompt;
  const relatedTaskCount = selectedProject ? tasks.filter((task) => task.projectId === selectedProject.id).length : 0;
  const relatedAssetCount = selectedProject ? assets.filter((asset) => {
    const projectKey = selectedProject.name.split(" ")[0];
    const clientKey = selectedProject.client.replace("科技", "").replace("内部", "");
    return asset.scope.includes(selectedProject.client) || asset.title.includes(projectKey) || (clientKey.length > 1 && asset.title.includes(clientKey));
  }).length : 0;
  const launch = () => {
    if (scope === "project" && !selectedProject) return;
    const contextPrompt = scope === "project" && selectedProject
      ? `${effectivePrompt}\n\n关联项目：${selectedProject.name}。项目资产已自动连接${includeTasks ? `，同时读取该项目的 ${relatedTaskCount} 项相关任务` : "，本次不额外读取相关任务"}。`
      : `${effectivePrompt}\n\n这是个人工作，不绑定具体项目，也不读取项目专属资产。`;
    onClose();
    navigate(scope === "project" && selectedProject
      ? `/projects/${selectedProject.id}?tab=ai&prompt=${encodeURIComponent(contextPrompt)}`
      : "/ai?prompt=" + encodeURIComponent(contextPrompt));
  };
  return (
    <AppModal title="发起专家协作" subtitle={scope === "project" ? "选择项目后，专家会进入该项目的 AI 协作，并读取你有权限访问的项目上下文。" : "个人工作无需关联项目，将直接进入问问 AI 助手，也不会带入项目专属资料。"} onClose={onClose}>
      <div className="launch-chat-preview"><span className="assistant-orb"><Sparkles size={22}/></span><p>{effectivePrompt}</p></div>
      <div className="expert-scope-picker">
        <span>这次专家为哪类工作服务？</span>
        <div>
          <button className={scope === "project" ? "active" : ""} onClick={() => setScope("project")}><FolderKanban size={17}/><p><b>项目协作</b><small>锁定一个项目，进入项目 AI 协作</small></p><CheckCircle2 size={16}/></button>
          <button className={scope === "personal" ? "active" : ""} onClick={() => setScope("personal")}><UserRound size={17}/><p><b>个人工作</b><small>不绑定项目，进入问问 AI 助手</small></p><CheckCircle2 size={16}/></button>
        </div>
      </div>
      {scope === "project" && <div className="expert-project-picker">
        <label>
          <span>关联项目 *</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">请选择本次协作所属项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        {!selectedProject && <p className="field-guidance"><FolderKanban size={14}/> 必须选择项目后，才能连接资料并进入协作对话。</p>}
      </div>}
      {scope === "project" && selectedProject && <div className="context-preview expert-context-preview">
        <strong>将连接以下上下文</strong>
        <button onClick={() => openPreview({eyebrow:"当前项目",title:selectedProject.name,description:`${selectedProject.client} · ${selectedProject.stage}`,items:[{title:"项目目标与阶段",detail:selectedProject.nextMilestone},{title:"项目负责人",detail:selectedProject.owner},{title:"当前健康度",detail:selectedProject.health}],note:"专家只会读取你在该项目中有权限访问的内容。"})}><FolderKanban size={15}/><span><b>当前项目</b><small>{selectedProject.name}</small></span><CheckCircle2 size={15}/></button>
        <button onClick={() => openPreview({eyebrow:"项目资产",title:selectedProject.name + " · 项目资产",description:"选择项目后，项目内有权限访问的文件、会议和知识会自动连接。",items:[{title:"自动随项目连接",detail:relatedAssetCount ? `当前识别到 ${relatedAssetCount} 份直接相关资产` : "进入协作时按项目权限实时读取"},{title:"只读使用",detail:"专家不会修改原始文件和知识页面"},{title:"引用可追溯",detail:"回答中保留所使用资料的来源"}],note:"无需再次单独选择项目资产。"})}><Library size={15}/><span><b>项目资产</b><small>{relatedAssetCount ? `自动带入 ${relatedAssetCount} 份` : "自动按项目带入"}</small></span><CheckCircle2 size={15}/></button>
        <label className="optional-task-context"><input type="checkbox" checked={includeTasks} onChange={(event) => setIncludeTasks(event.target.checked)}/><ListTodo size={15}/><span><b>相关任务（可选）</b><small>{includeTasks ? `读取 ${relatedTaskCount} 项任务及协作记录` : "本次不读取任务"}</small></span></label>
      </div>}
      {scope === "personal" && <div className="personal-expert-note"><UserRound size={17}/><p><b>个人工作范围</b><span>适合周报、PPT、个人总结等工作；不会自动读取任何项目的专属任务和资产。</span></p></div>}
      <footer className="modal-actions"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={scope === "project" && !selectedProject} onClick={launch}><MessageSquareText size={16}/> {scope === "personal" ? "进入问问 AI 助手" : selectedProject ? "进入项目 AI 协作" : "请先选择项目"}</button></footer>
    </AppModal>
  );
}

function TeamMemberStack({ members, limit = 5 }: { members: string[]; limit?: number }) {
  const visible = members.slice(0, limit);
  const remaining = members.length - visible.length;
  return <span className="team-avatar-stack" aria-label={`${members.length} 位成员`}>{visible.map((name) => <Avatar key={name} name={name} size="sm"/>)}{remaining > 0 && <i>+{remaining}</i>}</span>;
}

function InviteTeamMember({team,onClose}:{team:TeamWorkspace;onClose:()=>void}) {
  const { notify } = useHub();
  const [email,setEmail] = useState("");
  const [role,setRole] = useState<"MEMBER"|"CEO">("MEMBER");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [activationLink,setActivationLink] = useState("");
  const submit = async(event:FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await createTeamInvitation(team.id,{email:email.trim(),role,project_id:null,project_role:null});
      const url = new URL(import.meta.env.BASE_URL || "/",window.location.origin);
      url.searchParams.set("invite",result.activation_token);
      setActivationLink(url.toString());
      notify("一次性邀请链接已生成，有效期 72 小时");
    } catch(reason) { setError(reason instanceof ApiError ? reason.message : "邀请创建失败"); }
    finally { setBusy(false); }
  };
  const copy = async() => { await navigator.clipboard.writeText(activationLink); notify("邀请链接已复制"); };
  return <AppModal title={`邀请成员加入「${team.name}」`} subtitle="邀请链接只能使用一次；对方激活后才会成为真实团队成员。" onClose={onClose}>
    {!activationLink?<form className="form-stack" onSubmit={submit}><label><span>受邀邮箱</span><input autoFocus type="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="name@company.com"/></label><label><span>团队角色</span><select value={role} onChange={(event)=>setRole(event.target.value as "MEMBER"|"CEO")}><option value="MEMBER">团队成员</option><option value="CEO">团队管理员</option></select></label>{error&&<p className="login-error">{error}</p>}<div className="permission-note"><ShieldCheck size={17}/><span>本阶段不会自动发送邮件，请复制链接并通过可信渠道单独发送给受邀成员。</span></div><footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={busy||!email.includes("@")}><UserPlus size={16}/>{busy?"正在创建…":"生成邀请链接"}</button></footer></form>:<div className="form-stack"><div className="permission-note"><CheckCircle2 size={17}/><span>邀请已创建。对方使用后链接立即失效。</span></div><label><span>一次性激活链接</span><textarea readOnly value={activationLink}/></label><footer className="modal-actions"><button className="button secondary" onClick={onClose}>完成</button><button className="button primary" onClick={copy}>复制邀请链接</button></footer></div>}
  </AppModal>;
}

function TeamsPage() {
  const { activeTeamId, setActiveTeamId, teams, notify, openPreview } = useHub();
  const activeTeam = teams.find((team) => team.id === activeTeamId) || teams[0] || emptyTeam;
  const [inviteOpen,setInviteOpen] = useState(false);
  const showMembers = (team: TeamWorkspace) => openPreview({
    eyebrow: "团队成员",
    title: team.name,
    description: `${team.members.length} 位成员共同参与这个团队的项目、任务、知识和 AI 工作。`,
    items: (team.memberDetails||[]).map((member) => ({title:member.name,detail:`${member.role === "CEO" ? "团队管理员" : "团队成员"} · ${member.email}${member.is_active ? "" : " · 已停用"}`})),
    note: "成员数据来自服务端；具体项目和资产仍按各自权限控制。",
    primaryLabel: "关闭成员列表",
  });
  const switchTeam = (team: TeamWorkspace) => {
    setActiveTeamId(team.id);
    notify(`当前工作团队已切换为「${team.name}」`);
  };
  return <div className="teams-page">
    <PageHeader title="我的团队" description="查看真实团队成员，并切换当前工作的组织范围。" action={activeTeam.role === "CEO" && activeTeam.id ? <button className="button primary" onClick={()=>setInviteOpen(true)}><UserPlus size={16}/> 邀请成员</button> : undefined} />
    <div className="teams-page-grid">
      <section className="panel team-list-panel">
        <header><div><span className="section-kicker">TEAM WORKSPACES</span><h2>我加入的团队</h2><p>团队和成员关系均从服务端读取。</p></div><span className="team-total">{teams.length} 个团队</span></header>
        <div className="team-workspace-list">
          {teams.map((team) => {
            const isActive = team.id === activeTeam.id;
            return <article className={`team-workspace-card ${team.tone}${isActive ? " active" : ""}`} key={team.id}>
              <span className="team-workspace-mark">{team.name.slice(0, 1)}</span>
              <div className="team-workspace-copy"><div><h3>{team.name}</h3>{isActive && <span className="current-team-pill"><Check size={12}/> 当前团队</span>}</div><p>{team.description}</p><small>{team.projects.length} 个活跃项目 · 我的角色：{team.role}</small></div>
              <div className="team-workspace-members"><TeamMemberStack members={team.members}/><button className="text-button" onClick={() => showMembers(team)}>查看成员</button></div>
              <button className={isActive ? "button secondary compact current" : "button secondary compact"} disabled={isActive} onClick={() => switchTeam(team)}>{isActive ? "正在使用" : "切换到此团队"}{!isActive && <ArrowRight size={14}/>}</button>
            </article>;
          })}
        </div>
      </section>
      <aside className="team-context-column">
        <section className="panel current-team-card">
          <div className={`current-team-logo ${activeTeam.tone}`}>{activeTeam.name.slice(0, 1)}</div>
          <span className="section-kicker">当前工作范围</span>
          <h2>{activeTeam.name}</h2>
          <p>{activeTeam.description}</p>
          <div className="current-team-meta"><span><Users size={15}/>{activeTeam.members.length} 位成员</span><span><FolderKanban size={15}/>{activeTeam.projects.length} 个项目</span></div>
          <div className="team-member-board"><div><strong>团队成员</strong><button className="text-button" onClick={() => showMembers(activeTeam)}>查看全部</button></div><TeamMemberStack members={activeTeam.members} limit={6}/><p>{activeTeam.members.slice(0, 4).join("、")}{activeTeam.members.length > 4 ? `等 ${activeTeam.members.length} 人` : ""}</p></div>
        </section>
        <section className="panel team-scope-note"><h3>切换团队会发生什么？</h3><p>工作台、项目空间、任务与知识会优先显示当前团队的内容；个人 AI 助手仍可在你有权限的多个团队间检索。</p><button className="text-button" onClick={() => openPreview({eyebrow:"团队与权限",title:"团队范围如何生效",description:"团队负责组织成员和工作范围，项目负责承载具体目标与交付。",items:[{title:"当前团队",detail:"决定工作台默认呈现的项目、任务和知识"},{title:"跨团队访问",detail:"个人 AI 只检索你在其他团队中已经获得授权的内容"},{title:"项目权限",detail:"加入团队后仍需按项目授予编辑或查看权限"}],note:"切换团队不会退出其他团队，也不会改变已有权限。",primaryLabel:"我知道了"})}>了解团队与权限 <ArrowRight size={14}/></button></section>
      </aside>
      {inviteOpen&&<InviteTeamMember team={activeTeam} onClose={()=>setInviteOpen(false)}/>}
    </div>
  </div>;
}

function SettingsPage() {
  const { activeTeamId, teams, notify } = useHub();
  const { user } = useAuth();
  const navigate = useNavigate();
  const activeTeam = teams.find((team) => team.id === activeTeamId) || teams[0] || emptyTeam;
  const [tab, setTab] = useState("个人设置");
  const [settings, setSettings] = useState({task:true,mention:true,ai:true,weekly:false,confirm:true,assets:true});
  const toggle = (key: keyof typeof settings) => setSettings((value) => ({...value,[key]:!value[key]}));
  return <>
    <PageHeader title="设置" description="管理个人通知、AI 权限与工作偏好。" action={<button className="button primary" onClick={() => notify("设置已保存并同步到当前账号")}>保存设置</button>} />
    <div className="settings-layout">
      <aside className="panel settings-nav">{["个人设置","通知规则","AI 与权限"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}<ChevronRight size={15}/></button>)}</aside>
      <section className="panel settings-main">
        {tab === "个人设置" && <><div className="settings-profile"><Avatar name={user.name} size="lg"/><div><h2>{user.name}</h2><p>{user.role === "CEO" ? "团队管理员" : "团队成员"} · 当前团队：{activeTeam.name}</p></div></div><div className="settings-form"><label><span>显示名称</span><input value={user.name} readOnly/></label><label><span>登录邮箱</span><input value={user.email} readOnly/></label><label><span>默认工作周期</span><select><option>本周</option><option>今天</option><option>本月</option></select></label></div><div className="settings-team-redirect"><Users size={19}/><div><strong>团队成员由服务端管理</strong><p>查看已加入的团队、切换当前团队或邀请真实成员，请进入“我的团队”。</p></div><button className="button secondary compact" onClick={() => navigate("/teams")}>查看我的团队 <ArrowRight size={14}/></button></div></>}
        {tab === "通知规则" && <><div className="panel-title-row"><div><h2>通知规则</h2><p>任务通知、@提及和 AI 结果统一进入顶部通知中心。</p></div></div><div className="settings-switch-list">{[["task","任务状态变化","任务被分配、截止或状态变化时通知"],["mention","@提及","任务、知识页面或空间动态中提到你时通知"],["ai","AI 结果待确认","AI 执行结束并等待人工判断时通知"],["weekly","每周摘要","每周一推送上周完成与本周重点"]].map(([key,title,desc]) => <button key={key} onClick={() => toggle(key as keyof typeof settings)}><p><strong>{title}</strong><small>{desc}</small></p><i className={settings[key as keyof typeof settings] ? "on" : ""}><span/></i></button>)}</div></>}
        {tab === "AI 与权限" && <><div className="panel-title-row"><div><h2>AI 与权限</h2><p>定义 AI 能读取什么，以及哪些动作必须等待人工确认。</p></div></div><div className="settings-switch-list">{[["confirm","关键结果必须人工确认","创建正式任务、完成验收和发布资产前等待确认"],["assets","允许读取已授权资产","只读取当前成员有权访问的文件和页面"]].map(([key,title,desc]) => <button key={key} onClick={() => toggle(key as keyof typeof settings)}><p><strong>{title}</strong><small>{desc}</small></p><i className={settings[key as keyof typeof settings] ? "on" : ""}><span/></i></button>)}</div><div className="permission-note"><CheckCircle2 size={17}/><span>AI 的读取权限不会超过当前操作成员；所有关键写入都会保留审计记录。</span></div></>}
      </section>
    </div>
  </>;
}

export default function AppV2() {
  return <WorkHubProvider><Shell /></WorkHubProvider>;
}
