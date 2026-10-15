import pytest
from sqlalchemy import select

from kb import models, storage
from tests.factories import login, logged_in, make_page, make_space, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


@pytest.fixture
def ctx(client, db):
    editor = make_user(db, role="editor")
    space = make_space(db, default_access="none", members=[(editor, "edit")])
    page = make_page(db, space, editor)
    login(client, editor)
    return client, page


def upload(client, page, name, data, ctype="application/octet-stream"):
    return client.post(f"/api/v1/pages/{page.id}/attachments", files={"file": (name, data, ctype)})


def test_upload_and_download_image_inline(ctx, settings):
    client, page = ctx
    r = upload(client, page, "bild.png", PNG, "image/png")
    assert r.status_code == 201
    att = r.json()
    assert att["mime_type"] == "image/png"
    assert att["size"] == len(PNG)
    assert att["url"] == f"/api/v1/attachments/{att['id']}"
    d = client.get(att["url"])
    assert d.status_code == 200
    assert d.content == PNG
    assert d.headers["content-type"] == "image/png"
    assert d.headers["content-disposition"].startswith("inline")
    assert d.headers["x-content-type-options"] == "nosniff"
    assert d.headers["content-security-policy"] == "sandbox"


def test_svg_is_always_a_download(ctx):
    client, page = ctx
    att = upload(client, page, "logo.svg", SVG, "image/svg+xml").json()
    d = client.get(att["url"])
    assert d.headers["content-disposition"].startswith("attachment")
    assert not d.headers["content-type"].startswith("image/svg")


def test_mime_comes_from_content_not_from_claim(ctx):
    client, page = ctx
    att = upload(client, page, "harmlos.png", b"<html><script>x</script></html>", "image/png").json()
    assert att["mime_type"] != "image/png"
    assert client.get(att["url"]).headers["content-disposition"].startswith("attachment")


def test_too_large_is_413(ctx, app):
    app.state.settings = app.state.settings.model_copy(update={"max_upload_mb": 1})
    client, page = ctx
    r = upload(client, page, "gross.bin", b"x" * (1024 * 1024 + 1))
    assert r.status_code == 413
    assert r.json()["detail"] == "Die Datei ist größer als 1 MB."


def test_same_content_is_stored_once(ctx, settings):
    client, page = ctx
    a = upload(client, page, "a.png", PNG).json()
    b = upload(client, page, "b.png", PNG).json()
    assert a["id"] != b["id"]
    files = [p for p in settings.upload_dir.rglob("*")
             if p.is_file() and p.relative_to(settings.upload_dir).parts[0] != "tmp"]
    assert len(files) == 1


def test_attachment_of_private_page_is_404_for_outsiders(ctx, app, db):
    client, page = ctx
    att = upload(client, page, "a.png", PNG).json()
    outsider = logged_in(app, make_user(db))
    assert outsider.get(att["url"]).status_code == 404
    assert outsider.get(f"/api/v1/pages/{page.id}/attachments").status_code == 404


def test_list_and_delete(ctx):
    client, page = ctx
    att = upload(client, page, "a.png", PNG).json()
    assert [a["filename"] for a in client.get(f"/api/v1/pages/{page.id}/attachments").json()] == ["a.png"]
    assert client.delete(att["url"]).status_code == 204
    assert client.get(att["url"]).status_code == 404


def test_filename_from_upload_loses_its_path(ctx):
    client, page = ctx
    att = upload(client, page, "../../etc/passwd.txt", b"hallo").json()
    assert att["filename"] == "passwd.txt"


@pytest.mark.parametrize("raw,clean", [
    ("pass\x00wd.txt", "passwd.txt"), ("C:\\x\\y.pdf", "y.pdf"), ("...", "datei"), ("", "datei"),
])
def test_clean_filename(raw, clean):
    assert storage.clean_filename(raw) == clean


def test_gc_removes_only_orphans(ctx, db, settings):
    client, page = ctx
    keep = upload(client, page, "a.png", PNG).json()
    gone = upload(client, page, "b.txt", b"weg damit").json()
    db.delete(db.get(models.Attachment, gone["id"]))
    db.flush()
    assert storage.gc(db, settings.upload_dir) == 1
    sha = db.scalar(select(models.Attachment.sha256).where(models.Attachment.id == keep["id"]))
    assert storage.path_for(settings.upload_dir, sha).exists()
