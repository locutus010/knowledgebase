"""Serverseitige Sitzungen: im Cookie steht nur ein Zufallstoken, in der DB sein Hash."""

import uuid
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from kb import clock
from kb.models import Session_, User
from kb.security import new_token, token_hash

LIFETIME = timedelta(days=14)
# Verlängert wird nur, wenn mehr als ein Tag verstrichen ist — sonst schriebe jede Anfrage.
REFRESH_AFTER = timedelta(days=1)


def create(db: Session, user: User, user_agent: str) -> tuple[str, str]:
    token = new_token()
    csrf = new_token()
    db.add(Session_(id=token_hash(token), user_id=user.id, csrf_token=csrf,
                    expires_at=clock.now() + LIFETIME, user_agent=user_agent[:255]))
    return token, csrf


def lookup(db: Session, token: str) -> tuple[Session_, User] | None:
    row = db.execute(
        select(Session_, User).join(User, User.id == Session_.user_id)
        .where(Session_.id == token_hash(token))
    ).first()
    if row is None:
        return None
    sess, user = row
    now = clock.now()
    if sess.expires_at <= now or not user.active:
        return None
    if sess.expires_at - now < LIFETIME - REFRESH_AFTER:
        sess.expires_at = now + LIFETIME
    return sess, user


def delete_token(db: Session, token: str) -> None:
    db.execute(delete(Session_).where(Session_.id == token_hash(token)))


def delete_for_user(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(Session_).where(Session_.user_id == user_id))
