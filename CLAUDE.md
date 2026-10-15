# CLAUDE.md

## Repo-Struktur

Die Git-Repo-Wurzel ist `/home/locutus010/claude/`, nicht dieses Verzeichnis: hier liegt das
Unterverzeichnis `knowledgebase/` neben `email-backuparchive/` und `nas-backup/`. Git-Pfade sind
relativ zur Wurzel (`knowledgebase/backend/…`), entwickelt wird auf `main`.
Spec: `docs/superpowers/specs/2026-10-15-knowledgebase-design.md`, Plan:
`docs/superpowers/plans/2026-10-15-knowledgebase.md`.

```
backend/   FastAPI, SQLAlchemy 2, Alembic, pytest (uv)
frontend/  React 19, Vite, Tailwind 4, Radix, Tiptap 3 (npm)
backup/    Image mit kb-backup / kb-restore
e2e/       Playwright gegen den laufenden Stack
```

## Veröffentlichung

Das GitHub-Repo `locutus010/knowledgebase` (privat) enthält **nur dieses Unterverzeichnis**,
mit den Dateien auf oberster Ebene — das Eltern-Repo trackt daneben noch andere Projekte, die
dort nichts zu suchen haben. Nachschieben deshalb über einen frischen Subtree-Split, nicht mit
einem gewöhnlichen `git push`:

```bash
cd /home/locutus010/claude
git branch -D export-knowledgebase 2>/dev/null
git subtree split --prefix=knowledgebase -b export-knowledgebase
git push git@github.com:locutus010/knowledgebase.git export-knowledgebase:main
```

Der Split ist deterministisch: dieselben Commits ergeben dieselben Hashes, der Push ist also
ein Fast-Forward. Vor jedem Push prüfen, dass keine `.env` und keine `backend/dev.env`
versioniert sind (`git ls-files | grep -E '(^|/)(\.env|dev\.env)$'` muss leer bleiben) — beide
enthalten echte Geheimnisse und stehen deshalb in `.gitignore`.

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
- **Revisionen: eine je Bearbeitungsrunde.** Das Frontend schickt beim Speichern eine
  `edit_session`, die bei jedem „Bearbeiten“ neu entsteht; nur Autospeichern derselben Runde
  und derselben Person wird zusammengefasst. Kein Zeitfenster. Ohne `edit_session` entsteht
  pro Speichern eine Revision. Erstfassung und Wiederherstellungen werden nie zusammengefasst.
- **`page.version` ist ein interner Zähler** für die Konflikterkennung und hat Lücken. Menschen
  sehen `number` (fortlaufend ab 1, per `row_number()` berechnet), nie `version`.
- **Der Editor vergleicht gegen sein eigenes Markdown** (`onCreate` setzt die Basis), nicht gegen
  den gespeicherten Text — sonst speichert schon eine Normalisierung (Tabelle anklicken).
- **`attachments.listed`:** `true` = über den Abschnitt „Anhänge“ hinzugefügt (dort gelistet,
  per Dateiname suchbar, im Export-Front-Matter). `false` = im Editor eingefügt (`?listed=false`),
  gehört nur zum Text. Der Import liest zuerst die gelisteten aus dem Front-Matter, dann die
  Links im Text — sonst würde ein gelisteter Anhang, der auch im Text steht, zu „nur im Text“.
- **`pages.attachments_text` spiegelt die Dateinamen der gelisteten Anhänge** für die Suche
  (`repo.attachments.refresh_text` nach jedem Hochladen und Löschen). Die Suche behandelt
  Bindestriche *im* Wort wie Leerzeichen — PostgreSQL läse „Angebot-2026“ sonst als
  „angebot“ plus Zahl „-2026“.
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
