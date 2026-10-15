"""Revisionen: jede gespeicherte Fassung. Dieselbe Person innerhalb von 10 Minuten
überschreibt ihre letzte Revision, statt eine neue anzulegen."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from kb import clock
from kb.models import Page, PageRevision, User

MERGE_WINDOW = timedelta(minutes=10)


def latest(db: Session, page: Page) -> PageRevision | None:
    return db.scalar(select(PageRevision).where(PageRevision.page_id == page.id)
                     .order_by(PageRevision.version.desc()).limit(1))


def record(db: Session, page: Page, author: User, *, allow_merge: bool = True) -> None:
    """Hält den aktuellen Stand der Seite fest. Erwartet, dass page.version schon erhöht ist.

    Die Erstfassung (Version 1) wird nie überschrieben — sonst ginge der Ausgangszustand
    einer Seite verloren, sobald sie gleich nach dem Anlegen bearbeitet wird."""
    now = clock.now()
    last = latest(db, page)
    if (allow_merge and last is not None and last.version > 1 and last.author_id == author.id
            and now - last.created_at < MERGE_WINDOW):
        last.version = page.version
        last.title = page.title
        last.content_md = page.content_md
        return
    db.add(PageRevision(page_id=page.id, version=page.version, title=page.title,
                        content_md=page.content_md, author_id=author.id, created_at=now))


def list_for(db: Session, page: Page) -> list[PageRevision]:
    return list(db.scalars(select(PageRevision).where(PageRevision.page_id == page.id)
                           .order_by(PageRevision.version.desc())))


def get(db: Session, page: Page, version: int) -> PageRevision | None:
    return db.scalar(select(PageRevision).where(PageRevision.page_id == page.id,
                                                PageRevision.version == version))
