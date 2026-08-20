from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from sqlalchemy import Column, String, Text, UniqueConstraint
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


class ExternalFeedbackStatus(StrEnum):
    WAITING = "WAITING"
    RECEIVED = "RECEIVED"


class AiExecutionMode(StrEnum):
    LIVE = "LIVE"
    MOCK = "MOCK"
    FALLBACK = "FALLBACK"


class CandidateStatus(StrEnum):
    ACTIVE = "ACTIVE"
    STASHED = "STASHED"
    IGNORED = "IGNORED"
    CREATED = "CREATED"
    LINKED = "LINKED"


class AgentRunStatus(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    NEEDS_INPUT = "NEEDS_INPUT"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    email: str = Field(sa_column=Column(String(255), unique=True, index=True, nullable=False))
    password_hash: str
    name: str
    role: TeamRole = Field(sa_column=Column(String(32), nullable=False))
    is_active: bool = True
    token_version: int = 0
    created_at: datetime = Field(default_factory=utc_now)


class Team(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=utc_now)


class TeamMember(SQLModel, table=True):
    team_id: str = Field(foreign_key="team.id", primary_key=True)
    user_id: str = Field(foreign_key="user.id", primary_key=True)
    role: TeamRole = Field(sa_column=Column(String(32), nullable=False))


class Invitation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    team_id: str = Field(foreign_key="team.id", index=True)
    email: str = Field(sa_column=Column(String(255), index=True, nullable=False))
    role: TeamRole = Field(sa_column=Column(String(32), nullable=False))
    project_id: str | None = Field(default=None, foreign_key="project.id", index=True)
    project_role: ProjectRole | None = Field(default=None, sa_column=Column(String(32), nullable=True))
    token_hash: str = Field(sa_column=Column(String(64), unique=True, index=True, nullable=False))
    invited_by: str = Field(foreign_key="user.id", index=True)
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)


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


