from __future__ import annotations

from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from .models import AuditEvent, CandidateStatus, CandidateTask, ExecutionMode, IdempotencyRecord, Project, ProjectMember, Task, TaskStatus, User, utc_now
from .permissions import can_manage_project
from .schemas import CandidateRead
from .state_machine import DomainError


def candidate_read(candidate: CandidateTask) -> CandidateRead:
    return CandidateRead(id=candidate.id, source_snapshot_id=candidate.source_snapshot_id, project_id=candidate.project_id, title=candidate.title, description=candidate.description, deliverable=candidate.deliverable, owner_id=candidate.owner_id, reviewer_id=candidate.reviewer_id, due_at=candidate.due_at, confidence=candidate.confidence, evidence=candidate.evidence, status=str(candidate.status), created_task_id=candidate.created_task_id, version=candidate.version)


def confirm_candidate(session: Session, candidate: CandidateTask, actor: User, expected_version: int, idempotency_key: str) -> tuple[Task, bool]:
    existing = session.get(IdempotencyRecord, idempotency_key)
    if existing:
        if existing.actor_id != actor.id or existing.resource_id != candidate.id or existing.action != "CONFIRM_CANDIDATE":
            raise DomainError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used")
        if not candidate.created_task_id:
            raise DomainError(409, "IDEMPOTENCY_INCOMPLETE", "Previous operation did not complete")
        return session.get(Task, candidate.created_task_id), True  # type: ignore[return-value]
    if CandidateStatus(candidate.status) != CandidateStatus.ACTIVE:
        raise DomainError(409, "CANDIDATE_ALREADY_RESOLVED", "Candidate can only be confirmed once")
    if candidate.version != expected_version:
        raise DomainError(409, "VERSION_CONFLICT", "Candidate was updated by another request")
    project = session.get(Project, candidate.project_id)
    if not project or not can_manage_project(session, actor, project):
        raise DomainError(403, "FORBIDDEN", "Only the project owner or CEO can confirm candidates")
    if not candidate.owner_id or not candidate.reviewer_id:
        raise DomainError(422, "ASSIGNMENT_REQUIRED", "Owner and reviewer are required")
    for user_id in {candidate.owner_id, candidate.reviewer_id}:
        if project.owner_id != user_id and not session.get(ProjectMember, (project.id, user_id)):
            raise DomainError(422, "PROJECT_MEMBER_REQUIRED", "Owner and reviewer must belong to the project")
    task = Task(id=f"task-{uuid4().hex}", project_id=project.id, title=candidate.title, description=candidate.description, deliverable=candidate.deliverable, acceptance=candidate.deliverable, owner_id=candidate.owner_id, reviewer_id=candidate.reviewer_id, status=TaskStatus.TODO if candidate.owner_id == actor.id else TaskStatus.PENDING_OWNER_CONFIRMATION, execution_mode=ExecutionMode.HUMAN, priority="MEDIUM", progress=0, due_at=candidate.due_at, source=f"候选提取 · {candidate.source_snapshot_id}")
    session.add(task)
    candidate.status = CandidateStatus.CREATED
    candidate.created_task_id = task.id
    candidate.confirmed_by = actor.id
    candidate.confirmed_at = utc_now()
    candidate.version += 1
    session.add(candidate)
    session.add(IdempotencyRecord(key=idempotency_key, actor_id=actor.id, resource_id=candidate.id, action="CONFIRM_CANDIDATE"))
    session.add(AuditEvent(id=f"audit-{uuid4().hex}", actor_id=actor.id, resource_type="candidate", resource_id=candidate.id, action="CONFIRM_CANDIDATE", detail_json=f'{{"task_id":"{task.id}"}}'))
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise DomainError(409, "CONCURRENT_WRITE", "Candidate was already confirmed") from exc
    session.refresh(task)
    session.refresh(candidate)
    return task, False
