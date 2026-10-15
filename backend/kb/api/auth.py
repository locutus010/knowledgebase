"""Lokale Anmeldung, Sitzung, Passwortwechsel."""

from fastapi import APIRouter, Depends, Request, Response
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from kb.config import Settings
from kb.db import DB
from kb.deps import COOKIE, Auth, check_origin, client_ip, current_auth, current_user, get_settings
from kb.errors import AppError
from kb.models import User
from kb.repo import sessions, users
from kb.repo.sessions import LIFETIME
from kb.security import MIN_PASSWORD_LEN, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


class PasswordIn(BaseModel):
    current: str = Field(default="", max_length=1024)
    new: str = Field(min_length=MIN_PASSWORD_LEN, max_length=1024)


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    avatar_color: Literal["teal", "indigo", "violet", "rose", "orange", "amber", "green", "slate"] | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Der Name darf nicht leer sein.")
        return v.strip() if v else v


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    avatar_color: str
    must_change_password: bool
    is_local: bool


class MeOut(BaseModel):
    user: UserOut
    csrf_token: str


def user_out(user: User) -> UserOut:
    return UserOut(id=str(user.id), email=user.email, name=user.name, role=user.role,
                   avatar_color=user.avatar_color, must_change_password=user.must_change_password,
                   is_local=user.password_hash is not None)


def start_session(response: Response, request: Request, db: Session, user: User, settings: Settings) -> None:
    token, _ = sessions.create(db, user, request.headers.get("user-agent", ""))
    users.touch_login(db, user)
    response.set_cookie(COOKIE, token, max_age=int(LIFETIME.total_seconds()), httponly=True,
                        samesite="lax", secure=settings.cookie_secure, path="/")


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: DB,
          settings: Settings = Depends(get_settings)):
    check_origin(request, settings)
    ip = client_ip(request)
    if users.is_throttled(db, body.email, ip):
        raise AppError(429, "Zu viele Fehlversuche. Versuche es in 15 Minuten erneut.")
    user = users.by_email(db, body.email)
    ok = verify_password(user.password_hash if user else None, body.password)
    if not ok or user is None or not user.active:
        users.record_failure(db, body.email, ip)
        db.commit()  # Fehlversuch muss auch bei der 401 gespeichert bleiben
        raise AppError(401, "E-Mail oder Passwort ist falsch.")
    users.clear_failures(db, body.email)
    start_session(response, request, db, user, settings)
    return {"ok": True}


@router.post("/logout", status_code=204)
def logout(response: Response, db: DB, auth: Auth = Depends(current_auth)):
    sessions.delete_token(db, auth.token)
    response.delete_cookie(COOKIE, path="/")


@router.get("/me", response_model=MeOut)
def me(auth: Auth = Depends(current_auth)):
    return MeOut(user=user_out(auth.user), csrf_token=auth.session.csrf_token)


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileIn, user: User = Depends(current_user)):
    if body.name is not None:
        user.name = body.name
    if body.avatar_color is not None:
        user.avatar_color = body.avatar_color
    return user_out(user)


@router.post("/password", status_code=204)
def change_password(body: PasswordIn, db: DB, user: User = Depends(current_user)):
    if user.password_hash is None:
        raise AppError(400, "Dein Konto meldet sich über SSO an und hat kein eigenes Passwort.")
    if not verify_password(user.password_hash, body.current):
        raise AppError(400, "Das aktuelle Passwort stimmt nicht.")
    user.password_hash = hash_password(body.new)
    user.must_change_password = False


@router.get("/config")
def auth_config(settings: Settings = Depends(get_settings)):
    return {"oidc_enabled": settings.oidc_enabled, "oidc_label": settings.oidc_button_label}
