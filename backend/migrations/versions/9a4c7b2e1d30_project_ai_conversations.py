"""project AI conversations

Revision ID: 9a4c7b2e1d30
Revises: f13d7ae84902
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "9a4c7b2e1d30"
down_revision = "f13d7ae84902"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projectconversation",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("project_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_by", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projectconversation_created_by"), "projectconversation", ["created_by"], unique=False)
    op.create_index(op.f("ix_projectconversation_project_id"), "projectconversation", ["project_id"], unique=False)
    op.create_index(op.f("ix_projectconversation_updated_at"), "projectconversation", ["updated_at"], unique=False)
    op.create_table(
        "projectchatmessage",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("conversation_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("author_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("execution_mode", sa.String(length=16), nullable=True),
        sa.Column("prompt_version", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("ai_call_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("request_key", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("reply_to_message_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("context_task_ids_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["conversation_id"], ["projectconversation.id"]),
        sa.ForeignKeyConstraint(["reply_to_message_id"], ["projectchatmessage.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projectchatmessage_ai_call_id"), "projectchatmessage", ["ai_call_id"], unique=False)
    op.create_index(op.f("ix_projectchatmessage_author_id"), "projectchatmessage", ["author_id"], unique=False)
    op.create_index(op.f("ix_projectchatmessage_conversation_id"), "projectchatmessage", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_projectchatmessage_created_at"), "projectchatmessage", ["created_at"], unique=False)
    op.create_index(op.f("ix_projectchatmessage_request_key"), "projectchatmessage", ["request_key"], unique=True)
    op.create_index(op.f("ix_projectchatmessage_role"), "projectchatmessage", ["role"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_projectchatmessage_role"), table_name="projectchatmessage")
    op.drop_index(op.f("ix_projectchatmessage_request_key"), table_name="projectchatmessage")
    op.drop_index(op.f("ix_projectchatmessage_created_at"), table_name="projectchatmessage")
    op.drop_index(op.f("ix_projectchatmessage_conversation_id"), table_name="projectchatmessage")
    op.drop_index(op.f("ix_projectchatmessage_author_id"), table_name="projectchatmessage")
    op.drop_index(op.f("ix_projectchatmessage_ai_call_id"), table_name="projectchatmessage")
    op.drop_table("projectchatmessage")
    op.drop_index(op.f("ix_projectconversation_updated_at"), table_name="projectconversation")
    op.drop_index(op.f("ix_projectconversation_project_id"), table_name="projectconversation")
    op.drop_index(op.f("ix_projectconversation_created_by"), table_name="projectconversation")
    op.drop_table("projectconversation")
