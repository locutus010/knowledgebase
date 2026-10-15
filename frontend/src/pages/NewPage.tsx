import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { post } from '@/lib/api'
import { qk, useSpace, useTemplates, useTree } from '@/lib/queries'
import { spaceVars } from '@/lib/colors'
import { cn } from '@/lib/utils'
import type { Page } from '@/lib/types'
import { TopBar } from '@/components/TopBar'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import { NotFound } from './NotFound'

export default function NewPage() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const parentId = params.get('parent')
  const space = useSpace(slug)
  const tree = useTree(slug)
  const templates = useTemplates(slug)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [template, setTemplate] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const parent = tree.data?.find((n) => n.id === parentId)

  useEffect(() => {
    document.title = 'Neue Seite · Wissensdatenbank'
  }, [])

  if (space.isLoading) return null
  if (!space.data) return <NotFound what="Diesen Bereich" />
  const s = space.data

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const page = await post<Page>(`/spaces/${s.slug}/pages`, { title: title.trim(), parent_id: parentId, template_id: template })
      qc.invalidateQueries({ queryKey: qk.tree(s.slug) })
      qc.invalidateQueries({ queryKey: qk.spaces })
      qc.setQueryData(qk.page(page.id), page)
      navigate(`/p/${page.id}`, { state: { edit: true } })
    } catch (err) {
      toast.error((err as Error).message)
      setBusy(false)
    }
  }

  const cards = [{ id: null as string | null, name: 'Leere Seite', description: 'Ohne Vorgaben anfangen', icon: '' }, ...(templates.data ?? [])]
  return (
    <div style={spaceVars(s.color)}>
      <TopBar space={s} crumbs={[...(parent ? [{ label: parent.title, icon: parent.icon, to: `/p/${parent.id}` }] : []), { label: 'Neue Seite' }]} />
      <form onSubmit={create} className="mx-auto max-w-[760px] px-5 pt-12 pb-24 sm:px-10">
        <div className="mb-5 h-1 w-14 rounded-full bg-[var(--sc)]" aria-hidden />
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus required
          placeholder="Titel der neuen Seite" aria-label="Titel"
          className="w-full bg-transparent text-[34px] font-semibold tracking-[-0.028em] outline-none placeholder:text-ink-subtle sm:text-[40px]" />
        <p className="mt-2 text-sm text-ink-muted">
          {parent ? `Wird Unterseite von „${parent.title}“ in ${s.name}.` : `Wird oberste Seite in ${s.name}.`}
        </p>

        <fieldset className="mt-10">
          <legend className="mb-3 text-[15px] font-semibold">Womit anfangen?</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {cards.map((t) => {
              const active = template === t.id
              return (
                <label key={t.id ?? 'leer'}
                  className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
                    active ? 'border-[var(--sc)] bg-[var(--sc-soft)]' : 'border-line bg-surface hover:border-line-strong')}>
                  <input type="radio" name="template" className="sr-only" checked={active} onChange={() => setTemplate(t.id)} />
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-lg">
                    {t.icon || <FileText className="size-4 text-ink-subtle" />}
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium">{t.name}</span>
                    <span className="block text-[13px] leading-snug text-ink-muted">{t.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="mt-10 flex gap-2">
          <Button type="submit" variant="primary" size="lg" disabled={busy || !title.trim()}>
            {busy ? <Spinner /> : null}Seite anlegen
          </Button>
          <Button size="lg" onClick={() => navigate(-1)}>Abbrechen</Button>
        </div>
      </form>
    </div>
  )
}
