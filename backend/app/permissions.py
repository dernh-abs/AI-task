from __future__ import annotations

from sqlmodel import Session, select

from .models import Project, TeamMember, TeamRole, User


def is_team_admin(session: Session, user: User, team_id: str) -> bool:
    membership = session.get(TeamMember, (team_id, user.id))
    return bool(membership and TeamRole(membership.role) == TeamRole.CEO)


def can_manage_project(session: Session, user: User, project: Project) -> bool:
    return project.owner_id == user.id or is_team_admin(session, user, project.team_id)


def can_read_project(session: Session, user: User, project: Project) -> bool:
    # Project visibility is global for every authenticated, active account.
    # Mutation permissions remain scoped by can_manage_project and task roles.
    return user.is_active


def can_contribute_project(session: Session, user: User, project: Project) -> bool:
    return session.get(TeamMember, (project.team_id, user.id)) is not None


def readable_project_ids(session: Session, user: User) -> list[str]:
    if not user.is_active:
        return []
    return sorted(session.exec(select(Project.id)).all())
