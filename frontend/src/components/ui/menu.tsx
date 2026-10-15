import type { ReactNode } from 'react'
import { DropdownMenu as M } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export const popSurface = 'z-50 rounded-xl border border-line bg-surface p-1 shadow-pop data-[state=open]:animate-in'

export function MenuContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn(popSurface, 'min-w-52', className)}>
        {children}
      </M.Content>
    </M.Portal>
  )
}

export function MenuItem({ children, onSelect, danger, icon, disabled, shortcut }: {
  children: ReactNode; onSelect?: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean; shortcut?: string
}) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13.5px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-sunken [&_svg]:size-4 [&_svg]:text-ink-subtle',
        danger && 'text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft',
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {shortcut ? <span className="text-xs text-ink-subtle">{shortcut}</span> : null}
    </M.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2.5 pt-2 pb-1 text-xs text-ink-subtle">{children}</M.Label>
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />
}

export const MenuRadioGroup = M.RadioGroup
export function MenuRadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <M.RadioItem
      value={value}
      className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken"
    >
      <span className="flex size-4 items-center justify-center">
        <M.ItemIndicator>
          <span className="block size-1.5 rounded-full bg-accent" />
        </M.ItemIndicator>
      </span>
      {children}
    </M.RadioItem>
  )
}
