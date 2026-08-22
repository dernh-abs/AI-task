from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .models import AuditEvent, Invitation, Project, ProjectMember, ProjectRole, Team, TeamMember, TeamRole, User, utc_now
from .schemas import ChangePasswordRequest, InvitationAcceptRequest, InvitationAdminRead, InvitationCreateRequest, InvitationPublicRead, TeamMemberRead, TeamRead, TokenResponse, UserRead
from .security import create_access_token, hash_password, verify_password


INVITATION_TTL_HOURS = 72


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _pending_invitation(session: Session, token: str) -> Invitation:
    invitation = session.exec(select(Invitation).where(Invitation.token_hash == _token_hash(token))).first()
    if not invitation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="邀请链接无效")
    if invitation.accepted_at or invitation.revoked_at:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="邀请链接已失效")
    if _as_utc(invitation.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="邀请链接已过期")
    return invitation


def _require_team_member(session: Session, team_id: str, actor: User) -> TeamMember:
    membership = session.get(TeamMember, (team_id, actor.id))
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有当前团队成员可以发送或管理自己的邀请")
    return membership


def _require_invitation_scope(session: Session, team_id: str, project_id: str | None, actor: User) -> tuple[TeamMember, Project | None]:
    membership = _require_team_member(session, team_id, actor)
    if not project_id:
        return membership, None
    project = session.get(Project, project_id)
    if not project or project.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="邀请项目不属于当前团队")
    if not session.get(ProjectMember, (project_id, actor.id)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有当前项目成员可以邀请其他人加入该项目")
    return membership, project


def _invitation_status(invitation: Invitation) -> str:
    if invitation.accepted_at:
        return "ACCEPTED"
    if invitation.revoked_at:
        return "REVOKED"
    if _as_utc(invitation.expires_at) <= datetime.now(timezone.utc):
        return "EXPIRED"
    return "PENDING"


def _invitation_admin_read(session: Session, invitation: Invitation) -> InvitationAdminRead:
    project = session.get(Project, invitation.project_id) if invitation.project_id else None
    return InvitationAdminRead(
        id=invitation.id,
        email=invitation.email,
        role=invitation.role,
        project_id=invitation.project_id,
        project_name=project.name if project else None,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
        status=_invitation_status(invitation),
    )


def create_team_invitation(session: Session, team_id: str, payload: InvitationCreateRequest, actor: User) -> tuple[Invitation, str]:
    membership, project = _require_invitation_scope(session, team_id, payload.project_id, actor)
    existing_user = session.exec(select(User).where(User.email == payload.email)).first()
    if not existing_user and membership.role != TeamRole.CEO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有团队管理员可以邀请未注册邮箱创建账号")
    if payload.role == TeamRole.CEO and membership.role != TeamRole.CEO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有团队管理员可以授予团队管理员角色")
    if payload.project_role == ProjectRole.OWNER and membership.role != TeamRole.CEO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有团队管理员可以授予项目所有者角色")
    if existing_user:
        if project and session.get(ProjectMember, (project.id, existing_user.id)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该账号已经是项目成员")
        if not project and session.get(TeamMember, (team_id, existing_user.id)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该账号已经是团队成员")

    now = utc_now()
    for existing in session.exec(select(Invitation).where(Invitation.team_id == team_id, Invitation.email == payload.email)).all():
        if not existing.accepted_at and not existing.revoked_at:
            existing.revoked_at = now
            session.add(existing)

    raw_token = secrets.token_urlsafe(32)
    invitation = Invitation(
        id=f"invite-{uuid4().hex}",
        team_id=team_id,
        email=payload.email,
        role=payload.role,
        project_id=payload.project_id,
        project_role=payload.project_role or (ProjectRole.MEMBER if payload.project_id else None),
        token_hash=_token_hash(raw_token),
        invited_by=actor.id,
        expires_at=now + timedelta(hours=INVITATION_TTL_HOURS),
    )
    session.add(invitation)
    session.add(AuditEvent(id=f"audit-{uuid4().hex}", actor_id=actor.id, resource_type="invitation", resource_id=invitation.id, action="CREATED", detail_json="{}"))
    session.commit()
    session.refresh(invitation)
    return invitation, raw_token


def list_team_invitations(session: Session, team_id: str, actor: User) -> list[InvitationAdminRead]:
    membership = _require_team_member(session, team_id, actor)
    statement = select(Invitation).where(Invitation.team_id == team_id)
    if membership.role != TeamRole.CEO:
        statement = statement.where(Invitation.invited_by == actor.id)
    rows = session.exec(statement.order_by(Invitation.created_at.desc())).all()
    return [_invitation_admin_read(session, invitation) for invitation in rows]


def revoke_team_invitation(session: Session, team_id: str, invitation_id: str, actor: User) -> InvitationAdminRead:
    membership = _require_team_member(session, team_id, actor)
    invitation = session.get(Invitation, invitation_id)
    if not invitation or invitation.team_id != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="邀请不存在")
    if membership.role != TeamRole.CEO and invitation.invited_by != actor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能管理自己发出的邀请")
    current_status = _invitation_status(invitation)
    if current_status == "ACCEPTED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="已接受的邀请不能撤销")
    if current_status == "PENDING":
        invitation.revoked_at = utc_now()
        session.add(invitation)
        session.add(AuditEvent(id=f"audit-{uuid4().hex}", actor_id=actor.id, resource_type="invitation", resource_id=invitation.id, action="REVOKED", detail_json="{}"))
        session.commit()
        session.refresh(invitation)
    return _invitation_admin_read(session, invitation)


def change_user_password(session: Session, user: User, payload: ChangePasswordRequest) -> TokenResponse:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前密码不正确")
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="新密码不能与当前密码相同")
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    session.add(user)
    session.add(AuditEvent(id=f"audit-{uuid4().hex}", actor_id=user.id, resource_type="user", resource_id=user.id, action="PASSWORD_CHANGED", detail_json="{}"))
    session.commit()
    session.refresh(user)
    access_token, expires_in = create_access_token(user.id, user.token_version)
    return TokenResponse(access_token=access_token, expires_in=expires_in, user=UserRead(id=user.id, email=user.email, name=user.name, role=user.role))


def invitation_public_read(session: Session, token: str) -> InvitationPublicRead:
    invitation = _pending_invitation(session, token)
    team = session.get(Team, invitation.team_id)
    inviter = session.get(User, invitation.invited_by)
    project = session.get(Project, invitation.project_id) if invitation.project_id else None
    return InvitationPublicRead(
        email=invitation.email,
        team_name=team.name if team else "未知团队",
        inviter_name=inviter.name if inviter else "团队管理员",
        account_exists=session.exec(select(User).where(User.email == invitation.email)).first() is not None,
        role=invitation.role,
        project_name=project.name if project else None,
        expires_at=invitation.expires_at,
    )


def accept_existing_invitation(session: Session, token: str, actor: User) -> InvitationAdminRead:
    invitation = _pending_invitation(session, token)
    if actor.email.lower() != invitation.email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="该邀请不属于当前登录账号")
    team_membership = session.get(TeamMember, (invitation.team_id, actor.id))
    project_membership = session.get(ProjectMember, (invitation.project_id, actor.id)) if invitation.project_id else None
    if invitation.project_id and project_membership:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前账号已经是项目成员")
    if not invitation.project_id and team_membership:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="当前账号已经是团队成员")

    if not team_membership:
        session.add(TeamMember(team_id=invitation.team_id, user_id=actor.id, role=invitation.role))
    if invitation.project_id:
        session.add(ProjectMember(
            project_id=invitation.project_id,
            user_id=actor.id,
            role=invitation.project_role or ProjectRole.MEMBER,
        ))
    invitation.accepted_at = utc_now()
    session.add(invitation)
    session.add(AuditEvent(
        id=f"audit-{uuid4().hex}",
        actor_id=actor.id,
        resource_type="invitation",
        resource_id=invitation.id,
        action="ACCEPTED_EXISTING_ACCOUNT",
        detail_json="{}",
    ))
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邀请已被使用或账号已加入团队") from exc
    session.refresh(invitation)
    return _invitation_admin_read(session, invitation)


