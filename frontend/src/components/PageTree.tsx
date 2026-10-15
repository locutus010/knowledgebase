import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useMatch, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { post } from '@/lib/api'
import { canEdit, qk, useTree } from '@/lib/queries'
import { applyDrop, buildTree, computeDrop, pathTo, type Node, type Zone } from '@/lib/tree'
import { cn } from '@/lib/utils'
import type { Space, TreeNode } from '@/lib/types'
import { Skeleton } from './ui/misc'

const STORAGE = (slug: string) => `kb-tree-open:${slug}`

function loadOpen(slug: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE(slug)) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveOpen(slug: string, open: Set<string>) {
  try {
    localStorage.setItem(STORAGE(slug), JSON.stringify([...open]))
  } catch {
    /* ohne Speicher eben nur für diese Sitzung */
  }
}

export function PageTree({ space }: { space: Space }) {
  const tree = useTree(space.slug)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const current = useMatch('/p/:pageId/*')?.params.pageId
  const editable = canEdit(space.my_level)
  const [open, setOpen] = useState<Set<string>>(() => loadOpen(space.slug))
  const [drag, setDrag] = useState<{ id: string; target?: string; zone?: Zone } | null>(null)
  const rootRef = useRef<HTMLUListElement>(null)

  useEffect(() => setOpen(loadOpen(space.slug)), [space.slug])

  // Den Weg zur geöffneten Seite immer aufklappen.
  useEffect(() => {
    if (!current || !tree.data) return
    const path = pathTo(tree.data, current)
    if (path.some((id) => !open.has(id))) {
      const next = new Set(open)
      path.forEach((id) => next.add(id))
      setOpen(next)
      saveOpen(space.slug, next)
    }
  }, [current, tree.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const roots = useMemo(() => buildTree(tree.data ?? []), [tree.data])

  const move = useMutation({
    mutationFn: (v: { id: string; parent_id: string | null; position: number }) =>
      post(`/pages/${v.id}/move`, { parent_id: v.parent_id, position: v.position }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.tree(space.slug) })
      const before = qc.getQueryData<TreeNode[]>(qk.tree(space.slug))
      if (before) qc.setQueryData(qk.tree(space.slug), applyDrop(before, v.id, v))
      return { before }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(qk.tree(space.slug), ctx.before)
      toast.error((err as Error).message)
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.tree(space.slug) })
      qc.invalidateQueries({ queryKey: qk.page(v.id) })
    },
  })

  const toggle = (id: string, value?: boolean) => {
    const next = new Set(open)
    if (value ?? !next.has(id)) next.add(id)
    else next.delete(id)
    setOpen(next)
    saveOpen(space.slug, next)
  }

  function zoneOf(e: DragEvent<HTMLElement>): Zone {
    const r = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside'
  }

  function onDrop(e: DragEvent<HTMLElement>, target: Node) {
    e.preventDefault()
    if (!drag || !tree.data) return setDrag(null)
    const drop = computeDrop(tree.data, drag.id, target.id, zoneOf(e))
    setDrag(null)
    if (!drop) return
    if (drop.parent_id) toggle(drop.parent_id, true)
    move.mutate({ id: drag.id, ...drop })
  }

  // Tastatur: Pfeile bewegen den Fokus durch die sichtbaren Einträge (WAI-ARIA Treeview).
  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"] > div > a') ?? [])
    const idx = items.indexOf(document.activeElement as HTMLElement)
    if (idx < 0) return
    const li = items[idx].closest('[role="treeitem"]') as HTMLElement
    const id = li.dataset.id!
    const expanded = li.getAttribute('aria-expanded')
    if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus()
    else if (e.key === 'ArrowUp') items[Math.max(idx - 1, 0)]?.focus()
    else if (e.key === 'ArrowRight') {
      if (expanded === 'false') toggle(id, true)
      else if (expanded === 'true') items[idx + 1]?.focus()
    } else if (e.key === 'ArrowLeft') {
      if (expanded === 'true') toggle(id, false)
      else (li.parentElement?.closest('[role="treeitem"]')?.querySelector(':scope > div > a') as HTMLElement | null)?.focus()
    } else return
    e.preventDefault()
  }

  if (tree.isLoading) {
    return (
      <div className="space-y-2 py-2 pl-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    )
  }
  if (!roots.length) return <p className="px-2 py-1.5 text-[13px] text-ink-subtle">Noch keine Seiten.</p>

  const render = (nodes: Node[], depth: number) =>
    nodes.map((node) => {
      const isOpen = open.has(node.id)
      const hasKids = node.children.length > 0
      const isCurrent = node.id === current
      const hint = drag?.target === node.id ? drag.zone : undefined
      return (
        <li key={node.id} role="treeitem" data-id={node.id} aria-expanded={hasKids ? isOpen : undefined} aria-selected={isCurrent}>
          <div
            draggable={editable}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', node.id)
              setDrag({ id: node.id })
            }}
            onDragOver={(e) => {
              if (!drag || drag.id === node.id) return
              e.preventDefault()
              const zone = zoneOf(e)
              if (drag.target !== node.id || drag.zone !== zone) setDrag({ ...drag, target: node.id, zone })
            }}
            onDragLeave={() => drag?.target === node.id && setDrag({ id: drag.id })}
            onDrop={(e) => onDrop(e, node)}
            onDragEnd={() => setDrag(null)}
            className={cn(
              'group relative flex h-[30px] items-center rounded-md pr-1 text-[13.5px] transition-colors',
              isCurrent ? 'bg-[var(--sc-soft)] font-medium text-[var(--sc-ink)]' : 'text-ink-muted hover:bg-line/60 hover:text-ink',
              hint === 'inside' && 'ring-2 ring-[var(--sc)] ring-inset',
              drag?.id === node.id && 'opacity-40',
            )}
            style={{ paddingLeft: depth * 14 + 2 }}
          >
            {hint === 'before' || hint === 'after' ? (
              <span className={cn('pointer-events-none absolute right-1 left-1 h-0.5 rounded bg-[var(--sc)]', hint === 'before' ? '-top-px' : '-bottom-px')} />
            ) : null}
            <button
              type="button"
              tabIndex={-1}
              aria-label={isOpen ? 'Zuklappen' : 'Aufklappen'}
              onClick={() => toggle(node.id)}
              className={cn('flex size-5 shrink-0 items-center justify-center rounded text-ink-subtle hover:bg-line', !hasKids && 'invisible')}
            >
              <ChevronRight className={cn('size-3.5 transition-transform duration-150', isOpen && 'rotate-90')} />
            </button>
            <a
              href={`/p/${node.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return
                e.preventDefault()
                navigate(`/p/${node.id}`)
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 pl-0.5 outline-offset-0"
            >
              {node.icon ? <span className="w-4 shrink-0 text-center text-[13px] leading-none">{node.icon}</span> : <FileText className="size-3.5 shrink-0 opacity-60" />}
              <span className="truncate">{node.title}</span>
            </a>
            {editable ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Unterseite in ${node.title} anlegen`}
                onClick={() => navigate(`/s/${space.slug}/new?parent=${node.id}`)}
                className="hidden size-5 shrink-0 items-center justify-center rounded text-ink-subtle group-hover:flex hover:bg-line hover:text-ink"
              >
                <Plus className="size-3.5" />
              </button>
            ) : null}
          </div>
          {hasKids && isOpen ? <ul role="group">{render(node.children, depth + 1)}</ul> : null}
        </li>
      )
    })

  return (
    <ul ref={rootRef} role="tree" aria-label="Seiten" onKeyDown={onKeyDown} className="py-1">
      {render(roots, 0)}
    </ul>
  )
}
