import pytest
from sqlalchemy import func, select

from kb import models
from tests.factories import login, make_page, make_space, make_user


@pytest.fixture
def ctx(client, db):
    editor = make_user(db, role="editor")
    space = make_space(db, members=[(editor, "edit")])
    page = make_page(db, space, editor, "Seite")
    login(client, editor)
    return client, space, page


def test_set_tags_normalizes_and_dedupes(ctx, db):
    client, space, page = ctx
    r = client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": [" Postgres ", "postgres", "CI"]})
    assert r.status_code == 200
    assert r.json() == ["ci", "postgres"]
    db.refresh(page)
    assert page.tags_text == "ci postgres"


def test_tags_feed_the_search_vector(ctx, db):
    client, space, page = ctx
    client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": ["kubernetes"]})
    hit = db.scalar(select(func.count()).select_from(models.Page).where(
        models.Page.id == page.id,
        models.Page.search_vector.op("@@")(func.to_tsquery("german", "kubernetes"))))
    assert hit == 1


def test_too_many_or_too_long_tags_are_422(ctx):
    client, _, page = ctx
    assert client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": [f"t{i}" for i in range(21)]}).status_code == 422
    assert client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": ["x" * 33]}).status_code == 422


def test_space_tags_with_counts(ctx, db):
    client, space, page = ctx
    other = make_page(db, space, page.created_by, "Zwei")
    client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": ["a", "b"]})
    client.put(f"/api/v1/pages/{other.id}/tags", json={"tags": ["a"]})
    assert client.get(f"/api/v1/spaces/{space.slug}/tags").json() == [
        {"name": "a", "count": 2}, {"name": "b", "count": 1}]


def test_unused_tags_disappear_from_listing(ctx):
    client, space, page = ctx
    client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": ["weg"]})
    client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": []})
    assert client.get(f"/api/v1/spaces/{space.slug}/tags").json() == []


def test_pages_by_tag(ctx, db):
    client, space, page = ctx
    other = make_page(db, space, page.created_by, "Andere")
    client.put(f"/api/v1/pages/{page.id}/tags", json={"tags": ["netz"]})
    r = client.get(f"/api/v1/spaces/{space.slug}/pages", params={"tag": "netz"})
    assert r.status_code == 200
    assert [p["title"] for p in r.json()] == ["Seite"]
    assert other.id
