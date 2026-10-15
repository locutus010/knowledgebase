import io
import zipfile

import pytest
from sqlalchemy import func, select

from kb import models
from tests.factories import login, logged_in, make_page, make_space, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"\x01" * 32


@pytest.fixture
def ctx(client, db):
    user = make_user(db, role="editor", name="Mia")
    space = make_space(db, name="Quelle", members=[(user, "manage")])
    login(client, user)
    return client, db, user, space


def zip_of(files: dict[str, bytes | str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def do_import(client, space, data, name="import.zip"):
    return client.post(f"/api/v1/spaces/{space.slug}/import", files={"file": (name, data, "application/zip")})


def titles(db, space):
    return sorted(db.scalars(select(models.Page.title).where(models.Page.space_id == space.id,
                                                              models.Page.deleted_at.is_(None))))


def test_single_page_export_has_front_matter(ctx):
    client, db, user, space = ctx
    page = make_page(db, space, user, "Anleitung", content="# Schritt 1\n")
    client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": ["howto"]})
    r = client.get(f"/api/v1/pages/{page.id}/export.md")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/markdown")
    assert "Anleitung.md" in r.headers["content-disposition"]
    assert r.text.startswith("---\n")
    assert "title: Anleitung" in r.text
    assert "- howto" in r.text
    assert r.text.endswith("# Schritt 1\n")


def test_space_export_import_roundtrip(ctx):
    client, db, user, space = ctx
    root = make_page(db, space, user, "Handbuch", content="Start")
    child = make_page(db, space, user, "Kapitel: Eins", parent=root, content="Inhalt")
    att = client.post(f"/api/v1/pages/{child.id}/attachments", files={"file": ("bild.png", PNG, "image/png")}).json()
    child.content_md = f"Bild: ![Bild]({att['url']})"
    db.flush()
    client.put(f"/api/v1/pages/{child.id}/tags", json={"tags": ["doku"]})

    r = client.get(f"/api/v1/spaces/{space.slug}/export.zip")
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(z.namelist())
    assert "Handbuch/index.md" in names
    assert "Handbuch/Kapitel- Eins.md" in names
    att_name = next(n for n in names if n.startswith("_attachments/"))
    assert "](../_attachments/" in z.read("Handbuch/Kapitel- Eins.md").decode()

    target = make_space(db, name="Ziel", members=[(user, "manage")])
    r = do_import(client, target, r.content)
    assert r.status_code == 200, r.text
    assert r.json()["pages"] == 2
    assert r.json()["attachments"] == 1
    new_child = db.scalar(select(models.Page).where(models.Page.space_id == target.id,
                                                     models.Page.title == "Kapitel: Eins"))
    new_root = db.get(models.Page, new_child.parent_id)
    assert new_root.title == "Handbuch"
    assert new_root.content_md == "Start"
    assert new_child.tags_text == "doku"
    assert "/api/v1/attachments/" in new_child.content_md
    new_url = new_child.content_md.split("](")[1].rstrip(")")
    assert client.get(new_url).content == PNG
    assert att_name


def test_obsidian_folder_without_index_becomes_folder_page(ctx):
    client, db, user, space = ctx
    data = zip_of({"Projekte/Alpha.md": "A", "Projekte/Beta.md": "B", "Lose.md": "x",
                   ".obsidian/workspace.json": "{}", "Projekte/bild.png": PNG,
                   "Projekte/Gamma.md": "![[bild.png]]"})
    r = do_import(client, space, data)
    assert r.status_code == 200
    assert titles(db, space) == ["Alpha", "Beta", "Gamma", "Lose", "Projekte"]
    gamma = db.scalar(select(models.Page).where(models.Page.title == "Gamma",
                                                models.Page.space_id == space.id))
    assert gamma.content_md.startswith("![bild.png](/api/v1/attachments/")


def test_note_next_to_same_named_folder_is_merged(ctx):
    client, db, user, space = ctx
    r = do_import(client, space, zip_of({"Team.md": "Über das Team", "Team/Anna.md": "Hallo"}))
    assert r.status_code == 200
    assert titles(db, space) == ["Anna", "Team"]
    team = db.scalar(select(models.Page).where(models.Page.title == "Team", models.Page.space_id == space.id))
    assert team.content_md == "Über das Team"


def test_single_markdown_file_import(ctx):
    client, db, user, space = ctx
    r = client.post(f"/api/v1/spaces/{space.slug}/import",
                    files={"file": ("notiz.md", "---\ntitle: Schöner Titel\n---\nText", "text/markdown")})
    assert r.status_code == 200
    assert titles(db, space) == ["Schöner Titel"]


@pytest.mark.parametrize("name", ["../evil.md", "/abs.md", "a/../../b.md"])
def test_traversal_is_rejected_and_nothing_is_written(ctx, name):
    client, db, user, space = ctx
    r = do_import(client, space, zip_of({"gut.md": "x", name: "böse"}))
    assert r.status_code == 422
    assert titles(db, space) == []


def test_too_many_entries_is_rejected(ctx):
    client, db, user, space = ctx
    r = do_import(client, space, zip_of({f"n{i}.md": "" for i in range(5001)}))
    assert r.status_code == 422
    assert "5000" in r.json()["detail"]


def test_not_a_zip_is_422(ctx):
    client, db, user, space = ctx
    assert do_import(client, space, b"kein zip").status_code == 422


def test_import_needs_manage(client, db):
    user = make_user(db)
    space = make_space(db, default_access="none", members=[(user, "edit")])
    login(client, user)
    assert do_import(client, space, zip_of({"a.md": "x"})).status_code == 403


def test_private_export_is_404(ctx, app):
    client, db, user, space = ctx
    space.default_access = "none"
    page = make_page(db, space, user)
    db.flush()
    outsider = logged_in(app, make_user(db))
    assert outsider.get(f"/api/v1/spaces/{space.slug}/export.zip").status_code == 404
    assert outsider.get(f"/api/v1/pages/{page.id}/export.md").status_code == 404


def test_trashed_pages_are_not_exported(ctx):
    client, db, user, space = ctx
    from kb import clock
    make_page(db, space, user, "Bleibt")
    gone = make_page(db, space, user, "Weg")
    gone.deleted_at = clock.now()
    db.flush()
    z = zipfile.ZipFile(io.BytesIO(client.get(f"/api/v1/spaces/{space.slug}/export.zip").content))
    assert z.namelist() == ["Bleibt.md"]
    assert db.scalar(select(func.count()).select_from(models.Page)) >= 2
