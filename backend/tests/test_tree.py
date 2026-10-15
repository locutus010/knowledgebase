import pytest
from sqlalchemy import select

from kb import models
from tests.factories import login, make_page, make_space, make_user


@pytest.fixture
def editor(db):
    return make_user(db, role="editor")


@pytest.fixture
def space(db, editor):
    return make_space(db, default_access="none", members=[(editor, "edit")])


@pytest.fixture
def ec(client, editor):
    return login(client, editor)


def test_tree_lists_pages_in_order_with_child_flag(ec, space, db, editor):
    b = make_page(db, space, editor, "B", position=1)
    a = make_page(db, space, editor, "A", position=0)
    make_page(db, space, editor, "A1", parent=a)
    tree = ec.get(f"/api/v1/spaces/{space.slug}/tree").json()
    top = [n for n in tree if n["parent_id"] is None]
    assert [n["title"] for n in top] == ["A", "B"]
    assert next(n for n in tree if n["id"] == str(a.id))["has_children"] is True
    assert next(n for n in tree if n["id"] == str(b.id))["has_children"] is False


def test_move_reorders_siblings(ec, space, db, editor):
    a = make_page(db, space, editor, "A", position=0)
    b = make_page(db, space, editor, "B", position=1)
    c = make_page(db, space, editor, "C", position=2)
    r = ec.post(f"/api/v1/pages/{c.id}/move", json={"parent_id": None, "position": 0})
    assert r.status_code == 200
    tree = ec.get(f"/api/v1/spaces/{space.slug}/tree").json()
    assert [n["title"] for n in tree] == ["C", "A", "B"]
    assert [n["position"] for n in tree] == [0, 1, 2]


def test_move_under_own_descendant_is_422(ec, space, db, editor):
    a = make_page(db, space, editor, "A")
    b = make_page(db, space, editor, "B", parent=a)
    c = make_page(db, space, editor, "C", parent=b)
    for target in (a, c):
        r = ec.post(f"/api/v1/pages/{a.id}/move", json={"parent_id": str(target.id), "position": 0})
        assert r.status_code == 422
        assert r.json()["detail"] == "Eine Seite kann nicht unter sich selbst verschoben werden."
    db.refresh(a)
    assert a.parent_id is None


def test_move_to_other_space_takes_subtree_and_drops_tags(ec, space, db, editor):
    target = make_space(db, default_access="none", members=[(editor, "edit")])
    a = make_page(db, space, editor, "A")
    child = make_page(db, space, editor, "A1", parent=a)
    tag = models.Tag(space_id=space.id, name="alt")
    db.add(tag)
    db.flush()
    db.add(models.PageTag(page_id=a.id, tag_id=tag.id))
    a.tags_text = "alt"
    db.flush()
    r = ec.post(f"/api/v1/pages/{a.id}/move", json={"parent_id": None, "position": 0,
                                                    "space_slug": target.slug})
    assert r.status_code == 200
    db.refresh(a)
    db.refresh(child)
    assert a.space_id == child.space_id == target.id
    assert a.tags_text == ""
    assert db.scalars(select(models.PageTag).where(models.PageTag.page_id == a.id)).all() == []


def test_move_to_space_without_edit_right_is_rejected(ec, space, db, editor):
    readonly = make_space(db, default_access="read")
    page = make_page(db, space, editor)
    r = ec.post(f"/api/v1/pages/{page.id}/move", json={"parent_id": None, "position": 0,
                                                       "space_slug": readonly.slug})
    assert r.status_code == 403
    hidden = make_space(db, default_access="none")
    r = ec.post(f"/api/v1/pages/{page.id}/move", json={"parent_id": None, "position": 0,
                                                       "space_slug": hidden.slug})
    assert r.status_code == 404


def test_huge_position_is_422_not_500(ec, space, db, editor):
    page = make_page(db, space, editor)
    r = ec.post(f"/api/v1/pages/{page.id}/move", json={"parent_id": None, "position": 10**12})
    assert r.status_code == 422


def test_trash_hides_subtree_and_restore_brings_it_back(ec, space, db, editor):
    a = make_page(db, space, editor, "A")
    make_page(db, space, editor, "A1", parent=a)
    keep = make_page(db, space, editor, "Bleibt", position=1)
    assert ec.delete(f"/api/v1/pages/{a.id}").status_code == 204
    titles = [n["title"] for n in ec.get(f"/api/v1/spaces/{space.slug}/tree").json()]
    assert titles == ["Bleibt"]
    assert ec.get(f"/api/v1/pages/{a.id}").status_code == 404
    trash = ec.get(f"/api/v1/spaces/{space.slug}/trash").json()
    assert [t["title"] for t in trash] == ["A"]
    assert ec.post(f"/api/v1/pages/{a.id}/restore").status_code == 200
    titles = {n["title"] for n in ec.get(f"/api/v1/spaces/{space.slug}/tree").json()}
    assert titles == {"A", "A1", "Bleibt"}
    assert keep.id


def test_restore_without_parent_lands_at_top(ec, space, db, editor):
    a = make_page(db, space, editor, "A")
    b = make_page(db, space, editor, "B", parent=a)
    ec.delete(f"/api/v1/pages/{b.id}")
    ec.delete(f"/api/v1/pages/{a.id}")
    ec.post(f"/api/v1/pages/{b.id}/restore")
    db.refresh(b)
    assert b.parent_id is None
    assert b.deleted_at is None


def test_purge_needs_manage_and_trash(client, ec, space, db, editor):
    page = make_page(db, space, editor)
    assert ec.delete(f"/api/v1/pages/{page.id}/purge").status_code == 403
    manager = make_user(db)
    db.add(models.SpaceMember(space_id=space.id, user_id=manager.id, level="manage"))
    db.flush()
    from tests.factories import logged_in
    mc = logged_in(client.app, manager)
    assert mc.delete(f"/api/v1/pages/{page.id}/purge").status_code == 409  # noch nicht im Papierkorb
    child = make_page(db, space, editor, "Kind", parent=page)
    mc.delete(f"/api/v1/pages/{page.id}")
    assert mc.delete(f"/api/v1/pages/{page.id}/purge").status_code == 204
    assert db.get(models.Page, page.id) is None
    assert db.get(models.Page, child.id) is None
