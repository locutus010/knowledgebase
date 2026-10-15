import pytest

from tests.factories import login, make_page, make_space, make_user

S = "/api/v1/search"


@pytest.fixture
def ctx(client, db):
    user = make_user(db, role="editor")
    space = make_space(db, name="Engineering", members=[(user, "edit")])
    login(client, user)
    return client, db, user, space


def search(client, q, **params):
    r = client.get(S, params={"q": q, **params})
    assert r.status_code == 200, r.text
    return r.json()


def test_finds_stemmed_words(ctx):
    client, db, user, space = ctx
    make_page(db, space, user, "Releases", content="Wir planen Deployments jeden Dienstag.")
    body = search(client, "deployment")
    assert body["total"] == 1
    hit = body["results"][0]
    assert hit["title"] == "Releases"
    assert hit["space"]["slug"] == space.slug
    assert "<mark>Deployments</mark>" in hit["snippet_html"]


def test_prefix_of_last_word_matches_while_typing(ctx):
    client, db, user, space = ctx
    make_page(db, space, user, "Kubernetes-Cluster")
    assert search(client, "Kuber")["total"] == 1


def test_title_hit_ranks_before_content_hit(ctx):
    client, db, user, space = ctx
    make_page(db, space, user, "Allgemeines", content="Hier steht etwas über Backup.")
    make_page(db, space, user, "Backup", content="Anleitung.")
    assert [r["title"] for r in search(client, "backup")["results"]] == ["Backup", "Allgemeines"]


def test_private_space_is_invisible_including_total(ctx):
    client, db, user, space = ctx
    hidden = make_space(db, default_access="none")
    make_page(db, hidden, user, "Gehälter", content="Gehälter 2026")
    assert search(client, "gehälter") == {"total": 0, "results": []}


def test_trashed_pages_and_archived_spaces_are_skipped(ctx):
    client, db, user, space = ctx
    from kb import clock
    page = make_page(db, space, user, "Papierkorbseite")
    page.deleted_at = clock.now()
    archived = make_space(db, members=[(user, "edit")])
    archived.archived_at = clock.now()
    make_page(db, archived, user, "Archivseite Papierkorbseite")
    db.flush()
    assert search(client, "papierkorbseite")["total"] == 0


def test_html_in_content_is_escaped_in_snippet(ctx):
    client, db, user, space = ctx
    make_page(db, space, user, "XSS", content="Gefahr <script>alert(1)</script> Gefahr")
    snippet = search(client, "gefahr")["results"][0]["snippet_html"]
    # ts_headline zerlegt HTML selbst; entscheidend ist: außer <mark> kein rohes Tag.
    import re
    assert re.findall(r"<(?!/?mark>)", snippet) == []
    assert "&lt;script" in snippet


def test_filter_by_space_and_tag(ctx):
    client, db, user, space = ctx
    other = make_space(db, members=[(user, "edit")])
    a = make_page(db, space, user, "Netz eins")
    make_page(db, other, user, "Netz zwei")
    client.put(f"/api/v1/pages/{a.id}/tags", json={"tags": ["lan"]})
    assert search(client, "netz")["total"] == 2
    assert [r["title"] for r in search(client, "netz", space=other.slug)["results"]] == ["Netz zwei"]
    assert [r["title"] for r in search(client, "netz", tag="lan")["results"]] == ["Netz eins"]


def test_paging(ctx):
    client, db, user, space = ctx
    for i in range(5):
        make_page(db, space, user, f"Seite Paging {i}")
    body = search(client, "paging", limit=2, offset=4)
    assert body["total"] == 5
    assert len(body["results"]) == 1


@pytest.mark.parametrize("q", ["", "   ", '"', "-", ":", "&", "'", "!", "(", "a:*", "der die das",
                               "-- ; DROP TABLE pages", "\\", "ä" * 300])
def test_odd_input_never_breaks(ctx, q):
    client, db, user, space = ctx
    make_page(db, space, user, "Irgendwas")
    body = search(client, q)
    assert body["total"] >= 0


def test_limit_bounds(ctx):
    client = ctx[0]
    assert client.get(S, params={"q": "x", "limit": 101}).status_code == 422
    assert client.get(S, params={"q": "x", "offset": -1}).status_code == 422


def _attach(client, page, name, data=b"%PDF-1.4 inhalt"):
    r = client.post(f"/api/v1/pages/{page.id}/attachments", files={"file": (name, data, "application/pdf")})
    assert r.status_code == 201
    return r.json()


@pytest.mark.parametrize("q", ["angebot", "Angebot-2026", "angebot-2026.pdf"])
def test_finds_page_by_attachment_filename(ctx, q):
    client, db, user, space = ctx
    page = make_page(db, space, user, "Vertrieb", content="Nichts Besonderes.")
    _attach(client, page, "Angebot-2026.pdf")
    titles = [r["title"] for r in search(client, q)["results"]]
    assert titles == ["Vertrieb"], q


def test_deleted_attachment_is_no_longer_found(ctx):
    client, db, user, space = ctx
    page = make_page(db, space, user, "Vertrieb")
    att = _attach(client, page, "Preisliste.pdf")
    client.delete(att["url"])
    assert search(client, "preisliste")["total"] == 0


def test_inline_files_are_not_searchable_by_name(ctx):
    client, db, user, space = ctx
    page = make_page(db, space, user, "Bildseite")
    client.post(f"/api/v1/pages/{page.id}/attachments?listed=false",
                files={"file": ("diagrammxyz.png", b"\x89PNG\r\n\x1a\n" + b"\0" * 8, "image/png")})
    assert search(client, "diagrammxyz")["total"] == 0
