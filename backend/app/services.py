from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlmodel import Session, select

from .external_reminders import reminder_level
from .models import ExecutionMode, ExternalDependency, ExternalFeedbackStatus, Project, Stage, StageStatus, Task, TaskStatus, User
from .schemas import ProjectRead, StageRead, TaskRead


HealthLevel = Literal["正常", "有风险", "需关注"]

_HEALTH_LABELS: dict[int, HealthLevel] = {0: "正常", 1: "有风险", 2: "需关注"}
_CLOSED_STATUSES = {TaskStatus.DONE, TaskStatus.CANCELED}
_PROGRESS_STATUSES = {
    TaskStatus.PENDING_OWNER_CONFIRMATION,
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.WAITING_HUMAN_CONFIRMATION,
}
_OWNER_ACTIVE_STATUSES = {
    TaskStatus.PENDING_OWNER_CONFIRMATION,
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.BLOCKED,
    TaskStatus.WAITING_HUMAN_CONFIRMATION,
}
_CRITICAL_PRIORITIES = {"HIGH", "CRITICAL", "URGENT"}
_STAGE_STATUS_PROGRESS = {
    StageStatus.PLANNED: 0,
    StageStatus.ACTIVE: 10,
    StageStatus.WAITING_REVIEW: 90,
    StageStatus.DONE: 100,
}


def _utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def assess_project_health(
    tasks: list[Task],
    external_levels: list[str],
    now: datetime,
    *,
    project_due_at: datetime | None = None,
    progress: int = 0,
    owner_names: dict[str, str] | None = None,
) -> tuple[HealthLevel, list[str]]:
    """Return an explainable project/stage health result from persisted facts.

    Until the data model has an explicit critical-path flag, HIGH/CRITICAL/URGENT
    tasks are treated as critical-path proxies. Reasons are ordered from the most
    severe, actionable signal to lower-severity warnings.
    """
    now = _utc(now)
    open_tasks = [task for task in tasks if TaskStatus(task.status) not in _CLOSED_STATUSES]
    reasons: list[tuple[int, str]] = []

    def add(severity: int, reason: str) -> None:
        if not any(existing == reason for _, existing in reasons):
            reasons.append((severity, reason))

    if project_due_at and open_tasks:
        remaining = _utc(project_due_at) - now
        if remaining.total_seconds() < 0:
            add(2, "项目已超过截止日期且仍有未完成任务")
        elif remaining <= timedelta(days=7) and progress < 80:
            add(1, f"项目将在 7 天内到期，当前进度 {progress}%")

    overdue = [task for task in open_tasks if task.due_at and _utc(task.due_at) < now]
    if overdue:
        unstaged_count = sum(task.stage_id is None for task in overdue)
        critical_count = sum(task.priority.upper() in _CRITICAL_PRIORITIES for task in overdue)
        detail = f"{len(overdue)} 个任务逾期"
        qualifiers: list[str] = []
        if critical_count:
            qualifiers.append(f"含 {critical_count} 个高优先级任务")
        if unstaged_count:
            qualifiers.append(f"含 {unstaged_count} 个未归阶段任务")
        add(2, detail + (f"（{'，'.join(qualifiers)}）" if qualifiers else ""))

    blocked = [task for task in open_tasks if TaskStatus(task.status) == TaskStatus.BLOCKED]
    if blocked:
        critical_blocked = sum(task.priority.upper() in _CRITICAL_PRIORITIES for task in blocked)
        add(1, f"{len(blocked)} 个任务阻塞" + (f"（含 {critical_blocked} 个高优先级任务）" if critical_blocked else ""))

    critical_due_soon = [
        task for task in open_tasks
        if task.priority.upper() in _CRITICAL_PRIORITIES
        and task.due_at
        and timedelta(0) <= _utc(task.due_at) - now <= timedelta(days=3)
        and task.progress < 80
    ]
    if critical_due_soon:
        add(1, f"{len(critical_due_soon)} 个高优先级任务将在 3 天内到期")

    stale = [
        task for task in open_tasks
        if TaskStatus(task.status) in _PROGRESS_STATUSES
        and now - _utc(task.updated_at) >= timedelta(days=7)
    ]
    if stale:
        add(1, f"{len(stale)} 个任务超过 7 天没有进展更新")

    review_backlog = [
        task for task in open_tasks
        if TaskStatus(task.status) == TaskStatus.WAITING_REVIEW
        and now - _utc(task.updated_at) >= timedelta(hours=48)
    ]
    if review_backlog:
        add(1, f"{len(review_backlog)} 个任务等待验收超过 48 小时")

    active_by_owner: dict[str, int] = defaultdict(int)
    for task in open_tasks:
        if TaskStatus(task.status) in _OWNER_ACTIVE_STATUSES:
            active_by_owner[task.owner_id] += 1
    overloaded = sorted(((owner_id, count) for owner_id, count in active_by_owner.items() if count > 5), key=lambda item: (-item[1], item[0]))
    if overloaded:
        owner_id, count = overloaded[0]
        owner_name = (owner_names or {}).get(owner_id, "负责人")
        suffix = f"，另有 {len(overloaded) - 1} 人超负荷" if len(overloaded) > 1 else ""
        add(1, f"{owner_name}在本项目同时承担 {count} 个活跃任务{suffix}")

    overdue_dependencies = external_levels.count("OVERDUE")
    upcoming_dependencies = external_levels.count("UPCOMING")
    if overdue_dependencies:
        add(2, f"{overdue_dependencies} 个外部依赖已逾期")
    if upcoming_dependencies:
        add(1, f"{upcoming_dependencies} 个外部依赖将在 24 小时内到期")

    if not reasons:
        return "正常", ["当前未发现逾期、阻塞、积压或负荷风险"]
    reasons.sort(key=lambda item: -item[0])
    severity = max(item[0] for item in reasons)
    return _HEALTH_LABELS[severity], [reason for _, reason in reasons]


