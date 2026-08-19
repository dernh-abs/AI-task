from __future__ import annotations

from collections import defaultdict

from sqlmodel import Session, select

from .models import ExecutionMode, Project, Stage, StageStatus, Task, TaskStatus, User
from .schemas import ProjectRead, StageRead, TaskRead


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
            progress = round(sum(task.progress for task in stage_tasks) / len(stage_tasks)) if stage_tasks else 0
            stage_reads.append(StageRead(id=stage.id, name=stage.name, position=stage.position, status=StageStatus(stage.status), progress=progress))
        project_tasks = [task for task in tasks if task.project_id == project.id]
        progress = round(sum(task.progress for task in project_tasks) / len(project_tasks)) if project_tasks else 0
        has_blocker = any(task.status == TaskStatus.BLOCKED for task in project_tasks)
        current_stage = next((stage.name for stage in project_stages if stage.status == StageStatus.ACTIVE), project_stages[0].name if project_stages else "未设置")
        results.append(ProjectRead(id=project.id, name=project.name, client=project.client, objective=project.objective, owner_id=project.owner_id, owner_name=names.get(project.owner_id, "未指定"), next_milestone=project.next_milestone, due_at=project.due_at, progress=progress, health="有风险" if has_blocker else "正常", current_stage=current_stage, stages=stage_reads))
    return results
