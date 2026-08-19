from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from .config import load_settings
from .database import create_schema, get_session
from .dependencies import get_current_user
from .models import Project, User
from .permissions import can_read_project, readable_project_ids
from .schemas import LoginRequest, ProjectRead, TaskRead, TokenResponse, UserRead
from .security import create_access_token, verify_password
from .seed import seed_demo_data
from .services import project_reads, task_reads


settings = load_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_schema()
    if settings.seed_demo_data:
        seed_demo_data()
    yield


app = FastAPI(title="Quanyi AI Task OS API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = session.exec(select(User).where(User.email == payload.email.lower())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token, expires_in = create_access_token(user.id)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserRead(id=user.id, email=user.email, name=user.name, role=user.role))


@app.get("/api/auth/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead(id=user.id, email=user.email, name=user.name, role=user.role)


@app.get("/api/projects", response_model=list[ProjectRead])
def list_projects(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[ProjectRead]:
    return project_reads(session, readable_project_ids(session, user))


@app.get("/api/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> ProjectRead:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_read_project(session, user, project):
        raise HTTPException(status_code=403, detail="Project access denied")
    return project_reads(session, [project_id])[0]


@app.get("/api/tasks", response_model=list[TaskRead])
def list_tasks(project_id: str | None = None, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[TaskRead]:
    allowed = readable_project_ids(session, user)
    if project_id:
        if project_id not in allowed:
            raise HTTPException(status_code=403, detail="Project access denied")
        allowed = [project_id]
    return task_reads(session, allowed)

