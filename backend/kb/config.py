"""Konfiguration ausschließlich über Umgebungsvariablen mit Präfix KB_."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

MIN_SECRET_LEN = 32


class ConfigError(Exception):
    """Absichtlich keine ValueError-Unterklasse: pydantic reicht sie so unverpackt durch,
    und der Start bricht mit genau dieser deutschen Meldung ab."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KB_", extra="ignore")

    database_url: str
    secret_key: str | None = None
    domain: str | None = None
    upload_dir: Path = Path("/data/uploads")
    max_upload_mb: int = 25

    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: str | None = None
    oidc_button_label: str = "SSO"
    oidc_groups_claim: str = "groups"
    oidc_admin_groups: Annotated[list[str], NoDecode] = []
    oidc_editor_groups: Annotated[list[str], NoDecode] = []
    oidc_default_role: Literal["admin", "editor", "reader"] = "reader"

    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None

    @field_validator("oidc_admin_groups", "oidc_editor_groups", mode="before")
    @classmethod
    def _split(cls, v):
        if isinstance(v, str):
            return [p.strip() for p in v.split(",") if p.strip()]
        return v

    @field_validator("domain", "oidc_issuer", mode="before")
    @classmethod
    def _empty_is_none(cls, v):
        return v or None

    @model_validator(mode="after")
    def _check(self):
        if not self.secret_key:
            raise ConfigError("KB_SECRET_KEY fehlt. Erzeuge einen mit: openssl rand -hex 32")
        if len(self.secret_key) < MIN_SECRET_LEN:
            raise ConfigError(f"KB_SECRET_KEY muss mindestens {MIN_SECRET_LEN} Zeichen lang sein.")
        if self.max_upload_mb < 1:
            raise ConfigError("KB_MAX_UPLOAD_MB muss mindestens 1 sein.")
        return self

    @property
    def cookie_secure(self) -> bool:
        return self.domain is not None

    @property
    def oidc_enabled(self) -> bool:
        return bool(self.oidc_issuer and self.oidc_client_id)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
