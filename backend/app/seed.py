from __future__ import annotations

from sqlmodel import Session, select

from .database import engine
from .models import ExecutionMode, ExternalContact, Project, ProjectMember, ProjectRole, Stage, StageStatus, Task, TaskStatus, Team, TeamMember, TeamRole, User
from .security import hash_password


def seed_demo_data() -> None:
    with Session(engine) as session:
        if session.exec(select(User)).first():
            if session.get(Team, "team-quanyi") and not session.get(ExternalContact, "contact-client"):
                session.add(ExternalContact(id="contact-client", team_id="team-quanyi", name="客户联系人", organization="客户方", channel="企业微信"))
                session.commit()
            return
        member = User(id="u-member", email="member@quanyi.local", password_hash=hash_password("mvp-member-2026"), name="廖婉琛", role=TeamRole.MEMBER)
        ceo = User(id="u-ceo", email="ceo@quanyi.local", password_hash=hash_password("mvp-ceo-2026"), name="徐泉", role=TeamRole.CEO)
        observer = User(id="u-observer", email="observer@quanyi.local", password_hash=hash_password("mvp-observer-2026"), name="观察成员", role=TeamRole.MEMBER)
        team = Team(id="team-quanyi", name="全意团队")
        project = Project(id="p-quanyi", team_id=team.id, name="全意 AI 工作中枢", client="全意内部", objective="建立人、AI 与外部协作对象共享的可信任务闭环", owner_id=ceo.id, next_milestone="完成 MVP 人工任务闭环")
        stage = Stage(id="s-quanyi-1", project_id=project.id, name="需求澄清", position=1, status=StageStatus.ACTIVE, owner_id=member.id, weight=1.0)
        tasks = [
            Task(id="t-mvp-1", project_id=project.id, stage_id=stage.id, title="冻结 MVP 状态机和权限矩阵", description="将产品规则转化为可测试的领域契约。", deliverable="状态机、权限矩阵与验收场景", acceptance="非法状态流转可被明确拒绝", owner_id=member.id, reviewer_id=ceo.id, status=TaskStatus.IN_PROGRESS, execution_mode=ExecutionMode.HUMAN, priority="HIGH", progress=45, source="MVP 规划"),
            Task(id="t-mvp-2", project_id=project.id, stage_id=stage.id, title="打通前后端只读数据", description="登录后从真实数据库读取项目和任务。", deliverable="可运行的只读 API 与前端接入", acceptance="刷新后数据不丢且越权请求被拒绝", owner_id=member.id, reviewer_id=ceo.id, status=TaskStatus.TODO, execution_mode=ExecutionMode.HYBRID, priority="HIGH", progress=0, source="阶段 1"),
        ]
        session.add_all([member, ceo, observer, team, ExternalContact(id="contact-client", team_id=team.id, name="客户联系人", organization="客户方", channel="企业微信"), TeamMember(team_id=team.id, user_id=member.id, role=TeamRole.MEMBER), TeamMember(team_id=team.id, user_id=ceo.id, role=TeamRole.CEO), TeamMember(team_id=team.id, user_id=observer.id, role=TeamRole.MEMBER), project, ProjectMember(project_id=project.id, user_id=member.id, role=ProjectRole.MEMBER), ProjectMember(project_id=project.id, user_id=ceo.id, role=ProjectRole.OWNER), stage, *tasks])
        session.commit()
