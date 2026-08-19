from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .models import ExternalDependency, ExternalFeedbackStatus, ExternalReminderEvent, Task, TaskStatus


def reminder_level(expected_at: datetime, now: datetime, received: bool = False) -> str:
    if received:
        return "RECEIVED"
    comparable = expected_at if expected_at.tzinfo else expected_at.replace(tzinfo=timezone.utc)
    if comparable < now:
        return "OVERDUE"
    if comparable <= now + timedelta(hours=24):
        return "UPCOMING"
    return "NORMAL"


def scan_external_reminders(session: Session, now: datetime | None = None) -> list[ExternalReminderEvent]:
    now = now or datetime.now(timezone.utc)
    dependencies = session.exec(select(ExternalDependency).where(ExternalDependency.external_feedback_status == ExternalFeedbackStatus.WAITING)).all()
    created: list[ExternalReminderEvent] = []
    for dependency in dependencies:
        task = session.get(Task, dependency.task_id)
        if not task or TaskStatus(task.status) != TaskStatus.WAITING_EXTERNAL:
            continue
        level = reminder_level(dependency.expected_at, now)
        if level == "NORMAL":
            continue
        event = ExternalReminderEvent(id=f"rem-{uuid4().hex}", dependency_id=dependency.id, task_id=task.id, recipient_user_id=dependency.internal_followup_user_id, reminder_type=level, reminder_date=now.date().isoformat())
        session.add(event)
        dependency.reminder_sent = True
        session.add(dependency)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            continue
        session.refresh(event)
        created.append(event)
    return created
