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
from app.models import Project, Team, User
from sqlalchemy import event
from sqlmodel import Session


@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def cleanup_test_database() -> None:
    engine.dispose()
    test_db.unlink(missing_ok=True)


atexit.register(cleanup_test_database)


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "sqlite"}
        preflight = client.options(
            "/api/auth/login",
            headers={"Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "POST"},
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"


def test_login_and_read_projects() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"})
        assert login.status_code == 200
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        projects = client.get("/api/projects", headers=headers)
        assert projects.status_code == 200
        assert projects.json()[0]["name"] == "全意 AI 工作中枢"
        assert projects.json()[0]["health_reasons"]
        tasks = client.get("/api/tasks", headers=headers)
        assert tasks.status_code == 200
        assert len(tasks.json()) >= 2


def test_protected_endpoint_requires_login() -> None:
    with TestClient(app) as client:
        assert client.get("/api/projects").status_code == 401


def test_team_member_can_read_all_team_projects_without_project_membership() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "observer@quanyi.local", "password": "mvp-observer-2026"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        projects = client.get("/api/projects", headers=headers)
        tasks = client.get("/api/tasks", headers=headers)
        assert projects.status_code == 200
        assert any(item["id"] == "p-quanyi" for item in projects.json())
        assert tasks.status_code == 200
        assert any(item["project_id"] == "p-quanyi" for item in tasks.json())
        assert client.patch("/api/projects/p-quanyi", headers=headers, json={"name": "不允许普通成员改名"}).status_code == 403
        assert client.post("/api/projects/p-quanyi/stages", headers=headers, json={"name": "不允许普通成员创建阶段", "owner_id": "u-observer"}).status_code == 403


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
        assert submissions.json()[0]["created_at"].endswith(("Z", "+00:00"))
        history = client.get("/api/tasks/t-mvp-2/history", headers=member_headers)
        assert [item["action"] for item in history.json()] == ["APPROVE", "SUBMIT", "RETURN", "SUBMIT", "START"]
        assert history.json()[0]["created_at"].endswith(("Z", "+00:00"))
        contributions = client.get("/api/contributions", headers=member_headers).json()
        assert len([item for item in contributions if item["task_id"] == "t-mvp-2"]) == 1
        assert contributions[0]["created_at"].endswith(("Z", "+00:00"))


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
        revision_instruction = "压缩为三点，并补充风险和验收标准"
        revised = client.post("/api/tasks/t-mvp-1/actions/REVISE_AI", headers={**member_headers, "Idempotency-Key": "revise-ai-output"}, json={"expected_version": task["version"], "agent_run_id": run["id"], "reason": revision_instruction})
        assert revised.status_code == 200
        assert revised.json()["task"]["status"] == "IN_PROGRESS"
        rerun = client.post("/api/tasks/t-mvp-1/agent-runs", headers=member_headers, json={"revision_instruction": revision_instruction})
        assert rerun.status_code == 200
        revised_run = rerun.json()["run"]
        assert revised_run["id"] != run["id"]
        assert revision_instruction in revised_run["output_text"]
        assert rerun.json()["idempotent_replay"] is False
        rerun_replay = client.post("/api/tasks/t-mvp-1/agent-runs", headers=member_headers, json={"revision_instruction": revision_instruction})
        assert rerun_replay.json()["idempotent_replay"] is True
        task = next(item for item in client.get("/api/tasks", headers=member_headers).json() if item["id"] == "t-mvp-1")
        assert task["status"] == "WAITING_HUMAN_CONFIRMATION"
        confirmed = client.post("/api/tasks/t-mvp-1/actions/CONFIRM_AI", headers={**member_headers, "Idempotency-Key": "confirm-ai-output"}, json={"expected_version": task["version"], "agent_run_id": revised_run["id"]})
        assert confirmed.status_code == 200
        assert confirmed.json()["task"]["status"] == "WAITING_REVIEW"
        submissions = client.get("/api/tasks/t-mvp-1/submissions", headers=member_headers).json()
        assert submissions[0]["asset_reference"] == f"agent-run:{revised_run['id']}"


def test_global_agent_run_list_uses_real_records_and_permissions() -> None:
    with TestClient(app) as client:
        member_login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        headers = {"Authorization": f"Bearer {member_login['access_token']}"}
        created = client.post("/api/tasks", headers=headers, json={"project_id": "p-quanyi", "title": "全局运行列表验证", "description": "验证执行中心读取真实运行", "deliverable": "真实 AgentRun", "acceptance": "刷新后可读取", "owner_id": "u-member", "reviewer_id": "u-ceo", "execution_mode": "AI"})
        assert created.status_code == 200
        task_id = created.json()["id"]
        assert client.post(f"/api/tasks/{task_id}/actions/START", headers={**headers, "Idempotency-Key": "global-run-start"}, json={"expected_version": 1}).status_code == 200
        started = client.post(f"/api/tasks/{task_id}/agent-runs", headers=headers)
        assert started.status_code == 200
        run_id = started.json()["run"]["id"]

        listed = client.get("/api/agent-runs", headers=headers)
        assert listed.status_code == 200
        run = next(item for item in listed.json() if item["id"] == run_id)
        assert run["task_title"] == "全局运行列表验证"
        assert run["project_id"] == "p-quanyi"
        assert run["project_name"] == "全意 AI 工作中枢"
        assert run["requested_by_name"] == "廖婉琛"
        assert client.get("/api/agent-runs?status=SUCCEEDED", headers=headers).status_code == 200
        assert client.get("/api/agent-runs?status=UNKNOWN", headers=headers).status_code == 422

        observer_login = client.post("/api/auth/login", json={"email": "observer@quanyi.local", "password": "mvp-observer-2026"}).json()
        observer_headers = {"Authorization": f"Bearer {observer_login['access_token']}"}
        observer_runs = client.get("/api/agent-runs", headers=observer_headers)
        assert observer_runs.status_code == 200
        assert any(item["id"] == run_id for item in observer_runs.json())
        assert client.get("/api/agent-runs?project_id=p-quanyi", headers=observer_headers).status_code == 200


def test_project_chat_is_persistent_grounded_and_idempotent() -> None:
    with TestClient(app) as client:
        member_login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        headers = {"Authorization": f"Bearer {member_login['access_token']}"}
        created = client.post("/api/projects/p-quanyi/conversations", headers=headers, json={"title": "新对话"})
        assert created.status_code == 200
        conversation_id = created.json()["id"]
        sent = client.post(f"/api/project-conversations/{conversation_id}/messages", headers={**headers, "Idempotency-Key": "project-chat-send-1"}, json={"content": "当前项目有哪些需要优先处理的任务？"})
        assert sent.status_code == 200
        body = sent.json()
        assert body["assistant_message"]["execution_mode"] == "MOCK"
        assert body["assistant_message"]["prompt_version"] == "project-chat-v1"
        assert body["assistant_message"]["context_task_ids"]
        assert body["assistant_message"]["context_task_titles"]
        assert "会议和资产尚未接入" in body["assistant_message"]["content"]

        replay = client.post(f"/api/project-conversations/{conversation_id}/messages", headers={**headers, "Idempotency-Key": "project-chat-send-1"}, json={"content": "当前项目有哪些需要优先处理的任务？"})
        assert replay.status_code == 200
        assert replay.json()["assistant_message"]["id"] == body["assistant_message"]["id"]
        messages = client.get(f"/api/project-conversations/{conversation_id}/messages", headers=headers)
        assert messages.status_code == 200
        assert len(messages.json()) == 2
        conversations = client.get("/api/projects/p-quanyi/conversations", headers=headers).json()
        assert conversations[0]["message_count"] == 2
        assert conversations[0]["title"].startswith("当前项目有哪些")

        observer_login = client.post("/api/auth/login", json={"email": "observer@quanyi.local", "password": "mvp-observer-2026"}).json()
        observer_headers = {"Authorization": f"Bearer {observer_login['access_token']}"}
        assert client.get(f"/api/project-conversations/{conversation_id}/messages", headers=observer_headers).status_code == 200
        assert client.post("/api/projects/p-quanyi/conversations", headers=observer_headers, json={"title": "团队协作对话"}).status_code == 200


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


def test_project_owner_selection_and_stage_status_progress() -> None:
    with TestClient(app) as client:
        ceo_login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        headers = {"Authorization": f"Bearer {ceo_login['access_token']}"}
        created = client.post(
            "/api/projects",
            headers=headers,
            json={"team_id": "team-quanyi", "name": "负责人选择项目", "client": "内部", "owner_id": "u-member"},
        )
        assert created.status_code == 200
        project = created.json()
        assert project["owner_id"] == "u-member"
        assert project["owner_name"] == "廖婉琛"

        member_login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        member_headers = {"Authorization": f"Bearer {member_login['access_token']}"}
        assert any(item["id"] == project["id"] for item in client.get("/api/projects", headers=member_headers).json())

        invalid = client.post(
            "/api/projects",
            headers=headers,
            json={"team_id": "team-quanyi", "name": "非法负责人", "client": "内部", "owner_id": "missing-user"},
        )
        assert invalid.status_code == 422

        staged = client.post(
            f"/api/projects/{project['id']}/stages",
            headers=headers,
            json={"name": "空阶段", "owner_id": "u-member", "weight": 1},
        )
        assert staged.status_code == 200
        stage_id = staged.json()["stages"][0]["id"]
        assert staged.json()["progress"] == 0
        active = client.patch(f"/api/stages/{stage_id}", headers=headers, json={"status": "ACTIVE"})
        assert active.json()["progress"] == 10
        reviewing = client.patch(f"/api/stages/{stage_id}", headers=headers, json={"status": "WAITING_REVIEW"})
        assert reviewing.json()["progress"] == 90
        done = client.patch(f"/api/stages/{stage_id}", headers=headers, json={"status": "DONE"})
        assert done.json()["progress"] == 100


def test_unstaged_task_is_included_when_project_has_stages() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        project = client.post("/api/projects", headers=headers, json={"name": "未归阶段任务聚合", "client": "内部"}).json()
        stage = client.post(
            f"/api/projects/{project['id']}/stages",
            headers=headers,
            json={"name": "已完成阶段", "owner_id": "u-ceo", "weight": 1},
        ).json()["stages"][0]
        client.patch(f"/api/stages/{stage['id']}", headers=headers, json={"status": "ACTIVE"})
        client.patch(f"/api/stages/{stage['id']}", headers=headers, json={"status": "WAITING_REVIEW"})
        client.patch(f"/api/stages/{stage['id']}", headers=headers, json={"status": "DONE"})
        task = client.post(
            "/api/tasks",
            headers=headers,
            json={"project_id": project["id"], "stage_id": None, "title": "未归阶段任务", "deliverable": "结果", "acceptance": "验收", "owner_id": "u-ceo", "reviewer_id": "u-ceo", "execution_mode": "HUMAN"},
        ).json()
        assert client.get(f"/api/projects/{project['id']}", headers=headers).json()["progress"] == 50
        client.post(f"/api/tasks/{task['id']}/actions/START", headers={**headers, "Idempotency-Key": "unstaged-start"}, json={"expected_version": 1})
        client.post(f"/api/tasks/{task['id']}/actions/SUBMIT", headers={**headers, "Idempotency-Key": "unstaged-submit"}, json={"expected_version": 2, "summary": "完成"})
        client.post(f"/api/tasks/{task['id']}/actions/APPROVE", headers={**headers, "Idempotency-Key": "unstaged-approve"}, json={"expected_version": 3})
        assert client.get(f"/api/projects/{project['id']}", headers=headers).json()["progress"] == 100


def test_invitation_activation_and_real_team_membership() -> None:
    with TestClient(app) as client:
        ceo_login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        ceo_headers = {"Authorization": f"Bearer {ceo_login['access_token']}"}
        created = client.post(
            "/api/teams/team-quanyi/invitations",
            headers=ceo_headers,
            json={"email": "new.member@quanyi.local", "role": "MEMBER", "project_id": "p-quanyi", "project_role": "MEMBER"},
        )
        assert created.status_code == 200
        token = created.json()["activation_token"]
        inspected = client.get(f"/api/invitations/{token}")
        assert inspected.status_code == 200
        assert inspected.json()["team_name"] == "全意团队"
        assert inspected.json()["project_name"] == "全意 AI 工作中枢"

        activated = client.post(f"/api/invitations/{token}/accept", json={"name": "新成员", "password": "secure-member-2026"})
        assert activated.status_code == 200
        member_headers = {"Authorization": f"Bearer {activated.json()['access_token']}"}
        teams = client.get("/api/teams", headers=member_headers)
        assert teams.status_code == 200
        assert teams.json()[0]["name"] == "全意团队"
        assert any(member["email"] == "new.member@quanyi.local" for member in teams.json()[0]["members"])
        assert client.get("/api/projects", headers=member_headers).json()[0]["id"] == "p-quanyi"
        project_members = client.get("/api/projects/p-quanyi/members", headers=member_headers)
        assert project_members.status_code == 200
        assert any(member["email"] == "new.member@quanyi.local" for member in project_members.json())
        assert client.post(f"/api/invitations/{token}/accept", json={"name": "重复成员", "password": "secure-member-2026"}).status_code == 410


def test_non_admin_cannot_invite_team_member() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        response = client.post("/api/teams/team-quanyi/invitations", headers=headers, json={"email": "blocked@quanyi.local"})
        assert response.status_code == 403


def test_global_ceo_role_does_not_cross_team_boundary() -> None:
    with Session(engine) as session:
        observer = session.get(User, "u-observer")
        assert observer is not None
        session.add(Team(id="team-isolated", name="隔离团队"))
        session.flush()
        session.add(Project(id="project-isolated", team_id="team-isolated", name="隔离项目", client="内部", objective="权限隔离", owner_id=observer.id))
        session.commit()

    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        assert client.get("/api/projects/project-isolated", headers=headers).status_code == 403
        assert client.post("/api/teams/team-isolated/invitations", headers=headers, json={"email": "isolated@quanyi.local"}).status_code == 403
        assert client.post("/api/projects", headers=headers, json={"team_id": "team-isolated", "name": "越权项目"}).status_code == 403


def test_team_admin_can_list_and_revoke_pending_invitation() -> None:
    with TestClient(app) as client:
        ceo_login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        ceo_headers = {"Authorization": f"Bearer {ceo_login['access_token']}"}
        created = client.post(
            "/api/teams/team-quanyi/invitations",
            headers=ceo_headers,
            json={"email": "revoked.member@quanyi.local", "role": "MEMBER"},
        )
        assert created.status_code == 200
        invitation_id = created.json()["id"]
        token = created.json()["activation_token"]

        listed = client.get("/api/teams/team-quanyi/invitations", headers=ceo_headers)
        assert listed.status_code == 200
        pending = next(item for item in listed.json() if item["id"] == invitation_id)
        assert pending["status"] == "PENDING"
        assert pending["email"] == "revoked.member@quanyi.local"
        assert "activation_token" not in pending

        revoked = client.post(f"/api/teams/team-quanyi/invitations/{invitation_id}/revoke", headers=ceo_headers)
        assert revoked.status_code == 200
        assert revoked.json()["status"] == "REVOKED"
        assert client.get(f"/api/invitations/{token}").status_code == 410

        member_login = client.post("/api/auth/login", json={"email": "member@quanyi.local", "password": "mvp-member-2026"}).json()
        member_headers = {"Authorization": f"Bearer {member_login['access_token']}"}
        assert client.get("/api/teams/team-quanyi/invitations", headers=member_headers).status_code == 403
        assert client.post(f"/api/teams/team-quanyi/invitations/{invitation_id}/revoke", headers=member_headers).status_code == 403


def test_password_change_rotates_token_and_rejects_old_password() -> None:
    with TestClient(app) as client:
        ceo_login = client.post("/api/auth/login", json={"email": "ceo@quanyi.local", "password": "mvp-ceo-2026"}).json()
        ceo_headers = {"Authorization": f"Bearer {ceo_login['access_token']}"}
        created = client.post(
            "/api/teams/team-quanyi/invitations",
            headers=ceo_headers,
            json={"email": "password.member@quanyi.local", "role": "MEMBER"},
        ).json()
        activated = client.post(
            f"/api/invitations/{created['activation_token']}/accept",
            json={"name": "改密成员", "password": "initial-password-2026"},
        )
        original_token = activated.json()["access_token"]
        original_headers = {"Authorization": f"Bearer {original_token}"}

        wrong = client.post(
            "/api/auth/change-password",
            headers=original_headers,
            json={"current_password": "wrong-password-2026", "new_password": "updated-password-2026"},
        )
        assert wrong.status_code == 400
        same = client.post(
            "/api/auth/change-password",
            headers=original_headers,
            json={"current_password": "initial-password-2026", "new_password": "initial-password-2026"},
        )
        assert same.status_code == 422

        changed = client.post(
            "/api/auth/change-password",
            headers=original_headers,
            json={"current_password": "initial-password-2026", "new_password": "updated-password-2026"},
        )
        assert changed.status_code == 200
        replacement_headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
        assert client.get("/api/auth/me", headers=replacement_headers).status_code == 200
        assert client.get("/api/auth/me", headers=original_headers).status_code == 401
        assert client.post("/api/auth/login", json={"email": "password.member@quanyi.local", "password": "initial-password-2026"}).status_code == 401
        assert client.post("/api/auth/login", json={"email": "password.member@quanyi.local", "password": "updated-password-2026"}).status_code == 200
