import { Node, mergeAttributes } from '@tiptap/core'

export const CALLOUT_KINDS = ['note', 'tip', 'warning', 'danger'] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: { setCallout: (kind: CalloutKind) => ReturnType }
  }
}

const OPEN = /^ {0,3}> ?\[!(NOTE|TIP|WARNING|DANGER)\][ \t]*(?:\n|$)/i

/** GitHub-Hinweisboxen: `> [!NOTE]` … als eigener Block mit Art. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'note',
        parseHTML: (el) => el.getAttribute('data-kind') ?? 'note',
        renderHTML: (attrs) => ({ 'data-kind': attrs.kind }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'callout' }), 0]
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => {
      const m = /(^|\n) {0,3}> ?\[!(NOTE|TIP|WARNING|DANGER)\]/i.exec(src)
      return m ? m.index + (m[1] ? 1 : 0) : -1
    },
    tokenize(src, _tokens, lexer) {
      const open = OPEN.exec(src)
      if (!open) return undefined
      let raw = open[0]
      const body: string[] = []
      for (const line of src.slice(raw.length).split('\n')) {
        if (!/^ {0,3}>/.test(line)) break
        raw += line + '\n'
        body.push(line.replace(/^ {0,3}> ?/, ''))
      }
      if (!raw.endsWith('\n') || !src.startsWith(raw)) raw = src.slice(0, raw.length)
      return { type: 'callout', raw, kind: open[1].toLowerCase(), tokens: lexer.blockTokens(body.join('\n')) }
    },
  },

  parseMarkdown(token, helpers) {
    const parse = helpers.parseBlockChildren ?? helpers.parseChildren
    const content = parse(token.tokens ?? [])
    return helpers.createNode('callout', { kind: token.kind }, content.length ? content : [{ type: 'paragraph' }])
  },

  renderMarkdown(node, h) {
    const kind = String(node.attrs?.kind ?? 'note').toUpperCase()
    // Jedes Kind ohne umgebende Leerzeilen, getrennt durch genau eine „>“-Leerzeile —
    // Tabellen liefern sonst eigene Leerzeilen mit, und es wüchse bei jedem Speichern.
    const blocks = (node.content ?? []).map((c: unknown, i: number) =>
      (h.renderChild?.(c as never, i) ?? h.renderChildren([c as never])).replace(/^\n+|\n+$/g, ''),
    )
    const body = blocks.map((b: string) => b.split('\n').map((l: string) => (l.trim() ? `> ${l}` : '>')).join('\n'))
    return `> [!${kind}]\n${body.join('\n>\n')}`
  },

  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { kind }),
    }
  },
})
