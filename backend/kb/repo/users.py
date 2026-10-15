"""SQL rund um Benutzer und Anmeldeversuche."""

import uuid
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from kb import clock
from kb.models import LoginAttempt, User

THROTTLE_WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_ACCOUNT = 5
MAX_FAILURES_PER_IP = 20


def normalize_email(email: str) -> str:
    return email.strip().lower()


def by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def is_throttled(db: Session, email: str, ip: str) -> bool:
    since = clock.now() - THROTTLE_WINDOW
    per_account = db.scalar(select(func.count()).select_from(LoginAttempt).where(
        LoginAttempt.email == normalize_email(email), LoginAttempt.at >= since))
    per_ip = db.scalar(select(func.count()).select_from(LoginAttempt).where(
        LoginAttempt.ip == ip, LoginAttempt.at >= since))
    return per_account >= MAX_FAILURES_PER_ACCOUNT or per_ip >= MAX_FAILURES_PER_IP


def record_failure(db: Session, email: str, ip: str) -> None:
    db.add(LoginAttempt(email=normalize_email(email)[:320], ip=ip[:64], at=clock.now()))
    db.execute(delete(LoginAttempt).where(LoginAttempt.at < clock.now() - THROTTLE_WINDOW))


def clear_failures(db: Session, email: str) -> None:
    db.execute(delete(LoginAttempt).where(LoginAttempt.email == normalize_email(email)))


def touch_login(db: Session, user: User) -> None:
    user.last_login_at = clock.now()
