import pytest

from tests.factories import login, make_page, make_space, make_user


@pytest.fixture
def setup(client, db, frozen_clock):
    editor = make_user(db, role="editor", name="Rita")
    space = make_space(db, members=[(editor, "edit")])
    page = make_page(db, space, editor, "T", content="eins")
    login(client, editor)
    client.patch(f"/api/v1/pages/{page.id}", json={"base_version": 1, "content_md": "zwei"})
    frozen_clock.advance(minutes=15)
    client.patch(f"/api/v1/pages/{page.id}", json={"base_version": 2, "content_md": "drei"})
    return client, page


def test_list_revisions_newest_first(setup):
    client, page = setup
    revs = client.get(f"/api/v1/pages/{page.id}/revisions").json()
    assert [r["version"] for r in revs] == [3, 2, 1]
    assert revs[0]["author"]["name"] == "Rita"


def test_get_single_revision(setup):
    client, page = setup
    assert client.get(f"/api/v1/pages/{page.id}/revisions/1").json()["content_md"] == "eins"
    assert client.get(f"/api/v1/pages/{page.id}/revisions/99").status_code == 404


def test_restore_revision_creates_new_version(setup):
    client, page = setup
    r = client.post(f"/api/v1/pages/{page.id}/revisions/1/restore")
    assert r.status_code == 200
    assert r.json()["version"] == 4
    assert r.json()["content_md"] == "eins"


def test_restore_never_overwrites_a_recent_revision(setup):
    client, page = setup
    client.post(f"/api/v1/pages/{page.id}/revisions/1/restore")
    versions = [r["version"] for r in client.get(f"/api/v1/pages/{page.id}/revisions").json()]
    assert versions == [4, 3, 2, 1]
