"""Revisionen: eine je Bearbeitungsrunde. Das Autospeichern innerhalb einer Runde
(Bearbeiten → Fertig) überschreibt die Revision dieser Runde, statt eine neue anzulegen;
jede neue Runde beginnt eine eigene. Ohne Rundenkennung entsteht pro Speichern eine."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kb import clock
from kb.models import Page, PageRevision, User

def latest(db: Session, page: Page) -> PageRevision | None:
    return db.scalar(select(PageRevision).where(PageRevision.page_id == page.id)
                     .order_by(PageRevision.version.desc()).limit(1))


def record(db: Session, page: Page, author: User, *, edit_session: str | None = None,
           allow_merge: bool = True) -> None:
    """Hält den aktuellen Stand der Seite fest. Erwartet, dass page.version schon erhöht ist.

    Die Erstfassung (Version 1) wird nie überschrieben — sonst ginge der Ausgangszustand
    einer Seite verloren, sobald sie gleich nach dem Anlegen bearbeitet wird."""
    now = clock.now()
    last = latest(db, page)
    if (allow_merge and edit_session and last is not None and last.version > 1
            and last.author_id == author.id and last.edit_session == edit_session):
        last.version = page.version
        last.title = page.title
        last.content_md = page.content_md
        return
    db.add(PageRevision(page_id=page.id, version=page.version, title=page.title,
                        content_md=page.content_md, author_id=author.id, created_at=now,
                        edit_session=edit_session if allow_merge else None))


def list_for(db: Session, page: Page) -> list[tuple[PageRevision, int]]:
    """Neueste zuerst, mit fortlaufender Nummer ab 1. page.version zählt jedes Speichern und
    hat deshalb Lücken; die Nummer ist, was Menschen sehen."""
    number = func.row_number().over(order_by=PageRevision.version).label("number")
    rows = db.execute(select(PageRevision, number).where(PageRevision.page_id == page.id)
                      .order_by(PageRevision.version.desc()))
    return [(r, n) for r, n in rows]


def number_of(db: Session, page: Page, version: int) -> int:
    return db.scalar(select(func.count()).select_from(PageRevision).where(
        PageRevision.page_id == page.id, PageRevision.version <= version))


def get(db: Session, page: Page, version: int) -> PageRevision | None:
    return db.scalar(select(PageRevision).where(PageRevision.page_id == page.id,
                                                PageRevision.version == version))
