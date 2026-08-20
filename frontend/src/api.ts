import type { components } from "./api-schema";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const TOKEN_KEY = "quanyi-mvp-token";

export type ApiUser = components["schemas"]["UserRead"];
export type ApiProject = components["schemas"]["ProjectRead"];
export type ApiProjectMember = components["schemas"]["ProjectMemberRead"];
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

export class ApiError extends Error { constructor(public status:number, message:string) { super(message); } }
export const tokenStore = { get:()=>window.localStorage.getItem(TOKEN_KEY), set:(token:string)=>window.localStorage.setItem(TOKEN_KEY,token), clear:()=>window.localStorage.removeItem(TOKEN_KEY) };

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
export const fetchTeams=()=>request<ApiTeam[]>("/teams");
export const createTeamInvitation=(teamId:string,payload:components["schemas"]["InvitationCreateRequest"])=>request<ApiInvitationCreated>(`/teams/${teamId}/invitations`,{method:"POST",body:JSON.stringify(payload)});
export const fetchTeamInvitations=(teamId:string)=>request<ApiInvitationAdmin[]>(`/teams/${teamId}/invitations`);
export const revokeTeamInvitation=(teamId:string,invitationId:string)=>request<ApiInvitationAdmin>(`/teams/${teamId}/invitations/${invitationId}/revoke`,{method:"POST"});
export const fetchProjects=()=>request<ApiProject[]>("/projects");
export const fetchProjectMembers=(projectId:string)=>request<ApiProjectMember[]>(`/projects/${projectId}/members`);
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
