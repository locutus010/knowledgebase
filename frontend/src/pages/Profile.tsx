import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, patch, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { AVATAR_COLORS } from '@/lib/colors'
import { useTheme, type ThemeChoice } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { TopBar } from '@/components/TopBar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'

export default function Profile() {
  const { user, refresh } = useAuth()
  const { theme, setTheme } = useTheme()
  const [name, setName] = useState(user?.name ?? '')
  const [color, setColor] = useState(user?.avatar_color ?? 'teal')
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  if (!user) return null

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    try { await patch('/auth/me', { name, avatar_color: color }); await refresh(); toast.success('Profil gespeichert') } catch (err) { toast.error((err as Error).message) }
  }
  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwError(null)
    try { await post('/auth/password', { current: cur, new: next }); setCur(''); setNext(''); toast.success('Passwort geändert') }
    catch (err) { setPwError(err instanceof ApiError ? err.message : 'Ändern fehlgeschlagen.') }
  }

  return (
    <div>
      <TopBar crumbs={[{ label: 'Profil' }]} />
      <div className="mx-auto max-w-[560px] space-y-12 px-5 pt-10 pb-24 sm:px-10">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Profil</h1>
          <p className="mt-1 text-sm text-ink-muted">{user.email}</p>
          <form onSubmit={saveProfile} className="mt-6 space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={name || user.name} color={color} size={52} />
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Farbe">
                {AVATAR_COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
                    className={cn('flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-canvas', color === c && 'ring-2 ring-[var(--ink)]')}
                    style={{ background: `var(--sp-${c})` }}>{color === c ? <Check className="size-3.5 text-white" /> : null}</button>
                ))}
              </div>
            </div>
            <Field label="Name" htmlFor="pf-name"><Input id="pf-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required /></Field>
            <Button type="submit" variant="primary">Profil speichern</Button>
          </form>
        </section>

        <section>
          <h2 className="text-[17px] font-semibold tracking-tight">Darstellung</h2>
          <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Darstellung">
            {([['light', 'Hell'], ['dark', 'Dunkel'], ['system', 'Wie das System']] as [ThemeChoice, string][]).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={theme === v} onClick={() => setTheme(v)}
                className={cn('rounded-lg border px-3 py-2.5 text-[13.5px] font-medium', theme === v ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line hover:border-line-strong')}>{l}</button>
            ))}
          </div>
        </section>

        {user.is_local ? (
          <section>
            <h2 className="text-[17px] font-semibold tracking-tight">Passwort ändern</h2>
            <form onSubmit={savePassword} className="mt-4 space-y-4">
              <Field label="Aktuelles Passwort" htmlFor="pf-cur"><Input id="pf-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
              <Field label="Neues Passwort" hint="Mindestens 10 Zeichen." error={pwError ?? undefined} htmlFor="pf-new"><Input id="pf-new" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
              <Button type="submit">Passwort ändern</Button>
            </form>
          </section>
        ) : (
          <p className="text-sm text-ink-muted">Du meldest dich über SSO an; dein Passwort verwaltest du dort.</p>
        )}
      </div>
    </div>
  )
}
