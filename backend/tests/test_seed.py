from sqlmodel import Session, SQLModel, create_engine, select

import app.seed as seed_module
from app.models import ExternalContact, Project, Task, Team, User
from app.security import hash_password


def test_seed_is_idempotent_and_recovers_from_unrelated_existing_user(tmp_path, monkeypatch) -> None:
    test_engine = create_engine(f"sqlite:///{(tmp_path / 'seed.db').as_posix()}")
    SQLModel.metadata.create_all(test_engine)
    monkeypatch.setattr(seed_module, "engine", test_engine)

    with Session(test_engine) as session:
        session.add(
            User(
                id="unrelated-user",
                email="unrelated@example.com",
                password_hash=hash_password("not-a-demo-password"),
                name="Existing user",
                role="MEMBER",
            )
        )
        session.commit()

    seed_module.seed_demo_data()
    seed_module.seed_demo_data()

    with Session(test_engine) as session:
        assert session.get(Team, "team-quanyi") is not None
        assert session.get(ExternalContact, "contact-client") is not None
        assert session.get(Project, "p-quanyi") is not None
        assert len(session.exec(select(Task).where(Task.project_id == "p-quanyi")).all()) == 2
        assert len(session.exec(select(User)).all()) == 4

    test_engine.dispose()
