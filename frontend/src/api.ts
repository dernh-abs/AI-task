import type { components } from "./api-schema";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const TOKEN_KEY = "quanyi-mvp-token";
const REMEMBER_KEY = "quanyi-mvp-remember";

export type ApiUser = components["schemas"]["UserRead"];
export type ApiProject = components["schemas"]["ProjectRead"];
export type ApiProjectMember = components["schemas"]["ProjectMemberRead"];
export type ApiProjectTaskOverview = components["schemas"]["ProjectTaskOverviewRead"];
export type ApiTask = components["schemas"]["TaskRead"];
type TokenResponse = components["schemas"]["TokenResponse"];
export type ApiTaskActionRequest = components["schemas"]["TaskActionRequest"];
export type ApiTaskActionResponse = components["schemas"]["TaskActionResponse"];
export type ApiSubmission = components["schemas"]["SubmissionRead"];
export type ApiExternalContact = components["schemas"]["ExternalContactRead"];
export type ApiExternalDependency = components["schemas"]["ExternalDependencyRead"];
export type ApiCandidate = components["schemas"]["CandidateRead"];
export type ApiCandidateExtractionResponse = components["schemas"]["CandidateExtractionResponse"];
export type ApiAgentRun = components["schemas"]["AgentRunRead"];
export type ApiProjectConversation = components["schemas"]["ProjectConversationRead"];
export type ApiProjectChatMessage = components["schemas"]["ProjectChatMessageRead"];
export type ApiContribution = components["schemas"]["ContributionRead"];
export type ApiInvitation = components["schemas"]["InvitationPublicRead"];
export type ApiInvitationCreated = components["schemas"]["InvitationCreatedRead"];
export type ApiInvitationAdmin = components["schemas"]["InvitationAdminRead"];
export type ApiTeam = components["schemas"]["TeamRead"];
export type ApiWeComStatus = components["schemas"]["WeComStatusRead"];
export type ApiWeComDocument = components["schemas"]["WeComDocumentRead"];

export class ApiError extends Error { constructor(public status:number, message:string) { super(message); } }
export const tokenStore = {
  get:()=>{
    const sessionToken=window.sessionStorage.getItem(TOKEN_KEY);
    if(sessionToken)return sessionToken;
    const persistentToken=window.localStorage.getItem(TOKEN_KEY);
    if(persistentToken&&window.localStorage.getItem(REMEMBER_KEY)==="true")return persistentToken;
    if(persistentToken)window.localStorage.removeItem(TOKEN_KEY);
    return null;
  },
  set:(token:string,persistent=false)=>{
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REMEMBER_KEY);
    if(persistent){window.localStorage.setItem(TOKEN_KEY,token);window.localStorage.setItem(REMEMBER_KEY,"true");return;}
    window.sessionStorage.setItem(TOKEN_KEY,token);
  },
  clear:()=>{window.sessionStorage.removeItem(TOKEN_KEY);window.localStorage.removeItem(TOKEN_KEY);window.localStorage.removeItem(REMEMBER_KEY);},
  isPersistent:()=>Boolean(window.localStorage.getItem(TOKEN_KEY)&&window.localStorage.getItem(REMEMBER_KEY)==="true")
};

async function request<T>(path:string, options:RequestInit={}):Promise<T> {
  const token=tokenStore.get();
  const response=await fetch(API_BASE+path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}});
  if(!response.ok){let message=`请求失败（${response.status}）`;try{const body=await response.json();message=typeof body.detail==="string"?body.detail:body.detail?.message||body.detail?.[0]?.msg||message;}catch{/* status fallback */}throw new ApiError(response.status,message);}
  return response.json() as Promise<T>;
}

