"""Volltextsuche über alle lesbaren Bereiche."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from kb.api.personal import SpaceRef
from kb.db import DB
from kb.deps import current_user
from kb.models import User
from kb.repo import search as repo

router = APIRouter(tags=["search"])


class Hit(BaseModel):
    page_id: uuid.UUID
    title: str
    icon: str
    space: SpaceRef
    snippet_html: str
    updated_at: datetime


class SearchOut(BaseModel):
    total: int
    results: list[Hit]


@router.get("/search", response_model=SearchOut)
def search(db: DB, user: User = Depends(current_user), q: str = Query(default="", max_length=500),
           space: str | None = Query(default=None, max_length=80),
           tag: str | None = Query(default=None, max_length=32),
           limit: int = Query(default=20, ge=1, le=100), offset: int = Query(default=0, ge=0, le=100_000)):
    total, rows = repo.search(db, user, q, space_slug=space, tag=tag, limit=limit, offset=offset)
    return SearchOut(total=total, results=[
        Hit(page_id=r["page"].id, title=r["page"].title, icon=r["page"].icon,
            space=SpaceRef(slug=r["space"].slug, name=r["space"].name, color=r["space"].color,
                           icon=r["space"].icon),
            snippet_html=r["snippet_html"], updated_at=r["page"].updated_at) for r in rows])
