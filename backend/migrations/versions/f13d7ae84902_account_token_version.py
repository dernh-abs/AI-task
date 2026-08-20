"""account token version

Revision ID: f13d7ae84902
Revises: e7a4b2c91f10
"""

from alembic import op
import sqlalchemy as sa


revision = "f13d7ae84902"
down_revision = "e7a4b2c91f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("user", "token_version")