def accept_invitation(session: Session, token: str, payload: InvitationAcceptRequest) -> TokenResponse:
    invitation = _pending_invitation(session, token)
    if session.exec(select(User).where(User.email == invitation.email)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已经注册，请直接登录")

    user = User(
        id=f"user-{uuid4().hex}",
        email=invitation.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
        role=invitation.role,
    )
    session.add(user)
    session.flush()
    session.add(TeamMember(team_id=invitation.team_id, user_id=user.id, role=invitation.role))
    if invitation.project_id:
        session.add(ProjectMember(project_id=invitation.project_id, user_id=user.id, role=invitation.project_role or ProjectRole.MEMBER))
    invitation.accepted_at = utc_now()
    session.add(invitation)
    session.add(AuditEvent(id=f"audit-{uuid4().hex}", actor_id=user.id, resource_type="invitation", resource_id=invitation.id, action="ACCEPTED", detail_json="{}"))
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邀请已被使用或该邮箱已经注册") from exc

    access_token, expires_in = create_access_token(user.id, user.token_version)
    return TokenResponse(access_token=access_token, expires_in=expires_in, user=UserRead(id=user.id, email=user.email, name=user.name, role=user.role))


def readable_teams(session: Session, user: User) -> list[TeamRead]:
    own_memberships = {
        membership.team_id: membership
        for membership in session.exec(select(TeamMember).where(TeamMember.user_id == user.id)).all()
    }
    rows: list[TeamRead] = []
    for team in session.exec(select(Team).order_by(Team.created_at.asc())).all():
        own = own_memberships.get(team.id)
        memberships = session.exec(select(TeamMember).where(TeamMember.team_id == team.id)).all()
        member_rows: list[TeamMemberRead] = []
        for membership in memberships:
            member = session.get(User, membership.user_id)
            if member:
                member_rows.append(TeamMemberRead(id=member.id, email=member.email, name=member.name, role=membership.role, is_active=member.is_active))
        projects = session.exec(select(Project).where(Project.team_id == team.id)).all()
        rows.append(TeamRead(id=team.id, name=team.name, role=own.role if own else None, members=member_rows, project_names=[project.name for project in projects]))
    return rows


def bootstrap_admin(session: Session, email: str, name: str, password: str, team_name: str) -> User:
    if session.exec(select(User)).first():
        raise ValueError("数据库中已存在用户，不能再次执行首次管理员初始化")
    normalized_email = email.strip().lower()
    if "@" not in normalized_email:
        raise ValueError("邮箱格式无效")
    if len(password) < 10 or len(password.encode("utf-8")) > 72 or not any(character.isalpha() for character in password) or not any(character.isdigit() for character in password):
        raise ValueError("密码至少 10 位，并且必须同时包含字母和数字")
    user = User(id=f"user-{uuid4().hex}", email=normalized_email, password_hash=hash_password(password), name=name.strip(), role=TeamRole.CEO)
    team = Team(id=f"team-{uuid4().hex}", name=team_name.strip())
    session.add_all([user, team])
    session.flush()
    session.add(TeamMember(team_id=team.id, user_id=user.id, role=TeamRole.CEO))
    session.commit()
    session.refresh(user)
    return user
