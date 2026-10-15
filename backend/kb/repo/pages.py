"""SQL rund um Seiten: Baum, Speichern mit Versionsprüfung, Verschieben, Papierkorb."""

import uuid

from sqlalchemy import delete, exists, func, literal_column, select, update
from sqlalchemy.orm import Session, aliased

from kb import clock
from kb.models import Favorite, Page, PageTag, PageView, Space, Tag, Template, User
from kb.repo import revisions


class ConflictError(Exception):
    def __init__(self, page: Page):
        self.page = page


class TreeError(Exception):
    pass


def descendants_cte(root_id: uuid.UUID, include_deleted: bool = True):
    base = select(Page.id).where(Page.id == root_id).cte("subtree", recursive=True)
    child = aliased(Page)
    step = select(child.id).where(child.parent_id == base.c.id)
    if not include_deleted:
        step = step.where(child.deleted_at.is_(None))
    return base.union_all(step)


def subtree_ids(db: Session, root_id: uuid.UUID, include_deleted: bool = True) -> list[uuid.UUID]:
    cte = descendants_cte(root_id, include_deleted)
    return list(db.scalars(select(cte.c.id)))


def ancestors(db: Session, page: Page) -> list[Page]:
    base = select(Page.id, Page.parent_id, literal_column("0").label("depth")).where(
        Page.id == page.parent_id).cte("anc", recursive=True)
    parent = aliased(Page)
    base = base.union_all(select(parent.id, parent.parent_id, (base.c.depth + 1)).where(
        parent.id == base.c.parent_id))
    rows = db.execute(select(base.c.id, base.c.depth).order_by(base.c.depth.desc())).all()
    pages = {p.id: p for p in db.scalars(select(Page).where(Page.id.in_([r.id for r in rows])))}
    return [pages[r.id] for r in rows]


def tree(db: Session, space: Space) -> list[dict]:
    child = aliased(Page)
    has_children = exists().where(child.parent_id == Page.id, child.deleted_at.is_(None))
    rows = db.execute(
        select(Page.id, Page.parent_id, Page.title, Page.icon, Page.position, has_children.label("has_children"))
        .where(Page.space_id == space.id, Page.deleted_at.is_(None))
        .order_by(Page.position, func.lower(Page.title))
    ).all()
    return [r._asdict() for r in rows]


def _siblings(db: Session, space_id: uuid.UUID, parent_id: uuid.UUID | None, exclude: uuid.UUID | None = None):
    cond = Page.parent_id.is_(None) if parent_id is None else Page.parent_id == parent_id
    stmt = (select(Page).where(Page.space_id == space_id, cond, Page.deleted_at.is_(None))
            .order_by(Page.position, Page.created_at))
    if exclude is not None:
        stmt = stmt.where(Page.id != exclude)
    return list(db.scalars(stmt))


def check_parent(db: Session, space: Space, parent_id: uuid.UUID | None) -> None:
    if parent_id is None:
        return
    parent = db.get(Page, parent_id)
    if parent is None or parent.space_id != space.id or parent.deleted_at is not None:
        raise TreeError("Die übergeordnete Seite gehört nicht zu diesem Bereich.")


def render_template(content: str, *, author: User, title: str) -> str:
    datum = clock.now().astimezone().strftime("%d.%m.%Y")
    return (content.replace("{{datum}}", datum).replace("{{autor}}", author.name)
            .replace("{{titel}}", title))


def create(db: Session, author: User, space: Space, *, title: str, parent_id=None,
           content_md: str = "", icon: str = "") -> Page:
    check_parent(db, space, parent_id)
    position = len(_siblings(db, space.id, parent_id))
    now = clock.now()
    page = Page(space_id=space.id, parent_id=parent_id, title=title, content_md=content_md,
                icon=icon, position=position, version=1, created_by_id=author.id,
                updated_by_id=author.id, created_at=now, updated_at=now)
    db.add(page)
    db.flush()
    revisions.record(db, page, author, allow_merge=False)
    db.flush()
    return page


