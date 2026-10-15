import type { ReactNode } from 'react'
import { Dialog as D, AlertDialog as AD } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

const overlay = 'fixed inset-0 z-50 bg-[rgb(8_14_20/0.42)] backdrop-blur-[2px] data-[state=open]:animate-[kb-fade_120ms_ease-out]'
const panel =
  'fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] -translate-x-1/2 rounded-2xl border border-line bg-surface shadow-pop data-[state=open]:animate-in max-h-[76vh] overflow-y-auto'

export function Dialog({ open, onOpenChange, title, description, children, footer, width = 'max-w-lg' }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: string
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content className={cn(panel, width)} aria-describedby={description ? undefined : undefined}>
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div>
              <D.Title className="text-[17px] font-semibold tracking-tight">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-ink-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Schließen" className="-mr-2">
                <X />
              </Button>
            </D.Close>
          </div>
          <div className="px-6 py-5">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line bg-sunken/50 px-6 py-3.5 rounded-b-2xl">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export function Confirm({ open, onOpenChange, title, description, confirmLabel, danger, onConfirm }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className={overlay} />
        <AD.Content className={cn(panel, 'max-w-md p-6')}>
          <AD.Title className="text-[17px] font-semibold tracking-tight">{title}</AD.Title>
          <AD.Description className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</AD.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AD.Cancel asChild>
              <Button>Abbrechen</Button>
            </AD.Cancel>
            <AD.Action asChild>
              <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AD.Action>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  )
}
