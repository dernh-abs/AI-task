"""invitation registration

Revision ID: e7a4b2c91f10
Revises: d620ef7b98a1
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "e7a4b2c91f10"
down_revision = "d620ef7b98a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invitation",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("team_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("project_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("project_role", sa.String(length=32), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("invited_by", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invited_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["team.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_invitation_email"), "invitation", ["email"], unique=False)
    op.create_index(op.f("ix_invitation_invited_by"), "invitation", ["invited_by"], unique=False)
    op.create_index(op.f("ix_invitation_project_id"), "invitation", ["project_id"], unique=False)
    op.create_index(op.f("ix_invitation_team_id"), "invitation", ["team_id"], unique=False)
    op.create_index(op.f("ix_invitation_token_hash"), "invitation", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_invitation_token_hash"), table_name="invitation")
    op.drop_index(op.f("ix_invitation_team_id"), table_name="invitation")
    op.drop_index(op.f("ix_invitation_project_id"), table_name="invitation")
    op.drop_index(op.f("ix_invitation_invited_by"), table_name="invitation")
    op.drop_index(op.f("ix_invitation_email"), table_name="invitation")
    op.drop_table("invitation")
