import { createContext, type FormEvent, type ReactNode, useContext, useEffect, useState } from "react";
import { Bot, CheckCircle2, KeyRound, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  acceptInvitation,
  ApiError,
  changePassword as changePasswordRequest,
  type ApiInvitation,
  type ApiUser,
  fetchMe,
  inspectInvitation,
  login,
  tokenStore,
} from "./api";
import "./auth.css";
import "./auth-application.css";

type AuthContextValue = {
  user: ApiUser;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthContext is missing");
  return value;
}

function BrandHeader() {
  return (
    <header>
      <span><Bot size={22} /></span>
      <div><strong>全意 AI Task OS</strong><small>可信团队协作入口</small></div>
    </header>
  );
}

function RememberLogin({checked,onChange}:{checked:boolean;onChange:(checked:boolean)=>void}) {
  return (
    <label className="auth-remember">
      <input type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)} />
      <span><strong>在此设备保持登录</strong><small>不勾选时，关闭浏览器后需要重新登录。</small></span>
    </label>
  );
}

function LoginPage({onLogin}:{onLogin:(user:ApiUser)=>void}) {
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [remember,setRemember] = useState(false);
  const [error,setError] = useState("");
  const [submitting,setSubmitting] = useState(false);

  const submit = async (event:FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await login(email.trim(),password);
      tokenStore.set(result.access_token,remember);
      onLogin(result.user);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "无法连接服务，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-card">
        <BrandHeader />
        <div className="login-intro">
          <h1>进入你的工作中枢</h1>
          <p>使用团队账号登录。身份、项目范围与任务操作均由服务端权限决定。</p>
        </div>
        <form onSubmit={submit}>
          <label><span>企业邮箱</span><input autoFocus type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="name@company.com" /></label>
          <label><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="输入登录密码" /></label>
          <RememberLogin checked={remember} onChange={setRemember} />
          {error && <p className="login-error">{error}</p>}
          <button disabled={submitting||!email.trim()||!password}>{submitting ? "正在登录…" : <><LogIn size={16} /> 登录</>}</button>
        </form>
        <div className="login-help"><KeyRound size={15} /><span>首次使用请打开团队管理员发送的一次性邀请链接激活账号。</span></div>
        <footer><ShieldCheck size={15} /> 系统不开放公开注册，未获邀请的账号无法进入团队数据。</footer>
      </section>
    </main>
  );
}

