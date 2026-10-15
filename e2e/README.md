# Ende-zu-Ende-Test

Läuft gegen einen gestarteten Stack (Vorgabe `http://localhost:8080`) und legt per
`docker compose exec` einen Test-Admin an.

```bash
npm ci && npx playwright install chromium
```

```bash
npx playwright test
```

Andere Adresse: `KB_URL=https://wiki.example.org npx playwright test`. Screenshots in hell
und dunkel landen in `screenshots/`.
