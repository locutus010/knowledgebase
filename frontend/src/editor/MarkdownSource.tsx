import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { useTheme } from '@/lib/theme'

const atlas = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--ink)' },
  '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--accent)', padding: '4px 0', lineHeight: '1.7' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--accent-soft) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
})

export function MarkdownSource({ value, onChange, editable }: { value: string; onChange: (v: string) => void; editable: boolean }) {
  const { dark } = useTheme()
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      editable={editable}
      theme={dark ? 'dark' : 'light'}
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
      extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping, atlas]}
      className="min-h-[40vh] text-[14px]"
      aria-label="Markdown-Quelltext"
    />
  )
}
