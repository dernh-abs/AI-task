"""agent run workflow

Revision ID: c5a01d3478fb
Revises: b4912c80e4d2
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "c5a01d3478fb"
down_revision = "b4912c80e4d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("agentrun", sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("task_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("requested_by", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("request_fingerprint", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("status", sa.String(length=24), nullable=False), sa.Column("execution_mode", sa.String(length=16), nullable=True), sa.Column("degraded", sa.Boolean(), nullable=False), sa.Column("fallback_reason", sqlmodel.sql.sqltypes.AutoString(), nullable=True), sa.Column("prompt_version", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("attempt_count", sa.Integer(), nullable=False), sa.Column("max_attempts", sa.Integer(), nullable=False), sa.Column("output_text", sa.Text(), nullable=False), sa.Column("error_message", sa.Text(), nullable=True), sa.Column("started_at", sa.DateTime(), nullable=True), sa.Column("heartbeat_at", sa.DateTime(), nullable=True), sa.Column("finished_at", sa.DateTime(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["requested_by"], ["user.id"]), sa.ForeignKeyConstraint(["task_id"], ["task.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_agentrun_request_fingerprint"), "agentrun", ["request_fingerprint"], unique=True)
    op.create_index(op.f("ix_agentrun_status"), "agentrun", ["status"], unique=False)
    op.create_index(op.f("ix_agentrun_task_id"), "agentrun", ["task_id"], unique=False)
    op.create_table("agentrunlog", sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("agent_run_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("level", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("message", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["agent_run_id"], ["agentrun.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_agentrunlog_agent_run_id"), "agentrunlog", ["agent_run_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_agentrunlog_agent_run_id"), table_name="agentrunlog")
    op.drop_table("agentrunlog")
    op.drop_index(op.f("ix_agentrun_task_id"), table_name="agentrun")
    op.drop_index(op.f("ix_agentrun_status"), table_name="agentrun")
    op.drop_index(op.f("ix_agentrun_request_fingerprint"), table_name="agentrun")
    op.drop_table("agentrun")
