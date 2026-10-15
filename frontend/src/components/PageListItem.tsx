import { Link } from 'react-router'
import { FileText } from 'lucide-react'
import { relativeTime } from '@/lib/format'
import type { SpaceRef } from '@/lib/types'
import { SpaceTile } from './ui/misc'

export function PageRow({ id, title, icon, at, space, meta }: {
  id: string; title: string; icon: string; at?: string; space?: SpaceRef; meta?: string
}) {
  return (
    <Link to={`/p/${id}`} className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-sunken">
      {space ? (
        <SpaceTile icon={icon || space.icon} color={space.color} size={30} />
      ) : (
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-sunken text-[15px]">
          {icon || <FileText className="size-4 text-ink-subtle" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium group-hover:text-ink">{title}</span>
        {space || meta ? <span className="block truncate text-xs text-ink-subtle">{meta ?? space?.name}</span> : null}
      </span>
      {at ? <time className="shrink-0 text-xs text-ink-subtle" dateTime={at}>{relativeTime(at)}</time> : null}
    </Link>
  )
}
