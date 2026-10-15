import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UserPlus, X } from 'lucide-react'
import { del, get, put } from '@/lib/api'
import type { DirectoryUser, Member, Space } from '@/lib/types'
import { Avatar, Popover, PopoverContent, PopoverTrigger } from './ui/misc'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select } from './ui/select'

const LEVELS: { value: Member['level']; label: string; hint: string }[] = [
  { value: 'read', label: 'Lesen', hint: 'Seiten ansehen und suchen' },
  { value: 'edit', label: 'Schreiben', hint: 'Seiten anlegen und ändern' },
  { value: 'manage', label: 'Verwalten', hint: 'Mitglieder, Einstellungen, Papierkorb' },
]

export function MemberManager({ space }: { space: Space }) {
  const qc = useQueryClient()
  const key = ['members', space.slug]
  const members = useQuery({ queryKey: key, queryFn: () => get<Member[]>(`/spaces/${space.slug}/members`) })
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const dir = useQuery({ queryKey: ['directory', q], queryFn: () => get<DirectoryUser[]>(`/directory/users?q=${encodeURIComponent(q)}`), enabled: open })

  const setLevel = async (userId: string, level: Member['level']) => {
    try {
      await put(`/spaces/${space.slug}/members/${userId}`, { level })
      qc.invalidateQueries({ queryKey: key })
    } catch (e) { toast.error((e as Error).message) }
  }
  const remove = async (m: Member) => {
    try {
      await del(`/spaces/${space.slug}/members/${m.user_id}`)
      qc.invalidateQueries({ queryKey: key })
      toast.success(`${m.name} entfernt`)
    } catch (e) { toast.error((e as Error).message) }
  }
  const memberIds = new Set(members.data?.map((m) => m.user_id))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {space.default_access === 'none' ? 'Nur diese Personen sehen den Bereich.' : space.default_access === 'read'
            ? 'Alle Angemeldeten lesen mit. Hier gibst du einzelnen Personen mehr Rechte.' : 'Alle Angemeldeten schreiben mit. Verwalten dürfen nur die hier Genannten.'}
          {' '}Administratoren haben immer vollen Zugriff.
        </p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild><Button variant="primary" size="sm"><UserPlus />Person hinzufügen</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder E-Mail" aria-label="Person suchen" />
            <ul className="mt-2 max-h-64 overflow-y-auto">
              {dir.data?.filter((u) => !memberIds.has(u.id)).map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={() => { void setLevel(u.id, 'read'); setOpen(false); setQ('') }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sunken">
                    <Avatar name={u.name} color={u.avatar_color} size={26} />
                    <span className="min-w-0"><span className="block truncate text-[13.5px] font-medium">{u.name}</span><span className="block truncate text-xs text-ink-subtle">{u.email}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {members.data?.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={m.name} color={m.avatar_color} size={30} />
            <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{m.name}</span><span className="block truncate text-xs text-ink-subtle">{m.email}</span></span>
            <div className="w-36"><Select size="sm" value={m.level} onValueChange={(v) => void setLevel(m.user_id, v)} options={LEVELS} label={`Recht von ${m.name}`} /></div>
            <Button variant="ghost" size="icon-sm" aria-label={`${m.name} entfernen`} onClick={() => void remove(m)}><X /></Button>
          </li>
        ))}
        {members.data && !members.data.length ? <li className="px-4 py-6 text-center text-sm text-ink-subtle">Noch keine Mitglieder.</li> : null}
      </ul>
    </div>
  )
}
