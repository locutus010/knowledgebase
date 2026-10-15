import type { ChangeObject } from 'diff'
import { cn } from '@/lib/utils'

export function DiffView({ parts }: { parts: ChangeObject<string>[] }) {
  if (parts.every((p) => !p.added && !p.removed)) {
    return <p className="rounded-lg bg-sunken px-4 py-6 text-center text-sm text-ink-muted">Keine Unterschiede im Text.</p>
  }
  return (
    <pre className="max-h-[50vh] overflow-auto rounded-xl border border-line bg-sunken/60 py-2 font-mono text-[12.5px] leading-relaxed">
      {parts.map((p, i) =>
        p.value.replace(/\n$/, '').split('\n').map((line, j) => (
          <div
            key={`${i}-${j}`}
            className={cn(
              'px-4 whitespace-pre-wrap',
              p.added && 'bg-[var(--sp-green-soft)] text-[var(--sp-green-ink)]',
              p.removed && 'bg-danger-soft text-danger line-through decoration-danger/40',
              !p.added && !p.removed && 'text-ink-muted',
            )}
          >
            <span className="mr-3 inline-block w-3 select-none opacity-60">{p.added ? '+' : p.removed ? '−' : ' '}</span>
            {line || ' '}
          </div>
        )),
      )}
    </pre>
  )
}
