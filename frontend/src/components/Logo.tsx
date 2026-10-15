import { Link } from 'react-router'

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 rounded-md text-ink" aria-label="Zur Startseite">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 8h4v16H9zM15 8h4l4 16h-4z" fill="var(--on-accent)" />
      </svg>
      {compact ? null : <span className="text-[15px] font-semibold tracking-tight">Wissensdatenbank</span>}
    </Link>
  )
}
