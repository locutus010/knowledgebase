import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Extension, type Editor, type Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import {
  AlertTriangle, CheckSquare, Code2, Heading1, Heading2, Heading3, Image as ImageIcon, Info, Lightbulb,
  List, ListOrdered, Minus, OctagonAlert, Pilcrow, Quote, Table as TableIcon, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SlashItem {
  title: string
  hint: string
  keywords: string
  icon: LucideIcon
  run: (editor: Editor, range: Range) => void
}

export const pickImage = (editor: Editor) => {
  editor.view.dom.dispatchEvent(new CustomEvent('kb:pick-file', { bubbles: true }))
}

export const SLASH_ITEMS: SlashItem[] = [
  { title: 'Text', hint: 'Normaler Absatz', keywords: 'absatz paragraph text', icon: Pilcrow, run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { title: 'Überschrift 1', hint: 'Großer Abschnitt', keywords: 'h1 titel heading', icon: Heading1, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { title: 'Überschrift 2', hint: 'Mittlerer Abschnitt', keywords: 'h2 heading', icon: Heading2, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { title: 'Überschrift 3', hint: 'Kleiner Abschnitt', keywords: 'h3 heading', icon: Heading3, run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { title: 'Aufzählung', hint: 'Liste mit Punkten', keywords: 'liste bullet ul', icon: List, run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { title: 'Nummerierung', hint: 'Liste mit Zahlen', keywords: 'liste nummer ol ordered', icon: ListOrdered, run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { title: 'Checkliste', hint: 'Aufgaben zum Abhaken', keywords: 'todo aufgabe task check', icon: CheckSquare, run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { title: 'Zitat', hint: 'Eingerückter Text', keywords: 'quote blockquote', icon: Quote, run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { title: 'Hinweis', hint: 'Box für Informationen', keywords: 'note info callout', icon: Info, run: (e, r) => e.chain().focus().deleteRange(r).setCallout('note').run() },
  { title: 'Tipp', hint: 'Box für Empfehlungen', keywords: 'tip callout', icon: Lightbulb, run: (e, r) => e.chain().focus().deleteRange(r).setCallout('tip').run() },
  { title: 'Warnung', hint: 'Box für Vorsicht', keywords: 'warning achtung callout', icon: AlertTriangle, run: (e, r) => e.chain().focus().deleteRange(r).setCallout('warning').run() },
  { title: 'Gefahr', hint: 'Box für Kritisches', keywords: 'danger fehler callout', icon: OctagonAlert, run: (e, r) => e.chain().focus().deleteRange(r).setCallout('danger').run() },
  { title: 'Codeblock', hint: 'Befehle oder Quelltext', keywords: 'code pre bash', icon: Code2, run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
  { title: 'Tabelle', hint: '3 × 3 mit Kopfzeile', keywords: 'table tabelle', icon: TableIcon, run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: 'Trennlinie', hint: 'Horizontale Linie', keywords: 'hr divider linie', icon: Minus, run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { title: 'Bild oder Datei', hint: 'Hochladen und einfügen', keywords: 'bild image datei upload anhang', icon: ImageIcon, run: (e, r) => { e.chain().focus().deleteRange(r).run(); pickImage(e) } },
]

export function filterItems(query: string): SlashItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter((i) => i.title.toLowerCase().includes(q) || i.keywords.includes(q))
}

interface ListHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}

const SlashList = forwardRef<ListHandle, SuggestionProps<SlashItem>>(({ items, command }, ref) => {
  const [active, setActive] = useState(0)
  useEffect(() => setActive(0), [items])
  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (!items.length) return false
      if (e.key === 'ArrowDown') { setActive((a) => (a + 1) % items.length); return true }
      if (e.key === 'ArrowUp') { setActive((a) => (a - 1 + items.length) % items.length); return true }
      if (e.key === 'Enter') { command(items[active]); return true }
      return false
    },
  }))
  if (!items.length) return <div className="px-3 py-2 text-sm text-ink-muted">Kein Baustein gefunden.</div>
  return (
    <div role="listbox" aria-label="Bausteine" className="max-h-80 w-72 overflow-y-auto">
      {items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          role="option"
          aria-selected={i === active}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => { e.preventDefault(); command(item) }}
          ref={(el) => { if (i === active) el?.scrollIntoView({ block: 'nearest' }) }}
          className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left', i === active && 'bg-sunken')}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-muted">
            <item.icon className="size-4" />
          </span>
          <span>
            <span className="block text-[13.5px] font-medium">{item.title}</span>
            <span className="block text-xs text-ink-subtle">{item.hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
})
SlashList.displayName = 'SlashList'

export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        startOfLine: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          return $from.parent.type.name !== 'codeBlock'
        },
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<ListHandle, SuggestionProps<SlashItem>> | null = null
          let box: HTMLDivElement | null = null
          const place = (props: SuggestionProps<SlashItem>) => {
            const rect = props.clientRect?.()
            if (!rect || !box) return
            const below = rect.bottom + 8
            const fitsBelow = below + 330 < window.innerHeight
            box.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`
            box.style.top = fitsBelow ? `${below}px` : `${Math.max(8, rect.top - 338)}px`
          }
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashList, { props, editor: props.editor })
              box = document.createElement('div')
              box.className = 'fixed z-50 rounded-xl border border-line bg-surface p-1 shadow-pop animate-in'
              box.appendChild(renderer.element)
              document.body.appendChild(box)
              place(props)
            },
            onUpdate: (props) => {
              renderer?.updateProps(props)
              place(props)
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                box?.remove()
                return true
              }
              return renderer?.ref?.onKeyDown(event) ?? false
            },
            onExit: () => {
              box?.remove()
              renderer?.destroy()
              box = null
              renderer = null
            },
          }
        },
      }),
    ]
  },
})
