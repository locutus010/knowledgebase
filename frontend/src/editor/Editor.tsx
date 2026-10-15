import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor as TEditor } from '@tiptap/core'
import { toast } from 'sonner'
import { buildExtensions } from './extensions'
import { SlashCommand } from './SlashMenu'
import { BubbleToolbar } from './BubbleToolbar'
import { MarkdownSource } from './MarkdownSource'

export type EditorMode = 'wysiwyg' | 'markdown'
export type Uploader = (file: File) => Promise<{ url: string; mime_type: string; filename: string }>

interface Props {
  value: string
  onChange: (md: string) => void
  mode: EditorMode
  editable: boolean
  onUpload?: Uploader
  onReady?: (editor: TEditor) => void
}

/** Ein Editor für beides: Lesen (editable=false) und Schreiben. Gespeichert wird immer Markdown. */
export function Editor({ value, onChange, mode, editable, onUpload, onReady }: Props) {
  const lastEmitted = useRef(value)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadRef = useRef(onUpload)
  uploadRef.current = onUpload

  const extensions = useMemo(() => [...buildExtensions(), SlashCommand], [])

  async function insertFiles(editor: TEditor, files: File[], pos?: number) {
    const upload = uploadRef.current
    if (!upload) return
    for (const file of files) {
      const id = toast.loading(`${file.name} wird hochgeladen…`)
      try {
        const att = await upload(file)
        const node = att.mime_type.startsWith('image/')
          ? { type: 'image', attrs: { src: att.url, alt: att.filename } }
          : { type: 'paragraph', content: [{ type: 'text', text: att.filename, marks: [{ type: 'link', attrs: { href: att.url } }] }] }
        if (pos !== undefined) editor.chain().focus().insertContentAt(pos, node).run()
        else editor.chain().focus().insertContent(node).run()
        toast.success(`${file.name} eingefügt`, { id })
      } catch (e) {
        toast.error((e as Error).message, { id })
      }
    }
  }

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'prose-kb', 'aria-label': 'Seiteninhalt' },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (moved || !files.length || !uploadRef.current) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertFiles(editorRef.current!, files, pos)
        return true
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (!files.length || !uploadRef.current) return false
        event.preventDefault()
        void insertFiles(editorRef.current!, files)
        return true
      },
    },
    onUpdate: ({ editor: e }) => {
      if (!e.isEditable) return
      const md = e.getMarkdown()
      if (md === lastEmitted.current) return
      lastEmitted.current = md
      onChange(md)
    },
  })
  const editorRef = useRef<TEditor | null>(null)
  editorRef.current = editor

  useEffect(() => {
    if (editor) onReady?.(editor)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // emitUpdate=false: sonst feuert schon das Umschalten in den Bearbeitungsmodus ein
    // Update, und die Seite würde ohne jede Änderung gespeichert.
    editor?.setEditable(editable, false)
  }, [editor, editable])

  // Inhalt von außen (anderer Modus, Versionswechsel, Konfliktlösung) übernehmen.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return
    lastEmitted.current = value
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }, [editor, value])

  // Datei-Auswahl aus dem Slash-Menü
  useEffect(() => {
    const dom = editor?.view.dom
    if (!dom) return
    const pick = () => fileInput.current?.click()
    dom.addEventListener('kb:pick-file', pick)
    return () => dom.removeEventListener('kb:pick-file', pick)
  }, [editor])

  if (mode === 'markdown') {
    return (
      <MarkdownSource
        value={value}
        editable={editable}
        onChange={(md) => {
          if (md !== value) onChange(md)
        }}
      />
    )
  }

  // Klick unter den Text: weiterschreiben am Ende. Endet die Seite mit Tabelle oder Codeblock,
  // käme man sonst mit der Maus nicht dahinter.
  const focusEnd = () => {
    if (!editor) return
    const last = editor.state.doc.lastChild
    if (last?.type.name === 'paragraph' && last.content.size === 0) editor.commands.focus('end')
    else editor.chain().insertContentAt(editor.state.doc.content.size, { type: 'paragraph' }).focus('end').run()
  }

  return (
    <>
      <EditorContent editor={editor} />
      {editable ? (
        <div
          data-testid="editor-end"
          aria-hidden
          className="h-28 cursor-text"
          onMouseDown={(e) => {
            e.preventDefault()
            focusEnd()
          }}
        />
      ) : null}
      {editor && editable ? <BubbleToolbar editor={editor} /> : null}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (editor && files.length) void insertFiles(editor, files)
        }}
      />
    </>
  )
}
