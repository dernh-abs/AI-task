import type { components } from "./api-schema";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const TOKEN_KEY = "quanyi-mvp-token";

export type ApiUser = components["schemas"]["UserRead"];
export type ApiProject = components["schemas"]["ProjectRead"];
export type ApiTask = components["schemas"]["TaskRead"];
type TokenResponse = components["schemas"]["TokenResponse"];
export type ApiTaskActionRequest = components["schemas"]["TaskActionRequest"];
export type ApiTaskActionResponse = components["schemas"]["TaskActionResponse"];
export type ApiSubmission = components["schemas"]["SubmissionRead"];
export type ApiExternalContact = components["schemas"]["ExternalContactRead"];
export type ApiExternalDependency = components["schemas"]["ExternalDependencyRead"];
export type ApiCandidate = components["schemas"]["CandidateRead"];
export type ApiCandidateExtractionResponse = components["schemas"]["CandidateExtractionResponse"];

export class ApiError extends Error { constructor(public status:number, message:string) { super(message); } }
export const tokenStore = { get:()=>window.localStorage.getItem(TOKEN_KEY), set:(token:string)=>window.localStorage.setItem(TOKEN_KEY,token), clear:()=>window.localStorage.removeItem(TOKEN_KEY) };

async function request<T>(path:string, options:RequestInit={}):Promise<T> {
  const token=tokenStore.get();
  const response=await fetch(API_BASE+path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}});
  if(!response.ok){let message=`请求失败（${response.status}）`;try{const body=await response.json();message=typeof body.detail==="string"?body.detail:body.detail?.message||message;}catch{/* status fallback */}throw new ApiError(response.status,message);}
  return response.json() as Promise<T>;
}

export const login=(email:string,password:string)=>request<TokenResponse>("/auth/login",{method:"POST",body:JSON.stringify({email,password})});
export const fetchMe=()=>request<ApiUser>("/auth/me");
export const fetchProjects=()=>request<ApiProject[]>("/projects");
export const fetchTasks=()=>request<ApiTask[]>("/tasks");
export const performTaskAction=(taskId:string,action:"ACCEPT"|"START"|"SUBMIT"|"APPROVE"|"RETURN"|"WAIT_EXTERNAL"|"RESUME_EXTERNAL"|"CANCEL",payload:ApiTaskActionRequest,idempotencyKey=crypto.randomUUID())=>request<ApiTaskActionResponse>(`/tasks/${taskId}/actions/${action}`,{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify(payload)});
export const fetchTaskSubmissions=(taskId:string)=>request<ApiSubmission[]>(`/tasks/${taskId}/submissions`);
export const fetchExternalContacts=()=>request<ApiExternalContact[]>("/external-contacts");
export const fetchExternalDependency=(taskId:string)=>request<ApiExternalDependency|null>(`/tasks/${taskId}/external-dependency`);
export const createCandidateExtraction=(payload:components["schemas"]["CandidateExtractionRequest"])=>request<ApiCandidateExtractionResponse>("/candidate-extractions",{method:"POST",body:JSON.stringify(payload)});
export const updateCandidate=(candidateId:string,payload:components["schemas"]["CandidateUpdateRequest"])=>request<ApiCandidate>(`/candidates/${candidateId}`,{method:"PATCH",body:JSON.stringify(payload)});
export const confirmCandidate=(candidateId:string,expectedVersion:number,idempotencyKey=crypto.randomUUID())=>request<components["schemas"]["CandidateConfirmResponse"]>(`/candidates/${candidateId}/confirm`,{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify({expected_version:expectedVersion})});
export const ignoreCandidate=(candidateId:string,idempotencyKey=crypto.randomUUID())=>request<ApiCandidate>(`/candidates/${candidateId}/ignore`,{method:"POST",headers:{"Idempotency-Key":idempotencyKey}});
