# Wissensdatenbank — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selbst entwickelte Team-Wissensdatenbank mit Rollen- und Bereichsrechten, OIDC, umschaltbarem WYSIWYG-/Markdown-Editor und Atlas-Oberfläche, ausgeliefert als Docker-Compose-Stack.

**Architecture:** FastAPI-Backend (sync SQLAlchemy 2, Alembic) gegen PostgreSQL 17; React-SPA (Vite, Tailwind 4, Radix, Tiptap) wird ins Caddy-Image gebaut, Caddy leitet `/api` an die App. Rechte werden an genau einer Stelle berechnet (`kb/permissions.py`) und für Listen als SQL-Subquery ausgedrückt.

**Tech Stack:** Python 3.12, uv, FastAPI, SQLAlchemy 2, psycopg 3, Alembic, pydantic-settings, argon2-cffi, authlib, httpx, PyYAML, python-multipart; pytest + testcontainers. Node 22, React 19, TypeScript, Vite 8, Tailwind 4, Radix UI, cmdk, sonner, lucide-react, TanStack Query, React Router 7, Tiptap 3 (`@tiptap/markdown`), CodeMirror 6, `diff`, DOMPurify; Vitest, Playwright. Caddy 2, PostgreSQL 17.

**Spec:** `knowledgebase/docs/superpowers/specs/2026-10-15-knowledgebase-design.md`

## Global Constraints

- Alle Befehle laufen in `knowledgebase/backend`, `knowledgebase/frontend` bzw. `knowledgebase/`; Git-Pfade relativ zur Repo-Wurzel.
- UI-Texte, Log- und Fehlermeldungen Deutsch, Code-Bezeichner Englisch.
- Conventional Commits mit deutschem Betreff, **kein `Co-Authored-By`-Trailer**, kein Claude-Hinweis.
- Fehlerantworten immer `{"detail": "<deutscher Text>"}`.
- Kein Bereich ohne Leserecht wird je sichtbar: 404, nie 403.
- Kein SQL außerhalb von `kb/repo/`; Routen rufen nur Repo-Funktionen.
- Nichts wird zur Laufzeit von fremden Hosts geladen (Schriften, Icons gebündelt).
- `KB_SECRET_KEY` ≥ 32 Zeichen, sonst Abbruch mit deutscher Meldung.
- Passwort-Mindestlänge 10; Login-Drosselung 5/Konto bzw. 20/IP in 15 min → 429.
- Revisionen derselben Person innerhalb 10 min werden zusammengefasst.
- `KB_MAX_UPLOAD_MB` Vorgabe 25, `KB_BACKUP_KEEP_DAYS` Vorgabe 14, `KB_HTTP_PORT` Vorgabe 8080.
- Bereichsfarben: `teal, indigo, violet, rose, orange, amber, green, slate`.
- Zahlen aus Anfragen haben Ober- und Untergrenzen in den Schemas (limit 1–100, offset 0–100000, position 0–1000000).

## Review Focus

1. **Suche mit Sonderzeichen** (`"`, `-`, `:`, `&`, `'`, leere Eingabe, nur Stoppwörter) — erwartet leere Trefferliste statt 500. Test in Task 10.
2. **Verschieben einer Seite unter ihren eigenen Nachfahren** — erwartet 422 mit Meldung, Baum unverändert. Test in Task 7.
3. **Import-ZIP mit `../`-Pfaden, absoluten Pfaden oder >5000 Dateien** — erwartet 422, nichts geschrieben. Test in Task 12.
4. **Zwei Admins stufen sich gleichzeitig gegenseitig herab** — erwartet: genau einer bleibt Admin. Test in Task 5.
5. **Speichern mit veralteter `base_version`** — erwartet 409 mit aktueller Fassung, keine Revision geschrieben. Test in Task 7.

## Dateistruktur

