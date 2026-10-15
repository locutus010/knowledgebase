"""OpenID Connect: Authorization Code mit PKCE. Discovery und JWKS kommen vom Provider;
das ID-Token wird auf Signatur, iss, aud, exp und nonce geprüft."""

import base64
import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import urlencode

import httpx
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import KeySet

from kb.config import Settings

FLOW_TTL = 600
ALGORITHMS = ["RS256", "RS384", "RS512", "ES256", "ES384", "PS256"]


class OidcError(Exception):
    def __init__(self, code: str):
        self.code = code


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    return verifier, _b64(hashlib.sha256(verifier.encode()).digest())


def sign_flow(secret: str, data: dict) -> str:
    payload = _b64(json.dumps({**data, "t": int(time.time())}).encode())
    mac = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{mac}"


def read_flow(secret: str, value: str | None) -> dict:
    if not value or "." not in value:
        raise OidcError("state")
    payload, mac = value.rsplit(".", 1)
    expected = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(mac, expected):
        raise OidcError("state")
    try:
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except ValueError:
        raise OidcError("state") from None
    if time.time() - data.get("t", 0) > FLOW_TTL:
        raise OidcError("state")
    return data


class Client:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.settings = settings
        self.http = httpx.Client(transport=transport, timeout=10)
        self._meta: dict | None = None

    def meta(self) -> dict:
        if self._meta is None:
            url = self.settings.oidc_issuer.rstrip("/") + "/.well-known/openid-configuration"
            try:
                r = self.http.get(url)
                r.raise_for_status()
                self._meta = r.json()
            except (httpx.HTTPError, ValueError):
                raise OidcError("provider") from None
        return self._meta

    def authorize_url(self, redirect_uri: str, state: str, nonce: str, challenge: str) -> str:
        params = {"response_type": "code", "client_id": self.settings.oidc_client_id,
                  "redirect_uri": redirect_uri, "scope": "openid email profile", "state": state,
                  "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256"}
        return f"{self.meta()['authorization_endpoint']}?{urlencode(params)}"

    def exchange(self, code: str, redirect_uri: str, verifier: str) -> dict:
        data = {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri,
                "client_id": self.settings.oidc_client_id, "code_verifier": verifier}
        if self.settings.oidc_client_secret:
            data["client_secret"] = self.settings.oidc_client_secret
        try:
            r = self.http.post(self.meta()["token_endpoint"], data=data)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError, KeyError):
            raise OidcError("provider") from None

    def verify(self, id_token: str, nonce: str) -> dict:
        try:
            keys = KeySet.import_key_set(self.http.get(self.meta()["jwks_uri"]).json())
            token = jwt.decode(id_token, keys, algorithms=ALGORITHMS)
            jwt.JWTClaimsRegistry(
                leeway=60,
                iss={"essential": True, "value": self.meta().get("issuer", self.settings.oidc_issuer)},
                aud={"essential": True, "value": self.settings.oidc_client_id},
                exp={"essential": True},
                nonce={"essential": True, "value": nonce},
            ).validate(token.claims)
        except (JoseError, httpx.HTTPError, ValueError, KeyError, TypeError):
            raise OidcError("token") from None
        return dict(token.claims)

    def userinfo(self, access_token: str) -> dict:
        endpoint = self.meta().get("userinfo_endpoint")
        if not endpoint:
            return {}
        try:
            r = self.http.get(endpoint, headers={"Authorization": f"Bearer {access_token}"})
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError):
            return {}


def role_for(settings: Settings, groups) -> str | None:
    """None heißt: Rolle nicht aus dem Provider ableiten, die App verwaltet sie."""
    if not (settings.oidc_admin_groups or settings.oidc_editor_groups):
        return None
    if isinstance(groups, str):
        groups = [groups]
    groups = set(groups or [])
    if groups & set(settings.oidc_admin_groups):
        return "admin"
    if groups & set(settings.oidc_editor_groups):
        return "editor"
    return settings.oidc_default_role
