import { expect, test, type Browser, type Page } from '@playwright/test'
import { ADMIN } from './global-setup'

const run = Date.now().toString(36)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n% Angebot\n')
const reader = { email: `leser-${run}@example.org`, name: 'Lea Leser', password: 'leser-passwort-123' }

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(who.email)
  await page.getByLabel('Passwort').fill(who.password)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function asReader(browser: Browser) {
  const p = await (await browser.newContext()).newPage()
  await login(p, reader)
  return p
}

test('Dateien an eine Seite hängen, finden, lesen und löschen', async ({ page, browser }) => {
  await login(page, ADMIN)
  const me = await (await page.request.get('/api/v1/auth/me')).json()
  const headers = { 'X-CSRF-Token': me.csrf_token }
  const space = await (await page.request.post('/api/v1/spaces', { headers, data: { name: `Anhang ${run}`, default_access: 'none' } })).json()
  const pg = await (await page.request.post(`/api/v1/spaces/${space.slug}/pages`, { headers, data: { title: `Vertrag ${run}`, content_md: 'Siehe Anhänge.' } })).json()
  const u = await (await page.request.post('/api/v1/users', { headers, data: { ...reader, role: 'reader' } })).json()
  await page.request.put(`/api/v1/spaces/${space.slug}/members/${u.user.id}`, { headers, data: { level: 'read' } })

  // --- ohne Bearbeitungsmodus anhängen
  await page.goto(`/p/${pg.id}`)
  await expect(page.getByRole('button', { name: 'Datei anhängen' })).toBeVisible()
  await page.getByTestId('attachment-input').setInputFiles([
    { name: `Angebot-${run}.pdf`, mimeType: 'application/pdf', buffer: PDF },
    { name: 'skizze.png', mimeType: 'image/png', buffer: PNG },
  ])
  const list = page.getByRole('region', { name: /Anhänge/ })
  await expect(list.getByText(`Angebot-${run}.pdf`)).toBeVisible()
  await expect(list.getByText('skizze.png')).toBeVisible()

  // --- über den Dateinamen auffindbar
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder(/Seiten durchsuchen/).fill(`Angebot-${run}`)
  await expect(page.getByRole('option', { name: new RegExp(`Vertrag ${run}`) })).toBeVisible()
  await page.keyboard.press('Escape')

  // --- Leserin sieht und lädt, ändert aber nichts
  const lea = await asReader(browser)
  await lea.goto(`/p/${pg.id}`)
  const leaList = lea.getByRole('region', { name: /Anhänge/ })
  await expect(leaList.getByText(`Angebot-${run}.pdf`)).toBeVisible()
  await expect(lea.getByRole('button', { name: 'Datei anhängen' })).toHaveCount(0)
  await expect(leaList.getByRole('button', { name: /löschen/ })).toHaveCount(0)
  const href = await leaList.getByRole('link', { name: `Angebot-${run}.pdf herunterladen` }).getAttribute('href')
  const dl = await lea.request.get(href!)
  expect(dl.status()).toBe(200)
  expect(Buffer.from(await dl.body()).equals(PDF)).toBe(true)

  // --- im Bearbeitungsmodus in den Text einfügen, dann löschen mit Warnung
  await page.getByRole('main').getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByRole('button', { name: 'Visuell' }).click()
  await page.locator('.ProseMirror').click()
  await list.getByRole('button', { name: 'skizze.png in den Text einfügen' }).click()
  await expect(page.locator('.ProseMirror img[src^="/api/v1/attachments/"]')).toBeVisible()
  await expect(list.getByText('im Text verwendet')).toBeVisible()
  await expect.poll(async () => (await (await page.request.get(`/api/v1/pages/${pg.id}`)).json()).content_md, { timeout: 15_000 })
    .toContain('![skizze.png](/api/v1/attachments/')

  await list.getByRole('button', { name: 'skizze.png löschen' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('im Text verwendet')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click()
  await expect(list.getByText('skizze.png')).toHaveCount(0)
  await expect(list.getByText(`Angebot-${run}.pdf`)).toBeVisible()
})
