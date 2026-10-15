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


class LastAdminError(Exception):
    pass


class DuplicateEmailError(Exception):
    pass


def list_users(db: Session, q: str | None = None) -> list[User]:
    stmt = select(User).order_by(func.lower(User.name))
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(func.lower(User.name).like(like) | User.email.like(like))
    return list(db.scalars(stmt))


def create_user(db: Session, *, email: str, name: str, role: str, password_hash: str | None,
                must_change_password: bool = False, oidc_subject: str | None = None) -> User:
    email = normalize_email(email)
    if by_email(db, email) is not None:
        raise DuplicateEmailError(email)
    user = User(email=email, name=name.strip(), role=role, password_hash=password_hash,
                must_change_password=must_change_password, oidc_subject=oidc_subject)
    db.add(user)
    db.flush()
    return user


def _guard_last_admin(db: Session, losing: uuid.UUID) -> None:
    """Sperrt alle aktiven Admin-Zeilen und zählt in derselben Transaktion. Eine zweite,
    gleichzeitige Anfrage wartet auf die Sperre und sieht danach den neuen Stand — PostgreSQL
    prüft die WHERE-Bedingung gesperrter Zeilen nach dem Warten erneut.

    Muss die *erste* Sperre der Transaktion sein, in fester Reihenfolge (ORDER BY id): wer
    vorher schon die eigene Zeile sperrt und dann alle Admins will, verklemmt sich mit einer
    gleichzeitigen Anfrage, die es umgekehrt hält.
    """
    admin_ids = db.scalars(
        select(User.id).where(User.role == "admin", User.active.is_(True))
        .order_by(User.id).with_for_update()
    ).all()
    if losing in admin_ids and len(admin_ids) <= 1:
        raise LastAdminError()


def update_user(db: Session, user_id: uuid.UUID, *, name: str | None = None,
                role: str | None = None, active: bool | None = None) -> User | None:
    loses_admin = (role is not None and role != "admin") or active is False
    if loses_admin:
        _guard_last_admin(db, user_id)
    user = db.get(User, user_id, with_for_update=True)
    if user is None:
        return None
    if name is not None:
        user.name = name.strip()
    if role is not None:
        user.role = role
    if active is not None:
        user.active = active
        if not active:
            from kb.repo import sessions
            sessions.delete_for_user(db, user.id)
    db.flush()
    return user


def delete_user(db: Session, user_id: uuid.UUID) -> bool:
    _guard_last_admin(db, user_id)
    user = db.get(User, user_id, with_for_update=True)
    if user is None:
        return False
    db.delete(user)
    db.flush()
    return True
