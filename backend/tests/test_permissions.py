import pytest
from sqlalchemy import select

from kb import models
from kb.permissions import Level, access, readable_space_ids
from tests.factories import make_space, make_user


@pytest.mark.parametrize("default,member,role,expected", [
    ("none", None, "reader", Level.NONE),
    ("read", None, "reader", Level.READ),
    ("edit", None, "reader", Level.EDIT),
    ("none", "read", "reader", Level.READ),
    ("none", "edit", "reader", Level.EDIT),
    ("none", "manage", "reader", Level.MANAGE),
    ("edit", "read", "reader", Level.EDIT),      # Maximum, nicht Mitgliedschaft allein
    ("read", "manage", "editor", Level.MANAGE),
    ("none", None, "editor", Level.NONE),        # Editor-Rolle gibt keine Bereichsrechte
    ("none", None, "admin", Level.MANAGE),
])
def test_access_matrix(db, default, member, role, expected):
    user = make_user(db, role=role)
    space = make_space(db, default_access=default, members=[(user, member)] if member else [])
    assert access(db, user, space) == expected


def test_readable_space_ids_matches_access(db):
    reader = make_user(db)
    public = make_space(db, default_access="read")
    private = make_space(db, default_access="none")
    mine = make_space(db, default_access="none", members=[(reader, "read")])
    ids = set(db.scalars(select(models.Space.id).where(models.Space.id.in_(readable_space_ids(reader)))))
    assert public.id in ids and mine.id in ids
    assert private.id not in ids


def test_admin_reads_everything(db):
    admin = make_user(db, role="admin")
    private = make_space(db, default_access="none")
    ids = set(db.scalars(select(models.Space.id).where(models.Space.id.in_(readable_space_ids(admin)))))
    assert private.id in ids
