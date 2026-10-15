"""SQL rund um Anhänge. pages.attachments_text spiegelt die Dateinamen für die Volltextsuche."""

import re
import uuid

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from kb.models import Attachment, Page, User


def list_for_page(db: Session, page_id: uuid.UUID) -> list[tuple[Attachment, User | None]]:
    rows = db.execute(select(Attachment, User).outerjoin(User, User.id == Attachment.uploaded_by_id)
                      .where(Attachment.page_id == page_id).order_by(Attachment.created_at))
    return [(a, u) for a, u in rows]


def search_text(filenames: list[str]) -> str:
    """'Angebot-2026.pdf' → 'Angebot-2026.pdf Angebot 2026 pdf': der ganze Name trifft die
    Suche nach dem vollen Namen, die Teile die Suche nach einzelnen Wörtern."""
    return " ".join(f"{n} {re.sub(r'[-_.]+', ' ', n)}" for n in filenames)


def refresh_text(db: Session, page_id: uuid.UUID) -> None:
    db.flush()
    names = list(db.scalars(select(Attachment.filename).where(Attachment.page_id == page_id)
                            .order_by(Attachment.created_at)))
    db.execute(update(Page).where(Page.id == page_id).values(attachments_text=search_text(names)))
