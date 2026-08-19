from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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


TaskAction = Literal["ACCEPT", "START", "SUBMIT", "APPROVE", "RETURN", "WAIT_EXTERNAL", "RESUME_EXTERNAL", "CANCEL"]


class TaskActionRequest(BaseModel):
    expected_version: int
    summary: str = ""
    external_url: str | None = None
    asset_reference: str | None = None
    reason: str = ""
    contact_id: str | None = None
    item: str | None = None
    expected_at: datetime | None = None
    internal_followup_user_id: str | None = None
    recovery_action: str | None = None


class TaskActionResponse(BaseModel):
    task: TaskRead
    idempotent_replay: bool = False


class SubmissionRead(BaseModel):
    id: str
    task_id: str
    version: int
    submitted_by: str
    submitter_name: str
    summary: str
    external_url: str | None
    asset_reference: str | None
    created_at: datetime


class StatusHistoryRead(BaseModel):
    id: str
    task_id: str
    from_status: str
    to_status: str
    actor_id: str
    actor_name: str
    action: str
    reason: str
    created_at: datetime


class ExternalDependencyRead(BaseModel):
    id: str
    task_id: str
    contact_id: str
    contact_name: str
    item: str
    expected_at: datetime
    internal_followup_user_id: str
    internal_followup_user_name: str
    recovery_action: str
    last_followup_at: datetime | None
    external_feedback_status: str
    actual_received_at: datetime | None
    reminder_sent: bool
    reminder_level: Literal["NORMAL", "UPCOMING", "OVERDUE", "RECEIVED"]


class ExternalReminderRead(BaseModel):
    id: str
    task_id: str
    reminder_type: str
    created_at: datetime


class ExternalContactRead(BaseModel):
    id: str
    name: str
    organization: str
    channel: str


class CandidateExtractionRequest(BaseModel):
    project_id: str
    source_type: Literal["MEETING", "CHAT", "DOCUMENT", "AI_CHAT"]
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=4, max_length=100_000)


class CandidateRead(BaseModel):
    id: str
    source_snapshot_id: str
    project_id: str
    title: str
    description: str
    deliverable: str
    owner_id: str | None
    reviewer_id: str | None
    due_at: datetime | None
    confidence: int
    evidence: str
    status: str
    created_task_id: str | None
    version: int


class CandidateExtractionResponse(BaseModel):
    snapshot_id: str
    candidates: list[CandidateRead]
    execution_mode: Literal["LIVE", "MOCK", "FALLBACK"]
    degraded: bool
    fallback_reason: str | None
    cached: bool
    call_id: str


class CandidateUpdateRequest(BaseModel):
    expected_version: int
    title: str | None = None
    description: str | None = None
    deliverable: str | None = None
    owner_id: str | None = None
    reviewer_id: str | None = None
    due_at: datetime | None = None


class CandidateConfirmRequest(BaseModel):
    expected_version: int


class CandidateConfirmResponse(BaseModel):
    candidate: CandidateRead
    task: TaskRead
    idempotent_replay: bool = False
