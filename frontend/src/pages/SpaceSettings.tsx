import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, Download, Trash2, Upload } from 'lucide-react'
import { del, patch, upload } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { qk, useSpace } from '@/lib/queries'
import { spaceVars } from '@/lib/colors'
import type { Space } from '@/lib/types'
import { TopBar } from '@/components/TopBar'
import { SpaceForm } from '@/components/SpaceForm'
import { MemberManager } from '@/components/MemberManager'
import { TemplateManager } from '@/components/TemplateManager'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/dialog'
import { Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { NotFound } from './NotFound'

export default function SpaceSettings() {
  const { slug } = useParams()
  const space = useSpace(slug)
  if (space.isLoading) return null
  if (!space.data || space.data.my_level !== 'manage') return <NotFound what="Diese Einstellungen" />
  return <Settings space={space.data} />
}

function Settings({ space }: { space: Space }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [importing, setImporting] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.spaces })
    qc.invalidateQueries({ queryKey: qk.space(space.slug) })
  }

  const doImport = async (f: File) => {
    setImporting(true)
    try {
      const r = await upload<{ pages: number; attachments: number; skipped: string[] }>(`/spaces/${space.slug}/import`, f)
      toast.success(`${r.pages} Seiten und ${r.attachments} Anhänge importiert`, {
        description: r.skipped.length ? `Übersprungen: ${r.skipped.slice(0, 5).join(', ')}${r.skipped.length > 5 ? ' …' : ''}` : undefined,
      })
      qc.invalidateQueries({ queryKey: qk.tree(space.slug) })
      refresh()
    } catch (e) { toast.error((e as Error).message) } finally { setImporting(false) }
  }

  return (
    <div style={spaceVars(space.color)}>
      <TopBar space={space} crumbs={[{ label: 'Einstellungen' }]} />
      <div className="mx-auto max-w-[760px] px-5 pt-10 pb-24 sm:px-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">Allgemein</TabsTrigger>
            <TabsTrigger value="members">Mitglieder</TabsTrigger>
            <TabsTrigger value="templates">Vorlagen</TabsTrigger>
            <TabsTrigger value="transfer">Import und Export</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="pt-8">
            <SpaceForm initial={space} submitLabel="Änderungen speichern" onSubmit={async (v) => {
              try { await patch(`/spaces/${space.slug}`, v); refresh(); toast.success('Gespeichert') } catch (e) { toast.error((e as Error).message) }
            }} />
            <section className="mt-12 rounded-xl border border-line p-5">
              <h2 className="text-[15px] font-semibold">{space.archived ? 'Archiv' : 'Archivieren'}</h2>
              <p className="mt-1 text-sm text-ink-muted">Ein archivierter Bereich verschwindet aus Übersicht und Suche, bleibt aber erhalten.</p>
              <Button className="mt-4" onClick={async () => {
                try { await patch(`/spaces/${space.slug}`, { archived: !space.archived }); refresh(); toast.success(space.archived ? 'Bereich wieder aktiv' : 'Bereich archiviert') } catch (e) { toast.error((e as Error).message) }
              }}><Archive />{space.archived ? 'Aus dem Archiv holen' : 'Bereich archivieren'}</Button>
              {user?.role === 'admin' ? (
                <div className="mt-6 border-t border-line pt-5">
                  <h3 className="text-[14px] font-semibold text-danger">Endgültig löschen</h3>
                  <p className="mt-1 text-sm text-ink-muted">Löscht den Bereich mit allen Seiten, Versionen und Anhängen.</p>
                  <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}><Trash2 />Bereich löschen</Button>
                </div>
              ) : null}
            </section>
          </TabsContent>
          <TabsContent value="members" className="pt-8"><MemberManager space={space} /></TabsContent>
          <TabsContent value="templates" className="pt-8"><TemplateManager spaceSlug={space.slug} /></TabsContent>
          <TabsContent value="transfer" className="space-y-6 pt-8">
            <section className="rounded-xl border border-line p-5">
              <h2 className="text-[15px] font-semibold">Exportieren</h2>
              <p className="mt-1 text-sm text-ink-muted">Alle Seiten als Markdown-Dateien in Ordnern, Anhänge im Ordner _attachments. Taugt auch als Backup und für Obsidian.</p>
              <Button asChild className="mt-4"><a href={`/api/v1/spaces/${space.slug}/export.zip`}><Download />ZIP herunterladen</a></Button>
            </section>
            <section className="rounded-xl border border-line p-5">
              <h2 className="text-[15px] font-semibold">Importieren</h2>
              <p className="mt-1 text-sm text-ink-muted">Eine .md-Datei oder ein ZIP mit Ordnern. Ordner werden zu Unterseiten, Bilder zu Anhängen. Höchstens 5000 Dateien.</p>
              <input ref={file} type="file" accept=".md,.markdown,.zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doImport(f) }} />
              <Button className="mt-4" disabled={importing} onClick={() => file.current?.click()}>{importing ? <Spinner /> : <Upload />}Datei wählen</Button>
            </section>
          </TabsContent>
        </Tabs>
      </div>
      <Confirm open={confirmDelete} onOpenChange={setConfirmDelete} danger confirmLabel="Endgültig löschen" title={`${space.name} löschen?`}
        description="Alle Seiten, Versionen und Anhänge dieses Bereichs werden gelöscht. Das lässt sich nicht rückgängig machen."
        onConfirm={async () => {
          try { await del(`/spaces/${space.slug}`); qc.invalidateQueries({ queryKey: qk.spaces }); toast.success(`${space.name} gelöscht`); navigate('/') } catch (e) { toast.error((e as Error).message) }
        }} />
    </div>
  )
}
