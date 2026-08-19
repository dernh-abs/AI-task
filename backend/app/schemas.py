from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from .models import ExecutionMode, StageStatus, TaskStatus, TeamRole


class LoginRequest(BaseModel):
    email: str
    password: str


class UserRead(BaseModel):
    id: str
    email: str
    name: str
    role: TeamRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class StageRead(BaseModel):
    id: str
    name: str
    position: int
    status: StageStatus
    progress: int


class ProjectRead(BaseModel):
    id: str
    name: str
    client: str
    objective: str
    owner_id: str
    owner_name: str
    next_milestone: str
    due_at: datetime | None
    progress: int
    health: Literal["正常", "有风险", "需关注"]
    current_stage: str
    stages: list[StageRead]


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    project_name: str
    stage_id: str | None
    title: str
    description: str
    deliverable: str
    acceptance: str
    owner_id: str
    owner_name: str
    reviewer_id: str
    reviewer_name: str
    status: TaskStatus
    execution_mode: ExecutionMode
    priority: str
    progress: int
    due_at: datetime | None
    source: str
    version: int
