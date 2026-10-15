import { expect, test, type Page } from '@playwright/test'
import { ADMIN } from './global-setup'

const run = Date.now().toString(36)

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(ADMIN.email)
  await page.getByLabel('Passwort').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/** Legt Bereich und Seite über die API an und öffnet die Seite. */
async function freshPage(page: Page, content: string) {
  const me = await (await page.request.get('/api/v1/auth/me')).json()
  const headers = { 'X-CSRF-Token': me.csrf_token }
  const space = await (await page.request.post('/api/v1/spaces', { headers, data: { name: `Test ${run}` } })).json()
  const p = await (await page.request.post(`/api/v1/spaces/${space.slug}/pages`, { headers, data: { title: `Runden ${run}`, content_md: content } })).json()
  await page.goto(`/p/${p.id}`)
  try { await page.evaluate(() => localStorage.setItem('kb-editor-mode', 'wysiwyg')) } catch { /* egal */ }
  await page.reload()
  return p.id as string
}

async function editRound(page: Page, text: string) {
  await page.getByRole('main').getByRole('button', { name: 'Bearbeiten' }).click()
  await page.getByTestId('editor-end').click()
  await expect(page.locator('.ProseMirror')).toHaveClass(/ProseMirror-focused/)
  await page.keyboard.type(text)
  await expect(page.getByRole('status').filter({ hasText: 'Ungespeichert' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByRole('main').getByRole('button', { name: 'Bearbeiten' })).toBeVisible()
}

test('Jede Bearbeitungsrunde wird eine eigene Version, lückenlos nummeriert', async ({ page }) => {
  await login(page)
  const id = await freshPage(page, 'Anfang')
  await editRound(page, 'Runde eins schreibt mehrere Wörter')
  await editRound(page, 'Runde zwei')
  await editRound(page, 'Runde drei')
  const revs = await (await page.request.get(`/api/v1/pages/${id}/revisions`)).json()
  expect(revs.map((r: { number: number }) => r.number)).toEqual([4, 3, 2, 1])

  await page.goto(`/p/${id}/history`)
  await expect(page.getByRole('button', { name: /Version 4/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Version 3/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Version 2/ })).toBeVisible()
})

test('Toolbar formatiert Text, Listen und Tabellen', async ({ page }) => {
  await login(page)
  const id = await freshPage(page, 'Text')
  await page.getByRole('main').getByRole('button', { name: 'Bearbeiten' }).click()
  const bar = page.getByRole('toolbar', { name: 'Formatierung' })
  await expect(bar).toBeVisible()

  await page.getByTestId('editor-end').click()
  await bar.getByRole('button', { name: 'Fett' }).click()
  await page.keyboard.type('kräftig')
  await bar.getByRole('button', { name: 'Fett' }).click()
  await page.keyboard.press('Enter')
  await bar.getByRole('button', { name: 'Aufzählung' }).click()
  await page.keyboard.type('Punkt')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await bar.getByRole('button', { name: 'Tabelle einfügen' }).click()
  await page.keyboard.type('Kopf')
  await bar.getByRole('button', { name: /Tabelle/ }).click()
  await page.getByRole('menuitem', { name: 'Zeile darunter einfügen' }).click()

  await expect.poll(async () => (await (await page.request.get(`/api/v1/pages/${id}`)).json()).content_md, { timeout: 15_000 })
    .toMatch(/\*\*kräftig\*\*[\s\S]*- Punkt[\s\S]*\| Kopf/)
  const md: string = (await (await page.request.get(`/api/v1/pages/${id}`)).json()).content_md
  const rows = md.split('\n').filter((l) => l.startsWith('|'))
  expect(rows.length).toBe(5) // Kopf, Trenner, 2 vorhandene + 1 neue Zeile
})