def save(db: Session, author: User, page: Page, *, base_version: int, title=None,
         content_md=None, icon=None, merge: bool = True) -> Page:
    db.refresh(page, with_for_update=True)  # zwei gleichzeitige Speichervorgänge serialisieren
    if page.version != base_version:
        raise ConflictError(page)
    changed = False
    for field, value in (("title", title), ("content_md", content_md), ("icon", icon)):
        if value is not None and getattr(page, field) != value:
            setattr(page, field, value)
            changed = True
    if not changed:
        return page
    page.version += 1
    page.updated_at = clock.now()
    page.updated_by_id = author.id
    revisions.record(db, page, author, allow_merge=merge)
    db.flush()
    return page


def move(db: Session, page: Page, *, target_space: Space, parent_id, position: int) -> None:
    if parent_id is not None:
        if parent_id in subtree_ids(db, page.id):
            raise TreeError("Eine Seite kann nicht unter sich selbst verschoben werden.")
        check_parent(db, target_space, parent_id)
    if target_space.id != page.space_id:
        ids = subtree_ids(db, page.id, include_deleted=True)
        db.execute(update(Page).where(Page.id.in_(ids)).values(space_id=target_space.id, tags_text=""))
        db.execute(delete(PageTag).where(PageTag.page_id.in_(ids)))
        db.refresh(page)
    old_parent, old_space = page.parent_id, page.space_id
    siblings = _siblings(db, target_space.id, parent_id, exclude=page.id)
    position = max(0, min(position, len(siblings)))
    siblings.insert(position, page)
    page.parent_id = parent_id
    for i, p in enumerate(siblings):
        p.position = i
    db.flush()
    if (old_parent, old_space) != (parent_id, target_space.id):
        for i, p in enumerate(_siblings(db, old_space, old_parent)):
            p.position = i
    db.flush()


def trash(db: Session, page: Page) -> None:
    now = clock.now()
    ids = subtree_ids(db, page.id, include_deleted=False)
    db.execute(update(Page).where(Page.id.in_(ids), Page.deleted_at.is_(None)).values(deleted_at=now))
    db.refresh(page)


def restore(db: Session, page: Page) -> None:
    stamp = page.deleted_at
    ids = subtree_ids(db, page.id)
    db.execute(update(Page).where(Page.id.in_(ids), Page.deleted_at == stamp).values(deleted_at=None))
    db.refresh(page)
    parent = db.get(Page, page.parent_id) if page.parent_id else None
    if parent is None or parent.deleted_at is not None:
        page.parent_id = None
        page.position = len(_siblings(db, page.space_id, None, exclude=page.id))
    db.flush()


def purge(db: Session, page: Page) -> None:
    ids = subtree_ids(db, page.id)
    db.execute(delete(Page).where(Page.id.in_(ids)))


def trash_list(db: Session, space: Space) -> list[Page]:
    parent = aliased(Page)
    top = ~exists().where(parent.id == Page.parent_id, parent.deleted_at == Page.deleted_at)
    return list(db.scalars(select(Page).where(Page.space_id == space.id, Page.deleted_at.isnot(None), top)
                           .order_by(Page.deleted_at.desc())))


def tag_names(db: Session, page: Page) -> list[str]:
    return list(db.scalars(select(Tag.name).join(PageTag, PageTag.tag_id == Tag.id)
                           .where(PageTag.page_id == page.id).order_by(Tag.name)))


def is_favorite(db: Session, user: User, page: Page) -> bool:
    return db.get(Favorite, (user.id, page.id)) is not None


def record_view(db: Session, user: User, page: Page) -> None:
    from sqlalchemy.dialects.postgresql import insert

    stmt = insert(PageView).values(user_id=user.id, page_id=page.id, viewed_at=clock.now())
    db.execute(stmt.on_conflict_do_update(index_elements=["user_id", "page_id"],
                                          set_={"viewed_at": stmt.excluded.viewed_at}))


def template(db: Session, template_id: uuid.UUID) -> Template | None:
    return db.get(Template, template_id)


