from __future__ import annotations

from sqlmodel import Session, select

from .models import Project, ProjectMember, TeamMember, TeamRole, User


def is_team_admin(session: Session, user: User, team_id: str) -> bool:
    membership = session.get(TeamMember, (team_id, user.id))
    return bool(membership and TeamRole(membership.role) == TeamRole.CEO)


def can_manage_project(session: Session, user: User, project: Project) -> bool:
    return project.owner_id == user.id or is_team_admin(session, user, project.team_id)


def can_read_project(session: Session, user: User, project: Project) -> bool:
    if is_team_admin(session, user, project.team_id):
        return True
    membership = session.exec(select(ProjectMember).where(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)).first()
    return membership is not None


def readable_project_ids(session: Session, user: User) -> list[str]:
    project_ids = set(session.exec(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)).all())
    admin_team_ids = session.exec(
        select(TeamMember.team_id).where(TeamMember.user_id == user.id, TeamMember.role == TeamRole.CEO)
    ).all()
    if admin_team_ids:
        project_ids.update(session.exec(select(Project.id).where(Project.team_id.in_(admin_team_ids))).all())
    return sorted(project_ids)
