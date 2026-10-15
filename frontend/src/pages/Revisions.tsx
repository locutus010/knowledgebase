import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { diffLines } from 'diff'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'
import { get, post } from '@/lib/api'
import { canEdit, qk, usePage } from '@/lib/queries'
import { spaceVars } from '@/lib/colors'
import { formatDateTime, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RevisionMeta } from '@/lib/types'
import { TopBar } from '@/components/TopBar'
import { DiffView } from '@/components/DiffView'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/dialog'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { NotFound } from './NotFound'

interface Rev extends RevisionMeta { content_md: string }

export default function Revisions() {
  const { pageId } = useParams()
  const page = usePage(pageId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['revisions', pageId], queryFn: () => get<RevisionMeta[]>(`/pages/${pageId}/revisions`), enabled: !!pageId })
  const [selected, setSelected] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (selected === null && list.data?.length) setSelected(list.data[0].version)
  }, [list.data, selected])

  const idx = list.data?.findIndex((r) => r.version === selected) ?? -1
  const prevVersion = idx >= 0 ? list.data?.[idx + 1]?.version : undefined
  const cur = useQuery({ queryKey: ['revision', pageId, selected], queryFn: () => get<Rev>(`/pages/${pageId}/revisions/${selected}`), enabled: selected !== null })
  const prev = useQuery({ queryKey: ['revision', pageId, prevVersion], queryFn: () => get<Rev>(`/pages/${pageId}/revisions/${prevVersion}`), enabled: prevVersion !== undefined })

  if (page.isLoading) return null
  if (!page.data) return <NotFound what="Diese Seite" />
  const p = page.data

  const restore = async () => {
    try {
      await post(`/pages/${p.id}/revisions/${selected}/restore`)
      qc.invalidateQueries({ queryKey: qk.page(p.id) })
      qc.invalidateQueries({ queryKey: ['revisions', pageId] })
      toast.success(`Version ${selected} wiederhergestellt`)
      navigate(`/p/${p.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const titleChanged = cur.data && prev.data && cur.data.title !== prev.data.title
  return (
    <div style={spaceVars(p.space.color)} className="flex min-h-full flex-col">
      <TopBar space={p.space} crumbs={[{ label: p.title, icon: p.icon, to: `/p/${p.id}` }, { label: 'Versionen' }]} />
      <div className="grid flex-1 gap-0 md:grid-cols-[280px_1fr]">
        <aside className="border-b border-line md:border-r md:border-b-0">
          <ol className="max-h-[40vh] overflow-y-auto p-3 md:max-h-none" aria-label="Versionen">
            {list.isLoading ? <Skeleton className="h-12 w-full" /> : null}
            {list.data?.map((r, i) => (
              <li key={r.version}>
                <button
                  type="button"
                  onClick={() => setSelected(r.version)}
                  aria-current={r.version === selected}
                  className={cn('flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sunken', r.version === selected && 'bg-[var(--sc-soft)]')}
                >
                  <Avatar name={r.author?.name ?? '?'} size={26} />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium">
                      Version {r.version}{i === 0 ? <span className="ml-1.5 text-xs font-normal text-ink-subtle">aktuell</span> : null}
                    </span>
                    <span className="block text-xs text-ink-subtle" title={formatDateTime(r.created_at)}>
                      {r.author?.name ?? 'Unbekannt'}, {relativeTime(r.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <section className="min-w-0 p-5 sm:p-8">
          {cur.data ? (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Version {cur.data.version}</h1>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    {prevVersion ? `Änderungen gegenüber Version ${prevVersion}` : 'Erste Fassung der Seite'}
                    {titleChanged ? `. Titel geändert von „${prev.data!.title}“ zu „${cur.data.title}“` : ''}
                  </p>
                </div>
                {canEdit(p.my_level) && idx > 0 ? (
                  <Button onClick={() => setConfirm(true)}><RotateCcw />Diese Version wiederherstellen</Button>
                ) : null}
              </div>
              <DiffView parts={diffLines(prev.data?.content_md ?? '', cur.data.content_md)} />
            </>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </section>
      </div>
      <Confirm open={confirm} onOpenChange={setConfirm} title={`Version ${selected} wiederherstellen?`}
        description="Der Inhalt dieser Version wird zur neuen aktuellen Fassung. Die bisherigen Versionen bleiben erhalten."
        confirmLabel="Wiederherstellen" onConfirm={() => void restore()} />
    </div>
  )
}
