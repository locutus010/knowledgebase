import { describe, expect, it } from 'vitest'
import { buildTree, computeDrop, isDescendant, pathTo } from '@/lib/tree'
import type { TreeNode } from '@/lib/types'

const n = (id: string, parent_id: string | null, position: number): TreeNode => ({
  id, parent_id, position, title: id.toUpperCase(), icon: '', has_children: false,
})

// a
// ├─ a1
// │  └─ a1x
// └─ a2
// b
const flat = [n('b', null, 1), n('a', null, 0), n('a2', 'a', 1), n('a1', 'a', 0), n('a1x', 'a1', 0)]

describe('buildTree', () => {
  it('nests and sorts by position', () => {
    const tree = buildTree(flat)
    expect(tree.map((x) => x.id)).toEqual(['a', 'b'])
    expect(tree[0].children.map((x) => x.id)).toEqual(['a1', 'a2'])
    expect(tree[0].children[0].children.map((x) => x.id)).toEqual(['a1x'])
  })

  it('treats orphans as top level instead of dropping them', () => {
    expect(buildTree([n('x', 'gibts-nicht', 0)]).map((x) => x.id)).toEqual(['x'])
  })
})

describe('isDescendant', () => {
  it('knows the subtree', () => {
    expect(isDescendant(flat, 'a', 'a1x')).toBe(true)
    expect(isDescendant(flat, 'a', 'a')).toBe(true)
    expect(isDescendant(flat, 'a1', 'a2')).toBe(false)
  })
})

describe('pathTo', () => {
  it('returns ancestor ids from the top', () => {
    expect(pathTo(flat, 'a1x')).toEqual(['a', 'a1'])
    expect(pathTo(flat, 'b')).toEqual([])
  })
})

describe('computeDrop', () => {
  it('drops before a sibling', () => {
    expect(computeDrop(flat, 'b', 'a', 'before')).toEqual({ parent_id: null, position: 0 })
  })
  it('drops after a sibling, ignoring the dragged node itself', () => {
    expect(computeDrop(flat, 'a1', 'a2', 'after')).toEqual({ parent_id: 'a', position: 1 })
  })
  it('drops inside as last child', () => {
    expect(computeDrop(flat, 'b', 'a', 'inside')).toEqual({ parent_id: 'a', position: 2 })
  })
  it('refuses to drop into its own subtree', () => {
    expect(computeDrop(flat, 'a', 'a1x', 'inside')).toBeNull()
    expect(computeDrop(flat, 'a', 'a1', 'before')).toBeNull()
    expect(computeDrop(flat, 'a', 'a', 'after')).toBeNull()
  })
})
