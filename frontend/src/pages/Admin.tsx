import { useEffect } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useSpaces } from '@/lib/queries'
import { formatBytes } from '@/lib/format'
import { TopBar } from '@/components/TopBar'
import { UserTable } from '@/components/UserTable'
import { TemplateManager } from '@/components/TemplateManager'
import { Badge, SpaceTile, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { NotFound } from './NotFound'

const ACCESS = { none: 'Nur Mitglieder', read: 'Alle lesen', edit: 'Alle schreiben' }

export default function Admin() {
  const { user } = useAuth()
  useEffect(() => { document.title = 'Verwaltung · Wissensdatenbank' }, [])
  if (user?.role !== 'admin') return <NotFound what="Diese Seite" />
  return (
    <div>
      <TopBar crumbs={[{ label: 'Verwaltung' }]} />
      <div className="mx-auto max-w-[980px] px-5 pt-10 pb-24 sm:px-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Verwaltung</h1>
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Personen</TabsTrigger>
            <TabsTrigger value="spaces">Bereiche</TabsTrigger>
            <TabsTrigger value="templates">Vorlagen</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="pt-8"><UserTable /></TabsContent>
          <TabsContent value="spaces" className="pt-8"><AllSpaces /></TabsContent>
          <TabsContent value="templates" className="pt-8"><TemplateManager /></TabsContent>
          <TabsContent value="system" className="pt-8"><SystemInfo /></TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function AllSpaces() {
  const active = useSpaces(false)
  const archived = useSpaces(true)
  const all = [...(active.data ?? []), ...(archived.data ?? [])]
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {all.map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-4 py-3">
          <SpaceTile icon={s.icon} color={s.color} size={30} />
          <span className="min-w-0 flex-1">
            <Link to={`/s/${s.slug}`} className="block truncate text-[14px] font-medium hover:underline">{s.name}</Link>
            <span className="block text-xs text-ink-subtle">{s.page_count} Seiten, {ACCESS[s.default_access]}</span>
          </span>
          {s.archived ? <Badge tone="warn">Archiviert</Badge> : null}
          <Link to={`/s/${s.slug}/settings`} className="text-[13px] text-ink-muted hover:text-ink">Einstellungen</Link>
        </li>
      ))}
    </ul>
  )
}

function SystemInfo() {
  const info = useQuery({ queryKey: ['admin-info'], queryFn: () => get<{ version: string; oidc_enabled: boolean; oidc_issuer: string | null; users: number; spaces: number; pages: number; upload_bytes: number }>('/admin/info') })
  if (!info.data) return null
  const d = info.data
  const rows: [string, React.ReactNode][] = [
    ['Version', d.version],
    ['Anmeldung über SSO', d.oidc_enabled ? <span>Aktiv <span className="text-ink-subtle">({d.oidc_issuer})</span></span> : 'Nicht eingerichtet'],
    ['Personen', d.users],
    ['Bereiche', d.spaces],
    ['Seiten', d.pages],
    ['Speicher für Anhänge', formatBytes(d.upload_bytes)],
  ]
  return (
    <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-3 text-[14px]"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
      ))}
    </dl>
  )
}