```
knowledgebase/
  compose.yaml  .env.example  Caddyfile  README.md  CLAUDE.md
  backup/backup.sh
  backend/
    pyproject.toml  Dockerfile  alembic.ini
    alembic/env.py  alembic/versions/0001_initial.py
    kb/
      __init__.py  __main__.py (CLI: serve, migrate, create-admin, gc-uploads)
      config.py        Settings (pydantic-settings)
      db.py            Engine, SessionLocal, get_db
      models.py        SQLAlchemy-Modelle
      permissions.py   Level, access(), readable_space_ids()
      security.py      Passwort-Hash, Tokens
      errors.py        Fehlerbehandlung
      deps.py          current_user, require_csrf, require_admin
      storage.py       Anhang-Ablage nach SHA-256
      markdown_io.py   Front-Matter, Export-Baum, Import-Parser
      seed.py          Standardvorlagen
      repo/            users.py sessions.py spaces.py pages.py revisions.py
                       tags.py personal.py search.py attachments.py templates.py
      api/             __init__.py (Router) auth.py oidc.py users.py spaces.py
                       pages.py attachments.py personal.py search.py
                       templates.py transfer.py
      main.py          create_app()
    tests/  conftest.py  factories.py  test_*.py
  frontend/
    package.json  vite.config.ts  tsconfig.json  index.html  Dockerfile
    src/
      main.tsx  App.tsx  index.css (Atlas-Tokens)
      lib/  api.ts  auth.tsx  theme.tsx  colors.ts  format.ts  utils.ts
      components/ui/  button input dialog dropdown popover tooltip ...
      components/  AppShell Sidebar SpaceSwitcher PageTree Breadcrumbs
                   CommandPalette TagPills Avatar EmptyState ...
      editor/  Editor.tsx extensions.ts markdown.ts SlashMenu.tsx
               BubbleToolbar.tsx MarkdownSource.tsx Callout.ts
      pages/   Login Home Space Page NewPage Revisions Search
               SpaceSettings Admin Profile NotFound
    tests/   markdown.roundtrip.test.ts tree.test.ts
  e2e/  package.json playwright.config.ts smoke.spec.ts
```

---

## Teil A — Backend

### Task 1: Backend-Gerüst, Konfiguration, Test-Datenbank, Healthcheck

**Files:** Create `backend/pyproject.toml`, `kb/__init__.py`, `kb/config.py`, `kb/db.py`, `kb/errors.py`, `kb/main.py`, `kb/api/__init__.py`, `tests/conftest.py`, `tests/test_health.py`, `tests/test_config.py`.

**Interfaces — Produces:**
- `kb.config.Settings` (Felder: `database_url`, `secret_key`, `domain`, `upload_dir: Path`, `max_upload_mb=25`, `oidc_issuer`, `oidc_client_id`, `oidc_client_secret`, `oidc_button_label="SSO"`, `oidc_groups_claim="groups"`, `oidc_admin_groups: list[str]`, `oidc_editor_groups: list[str]`, `oidc_default_role="reader"`, `bootstrap_admin_email`, `bootstrap_admin_password`), Präfix `KB_`; `get_settings()` mit `lru_cache`; `ConfigError`.
- `kb.db.make_engine(url)`, `kb.db.get_db()` (FastAPI-Dependency, Session pro Anfrage, Commit am Ende, Rollback bei Fehler).
- `kb.main.create_app(settings) -> FastAPI`.
- Fixtures: `pg_url` (session, testcontainers `postgres:17-alpine`, `alembic upgrade head`), `db` (Session in SAVEPOINT, Rollback), `client` (TestClient mit überschriebenem `get_db`), `settings`.

- [ ] Test: `GET /api/healthz` → 200 `{"status":"ok"}` ohne Anmeldung, auch wenn `get_db` eine Exception wirft.
- [ ] Test: `Settings(secret_key="kurz")` → `ConfigError` mit „mindestens 32 Zeichen“.
- [ ] Test: Unbekannte Route → 404 mit `{"detail": "Nicht gefunden."}`; Validierungsfehler → 422 mit `detail` als Liste von `{feld, meldung}` auf Deutsch.
- [ ] Implementieren, Tests grün, Commit `feat: Backend-Gerüst mit Healthcheck und Test-Datenbank`.

### Task 2: Datenmodell und erste Migration

**Files:** Create `kb/models.py`, `alembic.ini`, `alembic/env.py`, `alembic/versions/0001_initial.py`, `tests/test_schema.py`.

**Produces:** Modelle `User, Session_, LoginAttempt, Space, SpaceMember, Page, PageRevision, Tag, PageTag, Favorite, PageView, Template, Attachment` exakt nach Spec, zusätzlich `pages.tags_text text not null default ''` und Tabelle `login_attempts(id, email, ip, at)`. `pages.search_vector` als `GENERATED ALWAYS AS (setweight(to_tsvector('german', coalesce(title,'')),'A') || setweight(to_tsvector('german', tags_text),'B') || setweight(to_tsvector('german', content_md),'C')) STORED` mit GIN-Index. Enum-Werte als `CHECK`-Constraints, nicht als PG-Enums (einfacher zu migrieren).

- [ ] Test: Nach `upgrade head` existieren alle Tabellen; `search_vector` einer eingefügten Seite enthält den gestemmten Titel (`'deploy'` für „Deployments“).
- [ ] Test: `alembic downgrade base` und erneut `upgrade head` laufen fehlerfrei.
- [ ] Commit `feat: Datenmodell und erste Migration`.

