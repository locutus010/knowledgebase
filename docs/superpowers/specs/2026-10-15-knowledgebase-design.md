# Wissensdatenbank — Design-Spec

Design-Spec, 2026-10-15. Neues Projekt `knowledgebase/` neben `email-backuparchive/` und
`nas-backup/` im selben Repo.

## Ziel

Eine selbst entwickelte, interne Wissensdatenbank für ein Team: Seiten in Bereichen, ein
Seitenbaum, Volltextsuche, Versionen, Anhänge, Tags, Favoriten, Vorlagen, Export und Import —
mit einer Oberfläche, die man gern benutzt, und einer Benutzerverwaltung mit globalen Rollen
und Rechten pro Bereich. Geliefert wird ein Docker-Compose-Stack, der auf einem frischen Klon
mit `docker compose up -d` läuft.

**Erfolgskriterium:** Auf einem frischen Klon startet `docker compose up -d --wait` den Stack
gesund. Ein Admin legt im Browser einen Bereich „HR“ mit `default_access = none` an, gibt
Benutzerin A Leserecht und lässt Benutzer B außen vor. A findet eine HR-Seite über ⌘K, B findet
sie weder über die Suche, noch über den Baum, die Favoriten, den Export oder eine direkte
Anhang-URL — überall 404. Eine im WYSIWYG-Modus gebaute Seite mit Tabelle, Codeblock und
Checkliste übersteht das Umschalten nach Markdown und zurück unverändert.

## Nicht in Version 1

Kommentare, Echtzeit-Coediting, LDAP/AD, E-Mail-Versand (Benachrichtigungen, Passwort-Reset per
Mail — stattdessen setzt ein Admin ein Einmal-Passwort, das beim nächsten Login geändert werden
muss), eigener PDF-Renderer (PDF über den Druckstil des Browsers), öffentliche/anonyme Seiten.

## Stack

| Teil | Wahl |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async nicht nötig — sync mit Threadpool), Alembic, Pydantic 2, uvicorn; verwaltet mit `uv`, getestet mit `pytest` |
| Auth | `argon2-cffi` für Passwörter, `authlib` für OIDC (Authorization Code + PKCE) |
| Datenbank | PostgreSQL 17, Volltextsuche über `tsvector` (Konfiguration `german`) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query, React Router |
| Editor | Tiptap (ProseMirror) mit Markdown-Ein- und -Ausgabe; Markdown-Modus mit CodeMirror 6 |
| Markdown-Anzeige | derselbe Tiptap-Renderer im Nur-Lese-Modus; DOMPurify für alles, was als HTML entsteht |
| Proxy | Caddy 2 — TLS, liefert das gebaute SPA aus, leitet `/api` an `app` |

## Architektur und Compose-Stack

```
Browser ──HTTPS──▶ caddy  (TLS, statisches SPA, /api/* → app:8000)
                     │
                     ▼
                  app  (FastAPI/uvicorn)  ──▶ db (PostgreSQL 17)
                     │
                     └─▶ Volume uploads (Anhänge nach SHA-256)
                  backup  (pg_dump + Uploads, täglich, Aufbewahrung KB_BACKUP_KEEP_DAYS)
```

Verzeichnisbaum:

```
knowledgebase/
  compose.yaml  .env.example  Caddyfile  README.md  CLAUDE.md
  backend/   pyproject.toml  uv.lock  Dockerfile  alembic/  kb/  tests/
  frontend/  package.json  vite.config.ts  Dockerfile  src/  tests/
  backup/    backup.sh
  e2e/       Playwright-Smoke-Test gegen den laufenden Stack
```

- **Images:** `frontend/Dockerfile` baut mit Node und kopiert `dist/` in ein `caddy`-Image.
  `backend/Dockerfile` ist reines Python (uv, slim), läuft als Nicht-Root-Benutzer.
- **Start:** Die App führt beim Start `alembic upgrade head` aus, bevor sie Anfragen annimmt.
  `app` startet erst bei gesundem `db` (`depends_on: condition: service_healthy`), `caddy` erst
  bei gesundem `app`.
