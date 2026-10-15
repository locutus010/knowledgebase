import pytest

from kb import models
from tests.factories import login, make_space, make_user

T = "/api/v1/templates"


def tpl(db, name="Global", space=None):
    t = models.Template(name=name, content_md="x", space_id=space.id if space else None)
    db.add(t)
    db.flush()
    return t


def test_list_shows_global_and_requested_space(client, db):
    user = make_user(db)
    space = make_space(db, default_access="read")
    tpl(db, "Global")
    tpl(db, "Bereich", space)
    login(client, user)
    assert [t["name"] for t in client.get(T).json()] == ["Global"]
    names = [t["name"] for t in client.get(T, params={"space": space.slug}).json()]
    assert names == ["Bereich", "Global"]


def test_private_space_templates_are_invisible(client, db):
    user = make_user(db)
    hidden = make_space(db, default_access="none")
    tpl(db, "Geheim", hidden)
    login(client, user)
    assert client.get(T, params={"space": hidden.slug}).status_code == 404


def test_only_admin_creates_global_templates(client, db):
    login(client, make_user(db, role="editor"))
    assert client.post(T, json={"name": "X", "content_md": "y"}).status_code == 403


def test_admin_creates_global_template(client, db):
    login(client, make_user(db, role="admin"))
    r = client.post(T, json={"name": "Checkliste", "content_md": "- [ ] a", "icon": "✅"})
    assert r.status_code == 201
    assert r.json()["space_slug"] is None
    assert r.json()["can_edit"] is True


@pytest.mark.parametrize("level,expected", [("edit", 403), ("manage", 201)])
def test_space_template_needs_manage(client, db, level, expected):
    user = make_user(db)
    space = make_space(db, default_access="none", members=[(user, level)])
    login(client, user)
    r = client.post(T, json={"name": "X", "content_md": "y", "space_slug": space.slug})
    assert r.status_code == expected


def test_patch_and_delete_respect_rights(client, db):
    user = make_user(db)
    space = make_space(db, default_access="none", members=[(user, "manage")])
    own = tpl(db, "Eigen", space)
    glob = tpl(db, "Global")
    login(client, user)
    assert client.patch(f"{T}/{own.id}", json={"name": "Neu"}).json()["name"] == "Neu"
    assert client.patch(f"{T}/{glob.id}", json={"name": "Neu"}).status_code == 403
    assert client.delete(f"{T}/{own.id}").status_code == 204
    assert client.delete(f"{T}/{glob.id}").status_code == 403


def test_template_of_hidden_space_is_404_by_id(client, db):
    user = make_user(db)
    hidden = make_space(db, default_access="none")
    t = tpl(db, "Geheim", hidden)
    login(client, user)
    assert client.patch(f"{T}/{t.id}", json={"name": "x"}).status_code == 404
    assert client.delete(f"{T}/{t.id}").status_code == 404
