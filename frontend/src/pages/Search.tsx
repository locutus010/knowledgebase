import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Search as SearchIcon } from 'lucide-react'
import { get } from '@/lib/api'
import { useSpaces } from '@/lib/queries'
import { relativeTime } from '@/lib/format'
import type { SearchHit } from '@/lib/types'
import { TopBar } from '@/components/TopBar'
import { cleanSnippet } from '@/components/CommandPalette'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton, SpaceTile } from '@/components/ui/misc'

const PAGE = 20
const ALL = '__all__'

export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const space = params.get('space') ?? ALL
  const offset = Number(params.get('offset') ?? 0) || 0
  const [draft, setDraft] = useState(q)
  const spaces = useSpaces()
  useEffect(() => setDraft(q), [q])
  useEffect(() => { document.title = q ? `„${q}“ · Suche` : 'Suche · Wissensdatenbank' }, [q])

  const res = useQuery({
    queryKey: ['search', q, space, offset],
    queryFn: () => get<{ total: number; results: SearchHit[] }>(
      `/search?q=${encodeURIComponent(q)}&limit=${PAGE}&offset=${offset}${space !== ALL ? `&space=${space}` : ''}`),
    enabled: q.trim().length > 0,
  })

  const update = (next: Record<string, string>) => {
    const p: Record<string, string> = { q, ...(space !== ALL ? { space } : {}), ...next }
    Object.keys(p).forEach((k) => (p[k] === '' || p[k] === ALL || p[k] === '0') && delete p[k])
    setParams(p)
  }
  const submit = (e: FormEvent) => { e.preventDefault(); update({ q: draft.trim(), offset: '0' }) }

  return (
    <div>
      <TopBar crumbs={[{ label: 'Suche' }]} />
      <div className="mx-auto max-w-[820px] px-5 pt-10 pb-24 sm:px-10">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Suchbegriff, auch „exakte Phrase“ oder -ausschließen"
              className="h-11 pl-9 text-[15px]" autoFocus aria-label="Suchbegriff" />
          </div>
          <div className="sm:w-52">
            <Select value={space} onValueChange={(v) => update({ space: v, offset: '0' })} label="Bereich" className="h-11"
              options={[{ value: ALL, label: 'Alle Bereiche' }, ...(spaces.data ?? []).map((s) => ({ value: s.slug, label: `${s.icon} ${s.name}` }))]} />
          </div>
          <Button type="submit" variant="primary" className="h-11">Suchen</Button>
        </form>

        <div className="mt-8" aria-live="polite">
          {!q ? (
            <EmptyState icon={<SearchIcon />} title="Durchsuche alles, was du lesen darfst">
              Titel zählen mehr als Tags, Tags mehr als Text. Das letzte Wort wird schon beim Tippen ergänzt.
            </EmptyState>
          ) : res.isLoading ? (
            <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : res.data?.total ? (
            <>
              <p className="mb-4 text-sm text-ink-muted">{res.data.total === 1 ? '1 Treffer' : `${res.data.total} Treffer`} für „{q}“</p>
              <ol className="space-y-1">
                {res.data.results.map((r) => (
                  <li key={r.page_id}>
                    <Link to={`/p/${r.page_id}`} className="flex gap-4 rounded-xl p-3 transition-colors hover:bg-sunken">
                      <SpaceTile icon={r.icon || r.space.icon} color={r.space.color} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[15px] font-semibold">{r.title}</span>
                          <span className="shrink-0 text-xs text-ink-subtle">{r.space.name}, {relativeTime(r.updated_at)}</span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-[13.5px] leading-relaxed text-ink-muted [&_mark]:rounded-sm [&_mark]:bg-[var(--mark)] [&_mark]:px-0.5 [&_mark]:text-ink"
                          dangerouslySetInnerHTML={{ __html: cleanSnippet(r.snippet_html) }} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              {res.data.total > PAGE ? (
                <nav className="mt-8 flex items-center justify-between" aria-label="Blättern">
                  <Button disabled={offset === 0} onClick={() => update({ offset: String(Math.max(0, offset - PAGE)) })}>Zurück</Button>
                  <span className="text-sm text-ink-subtle">{offset + 1}–{Math.min(offset + PAGE, res.data.total)} von {res.data.total}</span>
                  <Button disabled={offset + PAGE >= res.data.total} onClick={() => update({ offset: String(offset + PAGE) })}>Weiter</Button>
                </nav>
              ) : null}
            </>
          ) : (
            <EmptyState icon={<SearchIcon />} title={`Nichts gefunden zu „${q}“`}>
              Prüfe die Schreibweise, nimm ein allgemeineres Wort, oder suche in allen Bereichen.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  )
}
