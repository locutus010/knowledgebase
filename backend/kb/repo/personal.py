"""Favoriten, zuletzt angesehen, zuletzt geändert — immer nur aus lesbaren Bereichen."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from kb.models import Favorite, Page, PageView, Space, User
from kb.permissions import readable_space_ids

HOME_LIMIT = 12


def _visible(user: User):
    return (Page.deleted_at.is_(None), Page.space_id.in_(readable_space_ids(user)),
            Space.archived_at.is_(None))


def _rows(db: Session, stmt):
    return [{"page": p, "space": s, "at": at} for p, s, at in db.execute(stmt)]


def recent_views(db: Session, user: User):
    stmt = (select(Page, Space, PageView.viewed_at).join(PageView, PageView.page_id == Page.id)
            .join(Space, Space.id == Page.space_id)
            .where(PageView.user_id == user.id, *_visible(user))
            .order_by(PageView.viewed_at.desc()).limit(HOME_LIMIT))
    return _rows(db, stmt)


def recent_changes(db: Session, user: User):
    stmt = (select(Page, Space, Page.updated_at).join(Space, Space.id == Page.space_id)
            .where(*_visible(user)).order_by(Page.updated_at.desc()).limit(HOME_LIMIT))
    return _rows(db, stmt)


def favorites(db: Session, user: User):
    stmt = (select(Page, Space, Favorite.created_at).join(Favorite, Favorite.page_id == Page.id)
            .join(Space, Space.id == Page.space_id)
            .where(Favorite.user_id == user.id, *_visible(user))
            .order_by(Favorite.created_at.desc()).limit(50))
    return _rows(db, stmt)


def add_favorite(db: Session, user: User, page: Page) -> None:
    db.execute(insert(Favorite).values(user_id=user.id, page_id=page.id).on_conflict_do_nothing())


def remove_favorite(db: Session, user: User, page: Page) -> None:
    fav = db.get(Favorite, (user.id, page.id))
    if fav is not None:
        db.delete(fav)
