"""Gemeinsame Abhängigkeiten. `current_user` ist die einzige Stelle, die Sitzung und
CSRF-Token prüft — jede schreibende Route mit Anmeldung ist damit automatisch geschützt."""

import hmac
from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from kb.config import Settings
from kb.db import DB
from kb.errors import AppError
from kb.models import Session_, User
from kb.repo import sessions

COOKIE = "kb_session"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


@dataclass
class Auth:
    user: User
    session: Session_
    token: str


def current_auth(request: Request, db: DB) -> Auth:
    token = request.cookies.get(COOKIE)
    found = sessions.lookup(db, token) if token else None
    if found is None:
        raise AppError(401, "Bitte melde dich an.")
    sess, user = found
    if request.method not in SAFE_METHODS:
        sent = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(sent.encode(), sess.csrf_token.encode()):
            raise AppError(403, "Sicherheitstoken fehlt oder ist ungültig.")
    return Auth(user=user, session=sess, token=token)


def current_user(auth: Auth = Depends(current_auth)) -> User:
    return auth.user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise AppError(403, "Nur für Administratoren.")
    return user


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unbekannt"


def check_origin(request: Request, settings: Settings) -> None:
    origin = request.headers.get("origin")
    if settings.domain and origin and origin != f"https://{settings.domain}":
        raise AppError(403, "Anfrage von fremder Herkunft abgelehnt.")
