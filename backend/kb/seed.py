"""Erstausstattung: Bootstrap-Admin und Standardvorlagen."""

import logging

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from kb.config import Settings
from kb.models import Template, User
from kb.security import hash_password

log = logging.getLogger("kb")

DEFAULT_TEMPLATES = [
    ("Anleitung", "Schritt für Schritt zum Ziel", "🧭", """\
> [!NOTE]
> Wofür ist diese Anleitung, und für wen?

## Voraussetzungen

- [ ] Zugang zu …
- [ ] Werkzeug …

## Schritte

1. Erster Schritt
2. Zweiter Schritt
3. Dritter Schritt

## Prüfen, ob es geklappt hat

Beschreibe, woran man den Erfolg erkennt.

## Häufige Probleme

| Problem | Lösung |
| --- | --- |
| … | … |
"""),
    ("Runbook", "Betrieb, Störungen und Wiederherstellung eines Dienstes", "🚨", """\
**Dienst:** …  
**Verantwortlich:** {{autor}}  
**Stand:** {{datum}}

> [!WARNING]
> Bei Ausfall zuerst: …

## Überblick

Was macht der Dienst, wovon hängt er ab?

## Überwachung

- Dashboard: …
- Alarme: …

## Störungen

### Symptom: …

1. Prüfen: `…`
2. Beheben: `…`

## Wiederherstellung

```bash
# Befehle zur Wiederherstellung
```
"""),
    ("Besprechungsprotokoll", "Teilnehmende, Beschlüsse, Aufgaben", "🗒️", """\
**Datum:** {{datum}}  
**Protokoll:** {{autor}}  
**Teilnehmende:** …

## Tagesordnung

1. …

## Notizen

…

## Beschlüsse

- …

## Aufgaben

- [ ] … (wer, bis wann)
"""),
    ("Entscheidung (ADR)", "Architekturentscheidung festhalten", "⚖️", """\
**Status:** Vorgeschlagen  
**Datum:** {{datum}}  
**Beteiligt:** {{autor}}

## Kontext

Welches Problem lösen wir, unter welchen Randbedingungen?

## Entscheidung

Wir entscheiden uns für …

## Alternativen

| Option | Vorteile | Nachteile |
| --- | --- | --- |
| … | … | … |

## Folgen

Was wird leichter, was schwerer?
"""),
    ("Onboarding", "Erste Tage für neue Kolleginnen und Kollegen", "👋", """\
Willkommen im Team! Diese Seite führt dich durch die ersten Tage.

## Tag 1

- [ ] Zugänge erhalten
- [ ] Rechner eingerichtet
- [ ] Team kennengelernt

## Woche 1

- [ ] Wichtigste Systeme verstanden
- [ ] Erste kleine Aufgabe erledigt

## Ansprechpersonen

| Thema | Person |
| --- | --- |
| … | … |
"""),
]


def ensure_bootstrap(db: Session, settings: Settings) -> None:
    if not (settings.bootstrap_admin_email and settings.bootstrap_admin_password):
        return
    if db.scalar(select(exists().where(User.id.isnot(None)))):
        return
    db.add(User(email=settings.bootstrap_admin_email.strip().lower(), name="Administrator",
                role="admin", password_hash=hash_password(settings.bootstrap_admin_password),
                must_change_password=True))
    log.warning("Bootstrap-Admin %s angelegt — bitte Passwort nach der ersten Anmeldung ändern.",
                settings.bootstrap_admin_email)


def ensure_templates(db: Session) -> None:
    if db.scalar(select(exists().where(Template.space_id.is_(None)))):
        return
    for name, description, icon, content in DEFAULT_TEMPLATES:
        db.add(Template(name=name, description=description, icon=icon, content_md=content))