### Task 3: Passwörter, Sitzungen, CSRF, Login

**Files:** Create `kb/security.py`, `kb/repo/users.py`, `kb/repo/sessions.py`, `kb/deps.py`, `kb/api/auth.py`, `tests/factories.py`, `tests/test_auth.py`.

**Produces:**
- `security.hash_password(pw) -> str`, `verify_password(hash, pw) -> bool`, `new_token() -> str`, `token_hash(t) -> str`.
- `repo.sessions.create(db, user, user_agent) -> (token, csrf)`, `lookup(db, token) -> (Session_, User) | None` (verlängert gleitend, prüft `active`), `delete(db, token)`, `delete_for_user(db, user_id)`.
- `deps.current_user`, `deps.optional_user`, `deps.require_csrf` (alle Nicht-GET außer `/auth/login`), `deps.require_admin`.
- `factories.make_user(db, role="reader", email=None, password="geheimes-passwort")`, `factories.login(client, user) -> client` (setzt Cookie und CSRF-Header).
- Endpunkte `POST /auth/login {email,password}`, `POST /auth/logout`, `GET /auth/me` → `{user:{id,email,name,role,avatar_color,must_change_password,is_local}, csrf_token}`, `POST /auth/password {current,new}`, `GET /auth/config` → `{oidc_enabled, oidc_label}`.

- [ ] Tests: Login richtig → 200 + Cookie `kb_session` HttpOnly SameSite=Lax; falsch und unbekannte E-Mail → identische 401 „E-Mail oder Passwort ist falsch.“; deaktiviert → 401; 6. Fehlversuch für ein Konto → 429; 21. für eine IP → 429; POST ohne CSRF-Header → 403 „Sicherheitstoken fehlt oder ist ungültig.“; Logout löscht die Sitzung serverseitig; Passwortwechsel mit 9 Zeichen → 422; `Origin` fremder Domain beim Login → 403 (nur wenn `KB_DOMAIN` gesetzt); `must_change_password` wird beim Wechsel zurückgesetzt.
- [ ] Commit `feat: Anmeldung mit Sitzungen, CSRF und Drosselung`.

### Task 4: CLI, Bootstrap-Admin und Standardvorlagen

**Files:** Create `kb/__main__.py`, `kb/seed.py`, `tests/test_cli.py`.

**Produces:** `python -m kb serve|migrate|create-admin --email --name [--password-stdin]|gc-uploads`; `seed.ensure_bootstrap(db, settings)` (legt Admin nur an, wenn `users` leer ist) und `seed.ensure_templates(db)` (fünf globale Vorlagen „Anleitung“, „Runbook“, „Besprechungsprotokoll“, „Entscheidung (ADR)“, „Onboarding“, nur wenn noch keine globale Vorlage existiert). `serve` = migrate → seed → uvicorn auf `0.0.0.0:8000`, 1 Worker, `--proxy-headers`.

- [ ] Tests: `create-admin` legt Admin an, doppelte E-Mail → Exit 1 mit Meldung; Bootstrap legt nichts an, wenn ein Benutzer existiert; Vorlagen-Seed ist idempotent.
- [ ] Commit `feat: CLI mit create-admin und Standardvorlagen`.

### Task 5: Benutzerverwaltung mit Aussperrschutz

**Files:** Create `kb/api/users.py`; Modify `kb/repo/users.py`; Test `tests/test_users_admin.py`.

**Produces:** `repo.users.list_users`, `create_user(db, email, name, role, password)`, `update_user(db, user_id, *, name=None, role=None, active=None)`, `delete_user`, `reset_password(db, user_id) -> str` (Einmal-Passwort, 16 Zeichen, `must_change_password=True`). Aussperrschutz: `_guard_last_admin(db)` sperrt alle aktiven Admin-Zeilen per `SELECT … FOR UPDATE` und zählt in derselben Transaktion; Verstoß → `LastAdminError` → 409 „Der letzte aktive Administrator kann nicht entfernt werden.“ Deaktivieren löscht Sitzungen.

- [ ] Tests: Nicht-Admin → 403 auf allen `/users`-Routen; anlegen, Rolle ändern, deaktivieren, löschen; letzter Admin herabstufen/deaktivieren/löschen → 409; **Gleichzeitigkeit**: zwei Threads mit eigenen Verbindungen (Fixture `committing_db`, echte Commits, danach `TRUNCATE`) stufen je einen von zwei Admins herab → genau ein aktiver Admin bleibt, 200 Wiederholungen.
- [ ] Commit `feat: Benutzerverwaltung mit Aussperrschutz unter Gleichzeitigkeit`.

