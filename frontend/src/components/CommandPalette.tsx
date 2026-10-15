import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { useQuery } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import { FileText, Home, LogOut, Moon, Plus, Search, Shield, Sun } from 'lucide-react'
import { get } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useHome, useSpaces } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import type { SearchHit } from '@/lib/types'
import { SpaceTile } from './ui/misc'
import { useActiveSpaceSlug } from './Sidebar'

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export const cleanSnippet = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: ['mark'], ALLOWED_ATTR: [] })

const item =
  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-ink aria-selected:bg-sunken [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-subtle'
const group = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-subtle'

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim(), 150)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { dark, setTheme } = useTheme()
  const spaces = useSpaces()
  const home = useHome()
  const activeSlug = useActiveSpaceSlug()
  const results = useQuery({
    queryKey: ['search-palette', dq],
    queryFn: ({ signal }) => get<{ total: number; results: SearchHit[] }>(`/search?q=${encodeURIComponent(dq)}&limit=8`, signal),
    enabled: open && dq.length > 1,
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }
  const activeSpace = spaces.data?.find((s) => s.slug === activeSlug)
  const searching = dq.length > 1

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[rgb(8_14_20/0.42)] backdrop-blur-[2px]" />
        <D.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop data-[state=open]:animate-in">
          <D.Title className="sr-only">Suchen und springen</D.Title>
          <D.Description className="sr-only">Seiten suchen, Bereiche öffnen, Befehle ausführen</D.Description>
          <Command shouldFilter={!searching} loop label="Suchen und springen">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-[18px] text-ink-subtle" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Seiten durchsuchen, Bereich öffnen, Befehl ausführen"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-subtle"
              />
            </div>
            <Command.List className="max-h-[56vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-ink-muted">
                {searching && results.isFetching ? 'Suche läuft…' : `Nichts gefunden zu „${q}“.`}
              </Command.Empty>

              {searching && results.data?.results.length ? (
                <Command.Group heading={`Seiten (${results.data.total} Treffer)`} className={group}>
                  {results.data.results.map((r) => (
                    <Command.Item key={r.page_id} value={`hit-${r.page_id}`} onSelect={() => go(`/p/${r.page_id}`)} className={`${item} items-start`}>
                      <SpaceTile icon={r.icon || r.space.icon} color={r.space.color} size={26} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate font-medium">{r.title}</span>
                          <span className="shrink-0 text-xs text-ink-subtle">{r.space.name}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-muted [&_mark]:rounded-sm [&_mark]:bg-[var(--mark)] [&_mark]:px-0.5 [&_mark]:text-ink"
                          dangerouslySetInnerHTML={{ __html: cleanSnippet(r.snippet_html) }} />
                      </span>
                    </Command.Item>
                  ))}
                  {results.data.total > results.data.results.length ? (
                    <Command.Item value="all-results" onSelect={() => go(`/search?q=${encodeURIComponent(dq)}`)} className={item}>
                      <Search />
                      Alle {results.data.total} Treffer anzeigen
                    </Command.Item>
                  ) : null}
                </Command.Group>
              ) : null}

              {!searching && home.data?.recent_views.length ? (
                <Command.Group heading="Zuletzt angesehen" className={group}>
                  {home.data.recent_views.slice(0, 5).map((p) => (
                    <Command.Item key={p.id} value={`recent ${p.title} ${p.space.name}`} onSelect={() => go(`/p/${p.id}`)} className={item}>
                      {p.icon ? <span className="w-4 text-center">{p.icon}</span> : <FileText />}
                      <span className="flex-1 truncate">{p.title}</span>
                      <span className="text-xs text-ink-subtle">{p.space.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {!searching ? (
                <>
                  <Command.Group heading="Bereiche" className={group}>
                    {spaces.data?.map((s) => (
                      <Command.Item key={s.id} value={`bereich ${s.name}`} onSelect={() => go(`/s/${s.slug}`)} className={item}>
                        <SpaceTile icon={s.icon} color={s.color} size={20} />
                        {s.name}
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Befehle" className={group}>
                    <Command.Item value="start startseite" onSelect={() => go('/')} className={item}><Home />Zur Startseite</Command.Item>
                    {activeSpace && (activeSpace.my_level === 'edit' || activeSpace.my_level === 'manage') ? (
                      <Command.Item value={`neue seite ${activeSpace.name}`} onSelect={() => go(`/s/${activeSpace.slug}/new`)} className={item}>
                        <Plus />Neue Seite in {activeSpace.name}
                      </Command.Item>
                    ) : null}
                    <Command.Item value="darstellung dunkel hell theme" onSelect={() => { setTheme(dark ? 'light' : 'dark'); onOpenChange(false) }} className={item}>
                      {dark ? <Sun /> : <Moon />}{dark ? 'Helle Darstellung' : 'Dunkle Darstellung'}
                    </Command.Item>
                    {user?.role === 'admin' ? <Command.Item value="verwaltung admin benutzer" onSelect={() => go('/admin')} className={item}><Shield />Verwaltung öffnen</Command.Item> : null}
                    <Command.Item value="abmelden logout" onSelect={() => { onOpenChange(false); void logout().then(() => navigate('/login')) }} className={item}>
                      <LogOut />Abmelden
                    </Command.Item>
                  </Command.Group>
                </>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line bg-sunken/50 px-4 py-2 text-xs text-ink-subtle">
              <span>↑↓ auswählen</span>
              <span>↵ öffnen</span>
              <span>esc schließen</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
