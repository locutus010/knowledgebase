import { useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { useEditorState } from '@tiptap/react'
import { Bold, Code, Heading2, Italic, Link2, Strikethrough, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'

function Btn({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink [&_svg]:size-4', active && 'bg-accent-soft text-accent-ink')}
    >
      {children}
    </button>
  )
}

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState('')
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), strike: e.isActive('strike'),
      code: e.isActive('code'), link: e.isActive('link'), h2: e.isActive('heading', { level: 2 }),
    }),
  })

  const applyLink = () => {
    const url = href.trim()
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^[a-z]+:|^\/|^#/i.test(url) ? url : `https://${url}` }).run()
    setLinking(false)
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, from, to }) => from !== to && !e.isActive('codeBlock') && !e.isActive('image')}
      options={{ placement: 'top', offset: 8 }}
      className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-pop"
    >
      {linking ? (
        <form onSubmit={(e) => { e.preventDefault(); applyLink() }} className="flex items-center gap-1">
          <input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setLinking(false)}
            placeholder="https://… oder /p/…"
            className="h-8 w-64 rounded-md bg-sunken px-2.5 text-[13px] outline-none"
          />
          <button type="submit" className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-on-accent">Setzen</button>
        </form>
      ) : (
        <>
          <Btn label="Fett (⌘B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold /></Btn>
          <Btn label="Kursiv (⌘I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic /></Btn>
          <Btn label="Durchgestrichen" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough /></Btn>
          <Btn label="Code" active={s.code} onClick={() => editor.chain().focus().toggleCode().run()}><Code /></Btn>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <Btn label="Überschrift" active={s.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 /></Btn>
          {s.link ? (
            <Btn label="Link entfernen" onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}><Unlink /></Btn>
          ) : (
            <Btn label="Link (⌘K im Text)" onClick={() => { setHref(editor.getAttributes('link').href ?? ''); setLinking(true) }}><Link2 /></Btn>
          )}
        </>
      )}
    </BubbleMenu>
  )
}