- **Erster Admin:** `docker compose exec app kb create-admin --email … --name …` fragt das
  Passwort interaktiv ab. Alternativ legen `KB_BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD` beim ersten
  Start einen Admin an, aber nur solange es noch keinen Benutzer gibt.
- **Konfiguration nur über `.env`:** `KB_DOMAIN`, `KB_SECRET_KEY`, `POSTGRES_PASSWORD`,
  `KB_OIDC_ISSUER`, `KB_OIDC_CLIENT_ID`, `KB_OIDC_CLIENT_SECRET`, `KB_OIDC_BUTTON_LABEL`,
  `KB_OIDC_GROUPS_CLAIM`, `KB_OIDC_ADMIN_GROUPS`, `KB_OIDC_EDITOR_GROUPS`,
  `KB_OIDC_DEFAULT_ROLE`, `KB_MAX_UPLOAD_MB`, `KB_BACKUP_KEEP_DAYS`, `KB_HTTP_PORT`.
  Fehlt `KB_SECRET_KEY` oder ist er kürzer als 32 Zeichen, bricht die App mit einer deutschen
  Meldung ab, statt mit einem unsicheren Schlüssel zu laufen.
- **TLS:** Ist `KB_DOMAIN` gesetzt, holt Caddy ein Let's-Encrypt-Zertifikat, und die App
  setzt das Sitzungscookie mit `Secure`. Ohne `KB_DOMAIN` lauscht Caddy auf
  `127.0.0.1:${KB_HTTP_PORT-8080}` mit HTTP.
- **Healthchecks:** `db` per `pg_isready`, `app` per `GET /api/healthz` (fasst keine Datenbank
  an), `caddy` per `GET /`.
- **Nichts wird zur Laufzeit von fremden Hosts geladen.** Schriften (Geist, Geist Mono),
  Icons (Lucide) und Emoji-Daten sind Teil des Bundles. Grund wie beim Mail-Archiv: der Stack
  läuft oft ohne Weg ins Netz, und nachgeladene Schriften verraten, wer wann liest.

## Datenmodell

Alle Primärschlüssel sind UUIDs. Zeitstempel sind `timestamptz`.

- **`users`** — `email` (eindeutig, kleingeschrieben), `name`, `password_hash` (nullable, nur
  lokale Konten), `oidc_subject` (nullable, eindeutig), `role` ∈ {`admin`, `editor`, `reader`},
  `active`, `must_change_password`, `avatar_color`, `created_at`, `last_login_at`.
- **`sessions`** — `id` (zufälliges Token, nur als SHA-256 gespeichert), `user_id`,
  `csrf_token`, `created_at`, `expires_at`, `user_agent`. Serverseitig, damit Deaktivieren eines
  Benutzers und Abmelden sofort wirken.
- **`spaces`** — `slug` (eindeutig), `name`, `icon` (Emoji), `color` (aus fester Palette),
  `description`, `default_access` ∈ {`none`, `read`, `edit`}, `created_by`, `archived_at`.
- **`space_members`** — `(space_id, user_id)` eindeutig, `level` ∈ {`read`, `edit`, `manage`}.
- **`pages`** — `space_id`, `parent_id` (nullable, gleicher Bereich), `title`, `icon`,
  `content_md`, `position` (Sortierung unter Geschwistern), `version` (Ganzzahl, steigt bei
  jedem Speichern), `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`
  (Papierkorb), `search_vector` (generierte Spalte, gewichtet: Titel A, Tags B, Inhalt C).
- **`page_revisions`** — `page_id`, `version`, `title`, `content_md`, `author_id`,
  `created_at`. Speichert dieselbe Person innerhalb von 10 Minuten erneut, wird die letzte
  Revision überschrieben statt eine neue angelegt.
- **`tags`** — `space_id`, `name` (eindeutig je Bereich). **`page_tags`** — `(page_id, tag_id)`.
- **`favorites`** — `(user_id, page_id)`. **`page_views`** — `(user_id, page_id)`,
  `viewed_at` (wird überschrieben; „zuletzt angesehen“).
