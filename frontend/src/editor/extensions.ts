import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Placeholder } from '@tiptap/extensions'
import { common, createLowlight } from 'lowlight'
import { Marked } from 'marked'
import type { AnyExtension } from '@tiptap/core'
import { Callout } from './Callout'

export const lowlight = createLowlight(common)

/** Eigene marked-Instanz je Editor: die Erweiterungen registrieren ihre Tokenizer darauf, und
 *  auf der globalen Instanz sammelten sie sich mit jedem neuen Editor an. HTML-Tokenizer sind
 *  abgeschaltet — `<script>` & Co. bleiben sichtbarer Text, nichts davon wird je ausgeführt. */
function safeMarked() {
  const m = new Marked({ gfm: true })
  m.use({ tokenizer: { html: () => undefined, tag: () => undefined } })
  return m
}

export function buildExtensions(opts: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false, // kein GFM — würde als ++text++ gespeichert
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: null } },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ inline: false }),
    Callout,
    Placeholder.configure({ placeholder: opts.placeholder ?? 'Schreib los, oder tippe / für Bausteine' }),
    // Typ-Cast: die Option ist als typeof marked deklariert, akzeptiert aber jede Marked-Instanz.
    Markdown.configure({ marked: safeMarked() as unknown as typeof import('marked').marked }),
  ]
}
