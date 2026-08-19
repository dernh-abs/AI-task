from __future__ import annotations

import json
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .models import AgentRun, AgentRunStatus, AuditEvent, ExternalContact, ExternalDependency, ExternalFeedbackStatus, IdempotencyRecord, Project, ProjectMember, Task, TaskStatus, TaskStatusHistory, TaskSubmission, TeamRole, User, utc_now
from .schemas import TaskAction, TaskActionRequest


@dataclass
class DomainError(Exception):
    status_code: int
    code: str
    message: str


TRANSITIONS: dict[TaskAction, tuple[set[TaskStatus], TaskStatus]] = {
    "ACCEPT": ({TaskStatus.PENDING_OWNER_CONFIRMATION}, TaskStatus.TODO),
    "START": ({TaskStatus.TODO}, TaskStatus.IN_PROGRESS),
    "SUBMIT": ({TaskStatus.IN_PROGRESS}, TaskStatus.WAITING_REVIEW),
    "APPROVE": ({TaskStatus.WAITING_REVIEW}, TaskStatus.DONE),
    "RETURN": ({TaskStatus.WAITING_REVIEW}, TaskStatus.IN_PROGRESS),
    "WAIT_EXTERNAL": ({TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED}, TaskStatus.WAITING_EXTERNAL),
    "RESUME_EXTERNAL": ({TaskStatus.WAITING_EXTERNAL}, TaskStatus.IN_PROGRESS),
    "CONFIRM_AI": ({TaskStatus.WAITING_HUMAN_CONFIRMATION}, TaskStatus.WAITING_REVIEW),
    "REVISE_AI": ({TaskStatus.WAITING_HUMAN_CONFIRMATION}, TaskStatus.IN_PROGRESS),
    "CANCEL": ({TaskStatus.PENDING_OWNER_CONFIRMATION, TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.WAITING_REVIEW}, TaskStatus.CANCELED),
}


def _is_owner(task: Task, actor: User) -> bool:
    return task.owner_id == actor.id or actor.role == TeamRole.CEO


def _is_reviewer(task: Task, actor: User) -> bool:
    return task.reviewer_id == actor.id or actor.role == TeamRole.CEO


def _guard(task: Task, action: TaskAction, actor: User, payload: TaskActionRequest) -> None:
    current = TaskStatus(task.status)
    allowed, _ = TRANSITIONS[action]
    if current not in allowed:
        raise DomainError(422, "INVALID_TRANSITION", f"{current.value} cannot perform {action}")
    if action in {"ACCEPT", "START", "SUBMIT"} and not _is_owner(task, actor):
        raise DomainError(403, "FORBIDDEN", "Only the task owner can perform this action")
    if action in {"APPROVE", "RETURN"} and not _is_reviewer(task, actor):
        raise DomainError(403, "FORBIDDEN", "Only the reviewer can perform this action")
    if action == "CANCEL" and actor.role != TeamRole.CEO:
        raise DomainError(403, "FORBIDDEN", "Only a CEO can cancel a task in MVP")
    if action == "SUBMIT" and not any([payload.summary.strip(), payload.external_url, payload.asset_reference]):
        raise DomainError(422, "EMPTY_SUBMISSION", "A result summary, URL, or asset reference is required")
    if action in {"RETURN", "CANCEL"} and not payload.reason.strip():
        raise DomainError(422, "REASON_REQUIRED", "A reason is required")
    if action in {"CONFIRM_AI", "REVISE_AI"} and not _is_owner(task, actor):
        raise DomainError(403, "FORBIDDEN", "Only the task owner can confirm AI output")
    if action == "REVISE_AI" and not payload.reason.strip():
        raise DomainError(422, "REASON_REQUIRED", "Revision feedback is required")
    if action == "CONFIRM_AI" and not payload.agent_run_id:
        raise DomainError(422, "AGENT_RUN_REQUIRED", "A successful agent run is required")
    if action == "WAIT_EXTERNAL":
        if not _is_owner(task, actor):
            raise DomainError(403, "FORBIDDEN", "Only the task owner can create an external dependency")
        required = [payload.contact_id, payload.item, payload.expected_at, payload.internal_followup_user_id, payload.recovery_action]
        if not all(required):
            raise DomainError(422, "EXTERNAL_DEPENDENCY_INCOMPLETE", "Contact, item, expected time, internal follow-up owner, and recovery action are required")


