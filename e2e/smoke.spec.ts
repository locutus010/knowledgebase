import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { ADMIN } from './global-setup'

const run = Date.now().toString(36)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const userA = { email: `anna-${run}@example.org`, name: 'Anna Lesend', password: 'anna-passwort-123' }
const userB = { email: `bernd-${run}@example.org`, name: 'Bernd Draußen', password: 'bernd-passwort-123' }

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(who.email)
  await page.getByLabel('Passwort').fill(who.password)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function api(request: APIRequestContext) {
  const me = await (await request.get('/api/v1/auth/me')).json()
  return { 'X-CSRF-Token': me.csrf_token as string }
}

async function newUserPage(browser: Browser, who: typeof userA) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await login(page, who)
  return page
}

test('Ein privater Bereich: anlegen, schreiben, finden, abschotten', async ({ page, browser }) => {
  // --- Admin meldet sich an und legt einen privaten Bereich an
  await login(page, ADMIN)
  await page.goto('/spaces/new')
  await page.getByLabel('Name').fill(`HR ${run}`)
  await page.getByRole('combobox', { name: 'Zugriff' }).click()
  await page.getByRole('option', { name: /Nur Mitglieder/ }).click()
  await page.getByRole('main').getByRole('button', { name: 'Bereich anlegen' }).click()
  await expect(page).toHaveURL(/\/s\/hr-/)
  const slug = page.url().split('/s/')[1]

  // --- zwei Personen anlegen, Anna bekommt Leserecht
  const headers = await api(page.request)
  for (const u of [userA, userB]) {
    const r = await page.request.post('/api/v1/users', { headers, data: { ...u, role: 'reader' } })
    expect(r.status()).toBe(201)
    const id = (await r.json()).user.id
    if (u === userA) {
      const m = await page.request.put(`/api/v1/spaces/${slug}/members/${id}`, { headers, data: { level: 'read' } })
      expect(m.ok()).toBeTruthy()
    }
  }

  // --- Seite aus der Vorlage „Anleitung“
  await page.goto(`/s/${slug}/new`)
  const title = `Gehaltsrunde ${run}`
  await page.getByLabel('Titel').fill(title)
  await page.getByText('Anleitung', { exact: true }).click()
  await page.getByRole('button', { name: 'Seite anlegen' }).click()
  await expect(page).toHaveURL(/\/p\//)
  const pageId = page.url().split('/p/')[1]
  await expect(page.getByRole('button', { name: 'Fertig' })).toBeVisible()
  await page.getByRole('button', { name: 'Visuell' }).click()

  // --- Bausteine über das Slash-Menü: Tabelle, Codeblock, Checkliste
  const editor = page.locator('.ProseMirror')
  // Der Bereich unter dem Text setzt den Cursor in einen leeren Absatz am Dokumentende.
  // Tiptap setzt den Fokus einen Frame später — erst dann tippen.
  const toEnd = async () => {
    await page.getByTestId('editor-end').click()
    await expect(editor).toHaveClass(/ProseMirror-focused/)
  }
  await toEnd()
  const slash = async (cmd: string, text: string) => {
    await page.keyboard.type('/')
    await page.getByRole('option', { name: new RegExp(cmd) }).click()
    await page.keyboard.type(text)
  }
  await slash('Checkliste', 'Vertrag prüfen')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter') // leerer Punkt beendet die Liste
  await slash('Tabelle', 'Stufe')
  await toEnd() // Absatz hinter der Tabelle
  await slash('Codeblock', 'echo hallo')
  await expect(editor.locator('table', { hasText: 'Stufe' })).toBeVisible()
  await expect(editor.locator('pre')).toContainText('echo hallo')
  await expect(editor.locator('ul[data-type="taskList"]', { hasText: 'Vertrag prüfen' })).toBeVisible()

  // --- Bild hochladen
  await toEnd()
  await page.getByTestId('editor-file-input').setInputFiles({ name: 'bild.png', mimeType: 'image/png', buffer: PNG })
  await expect(editor.locator('img[src^="/api/v1/attachments/"]')).toBeVisible()
  const attachmentUrl = await editor.locator('img').first().getAttribute('src')

  // --- gespeicherten Stand holen; Umschalten Visuell ↔ Markdown darf ihn nicht ändern
  const saved = page.getByRole('status').filter({ hasText: 'Gespeichert' })
  await expect(saved).toBeVisible({ timeout: 15_000 })
  const fetchPage = async () => (await (await page.request.get(`/api/v1/pages/${pageId}`)).json()) as { version: number; content_md: string }
  await expect.poll(async () => (await fetchPage()).content_md, { timeout: 15_000 }).toContain('](/api/v1/attachments/')
  await expect(saved).toBeVisible()
  const before = await fetchPage()
  expect(before.content_md).toContain('- [ ] Vertrag prüfen')
  // Die neuen Bausteine stehen am Ende, nicht in der Hinweisbox der Vorlage.
  expect(before.content_md.indexOf('Vertrag prüfen')).toBeGreaterThan(before.content_md.indexOf('Häufige Probleme'))
  expect(before.content_md).not.toMatch(/^> .*Vertrag prüfen/m)
  expect(before.content_md).toMatch(/\| Stufe/)
  expect(before.content_md).toMatch(/```\s*\n?echo hallo/)
  expect(before.content_md).toContain('](/api/v1/attachments/')
  for (const mode of ['Markdown', 'Visuell', 'Markdown', 'Visuell']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    await expect(page.getByRole('button', { name: mode, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await page.waitForTimeout(2500) // länger als die Autospeicher-Verzögerung
  const after = await fetchPage()
  expect(after.version).toBe(before.version)
  expect(after.content_md).toBe(before.content_md)

  await page.getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()

  // Screenshots in hell und dunkel
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => localStorage.setItem('kb-theme', s), scheme)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await page.screenshot({ path: `screenshots/seite-${scheme}.png` })
  }

  // --- Anna findet die Seite über ⌘K
  const anna = await newUserPage(browser, userA)
  await anna.keyboard.press('Control+k')
  await anna.getByPlaceholder(/Seiten durchsuchen/).fill(`Gehaltsrunde ${run}`)
  await expect(anna.getByRole('option', { name: new RegExp(title) })).toBeVisible()
  await anna.getByRole('option', { name: new RegExp(title) }).click()
  await expect(anna.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(anna.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0)

  // --- Bernd sieht nichts: Suche leer, Direktlink und Anhang 404
  const bernd = await newUserPage(browser, userB)
  const search = await (await bernd.request.get(`/api/v1/search?q=${encodeURIComponent(`Gehaltsrunde ${run}`)}`)).json()
  expect(search.total).toBe(0)
  await bernd.goto(`/p/${pageId}`)
  await expect(bernd.getByText('Diese Seite gibt es nicht')).toBeVisible()
  expect((await bernd.request.get(attachmentUrl!)).status()).toBe(404)
  expect((await bernd.request.get(`/api/v1/spaces/${slug}`)).status()).toBe(404)
  await expect(bernd.getByRole('link', { name: `HR ${run}` })).toHaveCount(0)
})