### Task 6: Bereiche, Mitglieder, Rechteberechnung

**Files:** Create `kb/permissions.py`, `kb/repo/spaces.py`, `kb/api/spaces.py`; Test `tests/test_permissions.py`, `tests/test_spaces.py`.

**Produces:**
```python
class Level(IntEnum): NONE=0; READ=1; EDIT=2; MANAGE=3
def access(db, user, space) -> Level
def readable_space_ids(user) -> Select  # Subquery für WHERE space_id IN (...)
def require_space(db, user, slug, need: Level) -> Space  # 404 wenn < READ, 403 wenn < need
```
Endpunkte nach Spec, Archivieren über `PATCH {archived: true}` (manage); `GET /spaces` liefert nur lesbare Bereiche mit `my_level`, `page_count`. Slug wird aus dem Namen erzeugt (ASCII, Umlaute transliteriert, eindeutig mit Suffix). `editor` und `admin` dürfen anlegen; Ersteller wird `manage`.

- [ ] Tests: Tabelle über `default_access × member_level × role` gegen `access()`; privater Bereich → 404 für Nichtmitglied auf GET/PATCH/DELETE/Mitglieder; Mitglied `read` → PATCH 403; Farbe außerhalb der Palette → 422; Reader darf keinen Bereich anlegen (403).
- [ ] Commit `feat: Bereiche mit Rechteberechnung an einer Stelle`.

### Task 7: Seiten, Baum, Versionen, Verschieben, Papierkorb

**Files:** Create `kb/repo/pages.py`, `kb/repo/revisions.py`, `kb/api/pages.py`; Test `tests/test_pages.py`, `tests/test_tree.py`, `tests/test_revisions.py`.

**Produces:** `GET /spaces/{slug}/tree` → flache Liste `{id,parent_id,title,icon,position,has_children}` sortiert; `POST /spaces/{slug}/pages {title,parent_id?,content_md?,icon?,template_id?}`; `GET /pages/{id}` → Seite mit `space{slug,name,color,icon}`, `breadcrumbs`, `tags`, `is_favorite`, `my_level`, `updated_by{name}`; schreibt `page_views`; `PATCH /pages/{id} {base_version,title?,content_md?,icon?}`; `POST /pages/{id}/move {parent_id,position,space_slug?}`; `DELETE` (Papierkorb, Teilbaum), `POST /restore`, `DELETE /purge` (manage), `GET /spaces/{slug}/trash`; Revisionen nach Spec.

- [ ] Tests: PATCH mit alter `base_version` → 409 mit `{detail, current:{version,title,content_md,updated_by}}`, keine neue Revision; zweimal speichern innerhalb 10 min → 1 Revision, nach 11 min (Zeit über Fixture verstellt) → 2; Verschieben unter eigenen Nachfahren → 422 „Eine Seite kann nicht unter sich selbst verschoben werden.“; Verschieben in fremden Bereich ohne `edit` dort → 404/403; Papierkorb blendet Teilbaum aus Baum und Suche aus; Wiederherstellen ohne Elternteil → oberste Ebene; Revision wiederherstellen erzeugt neue Version; Vorlage mit `{{datum}}`, `{{autor}}`, `{{titel}}` wird ersetzt.
- [ ] Commit `feat: Seiten mit Baum, Versionen und Papierkorb`.

### Task 8: Tags, Favoriten, Startseite

**Files:** Create `kb/repo/tags.py`, `kb/repo/personal.py`, `kb/api/personal.py`; Modify `kb/api/pages.py`; Test `tests/test_tags.py`, `tests/test_personal.py`.

**Produces:** `PUT /pages/{id}/tags {tags:[str]}` (normalisiert: trim, klein, max 32 Zeichen, max 20 Tags, legt fehlende an, pflegt `pages.tags_text`); `GET /spaces/{slug}/tags` mit Anzahl; `GET /me/home` → `{recent_views, recent_changes, favorites}` (je max 12, nur lesbare Bereiche, ohne Papierkorb); `PUT/DELETE /me/favorites/{page_id}`.

- [ ] Tests: Favorit einer Seite in einem Bereich, aus dem man danach entfernt wird, erscheint nicht mehr in `/me/home`; Tag-Suche findet über `tags_text`; doppelte Tags werden zusammengeführt.
- [ ] Commit `feat: Tags, Favoriten und persönliche Startseite`.

### Task 9: Vorlagen

**Files:** Create `kb/repo/templates.py`, `kb/api/templates.py`; Test `tests/test_templates.py`.

