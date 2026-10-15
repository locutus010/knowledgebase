import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, KeyRound, MoreHorizontal, Search, Trash2, UserPlus, UserX, UserCheck } from 'lucide-react'
import { del, get, patch, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { relativeTime } from '@/lib/format'
import type { AdminUser, Role } from '@/lib/types'
import { Avatar, Badge } from './ui/misc'
import { Button } from './ui/button'
import { Confirm, Dialog } from './ui/dialog'
import { Field, Input } from './ui/input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './ui/menu'
import { Select } from './ui/select'

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'reader', label: 'Lesen', hint: 'Liest, was die Bereiche freigeben' },
  { value: 'editor', label: 'Redaktion', hint: 'Darf zusätzlich Bereiche anlegen' },
  { value: 'admin', label: 'Administration', hint: 'Darf alles' },
]

export function UserTable() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => get<AdminUser[]>('/users') })
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [otp, setOtp] = useState<{ name: string; password: string } | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-users'] })

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (users.data ?? []).filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.includes(s))
  }, [users.data, q])

  const update = async (u: AdminUser, body: Partial<Pick<AdminUser, 'role' | 'active'>>, msg: string) => {
    try { await patch(`/users/${u.id}`, body); refresh(); toast.success(msg) } catch (e) { toast.error((e as Error).message) }
  }
  const reset = async (u: AdminUser) => {
    try {
      const r = await post<{ one_time_password: string }>(`/users/${u.id}/reset-password`)
      setOtp({ name: u.name, password: r.one_time_password })
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder E-Mail" className="pl-9" aria-label="Benutzer suchen" />
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}><UserPlus />Person anlegen</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-[13.5px]">
          <thead className="border-b border-line text-xs text-ink-subtle">
            <tr><th className="px-4 py-2.5 font-medium">Person</th><th className="px-4 py-2.5 font-medium">Rolle</th><th className="px-4 py-2.5 font-medium">Anmeldung</th><th className="px-4 py-2.5 font-medium">Zuletzt da</th><th className="w-10" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'opacity-55'}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} color={u.avatar_color} size={30} />
                    <div className="min-w-0"><div className="truncate font-medium">{u.name}{u.id === me?.id ? <span className="ml-1.5 text-xs font-normal text-ink-subtle">du</span> : null}</div><div className="truncate text-xs text-ink-subtle">{u.email}</div></div>
                  </div>
                </td>
                <td className="w-44 px-4 py-2.5"><Select size="sm" value={u.role} options={ROLES} label={`Rolle von ${u.name}`} onValueChange={(r) => void update(u, { role: r }, `${u.name} ist jetzt ${ROLES.find((x) => x.value === r)!.label}`)} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">{u.is_sso ? <Badge tone="accent">SSO</Badge> : null}{u.is_local ? <Badge>Passwort</Badge> : null}{!u.active ? <Badge tone="warn">Gesperrt</Badge> : null}</div>
                </td>
                <td className="px-4 py-2.5 text-ink-muted">{u.last_login_at ? relativeTime(u.last_login_at) : 'noch nie'}</td>
                <td className="px-2">
                  <Menu>
                    <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Aktionen für ${u.name}`}><MoreHorizontal /></Button></MenuTrigger>
                    <MenuContent>
                      <MenuItem icon={<KeyRound />} onSelect={() => void reset(u)}>Einmal-Passwort setzen</MenuItem>
                      {u.active
                        ? <MenuItem icon={<UserX />} onSelect={() => void update(u, { active: false }, `${u.name} gesperrt`)}>Sperren</MenuItem>
                        : <MenuItem icon={<UserCheck />} onSelect={() => void update(u, { active: true }, `${u.name} entsperrt`)}>Entsperren</MenuItem>}
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 />} danger onSelect={() => setDeleting(u)}>Löschen</MenuItem>
                    </MenuContent>
                  </Menu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating ? <CreateUser onClose={() => setCreating(false)} onCreated={(name, password) => { refresh(); if (password) setOtp({ name, password }) }} /> : null}
      <Dialog open={!!otp} onOpenChange={(o) => !o && setOtp(null)} title="Einmal-Passwort"
        description={`Gib es ${otp?.name} auf sicherem Weg weiter. Es wird nur jetzt angezeigt; bei der ersten Anmeldung muss ein eigenes Passwort gewählt werden.`}
        footer={<Button variant="primary" onClick={() => setOtp(null)}>Fertig</Button>}>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-line bg-sunken px-3 py-2.5 font-mono text-[15px] tracking-wider select-all">{otp?.password}</code>
          <Button onClick={() => { void navigator.clipboard?.writeText(otp?.password ?? ''); toast.success('Kopiert') }}><Copy />Kopieren</Button>
        </div>
      </Dialog>
      <Confirm open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} danger confirmLabel="Löschen" title={`${deleting?.name} löschen?`}
        description="Das Konto wird entfernt. Seiten dieser Person bleiben erhalten, der Name verschwindet aus der Historie. Sperren ist meist die bessere Wahl."
        onConfirm={async () => { if (!deleting) return; try { await del(`/users/${deleting.id}`); refresh(); toast.success(`${deleting.name} gelöscht`) } catch (e) { toast.error((e as Error).message) } }} />
    </div>
  )
}

function CreateUser({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, otp: string | null) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('reader')
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const r = await post<{ one_time_password: string | null }>('/users', { email, name, role })
      onClose()
      onCreated(name, r.one_time_password)
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Person anlegen" description="Du bekommst danach ein Einmal-Passwort zum Weitergeben. Wer sich über SSO anmeldet, braucht kein Konto vorab.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="nu-name"><Input id="nu-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus /></Field>
        <Field label="E-Mail" htmlFor="nu-mail" error={error ?? undefined}><Input id="nu-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <div><p className="mb-1.5 text-[13px] font-medium">Rolle</p><Select value={role} onValueChange={setRole} options={ROLES} label="Rolle" /></div>
        <div className="flex justify-end gap-2 pt-2"><Button onClick={onClose}>Abbrechen</Button><Button type="submit" variant="primary">Anlegen</Button></div>
      </form>
    </Dialog>
  )
}
