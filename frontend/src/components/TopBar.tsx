import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Menu } from 'lucide-react'
import { spaceVars } from '@/lib/colors'
import type { SpaceRef } from '@/lib/types'
import { useShell } from './shell'
import { Button } from './ui/button'
import { SpaceTile } from './ui/misc'

export interface Crumb {
  label: string
  to?: string
  icon?: string
}

/** Kopfleiste jeder Ansicht: Navigation (mobil), Breadcrumbs, Aktionen rechts. */
export function TopBar({ space, crumbs = [], actions }: { space?: SpaceRef; crumbs?: Crumb[]; actions?: ReactNode }) {
  const { openNav } = useShell()
  return (
    <header
      className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/85 px-3 backdrop-blur-md sm:px-5"
      style={space ? spaceVars(space.color) : undefined}
    >
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={openNav} aria-label="Navigation öffnen">
        <Menu />
      </Button>
      <nav aria-label="Pfad" className="flex min-w-0 flex-1 items-center gap-1 text-[13.5px]">
        {space ? (
          <Link to={`/s/${space.slug}`} className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 font-medium text-ink hover:bg-sunken">
            <SpaceTile icon={space.icon} color={space.color} size={22} />
            <span className="max-w-[16ch] truncate">{space.name}</span>
          </Link>
        ) : null}
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {(space || i > 0) ? <ChevronRight className="size-3.5 shrink-0 text-ink-subtle" /> : null}
            {c.to ? (
              <Link to={c.to} className="truncate rounded-md px-1.5 py-1 text-ink-muted hover:bg-sunken hover:text-ink">
                {c.icon ? `${c.icon} ` : ''}{c.label}
              </Link>
            ) : (
              <span className="truncate px-1.5 py-1 text-ink" aria-current="page">{c.icon ? `${c.icon} ` : ''}{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </header>
  )
}