**Produces:** `GET /templates?space=slug` → globale + Bereichsvorlagen (nur lesbare); `POST` global nur Admin, mit `space_slug` nur `manage`; `PATCH/DELETE` entsprechend.

- [ ] Tests: Rechte je Fall; Bereichsvorlage eines privaten Bereichs unsichtbar.
- [ ] Commit `feat: Vorlagen global und pro Bereich`.

### Task 10: Volltextsuche

**Files:** Create `kb/repo/search.py`, `kb/api/search.py`; Test `tests/test_search.py`.

**Produces:** `GET /search?q&space&tag&limit&offset` → `{total, results:[{page_id,title,icon,space{slug,name,color},snippet_html,updated_at}]}`. Abfrage: `websearch_to_tsquery('german', q)`, OR-verknüpft mit Präfix-Query des letzten Worts (`to_tsquery('german', quote(last)||':*')`, Wort vorher auf `[\w-]` gefiltert); `ts_rank_cd`; Filter `space_id IN readable_space_ids(user)`, `deleted_at IS NULL`, Bereich nicht archiviert. Snippet: `ts_headline` mit `StartSel=\x02, StopSel=\x03`, danach `html.escape`, dann `\x02→<mark>`, `\x03→</mark>`.

- [ ] Tests: findet „Deployment“ bei Suche „deploy“; Präfix „Deplo“ findet; privater Bereich taucht weder in `results` noch in `total` auf; Titeltreffer rangiert vor Inhaltstreffer; `<script>` im Inhalt kommt escaped im Snippet; Eingaben `""`, `"`, `-`, `:`, `&`, `'`, `der die das` → 200 mit `total 0`, nie 500.
- [ ] Commit `feat: Volltextsuche mit Rechtefilter in SQL`.

### Task 11: Anhänge

**Files:** Create `kb/storage.py`, `kb/repo/attachments.py`, `kb/api/attachments.py`; Test `tests/test_attachments.py`.

**Produces:** `storage.put(stream, max_bytes) -> (sha256, size)` (tmp → fsync → rename nach `ab/cd/<sha>`), `storage.open(sha)`, `storage.gc(db)`; `POST /pages/{id}/attachments` (multipart `file`) → `{id,filename,mime_type,size,url}`; `GET /attachments/{id}` mit `nosniff`, `Content-Security-Policy: sandbox`, inline nur für png/jpeg/gif/webp (MIME aus Magic-Bytes, nicht aus Upload-Header), sonst `attachment`; `GET /pages/{id}/attachments`; `DELETE` (edit).

- [ ] Tests: zu groß → 413 „Die Datei ist größer als 25 MB.“; SVG → `Content-Disposition: attachment`; Anhang einer privaten Seite → 404 für Fremde; gleicher Inhalt zweimal → eine Datei; `gc` löscht nur unreferenzierte Dateien.
- [ ] Commit `feat: Anhänge mit inhaltsadressierter Ablage`.

### Task 12: Export und Import

**Files:** Create `kb/markdown_io.py`, `kb/api/transfer.py`; Test `tests/test_markdown_io.py`, `tests/test_transfer.py`.

**Produces:** `markdown_io.page_to_md(page, tags, author) -> str` (YAML-Front-Matter), `parse_md(text) -> (meta, body)`, `export_space_zip(db, space) -> Iterator[bytes]` (über `zipfile` in einen gespoolten Temp-File, dann gestreamt), `import_archive(db, user, space, upload) -> ImportReport`. Grenzen: max 5000 Einträge, max 200 MB entpackt, Pfade ohne `..`/absolut/Laufwerk, nur `.md`, `.markdown`, Bild- und gängige Dokumenttypen. Bildlinks `![](rel/pfad.png)` → Anhang hochladen, Link auf `/api/v1/attachments/{id}` umschreiben; Export schreibt umgekehrt `_attachments/<name>`.

- [ ] Tests: Export→Import-Roundtrip erhält Baum, Titel, Tags, Bilder; `../evil.md` → 422, nichts angelegt; 5001 Einträge → 422; Obsidian-Ordner ohne `index.md` erzeugt Ordnerseite mit Ordnernamen; Export eines privaten Bereichs → 404 für Fremde.
- [ ] Commit `feat: Export und Import als Markdown und ZIP`.

### Task 13: OIDC

**Files:** Create `kb/api/oidc.py`; Test `tests/test_oidc.py` (Fake-Provider: lokaler JWKS + signierte ID-Tokens mit `authlib.jose`, Discovery und Token-Endpunkt über `httpx.MockTransport`).

