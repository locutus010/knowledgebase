"""Der Deploy-Stack aus fertigen Images muss zur Version passen, die dieses Repo beschreibt."""

import json
import re
import tomllib
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE_RELEASE = ROOT / "compose.release.yaml"
PYPROJECT = ROOT / "backend" / "pyproject.toml"
PACKAGE_JSON = ROOT / "frontend" / "package.json"
OWN_IMAGES = {"app", "web", "backup"}


def _version() -> str:
    return tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))["project"]["version"]


def _services() -> dict:
    return yaml.safe_load(COMPOSE_RELEASE.read_text(encoding="utf-8"))["services"]


def test_release_compose_pins_the_version_from_pyproject():
    """Bliebe die Marke beim Hochzählen stehen, zöge jeder Portainer-Stack weiter die alte
    Fassung — ohne Fehlermeldung, denn das alte Image existiert ja noch."""
    version = _version()
    services = _services()
    for name in OWN_IMAGES:
        assert services[name]["image"] == f"ghcr.io/locutus010/knowledgebase-{name}:{version}", (
            f"Dienst {name!r} zeigt auf {services[name]['image']!r}, die pyproject.toml steht auf "
            f"{version!r}. Beide zusammen hochsetzen."
        )


def test_frontend_version_matches_backend():
    assert json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))["version"] == _version()


def test_release_compose_needs_no_source_tree():
    """Ein Portainer-Stack aus dem Web-Editor hat keinen Quellbaum und kein Arbeitsverzeichnis."""
    text = COMPOSE_RELEASE.read_text(encoding="utf-8")
    assert re.search(r"^\s*build:", text, re.MULTILINE) is None
    for name, svc in _services().items():
        for vol in svc.get("volumes", []):
            source = vol.split(":", 1)[0]
            assert not source.startswith((".", "/", "$")), f"{name}: Bind-Mount {vol!r} statt Named Volume"


def test_release_compose_requires_the_secrets():
    text = COMPOSE_RELEASE.read_text(encoding="utf-8")
    assert "${POSTGRES_PASSWORD:?" in text
    assert "${KB_SECRET_KEY:?" in text
