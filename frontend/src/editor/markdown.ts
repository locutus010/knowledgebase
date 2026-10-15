/** Vergleichsform für Markdown: Zeilenenden, Leerzeilen, Leerraum am Zeilenende und das
 *  Auffüllen von Tabellenspalten gleichziehen — alles bedeutungsgleich. */
export function normalizeMd(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .map((l) =>
      /^\s*\|.*\|\s*$/.test(l)
        ? '| ' + l.trim().slice(1, -1).split('|').map((c) => (/^\s*:?-+:?\s*$/.test(c) ? '---' : c.trim())).join(' | ') + ' |'
        : l,
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
