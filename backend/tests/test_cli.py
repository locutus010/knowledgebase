import io

import pytest
from sqlalchemy import func, select

from kb import models, seed
from kb.__main__ import main
from kb.security import verify_password
from tests.conftest import SECRET
from tests.factories import make_user


@pytest.fixture
def env(monkeypatch, migrated, committing_engine):
    monkeypatch.setenv("KB_DATABASE_URL", migrated)
    monkeypatch.setenv("KB_SECRET_KEY", SECRET)
    from kb.config import get_settings
    get_settings.cache_clear()
    yield committing_engine
    get_settings.cache_clear()


def test_create_admin_reads_password_from_stdin(env, monkeypatch, capsys):
    monkeypatch.setattr("sys.stdin", io.StringIO("ein-sicheres-passwort\n"))
    code = main(["create-admin", "--email", "Chef@Example.org", "--name", "Chefin", "--password-stdin"])
    assert code == 0
    with env.connect() as conn:
        row = conn.execute(select(models.User.role, models.User.password_hash)
                           .where(models.User.email == "chef@example.org")).one()
    assert row.role == "admin"
    assert verify_password(row.password_hash, "ein-sicheres-passwort")
    assert "angelegt" in capsys.readouterr().out


def test_create_admin_twice_fails_with_message(env, monkeypatch, capsys):
    for expected in (0, 1):
        monkeypatch.setattr("sys.stdin", io.StringIO("ein-sicheres-passwort\n"))
        assert main(["create-admin", "--email", "a@example.org", "--name", "A", "--password-stdin"]) == expected
    assert "existiert bereits" in capsys.readouterr().err


def test_create_admin_rejects_short_password(env, monkeypatch, capsys):
    monkeypatch.setattr("sys.stdin", io.StringIO("kurz\n"))
    assert main(["create-admin", "--email", "a@example.org", "--name", "A", "--password-stdin"]) == 1
    assert "mindestens 10" in capsys.readouterr().err


def test_bootstrap_only_when_no_user_exists(db, settings):
    s = settings.model_copy(update={"bootstrap_admin_email": "boot@example.org",
                                    "bootstrap_admin_password": "bootstrap-passwort"})
    make_user(db)
    seed.ensure_bootstrap(db, s)
    assert db.scalar(select(models.User).where(models.User.email == "boot@example.org")) is None


def test_bootstrap_creates_admin_on_empty_database(db, settings):
    s = settings.model_copy(update={"bootstrap_admin_email": "boot@example.org",
                                    "bootstrap_admin_password": "bootstrap-passwort"})
    seed.ensure_bootstrap(db, s)
    user = db.scalar(select(models.User).where(models.User.email == "boot@example.org"))
    assert user.role == "admin"


def test_template_seed_is_idempotent(db):
    seed.ensure_templates(db)
    seed.ensure_templates(db)
    names = db.scalars(select(models.Template.name).where(models.Template.space_id.is_(None))).all()
    assert sorted(names) == sorted(["Anleitung", "Runbook", "Besprechungsprotokoll",
                                    "Entscheidung (ADR)", "Onboarding"])
    assert db.scalar(select(func.count()).select_from(models.Template)) == 5
