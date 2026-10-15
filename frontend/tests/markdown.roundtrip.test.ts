import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '@/editor/extensions'
import { normalizeMd } from '@/editor/markdown'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function roundtrip(md: string): string {
  editor = new Editor({ extensions: buildExtensions(), content: md, contentType: 'markdown' })
  return editor.getMarkdown()
}

const CASES: Record<string, string> = {
  'Überschriften 1–3': '# Eins\n\n## Zwei\n\n### Drei',
  Hervorhebungen: 'Text mit **fett**, *kursiv*, ~~durchgestrichen~~ und `code`.',
  Link: 'Siehe [die Doku](https://example.org/doku).',
  'verschachtelte Liste': '- eins\n- zwei\n  - zwei a\n  - zwei b\n- drei',
  'nummerierte Liste': '1. erstens\n2. zweitens\n3. drittens',
  Checkliste: '- [ ] offen\n- [x] erledigt',
  Zitat: '> Ein kluger Satz.',
  'Codeblock mit Sprache': '```bash\necho "hallo"\nls -la\n```',
  Tabelle: '| Umgebung | URL |\n| --- | --- |\n| Staging | staging.example.org |\n| Produktion | example.org |',
  Trennlinie: 'oben\n\n---\n\nunten',
  Bild: '![Diagramm](/api/v1/attachments/0b0b0b0b-0000-4000-8000-000000000000)',
  'Hinweis NOTE': '> [!NOTE]\n> Zur Info.',
  'Hinweis TIP': '> [!TIP]\n> Ein Tipp mit **fett**.',
  'Hinweis WARNING': '> [!WARNING]\n> Nie freitags deployen.',
  'Hinweis mit Tabelle und Liste': '> [!TIP]\n> | A | B |\n> | --- | --- |\n> | 1 | 2 |\n>\n> - [ ] offen\n> - [x] zu',
  'Hinweis DANGER': '> [!DANGER]\n> Löscht alles.\n>\n> Zweiter Absatz.',
}

describe('Markdown übersteht den Weg durch den Editor', () => {
  for (const [name, md] of Object.entries(CASES)) {
    it(name, () => {
      expect(normalizeMd(roundtrip(md))).toBe(normalizeMd(md))
    })
  }

  it('gemischtes Dokument', () => {
    const md = Object.values(CASES).join('\n\n')
    expect(normalizeMd(roundtrip(md))).toBe(normalizeMd(md))
  })

  it('schreibt HTML als Entitäten zurück und bleibt danach stabil', () => {
    const once = roundtrip('Vorsicht <b>fett?</b> hier')
    editor?.destroy()
    expect(once).toBe('Vorsicht &lt;b&gt;fett?&lt;/b&gt; hier')
    expect(roundtrip(once)).toBe(once)
    expect(editor!.getText()).toBe('Vorsicht <b>fett?</b> hier')
  })

  it('führt HTML im Markdown nicht aus, sondern behält es als Text', () => {
    editor = new Editor({ extensions: buildExtensions(), content: 'Vorsicht <script>alert(1)</script> hier', contentType: 'markdown' })
    expect(editor.getHTML()).not.toContain('<script>')
    expect(editor.getText()).toContain('<script>alert(1)</script>')
  })
})
