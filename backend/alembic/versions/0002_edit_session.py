"""Bearbeitungsrunde je Revision

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("page_revisions", sa.Column("edit_session", sa.String(length=64), nullable=True))


def downgrade():
    op.drop_column("page_revisions", "edit_session")
