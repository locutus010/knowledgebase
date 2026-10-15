import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Code2, PenLine, Star, Type } from 'lucide-react'
import { ApiError, patch, put, del, upload } from '@/lib/api'
import { canEdit, qk, usePage } from '@/lib/queries'
import { spaceVars } from '@/lib/colors'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Attachment, Conflict, Page as PageT } from '@/lib/types'
import { TopBar } from '@/components/TopBar'
import { Button } from '@/components/ui/button'
import { Skeleton, Spinner, Tip } from '@/components/ui/misc'
import { Editor, type EditorMode } from '@/editor/Editor'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { EmojiPicker } from '@/components/EmojiPicker'
import { TagEditor, TagPills } from '@/components/TagPills'
import { TableOfContents } from '@/components/TableOfContents'
import { ConflictDialog } from '@/components/ConflictDialog'
import { PageMenu } from '@/components/PageMenu'
import { AttachmentsPanel, attachmentMarkdown } from '@/components/AttachmentsPanel'
import { NotFound } from './NotFound'

type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error'
const AUTOSAVE_MS = 1500
const MODE_KEY = 'kb-editor-mode'

function newEditSession(): string {
  // randomUUID gibt es nur in sicheren Kontexten (HTTPS, localhost) — im LAN per HTTP nicht.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function readMode(): EditorMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'wysiwyg'
  } catch {
    return 'wysiwyg'
  }
}

export default function PageView() {
  const { pageId } = useParams()
  const page = usePage(pageId)
  if (page.isLoading) return <PageSkeleton />
  if (page.error || !page.data) return <NotFound what="Diese Seite" />
  // key: beim Wechsel der Seite alles frisch — kein Entwurf wandert mit.
  return <PageBody key={page.data.id} page={page.data} />
}

