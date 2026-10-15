# CLAUDE.md

## Repo-Struktur

Unterverzeichnis `knowledgebase/` im Repo neben `email-backuparchive/` und `nas-backup/`.
Spec: `docs/superpowers/specs/2026-10-15-knowledgebase-design.md`, Plan:
`docs/superpowers/plans/2026-10-15-knowledgebase.md`.

```
backend/   FastAPI, SQLAlchemy 2, Alembic, pytest (uv)
frontend/  React 19, Vite, Tailwind 4, Radix, Tiptap 3 (npm)
backup/    Image mit kb-backup / kb-restore
e2e/       Playwright gegen den laufenden Stack
```

## Befehle

```bash
cd backend && uv run pytest -q          # braucht Docker (testcontainers, postgres:17-alpine)
cd frontend && npm test && npm run typecheck && npm run build
docker compose up -d --build --wait
```

## Architektur

```
api/*.py  (Routen, Pydantic-Schemas, keine Abfragen)
   │
permissions.py  (access, readable_space_ids, require_space, require_page)
   │
repo/*.py  (sämtliches SQL)        transfer.py  storage.py  markdown_io.py  oidc.py
   │
models.py  db.py  config.py  security.py  clock.py
```

## Invarianten

- **Rechte an genau einer Stelle.** `permissions.access()` für einzelne Objekte,
  `readable_space_ids()` als SQL-Subquery für Listen. Keine Route rechnet selbst.
- **Kein Leserecht heißt 404, nie 403.** 403 nur, wenn Lesen erlaubt ist, die Aktion nicht.
- **Jede neue Route unter `/api/v1` gehört in `tests/test_access_matrix.py`** — in `MATRIX`
  (muss für Fremde 404 liefern) oder `EXEMPT`. Der Wächtertest schlägt sonst fehl.
- **Suche filtert in SQL**, nie nachträglich in Python.
- **`DB = Annotated[Session, Depends(get_db, scope="function")]` überall.** Mit dem
  Vorgabe-Scope committet FastAPI erst nach dem Senden der Antwort; ein nacktes
  `Depends(get_db)` daneben öffnete eine zweite Session.
- **Aussperrschutz:** die Admin-Zeilen werden als *erste* Sperre der Transaktion gesperrt,
  sortiert nach id (`users._guard_last_admin`). Andersherum verklemmen sich zwei Anfragen.
- **Markdown ist die einzige gespeicherte Wahrheit.** Der Editor parst HTML nie (eigene
  marked-Instanz ohne html/tag-Tokenizer); `<b>` bleibt sichtbarer Text und wird beim
  Speichern aus dem visuellen Modus als `&lt;b&gt;` geschrieben.
- **`setEditable(x, false)`** im Editor — sonst feuert der Moduswechsel ein Update und
  speichert ungefragt.
- **Revisionen:** dieselbe Person innerhalb 10 min überschreibt ihre letzte Revision; die
  Erstfassung und Wiederherstellungen werden nie zusammengefasst.
- **Anhänge** liegen inhaltsadressiert (`uploads/ab/cd/<sha256>`), werden nur über die App
  mit Rechteprüfung ausgeliefert; inline nur PNG/JPEG/GIF/WebP nach Magic-Bytes, alles andere
  (auch SVG) als Download, immer mit `nosniff` und `CSP: sandbox`.
- **Nichts lädt zur Laufzeit von fremden Hosts** — Schriften und Icons sind gebündelt; die CSP
  in `Caddyfile` erzwingt das.
- **Uhrzeit nur über `kb.clock.now()`** — Tests verstellen sie (`frozen_clock`).

## Konventionen

- UI-Texte, Log- und Fehlermeldungen Deutsch, Code-Bezeichner Englisch.
- Fehler immer als `{"detail": "<deutscher Text>"}`.
- Conventional Commits mit deutschem Betreff. **Kein `Co-Authored-By`-Trailer.**
