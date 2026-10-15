import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Heading { id: string; text: string; level: number }

function slug(text: string, used: Set<string>) {
  let base = text.toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c]!).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'abschnitt'
  let s = base
  for (let i = 2; used.has(s); i++) s = `${base}-${i}`
  used.add(s)
  return s
}

/** Liest die Überschriften aus dem gerenderten Artikel und folgt beim Scrollen. */
export function TableOfContents({ root, version }: { root: HTMLElement | null; version: unknown }) {
  const [items, setItems] = useState<Heading[]>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (!root) return
    const collect = () => {
      const used = new Set<string>()
      const hs = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3'))
      const list = hs.map((h) => {
        const id = slug(h.textContent ?? '', used)
        h.id = id
        return { id, text: h.textContent ?? '', level: Number(h.tagName[1]) }
      }).filter((h) => h.text.trim())
      setItems(list)
      return hs
    }
    const hs = collect()
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive((visible[0].target as HTMLElement).id)
      },
      { rootMargin: '-72px 0px -65% 0px' },
    )
    hs.forEach((h) => io.observe(h))
    return () => io.disconnect()
  }, [root, version])

  if (items.length < 2) return null
  const min = Math.min(...items.map((i) => i.level))
  return (
    <nav aria-label="Inhalt dieser Seite" className="text-[13px]">
      <p className="mb-2.5 font-medium text-ink">Auf dieser Seite</p>
      <ul className="space-y-0.5 border-l border-line">
        {items.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                history.replaceState(null, '', `#${h.id}`)
              }}
              className={cn(
                '-ml-px block border-l-2 border-transparent py-1 pr-2 leading-snug text-ink-subtle transition-colors hover:text-ink',
                active === h.id && 'border-[var(--sc)] font-medium text-ink',
              )}
              style={{ paddingLeft: 12 + (h.level - min) * 12 }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
