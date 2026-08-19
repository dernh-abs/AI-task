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


def test_manual_task_submission_review_and_idempotency() -> None:
    with TestClient(app) as client:
        member_login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        member_headers = {"Authorization": f"Bearer {member_login['access_token']}"}
        start = client.post("/api/tasks/t-mvp-2/actions/START", headers={**member_headers, "Idempotency-Key": "start-t-mvp-2"}, json={"expected_version": 1})
        assert start.status_code == 200
        assert start.json()["task"]["status"] == "IN_PROGRESS"
        assert start.json()["task"]["version"] == 2

        empty = client.post("/api/tasks/t-mvp-2/actions/SUBMIT", headers={**member_headers, "Idempotency-Key": "empty-t-mvp-2"}, json={"expected_version": 2})
        assert empty.status_code == 422
        assert empty.json()["detail"]["code"] == "EMPTY_SUBMISSION"

        payload = {"expected_version": 2, "summary": "已完成真实 API 和前端只读贯通。", "external_url": "https://example.com/result"}
        submit = client.post("/api/tasks/t-mvp-2/actions/SUBMIT", headers={**member_headers, "Idempotency-Key": "submit-t-mvp-2"}, json=payload)
        assert submit.status_code == 200
        assert submit.json()["task"]["status"] == "WAITING_REVIEW"
        assert submit.json()["task"]["version"] == 3

        replay = client.post("/api/tasks/t-mvp-2/actions/SUBMIT", headers={**member_headers, "Idempotency-Key": "submit-t-mvp-2"}, json=payload)
        assert replay.status_code == 200
        assert replay.json()["idempotent_replay"] is True

        forbidden = client.post("/api/tasks/t-mvp-2/actions/APPROVE", headers={**member_headers, "Idempotency-Key": "approve-member"}, json={"expected_version": 3})
        assert forbidden.status_code == 403

        ceo_login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        ceo_headers = {"Authorization": f"Bearer {ceo_login['access_token']}"}
        approve = client.post("/api/tasks/t-mvp-2/actions/APPROVE", headers={**ceo_headers, "Idempotency-Key": "approve-t-mvp-2"}, json={"expected_version": 3})
        assert approve.status_code == 200
        assert approve.json()["task"]["status"] == "DONE"
        assert approve.json()["task"]["progress"] == 100

        submissions = client.get("/api/tasks/t-mvp-2/submissions", headers=member_headers)
        assert submissions.status_code == 200
        assert len(submissions.json()) == 1
        history = client.get("/api/tasks/t-mvp-2/history", headers=member_headers)
        assert [item["action"] for item in history.json()] == ["APPROVE", "SUBMIT", "START"]


def test_version_conflict_is_rejected() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}", "Idempotency-Key": "stale-task-version"}
        response = client.post("/api/tasks/t-mvp-1/actions/SUBMIT", headers=headers, json={"expected_version": 999, "summary": "不会被接受"})
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "VERSION_CONFLICT"
