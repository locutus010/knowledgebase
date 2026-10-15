# Wissensdatenbank

Eine Wissensdatenbank für Teams: Seiten in farbigen Bereichen, ein Seitenbaum mit Drag & Drop,
ein Editor, der zwischen formatiertem Schreiben und Markdown umschaltet, Volltextsuche (⌘K),
Versionen, Anhänge, Tags, Favoriten, Vorlagen sowie Export und Import als Markdown. Personen
melden sich lokal oder über SSO (OpenID Connect) an; Rechte gibt es global als Rolle und je
Bereich.

Alles läuft als Docker-Compose-Stack:

| Dienst | Aufgabe |
|---|---|
| `web` | Caddy: liefert die Oberfläche aus, leitet `/api` weiter, holt TLS-Zertifikate |
| `app` | FastAPI-Backend, migriert die Datenbank beim Start selbst |
| `db` | PostgreSQL 17, auch für die Volltextsuche |
| `backup` | sichert täglich Datenbank und Anhänge |

## Schnellstart

```bash
cp .env.example .env
```

In `.env` zwei Werte eintragen:

```bash
openssl rand -hex 24   # → POSTGRES_PASSWORD
openssl rand -hex 32   # → KB_SECRET_KEY
```

Starten und den ersten Administrator anlegen:

```bash
docker compose up -d --build --wait
```

```bash
docker compose exec app python -m kb create-admin --email du@firma.de --name "Dein Name"
```

Danach ist die Oberfläche unter <http://localhost:8080> erreichbar.

## Mit eigener Domain und HTTPS

DNS-Eintrag der Domain auf den Server zeigen lassen, dann in `.env`:

```
KB_DOMAIN=wiki.firma.de
KB_BIND=0.0.0.0
KB_HTTP_PORT=80
KB_HTTPS_PORT=443
```

Caddy holt das Zertifikat bei Let's Encrypt und erneuert es selbst. Cookies werden dann als
`Secure` gesetzt, Anmeldungen von fremden Ursprüngen abgewiesen.

Steht schon ein Reverse Proxy davor (Traefik, nginx), `KB_DOMAIN` leer lassen, den Proxy auf
`KB_HTTP_PORT` zeigen lassen und dort TLS terminieren.

## Anmeldung über SSO (OIDC)

Beim Identity-Provider (Authentik, Keycloak, Entra ID, Google Workspace …) einen Client vom Typ
„Confidential“ anlegen:

- Redirect-URI: `https://wiki.firma.de/api/v1/auth/oidc/callback`
- Scopes: `openid email profile` und, falls vorhanden, der Gruppen-Scope

In `.env`:

```
KB_OIDC_ISSUER=https://auth.firma.de/application/o/wiki/
KB_OIDC_CLIENT_ID=…
KB_OIDC_CLIENT_SECRET=…
KB_OIDC_BUTTON_LABEL=Firmenkonto
KB_OIDC_ADMIN_GROUPS=wiki-admins
KB_OIDC_EDITOR_GROUPS=wiki-redaktion
```

Wer sich zum ersten Mal über SSO anmeldet, bekommt automatisch ein Konto. Die Rolle kommt bei
jeder Anmeldung aus den Gruppen; sind beide Gruppenlisten leer, vergibst du Rollen in der App.
Ein bestehendes lokales Konto mit derselben E-Mail wird nur verknüpft, wenn der Provider die
Adresse als bestätigt meldet.

## Microsoft Entra ID

Die Anbindung läuft über dieselben `KB_OIDC_*`-Variablen. Gegen einen echten Entra-Mandanten
ist sie nicht automatisch getestet — die Tests nutzen einen nachgebauten Provider.

**App registrieren** im Entra Admin Center unter *App-Registrierungen → Neue Registrierung*:

- Unterstützte Kontotypen: *Nur Konten in diesem Organisationsverzeichnis*
- Umleitungs-URI, Plattform **Web**: `https://wiki.firma.de/api/v1/auth/oidc/callback`
  (zum Testen geht `http://localhost:8080/api/v1/auth/oidc/callback`; `http` erlaubt Entra nur
  für localhost)

Danach in der App:

- *Übersicht*: **Anwendungs-ID (Client-ID)** und **Verzeichnis-ID (Mandanten-ID)** notieren.
- *Zertifikate & Geheimnisse*: neuen geheimen Clientschlüssel anlegen und den **Wert** kopieren.
  Er läuft ab (höchstens 24 Monate) — rechtzeitig erneuern und in `.env` eintragen.
- *Tokenkonfiguration*: optionalen Anspruch hinzufügen, Tokentyp **ID**, Anspruch **email**.
  Ohne E-Mail im Token bricht die Anmeldung mit „keine E-Mail-Adresse übermittelt“ ab.

**Rollen über App-Rollen, nicht über Gruppen.** Gruppen kommen bei Entra als Objekt-IDs, und
wer in mehr als 200 Gruppen ist, bekommt gar keine Gruppenliste im Token. App-Rollen haben
lesbare Namen und dieses Problem nicht:

