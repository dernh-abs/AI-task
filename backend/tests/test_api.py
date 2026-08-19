import atexit
import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient


test_db = Path(tempfile.gettempdir()) / f"quanyi-mvp-test-{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db.as_posix()}"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["AUTO_CREATE_SCHEMA"] = "true"
from app.main import app
from app.database import engine
from app.external_reminders import reminder_level, scan_external_reminders
from sqlmodel import Session


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
        returned = client.post("/api/tasks/t-mvp-2/actions/RETURN", headers={**ceo_headers, "Idempotency-Key": "return-t-mvp-2"}, json={"expected_version": 3, "reason": "请补充权限验证结果"})
        assert returned.status_code == 200
        assert returned.json()["task"]["status"] == "IN_PROGRESS"
        resubmit = client.post("/api/tasks/t-mvp-2/actions/SUBMIT", headers={**member_headers, "Idempotency-Key": "resubmit-t-mvp-2"}, json={"expected_version": 4, "summary": "已补充权限验证和越权拒绝结果。"})
        assert resubmit.status_code == 200
        approve = client.post("/api/tasks/t-mvp-2/actions/APPROVE", headers={**ceo_headers, "Idempotency-Key": "approve-t-mvp-2"}, json={"expected_version": 5})
        assert approve.status_code == 200
        assert approve.json()["task"]["status"] == "DONE"
        assert approve.json()["task"]["progress"] == 100

        submissions = client.get("/api/tasks/t-mvp-2/submissions", headers=member_headers)
        assert submissions.status_code == 200
        assert len(submissions.json()) == 2
        history = client.get("/api/tasks/t-mvp-2/history", headers=member_headers)
        assert [item["action"] for item in history.json()] == ["APPROVE", "SUBMIT", "RETURN", "SUBMIT", "START"]
        contributions = client.get("/api/contributions", headers=member_headers).json()
        assert len([item for item in contributions if item["task_id"] == "t-mvp-2"]) == 1


def test_version_conflict_is_rejected() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}", "Idempotency-Key": "stale-task-version"}
        response = client.post("/api/tasks/t-mvp-1/actions/SUBMIT", headers=headers, json={"expected_version": 999, "summary": "不会被接受"})
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "VERSION_CONFLICT"


def test_waiting_external_reminder_and_resume_flow() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        incomplete = client.post("/api/tasks/t-mvp-1/actions/WAIT_EXTERNAL", headers={**headers, "Idempotency-Key": "external-incomplete"}, json={"expected_version": 1})
        assert incomplete.status_code == 422
        expected_at = datetime.now(timezone.utc) + timedelta(hours=2)
        wait = client.post("/api/tasks/t-mvp-1/actions/WAIT_EXTERNAL", headers={**headers, "Idempotency-Key": "external-create-1"}, json={"expected_version": 1, "contact_id": "contact-client", "item": "客户确认首页文案", "expected_at": expected_at.isoformat(), "internal_followup_user_id": "u-member", "recovery_action": "收到确认后继续制作页面"})
        assert wait.status_code == 200
        assert wait.json()["task"]["status"] == "WAITING_EXTERNAL"
        assert wait.json()["task"]["progress"] == 45
        now = datetime.now(timezone.utc)
        assert reminder_level(now + timedelta(hours=25), now) == "NORMAL"
        assert reminder_level(now + timedelta(hours=24), now) == "UPCOMING"
        assert reminder_level(now - timedelta(seconds=1), now) == "OVERDUE"
        assert client.get("/api/projects", headers=headers).json()[0]["health"] == "有风险"
        dependency = client.get("/api/tasks/t-mvp-1/external-dependency", headers=headers).json()
        assert dependency["reminder_level"] == "UPCOMING"
        with Session(engine) as session:
            assert len(scan_external_reminders(session)) == 1
            assert len(scan_external_reminders(session)) == 0
        assert len(client.get("/api/external-reminders", headers=headers).json()) == 1
        resume = client.post("/api/tasks/t-mvp-1/actions/RESUME_EXTERNAL", headers={**headers, "Idempotency-Key": "external-resume-1"}, json={"expected_version": 2})
        assert resume.status_code == 200
        assert resume.json()["task"]["status"] == "IN_PROGRESS"
        restored = client.get("/api/tasks/t-mvp-1/external-dependency", headers=headers).json()
        assert restored["external_feedback_status"] == "RECEIVED"
        assert restored["actual_received_at"] is not None
        assert client.get("/api/projects", headers=headers).json()[0]["health"] == "正常"


