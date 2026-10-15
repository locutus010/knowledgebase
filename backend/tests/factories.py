"""Testhelfer zum Anlegen von Daten und Anmelden."""

import itertools

from fastapi.testclient import TestClient

from kb import models
from kb.security import hash_password

PASSWORD = "geheimes-passwort"
_seq = itertools.count(1)


def make_user(db, role="reader", email=None, password=PASSWORD, name=None, active=True):
    n = next(_seq)
    user = models.User(
        email=email or f"user{n}@example.org",
        name=name or f"Person {n}",
        role=role,
        active=active,
        password_hash=hash_password(password) if password else None,
    )
    db.add(user)
    db.flush()
    return user


def login(client: TestClient, user, password=PASSWORD) -> TestClient:
    r = client.post("/api/v1/auth/login", json={"email": user.email, "password": password})
    assert r.status_code == 200, r.text
    me = client.get("/api/v1/auth/me").json()
    client.headers["X-CSRF-Token"] = me["csrf_token"]
    return client


def logged_in(app, user) -> TestClient:
    """Eigener Client mit eigenem Cookie-Speicher — für Tests mit mehreren Personen."""
    c = TestClient(app, base_url="http://testserver")
    return login(c, user)


def make_space(db, creator=None, name="Engineering", default_access="read", color="teal",
               members=()):
    """members: Folge von (user, level)."""
    n = next(_seq)
    space = models.Space(slug=f"space-{n}", name=name, color=color, default_access=default_access,
                         created_by=creator)
    db.add(space)
    db.flush()
    for user, level in members:
        db.add(models.SpaceMember(space_id=space.id, user_id=user.id, level=level))
    db.flush()
    return space
