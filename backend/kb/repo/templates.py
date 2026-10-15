"""SQL rund um Vorlagen."""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from kb.models import Space, Template


def list_for(db: Session, space: Space | None) -> list[Template]:
    cond = Template.space_id.is_(None)
    if space is not None:
        cond = or_(cond, Template.space_id == space.id)
    # Bereichsvorlagen zuerst — sie sind die spezifischeren.
    return list(db.scalars(select(Template).where(cond)
                           .order_by(Template.space_id.is_(None), func.lower(Template.name))))
