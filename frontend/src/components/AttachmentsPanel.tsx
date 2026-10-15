import { useRef, useState, type DragEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Download, File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Paperclip,
  Plus, TextCursorInput, Trash2,
} from 'lucide-react'
import { del, get, upload } from '@/lib/api'
import { formatBytes, formatDateTime, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Attachment } from '@/lib/types'
import { Button } from './ui/button'
import { Confirm } from './ui/dialog'
import { Spinner, Tip } from './ui/misc'

export const attachmentsKey = (pageId: string) => ['attachments', pageId] as const

const INLINE_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function iconFor(a: Attachment) {
  const m = a.mime_type
  const ext = a.filename.split('.').pop()?.toLowerCase() ?? ''
  if (m.startsWith('image/') || ext === 'svg') return FileImage
  if (m.startsWith('video/')) return FileVideo
  if (m.startsWith('audio/')) return FileAudio
  if (m === 'application/zip' || ['zip', 'gz', 'tar', '7z', 'rar'].includes(ext)) return FileArchive
  if (m.includes('spreadsheet') || m.includes('ms-excel') || ['csv', 'xlsx', 'ods'].includes(ext)) return FileSpreadsheet
  if (m === 'application/pdf' || m.startsWith('text/') || m.includes('word') || m.includes('opendocument.text')) return FileText
  return File
}

export function attachmentMarkdown(a: Attachment) {
  return INLINE_IMAGES.has(a.mime_type) ? `![${a.filename}](${a.url})` : `[${a.filename}](${a.url})`
}

/** Vorschaubild für Bilder; lässt es sich nicht laden, das Symbol des Dateityps. */
function Thumb({ attachment, Icon }: { attachment: Attachment; Icon: typeof File }) {
  const [failed, setFailed] = useState(false)
  if (INLINE_IMAGES.has(attachment.mime_type) && !failed) {
    return <img src={attachment.url} alt="" loading="lazy" onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-md border border-line object-cover" />
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[var(--sc-soft)] text-[var(--sc-ink)]">
      <Icon className="size-5" />
    </span>
  )
}

