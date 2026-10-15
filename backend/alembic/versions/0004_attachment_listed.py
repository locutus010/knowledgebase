"""Anhänge: gelistet (Abschnitt) oder nur im Text

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("attachments", sa.Column("listed", sa.Boolean(), server_default=sa.true(), nullable=False))
    # Bestand: was im Text der eigenen Seite vorkommt, war eingefügt — nicht mehr listen.
    op.execute("""
        UPDATE attachments a SET listed = false FROM pages p
        WHERE p.id = a.page_id AND position(('/api/v1/attachments/' || a.id::text) IN p.content_md) > 0
    """)
    op.execute("""
        UPDATE pages p SET attachments_text = coalesce((
            SELECT string_agg(filename || ' ' || regexp_replace(filename, '[-_.]+', ' ', 'g'), ' ' ORDER BY created_at)
            FROM attachments a WHERE a.page_id = p.id AND a.listed
        ), '')
    """)


def downgrade():
    op.drop_column("attachments", "listed")
