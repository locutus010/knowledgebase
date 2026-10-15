"""Browser-Endpunkte für die Anmeldung über OIDC. Fehler leiten zur Anmeldeseite zurück
(`/login?error=<code>`), denn hier navigiert ein Browser, kein Skript."""

import logging
import secrets

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from kb import oidc
from kb.api.auth import start_session
from kb.config import Settings
from kb.db import DB
from kb.deps import get_settings
from kb.errors import AppError
from kb.models import User
from kb.repo import users as users_repo

log = logging.getLogger("kb")
router = APIRouter(prefix="/auth/oidc", tags=["auth"])
FLOW_COOKIE = "kb_oidc"
CALLBACK = "/api/v1/auth/oidc/callback"


def _client(request: Request, settings: Settings) -> oidc.Client:
    if not settings.oidc_enabled:
        raise AppError(404, "Nicht gefunden.")
    return oidc.Client(settings, getattr(request.app.state, "oidc_transport", None))


def _redirect_uri(request: Request, settings: Settings) -> str:
    if settings.domain:
        return f"https://{settings.domain}{CALLBACK}"
    return str(request.base_url).rstrip("/") + CALLBACK


def safe_next(value: str | None) -> str:
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    return value


def _fail(code: str) -> RedirectResponse:
    r = RedirectResponse(f"/login?error={code}", status_code=302)
    r.delete_cookie(FLOW_COOKIE, path="/api/v1/auth/oidc")
    return r


@router.get("/login")
def login(request: Request, settings: Settings = Depends(get_settings), next: str = "/"):
    client = _client(request, settings)
    state, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    verifier, challenge = oidc.pkce_pair()
    try:
        url = client.authorize_url(_redirect_uri(request, settings), state, nonce, challenge)
    except oidc.OidcError as e:
        return _fail(e.code)
    r = RedirectResponse(url, status_code=302)
    flow = oidc.sign_flow(settings.secret_key, {"s": state, "n": nonce, "v": verifier, "next": safe_next(next)})
    r.set_cookie(FLOW_COOKIE, flow, max_age=oidc.FLOW_TTL, httponly=True, samesite="lax",
                 secure=settings.cookie_secure, path="/api/v1/auth/oidc")
    return r


def _resolve_user(db, settings: Settings, claims: dict) -> User:
    sub = str(claims.get("sub") or "")
    email = str(claims.get("email") or "").strip().lower()
    if not sub:
        raise oidc.OidcError("token")
    user = db.scalar(select(User).where(User.oidc_subject == sub))
    if user is None:
        if not email:
            raise oidc.OidcError("email_missing")
        existing = users_repo.by_email(db, email)
        if existing is not None:
            if claims.get("email_verified") is not True:
                raise oidc.OidcError("email_conflict")
            existing.oidc_subject = sub
            user = existing
        else:
            name = claims.get("name") or claims.get("preferred_username") or email.split("@")[0]
            role = oidc.role_for(settings, claims.get(settings.oidc_groups_claim)) or settings.oidc_default_role
            user = users_repo.create_user(db, email=email, name=str(name)[:120], role=role,
                                          password_hash=None, oidc_subject=sub)
            return user
    if not user.active:
        raise oidc.OidcError("inactive")
    role = oidc.role_for(settings, claims.get(settings.oidc_groups_claim))
    if role is not None and role != user.role:
        try:
            users_repo.update_user(db, user.id, role=role)
        except users_repo.LastAdminError:
            log.warning("OIDC wollte den letzten Admin %s herabstufen — Rolle bleibt.", user.email)
    return user


@router.get("/callback")
def callback(request: Request, db: DB, settings: Settings = Depends(get_settings),
             code: str = "", state: str = ""):
    client = _client(request, settings)
    try:
        flow = oidc.read_flow(settings.secret_key, request.cookies.get(FLOW_COOKIE))
        if not state or not secrets.compare_digest(state, flow["s"]):
            raise oidc.OidcError("state")
        tokens = client.exchange(code, _redirect_uri(request, settings), flow["v"])
        claims = client.verify(tokens.get("id_token", ""), flow["n"])
        if settings.oidc_groups_claim not in claims or "email" not in claims:
            info = client.userinfo(tokens.get("access_token", ""))
            if info.get("sub") in (None, claims.get("sub")):
                claims = {**info, **claims} if "email" in claims else {**claims, **info}
        user = _resolve_user(db, settings, claims)
    except oidc.OidcError as e:
        # Kein Rollback nötig: _resolve_user prüft alles, bevor es schreibt.
        return _fail(e.code)
    r = RedirectResponse(safe_next(flow.get("next")), status_code=302)
    r.delete_cookie(FLOW_COOKIE, path="/api/v1/auth/oidc")
    start_session(r, request, db, user, settings)
    return r
