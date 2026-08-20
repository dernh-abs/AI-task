from __future__ import annotations

import argparse

from sqlalchemy import delete, func
from sqlmodel import Session, select

from .config import load_settings
from .database import engine
from .models import (
    AgentRun,
    AgentRunLog,
    AiCallLog,
    AiResponseCache,
    AuditEvent,
    CandidateTask,
    ContributionEvent,
    ExternalContact,
    ExternalDependency,
    ExternalReminderEvent,
    IdempotencyRecord,
    Invitation,
    Project,
    ProjectMember,
    SourceSnapshot,
    Stage,
    Task,
    TaskStatusHistory,
    TaskSubmission,
    Team,
    TeamMember,
    User,
)


CONFIRMATION = "RESET_APPLICATION_DATA"
DELETE_ORDER = [AgentRunLog, ContributionEvent, ExternalReminderEvent, ExternalDependency, CandidateTask, SourceSnapshot, TaskSubmission, TaskStatusHistory, AgentRun, AiCallLog, AiResponseCache, AuditEvent, IdempotencyRecord, Invitation, ExternalContact, Task, Stage, ProjectMember, Project, TeamMember, Team, User]


def row_counts(session: Session) -> list[tuple[str, int]]:
    return [(model.__tablename__, session.exec(select(func.count()).select_from(model)).one()) for model in DELETE_ORDER]


def main() -> None:
    parser = argparse.ArgumentParser(description="审计或清空当前应用数据库中的业务数据")
    parser.add_argument("--execute", action="store_true", help="实际执行清空；默认仅显示各表行数")
    parser.add_argument("--confirm", default="", help=f"执行时必须输入 {CONFIRMATION}")
    args = parser.parse_args()
    if load_settings().seed_demo_data:
        raise SystemExit("拒绝执行：SEED_DEMO_DATA 仍为 true，请先关闭自动演示数据")
    with Session(engine) as session:
        counts = row_counts(session)
        print(f"database={engine.dialect.name}")
        for table_name, count in counts:
            print(f"{table_name}: {count}")
        if not args.execute:
            print("DRY_RUN_ONLY")
            return
        if args.confirm != CONFIRMATION:
            raise SystemExit(f"拒绝执行：必须同时传入 --confirm {CONFIRMATION}")
        for model in DELETE_ORDER:
            session.exec(delete(model))
        session.commit()
        if any(count for _, count in row_counts(session)):
            raise SystemExit("清理后仍检测到业务数据")
        print("APPLICATION_DATA_RESET_OK")


if __name__ == "__main__":
    main()
