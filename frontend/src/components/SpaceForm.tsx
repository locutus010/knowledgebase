import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { SPACE_COLORS } from '@/lib/colors'
import { cn } from '@/lib/utils'
import type { Space, SpaceColor } from '@/lib/types'
import { Button } from './ui/button'
import { Field, Input, Label, Textarea } from './ui/input'
import { Select } from './ui/select'
import { EmojiPicker } from './EmojiPicker'
import { SpaceTile } from './ui/misc'

export interface SpaceInput {
  name: string
  icon: string
  color: SpaceColor
  description: string
  default_access: Space['default_access']
}

export const ACCESS_OPTIONS: { value: Space['default_access']; label: string; hint: string }[] = [
  { value: 'read', label: 'Alle lesen', hint: 'Jede angemeldete Person kann lesen, Mitglieder schreiben' },
  { value: 'edit', label: 'Alle schreiben', hint: 'Jede angemeldete Person kann lesen und schreiben' },
  { value: 'none', label: 'Nur Mitglieder', hint: 'Für alle anderen unsichtbar' },
]

export function SpaceForm({ initial, submitLabel, onSubmit, busy }: {
  initial?: Partial<SpaceInput>
  submitLabel: string
  onSubmit: (v: SpaceInput) => void
  busy?: boolean
}) {
  const [v, setV] = useState<SpaceInput>({
    name: '', icon: '📘', color: 'teal', description: '', default_access: 'read', ...initial,
  })
  const set = <K extends keyof SpaceInput>(k: K, val: SpaceInput[K]) => setV((o) => ({ ...o, [k]: val }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (v.name.trim()) onSubmit({ ...v, name: v.name.trim() })
  }
  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex items-end gap-3">
        <div>
          <Label>Symbol</Label>
          <EmojiPicker value={v.icon} onChange={(i) => set('icon', i || '📘')} allowEmpty={false}>
            <button type="button" aria-label="Symbol wählen" className="rounded-xl transition-transform hover:scale-105">
              <SpaceTile icon={v.icon} color={v.color} size={44} />
            </button>
          </EmojiPicker>
        </div>
        <div className="flex-1">
          <Field label="Name" htmlFor="space-name">
            <Input id="space-name" value={v.name} maxLength={80} required autoFocus placeholder="Engineering"
              onChange={(e) => set('name', e.target.value)} />
          </Field>
        </div>
      </div>
      <div>
        <Label>Farbe</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Farbe">
          {SPACE_COLORS.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={v.color === c.value} aria-label={c.label} title={c.label}
              onClick={() => set('color', c.value)}
              className={cn('flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition', v.color === c.value && 'ring-2 ring-[var(--ink)]')}
              style={{ background: `var(--sp-${c.value})` }}>
              {v.color === c.value ? <Check className="size-4 text-white" /> : null}
            </button>
          ))}
        </div>
      </div>
      <Field label="Beschreibung" hint="Ein Satz dazu, was in diesen Bereich gehört." htmlFor="space-desc">
        <Textarea id="space-desc" value={v.description} maxLength={2000} rows={2}
          onChange={(e) => set('description', e.target.value)} placeholder="Architektur, Betrieb und Entwicklungsprozesse." />
      </Field>
      <div>
        <Label>Wer darf hinein?</Label>
        <Select value={v.default_access} onValueChange={(x) => set('default_access', x)} options={ACCESS_OPTIONS} label="Zugriff" />
      </div>
      <Button type="submit" variant="primary" disabled={busy || !v.name.trim()}>{submitLabel}</Button>
    </form>
  )
}
