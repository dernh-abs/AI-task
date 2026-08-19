"""model gateway and candidates

Revision ID: b4912c80e4d2
Revises: 8f63b2a7d119
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "b4912c80e4d2"
down_revision = "8f63b2a7d119"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("airesponsecache", sa.Column("cache_key", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("response_json", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.PrimaryKeyConstraint("cache_key"))
    op.create_table("aicalllog", sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("project_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("capability", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("prompt_version", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("model", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("execution_mode", sa.String(length=16), nullable=False), sa.Column("degraded", sa.Boolean(), nullable=False), sa.Column("fallback_reason", sqlmodel.sql.sqltypes.AutoString(), nullable=True), sa.Column("input_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("latency_ms", sa.Integer(), nullable=False), sa.Column("input_tokens", sa.Integer(), nullable=False), sa.Column("output_tokens", sa.Integer(), nullable=False), sa.Column("cost_usd", sa.Float(), nullable=False), sa.Column("success", sa.Boolean(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["project_id"], ["project.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_aicalllog_input_hash"), "aicalllog", ["input_hash"], unique=False)
    op.create_index(op.f("ix_aicalllog_project_id"), "aicalllog", ["project_id"], unique=False)
    op.create_table("sourcesnapshot", sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("project_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("source_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("content", sa.Text(), nullable=False), sa.Column("content_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("extraction_version", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["created_by"], ["user.id"]), sa.ForeignKeyConstraint(["project_id"], ["project.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index(op.f("ix_sourcesnapshot_content_hash"), "sourcesnapshot", ["content_hash"], unique=False)
    op.create_index(op.f("ix_sourcesnapshot_project_id"), "sourcesnapshot", ["project_id"], unique=False)
    op.create_table("candidatetask", sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("source_snapshot_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("project_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("deliverable", sqlmodel.sql.sqltypes.AutoString(), nullable=False), sa.Column("owner_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True), sa.Column("reviewer_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True), sa.Column("due_at", sa.DateTime(), nullable=True), sa.Column("confidence", sa.Integer(), nullable=False), sa.Column("evidence", sa.Text(), nullable=False), sa.Column("status", sa.String(length=20), nullable=False), sa.Column("confirmed_by", sqlmodel.sql.sqltypes.AutoString(), nullable=True), sa.Column("confirmed_at", sa.DateTime(), nullable=True), sa.Column("created_task_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True), sa.Column("version", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(["confirmed_by"], ["user.id"]), sa.ForeignKeyConstraint(["created_task_id"], ["task.id"]), sa.ForeignKeyConstraint(["owner_id"], ["user.id"]), sa.ForeignKeyConstraint(["project_id"], ["project.id"]), sa.ForeignKeyConstraint(["reviewer_id"], ["user.id"]), sa.ForeignKeyConstraint(["source_snapshot_id"], ["sourcesnapshot.id"]), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("created_task_id"))
    op.create_index(op.f("ix_candidatetask_project_id"), "candidatetask", ["project_id"], unique=False)
    op.create_index(op.f("ix_candidatetask_source_snapshot_id"), "candidatetask", ["source_snapshot_id"], unique=False)
    op.create_index(op.f("ix_candidatetask_status"), "candidatetask", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_candidatetask_status"), table_name="candidatetask")
    op.drop_index(op.f("ix_candidatetask_source_snapshot_id"), table_name="candidatetask")
    op.drop_index(op.f("ix_candidatetask_project_id"), table_name="candidatetask")
    op.drop_table("candidatetask")
    op.drop_index(op.f("ix_sourcesnapshot_project_id"), table_name="sourcesnapshot")
    op.drop_index(op.f("ix_sourcesnapshot_content_hash"), table_name="sourcesnapshot")
    op.drop_table("sourcesnapshot")
    op.drop_index(op.f("ix_aicalllog_project_id"), table_name="aicalllog")
    op.drop_index(op.f("ix_aicalllog_input_hash"), table_name="aicalllog")
    op.drop_table("aicalllog")
    op.drop_table("airesponsecache")