/** Anhänge einer Seite: Liste, Hochladen (auch ohne Bearbeitungsmodus), Löschen. */
export function AttachmentsPanel({ pageId, editable, editing, content, onInsert }: {
  pageId: string
  editable: boolean
  editing: boolean
  content: string
  onInsert?: (a: Attachment) => void
}) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: attachmentsKey(pageId), queryFn: () => get<Attachment[]>(`/pages/${pageId}/attachments`) })
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [deleting, setDeleting] = useState<Attachment | null>(null)
  const items = list.data ?? []

  const send = async (files: File[]) => {
    if (!files.length) return
    setBusy((b) => b + files.length)
    for (const f of files) {
      try {
        await upload<Attachment>(`/pages/${pageId}/attachments`, f)
        toast.success(`${f.name} angehängt`)
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`)
      } finally {
        setBusy((b) => b - 1)
      }
    }
    qc.invalidateQueries({ queryKey: attachmentsKey(pageId) })
  }

  const remove = async (a: Attachment) => {
    try {
      await del(`/attachments/${a.id}`)
      qc.invalidateQueries({ queryKey: attachmentsKey(pageId) })
      toast.success(`${a.filename} gelöscht`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const onDrop = (e: DragEvent) => {
    if (!editable) return
    e.preventDefault()
    setDragging(false)
    void send(Array.from(e.dataTransfer.files))
  }
  const dropProps = editable
    ? {
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDragging(true)
          }
        },
        onDragLeave: () => setDragging(false),
        onDrop,
      }
    : {}

  const picker = (
    <input ref={input} type="file" multiple hidden data-testid="attachment-input" onChange={(e) => {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''
      void send(files)
    }} />
  )

  // Leer: Leser sehen nichts, Schreibende im Lesemodus nur einen leisen Einstieg.
  if (!items.length && !busy && !editing) {
    if (!editable || list.isLoading) return null
    return (
      <div className="no-print mt-12" {...dropProps}>
        {picker}
        <button type="button" onClick={() => input.current?.click()}
          className={cn('inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-ink-subtle transition-colors hover:bg-sunken hover:text-ink',
            dragging && 'bg-[var(--sc-soft)] text-[var(--sc-ink)]')}>
          <Paperclip className="size-3.5" />
          {dragging ? 'Loslassen zum Anhängen' : 'Datei anhängen'}
        </button>
      </div>
    )
  }

  return (
    <section aria-labelledby="attachments-h" className="mt-14" {...dropProps}>
      {picker}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="attachments-h" className="flex items-center gap-2 text-[15px] font-semibold">
          <Paperclip className="size-4 text-ink-subtle" />
          Anhänge
          {items.length ? <span className="text-[13px] font-normal text-ink-subtle">{items.length}</span> : null}
        </h2>
        {editable ? (
          <Button size="sm" className="no-print" onClick={() => input.current?.click()}>
            {busy ? <Spinner className="size-3.5" /> : <Plus />}Datei anhängen
          </Button>
        ) : null}
      </div>

      {items.length ? (
        <ul className={cn('divide-y divide-line overflow-hidden rounded-xl border bg-surface transition-colors',
          dragging ? 'border-[var(--sc)]' : 'border-line')}>
          {items.map((a) => {
            const Icon = iconFor(a)
            const used = content.includes(a.url)
            return (
              <li key={a.id} className="group flex items-center gap-3 px-3 py-2.5">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  <Thumb attachment={a} Icon={Icon} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium group-hover:underline">{a.filename}</span>
                    <span className="block truncate text-xs text-ink-subtle">
                      {formatBytes(a.size)}
                      {a.uploaded_by ? `, ${a.uploaded_by.name}` : ''}
                      {', '}
                      <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>{relativeTime(a.created_at)}</time>
                      {used ? <span className="ml-2 rounded bg-sunken px-1.5 py-px text-[11px] text-ink-muted">im Text verwendet</span> : null}
                    </span>
                  </span>
                </a>
                <div className="no-print flex shrink-0 items-center gap-0.5">
                  {editing && onInsert ? (
                    <Tip label="An der Cursorposition in den Text einfügen">
                      <Button variant="ghost" size="icon-sm" aria-label={`${a.filename} in den Text einfügen`} onClick={() => onInsert(a)}>
                        <TextCursorInput />
                      </Button>
                    </Tip>
                  ) : null}
                  <Tip label="Herunterladen">
                    <Button asChild variant="ghost" size="icon-sm">
                      <a href={a.url} download={a.filename} aria-label={`${a.filename} herunterladen`}><Download /></a>
                    </Button>
                  </Tip>
                  {editable ? (
                    <Tip label="Löschen">
                      <Button variant="ghost" size="icon-sm" aria-label={`${a.filename} löschen`} onClick={() => setDeleting(a)}>
                        <Trash2 />
                      </Button>
                    </Tip>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <button type="button" onClick={() => input.current?.click()}
          className={cn('no-print flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-[13px] text-ink-subtle transition-colors hover:border-line-strong hover:text-ink',
            dragging ? 'border-[var(--sc)] bg-[var(--sc-soft)] text-[var(--sc-ink)]' : 'border-line-strong')}>
          <Paperclip className="size-4" />
          {busy ? 'Wird hochgeladen…' : 'Dateien hierher ziehen oder klicken'}
        </button>
      )}

      <Confirm
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        danger
        confirmLabel="Löschen"
        title={`${deleting?.filename} löschen?`}
        description={deleting && content.includes(deleting.url)
          ? 'Die Datei wird im Text verwendet. Nach dem Löschen zeigt das Bild oder der Link dort ins Leere. Entferne ihn danach aus dem Text.'
          : 'Die Datei wird von dieser Seite entfernt.'}
        onConfirm={() => deleting && void remove(deleting)}
      />
    </section>
  )
}
