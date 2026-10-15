"""Anhänge — ausgeliefert nur über die App, mit Rechteprüfung."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from kb import storage
from kb.config import Settings
from kb.db import DB
from kb.deps import current_user, get_settings
from kb.errors import AppError
from kb.models import Attachment, User
from kb.permissions import Level, require_page
from kb.repo import attachments as repo

router = APIRouter(tags=["attachments"])


class Uploader(BaseModel):
    id: uuid.UUID
    name: str


class AttachmentOut(BaseModel):
    id: uuid.UUID
    filename: str
    mime_type: str
    size: int
    url: str
    created_at: datetime
    listed: bool
    uploaded_by: Uploader | None = None


def att_out(a: Attachment, uploader: User | None = None) -> AttachmentOut:
    return AttachmentOut(id=a.id, filename=a.filename, mime_type=a.mime_type, size=a.size,
                         url=f"/api/v1/attachments/{a.id}", created_at=a.created_at, listed=a.listed,
                         uploaded_by=Uploader(id=uploader.id, name=uploader.name) if uploader else None)


def store_upload(db, user: User, page, stream, filename: str, settings: Settings,
                 listed: bool = True) -> Attachment:
    try:
        sha, size, head = storage.put(stream, settings.upload_dir, settings.max_upload_bytes)
    except storage.TooLarge:
        raise AppError(413, f"Die Datei ist größer als {settings.max_upload_mb} MB.") from None
    name = storage.clean_filename(filename)
    att = Attachment(page_id=page.id, sha256=sha, filename=name, mime_type=storage.sniff(head, name),
                     size=size, uploaded_by_id=user.id, listed=listed)
    db.add(att)
    db.flush()
    db.refresh(att)
    repo.refresh_text(db, page.id)
    return att


@router.post("/pages/{page_id}/attachments", status_code=201, response_model=AttachmentOut)
def upload(page_id: uuid.UUID, file: UploadFile, db: DB, user: User = Depends(current_user),
           settings: Settings = Depends(get_settings), listed: bool = True):
    """listed=false für Dateien, die der Editor in den Text einfügt — sie gehören nur dorthin."""
    page, _, _ = require_page(db, user, page_id, Level.EDIT)
    att = store_upload(db, user, page, file.file, file.filename or "datei", settings, listed=listed)
    return att_out(att, user)


@router.get("/pages/{page_id}/attachments", response_model=list[AttachmentOut])
def list_attachments(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, _, _ = require_page(db, user, page_id)
    return [att_out(a, u) for a, u in repo.list_for_page(db, page.id)]


def _attachment(db, user, att_id, need) -> Attachment:
    att = db.get(Attachment, att_id)
    if att is None:
        raise AppError(404, "Nicht gefunden.")
    require_page(db, user, att.page_id, need)
    return att


@router.get("/attachments/{att_id}")
def download(att_id: uuid.UUID, db: DB, user: User = Depends(current_user),
             settings: Settings = Depends(get_settings)):
    att = _attachment(db, user, att_id, Level.READ)
    path = storage.path_for(settings.upload_dir, att.sha256)
    if not path.exists():
        raise AppError(404, "Die Datei fehlt im Speicher.")
    inline = att.mime_type in storage.INLINE_TYPES
    return FileResponse(path, media_type=att.mime_type, filename=att.filename,
                        content_disposition_type="inline" if inline else "attachment",
                        headers={"X-Content-Type-Options": "nosniff",
                                 "Content-Security-Policy": "sandbox",
                                 "Cache-Control": "private, max-age=3600"})


@router.delete("/attachments/{att_id}", status_code=204)
def delete_attachment(att_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    att = _attachment(db, user, att_id, Level.EDIT)
    page_id = att.page_id
    db.delete(att)
    repo.refresh_text(db, page_id)
