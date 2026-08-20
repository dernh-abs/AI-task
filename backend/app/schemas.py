from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import ExecutionMode, ProjectRole, StageStatus, TaskStatus, TeamRole


class ApiModel(BaseModel):
    """Keep API datetimes unambiguous after SQLite drops timezone metadata."""

    @field_validator("*", mode="before", check_fields=False)
    @classmethod
    def attach_utc_to_naive_datetimes(cls, value):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class LoginRequest(ApiModel):
    email: str
    password: str


class UserRead(ApiModel):
    id: str
    email: str
    name: str
    role: TeamRole


class TokenResponse(ApiModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class InvitationCreateRequest(ApiModel):
    email: str = Field(min_length=3, max_length=255)
    role: TeamRole = TeamRole.MEMBER
    project_id: str | None = None
    project_role: ProjectRole | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized:
            raise ValueError("请输入有效邮箱")
        return normalized


class InvitationCreatedRead(ApiModel):
    id: str
    email: str
    team_id: str
    expires_at: datetime
    activation_token: str


class InvitationPublicRead(ApiModel):
    email: str
    team_name: str
    inviter_name: str
    role: TeamRole
    project_name: str | None = None
    expires_at: datetime


class InvitationAcceptRequest(ApiModel):
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=10, max_length=72)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("密码编码后不能超过 72 字节")
        if not any(character.isalpha() for character in value) or not any(character.isdigit() for character in value):
            raise ValueError("密码必须同时包含字母和数字")
        return value


class TeamMemberRead(ApiModel):
    id: str
    email: str
    name: str
    role: TeamRole
    is_active: bool


class TeamRead(ApiModel):
    id: str
    name: str
    role: TeamRole
    members: list[TeamMemberRead]
    project_names: list[str]


class ProjectMemberRead(ApiModel):
    id: str
    email: str
    name: str
    role: ProjectRole
    is_active: bool


class StageRead(ApiModel):
    id: str
    name: str
    position: int
    status: StageStatus
    progress: int
    health: Literal["正常", "有风险", "需关注"] = "正常"


class ProjectRead(ApiModel):
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


class TaskRead(ApiModel):
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


TaskAction = Literal["ACCEPT", "START", "SUBMIT", "APPROVE", "RETURN", "WAIT_EXTERNAL", "RESUME_EXTERNAL", "CONFIRM_AI", "REVISE_AI", "CANCEL"]


class TaskActionRequest(ApiModel):
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
    agent_run_id: str | None = None


class TaskActionResponse(ApiModel):
    task: TaskRead
    idempotent_replay: bool = False


class SubmissionRead(ApiModel):
    id: str
    task_id: str
    version: int
    submitted_by: str
    submitter_name: str
    summary: str
    external_url: str | None
    asset_reference: str | None
    created_at: datetime


class StatusHistoryRead(ApiModel):
    id: str
    task_id: str
    from_status: str
    to_status: str
    actor_id: str
    actor_name: str
    action: str
    reason: str
    created_at: datetime


class ExternalDependencyRead(ApiModel):
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


class ExternalReminderRead(ApiModel):
    id: str
    task_id: str
    reminder_type: str
    created_at: datetime


class ExternalContactRead(ApiModel):
    id: str
    name: str
    organization: str
    channel: str


class CandidateExtractionRequest(ApiModel):
    project_id: str
    source_type: Literal["MEETING", "CHAT", "DOCUMENT", "AI_CHAT"]
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=4, max_length=100_000)


class CandidateRead(ApiModel):
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


class CandidateExtractionResponse(ApiModel):
    snapshot_id: str
    candidates: list[CandidateRead]
    execution_mode: Literal["LIVE", "MOCK", "FALLBACK"]
    degraded: bool
    fallback_reason: str | None
    cached: bool
    call_id: str


class CandidateUpdateRequest(ApiModel):
    expected_version: int
    title: str | None = None
    description: str | None = None
    deliverable: str | None = None
    owner_id: str | None = None
    reviewer_id: str | None = None
    due_at: datetime | None = None


class CandidateConfirmRequest(ApiModel):
    expected_version: int


class CandidateConfirmResponse(ApiModel):
    candidate: CandidateRead
    task: TaskRead
    idempotent_replay: bool = False


class AgentRunRead(ApiModel):
    id: str
    task_id: str
    status: str
    execution_mode: str | None
    degraded: bool
    fallback_reason: str | None
    prompt_version: str
    attempt_count: int
    max_attempts: int
    output_text: str
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class AgentRunStartRequest(ApiModel):
    revision_instruction: str = Field(default="", max_length=2000)


class AgentRunStartResponse(ApiModel):
    run: AgentRunRead
    idempotent_replay: bool


class ProjectCreateRequest(ApiModel):
    team_id: str | None = None
    name: str = Field(min_length=1, max_length=200)
    client: str = "内部"
    objective: str = ""
    next_milestone: str = ""
    due_at: datetime | None = None


class ProjectUpdateRequest(ApiModel):
    name: str | None = None
    client: str | None = None
    objective: str | None = None
    next_milestone: str | None = None
    due_at: datetime | None = None


class StageCreateRequest(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    owner_id: str
    weight: float = Field(default=1.0, gt=0, le=100)


class StageUpdateRequest(ApiModel):
    name: str | None = None
    owner_id: str | None = None
    weight: float | None = Field(default=None, gt=0, le=100)
    status: StageStatus | None = None


class TaskCreateRequest(ApiModel):
    project_id: str
    stage_id: str | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    deliverable: str = Field(min_length=1)
    acceptance: str = Field(min_length=1)
    owner_id: str
    reviewer_id: str
    execution_mode: ExecutionMode = ExecutionMode.HUMAN
    priority: str = "MEDIUM"
    due_at: datetime | None = None


class ContributionRead(ApiModel):
    id: str
    task_id: str
    user_id: str
    user_name: str
    event_type: str
    submission_version: int
    points: int
    created_at: datetime
