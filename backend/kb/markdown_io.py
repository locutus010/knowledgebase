"""Markdown mit YAML-Front-Matter, Dateinamen und Pfadprüfung für Export und Import."""

import posixpath
import re

import yaml

_FORBIDDEN = re.compile(r'[/\\:*?"<>|\x00-\x1f]+')
_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
             *(f"LPT{i}" for i in range(1, 10))}
ATTACHMENT_URL = re.compile(r"/api/v1/attachments/([0-9a-fA-F-]{36})")


def render_md(meta: dict, body: str) -> str:
    head = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False, default_flow_style=False)
    return f"---\n{head}---\n{body}"


def parse_md(text: str) -> tuple[dict, str]:
    text = text.lstrip("﻿")
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    try:
        meta = yaml.safe_load(text[4:end])
    except yaml.YAMLError:
        return {}, text
    if not isinstance(meta, dict):
        return {}, text
    rest = text[end + 4:]
    return meta, rest[1:] if rest.startswith("\n") else rest


def safe_name(title: str) -> str:
    name = _FORBIDDEN.sub("-", title).strip(" .-")[:120].strip(" .-")
    if not name:
        return "Seite"
    if name.upper() in _RESERVED:
        name += "-"
    return name


def is_safe_path(name: str) -> bool:
    if "\\" in name or name.startswith("/") or re.match(r"^[A-Za-z]:", name) or "\x00" in name:
        return False
    norm = posixpath.normpath(name)
    return not (norm.startswith("..") or norm.startswith("/") or "/../" in f"/{norm}/")
