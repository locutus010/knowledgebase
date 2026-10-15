import { useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  AlertTriangle, Bold, CheckSquare, ChevronDown, Code, Code2, Heading1, Heading2, Heading3, Image as ImageIcon,
  IndentDecrease, IndentIncrease, Info, Italic, Lightbulb, Link2, List, ListOrdered, Minus, OctagonAlert, Pilcrow,
  Quote, Redo2, RemoveFormatting, Strikethrough, Table as TableIcon, Undo2, Unlink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { Popover, PopoverContent, PopoverTrigger, Tip } from '@/components/ui/misc'
import { pickImage } from './SlashMenu'
import type { CalloutKind } from './Callout'

const LANGUAGES = [
  ['', 'Ohne Sprache'], ['bash', 'Shell'], ['python', 'Python'], ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'], ['json', 'JSON'], ['yaml', 'YAML'], ['sql', 'SQL'], ['xml', 'HTML/XML'],
  ['css', 'CSS'], ['go', 'Go'], ['java', 'Java'], ['csharp', 'C#'], ['php', 'PHP'], ['rust', 'Rust'],
  ['dockerfile', 'Dockerfile'], ['ini', 'INI/TOML'], ['markdown', 'Markdown'],
] as const

const CALLOUTS: { kind: CalloutKind; label: string; icon: ReactNode }[] = [
  { kind: 'note', label: 'Hinweis', icon: <Info /> },
  { kind: 'tip', label: 'Tipp', icon: <Lightbulb /> },
  { kind: 'warning', label: 'Warnung', icon: <AlertTriangle /> },
  { kind: 'danger', label: 'Gefahr', icon: <OctagonAlert /> },
]

function Btn({ label, shortcut, active, disabled, onClick, children }: {
  label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode
}) {
  return (
    <Tip label={shortcut ? `${label} (${shortcut})` : label} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[17px]',
          active && 'bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink',
        )}
      >
        {children}
      </button>
    </Tip>
  )
}

function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
}

function DropBtn({ label, active, children, wide }: { label: ReactNode; active?: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] text-ink-muted transition-colors hover:bg-sunken hover:text-ink data-[state=open]:bg-sunken [&_svg]:size-[17px]',
            wide && 'min-w-[120px] justify-between',
            active && 'bg-accent-soft text-accent-ink',
          )}
        >
          {label}
          <ChevronDown className="!size-3.5 opacity-60" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="min-w-48">
        {children}
      </MenuContent>
    </Menu>
  )
}

