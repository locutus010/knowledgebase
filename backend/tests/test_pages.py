import uuid

import pytest
from sqlalchemy import func, select

from kb import models
from tests.factories import login, make_page, make_space, make_user


@pytest.fixture
def editor(db):
    return make_user(db, role="editor", name="Erika Edit")


@pytest.fixture
def space(db, editor):
    return make_space(db, default_access="none", members=[(editor, "edit")])


@pytest.fixture
def ec(client, editor):
    return login(client, editor)


def revisions(db, page_id):
    return db.scalar(select(func.count()).select_from(models.PageRevision)
                     .where(models.PageRevision.page_id == page_id))


def test_create_page_at_top_level(ec, space, db):
    r = ec.post(f"/api/v1/spaces/{space.slug}/pages", json={"title": "Willkommen", "content_md": "# Hallo"})
    assert r.status_code == 201
    page = r.json()
    assert page["title"] == "Willkommen"
    assert page["version"] == 1
    assert page["parent_id"] is None
    assert revisions(db, page["id"]) == 1


def test_new_child_goes_last(ec, space, db, editor):
    parent = make_page(db, space, editor, "Eltern")
    make_page(db, space, editor, "Erstes", parent=parent, position=0)
    r = ec.post(f"/api/v1/spaces/{space.slug}/pages", json={"title": "Zweites", "parent_id": str(parent.id)})
    assert r.json()["position"] == 1


def test_parent_from_other_space_is_422(ec, space, db, editor):
    other = make_space(db, members=[(editor, "edit")])
    foreign = make_page(db, other, editor)
    r = ec.post(f"/api/v1/spaces/{space.slug}/pages", json={"title": "X", "parent_id": str(foreign.id)})
    assert r.status_code == 422


def test_reader_cannot_create(client, db, space):
    reader = make_user(db)
    db.add(models.SpaceMember(space_id=space.id, user_id=reader.id, level="read"))
    login(client, reader)
    assert client.post(f"/api/v1/spaces/{space.slug}/pages", json={"title": "X"}).status_code == 403


def test_get_page_has_breadcrumbs_space_and_level(ec, space, db, editor):
    a = make_page(db, space, editor, "A")
    b = make_page(db, space, editor, "B", parent=a)
    c = make_page(db, space, editor, "C", parent=b)
    body = ec.get(f"/api/v1/pages/{c.id}").json()
    assert [x["title"] for x in body["breadcrumbs"]] == ["A", "B"]
    assert body["space"]["slug"] == space.slug
    assert body["my_level"] == "edit"
    assert body["updated_by"]["name"] == "Erika Edit"
    assert body["is_favorite"] is False
    assert body["tags"] == []


def test_viewing_records_page_view(ec, space, db, editor):
    page = make_page(db, space, editor)
    ec.get(f"/api/v1/pages/{page.id}")
    assert db.get(models.PageView, (editor.id, page.id)) is not None


def test_unknown_page_is_404(ec):
    assert ec.get(f"/api/v1/pages/{uuid.uuid4()}").status_code == 404


def test_save_increments_version(ec, space, db, editor):
    page = make_page(db, space, editor, content="alt")
    r = ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 1, "content_md": "neu"})
    assert r.status_code == 200
    assert r.json()["version"] == 2
    assert r.json()["content_md"] == "neu"


def test_stale_base_version_is_409_with_current_text(ec, space, db, editor):
    page = make_page(db, space, editor, content="alt")
    ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 1, "content_md": "von A"})
    before = revisions(db, page.id)
    r = ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 1, "content_md": "von B"})
    assert r.status_code == 409
    body = r.json()
    assert body["detail"] == "Die Seite wurde inzwischen geändert."
    assert body["current"]["content_md"] == "von A"
    assert body["current"]["version"] == 2
    assert revisions(db, page.id) == before


def test_autosaves_of_one_edit_session_merge_into_one_revision(ec, space, db, editor):
    page = make_page(db, space, editor, content="v1")
    for i, text in enumerate(["v2", "v3", "v4"], start=1):
        ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": i, "content_md": text, "edit_session": "runde-a"})
    assert revisions(db, page.id) == 2  # Erstfassung + eine Runde


def test_each_edit_session_gets_its_own_revision(ec, space, db, editor):
    """Bearbeiten → Fertig zweimal direkt hintereinander: zwei Versionen, nicht eine."""
    page = make_page(db, space, editor, content="v1")
    ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 1, "content_md": "v2", "edit_session": "runde-a"})
    ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 2, "content_md": "v3", "edit_session": "runde-b"})
    assert revisions(db, page.id) == 3


def test_save_without_edit_session_never_merges(ec, space, db, editor):
    page = make_page(db, space, editor, content="v1")
    ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 1, "content_md": "v2"})
    ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 2, "content_md": "v3"})
    assert revisions(db, page.id) == 3


def test_other_author_starts_new_revision(app, ec, space, db, editor):
    from tests.factories import logged_in

    page = make_page(db, space, editor, content="v1")
    ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 1, "content_md": "v2", "edit_session": "s"})
    other = make_user(db)
    db.add(models.SpaceMember(space_id=space.id, user_id=other.id, level="edit"))
    db.flush()
    oc = logged_in(app, other)
    oc.patch(f"/api/v1/pages/{page.id}", json={"base_version": 2, "content_md": "v3", "edit_session": "s"})
    assert revisions(db, page.id) == 3


def test_empty_title_is_422(ec, space, db, editor):
    page = make_page(db, space, editor)
    assert ec.patch(f"/api/v1/pages/{page.id}", json={"base_version": 1, "title": "  "}).status_code == 422


def test_template_placeholders_are_replaced(ec, space, db, frozen_clock):
    tpl = models.Template(name="T", content_md="Von {{autor}} am {{datum}}: {{titel}}")
    db.add(tpl)
    db.flush()
    r = ec.post(f"/api/v1/spaces/{space.slug}/pages", json={"title": "Plan", "template_id": str(tpl.id)})
    datum = frozen_clock.current.astimezone().strftime("%d.%m.%Y")
    assert r.json()["content_md"] == f"Von Erika Edit am {datum}: Plan"


def test_template_from_private_space_is_rejected(ec, space, db):
    hidden = make_space(db, default_access="none")
    tpl = models.Template(name="T", content_md="geheim", space_id=hidden.id)
    db.add(tpl)
    db.flush()
    r = ec.post(f"/api/v1/spaces/{space.slug}/pages", json={"title": "X", "template_id": str(tpl.id)})
    assert r.status_code == 404