function ActivationPage({token,onLogin,currentUser,onLogout}:{token:string;onLogin:(user:ApiUser)=>void;currentUser:ApiUser|null;onLogout:()=>void}) {
  const navigate = useNavigate();
  const [invitation,setInvitation] = useState<ApiInvitation|null>(null);
  const [loading,setLoading] = useState(true);
  const [name,setName] = useState("");
  const [password,setPassword] = useState("");
  const [confirmation,setConfirmation] = useState("");
  const [remember,setRemember] = useState(false);
  const [error,setError] = useState("");
  const [submitting,setSubmitting] = useState(false);

  useEffect(()=>{
    let active = true;
    inspectInvitation(token)
      .then((value)=>{if(active)setInvitation(value);})
      .catch((reason)=>{if(active)setError(reason instanceof ApiError ? reason.message : "邀请链接无法读取");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[token]);

  const submit = async (event:FormEvent) => {
    event.preventDefault();
    setError("");
    if(password!==confirmation){setError("两次输入的密码不一致");return;}
    setSubmitting(true);
    try {
      const result = await acceptInvitation(token,{name:name.trim(),password});
      tokenStore.set(result.access_token,remember);
      onLogin(result.user);
      navigate("/",{replace:true});
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "账号激活失败，请联系邀请人");
    } finally {
      setSubmitting(false);
    }
  };

  const sameAccount = Boolean(currentUser&&invitation&&currentUser.email.toLowerCase()===invitation.email.toLowerCase());

  return (
    <main className="login-screen">
      <section className="login-card activation-card">
        <BrandHeader />
        {loading ? <div className="auth-loading">正在验证邀请链接…</div> : !invitation ? <>
          <div className="login-intro"><h1>邀请无法使用</h1><p>{error||"邀请链接不存在、已过期或已经被使用。"}</p></div>
          <button className="auth-secondary" onClick={()=>navigate("/",{replace:true})}>返回登录</button>
        </> : <>
          <div className="login-intro">
            <span className="activation-badge"><UserPlus size={15} /> 团队邀请</span>
            <h1>{currentUser ? "确认邀请账号" : "激活你的账号"}</h1>
            <p>{invitation.inviter_name} 邀请你加入「{invitation.team_name}」{invitation.project_name ? `，并参与项目「${invitation.project_name}」` : ""}。</p>
          </div>
          <div className="invitation-summary">
            <CheckCircle2 size={17} />
            <span><strong>{invitation.email}</strong><small>角色：{invitation.role==="CEO" ? "团队管理员" : "团队成员"} · 邀请将在 {new Date(invitation.expires_at).toLocaleString("zh-CN")} 失效</small></span>
          </div>
          {currentUser ? <div className="active-session-warning">
            <div>
              <strong>当前已登录</strong>
              <span>{currentUser.name} · {currentUser.email}</span>
              <small>{sameAccount ? "该邮箱已经拥有账号，不能再次通过新账号邀请激活。请返回当前账号，或联系管理员重新处理成员权限。" : `此邀请发送给 ${invitation.email}，不能使用当前账号直接激活。请先退出当前账号，再继续激活受邀账号。`}</small>
            </div>
            <div className="active-session-actions">
              <button className="auth-secondary" onClick={()=>navigate("/",{replace:true})}>返回当前账号</button>
              {!sameAccount && <button className="auth-switch-account" onClick={onLogout}>退出并继续</button>}
            </div>
          </div> : <>
            <form onSubmit={submit}>
              <label><span>显示名称</span><input autoFocus value={name} onChange={(event)=>setName(event.target.value)} placeholder="你的真实姓名" minLength={2} maxLength={80} /></label>
              <label><span>设置密码</span><input type="password" autoComplete="new-password" value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="至少 10 位，同时包含字母和数字" minLength={10} /></label>
              <label><span>确认密码</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} placeholder="再次输入密码" minLength={10} /></label>
              <RememberLogin checked={remember} onChange={setRemember} />
              {error && <p className="login-error">{error}</p>}
              <button disabled={submitting||name.trim().length<2||password.length<10||!confirmation}>{submitting ? "正在激活…" : <><UserPlus size={16} /> 激活并进入团队</>}</button>
            </form>
            <footer><ShieldCheck size={15} /> 邀请只能使用一次；激活后权限仍受团队和项目范围控制。</footer>
          </>}
        </>}
      </section>
    </main>
  );
}

export function AuthProvider({children}:{children:ReactNode}) {
  const location = useLocation();
  const [user,setUser] = useState<ApiUser|null>(null);
  const [checking,setChecking] = useState(Boolean(tokenStore.get()));
  const inviteToken = new URLSearchParams(location.search).get("invite")||"";

  useEffect(()=>{
    if(!tokenStore.get()){setChecking(false);return;}
    fetchMe().then(setUser).catch(()=>tokenStore.clear()).finally(()=>setChecking(false));
  },[]);

  const logout = ()=>{tokenStore.clear();setUser(null);};
  if(checking)return <main className="login-screen"><div className="auth-loading">正在验证登录状态…</div></main>;
  if(inviteToken)return <ActivationPage token={inviteToken} onLogin={setUser} currentUser={user} onLogout={logout} />;
  if(!user)return <LoginPage onLogin={setUser} />;

  const changePassword = async (currentPassword:string,newPassword:string) => {
    const persistent = tokenStore.isPersistent();
    const result = await changePasswordRequest(currentPassword,newPassword);
    tokenStore.set(result.access_token,persistent);
    setUser(result.user);
  };

  return <AuthContext.Provider value={{user,logout,changePassword}}>{children}</AuthContext.Provider>;
}
