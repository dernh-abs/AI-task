from __future__ import annotations

import asyncio
import hashlib
import json
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from sqlmodel import Session, select

from .config import load_settings
from .agent_runs import recover_stale_runs, start_agent_run
from .accounts import accept_invitation, change_user_password, create_team_invitation, invitation_public_read, list_team_invitations, readable_teams, revoke_team_invitation
from .candidates import candidate_read, confirm_candidate
from .database import create_schema, engine, get_session
from .dependencies import get_current_user
from .external_reminders import reminder_level, scan_external_reminders
from .model_gateway import GatewayOutputError, extract_candidates, generate_project_chat_reply
from .models import AgentRun, AgentRunStatus, CandidateStatus, CandidateTask, ContributionEvent, ExternalContact, ExternalDependency, ExternalFeedbackStatus, ExternalReminderEvent, IdempotencyRecord, Project, ProjectChatMessage, ProjectConversation, ProjectMember, ProjectRole, SourceSnapshot, Stage, StageStatus, Task, TaskStatus, TaskStatusHistory, TaskSubmission, TeamMember, TeamRole, User, utc_now
from .permissions import can_manage_project, can_read_project, is_team_admin, readable_project_ids
from .schemas import AgentRunRead, AgentRunStartRequest, AgentRunStartResponse, CandidateConfirmRequest, CandidateConfirmResponse, CandidateExtractionRequest, CandidateExtractionResponse, CandidateRead, CandidateUpdateRequest, ChangePasswordRequest, ContributionRead, ExternalContactRead, ExternalDependencyRead, ExternalReminderRead, InvitationAcceptRequest, InvitationAdminRead, InvitationCreateRequest, InvitationCreatedRead, InvitationPublicRead, LoginRequest, ProjectChatMessageRead, ProjectChatSendRequest, ProjectChatSendResponse, ProjectConversationCreateRequest, ProjectConversationRead, ProjectCreateRequest, ProjectMemberRead, ProjectRead, ProjectUpdateRequest, StageCreateRequest, StageUpdateRequest, StatusHistoryRead, SubmissionRead, TaskAction, TaskActionRequest, TaskActionResponse, TaskCreateRequest, TaskRead, TeamRead, TokenResponse, UserRead
from .security import create_access_token, verify_password
from .seed import seed_demo_data
from .services import project_reads, task_reads
from .state_machine import DomainError, apply_task_action


settings = load_settings()


async def _external_reminder_worker() -> None:
    while True:
        with Session(engine) as session:
            scan_external_reminders(session)
        await asyncio.sleep(300)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_schema:
        create_schema()
    if settings.seed_demo_data:
        seed_demo_data()
    with Session(engine) as recovery_session:
        recover_stale_runs(recovery_session)
    reminder_task = asyncio.create_task(_external_reminder_worker())
    try:
        yield
    finally:
        reminder_task.cancel()
        with suppress(asyncio.CancelledError):
            await reminder_task


app = FastAPI(title="Quanyi AI Task OS API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health() -> dict[str, str]:
    with Session(engine) as session:
        session.exec(text("SELECT 1"))
    return {"status": "ok", "database": engine.dialect.name}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token, expires_in = create_access_token(user.id, user.token_version)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserRead(id=user.id, email=user.email, name=user.name, role=user.role))


