"""Volltextsuche. Gefiltert wird in SQL auf lesbare Bereiche — nie nachträglich in Python,
sonst stimmten Trefferzahl und Blättern nicht."""

import html
import re

from sqlalchemy import func, literal, select
from sqlalchemy.orm import Session

from kb.models import Page, PageTag, Space, Tag, User
from kb.permissions import readable_space_ids

START, STOP = "\x02", "\x03"
HEADLINE_OPTS = (f"StartSel={START}, StopSel={STOP}, MaxWords=28, MinWords=10, "
                 "MaxFragments=2, FragmentDelimiter=\" … \"")
_WORD = re.compile(r"[\w-]+")
# Markdown-Zeichen raus, damit Schnipsel keine ** und # zeigen.
_MD_NOISE = r"(!?\[|\]\([^)]*\)|[#*_`>|~]+|\]|\n)"


def _query(q: str):
    web = func.websearch_to_tsquery("german", q)
    words = _WORD.findall(q)
    if not words or q.rstrip()[-1:] in ('"', " "):
        return web
    last = words[-1].strip("-")[:64]
    if not last:
        return web
    prefix = func.to_tsquery("german", literal(f"'{last}':*"))
    return web.op("||")(prefix)


def mark(snippet: str) -> str:
    return html.escape(snippet).replace(START, "<mark>").replace(STOP, "</mark>")


def search(db: Session, user: User, q: str, *, space_slug: str | None, tag: str | None,
           limit: int, offset: int) -> tuple[int, list[dict]]:
    q = q.strip()[:200]
    if not _WORD.search(q):
        return 0, []
    tsq = _query(q).label("q")
    base = (select(Page.id).join(Space, Space.id == Page.space_id)
            .where(Page.search_vector.op("@@")(tsq), Page.deleted_at.is_(None),
                   Space.archived_at.is_(None), Page.space_id.in_(readable_space_ids(user))))
    if space_slug:
        base = base.where(Space.slug == space_slug)
    if tag:
        base = base.where(Page.id.in_(select(PageTag.page_id).join(Tag, Tag.id == PageTag.tag_id)
                                      .where(Tag.name == tag.strip().lower())))
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    if not total:
        return 0, []
    clean = func.regexp_replace(Page.content_md, _MD_NOISE, " ", "g")
    rank = func.ts_rank_cd(Page.search_vector, tsq)
    rows = db.execute(
        select(Page, Space, func.ts_headline("german", clean, tsq, HEADLINE_OPTS).label("snippet"))
        .join(Space, Space.id == Page.space_id).where(Page.id.in_(base))
        .order_by(rank.desc(), Page.updated_at.desc()).limit(limit).offset(offset)
    ).all()
    return total, [{"page": p, "space": s, "snippet_html": mark(snip or "")} for p, s, snip in rows]