def _user_names(session: Session) -> dict[str, str]:
    return {user.id: user.name for user in session.exec(select(User)).all()}


def task_reads(session: Session, project_ids: list[str]) -> list[TaskRead]:
    if not project_ids:
        return []
    projects = {item.id: item for item in session.exec(select(Project).where(Project.id.in_(project_ids))).all()}
    names = _user_names(session)
    tasks = session.exec(select(Task).where(Task.project_id.in_(project_ids))).all()
    return [
        TaskRead(
            id=task.id,
            project_id=task.project_id,
            project_name=projects[task.project_id].name,
            stage_id=task.stage_id,
            title=task.title,
            description=task.description,
            deliverable=task.deliverable,
            acceptance=task.acceptance,
            owner_id=task.owner_id,
            owner_name=names.get(task.owner_id, "未指定"),
            reviewer_id=task.reviewer_id,
            reviewer_name=names.get(task.reviewer_id, "未指定"),
            status=TaskStatus(task.status),
            execution_mode=ExecutionMode(task.execution_mode),
            priority=task.priority,
            progress=task.progress,
            due_at=task.due_at,
            source=task.source,
            version=task.version,
        )
        for task in tasks
    ]


def project_reads(session: Session, project_ids: list[str]) -> list[ProjectRead]:
    if not project_ids:
        return []
    projects = session.exec(select(Project).where(Project.id.in_(project_ids))).all()
    stages = session.exec(select(Stage).where(Stage.project_id.in_(project_ids))).all()
    tasks = session.exec(select(Task).where(Task.project_id.in_(project_ids))).all()
    external_dependencies = session.exec(select(ExternalDependency).where(ExternalDependency.external_feedback_status == ExternalFeedbackStatus.WAITING)).all()
    dependency_by_task = {item.task_id: item for item in external_dependencies}
    names = _user_names(session)
    stages_by_project: dict[str, list[Stage]] = defaultdict(list)
    tasks_by_stage: dict[str | None, list[Task]] = defaultdict(list)
    for stage in stages:
        stages_by_project[stage.project_id].append(stage)
    for task in tasks:
        tasks_by_stage[task.stage_id].append(task)
    results: list[ProjectRead] = []
    for project in projects:
        project_stages = sorted(stages_by_project[project.id], key=lambda item: item.position)
        stage_reads: list[StageRead] = []
        for stage in project_stages:
            stage_tasks = tasks_by_stage[stage.id]
            task_progress = round(sum(task.progress for task in stage_tasks) / len(stage_tasks)) if stage_tasks else 0
            progress = max(task_progress, _STAGE_STATUS_PROGRESS[StageStatus(stage.status)])
            stage_external_levels = [reminder_level(dependency_by_task[task.id].expected_at, datetime.now(timezone.utc)) for task in stage_tasks if task.id in dependency_by_task]
            stage_health, _stage_reasons = assess_project_health(stage_tasks, stage_external_levels, datetime.now(timezone.utc), progress=progress)
            stage_reads.append(StageRead(id=stage.id, name=stage.name, position=stage.position, status=StageStatus(stage.status), progress=progress, health=stage_health))
        project_tasks = [task for task in tasks if task.project_id == project.id]
        unstaged_tasks = [task for task in project_tasks if task.stage_id is None]
        stage_weight = sum(stage.weight for stage in project_stages)
        unstaged_weight = len(unstaged_tasks)
        total_weight = stage_weight + unstaged_weight
        weighted_progress = sum(stage_read.progress * stage.weight for stage_read, stage in zip(stage_reads, project_stages))
        weighted_progress += sum(task.progress for task in unstaged_tasks)
        progress = round(weighted_progress / total_weight) if total_weight else 0
        external_levels = [reminder_level(dependency_by_task[task.id].expected_at, datetime.now(timezone.utc)) for task in project_tasks if task.id in dependency_by_task]
        health, health_reasons = assess_project_health(project_tasks, external_levels, datetime.now(timezone.utc), project_due_at=project.due_at, progress=progress, owner_names=names)
        current_stage = next((stage.name for stage in project_stages if stage.status == StageStatus.ACTIVE), project_stages[0].name if project_stages else "未设置")
        results.append(ProjectRead(id=project.id, team_id=project.team_id, name=project.name, client=project.client, objective=project.objective, owner_id=project.owner_id, owner_name=names.get(project.owner_id, "未指定"), next_milestone=project.next_milestone, due_at=project.due_at, progress=progress, health=health, health_reasons=health_reasons, current_stage=current_stage, stages=stage_reads))
    return results
