import { useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from './ui/misc'

const EMOJIS = [
  '📘', '📗', '📕', '📙', '📓', '📄', '📝', '🗒️', '📋', '📌', '📎', '🔖',
  '🧭', '🗺️', '🏛️', '🛠️', '⚙️', '🔧', '🧰', '🧪', '🔬', '💡', '🧠', '🎯',
  '🚀', '🚦', '🚨', '🔥', '⚠️', '✅', '❌', '🔒', '🔑', '🛡️', '🐛', '📦',
  '💻', '🖥️', '📱', '🌐', '☁️', '🗄️', '💾', '🔌', '📡', '🧩', '🔗', '📊',
  '📈', '📉', '💶', '🧾', '🤝', '👋', '👥', '🙋', '🎓', '🌱', '🏖️', '🗓️',
  '⏱️', '🏁', '⭐', '❤️', '🎨', '✏️', '🗂️', '📣', '📬', '🧹', '♻️', '🏠',
]

export function EmojiPicker({ value, onChange, children, allowEmpty = true }: {
  value: string; onChange: (v: string) => void; children: ReactNode; allowEmpty?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-[296px] p-2">
        <div className="grid grid-cols-8 gap-0.5" role="listbox" aria-label="Symbol wählen">
          {EMOJIS.map((e) => (
            <button key={e} type="button" role="option" aria-selected={e === value}
              onClick={() => { onChange(e); setOpen(false) }}
              className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-sunken aria-selected:bg-accent-soft">
              {e}
            </button>
          ))}
        </div>
        {allowEmpty && value ? (
          <button type="button" onClick={() => { onChange(''); setOpen(false) }}
            className="mt-2 w-full rounded-md py-1.5 text-[13px] text-ink-muted hover:bg-sunken">
            Symbol entfernen
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