function PageBody({ page }: { page: PageT }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const editable = canEdit(page.my_level)
  const location = useLocation()
  const [editing, setEditing] = useState(() => editable && !!(location.state as { edit?: boolean } | null)?.edit)
  // Den Wunsch „gleich bearbeiten“ nur einmal einlösen — sonst steht er in der Historie und
  // jedes Neuladen öffnete die Seite wieder im Bearbeitungsmodus.
  useEffect(() => {
    if ((location.state as { edit?: boolean } | null)?.edit) navigate(location.pathname, { replace: true, state: null })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setModeState] = useState<EditorMode>(readMode)
  const [title, setTitle] = useState(page.title)
  const [icon, setIcon] = useState(page.icon)
  const [content, setContent] = useState(page.content_md)
  const [tags, setTags] = useState(page.tags)
  const [state, setState] = useState<SaveState>('saved')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [favorite, setFavorite] = useState(page.is_favorite)
  const [articleEl, setArticleEl] = useState<HTMLElement | null>(null)

  const base = useRef(page.version)
  // Eine Kennung je Bearbeitungsrunde: alles Autospeichern zwischen „Bearbeiten“ und „Fertig“
  // wird eine Version, die nächste Runde eine neue.
  const editSession = useRef(newEditSession())
  const startEditing = () => {
    editSession.current = newEditSession()
    setEditing(true)
  }
  const draft = useRef({ title, content, icon })
  draft.current = { title, content, icon }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inflight = useRef(false)

  useEffect(() => {
    document.title = `${page.title} · Wissensdatenbank`
  }, [page.title])

  const setMode = (m: EditorMode) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* egal */
    }
  }

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    if (inflight.current) {
      timer.current = setTimeout(() => void save(), 300)
      return
    }
    const d = draft.current
    if (!d.title.trim()) return setState('dirty')
    inflight.current = true
    setState('saving')
    try {
      const saved = await patch<PageT>(`/pages/${page.id}`, {
        base_version: base.current, title: d.title.trim(), content_md: d.content, icon: d.icon,
        edit_session: editSession.current,
      })
      base.current = saved.version
      qc.setQueryData(qk.page(page.id), saved)
      qc.invalidateQueries({ queryKey: qk.tree(page.space.slug) })
      qc.invalidateQueries({ queryKey: qk.home })
      const changedSince = draft.current !== d && JSON.stringify(draft.current) !== JSON.stringify(d)
      setState(changedSince ? 'dirty' : 'saved')
      if (changedSince) timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(e.data.current as Conflict)
        setState('conflict')
      } else {
        setState('error')
        if (!(e instanceof ApiError) || e.status === 0) timer.current = setTimeout(() => void save(), 5000)
        else toast.error(e.message)
      }
    } finally {
      inflight.current = false
    }
  }, [page.id, page.space.slug, qc])

  const touch = () => {
    if (state === 'conflict') return
    setState('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }

  // ⌘S speichert sofort, Verlassen mit ungespeicherten Änderungen fragt nach.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (editing) void save()
      }
    }
    const onUnload = (e: BeforeUnloadEvent) => {
      if (stateRef.current !== 'saved') e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [editing, save])
  const stateRef = useRef(state)
  stateRef.current = state

  // Neue Fassung vom Server übernehmen, solange hier nichts Eigenes ansteht — etwa wenn jemand
  // anderes gespeichert hat oder eine Version wiederhergestellt wurde. Wer gerade schreibt,
  // behält seinen Entwurf; das Zusammenführen übernimmt dann der Konfliktdialog.
  useEffect(() => {
    if (page.version === base.current || stateRef.current !== 'saved' || editing) return
    base.current = page.version
    setTitle(page.title)
    setContent(page.content_md)
    setIcon(page.icon)
    setTags(page.tags)
    setFavorite(page.is_favorite)
  }, [page, editing])

  // Beim Verlassen der Seite innerhalb der App noch ausstehende Änderungen senden.
  useEffect(() => () => {
    if (stateRef.current === 'dirty' || stateRef.current === 'error') void save()
  }, [save])

  const saveTags = async (next: string[]) => {
    const prev = tags
    setTags(next)
    try {
      const saved = await put<string[]>(`/pages/${page.id}/tags`, { tags: next })
      setTags(saved)
      qc.invalidateQueries({ queryKey: ['tags', page.space.slug] })
    } catch (e) {
      setTags(prev)
      toast.error((e as Error).message)
    }
  }

  const toggleFavorite = async () => {
    const next = !favorite
    setFavorite(next)
    try {
      await (next ? put(`/me/favorites/${page.id}`) : del(`/me/favorites/${page.id}`))
      qc.invalidateQueries({ queryKey: qk.home })
      toast.success(next ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt')
    } catch (e) {
      setFavorite(!next)
      toast.error((e as Error).message)
    }
  }

  const editorRef = useRef<TiptapEditor | null>(null)
  // Im Editor eingefügte Dateien gehören nur zum Text — nicht in den Abschnitt „Anhänge“.
  const uploader = (file: File) => upload<Attachment>(`/pages/${page.id}/attachments?listed=false`, file)
  const insertAttachment = (a: Attachment) => {
    const ed = editorRef.current
    if (mode === 'wysiwyg' && ed) {
      const node = a.mime_type.match(/^image\/(png|jpeg|gif|webp)$/)
        ? { type: 'image', attrs: { src: a.url, alt: a.filename } }
        : { type: 'paragraph', content: [{ type: 'text', text: a.filename, marks: [{ type: 'link', attrs: { href: a.url } }] }] }
      ed.chain().focus().insertContent(node).run()
    } else {
      setContent((c) => `${c.trimEnd()}\n\n${attachmentMarkdown(a)}\n`)
      touch()
    }
  }

  const finishEditing = async () => {
    if (state === 'dirty' || state === 'error') await save()
    setEditing(false)
  }

  const crumbs = [
    ...page.breadcrumbs.map((b) => ({ label: b.title, icon: b.icon, to: `/p/${b.id}` })),
    { label: title || 'Ohne Titel', icon },
  ]

  return (
    <div style={spaceVars(page.space.color)} className="flex min-h-full flex-col">
      <TopBar
        space={page.space}
        crumbs={crumbs}
        actions={
          <>
            {editing ? <SaveIndicator state={state} onRetry={() => void save()} /> : null}
            {editing ? (
              <div className="mr-1 hidden rounded-lg border border-line p-0.5 sm:flex" role="group" aria-label="Editor-Modus">
                <Tip label="Formatiert schreiben">
                  <button type="button" aria-pressed={mode === 'wysiwyg'} onClick={() => setMode('wysiwyg')}
                    className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-ink-muted', mode === 'wysiwyg' && 'bg-sunken text-ink')}>
                    <Type className="size-3.5" />Visuell
                  </button>
                </Tip>
                <Tip label="Markdown-Quelltext">
                  <button type="button" aria-pressed={mode === 'markdown'} onClick={() => setMode('markdown')}
                    className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-ink-muted', mode === 'markdown' && 'bg-sunken text-ink')}>
                    <Code2 className="size-3.5" />Markdown
                  </button>
                </Tip>
              </div>
            ) : null}
            <Tip label={favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}>
              <Button variant="ghost" size="icon" onClick={toggleFavorite} aria-pressed={favorite} aria-label="Favorit">
                <Star className={cn(favorite && 'fill-[var(--sp-amber)] text-[var(--sp-amber)]')} />
              </Button>
            </Tip>
            {editable ? (
              editing ? (
                <Button variant="primary" size="sm" onClick={() => void finishEditing()}>
                  <Check />
                  Fertig
                </Button>
              ) : (
                <Button size="sm" onClick={startEditing}>
                  <PenLine />
                  Bearbeiten
                </Button>
              )
            ) : null}
            <PageMenu page={page} onTrashed={() => navigate(`/s/${page.space.slug}`)} />
          </>
        }
      />

      <div className="flex flex-1 justify-center gap-12 px-5 pt-10 pb-32 sm:px-10 print-full">
        <article className="w-full max-w-[720px] min-w-0">
          <div className="mb-5 h-1 w-14 rounded-full bg-[var(--sc)] no-print" aria-hidden />
          <header className="mb-8">
            {editing ? (
              <EmojiPicker value={icon} onChange={(v) => { setIcon(v); touch() }}>
                <button type="button" className="mb-2 rounded-lg px-1 text-[40px] leading-none hover:bg-sunken" aria-label="Symbol der Seite wählen">
                  {icon || <span className="text-[14px] text-ink-subtle">+ Symbol</span>}
                </button>
              </EmojiPicker>
            ) : icon ? (
              <div className="mb-2 text-[40px] leading-none" aria-hidden>{icon}</div>
            ) : null}
            {editing ? (
              <TitleInput value={title} onChange={(v) => { setTitle(v); touch() }} />
            ) : (
              <h1 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.028em] text-balance sm:text-[40px]">{title}</h1>
            )}
            <div className="mt-4 flex flex-col gap-3">
              {editing ? (
                <TagEditor tags={tags} slug={page.space.slug} onChange={(t) => void saveTags(t)} />
              ) : (
                <TagPills tags={tags} slug={page.space.slug} />
              )}
              <p className="text-[13px] text-ink-subtle">
                {page.updated_by ? `Zuletzt geändert von ${page.updated_by.name}, ` : 'Zuletzt geändert '}
                <time dateTime={page.updated_at} title={new Date(page.updated_at).toLocaleString('de-DE')}>{relativeTime(page.updated_at)}</time>
              </p>
            </div>
          </header>

          <div ref={setArticleEl}>
            {!editing && !content.trim() ? (
              <p className="text-[15px] text-ink-subtle">
                Diese Seite ist noch leer.{editable ? ' Mit „Bearbeiten“ füllst du sie.' : ''}
              </p>
            ) : (
              <Editor
                value={content}
                onChange={(md) => { setContent(md); touch() }}
                mode={editing ? mode : 'wysiwyg'}
                editable={editing}
                onUpload={editable ? uploader : undefined}
                onReady={(ed) => { editorRef.current = ed }}
              />
            )}
          </div>

          <AttachmentsPanel pageId={page.id} editable={editable} editing={editing} content={content}
            onInsert={editing ? insertAttachment : undefined} />
        </article>

        <aside className="no-print sticky top-24 hidden h-fit w-56 shrink-0 xl:block">
          {!editing || mode === 'wysiwyg' ? <TableOfContents root={articleEl} version={`${content}|${editing}`} /> : null}
        </aside>
      </div>

      {!editing && editable ? (
        <div className="no-print fixed right-5 bottom-5 sm:hidden">
          <Button variant="primary" size="lg" className="rounded-full shadow-pop" onClick={startEditing}>
            <PenLine />Bearbeiten
          </Button>
        </div>
      ) : null}

      <ConflictDialog
        conflict={conflict}
        mine={content}
        onClose={() => setConflict(null)}
        onKeepMine={() => {
          if (!conflict) return
          base.current = conflict.version
          setConflict(null)
          setState('dirty')
          void save()
        }}
        onTakeTheirs={() => {
          if (!conflict) return
          base.current = conflict.version
          setTitle(conflict.title)
          setContent(conflict.content_md)
          setConflict(null)
          setState('saved')
          qc.invalidateQueries({ queryKey: qk.page(page.id) })
        }}
      />
    </div>
  )
}