/** Feste Formatierleiste über dem Text — alles, was Markdown darstellen kann. */
export function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      undo: e.can().undo(),
      redo: e.can().redo(),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      callout: e.isActive('callout'),
      codeBlock: e.isActive('codeBlock'),
      language: (e.getAttributes('codeBlock').language as string | null) ?? '',
      table: e.isActive('table'),
      sink: e.can().sinkListItem('listItem') || e.can().sinkListItem('taskItem'),
      lift: e.can().liftListItem('listItem') || e.can().liftListItem('taskItem'),
    }),
  })
  const chain = () => editor.chain().focus()
  const blockLabel = s.h1 ? 'Überschrift 1' : s.h2 ? 'Überschrift 2' : s.h3 ? 'Überschrift 3' : 'Text'
  const listItem = s.task ? 'taskItem' : 'listItem'

  return (
    <div
      role="toolbar"
      aria-label="Formatierung"
      className="no-print sticky top-14 z-20 -mx-3 mb-6 flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-surface/95 px-1.5 py-1 shadow-[0_1px_0_rgb(0_0_0/0.03)] backdrop-blur-md"
    >
      <Btn label="Rückgängig" shortcut="⌘Z" disabled={!s.undo} onClick={() => chain().undo().run()}><Undo2 /></Btn>
      <Btn label="Wiederholen" shortcut="⌘⇧Z" disabled={!s.redo} onClick={() => chain().redo().run()}><Redo2 /></Btn>
      <Sep />

      <DropBtn label={blockLabel} wide>
        <MenuItem icon={<Pilcrow />} onSelect={() => chain().setParagraph().run()}>Text</MenuItem>
        <MenuItem icon={<Heading1 />} onSelect={() => chain().setHeading({ level: 1 }).run()}>Überschrift 1</MenuItem>
        <MenuItem icon={<Heading2 />} onSelect={() => chain().setHeading({ level: 2 }).run()}>Überschrift 2</MenuItem>
        <MenuItem icon={<Heading3 />} onSelect={() => chain().setHeading({ level: 3 }).run()}>Überschrift 3</MenuItem>
      </DropBtn>
      <Sep />

      <Btn label="Fett" shortcut="⌘B" active={s.bold} onClick={() => chain().toggleBold().run()}><Bold /></Btn>
      <Btn label="Kursiv" shortcut="⌘I" active={s.italic} onClick={() => chain().toggleItalic().run()}><Italic /></Btn>
      <Btn label="Durchgestrichen" shortcut="⌘⇧S" active={s.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough /></Btn>
      <Btn label="Code im Text" shortcut="⌘E" active={s.code} onClick={() => chain().toggleCode().run()}><Code /></Btn>
      <LinkButton editor={editor} active={s.link} />
      <Btn label="Formatierung entfernen" onClick={() => chain().unsetAllMarks().clearNodes().run()}><RemoveFormatting /></Btn>
      <Sep />

      <Btn label="Aufzählung" shortcut="⌘⇧8" active={s.bullet} onClick={() => chain().toggleBulletList().run()}><List /></Btn>
      <Btn label="Nummerierung" shortcut="⌘⇧7" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered /></Btn>
      <Btn label="Checkliste" shortcut="⌘⇧9" active={s.task} onClick={() => chain().toggleTaskList().run()}><CheckSquare /></Btn>
      <Btn label="Ausrücken" shortcut="⇧Tab" disabled={!s.lift} onClick={() => chain().liftListItem(listItem).run()}><IndentDecrease /></Btn>
      <Btn label="Einrücken" shortcut="Tab" disabled={!s.sink} onClick={() => chain().sinkListItem(listItem).run()}><IndentIncrease /></Btn>
      <Sep />

      <Btn label="Zitat" active={s.quote} onClick={() => chain().toggleBlockquote().run()}><Quote /></Btn>
      <DropBtn label={<><Info />Box</>} active={s.callout}>
        {CALLOUTS.map((c) => (
          <MenuItem key={c.kind} icon={c.icon} onSelect={() => (s.callout ? chain().updateAttributes('callout', { kind: c.kind }) : chain().setCallout(c.kind)).run()}>
            {c.label}
          </MenuItem>
        ))}
        {s.callout ? (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => chain().lift('callout').run()}>Box auflösen</MenuItem>
          </>
        ) : null}
      </DropBtn>
      <Btn label="Codeblock" shortcut="⌘⌥C" active={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}><Code2 /></Btn>
      {s.codeBlock ? (
        <DropBtn label={LANGUAGES.find(([v]) => v === s.language)?.[1] ?? s.language}>
          <MenuLabel>Sprache für die Hervorhebung</MenuLabel>
          {LANGUAGES.map(([v, l]) => (
            <MenuItem key={v} onSelect={() => chain().updateAttributes('codeBlock', { language: v || null }).run()}>{l}</MenuItem>
          ))}
        </DropBtn>
      ) : null}
      <Btn label="Trennlinie" onClick={() => chain().setHorizontalRule().run()}><Minus /></Btn>
      <Sep />

      <Btn label="Bild oder Datei hochladen" onClick={() => pickImage(editor)}><ImageIcon /></Btn>
      {s.table ? (
        <DropBtn label={<><TableIcon />Tabelle</>} active>
          <MenuItem onSelect={() => chain().addRowBefore().run()}>Zeile darüber einfügen</MenuItem>
          <MenuItem onSelect={() => chain().addRowAfter().run()}>Zeile darunter einfügen</MenuItem>
          <MenuItem onSelect={() => chain().addColumnBefore().run()}>Spalte links einfügen</MenuItem>
          <MenuItem onSelect={() => chain().addColumnAfter().run()}>Spalte rechts einfügen</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => chain().toggleHeaderRow().run()}>Kopfzeile ein/aus</MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={() => chain().deleteRow().run()}>Zeile löschen</MenuItem>
          <MenuItem danger onSelect={() => chain().deleteColumn().run()}>Spalte löschen</MenuItem>
          <MenuItem danger onSelect={() => chain().deleteTable().run()}>Tabelle löschen</MenuItem>
        </DropBtn>
      ) : (
        <Btn label="Tabelle einfügen" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon /></Btn>
      )}
    </div>
  )
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')
  const apply = () => {
    const url = href.trim()
    const c = editor.chain().focus().extendMarkRange('link')
    if (!url) c.unsetLink().run()
    else c.setLink({ href: /^[a-z]+:|^\/|^#/i.test(url) ? url : `https://${url}` }).run()
    setOpen(false)
  }
  if (active) {
    return (
      <Btn label="Link entfernen" active onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>
        <Unlink />
      </Btn>
    )
  }
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setHref(editor.getAttributes('link').href ?? '') }}>
      <Tip label="Link setzen" side="bottom">
        <PopoverTrigger asChild>
          <button type="button" aria-label="Link" onMouseDown={(e) => e.preventDefault()}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-sunken hover:text-ink [&_svg]:size-[17px]">
            <Link2 />
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent className="w-80">
        <form onSubmit={(e) => { e.preventDefault(); apply() }} className="flex gap-2">
          <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://… oder /p/…" aria-label="Linkziel"
            className="h-8 flex-1 rounded-md border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-accent" />
          <button type="submit" className="h-8 rounded-md bg-accent px-3 text-[13px] font-medium text-on-accent">Setzen</button>
        </form>
        {editor.state.selection.empty ? <p className="mt-2 text-xs text-ink-subtle">Markiere zuerst den Text, der zum Link werden soll.</p> : null}
      </PopoverContent>
    </Popover>
  )
}
