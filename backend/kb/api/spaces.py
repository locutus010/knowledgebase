"""Bereiche und ihre Mitglieder."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from kb.db import DB
from kb.deps import current_user
from kb.errors import AppError
from kb.models import Space, User
from kb.permissions import Level, access, require_space
from kb.repo import spaces as repo
from kb.repo import users as users_repo

router = APIRouter(tags=["spaces"])

Color = Literal["teal", "indigo", "violet", "rose", "orange", "amber", "green", "slate"]
DefaultAccess = Literal["none", "read", "edit"]
MemberLevel = Literal["read", "edit", "manage"]


class SpaceOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    icon: str
    color: str
    description: str
    default_access: str
    my_level: str
    page_count: int
    archived: bool


class SpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: str = Field(default="📘", max_length=16)
    color: Color = "teal"
    description: str = Field(default="", max_length=2000)
    default_access: DefaultAccess = "read"


class SpacePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    icon: str | None = Field(default=None, max_length=16)
    color: Color | None = None
    description: str | None = Field(default=None, max_length=2000)
    default_access: DefaultAccess | None = None
    archived: bool | None = None


class MemberIn(BaseModel):
    level: MemberLevel


class MemberOut(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    avatar_color: str
    level: str


class DirectoryUser(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    avatar_color: str


def space_out(space: Space, level: Level, count: int) -> SpaceOut:
    return SpaceOut(id=space.id, slug=space.slug, name=space.name, icon=space.icon,
                    color=space.color, description=space.description,
                    default_access=space.default_access, my_level=level.label,
                    page_count=count, archived=space.archived_at is not None)


@router.get("/spaces", response_model=list[SpaceOut])
def list_spaces(db: DB, user: User = Depends(current_user), archived: bool = False):
    return [space_out(s, access(db, user, s), n) for s, n in repo.list_readable(db, user, archived)]


@router.post("/spaces", status_code=201, response_model=SpaceOut)
def create_space(body: SpaceCreate, db: DB, user: User = Depends(current_user)):
    if user.role not in ("admin", "editor"):
        raise AppError(403, "Nur Redakteure und Administratoren legen Bereiche an.")
    space = repo.create(db, user, name=body.name.strip(), icon=body.icon, color=body.color,
                        description=body.description, default_access=body.default_access)
    return space_out(space, Level.MANAGE, 0)


@router.get("/spaces/{slug}", response_model=SpaceOut)
def get_space(slug: str, db: DB, user: User = Depends(current_user)):
    space, level = require_space(db, user, slug)
    return space_out(space, level, repo.page_count(db, space))


@router.patch("/spaces/{slug}", response_model=SpaceOut)
def patch_space(slug: str, body: SpacePatch, db: DB, user: User = Depends(current_user)):
    space, level = require_space(db, user, slug, Level.MANAGE)
    data = body.model_dump(exclude_none=True)
    archived = data.pop("archived", None)
    for key, value in data.items():
        setattr(space, key, value.strip() if key == "name" else value)
    if archived is not None:
        repo.set_archived(space, archived)
    db.flush()
    return space_out(space, level, repo.page_count(db, space))


@router.delete("/spaces/{slug}", status_code=204)
def delete_space(slug: str, db: DB, user: User = Depends(current_user)):
    space, _ = require_space(db, user, slug, Level.READ)
    if user.role != "admin":
        raise AppError(403, "Nur Administratoren löschen Bereiche endgültig. Archivieren geht auch so.")
    db.delete(space)


@router.get("/spaces/{slug}/members", response_model=list[MemberOut])
def list_members(slug: str, db: DB, user: User = Depends(current_user)):
    space, _ = require_space(db, user, slug, Level.MANAGE)
    return [MemberOut(user_id=u.id, name=u.name, email=u.email, avatar_color=u.avatar_color,
                      level=m.level) for m, u in repo.members(db, space)]


@router.put("/spaces/{slug}/members/{user_id}", response_model=MemberOut)
def put_member(slug: str, user_id: uuid.UUID, body: MemberIn, db: DB,
               user: User = Depends(current_user)):
    space, _ = require_space(db, user, slug, Level.MANAGE)
    target = users_repo.by_id(db, user_id)
    if target is None:
        raise AppError(404, "Benutzer nicht gefunden.")
    member = repo.set_member(db, space, user_id, body.level)
    return MemberOut(user_id=target.id, name=target.name, email=target.email,
                     avatar_color=target.avatar_color, level=member.level)


@router.delete("/spaces/{slug}/members/{user_id}", status_code=204)
def delete_member(slug: str, user_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    space, _ = require_space(db, user, slug, Level.MANAGE)
    if not repo.remove_member(db, space, user_id):
        raise AppError(404, "Mitglied nicht gefunden.")


@router.get("/directory/users", response_model=list[DirectoryUser])
def directory(db: DB, user: User = Depends(current_user),
              q: str | None = Query(default=None, max_length=100)):
    return [DirectoryUser(id=u.id, name=u.name, email=u.email, avatar_color=u.avatar_color)
            for u in repo.directory(db, q)]