- **`templates`** — `space_id` (nullable = global), `name`, `description`, `icon`,
  `content_md`, `created_by`.
- **`attachments`** — `page_id`, `sha256`, `filename`, `mime_type`, `size`, `uploaded_by`,
  `created_at`. Die Datei liegt unter `uploads/ab/cd/<sha256>`, geschrieben über eine temporäre
  Datei mit `fsync` und `rename`. Gleiche Inhalte teilen sich eine Datei.

## Berechtigungen

**Globale Rollen:** `admin` darf alles, auch Benutzer, alle Bereiche und Einstellungen.
`editor` darf zusätzlich Bereiche anlegen (und wird darin `manage`). `reader` hat keine
globalen Rechte über die Bereiche hinaus.

**Recht in einem Bereich:** Ordnung `none < read < edit < manage`.

```
access(user, space) = manage                                  wenn user.role == admin
                    = max(space.default_access, mitgliedschaft.level)   sonst
```

| Stufe | darf |
|---|---|
| `read` | Seiten, Versionen, Anhänge sehen; suchen; exportieren; favorisieren |
| `edit` | zusätzlich Seiten anlegen, bearbeiten, verschieben, in den Papierkorb legen, Anhänge hochladen, Tags vergeben, Bereichsvorlagen nutzen |
| `manage` | zusätzlich Bereichseinstellungen, Mitglieder, Papierkorb leeren/wiederherstellen, Bereichsvorlagen verwalten, Import, Bereich archivieren |

**Invarianten:**

- Es gibt **genau eine** Stelle, die das Recht ausrechnet (`kb/permissions.py`), und genau
  eine, die es für Listen in SQL ausdrückt (`readable_space_ids(user)` als Subquery). Jede
  Route — Seiten, Suche, Baum, Favoriten, „zuletzt angesehen“, Anhänge, Export, Tags,
  Vorlagen — geht über diese beiden.
- Ein Bereich ohne Leserecht ist **unsichtbar**: Antwort 404, nie 403, damit die Existenz
  nicht durchsickert. 403 nur, wenn Lesen erlaubt ist, die Aktion aber nicht.
- **Suche filtert in SQL**, nie nachträglich in Python — sonst stimmen Trefferzahl und
  Blättern nicht und es entsteht ein Zeitkanal.
- **Mindestens ein aktiver Admin bleibt immer.** Herabstufen, Deaktivieren und Löschen zählen
  und schreiben in einer Transaktion unter `SELECT … FOR UPDATE` auf die Admin-Zeilen; zwei
  gleichzeitige Anfragen können so nicht beide Admins entfernen.
- Ein Bereich braucht kein Mitglied mit `manage`: Admins verwalten jeden Bereich, also kann
  auch das letzte `manage`-Mitglied sich entfernen, ohne dass der Bereich verwaist.
- Deaktivieren eines Benutzers löscht seine Sitzungen sofort.

## Anmeldung

**Lokal:** E-Mail und Passwort, Argon2id. Mindestlänge 10 Zeichen. Drosselung: nach 5
Fehlversuchen je Konto oder 20 je IP innerhalb von 15 Minuten antwortet `/login` mit 429 und
deutscher Meldung. Fehlermeldung verrät nicht, ob die E-Mail existiert.

**OIDC** (nur aktiv, wenn `KB_OIDC_ISSUER` gesetzt ist): Discovery über
`/.well-known/openid-configuration`, Authorization Code mit PKCE, `state` und `nonce` in der
Vor-Sitzung. Beim Rückruf:

1. Benutzer mit diesem `sub` existiert → anmelden (wenn aktiv).
2. Sonst: lokales Konto mit gleicher E-Mail existiert **und** der Provider meldet
   `email_verified = true` → `oidc_subject` verknüpfen, anmelden.
3. Sonst: Konto anlegen, ohne Passwort.

