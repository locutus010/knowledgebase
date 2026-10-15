"""Anwendungsfabrik."""

from fastapi import FastAPI

from kb import __version__, errors
from kb.api import api
from kb.config import Settings
from kb.db import make_engine, make_sessionmaker


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="Wissensdatenbank", version=__version__, docs_url=None, redoc_url=None,
                  openapi_url="/api/openapi.json")
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.sessionmaker = make_sessionmaker(app.state.engine)
    errors.install(app)

    @app.get("/api/healthz", include_in_schema=False)
    def healthz():
        return {"status": "ok"}

    app.include_router(api)
    return app
