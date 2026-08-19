from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Column, String, Text
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TeamRole(StrEnum):
    CEO = "CEO"
    MEMBER = "MEMBER"


class ProjectRole(StrEnum):
    OWNER = "OWNER"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


class StageStatus(StrEnum):
    PLANNED = "PLANNED"
    ACTIVE = "ACTIVE"
    WAITING_REVIEW = "WAITING_REVIEW"
    DONE = "DONE"


class TaskStatus(StrEnum):
    PENDING_OWNER_CONFIRMATION = "PENDING_OWNER_CONFIRMATION"
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_EXTERNAL = "WAITING_EXTERNAL"
    BLOCKED = "BLOCKED"
    WAITING_HUMAN_CONFIRMATION = "WAITING_HUMAN_CONFIRMATION"
    WAITING_REVIEW = "WAITING_REVIEW"
    DONE = "DONE"
    CANCELED = "CANCELED"


class ExecutionMode(StrEnum):
    HUMAN = "HUMAN"
    AI = "AI"
    HYBRID = "HYBRID"


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(sa_column=Column(String(255), unique=True, index=True, nullable=False))
    password_hash: str
    name: str
    role: TeamRole = Field(sa_column=Column(String(32), nullable=False))
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class Team(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=utc_now)


class TeamMember(SQLModel, table=True):
    team_id: str = Field(foreign_key="team.id", primary_key=True)
    user_id: str = Field(foreign_key="user.id", primary_key=True)
    role: TeamRole = Field(sa_column=Column(String(32), nullable=False))


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    team_id: str = Field(foreign_key="team.id", index=True)
    name: str
    client: str = "内部"
    objective: str = Field(default="", sa_column=Column(Text, nullable=False))
    owner_id: str = Field(foreign_key="user.id", index=True)
    next_milestone: str = ""
    due_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ProjectMember(SQLModel, table=True):
    project_id: str = Field(foreign_key="project.id", primary_key=True)
    user_id: str = Field(foreign_key="user.id", primary_key=True)
    role: ProjectRole = Field(sa_column=Column(String(32), nullable=False))


class Stage(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    name: str
    position: int
    status: StageStatus = Field(sa_column=Column(String(32), nullable=False))
    owner_id: str = Field(foreign_key="user.id")
    weight: float = 1.0


class Task(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    stage_id: str | None = Field(default=None, foreign_key="stage.id", index=True)
    title: str
    description: str = Field(default="", sa_column=Column(Text, nullable=False))
    deliverable: str = ""
    acceptance: str = Field(default="", sa_column=Column(Text, nullable=False))
    owner_id: str = Field(foreign_key="user.id", index=True)
    reviewer_id: str = Field(foreign_key="user.id", index=True)
    status: TaskStatus = Field(sa_column=Column(String(48), nullable=False, index=True))
    execution_mode: ExecutionMode = Field(sa_column=Column(String(16), nullable=False))
    priority: str = "MEDIUM"
    progress: int = 0
    due_at: datetime | None = None
    source: str = "手动创建"
    version: int = 1
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

