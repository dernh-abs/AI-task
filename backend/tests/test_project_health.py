from datetime import datetime, timedelta, timezone

from app.models import ExecutionMode, Task, TaskStatus
from app.services import assess_project_health


NOW = datetime(2026, 8, 21, 8, 0, tzinfo=timezone.utc)


def task(
    suffix: str,
    *,
    status: TaskStatus = TaskStatus.IN_PROGRESS,
    priority: str = "MEDIUM",
    due_at: datetime | None = None,
    updated_at: datetime = NOW,
    stage_id: str | None = "stage-1",
    owner_id: str = "owner-1",
    progress: int = 20,
) -> Task:
    return Task(
        id=f"task-{suffix}",
        project_id="project-1",
        stage_id=stage_id,
        title=f"任务 {suffix}",
        owner_id=owner_id,
        reviewer_id="reviewer-1",
        status=status,
        execution_mode=ExecutionMode.HUMAN,
        priority=priority,
        progress=progress,
        due_at=due_at,
        updated_at=updated_at,
    )


def test_unstaged_overdue_task_and_project_deadline_require_attention() -> None:
    health, reasons = assess_project_health(
        [task("overdue", due_at=NOW - timedelta(hours=1), stage_id=None)],
        [],
        NOW,
        project_due_at=NOW - timedelta(days=1),
        progress=40,
    )

    assert health == "需关注"
    assert "项目已超过截止日期" in reasons[0]
    assert any("未归阶段任务" in reason for reason in reasons)


def test_priority_staleness_review_backlog_and_owner_load_are_explained() -> None:
    tasks = [
        task("critical", priority="HIGH", due_at=NOW + timedelta(days=2)),
        task("stale", updated_at=NOW - timedelta(days=8)),
        task("review", status=TaskStatus.WAITING_REVIEW, updated_at=NOW - timedelta(days=3), progress=95),
        task("load-1"),
        task("load-2"),
        task("load-3"),
        task("load-4"),
    ]

    health, reasons = assess_project_health(tasks, [], NOW, owner_names={"owner-1": "徐泉"})

    assert health == "有风险"
    assert any("高优先级任务将在 3 天内到期" in reason for reason in reasons)
    assert any("超过 7 天没有进展更新" in reason for reason in reasons)
    assert any("等待验收超过 48 小时" in reason for reason in reasons)
    assert any("徐泉在本项目同时承担 6 个活跃任务" in reason for reason in reasons)


def test_upcoming_project_deadline_and_external_dependency_raise_risk() -> None:
    health, reasons = assess_project_health(
        [task("active")],
        ["UPCOMING"],
        NOW,
        project_due_at=NOW + timedelta(days=5),
        progress=60,
    )

    assert health == "有风险"
    assert any("项目将在 7 天内到期" in reason for reason in reasons)
    assert any("外部依赖将在 24 小时内到期" in reason for reason in reasons)


def test_clear_project_returns_normal_with_explanation() -> None:
    health, reasons = assess_project_health(
        [task("done", status=TaskStatus.DONE, progress=100)],
        [],
        NOW,
        project_due_at=NOW - timedelta(days=1),
        progress=100,
    )

    assert health == "正常"
    assert reasons == ["当前未发现逾期、阻塞、积压或负荷风险"]