**Produces:** `GET /auth/oidc/login?next=` → 302 zum Provider mit PKCE, `state`, `nonce` (in signiertem Kurzzeit-Cookie `kb_oidc`, 10 min); `GET /auth/oidc/callback` → Token tauschen, ID-Token prüfen (Signatur, `iss`, `aud`, `exp`, `nonce`), Benutzer nach Spec auflösen, Rolle aus Gruppen, Sitzung setzen, 302 nach `next` (nur relative Pfade).

- [ ] Tests: neues Konto mit Rolle aus Gruppe; Verknüpfung nur bei `email_verified`; ohne → neues Konto wird **nicht** mit bestehender E-Mail verschmolzen, sondern 409 „Diese E-Mail gehört bereits zu einem lokalen Konto.“; falscher `state` → 400; falsches `nonce` → 400; deaktiviertes Konto → 403-Seite; `next=https://evil` → `/`; Herabstufung des letzten Admins über Gruppen wird verhindert.
- [ ] Commit `feat: Anmeldung über OIDC mit Gruppenzuordnung`.

### Task 14: Rechte-Matrix über alle Routen

**Files:** Create `tests/test_access_matrix.py`.

- [ ] Fixture baut: privaten Bereich P mit Seite, Anhang, Tag, Vorlage, Revision; Benutzer `outsider` (reader, kein Mitglied). Parametrisierter Test über **jede** Route aus `app.routes`, die einen Bereich, eine Seite, einen Anhang, eine Vorlage oder eine Revision adressiert, mit Ids aus P: Antwort ist 404 — und ein Wächtertest schlägt fehl, wenn eine neue Route unter `/api/v1` weder in der Matrix noch in einer expliziten Ausnahmeliste (`/auth/*`, `/healthz`, `/users*`, `/me/home`, `/search`, `/spaces` (Liste)) steht. Für die Listenrouten (`/search`, `/me/home`, `/spaces`, `/templates`) prüft er, dass P nirgends auftaucht.
- [ ] Commit `test: Rechte-Matrix prüft jede Route gegen fremde Bereiche`.

---

## Teil B — Frontend

### Task 15: Frontend-Gerüst, Atlas-Tokens, API-Client, Anmeldung

**Files:** Create `frontend/package.json`, `vite.config.ts` (Proxy `/api` → `localhost:8000`), `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/lib/{api,auth,theme,colors,utils,format}.ts(x)`, `src/components/ui/*`, `src/pages/Login.tsx`.

**Produces:**
- `index.css`: Tailwind 4 mit `@theme`-Tokens `--color-bg, --color-surface, --color-surface-2, --color-border, --color-fg, --color-fg-muted, --color-fg-subtle, --color-accent (Petrol), --color-accent-fg, --color-danger`, hell und `.dark`; Schriften `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`.
- `colors.ts`: `SPACE_COLORS: Record<SpaceColor,{solid,soft,text,ring}>` für beide Modi über CSS-Variablen `--space-*`.
- `api.ts`: `api<T>(path, {method, body, signal})`, hängt `X-CSRF-Token` an, wirft `ApiError{status, detail, data}`; 401 → Ereignis `kb:unauthorized`.
- `auth.tsx`: `AuthProvider`, `useAuth() → {user, csrf, refresh, logout}`, `RequireAuth`.
- `theme.tsx`: `ThemeProvider` (hell/dunkel/system, `localStorage` in try/catch).
- UI-Bausteine (Radix): Button (primary/secondary/ghost/danger, sizes), Input, Textarea, Label, Dialog, AlertDialog, DropdownMenu, Popover, Tooltip, Select, Switch, Tabs, Badge, Avatar, Skeleton, Kbd; Toasts über `sonner`.
- Login-Seite zweigeteilt, OIDC-Knopf nach `/auth/config`, Passwortwechsel-Pflicht-Dialog.

- [ ] `npm run build` und `npm run typecheck` grün; manuell: Anmeldung gegen laufendes Backend.
- [ ] Commit `feat: Frontend-Gerüst mit Atlas-Design und Anmeldung`.

### Task 16: App-Shell, Seitenleiste, Seitenbaum

**Files:** Create `src/components/{AppShell,Sidebar,SpaceSwitcher,PageTree,Breadcrumbs,UserMenu,EmptyState}.tsx`, `src/lib/tree.ts`, `tests/tree.test.ts`.

