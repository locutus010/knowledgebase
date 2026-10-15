import type { ReactNode } from 'react'
import { Tooltip as T, Popover as P, Switch as S, Tabs as Tb } from 'radix-ui'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import { popSurface } from './menu'

export function Tip({ label, children, side = 'top' }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[60] rounded-md bg-ink px-2 py-1 text-xs font-medium text-canvas shadow-pop">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
export const TipProvider = T.Provider

export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverAnchor = P.Anchor
export function PopoverContent({ children, className, align = 'start' }: { children: ReactNode; className?: string; align?: 'start' | 'center' | 'end' }) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={6} className={cn(popSurface, 'p-3', className)}>
        {children}
      </P.Content>
    </P.Portal>
  )
}

export function Switch({ checked, onCheckedChange, id, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; label?: string }) {
  return (
    <S.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent"
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  )
}

export const Tabs = Tb.Root
export const TabsContent = Tb.Content
export function TabsList({ children }: { children: ReactNode }) {
  return <Tb.List className="flex gap-1 border-b border-line">{children}</Tb.List>
}
export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Tb.Trigger
      value={value}
      className="-mb-px border-b-2 border-transparent px-3 pb-2.5 pt-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink"
    >
      {children}
    </Tb.Trigger>
  )
}

export function Avatar({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  const c = color ?? 'teal'
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.38),
        background: `var(--sp-${c}-soft)`, color: `var(--sp-${c}-ink)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--sp-${c}) 25%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger'; className?: string }) {
  const tones = {
    neutral: 'bg-sunken text-ink-muted border-line',
    accent: 'bg-accent-soft text-accent-ink border-transparent',
    warn: 'bg-warn-soft text-warn border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
  }
  return <span className={cn('inline-flex h-[22px] items-center rounded-full border px-2 text-xs font-medium', tones[tone], className)}>{children}</span>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] text-ink-subtle">{children}</kbd>
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-sunken', className)} />
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-label="Lädt" />
}

export function SpaceTile({ icon, color, size = 28, className }: { icon: string; color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[28%]', className)}
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.55),
        background: `var(--sp-${color}-soft)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--sp-${color}) 28%, transparent)`,
      }}
    >
      {icon}
    </span>
  )
}
