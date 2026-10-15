"""Einheitliche deutsche Fehlerantworten: immer {"detail": ...}."""

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("kb")

_STATUS_TEXT = {
    401: "Bitte melde dich an.",
    403: "Dafür fehlt dir die Berechtigung.",
    404: "Nicht gefunden.",
    405: "Diese Methode ist hier nicht erlaubt.",
    413: "Die Anfrage ist zu groß.",
}

_FIELD_MESSAGES = {
    "missing": "Pflichtfeld fehlt.",
    "string_too_short": "Zu kurz.",
    "string_too_long": "Zu lang.",
    "too_long": "Zu viele Einträge.",
    "less_than_equal": "Wert ist zu groß.",
    "greater_than_equal": "Wert ist zu klein.",
    "int_parsing": "Muss eine ganze Zahl sein.",
    "uuid_parsing": "Ungültige Kennung.",
    "literal_error": "Ungültiger Wert.",
    "enum": "Ungültiger Wert.",
    "value_error": "Ungültiger Wert.",
    "string_pattern_mismatch": "Ungültiges Format.",
    "json_invalid": "Ungültiges JSON.",
}


class AppError(Exception):
    def __init__(self, status: int, detail: str, **extra):
        self.status = status
        self.detail = detail
        self.extra = extra


def _field(loc) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts) or "anfrage"


def install(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse({"detail": exc.detail, **exc.extra}, status_code=exc.status)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if not isinstance(detail, str) or detail in ("Not Found", "Method Not Allowed", "Unauthorized", "Forbidden"):
            detail = _STATUS_TEXT.get(exc.status_code, "Fehler.")
        return JSONResponse({"detail": detail}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        errors = []
        for e in exc.errors():
            msg = _FIELD_MESSAGES.get(e.get("type", ""))
            if msg is None:
                ctx_err = (e.get("ctx") or {}).get("error")
                msg = str(ctx_err) if ctx_err else "Ungültiger Wert."
            errors.append({"feld": _field(e.get("loc", ())), "meldung": msg})
        return JSONResponse({"detail": errors}, status_code=422)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        error_id = uuid.uuid4().hex[:12]
        log.exception("Unerwarteter Fehler %s", error_id, exc_info=exc)
        return JSONResponse(
            {"detail": f"Unerwarteter Fehler. Fehler-ID: {error_id}"}, status_code=500
        )
