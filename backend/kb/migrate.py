"""Alembic programmatisch: der Container hat keinen Arbeitsordner, in dem man `alembic`
aufrufen müsste."""

from pathlib import Path

from alembic import command
from alembic.config import Config

_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def _config(url: str) -> Config:
    cfg = Config(str(_INI))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


def upgrade(url: str) -> None:
    command.upgrade(_config(url), "head")


def downgrade(url: str, target: str = "base") -> None:
    command.downgrade(_config(url), target)
