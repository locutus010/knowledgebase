import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { ApiError, get, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/misc'
import { Logo } from '@/components/Logo'

const OIDC_ERRORS: Record<string, string> = {
  state: 'Die Anmeldung ist abgelaufen oder wurde unterbrochen. Starte sie neu.',
  token: 'Der Anmeldedienst hat eine ungültige Antwort geschickt.',
  provider: 'Der Anmeldedienst ist gerade nicht erreichbar.',
  inactive: 'Dein Konto ist deaktiviert. Wende dich an eine Administratorin oder einen Administrator.',
  email_conflict: 'Zu dieser E-Mail gibt es schon ein lokales Konto. Der Anmeldedienst hat die Adresse nicht bestätigt, deshalb wurde es nicht verknüpft.',
  email_missing: 'Der Anmeldedienst hat keine E-Mail-Adresse übermittelt.',
}

function safeNext(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/'
}

export default function Login() {
  const { user, refresh } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(OIDC_ERRORS[params.get('error') ?? ''] ?? null)
  const [busy, setBusy] = useState(false)
  const config = useQuery({ queryKey: ['auth-config'], queryFn: () => get<{ oidc_enabled: boolean; oidc_label: string }>('/auth/config') })

  useEffect(() => {
    document.title = 'Anmelden · Wissensdatenbank'
  }, [])

  if (user) return <Navigate to={next} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await post('/auth/login', { email, password })
      await refresh()
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Anmeldung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(420px,1fr)_1.15fr]">
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Willkommen zurück</h1>
          <p className="mt-2 text-[15px] text-ink-muted">Melde dich an, um im Wissen deines Teams zu lesen und zu schreiben.</p>

          {error ? (
            <div role="alert" className="mt-6 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {config.data?.oidc_enabled ? (
            <>
              <Button asChild variant="secondary" size="lg" className="mt-7 w-full">
                <a href={`/api/v1/auth/oidc/login?next=${encodeURIComponent(next)}`}>
                  <KeyRound />
                  Mit {config.data.oidc_label} anmelden
                </a>
              </Button>
              <div className="my-6 flex items-center gap-3 text-xs text-ink-subtle">
                <span className="h-px flex-1 bg-line" />
                oder mit Passwort
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          ) : (
            <div className="mt-7" />
          )}

          <form onSubmit={submit} className="space-y-4">
            <Field label="E-Mail" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
            </Field>
            <Field label="Passwort" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? <Spinner /> : null}
              Anmelden
            </Button>
          </form>
          <p className="mt-6 text-[13px] text-ink-subtle">Passwort vergessen? Eine Administratorin oder ein Administrator setzt dir ein neues.</p>
        </div>
      </main>
      <LoginArt />
    </div>
  )
}

/** Rechte Hälfte: die acht Bereichsfarben als gestaffelte Buchrücken — das Leitsystem der App. */
function LoginArt() {
  const spines = ['teal', 'indigo', 'violet', 'rose', 'orange', 'amber', 'green', 'slate']
  const heights = [78, 64, 88, 70, 58, 82, 66, 74]
  return (
    <aside aria-hidden className="relative hidden overflow-hidden border-l border-line bg-sunken lg:block">
      <div className="absolute inset-x-[12%] bottom-[18%] flex items-end gap-[1.6%]">
        {spines.map((c, i) => (
          <div
            key={c}
            className="flex-1 rounded-t-[6px]"
            style={{
              height: `${heights[i] * 0.52}vh`,
              background: `linear-gradient(180deg, var(--sp-${c}) 0%, color-mix(in srgb, var(--sp-${c}) 82%, black) 100%)`,
              boxShadow: 'inset -6px 0 0 rgb(0 0 0 / 0.08), inset 0 10px 0 rgb(255 255 255 / 0.12)',
            }}
          >
            <div className="mx-auto mt-[22%] h-[3px] w-[46%] rounded bg-white/45" />
            <div className="mx-auto mt-2 h-[3px] w-[30%] rounded bg-white/30" />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-[8%] bottom-[18%] h-[10px] -translate-y-[-10px] rounded bg-line-strong" />
      <p className="absolute right-[12%] bottom-[8%] left-[12%] text-[15px] leading-relaxed text-ink-muted">
        Jeder Bereich hat seine Farbe. Was dein Team weiß, steht hier nebeneinander im Regal.
      </p>
    </aside>
  )
}
