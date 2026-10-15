"""Tags einer Seite, Favoriten und persönliche Startseite."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator

from kb.db import DB
from kb.deps import current_user
from kb.models import User
from kb.permissions import Level, require_page, require_space
from kb.repo import personal
from kb.repo import tags as tags_repo

router = APIRouter(tags=["personal"])


class TagsIn(BaseModel):
    tags: list[str] = Field(max_length=20)

    @field_validator("tags")
    @classmethod
    def _norm(cls, v: list[str]) -> list[str]:
        out = []
        for t in v:
            t = " ".join(t.strip().lower().split())
            if not t:
                continue
            if len(t) > 32:
                raise ValueError("Ein Tag darf höchstens 32 Zeichen lang sein.")
            out.append(t)
        return out


class SpaceRef(BaseModel):
    slug: str
    name: str
    color: str
    icon: str


class PageCard(BaseModel):
    id: uuid.UUID
    title: str
    icon: str
    space: SpaceRef
    at: datetime


class Home(BaseModel):
    recent_views: list[PageCard]
    recent_changes: list[PageCard]
    favorites: list[PageCard]


def _cards(rows) -> list[PageCard]:
    return [PageCard(id=r["page"].id, title=r["page"].title, icon=r["page"].icon, at=r["at"],
                     space=SpaceRef(slug=r["space"].slug, name=r["space"].name,
                                    color=r["space"].color, icon=r["space"].icon)) for r in rows]


@router.put("/pages/{page_id}/tags", response_model=list[str])
def put_tags(page_id: uuid.UUID, body: TagsIn, db: DB, user: User = Depends(current_user)):
    page, _, _ = require_page(db, user, page_id, Level.EDIT)
    return tags_repo.set_tags(db, page, body.tags)


@router.get("/spaces/{slug}/tags")
def space_tags(slug: str, db: DB, user: User = Depends(current_user)):
    space, _ = require_space(db, user, slug)
    return tags_repo.space_tags(db, space)


class PageListItem(BaseModel):
    id: uuid.UUID
    title: str
    icon: str
    updated_at: datetime


@router.get("/spaces/{slug}/pages", response_model=list[PageListItem])
def pages_by_tag(slug: str, db: DB, user: User = Depends(current_user),
                 tag: str = Query(min_length=1, max_length=32)):
    space, _ = require_space(db, user, slug)
    return [PageListItem(id=p.id, title=p.title, icon=p.icon, updated_at=p.updated_at)
            for p in tags_repo.pages_with_tag(db, space, tag)]


@router.get("/me/home", response_model=Home)
def home(db: DB, user: User = Depends(current_user)):
    return Home(recent_views=_cards(personal.recent_views(db, user)),
                recent_changes=_cards(personal.recent_changes(db, user)),
                favorites=_cards(personal.favorites(db, user)))


@router.put("/me/favorites/{page_id}", status_code=204)
def add_favorite(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, _, _ = require_page(db, user, page_id)
    personal.add_favorite(db, user, page)


@router.delete("/me/favorites/{page_id}", status_code=204)
def remove_favorite(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, _, _ = require_page(db, user, page_id, include_deleted=True)
    personal.remove_favorite(db, user, page)
