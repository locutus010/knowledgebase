import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ApiError, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Field, Input } from './ui/input'

/** Nach einem Einmal-Passwort muss zuerst ein eigenes gesetzt werden. */
export function PasswordChangeGate() {
  const { user, refresh } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!user?.must_change_password) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (next !== repeat) return setError('Die beiden neuen Passwörter stimmen nicht überein.')
    try {
      await post('/auth/password', { current, new: next })
      toast.success('Passwort geändert')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ändern fehlgeschlagen.')
    }
  }
  return (
    <Dialog open onOpenChange={() => {}} title="Lege ein eigenes Passwort fest"
      description="Du hast dich mit einem Einmal-Passwort angemeldet. Bevor es weitergeht, wähle ein eigenes.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Einmal-Passwort" htmlFor="pc-cur"><Input id="pc-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></Field>
        <Field label="Neues Passwort" hint="Mindestens 10 Zeichen." htmlFor="pc-new"><Input id="pc-new" type="password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" /></Field>
        <Field label="Neues Passwort wiederholen" htmlFor="pc-rep" error={error ?? undefined}><Input id="pc-rep" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" /></Field>
        <Button type="submit" variant="primary" className="w-full">Passwort speichern</Button>
      </form>
    </Dialog>
  )
}
