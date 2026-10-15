import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Hash, X } from 'lucide-react'
import { get } from '@/lib/api'

const pill = 'inline-flex h-6 items-center gap-1 rounded-full bg-[var(--sc-soft)] px-2.5 text-[12.5px] font-medium text-[var(--sc-ink)]'

export function TagPills({ tags, slug }: { tags: string[]; slug: string }) {
  if (!tags.length) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((t) => (
        <li key={t}>
          <Link to={`/s/${slug}?tag=${encodeURIComponent(t)}`} className={`${pill} hover:brightness-95`}>
            <Hash className="size-3 opacity-60" />
            {t}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function TagEditor({ tags, slug, onChange }: { tags: string[]; slug: string; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const known = useQuery({ queryKey: ['tags', slug], queryFn: () => get<{ name: string; count: number }[]>(`/spaces/${slug}/tags`) })
  const suggestions = draft.trim()
    ? (known.data ?? []).map((t) => t.name).filter((n) => n.startsWith(draft.trim().toLowerCase()) && !tags.includes(n)).slice(0, 5)
    : []

  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 32)
    if (t && !tags.includes(t) && tags.length < 20) onChange([...tags, t])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
  }
  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className={pill}>
          <Hash className="size-3 opacity-60" />
          {t}
          <button type="button" aria-label={`Tag ${t} entfernen`} onClick={() => onChange(tags.filter((x) => x !== t))}
            className="-mr-1 rounded-full p-0.5 hover:bg-black/10">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? 'Tag hinzufügen' : 'Tags hinzufügen, mit Enter bestätigen'}
        aria-label="Tag hinzufügen"
        className="h-6 min-w-40 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-subtle"
      />
      {suggestions.length ? (
        <div className="absolute top-8 left-0 z-20 rounded-lg border border-line bg-surface p-1 shadow-pop">
          {suggestions.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); add(s) }}
              className="block w-full rounded-md px-2.5 py-1 text-left text-[13px] hover:bg-sunken">#{s}</button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
