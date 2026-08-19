import { createContext, type FormEvent, type ReactNode, useContext, useEffect, useState } from "react";
import { Bot, LogIn, ShieldCheck } from "lucide-react";
import { ApiError, type ApiUser, fetchMe, login, tokenStore } from "./api";
import "./auth.css";

type AuthContextValue={user:ApiUser;logout:()=>void};
const AuthContext=createContext<AuthContextValue|null>(null);
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error("AuthContext is missing");return value;}

function LoginPage({onLogin}:{onLogin:(user:ApiUser)=>void}){
  const[email,setEmail]=useState("member@quanyi.local");const[password,setPassword]=useState("mvp-member-2026");const[error,setError]=useState("");const[submitting,setSubmitting]=useState(false);
  const submit=async(event:FormEvent)=>{event.preventDefault();setSubmitting(true);setError("");try{const result=await login(email.trim(),password);tokenStore.set(result.access_token);onLogin(result.user);}catch(reason){setError(reason instanceof ApiError?reason.message:"无法连接服务，请确认后端已启动");}finally{setSubmitting(false);}};
  return <main className="login-screen"><section className="login-card"><header><span><Bot size={22}/></span><div><strong>全意 AI Task OS</strong><small>MVP 可信协作入口</small></div></header><div className="login-intro"><h1>进入你的工作中枢</h1><p>身份、项目范围与任务操作均由服务端权限决定。</p></div><form onSubmit={submit}><label><span>账号</span><input autoFocus type="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><label><span>密码</span><input type="password" value={password} onChange={event=>setPassword(event.target.value)}/></label>{error&&<p className="login-error">{error}</p>}<button disabled={submitting||!email||!password}>{submitting?"正在登录…":<><LogIn size={16}/> 登录</>}</button></form><footer><ShieldCheck size={15}/> MVP 阶段使用本地账号；关键操作仍由服务端校验。</footer></section></main>;
}

export function AuthProvider({children}:{children:ReactNode}){
  const[user,setUser]=useState<ApiUser|null>(null);const[checking,setChecking]=useState(Boolean(tokenStore.get()));
  useEffect(()=>{if(!tokenStore.get())return;fetchMe().then(setUser).catch(()=>tokenStore.clear()).finally(()=>setChecking(false));},[]);
  if(checking)return <main className="login-screen"><div className="auth-loading">正在验证登录状态…</div></main>;
  if(!user)return <LoginPage onLogin={setUser}/>;
  return <AuthContext.Provider value={{user,logout:()=>{tokenStore.clear();setUser(null);}}}>{children}</AuthContext.Provider>;
}

