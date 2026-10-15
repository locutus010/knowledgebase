import threading
import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kb import models
from kb.repo import users as repo
from kb.repo.users import LastAdminError
from tests.factories import PASSWORD, login, make_user

USERS = "/api/v1/users"
REPEAT = 200


@pytest.fixture
def admin_client(client, db):
    admin = make_user(db, role="admin")
    login(client, admin)
    client.admin = admin
    return client


@pytest.mark.parametrize("method,path", [
    ("GET", USERS), ("POST", USERS), ("PATCH", USERS + "/{id}"), ("DELETE", USERS + "/{id}"),
    ("POST", USERS + "/{id}/reset-password"),
])
def test_non_admin_is_forbidden(client, db, method, path):
    editor = make_user(db, role="editor")
    login(client, editor)
    r = client.request(method, path.format(id=editor.id), json={})
    assert r.status_code == 403


def test_list_and_search_users(admin_client, db):
    make_user(db, name="Zora Zimmer", email="zora@example.org")
    body = admin_client.get(USERS, params={"q": "zimm"}).json()
    assert [u["email"] for u in body] == ["zora@example.org"]
    assert body[0]["is_local"] is True


def test_create_user_without_password_returns_one_time_password(admin_client, client, db):
    r = admin_client.post(USERS, json={"email": "Neu@Example.org", "name": "Neu", "role": "editor"})
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "neu@example.org"
    otp = body["one_time_password"]
    assert len(otp) == 16
    user = db.scalar(select(models.User).where(models.User.email == "neu@example.org"))
    assert user.must_change_password is True


def test_duplicate_email_is_409(admin_client, db):
    make_user(db, email="doppelt@example.org")
    r = admin_client.post(USERS, json={"email": "doppelt@example.org", "name": "X", "role": "reader"})
    assert r.status_code == 409
    assert r.json()["detail"] == "Diese E-Mail ist bereits vergeben."


def test_invalid_email_is_422(admin_client):
    r = admin_client.post(USERS, json={"email": "keine-mail", "name": "X", "role": "reader"})
    assert r.status_code == 422


def test_change_role_and_deactivate(admin_client, db):
    user = make_user(db)
    r = admin_client.patch(f"{USERS}/{user.id}", json={"role": "editor", "name": "Neuer Name"})
    assert r.status_code == 200
    assert r.json()["role"] == "editor"
    assert r.json()["name"] == "Neuer Name"


def test_deactivation_ends_sessions(app, admin_client, db):
    from tests.factories import logged_in

    user = make_user(db)
    other = logged_in(app, user)
    assert other.get("/api/v1/auth/me").status_code == 200
    admin_client.patch(f"{USERS}/{user.id}", json={"active": False})
    assert db.scalar(select(func.count()).select_from(models.Session_)
                     .where(models.Session_.user_id == user.id)) == 0
    assert other.get("/api/v1/auth/me").status_code == 401


def test_reset_password_sets_one_time_password(admin_client, client, db):
    user = make_user(db)
    otp = admin_client.post(f"{USERS}/{user.id}/reset-password").json()["one_time_password"]
    client.post("/api/v1/auth/logout")
    del client.headers["X-CSRF-Token"]
    login(client, user, password=otp)
    assert client.get("/api/v1/auth/me").json()["user"]["must_change_password"] is True


def test_delete_user(admin_client, db):
    user = make_user(db)
    assert admin_client.delete(f"{USERS}/{user.id}").status_code == 204
    assert db.get(models.User, user.id) is None


def test_unknown_user_is_404(admin_client):
    assert admin_client.patch(f"{USERS}/{uuid.uuid4()}", json={"name": "x"}).status_code == 404


def test_malformed_id_is_422_not_500(admin_client):
    assert admin_client.patch(f"{USERS}/123", json={"name": "x"}).status_code == 422


@pytest.mark.parametrize("change", [{"role": "editor"}, {"active": False}, "delete"])
def test_last_admin_cannot_be_removed(admin_client, change):
    me = admin_client.admin
    if change == "delete":
        r = admin_client.delete(f"{USERS}/{me.id}")
    else:
        r = admin_client.patch(f"{USERS}/{me.id}", json=change)
    assert r.status_code == 409
    assert r.json()["detail"] == "Der letzte aktive Administrator kann nicht entfernt werden."


def test_second_admin_can_be_demoted(admin_client, db):
    other = make_user(db, role="admin")
    assert admin_client.patch(f"{USERS}/{other.id}", json={"role": "reader"}).status_code == 200


def test_inactive_admin_does_not_count(admin_client, db):
    make_user(db, role="admin", active=False)
    me = admin_client.admin
    assert admin_client.patch(f"{USERS}/{me.id}", json={"role": "reader"}).status_code == 409


def test_concurrent_demotion_keeps_one_admin(committing_engine):
    """Zwei Anfragen stufen gleichzeitig je einen von zwei Admins herab. Ohne Sperre sähen
    beide noch zwei aktive Admins — und am Ende wäre keiner mehr da."""
    for _ in range(REPEAT):
        with Session(committing_engine) as s:
            a = models.User(email=f"a-{uuid.uuid4()}@x.org", name="A", role="admin")
            b = models.User(email=f"b-{uuid.uuid4()}@x.org", name="B", role="admin")
            s.add_all([a, b])
            s.commit()
            ids = [a.id, b.id]
        barrier = threading.Barrier(2)
        errors = []

        def demote(uid):
            with Session(committing_engine) as s:
                barrier.wait()
                try:
                    repo.update_user(s, uid, role="reader")
                    s.commit()
                except LastAdminError:
                    s.rollback()
                except Exception as e:  # z. B. Deadlock — darf nicht still verschwinden
                    errors.append(e)

        threads = [threading.Thread(target=demote, args=(i,)) for i in ids]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert errors == []
        with Session(committing_engine) as s:
            left = s.scalar(select(func.count()).select_from(models.User).where(
                models.User.id.in_(ids), models.User.role == "admin", models.User.active))
            assert left == 1
            s.query(models.User).filter(models.User.id.in_(ids)).delete()
            s.commit()


def test_admin_info(admin_client, db):
    from tests.factories import make_page, make_space
    space = make_space(db)
    make_page(db, space, admin_client.admin)
    body = admin_client.get("/api/v1/admin/info").json()
    assert body["version"] == "0.1.0"
    assert body["oidc_enabled"] is False
    assert body["users"] >= 1 and body["spaces"] >= 1 and body["pages"] >= 1
    assert body["upload_bytes"] >= 0


def test_admin_info_forbidden_for_others(client, db):
    login(client, make_user(db, role="editor"))
    assert client.get("/api/v1/admin/info").status_code == 403
