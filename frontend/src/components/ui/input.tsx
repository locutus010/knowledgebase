import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const field =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-60 aria-[invalid=true]:border-danger'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(field, 'h-9', className)} {...props} />,
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(field, 'min-h-20 py-2 leading-relaxed', className)} {...props} />,
)
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-[13px] font-medium text-ink', className)} {...props} />
}

export function Field({ label, hint, error, htmlFor, children }: {
  label: string; hint?: string; error?: string; htmlFor?: string; children: React.ReactNode
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="mt-1.5 text-[13px] text-danger">{error}</p> : hint ? <p className="mt-1.5 text-[13px] text-ink-subtle">{hint}</p> : null}
    </div>
  )
}