def test_candidate_extraction_edit_confirm_and_idempotency() -> None:
    with TestClient(app) as client:
        ceo_login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        ceo_headers = {"Authorization": f"Bearer {ceo_login['access_token']}"}
        extraction_payload = {"project_id": "p-quanyi", "source_type": "MEETING", "title": "阶段四评审", "content": "整理候选任务接口\n补充人工确认流程"}
        extraction = client.post("/api/candidate-extractions", headers=ceo_headers, json=extraction_payload)
        assert extraction.status_code == 200
        assert extraction.json()["execution_mode"] == "MOCK"
        assert extraction.json()["degraded"] is False
        candidate = extraction.json()["candidates"][0]
        edited = client.patch(f"/api/candidates/{candidate['id']}", headers=ceo_headers, json={"expected_version": 1, "owner_id": "u-member", "reviewer_id": "u-ceo", "deliverable": "候选任务 API 与测试"})
        assert edited.status_code == 200
        assert edited.json()["version"] == 2
        confirm_headers = {**ceo_headers, "Idempotency-Key": "confirm-candidate-1"}
        confirmed = client.post(f"/api/candidates/{candidate['id']}/confirm", headers=confirm_headers, json={"expected_version": 2})
        assert confirmed.status_code == 200
        assert confirmed.json()["task"]["status"] == "PENDING_OWNER_CONFIRMATION"
        replay = client.post(f"/api/candidates/{candidate['id']}/confirm", headers=confirm_headers, json={"expected_version": 2})
        assert replay.status_code == 200
        assert replay.json()["idempotent_replay"] is True
        duplicate = client.post(f"/api/candidates/{candidate['id']}/confirm", headers={**ceo_headers, "Idempotency-Key": "confirm-candidate-2"}, json={"expected_version": 2})
        assert duplicate.status_code == 409
        cached = client.post("/api/candidate-extractions", headers=ceo_headers, json=extraction_payload)
        assert cached.json()["cached"] is True


def test_agent_run_human_confirmation_and_review() -> None:
    with TestClient(app) as client:
        member_login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        member_headers = {"Authorization": f"Bearer {member_login['access_token']}"}
        started = client.post("/api/tasks/t-mvp-1/agent-runs", headers=member_headers)
        assert started.status_code == 200
        run = started.json()["run"]
        assert run["status"] == "SUCCEEDED"
        assert run["execution_mode"] == "MOCK"
        assert run["output_text"]
        replay = client.post("/api/tasks/t-mvp-1/agent-runs", headers=member_headers)
        assert replay.status_code == 200
        assert replay.json()["idempotent_replay"] is True
        task = next(item for item in client.get("/api/tasks", headers=member_headers).json() if item["id"] == "t-mvp-1")
        assert task["status"] == "WAITING_HUMAN_CONFIRMATION"
        confirmed = client.post("/api/tasks/t-mvp-1/actions/CONFIRM_AI", headers={**member_headers, "Idempotency-Key": "confirm-ai-output"}, json={"expected_version": task["version"], "agent_run_id": run["id"]})
        assert confirmed.status_code == 200
        assert confirmed.json()["task"]["status"] == "WAITING_REVIEW"
        submissions = client.get("/api/tasks/t-mvp-1/submissions", headers=member_headers).json()
        assert submissions[0]["asset_reference"] == f"agent-run:{run['id']}"


def test_project_stage_task_crud_and_weighted_aggregation() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        project = client.post("/api/projects", headers=headers, json={"name": "聚合验收项目", "client": "内部", "objective": "验证真实聚合"})
        assert project.status_code == 200
        project_id = project.json()["id"]
        staged = client.post(f"/api/projects/{project_id}/stages", headers=headers, json={"name": "交付阶段", "owner_id": "u-ceo", "weight": 2})
        stage_id = staged.json()["stages"][0]["id"]
        assert client.patch(f"/api/stages/{stage_id}", headers=headers, json={"status": "ACTIVE"}).status_code == 200
        created = client.post("/api/tasks", headers=headers, json={"project_id": project_id, "stage_id": stage_id, "title": "完成聚合验收", "description": "执行完整人工任务", "deliverable": "验收报告", "acceptance": "状态和进度均真实", "owner_id": "u-ceo", "reviewer_id": "u-ceo", "execution_mode": "HUMAN"})
        assert created.status_code == 200
        task_id = created.json()["id"]
        assert client.post(f"/api/tasks/{task_id}/actions/START", headers={**headers, "Idempotency-Key": "aggregate-start"}, json={"expected_version": 1}).status_code == 200
        assert client.post(f"/api/tasks/{task_id}/actions/SUBMIT", headers={**headers, "Idempotency-Key": "aggregate-submit"}, json={"expected_version": 2, "summary": "聚合验收已完成"}).status_code == 200
        approved = client.post(f"/api/tasks/{task_id}/actions/APPROVE", headers={**headers, "Idempotency-Key": "aggregate-approve"}, json={"expected_version": 3})
        assert approved.status_code == 200
        aggregated = client.get(f"/api/projects/{project_id}", headers=headers).json()
        assert aggregated["progress"] == 100
        assert aggregated["stages"][0]["progress"] == 100
        assert aggregated["health"] == "正常"
        assert client.patch(f"/api/stages/{stage_id}", headers=headers, json={"status": "WAITING_REVIEW"}).status_code == 200
        assert client.patch(f"/api/stages/{stage_id}", headers=headers, json={"status": "DONE"}).status_code == 200
        contribution_rows = client.get("/api/contributions", headers=headers).json()
        assert len([item for item in contribution_rows if item["task_id"] == task_id]) == 1
