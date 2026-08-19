import atexit
import os
import tempfile
import uuid
from pathlib import Path

from fastapi.testclient import TestClient


test_db = Path(tempfile.gettempdir()) / f"quanyi-mvp-test-{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db.as_posix()}"
os.environ["SEED_DEMO_DATA"] = "true"
from app.main import app
from app.database import engine


def cleanup_test_database() -> None:
    engine.dispose()
    test_db.unlink(missing_ok=True)


atexit.register(cleanup_test_database)


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_login_and_read_projects() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"})
        assert login.status_code == 200
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        projects = client.get("/api/projects", headers=headers)
        assert projects.status_code == 200
        assert projects.json()[0]["name"] == "全意 AI 工作中枢"
        tasks = client.get("/api/tasks", headers=headers)
        assert tasks.status_code == 200
        assert len(tasks.json()) >= 2


def test_protected_endpoint_requires_login() -> None:
    with TestClient(app) as client:
        assert client.get("/api/projects").status_code == 401


def test_non_project_member_cannot_see_project_data() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "observer@quanyi.local", "password": "mvp-observer-2026"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/projects", headers=headers).json() == []
        assert client.get("/api/tasks", headers=headers).json() == []
