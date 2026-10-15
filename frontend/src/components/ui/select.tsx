import { Select as S } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { popSurface } from './menu'

export function Select<T extends string>({ value, onValueChange, options, className, label, size = 'md' }: {
  value: T
  onValueChange: (v: T) => void
  options: { value: T; label: string; hint?: string }[]
  className?: string
  label?: string
  size?: 'sm' | 'md'
}) {
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <S.Trigger
        aria-label={label}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-sm hover:border-line-strong focus:border-accent focus:outline-none',
          size === 'sm' ? 'h-8 text-[13px]' : 'h-9',
          className,
        )}
      >
        <S.Value />
        <S.Icon>
          <ChevronDown className="size-4 text-ink-subtle" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className={cn(popSurface, 'min-w-[var(--radix-select-trigger-width)]')}>
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer flex-col rounded-md py-1.5 pr-8 pl-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken"
              >
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint ? <span className="text-xs text-ink-subtle">{o.hint}</span> : null}
                <S.ItemIndicator className="absolute top-2 right-2">
                  <Check className="size-4 text-accent" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
