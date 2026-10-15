"""Vorlagen: global (Admin) oder je Bereich (manage)."""

import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from kb.db import DB
from kb.deps import current_user
from kb.errors import AppError
from kb.models import Space, Template, User
from kb.permissions import Level, access, check, require_space
from kb.repo import templates as repo

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    icon: str = Field(default="📄", max_length=16)
    content_md: str = Field(default="", max_length=500_000)
    space_slug: str | None = Field(default=None, max_length=80)


class TemplatePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    icon: str | None = Field(default=None, max_length=16)
    content_md: str | None = Field(default=None, max_length=500_000)


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    icon: str
    content_md: str
    space_slug: str | None
    can_edit: bool


def _level(db, user: User, t: Template) -> tuple[Level, Space | None]:
    """Recht an einer Vorlage: global → lesen alle, bearbeiten Admins; im Bereich → wie dort."""
    if t.space_id is None:
        return (Level.MANAGE if user.role == "admin" else Level.READ), None
    space = db.get(Space, t.space_id)
    return access(db, user, space), space


def _out(t: Template, space: Space | None, level: Level) -> TemplateOut:
    return TemplateOut(id=t.id, name=t.name, description=t.description, icon=t.icon,
                       content_md=t.content_md, space_slug=space.slug if space else None,
                       can_edit=level >= Level.MANAGE)


def _get(db, user, template_id, need) -> tuple[Template, Space | None, Level]:
    t = db.get(Template, template_id)
    if t is None:
        raise AppError(404, "Nicht gefunden.")
    level, space = _level(db, user, t)
    check(level, need)
    return t, space, level


@router.get("", response_model=list[TemplateOut])
def list_templates(db: DB, user: User = Depends(current_user),
                   space: str | None = Query(default=None, max_length=80)):
    sp = require_space(db, user, space)[0] if space else None
    out = []
    for t in repo.list_for(db, sp):
        level, tsp = _level(db, user, t)
        out.append(_out(t, tsp, level))
    return out


@router.post("", status_code=201, response_model=TemplateOut)
def create_template(body: TemplateIn, db: DB, user: User = Depends(current_user)):
    space = None
    if body.space_slug:
        space, _ = require_space(db, user, body.space_slug, Level.MANAGE)
    elif user.role != "admin":
        raise AppError(403, "Globale Vorlagen legen nur Administratoren an.")
    t = Template(name=body.name.strip(), description=body.description, icon=body.icon,
                 content_md=body.content_md, space_id=space.id if space else None,
                 created_by_id=user.id)
    db.add(t)
    db.flush()
    return _out(t, space, Level.MANAGE)


@router.patch("/{template_id}", response_model=TemplateOut)
def patch_template(template_id: uuid.UUID, body: TemplatePatch, db: DB,
                   user: User = Depends(current_user)):
    t, space, level = _get(db, user, template_id, Level.MANAGE)
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(t, key, value)
    db.flush()
    return _out(t, space, level)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    t, _, _ = _get(db, user, template_id, Level.MANAGE)
    db.delete(t)