Die Rolle kommt bei **jedem** OIDC-Login aus dem Gruppen-Claim (`KB_OIDC_GROUPS_CLAIM`, Vorgabe
`groups`): Treffer in `KB_OIDC_ADMIN_GROUPS` → `admin`, in `KB_OIDC_EDITOR_GROUPS` → `editor`,
sonst `KB_OIDC_DEFAULT_ROLE` (Vorgabe `reader`). Sind beide Gruppenlisten leer, verwaltet der
Admin die Rolle in der App und der Login ändert sie nicht. Der Aussperrschutz gilt auch hier:
würde ein Login den letzten Admin herabstufen, bleibt die Rolle und es wird gewarnt.

**Sitzung:** Cookie `kb_session`, `HttpOnly`, `SameSite=Lax`, `Secure` sobald `KB_DOMAIN`
gesetzt ist, 14 Tage gleitend. **CSRF:** Jede schreibende Anfrage trägt den Header
`X-CSRF-Token`, der mit dem Token der Sitzung übereinstimmen muss; das Token liefert
`GET /api/v1/auth/me`. Keine Ausnahmen außer `POST /auth/login` (dort gibt es noch keine
Sitzung; stattdessen `Origin`-Prüfung gegen die eigene Domain).

## API

REST unter `/api/v1`, JSON, Pydantic-Schemas, Fehler als `{"detail": "<deutscher Text>"}`.
Die OpenAPI-Beschreibung erzeugt im Frontend typisierte Clients (`openapi-typescript`).

