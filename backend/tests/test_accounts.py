from sqlmodel import SQLModel, Session, create_engine, select

from app.accounts import bootstrap_admin
from app.models import Team, TeamMember, TeamRole, User


def test_bootstrap_admin_only_works_for_empty_database(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'bootstrap.db').as_posix()}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        user = bootstrap_admin(session, "OWNER@EXAMPLE.COM", "负责人", "safe-password-2026", "真实团队")
        assert user.email == "owner@example.com"
        assert user.role == TeamRole.CEO
        assert session.exec(select(Team)).one().name == "真实团队"
        membership = session.exec(select(TeamMember)).one()
        assert membership.user_id == user.id
        assert membership.role == TeamRole.CEO
        assert session.exec(select(User)).one().is_active is True

        try:
            bootstrap_admin(session, "second@example.com", "第二人", "safe-password-2026", "另一个团队")
        except ValueError as exc:
            assert "已存在用户" in str(exc)
        else:
            raise AssertionError("bootstrap_admin should reject a non-empty database")
