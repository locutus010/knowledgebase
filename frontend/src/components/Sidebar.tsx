import { Link, NavLink, useMatch, useNavigate } from 'react-router'
import { ChevronDown, Home, Plus, Search, Settings2, Trash2 } from 'lucide-react'
import { canEdit, usePage, useSpaces } from '@/lib/queries'
import { spaceVars } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth'
import { Logo } from './Logo'
import { PageTree } from './PageTree'
import { UserMenu } from './UserMenu'
import { Kbd, SpaceTile } from './ui/misc'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './ui/menu'
import { useShell } from './shell'
import type { Space } from '@/lib/types'

/** Welcher Bereich ist gerade offen? Aus der URL oder aus der geöffneten Seite. */
export function useActiveSpaceSlug(): string | undefined {
  const spaceMatch = useMatch('/s/:slug/*')
  const pageMatch = useMatch('/p/:pageId/*')
  const page = usePage(pageMatch?.params.pageId)
  return spaceMatch?.params.slug ?? page.data?.space.slug
}

const navItem =
  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] text-ink-muted transition-colors hover:bg-line/60 hover:text-ink [&_svg]:size-4 [&_svg]:text-ink-subtle'

export function Sidebar() {
  const { openPalette } = useShell()
  const { user } = useAuth()
  const spaces = useSpaces()
  const activeSlug = useActiveSpaceSlug()
  const active = spaces.data?.find((s) => s.slug === activeSlug)
  const others = spaces.data?.filter((s) => s.slug !== activeSlug) ?? []
  const navigate = useNavigate()
  const mayCreateSpace = user?.role === 'admin' || user?.role === 'editor'

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={openPalette}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 text-[13.5px] text-ink-subtle transition-colors hover:border-line-strong"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Suchen oder springen</span>
          <Kbd>⌘K</Kbd>
        </button>
        <nav className="mt-3 space-y-0.5" aria-label="Hauptnavigation">
          <NavLink to="/" end className={({ isActive }) => cn(navItem, isActive && 'bg-line/70 text-ink')}>
            <Home />
            Start
          </NavLink>
        </nav>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {active ? (
          <ActiveSpace space={active} />
        ) : null}

        <div className={cn('flex items-center justify-between px-2.5 pb-1.5', active ? 'mt-6' : '')}>
          <span className="text-xs font-medium text-ink-subtle">{active ? 'Weitere Bereiche' : 'Bereiche'}</span>
          {mayCreateSpace ? (
            <button type="button" onClick={() => navigate('/spaces/new')} aria-label="Bereich anlegen"
              className="rounded p-0.5 text-ink-subtle hover:bg-line/60 hover:text-ink">
              <Plus className="size-4" />
            </button>
          ) : null}
        </div>
        <ul className="space-y-0.5">
          {others.map((s) => (
            <li key={s.id}>
              <Link to={`/s/${s.slug}`} className={cn(navItem, 'text-ink')}>
                <SpaceTile icon={s.icon} color={s.color} size={20} />
                <span className="truncate">{s.name}</span>
              </Link>
            </li>
          ))}
          {spaces.data && spaces.data.length === 0 ? (
            <li className="px-2.5 py-2 text-[13px] leading-relaxed text-ink-subtle">
              {mayCreateSpace ? 'Lege mit + deinen ersten Bereich an.' : 'Dir wurde noch kein Bereich freigegeben.'}
            </li>
          ) : null}
        </ul>
      </div>

      <div className="border-t border-line p-3">
        <UserMenu />
      </div>
    </div>
  )
}

/** Der geöffnete Bereich: farbige Kante links, darunter der Seitenbaum. */
function ActiveSpace({ space }: { space: Space }) {
  const navigate = useNavigate()
  const editable = canEdit(space.my_level)
  return (
    <section style={spaceVars(space.color)} aria-label={`Bereich ${space.name}`}>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-line/60"
          >
            <SpaceTile icon={space.icon} color={space.color} size={26} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{space.name}</span>
            </span>
            <ChevronDown className="size-4 text-ink-subtle" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-60">
          <MenuLabel>{space.name}</MenuLabel>
          <MenuItem icon={<Home />} onSelect={() => navigate(`/s/${space.slug}`)}>Übersicht</MenuItem>
          {editable ? <MenuItem icon={<Plus />} onSelect={() => navigate(`/s/${space.slug}/new`)}>Neue Seite</MenuItem> : null}
          {editable ? <MenuItem icon={<Trash2 />} onSelect={() => navigate(`/s/${space.slug}/trash`)}>Papierkorb</MenuItem> : null}
          {space.my_level === 'manage' ? (
            <>
              <MenuSeparator />
              <MenuItem icon={<Settings2 />} onSelect={() => navigate(`/s/${space.slug}/settings`)}>Einstellungen</MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>

      <div className="relative mt-1 ml-[19px] border-l-2 pl-1.5" style={{ borderColor: 'var(--sc)' }}>
        <PageTree space={space} />
        {editable ? (
          <button
            type="button"
            onClick={() => navigate(`/s/${space.slug}/new`)}
            className="mt-0.5 flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] text-ink-subtle transition-colors hover:bg-line/60 hover:text-ink"
          >
            <Plus className="size-3.5" />
            Neue Seite
          </button>
        ) : null}
      </div>
    </section>
  )
}
