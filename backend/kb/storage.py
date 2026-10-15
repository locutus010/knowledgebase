"""Anhang-Ablage nach Inhalts-Hash: uploads/ab/cd/<sha256>. Geschrieben wird über eine
temporäre Datei mit fsync und rename — eine halbe Datei liegt nie unter ihrem Hash."""

import hashlib
import mimetypes
import os
import re
import secrets
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

CHUNK = 1024 * 1024
INLINE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
# Typen, die der Browser selbst aus einem fremden Anhang nie ausführt; alles andere, was
# nach HTML, SVG oder Skript aussieht, wird zu octet-stream.
_SAFE_GUESS = {"application/pdf", "text/plain", "text/markdown", "text/csv", "application/zip",
               "application/json", "application/msword", "application/vnd.ms-excel",
               "application/vnd.ms-powerpoint"}
_SAFE_PREFIX = ("application/vnd.openxmlformats-officedocument.", "application/vnd.oasis.opendocument.",
                "audio/", "video/")


class TooLarge(Exception):
    pass


def path_for(root: Path, sha: str) -> Path:
    return root / sha[:2] / sha[2:4] / sha


def put(stream: BinaryIO, root: Path, max_bytes: int) -> tuple[str, int, bytes]:
    """Gibt (sha256, Größe, erste Bytes) zurück."""
    tmp_dir = root / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp = tmp_dir / secrets.token_hex(16)
    digest = hashlib.sha256()
    size = 0
    head = b""
    try:
        with open(tmp, "wb") as out:
            while chunk := stream.read(CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    raise TooLarge()
                if len(head) < 64:
                    head += chunk[:64 - len(head)]
                digest.update(chunk)
                out.write(chunk)
            out.flush()
            os.fsync(out.fileno())
        sha = digest.hexdigest()
        target = path_for(root, sha)
        if target.exists():
            tmp.unlink()
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(tmp, target)
        return sha, size, head
    finally:
        tmp.unlink(missing_ok=True)


def sniff(head: bytes, filename: str) -> str:
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    guess = mimetypes.guess_type(filename)[0] or ""
    if guess in _SAFE_GUESS or guess.startswith(_SAFE_PREFIX):
        return guess
    return "application/octet-stream"


def clean_filename(name: str) -> str:
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip().strip(".")
    return name[:255] or "datei"


def gc(db: Session, root: Path) -> int:
    from kb.models import Attachment

    known = set(db.scalars(select(Attachment.sha256).distinct()))
    removed = 0
    if not root.exists():
        return 0
    for f in root.glob("??/??/*"):
        if f.is_file() and f.name not in known:
            f.unlink()
            removed += 1
    return removed
