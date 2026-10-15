"""Dateinamen der Anhänge in die Volltextsuche

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

_BASE = (
    "setweight(to_tsvector('german'::regconfig, coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('german'::regconfig, coalesce(tags_text, '')), 'B') || "
)
_CONTENT = "setweight(to_tsvector('german'::regconfig, coalesce(content_md, '')), 'C')"
_ATTACH = "setweight(to_tsvector('german'::regconfig, coalesce(attachments_text, '')), 'B') || "


def _replace_vector(expr: str) -> None:
    # Eine generierte Spalte lässt sich in PostgreSQL nicht umdefinieren — neu anlegen.
    op.drop_index("ix_pages_search", table_name="pages", postgresql_using="gin")
    op.drop_column("pages", "search_vector")
    op.add_column("pages", sa.Column("search_vector", postgresql.TSVECTOR(), sa.Computed(expr, persisted=True), nullable=True))
    op.create_index("ix_pages_search", "pages", ["search_vector"], unique=False, postgresql_using="gin")


def upgrade():
    op.add_column("pages", sa.Column("attachments_text", sa.Text(), server_default="", nullable=False))
    op.execute("""
        UPDATE pages p SET attachments_text = sub.t FROM (
            SELECT page_id, string_agg(filename || ' ' || regexp_replace(filename, '[-_.]+', ' ', 'g'), ' ') AS t
            FROM attachments GROUP BY page_id
        ) sub WHERE sub.page_id = p.id
    """)
    _replace_vector(_BASE + _ATTACH + _CONTENT)


def downgrade():
    _replace_vector(_BASE + _CONTENT)
    op.drop_column("pages", "attachments_text")
