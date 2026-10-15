"""Benutzerverwaltung — nur für Administratoren."""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from kb.db import DB
from kb.deps import require_admin
from kb.errors import AppError
from kb.models import User
from kb.repo import users as repo
from kb.security import MIN_PASSWORD_LEN, hash_password, one_time_password

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])

Role = Literal["admin", "editor", "reader"]
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
LAST_ADMIN = "Der letzte aktive Administrator kann nicht entfernt werden."


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: str
    active: bool
    is_local: bool
    is_sso: bool
    avatar_color: str
    created_at: datetime
    last_login_at: datetime | None


class UserCreate(BaseModel):
    email: str = Field(max_length=320, pattern=EMAIL_PATTERN)
    name: str = Field(min_length=1, max_length=120)
    role: Role = "reader"
    password: str | None = Field(default=None, min_length=MIN_PASSWORD_LEN, max_length=1024)


class UserPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    active: bool | None = None


def admin_user_out(u: User) -> AdminUserOut:
    return AdminUserOut(id=u.id, email=u.email, name=u.name, role=u.role, active=u.active,
                        is_local=u.password_hash is not None, is_sso=u.oidc_subject is not None,
                        avatar_color=u.avatar_color, created_at=u.created_at,
                        last_login_at=u.last_login_at)


@router.get("", response_model=list[AdminUserOut])
def list_users(db: DB, q: str | None = None):
    return [admin_user_out(u) for u in repo.list_users(db, q)]


@router.post("", status_code=201)
def create_user(body: UserCreate, db: DB):
    otp = None if body.password else one_time_password()
    try:
        user = repo.create_user(db, email=body.email, name=body.name, role=body.role,
                                password_hash=hash_password(body.password or otp),
                                must_change_password=otp is not None)
    except repo.DuplicateEmailError:
        raise AppError(409, "Diese E-Mail ist bereits vergeben.") from None
    db.refresh(user)
    return {"user": admin_user_out(user), "one_time_password": otp}


@router.patch("/{user_id}", response_model=AdminUserOut)
def patch_user(user_id: uuid.UUID, body: UserPatch, db: DB):
    try:
        user = repo.update_user(db, user_id, name=body.name, role=body.role, active=body.active)
    except repo.LastAdminError:
        raise AppError(409, LAST_ADMIN) from None
    if user is None:
        raise AppError(404, "Benutzer nicht gefunden.")
    return admin_user_out(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: uuid.UUID, db: DB):
    try:
        found = repo.delete_user(db, user_id)
    except repo.LastAdminError:
        raise AppError(409, LAST_ADMIN) from None
    if not found:
        raise AppError(404, "Benutzer nicht gefunden.")


@router.post("/{user_id}/reset-password")
def reset_password(user_id: uuid.UUID, db: DB):
    user = repo.by_id(db, user_id)
    if user is None:
        raise AppError(404, "Benutzer nicht gefunden.")
    otp = one_time_password()
    user.password_hash = hash_password(otp)
    user.must_change_password = True
    return {"one_time_password": otp}