| Bereich | Endpunkte |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password`, `GET /auth/oidc/login`, `GET /auth/oidc/callback`, `GET /auth/config` (ob OIDC aktiv, Button-Text) |
| Benutzer (Admin) | `GET/POST /users`, `PATCH/DELETE /users/{id}`, `POST /users/{id}/reset-password` |
| Bereiche | `GET/POST /spaces`, `GET/PATCH/DELETE /spaces/{slug}`, `GET/PUT/DELETE /spaces/{slug}/members[/{user_id}]` |
| Seiten | `GET /spaces/{slug}/tree`, `POST /spaces/{slug}/pages`, `GET/PATCH/DELETE /pages/{id}`, `POST /pages/{id}/move`, `POST /pages/{id}/restore`, `DELETE /pages/{id}/purge`, `GET /spaces/{slug}/trash` |
| Versionen | `GET /pages/{id}/revisions`, `GET /pages/{id}/revisions/{version}`, `POST /pages/{id}/revisions/{version}/restore` |
| Anhänge | `POST /pages/{id}/attachments`, `GET /attachments/{id}`, `DELETE /attachments/{id}` |
| Tags | `GET /spaces/{slug}/tags`, `PUT /pages/{id}/tags` |
| Persönlich | `GET /me/home` (zuletzt angesehen, zuletzt geändert, Favoriten), `PUT/DELETE /me/favorites/{page_id}` |
| Suche | `GET /search?q=&space=&tag=&limit=&offset=` |
| Vorlagen | `GET/POST /templates`, `PATCH/DELETE /templates/{id}` |
| Export/Import | `GET /pages/{id}/export.md`, `GET /spaces/{slug}/export.zip`, `POST /spaces/{slug}/import` |
| Betrieb | `GET /healthz` |

**Gleichzeitiges Bearbeiten:** `PATCH /pages/{id}` verlangt `base_version`. Weicht sie von der
aktuellen ab, antwortet die API mit 409 und der aktuellen Fassung; das Frontend zeigt beide
Fassungen nebeneinander und lässt übernehmen, überschreiben oder abbrechen.

**Verschieben:** `move` nimmt `parent_id`, `position` und optional `space_slug`. Ein Elternteil
darf nicht der eigene Nachfahre sein (Zyklusprüfung per rekursivem CTE). Verschieben in einen
anderen Bereich verlangt `edit` in beiden; Tags gehen dabei verloren, Anhänge wandern mit.

**Papierkorb:** In den Papierkorb gelegt wird die Seite samt Unterseiten. Wiederherstellen holt
den ganzen Teilbaum zurück; ist der alte Elternknoten weg, landet er auf oberster Ebene.
Endgültig löschen entfernt Revisionen und Anhang-Zeilen; verwaiste Dateien räumt
`kb gc-uploads` auf (läuft im Backup-Job mit).

## Suche

`search_vector` als generierte Spalte aus `title`, den Tag-Namen (über eine von der Anwendung
gepflegte Spalte `tags_text`) und `content_md` mit `setweight` A/B/C und Konfiguration
`german`. GIN-Index. Abfrage über `websearch_to_tsquery('german', q)`, damit `"exakte Phrase"`,
`-ausschließen` und `oder` funktionieren; zusätzlich Präfixsuche auf dem letzten Wort für
Vorschläge während des Tippens. Rang über `ts_rank_cd`, Snippets über `ts_headline` mit
`<mark>`-Markierung — der Snippet-Text wird im Backend HTML-escaped, bevor `<mark>` eingesetzt
wird. Gelöschte Seiten und archivierte Bereiche erscheinen nicht.

## Editor und Markdown

- **Markdown ist die einzige gespeicherte Wahrheit** (`content_md`). Der WYSIWYG-Editor liest
  Markdown ein und schreibt Markdown zurück; Revisionen, Diff, Suche und Export arbeiten damit
  ohne Umweg.
- Unterstützt (GFM): Überschriften 1–3, Fett/Kursiv/Durchgestrichen/Inline-Code, Links,
  Listen, Checklisten, Zitate, Codeblöcke mit Sprache und Syntaxhervorhebung (lowlight),
  Tabellen, Trennlinien, Bilder, Hinweisboxen (`> [!NOTE]`, `> [!WARNING]` …).
- WYSIWYG-Modus: Slash-Menü (`/`), schwebende Formatierleiste bei Auswahl, Markdown-Kürzel beim
  Tippen, Bilder und Dateien per Drag & Drop oder Einfügen (lädt als Anhang hoch).
- Markdown-Modus: CodeMirror mit Markdown-Hervorhebung; Umschalten jederzeit, der Inhalt geht
  über Markdown hin und zurück.
- Speichern: automatisch 1,5 s nach der letzten Änderung und bei `⌘S`, mit Statusanzeige
  („Gespeichert“, „Speichert…“, „Konflikt“).
- **Roundtrip-Garantie:** Für jedes unterstützte Element gibt es einen Test
  `markdown → editor → markdown` mit identischem Ergebnis (nach Normalisierung).
- Anzeige: derselbe Tiptap-Renderer schreibgeschützt; Links nach außen bekommen
  `rel="noopener noreferrer"`; HTML im Markdown wird nicht ausgeführt, sondern als Text
  angezeigt.

## Oberfläche

**Stilrichtung „Atlas“:** hell, klar, ruhig. Schrift Geist (UI) und Geist Mono (Code).
Grundakzent Petrol (`#0EA5A4`-Familie). Jeder Bereich trägt eine eigene Farbe aus einer festen
Palette von acht Tönen (Petrol, Indigo, Violett, Rosé, Orange, Bernstein, Grün, Schiefer), die
sich in Seitenleiste, Bereichskarten, Breadcrumbs und Tags wiederfindet. Dunkelmodus mit
denselben Rollen, umschaltbar (hell, dunkel, System). Tags als Pillen. Sanfte Übergänge
(150–200 ms), keine verspielten Animationen. Respektiert `prefers-reduced-motion`.

**Grundgerüst:**

- **Seitenleiste links** (einklappbar, auf Mobilgeräten als Schublade): Bereichs-Umschalter
  mit Farbe und Emoji, Suchfeld (öffnet ⌘K), Seitenbaum mit Auf-/Zuklappen und Drag & Drop
  (verschieben und umsortieren), „Neue Seite“, Favoriten, Papierkorb, unten Benutzermenü.
