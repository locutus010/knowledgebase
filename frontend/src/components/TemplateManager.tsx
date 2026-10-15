import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { del, patch, post } from '@/lib/api'
import { useTemplates } from '@/lib/queries'
import type { Template } from '@/lib/types'
import { MarkdownSource } from '@/editor/MarkdownSource'
import { Button } from './ui/button'
import { Confirm, Dialog } from './ui/dialog'
import { Field, Input } from './ui/input'
import { EmojiPicker } from './EmojiPicker'

type Draft = { id?: string; name: string; description: string; icon: string; content_md: string }

export function TemplateManager({ spaceSlug }: { spaceSlug?: string }) {
  const qc = useQueryClient()
  const list = useTemplates(spaceSlug)
  const mine = (list.data ?? []).filter((t) => (spaceSlug ? t.space_slug === spaceSlug : t.space_slug === null))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)

  const save = async () => {
    if (!draft || !draft.name.trim()) return
    try {
      const body = { name: draft.name.trim(), description: draft.description, icon: draft.icon || '📄', content_md: draft.content_md }
      if (draft.id) await patch(`/templates/${draft.id}`, body)
      else await post('/templates', { ...body, space_slug: spaceSlug })
      qc.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Vorlage gespeichert')
      setDraft(null)
    } catch (e) { toast.error((e as Error).message) }
  }
  const remove = async (t: Template) => {
    try {
      await del(`/templates/${t.id}`)
      qc.invalidateQueries({ queryKey: ['templates'] })
      toast.success(`Vorlage „${t.name}“ gelöscht`)
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {spaceSlug ? 'Diese Vorlagen gibt es nur in diesem Bereich, zusätzlich zu den allgemeinen.' : 'Diese Vorlagen stehen in allen Bereichen zur Wahl.'}
          {' '}Platzhalter: {'{{titel}}'}, {'{{autor}}'}, {'{{datum}}'}.
        </p>
        <Button variant="primary" size="sm" onClick={() => setDraft({ name: '', description: '', icon: '📄', content_md: '' })}><Plus />Vorlage anlegen</Button>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {mine.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-sunken">{t.icon || <FileText className="size-4" />}</span>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDraft({ ...t })}>
              <span className="block truncate text-[14px] font-medium hover:underline">{t.name}</span>
              <span className="block truncate text-xs text-ink-subtle">{t.description}</span>
            </button>
            <Button variant="ghost" size="icon-sm" aria-label={`${t.name} löschen`} onClick={() => setDeleting(t)}><Trash2 /></Button>
          </li>
        ))}
        {!mine.length ? <li className="px-4 py-6 text-center text-sm text-ink-subtle">Noch keine Vorlagen.</li> : null}
      </ul>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)} width="max-w-2xl" title={draft?.id ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
        footer={<><Button onClick={() => setDraft(null)}>Abbrechen</Button><Button variant="primary" onClick={() => void save()} disabled={!draft?.name.trim()}>Speichern</Button></>}>
        {draft ? (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <EmojiPicker value={draft.icon} onChange={(i) => setDraft({ ...draft, icon: i })} allowEmpty={false}>
                <button type="button" aria-label="Symbol" className="flex size-9 items-center justify-center rounded-lg border border-line text-lg">{draft.icon}</button>
              </EmojiPicker>
              <div className="flex-1"><Field label="Name" htmlFor="tpl-name"><Input id="tpl-name" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field></div>
            </div>
            <Field label="Beschreibung" htmlFor="tpl-desc"><Input id="tpl-desc" value={draft.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Inhalt (Markdown)</p>
              <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-line px-3">
                <MarkdownSource value={draft.content_md} editable onChange={(v) => setDraft((d) => (d ? { ...d, content_md: v } : d))} />
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>
      <Confirm open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} danger confirmLabel="Löschen" title="Vorlage löschen?"
        description={`„${deleting?.name}“ steht danach nicht mehr zur Wahl. Bestehende Seiten bleiben unverändert.`} onConfirm={() => deleting && void remove(deleting)} />
    </div>
  )
}