1. *App-Rollen*: zwei Rollen anlegen, zulässige Mitgliedstypen *Benutzer/Gruppen* —
   „Wiki-Admin“ mit Wert `kb-admin`, „Wiki-Redaktion“ mit Wert `kb-editor`.
2. *Unternehmensanwendungen → Wissensdatenbank → Benutzer und Gruppen*: Gruppen den Rollen
   zuweisen. Wer nur lesen soll, wird der App ohne Rolle zugewiesen.
3. *Eigenschaften*: **Zuweisung erforderlich = Ja**. Sonst kann sich jede Person im Mandanten
   anmelden und liest alles, was Bereiche für alle Angemeldeten freigeben.

In `.env` — mit der **Mandanten-ID**, nicht `common`, sonst passt der Issuer im Token nicht:

```
KB_OIDC_ISSUER=https://login.microsoftonline.com/<Verzeichnis-ID>/v2.0
KB_OIDC_CLIENT_ID=<Anwendungs-ID>
KB_OIDC_CLIENT_SECRET=<Wert des geheimen Clientschlüssels>
KB_OIDC_BUTTON_LABEL=Microsoft-Konto
KB_OIDC_GROUPS_CLAIM=roles
KB_OIDC_ADMIN_GROUPS=kb-admin
KB_OIDC_EDITOR_GROUPS=kb-editor
KB_OIDC_DEFAULT_ROLE=reader
```

```bash
docker compose up -d
```

Auf der Anmeldeseite erscheint dann „Mit Microsoft-Konto anmelden“; *Verwaltung → System*
zeigt, ob SSO aktiv ist.

Zwei Dinge, die bei Entra anders laufen:

- **Lokale Konten werden nicht per E-Mail verknüpft.** Entra meldet nicht, ob eine E-Mail
  bestätigt ist, und die Adresse ist in Entra änderbar — kein sicherer Schlüssel. Wer schon ein
  lokales Konto mit seiner Firmen-E-Mail hat, bekommt beim SSO-Login den Hinweis, dass es die
  E-Mail bereits gibt. Den lokalen Admin deshalb auf eine eigene Adresse legen (etwa
  `notfall@wiki.local`) und als Notfallzugang behalten. Ein bestehendes lokales Konto mit der
  Firmen-E-Mail löschen und die Person sich per SSO neu anmelden lassen — ihre Seiten bleiben.
- **Die Rolle kommt bei jeder Anmeldung aus Entra**, solange `KB_OIDC_ADMIN_GROUPS` oder
  `KB_OIDC_EDITOR_GROUPS` gesetzt ist; in der App geänderte Rollen werden dann überschrieben.
  Beide leer lassen, wenn Rollen in der App gepflegt werden sollen. Den letzten aktiven
  Administrator stuft eine Anmeldung nie herab.

Mitgliedschaften in Bereichen vergibst du weiterhin in der App — Entra liefert nur die globale
Rolle.

## Rollen und Rechte

| Rolle | darf |
|---|---|
| Administration | alles, auch Personen und alle Bereiche |
| Redaktion | zusätzlich Bereiche anlegen |
| Lesen | nur, was Bereiche freigeben |

Jeder Bereich legt fest, ob alle Angemeldeten lesen, schreiben oder gar nichts sehen.
Mitgliedschaften heben das für einzelne Personen an: Lesen, Schreiben oder Verwalten. Ein
Bereich, den jemand nicht lesen darf, existiert für diese Person nicht, auch nicht in Suche,
Favoriten oder über direkte Links.

## Sicherung und Wiederherstellung

Der Dienst `backup` schreibt täglich um `KB_BACKUP_TIME` nach `KB_BACKUP_DIR` (Vorgabe
`./backups`) einen Ordner pro Lauf mit `kb.dump` (Datenbank) und `uploads.tar.gz` (Anhänge).
Ältere Ordner als `KB_BACKUP_KEEP_DAYS` werden gelöscht.

Sofort sichern:

```bash
docker compose run --rm backup now
```

Wiederherstellen (Ordnername aus `ls backups`):

```bash
docker compose stop app web
```

```bash
docker compose run --rm --entrypoint kb-restore backup 2026-10-15_0230
```

```bash
docker compose start app web
```

Docker Desktop darf manche Ordner nicht einbinden. Dann `KB_BACKUP_DIR=backups` setzen, die
Sicherungen landen im gleichnamigen Docker-Volume.

## Aktualisieren

```bash
git pull
```

```bash
docker compose up -d --build --wait
```

Datenbank-Migrationen laufen beim Start der App automatisch.

## Entwicklung

```bash
cd backend && uv sync && uv run pytest -q
```

```bash
cd frontend && npm ci && npm test && npm run dev
```

Der Vite-Dev-Server leitet `/api` an `localhost:8000` weiter; das Backend startet mit
`uv run python -m kb serve` und den Variablen aus `.env.example` (plus `KB_DATABASE_URL`).
Die Ende-zu-Ende-Tests in `e2e/` laufen gegen den gestarteten Stack, siehe `e2e/README.md`.
