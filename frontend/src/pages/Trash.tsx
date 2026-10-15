import { useState } from 'react'
import { useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RotateCcw, Trash2 } from 'lucide-react'
import { del, get, post } from '@/lib/api'
import { qk, useSpace } from '@/lib/queries'
import { spaceVars } from '@/lib/colors'
import { relativeTime } from '@/lib/format'
import type { TrashItem } from '@/lib/types'
import { TopBar } from '@/components/TopBar'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/dialog'
import { NotFound } from './NotFound'

export default function Trash() {
  const { slug } = useParams()
  const space = useSpace(slug)
  const qc = useQueryClient()
  const items = useQuery({ queryKey: ['trash', slug], queryFn: () => get<TrashItem[]>(`/spaces/${slug}/trash`), enabled: !!slug })
  const [purging, setPurging] = useState<TrashItem | null>(null)

  if (space.isLoading) return null
  if (!space.data) return <NotFound what="Diesen Bereich" />
  const s = space.data
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['trash', slug] })
    qc.invalidateQueries({ queryKey: qk.tree(s.slug) })
    qc.invalidateQueries({ queryKey: qk.spaces })
  }
  const restore = async (t: TrashItem) => {
    try {
      await post(`/pages/${t.id}/restore`)
      toast.success(`„${t.title}“ wiederhergestellt`)
      refresh()
    } catch (e) { toast.error((e as Error).message) }
  }
  const purge = async (t: TrashItem) => {
    try {
      await del(`/pages/${t.id}/purge`)
      toast.success(`„${t.title}“ endgültig gelöscht`)
      refresh()
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div style={spaceVars(s.color)}>
      <TopBar space={s} crumbs={[{ label: 'Papierkorb' }]} />
      <div className="mx-auto max-w-[820px] px-5 pt-10 pb-24 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">Papierkorb</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Seiten hier sind aus Baum und Suche verschwunden. Unterseiten kommen beim Wiederherstellen mit.</p>
        <div className="mt-8">
          {items.data?.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {items.data.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-6 text-center">{t.icon || '📄'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{t.title}</span>
                    <span className="block text-xs text-ink-subtle">Gelöscht {relativeTime(t.deleted_at)}</span>
                  </span>
                  <Button size="sm" onClick={() => void restore(t)}><RotateCcw />Wiederherstellen</Button>
                  {s.my_level === 'manage' ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`${t.title} endgültig löschen`} onClick={() => setPurging(t)}><Trash2 /></Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : items.isLoading ? null : (
            <EmptyState icon={<Trash2 />} title="Der Papierkorb ist leer">Gelöschte Seiten landen zuerst hier.</EmptyState>
          )}
        </div>
      </div>
      <Confirm open={!!purging} onOpenChange={(o) => !o && setPurging(null)} danger confirmLabel="Endgültig löschen"
        title="Endgültig löschen?" description={`„${purging?.title}“, alle Unterseiten, Versionen und Anhänge werden gelöscht. Das lässt sich nicht rückgängig machen.`}
        onConfirm={() => purging && void purge(purging)} />
    </div>
  )
}
