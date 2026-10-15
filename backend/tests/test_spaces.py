import pytest

from kb import models
from tests.factories import login, make_space, make_user

SPACES = "/api/v1/spaces"


def test_reader_cannot_create_space(client, db):
    login(client, make_user(db))
    r = client.post(SPACES, json={"name": "Neu"})
    assert r.status_code == 403


def test_editor_creates_space_and_becomes_manager(client, db):
    editor = make_user(db, role="editor")
    login(client, editor)
    r = client.post(SPACES, json={"name": "Größte Übersicht", "icon": "🚀", "color": "indigo",
                                  "default_access": "none"})
    assert r.status_code == 201
    body = r.json()
    assert body["slug"] == "groesste-uebersicht"
    assert body["my_level"] == "manage"
    member = db.get(models.SpaceMember, (body["id"], editor.id))
    assert member.level == "manage"


def test_slug_is_made_unique(client, db):
    login(client, make_user(db, role="admin"))
    a = client.post(SPACES, json={"name": "HR"}).json()["slug"]
    b = client.post(SPACES, json={"name": "HR"}).json()["slug"]
    assert (a, b) == ("hr", "hr-2")


def test_slug_from_symbols_only_falls_back(client, db):
    login(client, make_user(db, role="admin"))
    assert client.post(SPACES, json={"name": "🚀🚀"}).json()["slug"] == "bereich"


def test_color_outside_palette_is_422(client, db):
    login(client, make_user(db, role="admin"))
    assert client.post(SPACES, json={"name": "X", "color": "pink"}).status_code == 422


def test_list_shows_only_readable_spaces(client, db):
    user = make_user(db)
    public = make_space(db, name="Öffentlich", default_access="read")
    make_space(db, name="Geheim", default_access="none")
    login(client, user)
    body = client.get(SPACES).json()
    names = [s["name"] for s in body]
    assert "Öffentlich" in names and "Geheim" not in names
    entry = next(s for s in body if s["slug"] == public.slug)
    assert entry["my_level"] == "read"
    assert entry["page_count"] == 0


def test_archived_space_is_hidden_unless_requested(client, db):
    admin = make_user(db, role="admin")
    space = make_space(db, name="Alt")
    login(client, admin)
    assert client.patch(f"{SPACES}/{space.slug}", json={"archived": True}).status_code == 200
    assert space.slug not in [s["slug"] for s in client.get(SPACES).json()]
    assert space.slug in [s["slug"] for s in client.get(SPACES, params={"archived": "true"}).json()]


@pytest.mark.parametrize("method,suffix", [
    ("GET", ""), ("PATCH", ""), ("DELETE", ""), ("GET", "/members"),
    ("PUT", "/members/{uid}"), ("DELETE", "/members/{uid}"),
])
def test_private_space_is_404_for_outsiders(client, db, method, suffix):
    outsider = make_user(db)
    space = make_space(db, default_access="none")
    login(client, outsider)
    r = client.request(method, f"{SPACES}/{space.slug}{suffix.format(uid=outsider.id)}",
                       json={"level": "read", "name": "x"})
    assert r.status_code == 404
    assert r.json() == {"detail": "Nicht gefunden."}


def test_reader_member_cannot_change_space(client, db):
    user = make_user(db)
    space = make_space(db, default_access="none", members=[(user, "read")])
    login(client, user)
    assert client.patch(f"{SPACES}/{space.slug}", json={"name": "x"}).status_code == 403


def test_manager_manages_members(client, db):
    manager, other = make_user(db), make_user(db, name="Olga Ost")
    space = make_space(db, default_access="none", members=[(manager, "manage")])
    login(client, manager)
    assert client.put(f"{SPACES}/{space.slug}/members/{other.id}", json={"level": "edit"}).status_code == 200
    members = client.get(f"{SPACES}/{space.slug}/members").json()
    assert {m["name"]: m["level"] for m in members}["Olga Ost"] == "edit"
    assert client.delete(f"{SPACES}/{space.slug}/members/{other.id}").status_code == 204
    assert db.get(models.SpaceMember, (space.id, other.id)) is None


def test_member_for_unknown_user_is_404(client, db):
    import uuid
    admin = make_user(db, role="admin")
    space = make_space(db)
    login(client, admin)
    r = client.put(f"{SPACES}/{space.slug}/members/{uuid.uuid4()}", json={"level": "edit"})
    assert r.status_code == 404


def test_only_admin_deletes_space(client, db):
    manager = make_user(db)
    space = make_space(db, members=[(manager, "manage")])
    login(client, manager)
    assert client.delete(f"{SPACES}/{space.slug}").status_code == 403


def test_admin_deletes_space(client, db):
    space = make_space(db)
    login(client, make_user(db, role="admin"))
    assert client.delete(f"{SPACES}/{space.slug}").status_code == 204
    assert db.get(models.Space, space.id) is None


def test_directory_lists_active_users_for_any_member(client, db):
    make_user(db, name="Paula Park")
    make_user(db, name="Paul Inaktiv", active=False)
    login(client, make_user(db))
    names = [u["name"] for u in client.get("/api/v1/directory/users", params={"q": "paul"}).json()]
    assert names == ["Paula Park"]
