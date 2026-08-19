from __future__ import annotations

from sqlmodel import Session, select

from .models import Project, ProjectMember, TeamRole, User


def can_read_project(session: Session, user: User, project: Project) -> bool:
    if user.role == TeamRole.CEO:
        return True
    membership = session.exec(select(ProjectMember).where(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)).first()
    return membership is not None


def readable_project_ids(session: Session, user: User) -> list[str]:
    if user.role == TeamRole.CEO:
        return list(session.exec(select(Project.id)).all())
    return list(session.exec(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)).all())

