"""Sammelt alle Router unter /api/v1."""

from fastapi import APIRouter

from kb.api import auth, users

api = APIRouter(prefix="/api/v1")
api.include_router(auth.router)
api.include_router(users.router)