- **Kopfzeile:** Breadcrumbs, Favoriten-Stern, Bearbeiten/Fertig, Menü (Versionen, Export,
  Verschieben, In den Papierkorb).
- **Inhalt:** Lesebreite ~720 px, großer Titel mit Emoji, darunter Tags und „zuletzt geändert
  von … vor …“.
- **Rechts:** Inhaltsverzeichnis aus den Überschriften, das beim Scrollen mitläuft (ab 1280 px
  Breite).
- **⌘K Command-Palette:** Suche mit Snippets, Sprung zu Seiten und Bereichen, Befehle („Neue
  Seite“, „Dunkelmodus“, „Abmelden“).

**Seiten:**

- **Anmeldung:** zweigeteilt, links Formular, rechts ruhige Fläche mit Produktname; Knopf
  „Mit <Provider> anmelden“, wenn OIDC aktiv ist.
- **Start:** Begrüßung, Bereichskarten in ihrer Farbe, „Zuletzt angesehen“, „Zuletzt
  geändert“, Favoriten.
- **Bereich:** Kopf mit Farbe, Emoji, Beschreibung; Liste der obersten Seiten; Tag-Filter.
- **Seite:** Lesen und Bearbeiten an derselben Stelle (kein separater Editor-Bildschirm).
- **Neue Seite:** Auswahl leer oder aus Vorlage (Karten mit Emoji und Beschreibung).
- **Versionen:** Liste links, Diff rechts (Zeilen-Diff des Markdown, farbig), „Diese Version
  wiederherstellen“.
- **Suche:** volle Ergebnisseite mit Filtern nach Bereich und Tag.
- **Bereichseinstellungen:** Name, Emoji, Farbe, Beschreibung, Standardzugriff, Mitglieder,
  Vorlagen, Import, Export, Archivieren.
- **Admin:** Benutzer (Tabelle mit Suche, Rolle, Status, Herkunft lokal/SSO, letzter Login;
  anlegen, Rolle ändern, deaktivieren, Einmal-Passwort setzen), Bereiche (alle, auch private),
  globale Vorlagen, Systeminfo (Version, OIDC-Status, Speicherverbrauch).
- **Profil:** Name, Avatarfarbe, Passwort ändern (nur lokal), Theme.
- **Leere Zustände** laden ein statt sich zu entschuldigen („Lege die erste Seite in
  Engineering an“), Fehlerseiten für 404 und Verbindungsverlust.

UI-Texte durchgehend Deutsch, Code-Bezeichner Englisch.

**Barrierefreiheit:** alles per Tastatur bedienbar (Baum mit Pfeiltasten), sichtbarer Fokus,
Kontrast mindestens WCAG AA in beiden Modi, ARIA über die Radix-Bausteine.

## Vorlagen

Global (Admin) oder pro Bereich (`manage`). Mitgeliefert und beim ersten Start angelegt:
„Anleitung“, „Runbook“, „Besprechungsprotokoll“, „Entscheidung (ADR)“, „Onboarding“.
Platzhalter `{{datum}}`, `{{autor}}` und `{{titel}}` werden beim Anlegen ersetzt.

## Export und Import

- **Seite:** `.md` mit YAML-Front-Matter (`title`, `tags`, `updated_at`, `author`), Bilder als
  relative Links.
- **Bereich:** ZIP mit Ordnerbaum — Seite mit Unterseiten wird `Titel/index.md` plus
  Unterordner, sonst `Titel.md`; Anhänge unter `_attachments/`, Links darin relativ.
  Gestreamt, damit große Bereiche den Speicher nicht füllen.
- **Import** (`manage`): einzelne `.md` oder ZIP mit derselben Struktur (auch aus anderen
  Werkzeugen wie Obsidian). Ordner → Unterseiten, Front-Matter → Titel und Tags, relative
  Bildlinks → Anhänge. Schutz: ZIP-Pfade gegen Traversal geprüft, Gesamtgröße und Dateizahl
  begrenzt (Zip-Bombe), nur `.md`/`.markdown` und gängige Bild- und Dokumenttypen.
