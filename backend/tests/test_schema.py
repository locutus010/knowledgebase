from sqlalchemy import inspect, text

from kb import models
from kb.migrate import downgrade, upgrade

TABLES = {
    "users", "sessions", "login_attempts", "spaces", "space_members", "pages",
    "page_revisions", "tags", "page_tags", "favorites", "page_views", "templates",
    "attachments",
}


def test_all_tables_exist(engine):
    assert TABLES <= set(inspect(engine).get_table_names())


def test_search_vector_is_generated_and_stemmed_german(db):
    user = models.User(email="a@example.org", name="A", role="admin")
    space = models.Space(slug="eng", name="Engineering", color="teal", created_by=user)
    db.add_all([user, space])
    db.flush()
    page = models.Page(space=space, title="Deployments", content_md="Wir rollen aus.",
                       created_by=user, updated_by=user)
    db.add(page)
    db.flush()
    vector = db.execute(text("SELECT search_vector::text FROM pages WHERE id = :id"),
                        {"id": page.id}).scalar_one()
    assert "'deployment'" in vector
    assert "'roll'" in vector


def test_role_is_checked_by_the_database(db):
    import pytest
    from sqlalchemy.exc import IntegrityError

    db.add(models.User(email="b@example.org", name="B", role="kaiser"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_downgrade_and_upgrade_again(migrated):
    downgrade(migrated)
    upgrade(migrated)
