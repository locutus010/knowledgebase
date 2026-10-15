"""Export und Import."""

import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, UploadFile
from fastapi.responses import Response, StreamingResponse

from kb import transfer
from kb.config import Settings
from kb.db import DB
from kb.deps import current_user, get_settings
from kb.errors import AppError
from kb.markdown_io import safe_name
from kb.models import User
from kb.permissions import Level, require_page, require_space
from kb.repo import pages as pages_repo
from kb.repo.users import by_id

router = APIRouter(tags=["transfer"])


def _disposition(name: str) -> str:
    ascii_name = name.encode("ascii", "replace").decode().replace("?", "_").replace('"', "")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"


@router.get("/pages/{page_id}/export.md")
def export_page(page_id: uuid.UUID, db: DB, user: User = Depends(current_user)):
    page, _, _ = require_page(db, user, page_id)
    author = by_id(db, page.updated_by_id) if page.updated_by_id else None
    text = transfer.page_markdown(page, pages_repo.tag_names(db, page), author.name if author else None)
    return Response(text, media_type="text/markdown; charset=utf-8",
                    headers={"Content-Disposition": _disposition(f"{safe_name(page.title)}.md")})


@router.get("/spaces/{slug}/export.zip")
def export_space(slug: str, db: DB, user: User = Depends(current_user),
                 settings: Settings = Depends(get_settings)):
    space, _ = require_space(db, user, slug)
    f = transfer.export_space(db, space, settings)

    def chunks():
        with f:
            while data := f.read(1024 * 1024):
                yield data

    return StreamingResponse(chunks(), media_type="application/zip",
                             headers={"Content-Disposition": _disposition(f"{safe_name(space.name)}.zip")})


@router.post("/spaces/{slug}/import")
def import_into_space(slug: str, file: UploadFile, db: DB, user: User = Depends(current_user),
                      settings: Settings = Depends(get_settings)):
    space, _ = require_space(db, user, slug, Level.MANAGE)
    try:
        report = transfer.import_upload(db, user, space, file.filename or "import.zip", file.file, settings)
    except transfer.ImportError_ as e:
        # Die AppError läuft durch get_db, das die Transaktion zurückrollt.
        raise AppError(422, str(e)) from None
    return {"pages": report.pages, "attachments": report.attachments, "skipped": report.skipped}
