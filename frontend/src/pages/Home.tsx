import { useEffect } from 'react'
import { Link } from 'react-router'
import { BookOpen, Clock, Plus, Star } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useHome, useSpaces } from '@/lib/queries'
import { greeting } from '@/lib/format'
import { spaceVars } from '@/lib/colors'
import { TopBar } from '@/components/TopBar'
import { EmptyState } from '@/components/EmptyState'
import { PageRow } from '@/components/PageListItem'
import { Button } from '@/components/ui/button'
import { Kbd, Skeleton, SpaceTile } from '@/components/ui/misc'
import { useShell } from '@/components/shell'
import type { PageCard, Space } from '@/lib/types'

export default function Home() {
  const { user } = useAuth()
  const spaces = useSpaces()
  const home = useHome()
  const { openPalette } = useShell()
  const mayCreate = user?.role === 'admin' || user?.role === 'editor'

  useEffect(() => {
    document.title = 'Start · Wissensdatenbank'
  }, [])

  return (
    <div>
      <TopBar crumbs={[{ label: 'Start' }]} />
      <div className="mx-auto max-w-[1080px] px-5 pt-12 pb-24 sm:px-10">
        <section>
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] sm:text-[38px]">
            {greeting()}, {user?.name.split(' ')[0]}
          </h1>
          <button type="button" onClick={openPalette}
            className="mt-6 flex h-12 w-full max-w-xl items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-[15px] text-ink-subtle shadow-[0_1px_0_rgb(0_0_0/0.03)] transition-colors hover:border-line-strong">
            <BookOpen className="size-[18px]" />
            <span className="flex-1">Wonach suchst du?</span>
            <Kbd>⌘K</Kbd>
          </button>
        </section>

        <section className="mt-14" aria-labelledby="spaces-h">
          <div className="mb-4 flex items-end justify-between">
            <h2 id="spaces-h" className="text-[17px] font-semibold tracking-tight">Bereiche</h2>
            {mayCreate ? (
              <Button asChild variant="ghost" size="sm"><Link to="/spaces/new"><Plus />Bereich anlegen</Link></Button>
            ) : null}
          </div>
          {spaces.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)}</div>
          ) : spaces.data?.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.data.map((s) => <li key={s.id}><SpaceCard space={s} /></li>)}
            </ul>
          ) : (
            <EmptyState icon={<BookOpen />} title={mayCreate ? 'Lege den ersten Bereich an' : 'Noch kein Bereich für dich'}
              action={mayCreate ? <Button asChild variant="primary"><Link to="/spaces/new"><Plus />Bereich anlegen</Link></Button> : undefined}>
              {mayCreate
                ? 'Bereiche sortieren das Wissen eures Teams, zum Beispiel nach Abteilung oder Thema. Jeder bekommt eine eigene Farbe.'
                : 'Sobald dir jemand Zugriff auf einen Bereich gibt, erscheint er hier.'}
            </EmptyState>
          )}
        </section>

        {home.data?.favorites.length ? (
          <section className="mt-14" aria-labelledby="fav-h">
            <h2 id="fav-h" className="mb-3 flex items-center gap-2 text-[17px] font-semibold tracking-tight">
              <Star className="size-4 fill-[var(--sp-amber)] text-[var(--sp-amber)]" />Favoriten
            </h2>
            <ul className="grid gap-1 sm:grid-cols-2">
              {home.data.favorites.map((p) => <li key={p.id}><PageRow {...p} at={undefined} /></li>)}
            </ul>
          </section>
        ) : null}

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          <PageList title="Zuletzt angesehen" icon={<Clock className="size-4 text-ink-subtle" />} items={home.data?.recent_views}
            empty="Seiten, die du öffnest, findest du hier wieder." loading={home.isLoading} />
          <PageList title="Zuletzt geändert" items={home.data?.recent_changes}
            empty="Sobald jemand schreibt, siehst du es hier." loading={home.isLoading} />
        </div>
      </div>
    </div>
  )
}

function SpaceCard({ space }: { space: Space }) {
  return (
    <Link
      to={`/s/${space.slug}`}
      style={spaceVars(space.color)}
      className="group relative flex h-full overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--sc)_45%,var(--line))]"
    >
      <span aria-hidden className="w-1.5 shrink-0 bg-[var(--sc)]" />
      <span className="flex min-w-0 flex-1 flex-col p-4">
        <span className="flex items-center gap-3">
          <SpaceTile icon={space.icon} color={space.color} size={34} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{space.name}</span>
            <span className="block text-xs text-ink-subtle">
              {space.page_count === 1 ? '1 Seite' : `${space.page_count} Seiten`}
              {space.default_access === 'none' ? ', nur Mitglieder' : ''}
            </span>
          </span>
        </span>
        {space.description ? <span className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-muted">{space.description}</span> : null}
      </span>
    </Link>
  )
}

function PageList({ title, icon, items, empty, loading }: { title: string; icon?: React.ReactNode; items?: PageCard[]; empty: string; loading: boolean }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold tracking-tight">{icon}{title}</h2>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>
      ) : items?.length ? (
        <ul className="-mx-2.5 space-y-0.5">{items.map((p) => <li key={p.id}><PageRow {...p} /></li>)}</ul>
      ) : (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-sm text-ink-subtle">{empty}</p>
      )}
    </section>
  )
}
