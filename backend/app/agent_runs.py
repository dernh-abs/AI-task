from __future__ import annotations

import hashlib
from uuid import uuid4

from sqlmodel import Session, select

from .model_gateway import generate_task_draft
from .models import AgentRun, AgentRunLog, AgentRunStatus, AiExecutionMode, AuditEvent, Task, TaskStatus, TaskStatusHistory, TeamRole, User, utc_now
from .state_machine import DomainError


PROMPT_VERSION = "task-draft-v1"


def start_agent_run(session: Session, task: Task, actor: User) -> tuple[AgentRun, bool]:
    if task.owner_id != actor.id and actor.role != TeamRole.CEO:
        raise DomainError(403, "FORBIDDEN", "Only the task owner can start AI assistance")
    latest = session.exec(select(AgentRun).where(AgentRun.task_id == task.id).order_by(AgentRun.created_at.desc())).first()
    if latest and AgentRunStatus(latest.status) in {AgentRunStatus.QUEUED, AgentRunStatus.RUNNING, AgentRunStatus.SUCCEEDED} and TaskStatus(task.status) == TaskStatus.WAITING_HUMAN_CONFIRMATION:
        return latest, True
    if TaskStatus(task.status) != TaskStatus.IN_PROGRESS:
        raise DomainError(422, "INVALID_TRANSITION", "AI assistance requires an in-progress task")
    fingerprint = hashlib.sha256(f"{task.id}:{task.version}:{PROMPT_VERSION}".encode()).hexdigest()
    existing = session.exec(select(AgentRun).where(AgentRun.request_fingerprint == fingerprint)).first()
    if existing:
        return existing, True
    run = AgentRun(id=f"run-{uuid4().hex}", task_id=task.id, requested_by=actor.id, request_fingerprint=fingerprint, status=AgentRunStatus.QUEUED, prompt_version=PROMPT_VERSION)
    session.add(run)
    session.add(AgentRunLog(id=f"log-{uuid4().hex}", agent_run_id=run.id, level="INFO", message="运行已进入队列"))
    session.commit()
    session.refresh(run)
    if not task.description.strip() or not task.deliverable.strip():
        run.status = AgentRunStatus.NEEDS_INPUT
        run.error_message = "Task description and deliverable are required before AI execution"
        run.heartbeat_at = utc_now()
        session.add(run)
        session.add(AgentRunLog(id=f"log-{uuid4().hex}", agent_run_id=run.id, level="WARN", message="缺少任务背景或交付物，需要负责人补充输入"))
        session.commit()
        session.refresh(run)
        return run, False
    run.status = AgentRunStatus.RUNNING
    run.started_at = utc_now()
    run.heartbeat_at = utc_now()
    run.attempt_count = 1
    session.add(run)
    session.add(AgentRunLog(id=f"log-{uuid4().hex}", agent_run_id=run.id, level="INFO", message="正在生成任务草稿"))
    session.commit()
    try:
        result = generate_task_draft(session, task.project_id, f"任务：{task.title}\n背景：{task.description}\n交付物：{task.deliverable}\n验收标准：{task.acceptance}")
        session.refresh(task)
        if TaskStatus(task.status) != TaskStatus.IN_PROGRESS:
            raise DomainError(409, "TASK_CHANGED", "Task changed while AI was running")
        from_status = TaskStatus(task.status)
        run.status = AgentRunStatus.SUCCEEDED
        run.execution_mode = AiExecutionMode(result.execution_mode)
        run.degraded = result.degraded
        run.fallback_reason = result.fallback_reason
        run.output_text = result.text
        run.attempt_count = result.attempt_count
        run.finished_at = utc_now()
        run.heartbeat_at = utc_now()
        task.status = TaskStatus.WAITING_HUMAN_CONFIRMATION
        task.progress = min(task.progress, 90)
        task.version += 1
        task.updated_at = utc_now()
        session.add_all([run, task, AgentRunLog(id=f"log-{uuid4().hex}", agent_run_id=run.id, level="INFO", message="草稿已生成，等待负责人确认"), TaskStatusHistory(id=f"hist-{uuid4().hex}", task_id=task.id, from_status=from_status.value, to_status=TaskStatus.WAITING_HUMAN_CONFIRMATION.value, actor_id=actor.id, action="AI_DRAFT_READY", reason=""), AuditEvent(id=f"audit-{uuid4().hex}", actor_id=actor.id, resource_type="agent_run", resource_id=run.id, action="SUCCEEDED", detail_json=f'{{"execution_mode":"{result.execution_mode}","degraded":{str(result.degraded).lower()}}}')])
        session.commit()
        session.refresh(run)
        return run, False
    except Exception as exc:
        session.rollback()
        run = session.get(AgentRun, run.id)
        if run:
            run.status = AgentRunStatus.FAILED
            run.error_message = str(exc)
            run.finished_at = utc_now()
            session.add(run)
            session.add(AgentRunLog(id=f"log-{uuid4().hex}", agent_run_id=run.id, level="ERROR", message="运行失败，任务状态未改变"))
            session.commit()
        if isinstance(exc, DomainError):
            raise
        raise DomainError(502, "AGENT_RUN_FAILED", "AI run failed; task state was not changed") from exc


def recover_stale_runs(session: Session) -> int:
    rows = session.exec(select(AgentRun).where(AgentRun.status == AgentRunStatus.RUNNING)).all()
    for run in rows:
        run.status = AgentRunStatus.FAILED
        run.error_message = "Service restarted before the run completed"
        run.finished_at = utc_now()
        session.add(run)
        session.add(AgentRunLog(id=f"log-{uuid4().hex}", agent_run_id=run.id, level="ERROR", message="服务重启，已关闭卡住的运行"))
    if rows:
        session.commit()
    return len(rows)
