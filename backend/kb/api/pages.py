"""Seiten, Baum, Papierkorb und Revisionen."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator

from kb.db import DB
from kb.deps import current_user
from kb.errors import AppError
from kb.models import Page, Space, User
from kb.permissions import Level, access, check, require_page, require_space
from kb.repo import pages as repo
from kb.repo import revisions as rev_repo
from kb.repo.users import by_id

router = APIRouter(tags=["pages"])

MAX_CONTENT = 2_000_000
MAX_POSITION = 1_000_000


def _title(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError("Der Titel darf nicht leer sein.")
    return v


class PageCreate(BaseModel):
    title: str = Field(max_length=200)
    parent_id: uuid.UUID | None = None
    content_md: str = Field(default="", max_length=MAX_CONTENT)
    icon: str = Field(default="", max_length=16)
    template_id: uuid.UUID | None = None

    _t = field_validator("title")(_title)


class PagePatch(BaseModel):
    base_version: int = Field(ge=1, le=10**9)
    edit_session: str | None = Field(default=None, max_length=64)
    title: str | None = Field(default=None, max_length=200)
    content_md: str | None = Field(default=None, max_length=MAX_CONTENT)
    icon: str | None = Field(default=None, max_length=16)

    _t = field_validator("title")(_title)


class MoveIn(BaseModel):
    parent_id: uuid.UUID | None
    position: int = Field(ge=0, le=MAX_POSITION)
    space_slug: str | None = Field(default=None, max_length=80)


class PersonRef(BaseModel):
    id: uuid.UUID
    name: str


class SpaceRef(BaseModel):
    slug: str
    name: str
    color: str
    icon: str


class Crumb(BaseModel):
    id: uuid.UUID
    title: str
    icon: str


class PageOut(BaseModel):
    id: uuid.UUID
    title: str
    icon: str
    content_md: str
    parent_id: uuid.UUID | None
    position: int
    version: int
    created_at: datetime
    updated_at: datetime
    created_by: PersonRef | None
    updated_by: PersonRef | None
    space: SpaceRef
    breadcrumbs: list[Crumb]
    tags: list[str]
    is_favorite: bool
    my_level: str


class TreeNode(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    title: str
    icon: str
    position: int
    has_children: bool


class TrashItem(BaseModel):
    id: uuid.UUID
    title: str
    icon: str
    deleted_at: datetime


class RevisionMeta(BaseModel):
    version: int
    number: int
    title: str
    author: PersonRef | None
    created_at: datetime


class RevisionOut(RevisionMeta):
    content_md: str


def _person(db, user_id) -> PersonRef | None:
    u = by_id(db, user_id) if user_id else None
    return PersonRef(id=u.id, name=u.name) if u else None


def page_out(db, user: User, page: Page, space: Space, level: Level) -> PageOut:
    return PageOut(
        id=page.id, title=page.title, icon=page.icon, content_md=page.content_md,
        parent_id=page.parent_id, position=page.position, version=page.version,
        created_at=page.created_at, updated_at=page.updated_at,
        created_by=_person(db, page.created_by_id), updated_by=_person(db, page.updated_by_id),
        space=SpaceRef(slug=space.slug, name=space.name, color=space.color, icon=space.icon),
        breadcrumbs=[Crumb(id=p.id, title=p.title, icon=p.icon) for p in repo.ancestors(db, page)],
        tags=repo.tag_names(db, page), is_favorite=repo.is_favorite(db, user, page),
        my_level=level.label,
    )


@router.get("/spaces/{slug}/tree", response_model=list[TreeNode])
def get_tree(slug: str, db: DB, user: User = Depends(current_user)):
    space, _ = require_space(db, user, slug)
    return repo.tree(db, space)


@router.post("/spaces/{slug}/pages", status_code=201, response_model=PageOut)
def create_page(slug: str, body: PageCreate, db: DB, user: User = Depends(current_user)):
    space, level = require_space(db, user, slug, Level.EDIT)
    content = body.content_md
    if body.template_id is not None:
        tpl = repo.template(db, body.template_id)
        if tpl is None or (tpl.space_id is not None and access(db, user, db.get(Space, tpl.space_id)) < Level.READ):
            raise AppError(404, "Vorlage nicht gefunden.")
        content = repo.render_template(tpl.content_md, author=user, title=body.title)
        if not body.icon:
            body.icon = tpl.icon
    try:
        page = repo.create(db, user, space, title=body.title, parent_id=body.parent_id,
                           content_md=content, icon=body.icon)
    except repo.TreeError as e:
        raise AppError(422, str(e)) from None
    return page_out(db, user, page, space, level)


@router.get("/pages/{page_id}", response_model=PageOut)
def get_page(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, space, level = require_page(db, user, page_id)
    repo.record_view(db, user, page)
    return page_out(db, user, page, space, level)


@router.patch("/pages/{page_id}", response_model=PageOut)
def patch_page(page_id: uuid.UUID, body: PagePatch, db: DB, user: User = Depends(current_user)):
    page, space, level = require_page(db, user, page_id, Level.EDIT)
    try:
        repo.save(db, user, page, base_version=body.base_version, title=body.title,
                  content_md=body.content_md, icon=body.icon, edit_session=body.edit_session)
    except repo.ConflictError as e:
        cur = e.page
        updated_by = _person(db, cur.updated_by_id)
        raise AppError(409, "Die Seite wurde inzwischen geändert.", current={
            "version": cur.version, "title": cur.title, "content_md": cur.content_md,
            "updated_by": updated_by.name if updated_by else None,
        }) from None
    return page_out(db, user, page, space, level)


@router.post("/pages/{page_id}/move", response_model=PageOut)
def move_page(page_id: uuid.UUID, body: MoveIn, db: DB, user: User = Depends(current_user)):
    page, space, _ = require_page(db, user, page_id, Level.EDIT)
    target = space
    if body.space_slug and body.space_slug != space.slug:
        target, _ = require_space(db, user, body.space_slug, Level.EDIT)
    try:
        repo.move(db, page, target_space=target, parent_id=body.parent_id, position=body.position)
    except repo.TreeError as e:
        raise AppError(422, str(e)) from None
    return page_out(db, user, page, target, access(db, user, target))


@router.delete("/pages/{page_id}", status_code=204)
def trash_page(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, _, _ = require_page(db, user, page_id, Level.EDIT)
    repo.trash(db, page)


def _trashed(db, user, page_id, need):
    page, space, level = require_page(db, user, page_id, need, include_deleted=True)
    if page.deleted_at is None:
        raise AppError(409, "Die Seite liegt nicht im Papierkorb.")
    return page, space, level


@router.post("/pages/{page_id}/restore", response_model=PageOut)
def restore_page(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, space, level = _trashed(db, user, page_id, Level.EDIT)
    repo.restore(db, page)
    return page_out(db, user, page, space, level)


@router.delete("/pages/{page_id}/purge", status_code=204)
def purge_page(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, space, level = require_page(db, user, page_id, Level.READ, include_deleted=True)
    check(level, Level.MANAGE)
    if page.deleted_at is None:
        raise AppError(409, "Nur Seiten im Papierkorb lassen sich endgültig löschen.")
    repo.purge(db, page)


@router.get("/spaces/{slug}/trash", response_model=list[TrashItem])
def get_trash(slug: str, db: DB, user: User = Depends(current_user)):
    space, _ = require_space(db, user, slug, Level.EDIT)
    return [TrashItem(id=p.id, title=p.title, icon=p.icon, deleted_at=p.deleted_at)
            for p in repo.trash_list(db, space)]


@router.get("/pages/{page_id}/revisions", response_model=list[RevisionMeta])
def list_revisions(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, _, _ = require_page(db, user, page_id)
    return [RevisionMeta(version=r.version, number=n, title=r.title, author=_person(db, r.author_id),
                         created_at=r.created_at) for r, n in rev_repo.list_for(db, page)]


def _revision(db, page, version):
    if not 1 <= version <= 10**9:
        raise AppError(404, "Version nicht gefunden.")
    rev = rev_repo.get(db, page, version)
    if rev is None:
        raise AppError(404, "Version nicht gefunden.")
    return rev


@router.get("/pages/{page_id}/revisions/{version}", response_model=RevisionOut)
def get_revision(page_id: uuid.UUID, version: int, db: DB, user: User = Depends(current_user)):
    page, _, _ = require_page(db, user, page_id)
    r = _revision(db, page, version)
    return RevisionOut(version=r.version, number=rev_repo.number_of(db, page, r.version), title=r.title,
                       author=_person(db, r.author_id), created_at=r.created_at, content_md=r.content_md)


@router.post("/pages/{page_id}/revisions/{version}/restore", response_model=PageOut)
def restore_revision(page_id: uuid.UUID, version: int, db: DB, user: User = Depends(current_user)):
    page, space, level = require_page(db, user, page_id, Level.EDIT)
    r = _revision(db, page, version)
    repo.save(db, user, page, base_version=page.version, title=r.title, content_md=r.content_md,
              merge=False)  # eine Wiederherstellung bleibt als eigene Version sichtbar
    return page_out(db, user, page, space, level)