**Produces:** `tree.ts`: `buildTree(flat) -> Node[]`, `isDescendant(nodes, id, candidate)`, `computeDrop(nodes, dragId, targetId, zone: 'before'|'inside'|'after') -> {parent_id, position} | null`. PageTree mit Auf-/Zuklappen (Zustand je Bereich in `localStorage`), Pfeiltasten-Navigation (`role="tree"`), natives Drag & Drop mit drei Zonen und Einfügelinie, optimistisches Verschieben mit Rücksetzen bei Fehler. Seitenleiste einklappbar, mobil als Schublade.

- [ ] Vitest: `computeDrop` verbietet Ablage in eigenen Nachfahren, Positionen korrekt.
- [ ] Commit `feat: App-Shell mit Seitenbaum und Drag & Drop`.

### Task 17: Editor mit WYSIWYG/Markdown-Umschaltung

**Files:** Create `src/editor/{Editor,extensions,markdown,SlashMenu,BubbleToolbar,MarkdownSource,Callout}.ts(x)`, `tests/markdown.roundtrip.test.ts`.

**Produces:** `<Editor value onChange mode onModeChange editable onUpload />`; `markdown.ts`: `toMarkdown(editor)`, `normalizeMd(s)`. Erweiterungen: StarterKit, Link, Image, Table(+Row/Header/Cell), TaskList/TaskItem, CodeBlockLowlight (common-Sprachen), Placeholder, Callout (`> [!NOTE|TIP|WARNING|DANGER]`), Markdown (`@tiptap/markdown`). Slash-Menü (Überschriften, Listen, Checkliste, Tabelle, Code, Zitat, Hinweis, Bild, Trenner), Bubble-Toolbar (fett, kursiv, durchgestrichen, Code, Link), Upload per Drop/Paste. Markdown-Modus: CodeMirror 6 mit Markdown-Sprache und Atlas-Theme.

- [ ] Vitest (jsdom): Roundtrip `md → editor → md` identisch nach `normalizeMd` für: Überschriften 1–3, Fett/Kursiv/Durchgestrichen/Inline-Code, Link, verschachtelte Liste, nummerierte Liste, Checkliste, Zitat, Codeblock mit Sprache, Tabelle, Trennlinie, Bild, jeder Callout-Typ; HTML-Text `<script>alert(1)</script>` bleibt Text.
- [ ] Commit `feat: Editor mit WYSIWYG- und Markdown-Modus`.

### Task 18: Seitenansicht, Autospeichern, Konflikt, Versionen

**Files:** Create `src/pages/{Page,Revisions}.tsx`, `src/components/{TableOfContents,PageHeader,TagEditor,ConflictDialog,PageMenu,MovePageDialog}.tsx`.

**Produces:** Lesen/Bearbeiten an derselben Stelle, Titel mit Emoji-Auswahl, Tags, Favoritenstern, „zuletzt geändert von … vor …“, Autospeichern nach 1,5 s und `⌘S` mit Statusanzeige, Konfliktdialog (beide Fassungen, übernehmen/überschreiben/abbrechen), Warnung beim Verlassen mit ungespeicherten Änderungen, Inhaltsverzeichnis ab 1280 px mit Scroll-Spy, Seitenmenü (Versionen, Export `.md`, Drucken/PDF, Verschieben, Papierkorb). Versionen: Liste links, farbiger Zeilen-Diff rechts (`diff.diffLines`), wiederherstellen. Druckstil `@media print`.

- [ ] Manuell im Browser: anlegen, bearbeiten, Konflikt in zwei Tabs, Version wiederherstellen.
- [ ] Commit `feat: Seitenansicht mit Autospeichern, Konflikten und Versionen`.

### Task 19: Start, Bereich, Neue Seite, Suche, Command-Palette

**Files:** Create `src/pages/{Home,Space,NewPage,Search,Trash}.tsx`, `src/components/CommandPalette.tsx`, `src/components/SpaceCard.tsx`, `src/components/PageListItem.tsx`.

**Produces:** Startseite (Begrüßung nach Tageszeit, Bereichskarten, zuletzt angesehen/geändert, Favoriten, leere Zustände mit Einladung); Bereichsseite (Kopf in Bereichsfarbe, oberste Seiten, Tag-Filter); Neue Seite (leer oder Vorlagenkarten); Suchseite (Filter Bereich/Tag, Snippets via DOMPurify mit `ALLOWED_TAGS: ['mark']`, Blättern); ⌘K (cmdk: Suche mit Entprellung 150 ms, Seiten, Bereiche, Befehle); Papierkorb (wiederherstellen, endgültig löschen).

- [ ] Commit `feat: Startseite, Bereiche, Suche und Command-Palette`.

### Task 20: Bereichseinstellungen, Admin, Profil

**Files:** Create `src/pages/{SpaceSettings,Admin,Profile,NotFound}.tsx`, `src/components/{SpaceForm,MemberManager,UserTable,TemplateManager,ImportExport}.tsx`.