class TaskSubmission(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("task_id", "version", name="uq_task_submission_version"),)

    id: str = Field(primary_key=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    version: int
    submitted_by: str = Field(foreign_key="user.id")
    summary: str = Field(default="", sa_column=Column(Text, nullable=False))
    external_url: str | None = None
    asset_reference: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class TaskStatusHistory(SQLModel, table=True):
    id: str = Field(primary_key=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    from_status: str
    to_status: str
    actor_id: str = Field(foreign_key="user.id")
    action: str
    reason: str = Field(default="", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utc_now)


class AuditEvent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    actor_id: str = Field(foreign_key="user.id", index=True)
    resource_type: str
    resource_id: str = Field(index=True)
    action: str
    detail_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utc_now)


class IdempotencyRecord(SQLModel, table=True):
    key: str = Field(primary_key=True)
    actor_id: str = Field(foreign_key="user.id")
    resource_id: str
    action: str
    created_at: datetime = Field(default_factory=utc_now)


class ExternalContact(SQLModel, table=True):
    id: str = Field(primary_key=True)
    team_id: str = Field(foreign_key="team.id", index=True)
    name: str
    organization: str = ""
    channel: str = ""
    created_at: datetime = Field(default_factory=utc_now)


class ExternalDependency(SQLModel, table=True):
    id: str = Field(primary_key=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    contact_id: str = Field(foreign_key="externalcontact.id")
    item: str = Field(sa_column=Column(Text, nullable=False))
    expected_at: datetime
    internal_followup_user_id: str = Field(foreign_key="user.id", index=True)
    recovery_action: str = Field(sa_column=Column(Text, nullable=False))
    last_followup_at: datetime | None = None
    external_feedback_status: ExternalFeedbackStatus = Field(default=ExternalFeedbackStatus.WAITING, sa_column=Column(String(24), nullable=False))
    actual_received_at: datetime | None = None
    reminder_sent: bool = False
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ExternalReminderEvent(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("dependency_id", "reminder_type", "reminder_date", name="uq_external_reminder_bucket"),)

    id: str = Field(primary_key=True)
    dependency_id: str = Field(foreign_key="externaldependency.id", index=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    recipient_user_id: str = Field(foreign_key="user.id", index=True)
    reminder_type: str
    reminder_date: str
    created_at: datetime = Field(default_factory=utc_now)


class SourceSnapshot(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    source_type: str
    title: str
    content: str = Field(sa_column=Column(Text, nullable=False))
    content_hash: str = Field(index=True)
    created_by: str = Field(foreign_key="user.id")
    extraction_version: str
    created_at: datetime = Field(default_factory=utc_now)


class CandidateTask(SQLModel, table=True):
    id: str = Field(primary_key=True)
    source_snapshot_id: str = Field(foreign_key="sourcesnapshot.id", index=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    title: str
    description: str = Field(default="", sa_column=Column(Text, nullable=False))
    deliverable: str
    owner_id: str | None = Field(default=None, foreign_key="user.id")
    reviewer_id: str | None = Field(default=None, foreign_key="user.id")
    due_at: datetime | None = None
    confidence: int
    evidence: str = Field(default="", sa_column=Column(Text, nullable=False))
    status: CandidateStatus = Field(default=CandidateStatus.ACTIVE, sa_column=Column(String(20), nullable=False, index=True))
    confirmed_by: str | None = Field(default=None, foreign_key="user.id")
    confirmed_at: datetime | None = None
    created_task_id: str | None = Field(default=None, foreign_key="task.id", unique=True)
    version: int = 1
    created_at: datetime = Field(default_factory=utc_now)


class AiCallLog(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    capability: str
    prompt_version: str
    model: str
    execution_mode: AiExecutionMode = Field(sa_column=Column(String(16), nullable=False))
    degraded: bool = False
    fallback_reason: str | None = None
    input_hash: str = Field(index=True)
    latency_ms: int
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0
    success: bool
    created_at: datetime = Field(default_factory=utc_now)


class AiResponseCache(SQLModel, table=True):
    cache_key: str = Field(primary_key=True)
    response_json: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utc_now)


class AgentRun(SQLModel, table=True):
    id: str = Field(primary_key=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    requested_by: str = Field(foreign_key="user.id")
    request_fingerprint: str = Field(unique=True, index=True)
    status: AgentRunStatus = Field(sa_column=Column(String(24), nullable=False, index=True))
    execution_mode: AiExecutionMode | None = Field(default=None, sa_column=Column(String(16), nullable=True))
    degraded: bool = False
    fallback_reason: str | None = None
    prompt_version: str
    attempt_count: int = 0
    max_attempts: int = 2
    output_text: str = Field(default="", sa_column=Column(Text, nullable=False))
    error_message: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    started_at: datetime | None = None
    heartbeat_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)


class AgentRunLog(SQLModel, table=True):
    id: str = Field(primary_key=True)
    agent_run_id: str = Field(foreign_key="agentrun.id", index=True)
    level: str
    message: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utc_now)


class ProjectConversation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    title: str
    created_by: str = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, index=True)


class ProjectChatMessage(SQLModel, table=True):
    id: str = Field(primary_key=True)
    conversation_id: str = Field(foreign_key="projectconversation.id", index=True)
    author_id: str | None = Field(default=None, foreign_key="user.id", index=True)
    role: str = Field(sa_column=Column(String(16), nullable=False, index=True))
    content: str = Field(sa_column=Column(Text, nullable=False))
    execution_mode: AiExecutionMode | None = Field(default=None, sa_column=Column(String(16), nullable=True))
    prompt_version: str | None = None
    ai_call_id: str | None = Field(default=None, index=True)
    request_key: str | None = Field(default=None, unique=True, index=True)
    reply_to_message_id: str | None = Field(default=None, foreign_key="projectchatmessage.id")
    context_task_ids_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, index=True)


class ContributionEvent(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("task_id", "event_type", "submission_version", name="uq_contribution_task_event_version"),)

    id: str = Field(primary_key=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    event_type: str
    submission_version: int
    points: int
    created_at: datetime = Field(default_factory=utc_now)
