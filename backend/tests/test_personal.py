from kb import models
from tests.factories import login, make_page, make_space, make_user


def test_favorites_roundtrip(client, db):
    user = make_user(db)
    space = make_space(db)
    page = make_page(db, space, user, "Lieblingsseite")
    login(client, user)
    assert client.put(f"/api/v1/me/favorites/{page.id}").status_code == 204
    assert client.get(f"/api/v1/pages/{page.id}").json()["is_favorite"] is True
    home = client.get("/api/v1/me/home").json()
    assert [f["title"] for f in home["favorites"]] == ["Lieblingsseite"]
    assert home["favorites"][0]["space"]["slug"] == space.slug
    assert client.delete(f"/api/v1/me/favorites/{page.id}").status_code == 204
    assert client.get("/api/v1/me/home").json()["favorites"] == []


def test_home_lists_recent_views_and_changes(client, db):
    user = make_user(db)
    space = make_space(db)
    a = make_page(db, space, user, "A")
    login(client, user)
    client.get(f"/api/v1/pages/{a.id}")
    home = client.get("/api/v1/me/home").json()
    assert [p["title"] for p in home["recent_views"]] == ["A"]
    assert [p["title"] for p in home["recent_changes"]] == ["A"]


def test_home_forgets_pages_after_losing_access(client, db):
    user = make_user(db)
    space = make_space(db, default_access="none", members=[(user, "read")])
    page = make_page(db, space, user, "Geheim")
    login(client, user)
    client.put(f"/api/v1/me/favorites/{page.id}")
    client.get(f"/api/v1/pages/{page.id}")
    db.delete(db.get(models.SpaceMember, (space.id, user.id)))
    db.flush()
    home = client.get("/api/v1/me/home").json()
    assert home == {"recent_views": [], "recent_changes": [], "favorites": []}


def test_home_hides_trashed_pages(client, db):
    user = make_user(db, role="editor")
    space = make_space(db, default_access="edit")
    page = make_page(db, space, user, "Weg")
    login(client, user)
    client.put(f"/api/v1/me/favorites/{page.id}")
    client.delete(f"/api/v1/pages/{page.id}")
    assert client.get("/api/v1/me/home").json()["favorites"] == []


def test_favorite_of_hidden_page_is_404(client, db):
    user = make_user(db)
    space = make_space(db, default_access="none")
    page = make_page(db, space, user)
    login(client, user)
    assert client.put(f"/api/v1/me/favorites/{page.id}").status_code == 404
