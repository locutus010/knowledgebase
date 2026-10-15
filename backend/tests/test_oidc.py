import json
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from joserfc import jwt
from joserfc.jwk import RSAKey
from sqlalchemy import select

from kb import models
from tests.factories import make_user

ISSUER = "https://idp.example.org"
CLIENT_ID = "kb"
KEY = RSAKey.generate_key(2048, parameters={"kid": "k1"})


class FakeIdP:
    def __init__(self):
        self.claims = {}
        self.nonce = None
        self.userinfo = {}
        self.token_requests = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.endswith("/.well-known/openid-configuration"):
            return httpx.Response(200, json={
                "issuer": ISSUER, "authorization_endpoint": f"{ISSUER}/auth",
                "token_endpoint": f"{ISSUER}/token", "jwks_uri": f"{ISSUER}/jwks",
                "userinfo_endpoint": f"{ISSUER}/userinfo"})
        if url.endswith("/jwks"):
            return httpx.Response(200, json={"keys": [KEY.as_dict(private=False)]})
        if url.endswith("/token"):
            self.token_requests.append(dict(parse_qs(request.content.decode())))
            now = int(time.time())
            claims = {"iss": ISSUER, "aud": CLIENT_ID, "iat": now, "exp": now + 300,
                      "nonce": self.nonce, **self.claims}
            token = jwt.encode({"alg": "RS256", "kid": "k1"}, claims, KEY)
            return httpx.Response(200, json={"access_token": "at", "token_type": "Bearer", "id_token": token})
        if url.endswith("/userinfo"):
            return httpx.Response(200, json=self.userinfo)
        return httpx.Response(404)


@pytest.fixture
def idp(app):
    fake = FakeIdP()
    app.state.settings = app.state.settings.model_copy(update={
        "oidc_issuer": ISSUER, "oidc_client_id": CLIENT_ID, "oidc_client_secret": "geheim",
        "oidc_admin_groups": ["kb-admins"], "oidc_editor_groups": ["kb-editors"]})
    app.state.oidc_transport = httpx.MockTransport(fake.handler)
    return fake


def start(client, next_="/"):
    r = client.get("/api/v1/auth/oidc/login", params={"next": next_}, follow_redirects=False)
    assert r.status_code == 302
    q = parse_qs(urlparse(r.headers["location"]).query)
    return q


def finish(client, idp, q, **claims):
    idp.nonce = q["nonce"][0]
    idp.claims = {"sub": "s-1", "email": "sso@example.org", "email_verified": True, "name": "Sina SSO",
                  **claims}
    return client.get("/api/v1/auth/oidc/callback", params={"code": "c", "state": q["state"][0]},
                      follow_redirects=False)


def test_config_reports_oidc_enabled(client, idp):
    assert client.get("/api/v1/auth/config").json()["oidc_enabled"] is True


def test_login_redirect_uses_pkce(client, idp):
    q = start(client)
    assert q["client_id"] == [CLIENT_ID]
    assert q["code_challenge_method"] == ["S256"]
    assert q["response_type"] == ["code"]
    assert "openid" in q["scope"][0]


def test_new_user_is_created_with_role_from_groups(client, idp, db):
    q = start(client, "/spaces/eng")
    r = finish(client, idp, q, groups=["kb-editors"])
    assert r.status_code == 302
    assert r.headers["location"] == "/spaces/eng"
    me = client.get("/api/v1/auth/me").json()["user"]
    assert me["email"] == "sso@example.org"
    assert me["role"] == "editor"
    assert me["is_local"] is False
    assert idp.token_requests[0]["code_verifier"]


def test_role_is_updated_on_every_login(client, idp, db):
    finish(client, idp, start(client), groups=["kb-admins"])
    client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": client.get("/api/v1/auth/me").json()["csrf_token"]})
    make_user(db, role="admin")  # damit der SSO-Admin nicht der letzte ist
    finish(client, idp, start(client), groups=[])
    assert client.get("/api/v1/auth/me").json()["user"]["role"] == "reader"


def test_last_admin_is_not_demoted_by_groups(client, idp, db):
    finish(client, idp, start(client), groups=["kb-admins"])
    client.cookies.clear()
    finish(client, idp, start(client), groups=[])
    assert client.get("/api/v1/auth/me").json()["user"]["role"] == "admin"


def test_groups_from_userinfo_when_missing_in_token(client, idp):
    idp.userinfo = {"groups": ["kb-admins"]}
    finish(client, idp, start(client))
    assert client.get("/api/v1/auth/me").json()["user"]["role"] == "admin"


def test_verified_email_links_existing_local_account(client, idp, db):
    local = make_user(db, email="sso@example.org", role="editor")
    finish(client, idp, start(client), groups=["kb-editors"])
    db.refresh(local)
    assert local.oidc_subject == "s-1"
    assert client.get("/api/v1/auth/me").json()["user"]["id"] == str(local.id)


def test_unverified_email_does_not_take_over_local_account(client, idp, db):
    local = make_user(db, email="sso@example.org", role="admin")
    r = finish(client, idp, start(client), email_verified=False)
    assert r.headers["location"] == "/login?error=email_conflict"
    db.refresh(local)
    assert local.oidc_subject is None


def test_wrong_state_is_rejected(client, idp):
    q = start(client)
    q["state"] = ["gefaelscht"]
    r = finish(client, idp, q)
    assert r.headers["location"] == "/login?error=state"
    assert client.get("/api/v1/auth/me").status_code == 401


def test_wrong_nonce_is_rejected(client, idp):
    q = start(client)
    idp.nonce = "falsch"
    idp.claims = {"sub": "s-1", "email": "sso@example.org", "email_verified": True}
    r = client.get("/api/v1/auth/oidc/callback", params={"code": "c", "state": q["state"][0]},
                   follow_redirects=False)
    assert r.headers["location"] == "/login?error=token"


def test_deactivated_sso_user_cannot_log_in(client, idp, db):
    db.add(models.User(email="sso@example.org", name="X", role="reader", oidc_subject="s-1", active=False))
    db.flush()
    r = finish(client, idp, start(client))
    assert r.headers["location"] == "/login?error=inactive"


def test_open_redirect_is_neutralized(client, idp):
    for evil in ("https://evil.example", "//evil.example", "/\\evil.example"):
        r = finish(client, idp, start(client, evil))
        assert r.headers["location"] == "/", evil
        client.cookies.clear()


def test_disabled_oidc_is_404(client):
    assert client.get("/api/v1/auth/oidc/login", follow_redirects=False).status_code == 404


def test_tampered_flow_cookie_is_rejected(client, idp):
    q = start(client)
    raw = client.cookies.get("kb_oidc")
    client.cookies.set("kb_oidc", raw[:-2] + ("aa" if not raw.endswith("aa") else "bb"))
    r = finish(client, idp, q)
    assert r.headers["location"] == "/login?error=state"
    assert json
