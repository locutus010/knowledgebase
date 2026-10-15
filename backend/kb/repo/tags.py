"""Tags je Bereich. pages.tags_text spiegelt die Namen für die Volltextsuche."""

from sqlalchemy import delete, exists, func, select
from sqlalchemy.orm import Session

from kb.models import Page, PageTag, Space, Tag


def set_tags(db: Session, page: Page, names: list[str]) -> list[str]:
    names = sorted(set(names))
    existing = {t.name: t for t in db.scalars(select(Tag).where(Tag.space_id == page.space_id,
                                                                Tag.name.in_(names)))}
    for name in names:
        if name not in existing:
            tag = Tag(space_id=page.space_id, name=name)
            db.add(tag)
            existing[name] = tag
    db.flush()
    db.execute(delete(PageTag).where(PageTag.page_id == page.id))
    db.add_all(PageTag(page_id=page.id, tag_id=existing[n].id) for n in names)
    page.tags_text = " ".join(names)
    db.flush()
    db.execute(delete(Tag).where(Tag.space_id == page.space_id,
                                 ~exists().where(PageTag.tag_id == Tag.id)))
    return names


def space_tags(db: Session, space: Space) -> list[dict]:
    rows = db.execute(
        select(Tag.name, func.count(PageTag.page_id))
        .join(PageTag, PageTag.tag_id == Tag.id).join(Page, Page.id == PageTag.page_id)
        .where(Tag.space_id == space.id, Page.deleted_at.is_(None))
        .group_by(Tag.name).order_by(func.count(PageTag.page_id).desc(), Tag.name)
    ).all()
    return [{"name": n, "count": c} for n, c in rows]
