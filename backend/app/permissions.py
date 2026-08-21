from __future__ import annotations

from sqlmodel import Session, select

from .models import Project, TeamMember, TeamRole, User


def is_team_admin(session: Session, user: User, team_id: str) -> bool:
    membership = session.get(TeamMember, (team_id, user.id))
    return bool(membership and TeamRole(membership.role) == TeamRole.CEO)


def can_manage_project(session: Session, user: User, project: Project) -> bool:
    return project.owner_id == user.id or is_team_admin(session, user, project.team_id)


def can_read_project(session: Session, user: User, project: Project) -> bool:
    return session.get(TeamMember, (project.team_id, user.id)) is not None


def readable_project_ids(session: Session, user: User) -> list[str]:
    team_ids = session.exec(select(TeamMember.team_id).where(TeamMember.user_id == user.id)).all()
    project_ids = set(session.exec(select(Project.id).where(Project.team_id.in_(team_ids))).all()) if team_ids else set()
    return sorted(project_ids)
