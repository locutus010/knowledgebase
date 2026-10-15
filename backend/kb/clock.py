"""Zentrale Uhr — Tests verstellen sie, statt zu schlafen."""

from datetime import UTC, datetime


def now() -> datetime:
    return datetime.now(UTC)
