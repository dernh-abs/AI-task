"""contribution events

Revision ID: d620ef7b98a1
Revises: c5a01d3478fb
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "d620ef7b98a1"
down_revision = "c5a01d3478fb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("contributionevent", sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("task_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("event_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("submission_version", sa.Integer(), nullable=False), sa.Column("points", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["task_id"], ["task.id"]), sa.ForeignKeyConstraint(["user_id"], ["user.id"]), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("task_id", "event_type", "submission_version", name="uq_contribution_task_event_version"))
    op.create_index(op.f("ix_contributionevent_task_id"), "contributionevent", ["task_id"], unique=False)
    op.create_index(op.f("ix_contributionevent_user_id"), "contributionevent", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_contributionevent_user_id"), table_name="contributionevent")
    op.drop_index(op.f("ix_contributionevent_task_id"), table_name="contributionevent")
    op.drop_table("contributionevent")