**Produces:** Bereichseinstellungen (Name, Emoji, Farbe, Beschreibung, Standardzugriff, Mitglieder mit Suche und Stufe, Vorlagen, Import mit Bericht, Export, Archivieren); Admin (Benutzer-Tabelle mit Suche, Rolle, Status, Herkunft, letzter Login, anlegen, Rolle ändern, deaktivieren, Einmal-Passwort anzeigen und kopieren; alle Bereiche; globale Vorlagen; Systeminfo über `GET /api/v1/admin/info` → `{version, oidc_enabled, users, spaces, pages, upload_bytes}` — Route in `kb/api/users.py` ergänzen samt Test); Profil (Name, Avatarfarbe, Passwort, Theme); 404-Seite.

- [ ] Commit `feat: Verwaltung von Bereichen, Benutzern und Profil`.

---

## Teil C — Stack und Abnahme

### Task 21: Dockerfiles, Caddy, Compose, Backup, Doku

**Files:** Create `backend/Dockerfile`, `frontend/Dockerfile`, `Caddyfile`, `compose.yaml`, `.env.example`, `backup/backup.sh`, `README.md`, `CLAUDE.md`, `.gitignore`, `.dockerignore`s.

**Produces:**
- `backend/Dockerfile`: `python:3.12-slim`, uv-Installation aus `ghcr.io/astral-sh/uv`, `uv sync --frozen --no-dev`, Benutzer `kb` (uid 1000), `CMD ["python","-m","kb","serve"]`, `HEALTHCHECK` per Python-Einzeiler auf `/api/healthz`.
- `frontend/Dockerfile`: Stufe `node:22-alpine` → `npm ci && npm run build`; Stufe `caddy:2-alpine` mit `dist` nach `/srv` und `Caddyfile`.
- `Caddyfile`: `{$KB_SITE_ADDRESS}` (aus `KB_DOMAIN` oder `:80`), `encode zstd gzip`, `handle /api/* { request_body { max_size {$KB_MAX_UPLOAD_MB}MB } reverse_proxy app:8000 }`, `handle { root * /srv; try_files {path} /index.html; file_server }`, Header (CSP, nosniff, Referrer-Policy, Permissions-Policy, HSTS nur mit Domain), lange Cache-Zeiten für `/assets/*`.
- `compose.yaml`: Dienste `db` (Volume `pgdata`, `pg_isready`), `app` (Volume `uploads`, `depends_on db healthy`), `web` (Caddy, Ports `${KB_BIND-127.0.0.1}:${KB_HTTP_PORT-8080}:80` und bei Domain 80/443 über Profil `tls`, Volumes `caddy_data`, `caddy_config`), `backup` (liest `pgdata` über Netzwerk, `uploads` read-only, `./backups`).
- `backup.sh`: Schleife bis 02:30 Europe/Berlin, `pg_dump -Fc`, `tar` der Uploads, Aufräumen älter als `KB_BACKUP_KEEP_DAYS`; `backup.sh now` für sofortigen Lauf.
- README: Schnellstart, `.env`, erster Admin, OIDC-Einrichtung (Redirect-URI `https://<domain>/api/v1/auth/oidc/callback`), Backup und Wiederherstellung, Update.

- [ ] `docker compose config` fehlerfrei; `docker compose up -d --build --wait` → alle `healthy`; `curl localhost:8080/api/healthz`.
- [ ] Wiederherstellung einmal real: `backup.sh now`, Volume weg, Restore nach README, Seite wieder da.
- [ ] Commit `feat: Docker-Compose-Stack mit Caddy und Backup`.

### Task 22: End-to-End-Test und Abnahme

**Files:** Create `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/smoke.spec.ts`.

- [ ] Spec: Admin per `docker compose exec app python -m kb create-admin` (über `globalSetup`); Anmelden; Bereich „HR“ privat anlegen; Benutzer A (Mitglied read) und B anlegen; Seite aus Vorlage „Anleitung“; Tabelle, Codeblock, Checkliste einfügen; nach Markdown und zurück umschalten, Inhalt gleich; Bild hochladen; als A über ⌘K finden; als B: Suche leer, Direkt-URL der Seite → 404-Seite, Anhang-URL → 404. Screenshots hell/dunkel nach `e2e/screenshots/`.
- [ ] Frischer Klon in Temp-Verzeichnis → `.env` aus `.env.example` (Secret ersetzt) → `up --wait` → E2E grün.
- [ ] Commit `test: End-to-End-Abnahme gegen den Compose-Stack`.