export const login=(email:string,password:string)=>request<TokenResponse>("/auth/login",{method:"POST",body:JSON.stringify({email,password})});
export const fetchMe=()=>request<ApiUser>("/auth/me");
export const changePassword=(currentPassword:string,newPassword:string)=>request<TokenResponse>("/auth/change-password",{method:"POST",body:JSON.stringify({current_password:currentPassword,new_password:newPassword})});
export const inspectInvitation=(token:string)=>request<ApiInvitation>(`/invitations/${encodeURIComponent(token)}`);
export const acceptInvitation=(token:string,payload:components["schemas"]["InvitationAcceptRequest"])=>request<TokenResponse>(`/invitations/${encodeURIComponent(token)}/accept`,{method:"POST",body:JSON.stringify(payload)});
export const acceptExistingInvitation=(token:string)=>request<ApiInvitationAdmin>(`/invitations/${encodeURIComponent(token)}/accept-existing`,{method:"POST"});
export const fetchTeams=()=>request<ApiTeam[]>("/teams");
export const createTeamInvitation=(teamId:string,payload:components["schemas"]["InvitationCreateRequest"])=>request<ApiInvitationCreated>(`/teams/${teamId}/invitations`,{method:"POST",body:JSON.stringify(payload)});
export const fetchTeamInvitations=(teamId:string)=>request<ApiInvitationAdmin[]>(`/teams/${teamId}/invitations`);
export const revokeTeamInvitation=(teamId:string,invitationId:string)=>request<ApiInvitationAdmin>(`/teams/${teamId}/invitations/${invitationId}/revoke`,{method:"POST"});
export const fetchWeComStatus=()=>request<ApiWeComStatus>("/integrations/wecom/status");
export const createWeComDocument=(payload:components["schemas"]["WeComDocumentCreateRequest"])=>request<ApiWeComDocument>("/integrations/wecom/documents",{method:"POST",body:JSON.stringify(payload)});
export const fetchProjects=()=>request<ApiProject[]>("/projects");
export const fetchProjectMembers=(projectId:string)=>request<ApiProjectMember[]>(`/projects/${projectId}/members`);
export const fetchProjectTaskOverview=(projectId:string)=>request<ApiProjectTaskOverview>(`/projects/${projectId}/task-overview`);
export const decomposeProject=(projectId:string,payload:components["schemas"]["ProjectDecompositionRequest"])=>request<ApiCandidateExtractionResponse>(`/projects/${projectId}/decompositions`,{method:"POST",body:JSON.stringify(payload)});
export const createProject=(payload:components["schemas"]["ProjectCreateRequest"])=>request<ApiProject>("/projects",{method:"POST",body:JSON.stringify(payload)});
export const createStage=(projectId:string,payload:components["schemas"]["StageCreateRequest"])=>request<ApiProject>(`/projects/${projectId}/stages`,{method:"POST",body:JSON.stringify(payload)});
export const updateStage=(stageId:string,payload:components["schemas"]["StageUpdateRequest"])=>request<ApiProject>(`/stages/${stageId}`,{method:"PATCH",body:JSON.stringify(payload)});
export const fetchTasks=()=>request<ApiTask[]>("/tasks");
export const createTask=(payload:components["schemas"]["TaskCreateRequest"])=>request<ApiTask>("/tasks",{method:"POST",body:JSON.stringify(payload)});
export const performTaskAction=(taskId:string,action:"ACCEPT"|"START"|"SUBMIT"|"APPROVE"|"RETURN"|"WAIT_EXTERNAL"|"RESUME_EXTERNAL"|"CONFIRM_AI"|"REVISE_AI"|"CANCEL",payload:ApiTaskActionRequest,idempotencyKey=crypto.randomUUID())=>request<ApiTaskActionResponse>(`/tasks/${taskId}/actions/${action}`,{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify(payload)});
export const fetchTaskSubmissions=(taskId:string)=>request<ApiSubmission[]>(`/tasks/${taskId}/submissions`);
export const fetchExternalContacts=()=>request<ApiExternalContact[]>("/external-contacts");
export const fetchExternalDependency=(taskId:string)=>request<ApiExternalDependency|null>(`/tasks/${taskId}/external-dependency`);
export const createCandidateExtraction=(payload:components["schemas"]["CandidateExtractionRequest"])=>request<ApiCandidateExtractionResponse>("/candidate-extractions",{method:"POST",body:JSON.stringify(payload)});
export const fetchCandidates=(projectId?:string)=>request<ApiCandidate[]>(`/candidates${projectId?`?project_id=${encodeURIComponent(projectId)}`:""}`);
export const updateCandidate=(candidateId:string,payload:components["schemas"]["CandidateUpdateRequest"])=>request<ApiCandidate>(`/candidates/${candidateId}`,{method:"PATCH",body:JSON.stringify(payload)});
export const confirmCandidate=(candidateId:string,expectedVersion:number,idempotencyKey=crypto.randomUUID())=>request<components["schemas"]["CandidateConfirmResponse"]>(`/candidates/${candidateId}/confirm`,{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify({expected_version:expectedVersion})});
export const ignoreCandidate=(candidateId:string,idempotencyKey=crypto.randomUUID())=>request<ApiCandidate>(`/candidates/${candidateId}/ignore`,{method:"POST",headers:{"Idempotency-Key":idempotencyKey}});
export const startAgentRun=(taskId:string,revisionInstruction="")=>request<components["schemas"]["AgentRunStartResponse"]>(`/tasks/${taskId}/agent-runs`,{method:"POST",body:JSON.stringify({revision_instruction:revisionInstruction})});
export const fetchAgentRuns=(taskId:string)=>request<ApiAgentRun[]>(`/tasks/${taskId}/agent-runs`);
export const fetchAllAgentRuns=(filters:{status?:string;projectId?:string}={})=>{const params=new URLSearchParams();if(filters.status)params.set("status",filters.status);if(filters.projectId)params.set("project_id",filters.projectId);const query=params.toString();return request<ApiAgentRun[]>(`/agent-runs${query?`?${query}`:""}`);};
export const fetchProjectConversations=(projectId:string)=>request<ApiProjectConversation[]>(`/projects/${projectId}/conversations`);
export const createProjectConversation=(projectId:string,title="新对话")=>request<ApiProjectConversation>(`/projects/${projectId}/conversations`,{method:"POST",body:JSON.stringify({title})});
export const fetchProjectChatMessages=(conversationId:string)=>request<ApiProjectChatMessage[]>(`/project-conversations/${conversationId}/messages`);
export const sendProjectChatMessage=(conversationId:string,content:string,idempotencyKey=crypto.randomUUID())=>request<components["schemas"]["ProjectChatSendResponse"]>(`/project-conversations/${conversationId}/messages`,{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify({content})});
export const fetchContributions=()=>request<ApiContribution[]>("/contributions");
