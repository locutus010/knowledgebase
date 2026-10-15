import type { TreeNode } from './types'

export type Node = TreeNode & { children: Node[] }
export type Zone = 'before' | 'inside' | 'after'

export function buildTree(flat: TreeNode[]): Node[] {
  const byId = new Map<string, Node>(flat.map((t) => [t.id, { ...t, children: [] }]))
  const roots: Node[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  const sort = (list: Node[]) => {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'de'))
    list.forEach((c) => sort(c.children))
  }
  sort(roots)
  return roots
}

/** Ist candidate gleich ancestor oder liegt darunter? */
export function isDescendant(flat: TreeNode[], ancestorId: string, candidateId: string): boolean {
  const parent = new Map(flat.map((t) => [t.id, t.parent_id]))
  let cur: string | null | undefined = candidateId
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === ancestorId) return true
    seen.add(cur)
    cur = parent.get(cur)
  }
  return false
}

/** Ids der Vorfahren von oben nach unten, ohne die Seite selbst. */
export function pathTo(flat: TreeNode[], id: string): string[] {
  const parent = new Map(flat.map((t) => [t.id, t.parent_id]))
  const out: string[] = []
  let cur = parent.get(id) ?? null
  while (cur && !out.includes(cur)) {
    out.unshift(cur)
    cur = parent.get(cur) ?? null
  }
  return out
}

export function computeDrop(flat: TreeNode[], dragId: string, targetId: string, zone: Zone) {
  if (isDescendant(flat, dragId, targetId)) return null
  const target = flat.find((t) => t.id === targetId)
  if (!target) return null
  const siblingsOf = (parentId: string | null) =>
    flat.filter((t) => t.parent_id === parentId && t.id !== dragId).sort((a, b) => a.position - b.position)
  if (zone === 'inside') return { parent_id: target.id, position: siblingsOf(target.id).length }
  const siblings = siblingsOf(target.parent_id)
  const idx = siblings.findIndex((s) => s.id === targetId)
  return { parent_id: target.parent_id, position: zone === 'before' ? idx : idx + 1 }
}

/** Optimistische Vorschau: wendet einen Drop lokal an, wie es das Backend tun wird. */
export function applyDrop(flat: TreeNode[], dragId: string, drop: { parent_id: string | null; position: number }): TreeNode[] {
  const dragged = flat.find((t) => t.id === dragId)
  if (!dragged) return flat
  const oldParent = dragged.parent_id
  const rest = flat.filter((t) => t.id !== dragId)
  const siblings = rest.filter((t) => t.parent_id === drop.parent_id).sort((a, b) => a.position - b.position)
  siblings.splice(drop.position, 0, { ...dragged, parent_id: drop.parent_id })
  const pos = new Map(siblings.map((s, i) => [s.id, i]))
  const old = rest.filter((t) => t.parent_id === oldParent && oldParent !== drop.parent_id).sort((a, b) => a.position - b.position)
  old.forEach((s, i) => pos.set(s.id, i))
  return [...rest, { ...dragged, parent_id: drop.parent_id }].map((t) => ({
    ...t,
    position: pos.get(t.id) ?? t.position,
    has_children: t.id === drop.parent_id ? true : t.has_children,
  }))
}
