from sqlalchemy import select

from kb import models
from tests.factories import PASSWORD, login, make_user

LOGIN = "/api/v1/auth/login"


def test_login_sets_httponly_lax_session_cookie(client, db):
    user = make_user(db)
    r = client.post(LOGIN, json={"email": user.email, "password": PASSWORD})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("kb_session=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie


def test_email_is_case_insensitive(client, db):
    user = make_user(db, email="Anna@Example.org".lower())
    r = client.post(LOGIN, json={"email": "ANNA@example.ORG", "password": PASSWORD})
    assert r.status_code == 200


def test_me_returns_user_and_csrf_token(client, db):
    user = make_user(db, role="editor")
    login(client, user)
    body = client.get("/api/v1/auth/me").json()
    assert body["user"]["email"] == user.email
    assert body["user"]["role"] == "editor"
    assert body["user"]["is_local"] is True
    assert len(body["csrf_token"]) >= 32


def test_me_without_session_is_401(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401
    assert r.json() == {"detail": "Bitte melde dich an."}


def test_wrong_password_and_unknown_email_look_identical(client, db):
    user = make_user(db)
    a = client.post(LOGIN, json={"email": user.email, "password": "falsch-falsch"})
    b = client.post(LOGIN, json={"email": "niemand@example.org", "password": "falsch-falsch"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"detail": "E-Mail oder Passwort ist falsch."}


def test_inactive_user_cannot_log_in(client, db):
    user = make_user(db, active=False)
    r = client.post(LOGIN, json={"email": user.email, "password": PASSWORD})
    assert r.status_code == 401


def test_sixth_failure_for_one_account_is_throttled(client, db):
    user = make_user(db)
    for _ in range(5):
        assert client.post(LOGIN, json={"email": user.email, "password": "falsch-falsch"}).status_code == 401
    r = client.post(LOGIN, json={"email": user.email, "password": PASSWORD})
    assert r.status_code == 429
    assert "Zu viele" in r.json()["detail"]


def test_twenty_first_failure_from_one_ip_is_throttled(client, db):
    for i in range(20):
        client.post(LOGIN, json={"email": f"x{i}@example.org", "password": "falsch-falsch"})
    user = make_user(db)
    r = client.post(LOGIN, json={"email": user.email, "password": PASSWORD})
    assert r.status_code == 429


def test_successful_login_clears_failures_of_the_account(client, db):
    user = make_user(db)
    for _ in range(4):
        client.post(LOGIN, json={"email": user.email, "password": "falsch-falsch"})
    login(client, user)
    left = db.scalars(select(models.LoginAttempt).where(models.LoginAttempt.email == user.email)).all()
    assert left == []


def test_write_without_csrf_header_is_rejected(client, db):
    user = make_user(db)
    login(client, user)
    del client.headers["X-CSRF-Token"]
    r = client.post("/api/v1/auth/logout")
    assert r.status_code == 403
    assert r.json() == {"detail": "Sicherheitstoken fehlt oder ist ungültig."}


def test_logout_deletes_the_session_on_the_server(client, db):
    user = make_user(db)
    login(client, user)
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert db.scalars(select(models.Session_).where(models.Session_.user_id == user.id)).all() == []
    assert client.get("/api/v1/auth/me").status_code == 401


def test_deactivated_user_loses_running_session(client, db):
    user = make_user(db)
    login(client, user)
    user.active = False
    db.flush()
    assert client.get("/api/v1/auth/me").status_code == 401


def test_password_change_requires_ten_characters(client, db):
    user = make_user(db)
    login(client, user)
    r = client.post("/api/v1/auth/password", json={"current": PASSWORD, "new": "123456789"})
    assert r.status_code == 422


def test_password_change_requires_current_password(client, db):
    user = make_user(db)
    login(client, user)
    r = client.post("/api/v1/auth/password", json={"current": "falsch-falsch", "new": "ganz-neues-passwort"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Das aktuelle Passwort stimmt nicht."


def test_password_change_resets_must_change_flag(client, db):
    user = make_user(db)
    user.must_change_password = True
    db.flush()
    login(client, user)
    r = client.post("/api/v1/auth/password", json={"current": PASSWORD, "new": "ganz-neues-passwort"})
    assert r.status_code == 204
    db.refresh(user)
    assert user.must_change_password is False
    client.post("/api/v1/auth/logout")
    login(client, user, password="ganz-neues-passwort")


def test_foreign_origin_is_rejected_when_domain_is_set(app, client, db):
    app.state.settings = app.state.settings.model_copy(update={"domain": "wiki.example.org"})
    user = make_user(db)
    r = client.post(LOGIN, json={"email": user.email, "password": PASSWORD},
                    headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    r = client.post(LOGIN, json={"email": user.email, "password": PASSWORD},
                    headers={"Origin": "https://wiki.example.org"})
    assert r.status_code == 200
    assert "Secure" in r.headers["set-cookie"]


def test_auth_config_reports_oidc(client):
    assert client.get("/api/v1/auth/config").json() == {"oidc_enabled": False, "oidc_label": "SSO"}
