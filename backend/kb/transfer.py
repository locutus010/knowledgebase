"""Export eines Bereichs als ZIP und Import aus ZIP oder einzelner Markdown-Datei."""

import io
import posixpath
import re
import tempfile
import zipfile
from dataclasses import dataclass, field
from urllib.parse import unquote

from sqlalchemy import select
from sqlalchemy.orm import Session

from kb import storage
from kb.config import Settings
from kb.markdown_io import ATTACHMENT_URL, is_safe_path, parse_md, render_md, safe_name
from kb.models import Attachment, Page, Space, User
from kb.repo import pages as pages_repo
from kb.repo import tags as tags_repo

MAX_ENTRIES = 5000
MAX_UNPACKED = 200 * 1024 * 1024
MD_EXT = {".md", ".markdown"}
ASSET_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".txt", ".csv", ".docx",
             ".xlsx", ".pptx", ".odt", ".ods", ".odp", ".zip", ".mp4", ".mp3"}
_LINK = re.compile(r"(!?)\[([^\]]*)\]\(([^)\s]+)\)")
_WIKI_EMBED = re.compile(r"!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")


class ImportError_(Exception):
    pass


# ---------------------------------------------------------------- Export

def page_markdown(page: Page, tags: list[str], author: str | None,
                  attachments: list[str] | None = None) -> str:
    meta = {"title": page.title}
    if tags:
        meta["tags"] = tags
    if attachments:
        # Relative Pfade aller Anhänge der Seite — auch derer, die nirgends im Text stehen.
        # Der Import hängt sie darüber wieder an dieselbe Seite.
        meta["attachments"] = attachments
    meta["updated_at"] = page.updated_at.isoformat()
    if author:
        meta["author"] = author
    return render_md(meta, page.content_md)


def export_space(db: Session, space: Space, settings: Settings):
    """Schreibt das ZIP in eine Temp-Datei und gibt sie zurück (Position 0). Gestreamt wird
    danach aus der Datei — die DB-Session ist bis dahin längst zu."""
    pages = list(db.scalars(select(Page).where(Page.space_id == space.id, Page.deleted_at.is_(None))
                            .order_by(Page.position, Page.title)))
    by_parent: dict = {}
    for p in pages:
        by_parent.setdefault(p.parent_id, []).append(p)
    ids = {p.id for p in pages}
    attachments = list(db.scalars(select(Attachment).where(Attachment.page_id.in_(ids)))) if ids else []
    att_path = {a.id: f"_attachments/{str(a.id)[:8]}-{storage.clean_filename(a.filename)}" for a in attachments}
    att_by_page: dict = {}
    for a in attachments:
        att_by_page.setdefault(a.page_id, []).append(a)
    authors = {u.id: u.name for u in db.scalars(select(User).where(
        User.id.in_({p.updated_by_id for p in pages if p.updated_by_id})))}

    out = tempfile.SpooledTemporaryFile(max_size=16 * 1024 * 1024)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        def walk(parent_id, folder: str):
            used: set[str] = set()
            for p in by_parent.get(parent_id, []):
                base = safe_name(p.title)
                name, n = base, 2
                while name.lower() in used:
                    name, n = f"{base} ({n})", n + 1
                used.add(name.lower())
                children = by_parent.get(p.id)
                path = f"{folder}{name}/index.md" if children else f"{folder}{name}.md"
                up = "../" * path.count("/")

                def relink(m, up=up):
                    import uuid as _uuid
                    target = att_path.get(_uuid.UUID(m.group(1)))
                    return f"{up}{target}" if target else m.group(0)

                own = [f"{up}{att_path[a.id]}" for a in att_by_page.get(p.id, [])]
                text = page_markdown(p, pages_repo.tag_names(db, p), authors.get(p.updated_by_id), own)
                z.writestr(path, ATTACHMENT_URL.sub(relink, text))
                if children:
                    walk(p.id, f"{folder}{name}/")

        walk(None, "")
        for a in attachments:
            src = storage.path_for(settings.upload_dir, a.sha256)
            if src.exists():
                z.write(src, att_path[a.id])
    out.seek(0)
    return out


# ---------------------------------------------------------------- Import

@dataclass
class Report:
    pages: int = 0
    attachments: int = 0
    skipped: list[str] = field(default_factory=list)


_EXPORT_PREFIX = re.compile(r"^[0-9a-f]{8}-(.+)$")


def _original_name(asset_name: str) -> str:
    """Der Export legt Anhänge als _attachments/<id8>-<name> ab; beim Import zählt <name>."""
    name = posixpath.basename(asset_name)
    m = _EXPORT_PREFIX.match(name)
    return m.group(1) if m and asset_name.startswith("_attachments/") else name


def _ext(name: str) -> str:
    return posixpath.splitext(name)[1].lower()


def _hidden(name: str) -> bool:
    return any(part.startswith(".") or part == "__MACOSX" for part in name.split("/"))


def _read(z: zipfile.ZipFile, info: zipfile.ZipInfo, budget: list[int]) -> bytes:
    with z.open(info) as f:
        data = f.read(budget[0] + 1)
    budget[0] -= len(data)
    if budget[0] < 0:
        raise ImportError_("Das Archiv ist entpackt größer als 200 MB.")
    return data


