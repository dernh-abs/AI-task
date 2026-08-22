"""candidate assignment fields

Revision ID: a8c4e73d219b
Revises: 9a4c7b2e1d30
"""

from alembic import op
import sqlalchemy as sa


revision = "a8c4e73d219b"
down_revision = "9a4c7b2e1d30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("candidatetask") as batch_op:
        batch_op.add_column(sa.Column("stage_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("execution_mode", sa.String(length=16), nullable=False, server_default="HUMAN"))
        batch_op.create_index(op.f("ix_candidatetask_stage_id"), ["stage_id"], unique=False)
        batch_op.create_foreign_key("fk_candidate_stage", "stage", ["stage_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("candidatetask") as batch_op:
        batch_op.drop_constraint("fk_candidate_stage", type_="foreignkey")
        batch_op.drop_index(op.f("ix_candidatetask_stage_id"))
        batch_op.drop_column("execution_mode")
        batch_op.drop_column("stage_id")
