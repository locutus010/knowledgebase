import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@example.org',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-passwort',
}

/** Legt den Test-Admin im laufenden Stack an; gibt es ihn schon, ist das in Ordnung. */
export default function globalSetup() {
  const root = process.env.KB_COMPOSE_DIR ?? fileURLToPath(new URL('..', import.meta.url))
  try {
    execFileSync('docker', ['compose', 'exec', '-T', 'app', 'python', '-m', 'kb', 'create-admin',
      '--email', ADMIN.email, '--name', 'E2E Admin', '--password-stdin'],
    { cwd: root, input: `${ADMIN.password}\n`, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (e) {
    const err = String((e as { stderr?: Buffer }).stderr ?? e)
    if (!err.includes('existiert bereits')) throw e
  }
}
