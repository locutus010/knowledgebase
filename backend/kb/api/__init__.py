"""Sammelt alle Router unter /api/v1."""

from fastapi import APIRouter

from kb.api import attachments, auth, pages, personal, search, spaces, templates, transfer, users

api = APIRouter(prefix="/api/v1")
api.include_router(auth.router)
api.include_router(users.router)
api.include_router(spaces.router)
api.include_router(pages.router)
api.include_router(personal.router)
api.include_router(templates.router)
api.include_router(search.router)
api.include_router(attachments.router)
api.include_router(transfer.router)
