import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { post } from '@/lib/api'
import { canEdit, qk, useSpaces, useTree } from '@/lib/queries'
import { buildTree, isDescendant, type Node } from '@/lib/tree'
import type { Page } from '@/lib/types'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Label } from './ui/input'
import { Select } from './ui/select'

const TOP = '__top__'

export function MovePageDialog({ page, onClose }: { page: Page; onClose: () => void }) {
  const qc = useQueryClient()
  const spaces = useSpaces()
  const [slug, setSlug] = useState(page.space.slug)
  const [parent, setParent] = useState<string>(page.parent_id ?? TOP)
  const tree = useTree(slug)
  const [busy, setBusy] = useState(false)

  const options = useMemo(() => {
    const flat = tree.data ?? []
    const out: { value: string; label: string }[] = [{ value: TOP, label: 'Oberste Ebene' }]
    const walk = (nodes: Node[], depth: number) =>
      nodes.forEach((n) => {
        if (slug === page.space.slug && isDescendant(flat, page.id, n.id)) return
        out.push({ value: n.id, label: `${' '.repeat(depth)}${n.icon ? n.icon + ' ' : ''}${n.title}` })
        walk(n.children, depth + 1)
      })
    walk(buildTree(flat), 0)
    return out
  }, [tree.data, slug, page.id, page.space.slug])

  const submit = async () => {
    setBusy(true)
    try {
      await post(`/pages/${page.id}/move`, {
        parent_id: parent === TOP ? null : parent,
        position: 1_000_000,
        space_slug: slug !== page.space.slug ? slug : undefined,
      })
      qc.invalidateQueries({ queryKey: ['tree'] })
      qc.invalidateQueries({ queryKey: qk.page(page.id) })
      qc.invalidateQueries({ queryKey: qk.spaces })
      toast.success('Seite verschoben')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const targets = (spaces.data ?? []).filter((s) => canEdit(s.my_level))
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Seite verschieben"
      description={slug !== page.space.slug ? 'Beim Wechsel des Bereichs gehen die Tags der Seite verloren; Unterseiten und Anhänge ziehen mit.' : 'Unterseiten ziehen mit.'}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>Verschieben</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Bereich</Label>
          <Select value={slug} onValueChange={(v) => { setSlug(v); setParent(TOP) }}
            options={targets.map((s) => ({ value: s.slug, label: `${s.icon} ${s.name}` }))} label="Bereich" />
        </div>
        <div>
          <Label>Unter</Label>
          <Select value={parent} onValueChange={setParent} options={options} label="Übergeordnete Seite" />
        </div>
      </div>
    </Dialog>
  )
}
