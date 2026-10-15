import type { ReactNode } from 'react'

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon ? <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-sunken text-ink-subtle [&_svg]:size-5">{icon}</div> : null}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {children ? <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
