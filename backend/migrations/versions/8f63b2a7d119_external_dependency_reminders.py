"""external dependency reminders

Revision ID: 8f63b2a7d119
Revises: 28cc6b1cf56f
Create Date: 2026-08-19
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "8f63b2a7d119"
down_revision = "28cc6b1cf56f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "externalcontact",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("team_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("organization", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("channel", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["team.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_externalcontact_team_id"), "externalcontact", ["team_id"], unique=False)
    op.create_table(
        "externaldependency",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("task_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("contact_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("item", sa.Text(), nullable=False),
        sa.Column("expected_at", sa.DateTime(), nullable=False),
        sa.Column("internal_followup_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("recovery_action", sa.Text(), nullable=False),
        sa.Column("last_followup_at", sa.DateTime(), nullable=True),
        sa.Column("external_feedback_status", sa.String(length=24), nullable=False),
        sa.Column("actual_received_at", sa.DateTime(), nullable=True),
        sa.Column("reminder_sent", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["contact_id"], ["externalcontact.id"]),
        sa.ForeignKeyConstraint(["internal_followup_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_externaldependency_internal_followup_user_id"), "externaldependency", ["internal_followup_user_id"], unique=False)
    op.create_index(op.f("ix_externaldependency_task_id"), "externaldependency", ["task_id"], unique=False)
    op.create_table(
        "externalreminderevent",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("dependency_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("task_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("recipient_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("reminder_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("reminder_date", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["dependency_id"], ["externaldependency.id"]),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["task.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dependency_id", "reminder_type", "reminder_date", name="uq_external_reminder_bucket"),
    )
    op.create_index(op.f("ix_externalreminderevent_dependency_id"), "externalreminderevent", ["dependency_id"], unique=False)
    op.create_index(op.f("ix_externalreminderevent_recipient_user_id"), "externalreminderevent", ["recipient_user_id"], unique=False)
    op.create_index(op.f("ix_externalreminderevent_task_id"), "externalreminderevent", ["task_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_externalreminderevent_task_id"), table_name="externalreminderevent")
    op.drop_index(op.f("ix_externalreminderevent_recipient_user_id"), table_name="externalreminderevent")
    op.drop_index(op.f("ix_externalreminderevent_dependency_id"), table_name="externalreminderevent")
    op.drop_table("externalreminderevent")
    op.drop_index(op.f("ix_externaldependency_task_id"), table_name="externaldependency")
    op.drop_index(op.f("ix_externaldependency_internal_followup_user_id"), table_name="externaldependency")
    op.drop_table("externaldependency")
    op.drop_index(op.f("ix_externalcontact_team_id"), table_name="externalcontact")
    op.drop_table("externalcontact")
