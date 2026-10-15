"""Die einzige Stelle, die Rechte in einem Bereich berechnet.

access() für einzelne Objekte, readable_space_ids() für Listen als SQL-Subquery. Jede Route,
die Bereiche, Seiten, Anhänge, Tags, Vorlagen oder Revisionen berührt, geht über eins von
beiden — die Rechte-Matrix in tests/test_access_matrix.py wacht darüber.
"""

from enum import IntEnum

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from kb.errors import AppError
from kb.models import Space, SpaceMember, User


class Level(IntEnum):
    NONE = 0
    READ = 1
    EDIT = 2
    MANAGE = 3

    @classmethod
    def parse(cls, name: str) -> "Level":
        return cls[name.upper()]

    @property
    def label(self) -> str:
        return self.name.lower()


def access(db: Session, user: User, space: Space) -> Level:
    if user.role == "admin":
        return Level.MANAGE
    default = Level.parse(space.default_access)
    member = db.get(SpaceMember, (space.id, user.id))
    return max(default, Level.parse(member.level)) if member else default


def readable_space_ids(user: User) -> Select:
    if user.role == "admin":
        return select(Space.id)
    member_of = select(SpaceMember.space_id).where(SpaceMember.user_id == user.id)
    return select(Space.id).where(or_(Space.default_access.in_(("read", "edit")), Space.id.in_(member_of)))


def check(level: Level, need: Level) -> None:
    """404 statt 403, solange nicht einmal Lesen erlaubt ist — sonst verriete die Antwort,
    dass es den Bereich gibt."""
    if level < Level.READ:
        raise AppError(404, "Nicht gefunden.")
    if level < need:
        raise AppError(403, "Dafür fehlt dir die Berechtigung in diesem Bereich.")


def require_space(db: Session, user: User, slug: str, need: Level = Level.READ) -> tuple[Space, Level]:
    space = db.scalar(select(Space).where(Space.slug == slug))
    if space is None:
        raise AppError(404, "Nicht gefunden.")
    level = access(db, user, space)
    check(level, need)
    return space, level
