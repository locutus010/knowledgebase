import pytest

from kb.config import ConfigError, Settings


def test_short_secret_key_is_rejected():
    with pytest.raises(ConfigError, match="mindestens 32 Zeichen"):
        Settings(database_url="postgresql+psycopg://x/y", secret_key="kurz")


def test_missing_secret_key_is_rejected(monkeypatch):
    monkeypatch.delenv("KB_SECRET_KEY", raising=False)
    with pytest.raises(ConfigError, match="KB_SECRET_KEY"):
        Settings(database_url="postgresql+psycopg://x/y")


def test_group_lists_are_read_comma_separated(monkeypatch):
    monkeypatch.setenv("KB_OIDC_ADMIN_GROUPS", "kb-admins, it")
    s = Settings(database_url="postgresql+psycopg://x/y", secret_key="x" * 32)
    assert s.oidc_admin_groups == ["kb-admins", "it"]


def test_cookie_secure_follows_domain():
    base = dict(database_url="postgresql+psycopg://x/y", secret_key="x" * 32)
    assert Settings(**base).cookie_secure is False
    assert Settings(**base, domain="wiki.example.org").cookie_secure is True
