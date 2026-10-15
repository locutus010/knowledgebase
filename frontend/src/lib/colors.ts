import type { CSSProperties } from 'react'
import type { SpaceColor } from './types'

export const SPACE_COLORS: { value: SpaceColor; label: string }[] = [
  { value: 'teal', label: 'Petrol' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'violet', label: 'Violett' },
  { value: 'rose', label: 'Rosé' },
  { value: 'orange', label: 'Orange' },
  { value: 'amber', label: 'Bernstein' },
  { value: 'green', label: 'Grün' },
  { value: 'slate', label: 'Schiefer' },
]

/** Setzt --sc, --sc-soft, --sc-ink auf die Bereichsfarbe; Kinder nutzen sie per var(). */
export function spaceVars(color: string | undefined): CSSProperties {
  const c = color ?? 'teal'
  return {
    '--sc': `var(--sp-${c})`,
    '--sc-soft': `var(--sp-${c}-soft)`,
    '--sc-ink': `var(--sp-${c}-ink)`,
  } as CSSProperties
}

export const AVATAR_COLORS: SpaceColor[] = ['teal', 'indigo', 'violet', 'rose', 'orange', 'amber', 'green', 'slate']