@app.get("/api/auth/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead(id=user.id, email=user.email, name=user.name, role=user.role)


@app.post("/api/auth/change-password", response_model=TokenResponse)
def change_password(payload: ChangePasswordRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> TokenResponse:
    return change_user_password(session, user, payload)


@app.get("/api/teams", response_model=list[TeamRead])
def list_teams(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[TeamRead]:
    return readable_teams(session, user)


@app.post("/api/teams/{team_id}/invitations", response_model=InvitationCreatedRead)
def invite_team_member(team_id: str, payload: InvitationCreateRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> InvitationCreatedRead:
    invitation, token = create_team_invitation(session, team_id, payload, user)
    return InvitationCreatedRead(id=invitation.id, email=invitation.email, team_id=invitation.team_id, expires_at=invitation.expires_at, activation_token=token)


@app.get("/api/teams/{team_id}/invitations", response_model=list[InvitationAdminRead])
def team_invitations(team_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[InvitationAdminRead]:
    return list_team_invitations(session, team_id, user)


@app.post("/api/teams/{team_id}/invitations/{invitation_id}/revoke", response_model=InvitationAdminRead)
def revoke_invitation(team_id: str, invitation_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> InvitationAdminRead:
    return revoke_team_invitation(session, team_id, invitation_id, user)


@app.get("/api/invitations/{token}", response_model=InvitationPublicRead)
def inspect_invitation(token: str, session: Session = Depends(get_session)) -> InvitationPublicRead:
    return invitation_public_read(session, token)


@app.post("/api/invitations/{token}/accept", response_model=TokenResponse)
def activate_invitation(token: str, payload: InvitationAcceptRequest, session: Session = Depends(get_session)) -> TokenResponse:
    return accept_invitation(session, token, payload)


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


@app.get("/api/projects/{project_id}/members", response_model=list[ProjectMemberRead])
def list_project_members(project_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[ProjectMemberRead]:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_read_project(session, user, project):
        raise HTTPException(status_code=403, detail="Project access denied")
    memberships = session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
    rows: list[ProjectMemberRead] = []
    for membership in memberships:
        member = session.get(User, membership.user_id)
        if member and member.is_active:
            rows.append(ProjectMemberRead(id=member.id, email=member.email, name=member.name, role=ProjectRole(membership.role), is_active=member.is_active))
    return rows


def _conversation_for_user(conversation_id: str, user: User, session: Session) -> ProjectConversation:
    conversation = session.get(ProjectConversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Project conversation not found")
    project = session.get(Project, conversation.project_id)
    if not project or not can_read_project(session, user, project):
        raise HTTPException(status_code=403, detail="Project conversation access denied")
    return conversation


def _conversation_read(session: Session, conversation: ProjectConversation) -> ProjectConversationRead:
    creator = session.get(User, conversation.created_by)
    message_count = len(session.exec(select(ProjectChatMessage).where(ProjectChatMessage.conversation_id == conversation.id)).all())
    return ProjectConversationRead(id=conversation.id, project_id=conversation.project_id, title=conversation.title, created_by=conversation.created_by, created_by_name=creator.name if creator else "未知成员", created_at=conversation.created_at, updated_at=conversation.updated_at, message_count=message_count)


def _chat_message_read(session: Session, message: ProjectChatMessage) -> ProjectChatMessageRead:
    author = session.get(User, message.author_id) if message.author_id else None
    try:
        task_ids = [str(item) for item in json.loads(message.context_task_ids_json)]
    except (json.JSONDecodeError, TypeError):
        task_ids = []
    task_titles = []
    for task_id in task_ids:
        task = session.get(Task, task_id)
        if task:
            task_titles.append(task.title)
    return ProjectChatMessageRead(id=message.id, conversation_id=message.conversation_id, author_id=message.author_id, author_name=author.name if author else "项目 AI", role=message.role, content=message.content, execution_mode=str(message.execution_mode) if message.execution_mode else None, prompt_version=message.prompt_version, context_task_ids=task_ids, context_task_titles=task_titles, created_at=message.created_at)


@app.get("/api/projects/{project_id}/conversations", response_model=list[ProjectConversationRead])
def list_project_conversations(project_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[ProjectConversationRead]:
    project = session.get(Project, project_id)
    if not project or not can_read_project(session, user, project):
        raise HTTPException(status_code=403, detail="Project access denied")
    rows = session.exec(select(ProjectConversation).where(ProjectConversation.project_id == project_id).order_by(ProjectConversation.updated_at.desc())).all()
    return [_conversation_read(session, row) for row in rows]


@app.post("/api/projects/{project_id}/conversations", response_model=ProjectConversationRead)
def create_project_conversation(project_id: str, payload: ProjectConversationCreateRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> ProjectConversationRead:
    project = session.get(Project, project_id)
    if not project or not can_read_project(session, user, project):
        raise HTTPException(status_code=403, detail="Project access denied")
    conversation = ProjectConversation(id=f"conversation-{uuid4().hex}", project_id=project.id, title=payload.title.strip(), created_by=user.id)
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return _conversation_read(session, conversation)


@app.get("/api/project-conversations/{conversation_id}/messages", response_model=list[ProjectChatMessageRead])
def list_project_chat_messages(conversation_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[ProjectChatMessageRead]:
    _conversation_for_user(conversation_id, user, session)
    rows = session.exec(select(ProjectChatMessage).where(ProjectChatMessage.conversation_id == conversation_id).order_by(ProjectChatMessage.created_at.asc())).all()
    return [_chat_message_read(session, row) for row in rows]


@app.post("/api/project-conversations/{conversation_id}/messages", response_model=ProjectChatSendResponse)
def send_project_chat_message(
    conversation_id: str,
    payload: ProjectChatSendRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProjectChatSendResponse:
    conversation = _conversation_for_user(conversation_id, user, session)
    existing_reply = session.exec(select(ProjectChatMessage).where(ProjectChatMessage.request_key == idempotency_key)).first()
    if existing_reply:
        if existing_reply.conversation_id != conversation.id or not existing_reply.reply_to_message_id:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": "Idempotency key was already used"})
        original = session.get(ProjectChatMessage, existing_reply.reply_to_message_id)
        if not original:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_INCOMPLETE", "message": "Previous message is incomplete"})
        return ProjectChatSendResponse(user_message=_chat_message_read(session, original), assistant_message=_chat_message_read(session, existing_reply))

    user_message = ProjectChatMessage(id=f"message-{uuid4().hex}", conversation_id=conversation.id, author_id=user.id, role="USER", content=payload.content)
    session.add(user_message)
    session.flush()
    tasks = session.exec(select(Task).where(Task.project_id == conversation.project_id).order_by(Task.updated_at.desc())).all()
    context_rows = [f"- {task.title}｜状态：{TaskStatus(task.status).value}｜负责人ID：{task.owner_id}｜下一交付：{task.deliverable or '未填写'}" for task in tasks[:30]]
    result = generate_project_chat_reply(session, conversation.project_id, payload.content, "\n".join(context_rows))
    context_task_ids = [task.id for task in tasks[:30]]
    assistant_message = ProjectChatMessage(id=f"message-{uuid4().hex}", conversation_id=conversation.id, author_id=None, role="ASSISTANT", content=result.text, execution_mode=result.execution_mode, prompt_version="project-chat-v1", ai_call_id=result.call_id, request_key=idempotency_key, reply_to_message_id=user_message.id, context_task_ids_json=json.dumps(context_task_ids))
    session.add(assistant_message)
    if conversation.title == "新对话":
        conversation.title = payload.content[:40]
    conversation.updated_at = utc_now()
    session.add(conversation)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        replay = session.exec(select(ProjectChatMessage).where(ProjectChatMessage.request_key == idempotency_key)).first()
        if replay and replay.reply_to_message_id:
            original = session.get(ProjectChatMessage, replay.reply_to_message_id)
            if original:
                return ProjectChatSendResponse(user_message=_chat_message_read(session, original), assistant_message=_chat_message_read(session, replay))
        raise HTTPException(status_code=409, detail={"code": "CONCURRENT_WRITE", "message": "Message was already sent"}) from exc
    session.refresh(user_message)
    session.refresh(assistant_message)
    return ProjectChatSendResponse(user_message=_chat_message_read(session, user_message), assistant_message=_chat_message_read(session, assistant_message))


@app.get("/api/tasks", response_model=list[TaskRead])
def list_tasks(project_id: str | None = None, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[TaskRead]:
    allowed = readable_project_ids(session, user)
    if project_id:
        if project_id not in allowed:
            raise HTTPException(status_code=403, detail="Project access denied")
        allowed = [project_id]
    return task_reads(session, allowed)


@app.post("/api/projects", response_model=ProjectRead)
def create_project(payload: ProjectCreateRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> ProjectRead:
    admin_memberships = session.exec(select(TeamMember).where(TeamMember.user_id == user.id, TeamMember.role == TeamRole.CEO)).all()
    membership = next((item for item in admin_memberships if item.team_id == payload.team_id), None) if payload.team_id else (admin_memberships[0] if len(admin_memberships) == 1 else None)
    if not membership:
        if len(admin_memberships) > 1 and not payload.team_id:
            raise HTTPException(status_code=422, detail="team_id is required when administering multiple teams")
        raise HTTPException(status_code=403, detail="Only a team administrator can create projects")
    project = Project(id=f"project-{uuid4().hex}", team_id=membership.team_id, name=payload.name, client=payload.client, objective=payload.objective, owner_id=user.id, next_milestone=payload.next_milestone, due_at=payload.due_at)
    session.add(project)
    session.add(ProjectMember(project_id=project.id, user_id=user.id, role=ProjectRole.OWNER))
    session.commit()
    return project_reads(session, [project.id])[0]


@app.patch("/api/projects/{project_id}", response_model=ProjectRead)
def update_project(project_id: str, payload: ProjectUpdateRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> ProjectRead:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_manage_project(session, user, project):
        raise HTTPException(status_code=403, detail="Project edit denied")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    session.add(project)
    session.commit()
    return project_reads(session, [project.id])[0]


@app.post("/api/projects/{project_id}/stages", response_model=ProjectRead)
def create_stage(project_id: str, payload: StageCreateRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> ProjectRead:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_manage_project(session, user, project):
        raise HTTPException(status_code=403, detail="Stage edit denied")
    if project.owner_id != payload.owner_id and not session.get(ProjectMember, (project.id, payload.owner_id)):
        raise HTTPException(status_code=422, detail="Stage owner must be a project member")
    position = len(session.exec(select(Stage).where(Stage.project_id == project.id)).all()) + 1
    session.add(Stage(id=f"stage-{uuid4().hex}", project_id=project.id, name=payload.name, position=position, status=StageStatus.PLANNED, owner_id=payload.owner_id, weight=payload.weight))
    session.commit()
    return project_reads(session, [project.id])[0]


@app.patch("/api/stages/{stage_id}", response_model=ProjectRead)
def update_stage(stage_id: str, payload: StageUpdateRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> ProjectRead:
    stage = session.get(Stage, stage_id)
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    project = session.get(Project, stage.project_id)
    if not project or (not can_manage_project(session, user, project) and stage.owner_id != user.id):
        raise HTTPException(status_code=403, detail="Stage edit denied")
    if payload.status is not None:
        allowed = {StageStatus.PLANNED: {StageStatus.ACTIVE}, StageStatus.ACTIVE: {StageStatus.WAITING_REVIEW}, StageStatus.WAITING_REVIEW: {StageStatus.DONE, StageStatus.ACTIVE}, StageStatus.DONE: set()}
        if payload.status != StageStatus(stage.status) and payload.status not in allowed[StageStatus(stage.status)]:
            raise HTTPException(status_code=422, detail={"code": "INVALID_STAGE_TRANSITION", "message": "Stage status transition is not allowed"})
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(stage, key, value)
    session.add(stage)
    session.commit()
    return project_reads(session, [project.id])[0]


@app.post("/api/tasks", response_model=TaskRead)
def create_task(payload: TaskCreateRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> TaskRead:
    project = session.get(Project, payload.project_id)
    if not project or not can_read_project(session, user, project):
        raise HTTPException(status_code=403, detail="Project access denied")
    if not can_manage_project(session, user, project) and payload.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Members can only create tasks assigned to themselves")
    for target in {payload.owner_id, payload.reviewer_id}:
        if project.owner_id != target and not session.get(ProjectMember, (project.id, target)):
            raise HTTPException(status_code=422, detail="Owner and reviewer must be project members")
    if payload.stage_id:
        stage = session.get(Stage, payload.stage_id)
        if not stage or stage.project_id != project.id:
            raise HTTPException(status_code=422, detail="Stage does not belong to project")
    task = Task(id=f"task-{uuid4().hex}", project_id=project.id, stage_id=payload.stage_id, title=payload.title, description=payload.description, deliverable=payload.deliverable, acceptance=payload.acceptance, owner_id=payload.owner_id, reviewer_id=payload.reviewer_id, status=TaskStatus.TODO if payload.owner_id == user.id else TaskStatus.PENDING_OWNER_CONFIRMATION, execution_mode=payload.execution_mode, priority=payload.priority, due_at=payload.due_at, progress=0, source="手动创建")
    session.add(task)
    session.commit()
    return _task_read(session, task)


def _task_for_user(task_id: str, user: User, session: Session) -> Task:
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.project_id not in readable_project_ids(session, user):
        raise HTTPException(status_code=403, detail="Task access denied")
    return task


def _task_read(session: Session, task: Task) -> TaskRead:
    return next(item for item in task_reads(session, [task.project_id]) if item.id == task.id)


@app.post("/api/tasks/{task_id}/actions/{action}", response_model=TaskActionResponse)
def task_action(
    task_id: str,
    action: TaskAction,
    payload: TaskActionRequest,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TaskActionResponse:
    task = _task_for_user(task_id, user, session)
    try:
        replay = apply_task_action(session, task, action, user, payload, idempotency_key)
    except DomainError as exc:
        session.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}) from exc
    return TaskActionResponse(task=_task_read(session, task), idempotent_replay=replay)


@app.get("/api/tasks/{task_id}/submissions", response_model=list[SubmissionRead])
def task_submissions(task_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[SubmissionRead]:
    _task_for_user(task_id, user, session)
    names = {item.id: item.name for item in session.exec(select(User)).all()}
    rows = session.exec(select(TaskSubmission).where(TaskSubmission.task_id == task_id).order_by(TaskSubmission.version.desc())).all()
    return [SubmissionRead(**row.model_dump(), submitter_name=names.get(row.submitted_by, "未指定")) for row in rows]


@app.get("/api/tasks/{task_id}/history", response_model=list[StatusHistoryRead])
def task_history(task_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[StatusHistoryRead]:
    _task_for_user(task_id, user, session)
    names = {item.id: item.name for item in session.exec(select(User)).all()}
    rows = session.exec(select(TaskStatusHistory).where(TaskStatusHistory.task_id == task_id).order_by(TaskStatusHistory.created_at.desc())).all()
    return [StatusHistoryRead(**row.model_dump(), actor_name=names.get(row.actor_id, "未指定")) for row in rows]


@app.get("/api/external-contacts", response_model=list[ExternalContactRead])
def external_contacts(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[ExternalContactRead]:
    team_ids = [row.team_id for row in session.exec(select(TeamMember).where(TeamMember.user_id == user.id)).all()]
    rows = session.exec(select(ExternalContact).where(ExternalContact.team_id.in_(team_ids))).all() if team_ids else []
    return [ExternalContactRead(**row.model_dump()) for row in rows]


@app.get("/api/tasks/{task_id}/external-dependency", response_model=ExternalDependencyRead | None)
def task_external_dependency(task_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> ExternalDependencyRead | None:
    _task_for_user(task_id, user, session)
    row = session.exec(select(ExternalDependency).where(ExternalDependency.task_id == task_id).order_by(ExternalDependency.created_at.desc())).first()
    if not row:
        return None
    contact = session.get(ExternalContact, row.contact_id)
    followup = session.get(User, row.internal_followup_user_id)
    level = reminder_level(row.expected_at, datetime.now(timezone.utc), row.external_feedback_status == ExternalFeedbackStatus.RECEIVED)
    return ExternalDependencyRead(id=row.id, task_id=row.task_id, contact_id=row.contact_id, contact_name=contact.name if contact else "未知联系人", item=row.item, expected_at=row.expected_at, internal_followup_user_id=row.internal_followup_user_id, internal_followup_user_name=followup.name if followup else "未指定", recovery_action=row.recovery_action, last_followup_at=row.last_followup_at, external_feedback_status=str(row.external_feedback_status), actual_received_at=row.actual_received_at, reminder_sent=row.reminder_sent, reminder_level=level)


@app.get("/api/external-reminders", response_model=list[ExternalReminderRead])
def external_reminders(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[ExternalReminderRead]:
    rows = session.exec(select(ExternalReminderEvent).where(ExternalReminderEvent.recipient_user_id == user.id).order_by(ExternalReminderEvent.created_at.desc())).all()
    return [ExternalReminderRead(**row.model_dump()) for row in rows]


@app.post("/api/candidate-extractions", response_model=CandidateExtractionResponse)
def create_candidate_extraction(payload: CandidateExtractionRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> CandidateExtractionResponse:
    project = session.get(Project, payload.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not can_read_project(session, user, project):
        raise HTTPException(status_code=403, detail="Project access denied")
    try:
        gateway = extract_candidates(session, project.id, payload.content)
    except GatewayOutputError as exc:
        raise HTTPException(status_code=422, detail={"code": "AI_SCHEMA_INVALID", "message": "AI output did not match the candidate schema; no candidates were created"}) from exc
    snapshot = SourceSnapshot(id=f"src-{uuid4().hex}", project_id=project.id, source_type=payload.source_type, title=payload.title, content=payload.content, content_hash=hashlib.sha256(payload.content.encode()).hexdigest(), created_by=user.id, extraction_version="candidate-extract-v1")
    session.add(snapshot)
    # CandidateTask references this row. Flush explicitly so PostgreSQL never
    # attempts candidate inserts before the immutable source snapshot exists.
    session.flush()
    candidates: list[CandidateTask] = []
    for extracted in gateway.data.candidates:
        candidate = CandidateTask(id=f"cand-{uuid4().hex}", source_snapshot_id=snapshot.id, project_id=project.id, title=extracted.title, description=extracted.description, deliverable=extracted.deliverable, owner_id=extracted.owner_id or user.id, reviewer_id=extracted.reviewer_id or project.owner_id, due_at=extracted.due_at, confidence=extracted.confidence, evidence=extracted.evidence)
        session.add(candidate)
        candidates.append(candidate)
    session.commit()
    for candidate in candidates:
        session.refresh(candidate)
    return CandidateExtractionResponse(snapshot_id=snapshot.id, candidates=[candidate_read(item) for item in candidates], execution_mode=gateway.execution_mode, degraded=gateway.degraded, fallback_reason=gateway.fallback_reason, cached=gateway.cached, call_id=gateway.call_id)


@app.get("/api/candidates", response_model=list[CandidateRead])
def list_candidates(project_id: str | None = None, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[CandidateRead]:
    allowed = readable_project_ids(session, user)
    if project_id and project_id not in allowed:
        raise HTTPException(status_code=403, detail="Project access denied")
    ids = [project_id] if project_id else allowed
    rows = session.exec(select(CandidateTask).where(CandidateTask.project_id.in_(ids)).order_by(CandidateTask.created_at.desc())).all() if ids else []
    return [candidate_read(item) for item in rows]


@app.patch("/api/candidates/{candidate_id}", response_model=CandidateRead)
def update_candidate(candidate_id: str, payload: CandidateUpdateRequest, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> CandidateRead:
    candidate = session.get(CandidateTask, candidate_id)
    if not candidate or candidate.project_id not in readable_project_ids(session, user):
        raise HTTPException(status_code=404, detail="Candidate not found")
    if CandidateStatus(candidate.status) != CandidateStatus.ACTIVE:
        raise HTTPException(status_code=409, detail={"code": "CANDIDATE_ALREADY_RESOLVED", "message": "Candidate can no longer be edited"})
    if candidate.version != payload.expected_version:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "message": "Candidate was updated by another request"})
    for key, value in payload.model_dump(exclude={"expected_version"}, exclude_unset=True).items():
        setattr(candidate, key, value)
    candidate.version += 1
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate_read(candidate)


@app.post("/api/candidates/{candidate_id}/confirm", response_model=CandidateConfirmResponse)
def confirm_candidate_route(candidate_id: str, payload: CandidateConfirmRequest, idempotency_key: str = Header(alias="Idempotency-Key", min_length=8), user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> CandidateConfirmResponse:
    candidate = session.get(CandidateTask, candidate_id)
    if not candidate or candidate.project_id not in readable_project_ids(session, user):
        raise HTTPException(status_code=404, detail="Candidate not found")
    try:
        task, replay = confirm_candidate(session, candidate, user, payload.expected_version, idempotency_key)
    except DomainError as exc:
        session.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}) from exc
    return CandidateConfirmResponse(candidate=candidate_read(candidate), task=_task_read(session, task), idempotent_replay=replay)


@app.post("/api/candidates/{candidate_id}/ignore", response_model=CandidateRead)
def ignore_candidate(candidate_id: str, idempotency_key: str = Header(alias="Idempotency-Key", min_length=8), user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> CandidateRead:
    candidate = session.get(CandidateTask, candidate_id)
    if not candidate or candidate.project_id not in readable_project_ids(session, user):
        raise HTTPException(status_code=404, detail="Candidate not found")
    existing = session.get(IdempotencyRecord, idempotency_key)
    if existing:
        return candidate_read(candidate)
    if CandidateStatus(candidate.status) != CandidateStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Candidate already resolved")
    candidate.status = CandidateStatus.IGNORED
    candidate.version += 1
    session.add(candidate)
    session.add(IdempotencyRecord(key=idempotency_key, actor_id=user.id, resource_id=candidate.id, action="IGNORE_CANDIDATE"))
    session.commit()
    session.refresh(candidate)
    return candidate_read(candidate)


def _agent_run_read(session: Session, run: AgentRun) -> AgentRunRead:
    task = session.get(Task, run.task_id)
    project = session.get(Project, task.project_id) if task else None
    requester = session.get(User, run.requested_by)
    return AgentRunRead(id=run.id, task_id=run.task_id, status=str(run.status), execution_mode=str(run.execution_mode) if run.execution_mode else None, degraded=run.degraded, fallback_reason=run.fallback_reason, prompt_version=run.prompt_version, attempt_count=run.attempt_count, max_attempts=run.max_attempts, output_text=run.output_text, error_message=run.error_message, started_at=run.started_at, finished_at=run.finished_at, created_at=run.created_at, task_title=task.title if task else "已删除任务", project_id=project.id if project else "", project_name=project.name if project else "已删除项目", requested_by_name=requester.name if requester else "未知成员")


@app.post("/api/tasks/{task_id}/agent-runs", response_model=AgentRunStartResponse)
def create_agent_run(task_id: str, payload: AgentRunStartRequest | None = None, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> AgentRunStartResponse:
    task = _task_for_user(task_id, user, session)
    try:
        run, replay = start_agent_run(session, task, user, payload.revision_instruction if payload else "")
    except DomainError as exc:
        session.rollback()
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}) from exc
    return AgentRunStartResponse(run=_agent_run_read(session, run), idempotent_replay=replay)


@app.get("/api/tasks/{task_id}/agent-runs", response_model=list[AgentRunRead])
def task_agent_runs(task_id: str, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[AgentRunRead]:
    _task_for_user(task_id, user, session)
    rows = session.exec(select(AgentRun).where(AgentRun.task_id == task_id).order_by(AgentRun.created_at.desc())).all()
    return [_agent_run_read(session, run) for run in rows]


@app.get("/api/agent-runs", response_model=list[AgentRunRead])
def list_agent_runs(status: str | None = None, project_id: str | None = None, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[AgentRunRead]:
    allowed_projects = readable_project_ids(session, user)
    if project_id:
        if project_id not in allowed_projects:
            raise HTTPException(status_code=403, detail="Project access denied")
        allowed_projects = [project_id]
    if status and status not in {item.value for item in AgentRunStatus}:
        raise HTTPException(status_code=422, detail={"code": "INVALID_AGENT_RUN_STATUS", "message": "Unknown agent run status"})
    task_ids = session.exec(select(Task.id).where(Task.project_id.in_(allowed_projects))).all() if allowed_projects else []
    if not task_ids:
        return []
    query = select(AgentRun).where(AgentRun.task_id.in_(task_ids))
    if status:
        query = query.where(AgentRun.status == status)
    rows = session.exec(query.order_by(AgentRun.created_at.desc())).all()
    return [_agent_run_read(session, run) for run in rows]


@app.get("/api/contributions", response_model=list[ContributionRead])
def contributions(user_id: str | None = None, user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[ContributionRead]:
    shared_admin_team = False
    if user_id and user_id != user.id:
        administered_team_ids = set(session.exec(select(TeamMember.team_id).where(TeamMember.user_id == user.id, TeamMember.role == TeamRole.CEO)).all())
        target_team_ids = set(session.exec(select(TeamMember.team_id).where(TeamMember.user_id == user_id)).all())
        shared_admin_team = bool(administered_team_ids & target_team_ids)
    target_user_id = user_id if user_id and shared_admin_team else user.id
    rows = session.exec(select(ContributionEvent).where(ContributionEvent.user_id == target_user_id).order_by(ContributionEvent.created_at.desc())).all()
    names = {item.id: item.name for item in session.exec(select(User)).all()}
    return [ContributionRead(id=row.id, task_id=row.task_id, user_id=row.user_id, user_name=names.get(row.user_id, "未指定"), event_type=row.event_type, submission_version=row.submission_version, points=row.points, created_at=row.created_at) for row in rows]