function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={200}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(document.querySelector('.ProseMirror') as HTMLElement | null)?.focus()
        }
      }}
      placeholder="Titel der Seite"
      aria-label="Titel"
      className={cn(
        'w-full resize-none overflow-hidden bg-transparent text-[34px] leading-[1.15] font-semibold tracking-[-0.028em] outline-none placeholder:text-ink-subtle sm:text-[40px]',
        !value.trim() && 'placeholder:text-danger/60',
      )}
    />
  )
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const map: Record<SaveState, { label: string; tone: string }> = {
    saved: { label: 'Gespeichert', tone: 'text-ink-subtle' },
    dirty: { label: 'Ungespeichert', tone: 'text-ink-subtle' },
    saving: { label: 'Speichert…', tone: 'text-ink-subtle' },
    conflict: { label: 'Konflikt', tone: 'text-warn' },
    error: { label: 'Nicht gespeichert', tone: 'text-danger' },
  }
  const s = map[state]
  return (
    <span role="status" aria-live="polite" className={cn('mr-2 hidden items-center gap-1.5 text-[12.5px] md:inline-flex', s.tone)}>
      {state === 'saving' ? <Spinner className="size-3" /> : state === 'saved' ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
      {state === 'error' ? (
        <button type="button" onClick={onRetry} className="underline underline-offset-2">Nicht gespeichert, erneut versuchen</button>
      ) : s.label}
    </span>
  )
}

function PageSkeleton() {
  return (
    <div>
      <div className="h-14 border-b border-line" />
      <div className="mx-auto max-w-[720px] px-5 pt-14">
        <Skeleton className="mb-6 h-1 w-14" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-4 h-4 w-48" />
        <div className="mt-10 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  )
}

