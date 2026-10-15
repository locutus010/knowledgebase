"""SQL rund um Bereiche und Mitgliedschaften."""

import re
import unicodedata
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kb import clock
from kb.models import Page, Space, SpaceMember, User
from kb.permissions import readable_space_ids

_TRANSLIT = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})


def slugify(name: str) -> str:
    s = name.lower().translate(_TRANSLIT)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60].strip("-")
    return s or "bereich"


def unique_slug(db: Session, name: str) -> str:
    base = slugify(name)
    taken = set(db.scalars(select(Space.slug).where(Space.slug.like(f"{base}%"))))
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


def list_readable(db: Session, user: User, archived: bool) -> list[tuple[Space, int]]:
    counts = (select(Page.space_id, func.count().label("n")).where(Page.deleted_at.is_(None))
              .group_by(Page.space_id).subquery())
    stmt = (select(Space, func.coalesce(counts.c.n, 0))
            .outerjoin(counts, counts.c.space_id == Space.id)
            .where(Space.id.in_(readable_space_ids(user)))
            .where(Space.archived_at.isnot(None) if archived else Space.archived_at.is_(None))
            .order_by(func.lower(Space.name)))
    return [(s, n) for s, n in db.execute(stmt)]


def page_count(db: Session, space: Space) -> int:
    return db.scalar(select(func.count()).select_from(Page)
                     .where(Page.space_id == space.id, Page.deleted_at.is_(None)))


def create(db: Session, creator: User, **fields) -> Space:
    space = Space(slug=unique_slug(db, fields["name"]), created_by=creator, **fields)
    db.add(space)
    db.flush()
    db.add(SpaceMember(space_id=space.id, user_id=creator.id, level="manage"))
    db.flush()
    return space


def set_archived(space: Space, archived: bool) -> None:
    if archived and space.archived_at is None:
        space.archived_at = clock.now()
    elif not archived:
        space.archived_at = None


def members(db: Session, space: Space) -> list[tuple[SpaceMember, User]]:
    stmt = (select(SpaceMember, User).join(User, User.id == SpaceMember.user_id)
            .where(SpaceMember.space_id == space.id).order_by(func.lower(User.name)))
    return [(m, u) for m, u in db.execute(stmt)]


def set_member(db: Session, space: Space, user_id: uuid.UUID, level: str) -> SpaceMember:
    member = db.get(SpaceMember, (space.id, user_id))
    if member is None:
        member = SpaceMember(space_id=space.id, user_id=user_id, level=level)
        db.add(member)
    else:
        member.level = level
    db.flush()
    return member


def remove_member(db: Session, space: Space, user_id: uuid.UUID) -> bool:
    member = db.get(SpaceMember, (space.id, user_id))
    if member is None:
        return False
    db.delete(member)
    db.flush()
    return True


def directory(db: Session, q: str | None, limit: int = 20) -> list[User]:
    stmt = select(User).where(User.active.is_(True)).order_by(func.lower(User.name)).limit(limit)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(func.lower(User.name).like(like) | User.email.like(like))
    return list(db.scalars(stmt))
