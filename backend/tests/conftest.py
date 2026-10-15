"""Gemeinsame Fixtures: ein echtes PostgreSQL pro Testlauf, jede Testfunktion in einem
zurückgerollten SAVEPOINT."""

import os
import subprocess

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from kb.config import Settings
from kb.db import get_db
from kb.main import create_app

SECRET = "x" * 40


def _docker_host() -> None:
    """Docker Desktop legt den Socket nicht unter /var/run ab; testcontainers liest nur
    DOCKER_HOST, nicht den aktiven Docker-Kontext."""
    if os.environ.get("DOCKER_HOST"):
        return
    try:
        host = subprocess.run(
            ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return
    if host:
        os.environ["DOCKER_HOST"] = host
        os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")


@pytest.fixture(scope="session")
def pg_url():
    url = os.environ.get("KB_TEST_DATABASE_URL")
    if url:
        yield url
        return
    _docker_host()
    from testcontainers.community.postgres import PostgresContainer

    with PostgresContainer("postgres:17-alpine", driver="psycopg") as pg:
        yield pg.get_connection_url()


@pytest.fixture(scope="session")
def migrated(pg_url):
    from kb.migrate import upgrade

    upgrade(pg_url)
    return pg_url


@pytest.fixture(scope="session")
def engine(migrated):
    eng = create_engine(migrated)
    yield eng
    eng.dispose()


@pytest.fixture
def settings(tmp_path, migrated):
    return Settings(database_url=migrated, secret_key=SECRET, upload_dir=tmp_path / "uploads")


@pytest.fixture
def db(engine):
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    yield session
    session.close()
    trans.rollback()
    conn.close()


@pytest.fixture
def app(settings, db):
    application = create_app(settings)

    def _db():
        yield db
        db.flush()

    application.dependency_overrides[get_db] = _db
    return application


@pytest.fixture
def client(app):
    with TestClient(app, base_url="http://testserver") as c:
        yield c


@pytest.fixture
def committing_engine(engine):
    """Für Tests, die echte Commits über mehrere Verbindungen brauchen (Gleichzeitigkeit).
    Leert danach alle Tabellen."""
    yield engine
    with engine.begin() as conn:
        tables = conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'alembic_version'"
        )).scalars().all()
        conn.execute(text("TRUNCATE " + ", ".join(f'"{t}"' for t in tables) + " CASCADE"))