- **PDF:** Druckansicht mit eigenem Druckstil (ohne Seitenleiste, mit Kopfzeile).

## Anhänge und Sicherheit

- Größe begrenzt über `KB_MAX_UPLOAD_MB` (Vorgabe 25), auch in Caddy (`request_body`).
- Ausgeliefert nur über die App mit Rechteprüfung; Antwort mit `X-Content-Type-Options:
  nosniff` und `Content-Security-Policy: sandbox`. Bilder (PNG, JPEG, GIF, WebP) inline, alles
  andere — **auch SVG** — als `Content-Disposition: attachment`.
- Sicherheitsheader über Caddy: strikte CSP für das SPA (`default-src 'self'`, keine Inline-
  Skripte), `Referrer-Policy: same-origin`, `Permissions-Policy`, HSTS sobald TLS aktiv.
- Kein SQL außerhalb von `kb/repo/`; Routen formulieren keine Abfragen selbst.

## Backup

Dienst `backup` (Image `postgres:17-alpine` mit `backup.sh`), schläft bis 02:30 Ortszeit,
schreibt `pg_dump -Fc` und ein `tar` der Uploads nach `./backups/<datum>/`, löscht Ordner älter
als `KB_BACKUP_KEEP_DAYS` (Vorgabe 14). Wiederherstellung ist im README beschrieben und wird
einmal real durchgespielt.

## Fehlerbehandlung

- Validierungsfehler → 422 mit deutscher, feldbezogener Meldung; das Frontend zeigt sie am Feld.
- Unerwartete Fehler → 500 mit generischer Meldung und Fehler-ID; Details nur im Log.
- Zahlen aus Anfragen (Limit, Offset, Position) haben Ober- und Untergrenzen in den Schemas,
  damit kein Wert bis zur Datenbank durchschlägt und dort eine 500 auslöst.
- Frontend: Toasts für Aktionen, Inline-Fehler für Formulare, ein Banner bei
  Verbindungsverlust; ungespeicherte Änderungen bleiben im Editor und werden erneut versucht.
- Abgelaufene Sitzung → 401 → Weiterleitung zur Anmeldung mit Rücksprung zur Seite.

## Tests

- **Backend** (`pytest`, TDD): gegen ein echtes PostgreSQL (Dienst `db-test` in einer
  `compose.test.yaml` oder testcontainers), jede Testfunktion in einer zurückgerollten
  Transaktion. Schwerpunkt Rechte: eine Matrix-Testreihe, die für **jede** Route prüft, dass
  ein Benutzer ohne Leserecht 404 bekommt — einschließlich Suche, Baum, Favoriten, „zuletzt
  angesehen“, Anhänge, Export, Tags, Revisionen. Dazu Aussperrschutz unter Gleichzeitigkeit
  (zwei Threads), OIDC-Rückruf mit einem Fake-Provider, Konflikt beim Speichern, Zyklusprüfung
  beim Verschieben, Import mit bösartigen ZIPs.
- **Frontend** (Vitest + Testing Library): Markdown-Roundtrip für jedes unterstützte Element,
  Baum-Logik, Rechte-abhängige Anzeige.
- **End-to-End** (Playwright gegen den laufenden Compose-Stack): Anmelden, Bereich anlegen,
  Seite aus Vorlage anlegen, WYSIWYG ↔ Markdown umschalten, Bild hochladen, über ⌘K finden,
  zweiter Benutzer sieht privaten Bereich nicht. Screenshots in hell und dunkel.
- **Abnahme:** frischer Klon → `.env` aus `.env.example` → `docker compose up -d --wait` →
  alle Dienste `healthy` → E2E grün.

## Konventionen

- UI-Texte, Log- und Fehlermeldungen Deutsch, Code-Bezeichner Englisch.
- Conventional Commits mit deutschem Betreff, **kein `Co-Authored-By`-Trailer**.
- Neue Laufzeit-Abhängigkeiten nur, wenn sie in dieser Spec stehen.