def apply_task_action(session: Session, task: Task, action: TaskAction, actor: User, payload: TaskActionRequest, idempotency_key: str) -> bool:
    existing = session.get(IdempotencyRecord, idempotency_key)
    if existing:
        if existing.actor_id != actor.id or existing.resource_id != task.id or existing.action != action:
            raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for another operation")
        return True
    if task.version != payload.expected_version:
        raise DomainError(409, "VERSION_CONFLICT", "Task was updated by another request")
    _guard(task, action, actor, payload)
    from_status = TaskStatus(task.status)
    _, to_status = TRANSITIONS[action]
    if action == "SUBMIT":
        latest = session.exec(select(TaskSubmission).where(TaskSubmission.task_id == task.id).order_by(TaskSubmission.version.desc())).first()
        submission_version = 1 if latest is None else latest.version + 1
        session.add(TaskSubmission(id=f"sub-{uuid4().hex}", task_id=task.id, version=submission_version, submitted_by=actor.id, summary=payload.summary.strip(), external_url=payload.external_url, asset_reference=payload.asset_reference))
    if action == "WAIT_EXTERNAL":
        contact = session.get(ExternalContact, payload.contact_id)
        project = session.get(Project, task.project_id)
        if not contact or not project or contact.team_id != project.team_id:
            raise DomainError(422, "CONTACT_NOT_FOUND", "External contact does not exist")
        followup = session.get(User, payload.internal_followup_user_id)
        project_membership = session.get(ProjectMember, (task.project_id, payload.internal_followup_user_id))
        if not followup or (not project_membership and project.owner_id != payload.internal_followup_user_id):
            raise DomainError(422, "FOLLOWUP_USER_NOT_FOUND", "Internal follow-up user does not exist")
        active = session.exec(select(ExternalDependency).where(ExternalDependency.task_id == task.id, ExternalDependency.external_feedback_status == ExternalFeedbackStatus.WAITING)).first()
        if active:
            raise DomainError(409, "ACTIVE_EXTERNAL_DEPENDENCY_EXISTS", "The task already has an active external dependency")
        session.add(ExternalDependency(id=f"ext-{uuid4().hex}", task_id=task.id, contact_id=payload.contact_id or "", item=(payload.item or "").strip(), expected_at=payload.expected_at, internal_followup_user_id=payload.internal_followup_user_id or "", recovery_action=(payload.recovery_action or "").strip()))
    if action == "RESUME_EXTERNAL":
        dependency = session.exec(select(ExternalDependency).where(ExternalDependency.task_id == task.id, ExternalDependency.external_feedback_status == ExternalFeedbackStatus.WAITING).order_by(ExternalDependency.created_at.desc())).first()
        if not dependency:
            raise DomainError(422, "EXTERNAL_DEPENDENCY_NOT_FOUND", "No active external dependency exists")
        if actor.id not in {task.owner_id, dependency.internal_followup_user_id} and actor.role != TeamRole.CEO:
            raise DomainError(403, "FORBIDDEN", "Only the task owner or internal follow-up owner can resume this task")
        dependency.external_feedback_status = ExternalFeedbackStatus.RECEIVED
        dependency.actual_received_at = utc_now()
        dependency.updated_at = utc_now()
        session.add(dependency)
    if action == "CONFIRM_AI":
        run = session.get(AgentRun, payload.agent_run_id)
        if not run or run.task_id != task.id or AgentRunStatus(run.status) != AgentRunStatus.SUCCEEDED or not run.output_text.strip():
            raise DomainError(422, "AGENT_RUN_INVALID", "Agent run must have a successful non-empty output")
        latest = session.exec(select(TaskSubmission).where(TaskSubmission.task_id == task.id).order_by(TaskSubmission.version.desc())).first()
        submission_version = 1 if latest is None else latest.version + 1
        session.add(TaskSubmission(id=f"sub-{uuid4().hex}", task_id=task.id, version=submission_version, submitted_by=actor.id, summary=run.output_text, external_url=None, asset_reference=f"agent-run:{run.id}"))
    task.status = to_status
    task.progress = 100 if to_status == TaskStatus.DONE else 95 if to_status == TaskStatus.WAITING_REVIEW else max(5, min(task.progress, 85))
    task.version += 1
    task.updated_at = utc_now()
    reason = payload.reason.strip()
    session.add(TaskStatusHistory(id=f"hist-{uuid4().hex}", task_id=task.id, from_status=from_status.value, to_status=to_status.value, actor_id=actor.id, action=action, reason=reason))
    session.add(AuditEvent(id=f"audit-{uuid4().hex}", actor_id=actor.id, resource_type="task", resource_id=task.id, action=action, detail_json=json.dumps({"from": from_status.value, "to": to_status.value, "reason": reason}, ensure_ascii=False)))
    session.add(IdempotencyRecord(key=idempotency_key, actor_id=actor.id, resource_id=task.id, action=action))
    session.add(task)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise DomainError(409, "CONCURRENT_WRITE", "The operation was already processed") from exc
    session.refresh(task)
    return False