def import_upload(db: Session, user: User, space: Space, filename: str, fileobj,
                  settings: Settings) -> Report:
    if _ext(filename) in MD_EXT:
        text = fileobj.read(MAX_UNPACKED + 1)
        if len(text) > MAX_UNPACKED:
            raise ImportError_("Die Datei ist zu groß.")
        return _import_files(db, user, space, {posixpath.basename(filename): text}, {}, settings, Report())
    try:
        z = zipfile.ZipFile(fileobj)
    except zipfile.BadZipFile:
        raise ImportError_("Die Datei ist weder ein ZIP-Archiv noch eine Markdown-Datei.") from None
    infos = z.infolist()
    if len(infos) > MAX_ENTRIES:
        raise ImportError_(f"Das Archiv enthält mehr als {MAX_ENTRIES} Einträge.")
    if sum(i.file_size for i in infos) > MAX_UNPACKED:
        raise ImportError_("Das Archiv ist entpackt größer als 200 MB.")
    for i in infos:
        if not is_safe_path(i.filename):
            raise ImportError_(f"Unzulässiger Pfad im Archiv: {i.filename}")
    report = Report()
    budget = [MAX_UNPACKED]
    md, assets = {}, {}
    for i in infos:
        name = posixpath.normpath(i.filename)
        if i.is_dir() or _hidden(name):
            continue
        ext = _ext(name)
        if ext in MD_EXT:
            md[name] = _read(z, i, budget)
        elif ext in ASSET_EXT:
            assets[name] = i
        else:
            report.skipped.append(name)
    return _import_files(db, user, space, md, {k: (z, v) for k, v in assets.items()}, settings, report,
                         budget)


def _import_files(db, user, space, md: dict[str, bytes], assets: dict, settings, report: Report,
                  budget=None) -> Report:
    budget = budget or [MAX_UNPACKED]
    # Schlüssel = Pfad ohne Endung; "X/index.md" und "X.md" beschreiben beide die Seite X.
    nodes: dict[str, dict] = {}
    for name, raw in md.items():
        stem = posixpath.splitext(name)[0]
        is_index = posixpath.basename(stem).lower() == "index" and "/" in stem
        key = posixpath.dirname(stem) if is_index else stem
        if key.split("/")[0] == "_attachments":
            continue
        node = nodes.setdefault(key, {})
        if "raw" not in node or is_index is False:
            node["raw"], node["dir"] = raw, posixpath.dirname(name)
    for key in list(nodes):
        parts = key.split("/")
        for depth in range(1, len(parts)):
            nodes.setdefault("/".join(parts[:depth]), {})

    created: dict[str, Page] = {}
    uploaded: dict[str, str] = {}
    by_basename = {posixpath.basename(a).lower(): a for a in assets}
    for key in sorted(nodes, key=lambda k: (k.count("/"), k.lower())):
        node = nodes[key]
        text = node.get("raw", b"").decode("utf-8", errors="replace")
        meta, body = parse_md(text)
        title = str(meta.get("title") or posixpath.basename(key))[:200].strip() or "Seite"
        parent = created.get(posixpath.dirname(key)) if "/" in key else None
        page = pages_repo.create(db, user, space, title=title, parent_id=parent.id if parent else None,
                                 content_md="")
        created[key] = page
        report.pages += 1

        def upload(asset_name: str, page=page) -> str | None:
            if asset_name not in assets:
                return None
            if asset_name not in uploaded:
                from kb.api.attachments import store_upload
                z, info = assets[asset_name]
                data = _read(z, info, budget)
                att = store_upload(db, user, page, io.BytesIO(data), _original_name(asset_name), settings)
                uploaded[asset_name] = f"/api/v1/attachments/{att.id}"
                report.attachments += 1
            return uploaded[asset_name]

        base_dir = node.get("dir", "")

        def link(m):
            bang, label, target = m.groups()
            if re.match(r"^[a-z][a-z0-9+.-]*:|^/|^#", target, re.I):
                return m.group(0)
            resolved = posixpath.normpath(posixpath.join(base_dir, unquote(target)))
            url = upload(resolved)
            return f"{bang}[{label}]({url})" if url else m.group(0)

        def wiki(m):
            url = upload(by_basename.get(m.group(1).strip().lower(), ""))
            return f"![{m.group(1).strip()}]({url})" if url else m.group(0)

        body = _WIKI_EMBED.sub(wiki, _LINK.sub(link, body))
        page.content_md = body
        listed = meta.get("attachments")
        if isinstance(listed, list):
            for rel in listed:
                if isinstance(rel, str) and is_safe_path(rel.lstrip("./") or "x"):
                    upload(posixpath.normpath(posixpath.join(base_dir, rel)))
        tags = meta.get("tags")
        if isinstance(tags, str):
            tags = [tags]
        if isinstance(tags, list):
            clean = sorted({" ".join(str(t).strip().lower().split())[:32] for t in tags if str(t).strip()})[:20]
            tags_repo.set_tags(db, page, clean)
        rev = pages_repo.revisions.latest(db, page)
        rev.content_md, rev.title = page.content_md, page.title
        db.flush()
    return report
