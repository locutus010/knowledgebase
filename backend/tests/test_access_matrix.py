"""Jede Route, die einen Bereich oder etwas darin adressiert, antwortet einer Person ohne
Leserecht mit 404 — nicht 403, nicht 200. Eine neue Route unter /api/v1 muss hier
eingetragen werden (MATRIX oder EXEMPT), sonst schlägt test_every_route_is_classified fehl."""

import pytest
from fastapi.routing import APIRoute

from kb import models
from kb.main import create_app
from tests.factories import logged_in, make_page, make_space, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
FILE = {"file": ("x.png", PNG, "image/png")}

# (Methode, Pfad) -> Anfrageinhalt. "json" für JSON, "files" für multipart.
MATRIX = {
    ("GET", "/api/v1/spaces/{slug}"): {},
    ("PATCH", "/api/v1/spaces/{slug}"): {"json": {"name": "x"}},
    ("DELETE", "/api/v1/spaces/{slug}"): {},
    ("GET", "/api/v1/spaces/{slug}/members"): {},
    ("PUT", "/api/v1/spaces/{slug}/members/{user_id}"): {"json": {"level": "read"}},
    ("DELETE", "/api/v1/spaces/{slug}/members/{user_id}"): {},
    ("GET", "/api/v1/spaces/{slug}/tree"): {},
    ("POST", "/api/v1/spaces/{slug}/pages"): {"json": {"title": "x"}},
    ("GET", "/api/v1/spaces/{slug}/trash"): {},
    ("GET", "/api/v1/spaces/{slug}/tags"): {},
    ("GET", "/api/v1/spaces/{slug}/pages"): {"params": {"tag": "geheimtag"}},
    ("GET", "/api/v1/spaces/{slug}/export.zip"): {},
    ("POST", "/api/v1/spaces/{slug}/import"): {"files": {"file": ("a.md", b"x", "text/markdown")}},
    ("GET", "/api/v1/pages/{page_id}"): {},
    ("PATCH", "/api/v1/pages/{page_id}"): {"json": {"base_version": 1, "title": "x"}},
    ("DELETE", "/api/v1/pages/{page_id}"): {},
    ("POST", "/api/v1/pages/{page_id}/move"): {"json": {"parent_id": None, "position": 0}},
    ("POST", "/api/v1/pages/{page_id}/restore"): {},
    ("DELETE", "/api/v1/pages/{page_id}/purge"): {},
    ("GET", "/api/v1/pages/{page_id}/revisions"): {},
    ("GET", "/api/v1/pages/{page_id}/revisions/{version}"): {},
    ("POST", "/api/v1/pages/{page_id}/revisions/{version}/restore"): {},
    ("PUT", "/api/v1/pages/{page_id}/tags"): {"json": {"tags": ["x"]}},
    ("GET", "/api/v1/pages/{page_id}/attachments"): {},
    ("POST", "/api/v1/pages/{page_id}/attachments"): {"files": FILE},
    ("GET", "/api/v1/pages/{page_id}/export.md"): {},
    ("GET", "/api/v1/attachments/{att_id}"): {},
    ("DELETE", "/api/v1/attachments/{att_id}"): {},
    ("PUT", "/api/v1/me/favorites/{page_id}"): {},
    ("DELETE", "/api/v1/me/favorites/{page_id}"): {},
    ("PATCH", "/api/v1/templates/{template_id}"): {"json": {"name": "x"}},
    ("DELETE", "/api/v1/templates/{template_id}"): {},
}

# Routen ohne Bezug zu einem einzelnen Bereich; die Listen darunter prüft test_lists_leak_nothing.
EXEMPT = {
    ("POST", "/api/v1/auth/login"), ("POST", "/api/v1/auth/logout"), ("GET", "/api/v1/auth/me"),
    ("POST", "/api/v1/auth/password"), ("GET", "/api/v1/auth/config"), ("PATCH", "/api/v1/auth/me"),
    ("GET", "/api/v1/auth/oidc/login"), ("GET", "/api/v1/auth/oidc/callback"),
    ("GET", "/api/v1/users"), ("POST", "/api/v1/users"), ("PATCH", "/api/v1/users/{user_id}"),
    ("DELETE", "/api/v1/users/{user_id}"), ("POST", "/api/v1/users/{user_id}/reset-password"),
    ("GET", "/api/v1/admin/info"), ("GET", "/api/v1/directory/users"),
    ("GET", "/api/v1/spaces"), ("POST", "/api/v1/spaces"),
    ("GET", "/api/v1/me/home"), ("GET", "/api/v1/search"),
    ("GET", "/api/v1/templates"), ("POST", "/api/v1/templates"),
}


def api_routes():
    from kb.api import api
    for r in api.routes:
        if isinstance(r, APIRoute):
            for m in r.methods:
                yield m, r.path


def test_every_route_is_classified():
    unknown = {k for k in api_routes() if k not in MATRIX and k not in EXEMPT}
    assert unknown == set(), f"Neue Route ohne Rechte-Einordnung: {sorted(unknown)}"


@pytest.fixture
def private(db, settings):
    owner = make_user(db, role="editor", name="Besitzerin")
    space = make_space(db, name="Geheimsache", default_access="none", members=[(owner, "manage")])
    page = make_page(db, space, owner, "Geheimseite", content="streng geheim")
    from kb import clock
    trashed = make_page(db, space, owner, "Papierkorb")
    trashed.deleted_at = clock.now()
    tag = models.Tag(space_id=space.id, name="geheimtag")
    db.add(tag)
    db.flush()
    db.add(models.PageTag(page_id=page.id, tag_id=tag.id))
    page.tags_text = "geheimtag"
    tpl = models.Template(name="Geheimvorlage", space_id=space.id, content_md="x")
    att = models.Attachment(page_id=page.id, sha256="0" * 64, filename="g.png", mime_type="image/png", size=1)
    db.add_all([tpl, att])
    db.flush()
    return {"space": space, "page": page, "trashed": trashed, "tpl": tpl, "att": att, "owner": owner}


@pytest.mark.parametrize("role", ["reader", "editor"])
@pytest.mark.parametrize("key", sorted(MATRIX), ids=lambda k: f"{k[0]} {k[1]}")
def test_outsider_gets_404(app, db, private, key, role):
    method, path = key
    outsider = make_user(db, role=role)
    page = private["trashed"] if path.endswith(("/restore", "/purge")) and "revisions" not in path else private["page"]
    url = path.format(slug=private["space"].slug, page_id=page.id, att_id=private["att"].id,
                      template_id=private["tpl"].id, version=1, user_id=outsider.id)
    client = logged_in(app, outsider)
    r = client.request(method, url, **MATRIX[key])
    assert r.status_code == 404, (url, r.status_code, r.text)
    assert "geheim" not in r.text.lower()


def test_lists_leak_nothing(app, db, private):
    outsider = logged_in(app, make_user(db, role="editor"))
    owner = logged_in(app, private["owner"])
    owner.put(f"/api/v1/me/favorites/{private['page'].id}")
    owner.get(f"/api/v1/pages/{private['page'].id}")
    for url in ("/api/v1/search?q=geheim", "/api/v1/search?q=geheimtag", "/api/v1/me/home",
                "/api/v1/spaces", "/api/v1/spaces?archived=true", "/api/v1/templates"):
        r = outsider.get(url)
        assert r.status_code == 200, url
        assert "geheim" not in r.text.lower(), url
    # Gegenprobe: die Besitzerin sieht alles.
    assert "Geheimseite" in owner.get("/api/v1/search?q=geheim").text
