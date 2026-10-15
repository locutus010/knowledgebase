/** Vergleichsform für Markdown: Zeilenenden, Leerzeilen, Leerraum am Zeilenende und das
 *  Auffüllen von Tabellenspalten gleichziehen — alles bedeutungsgleich. Tabellen in Zitaten
 *  und Hinweisboxen („> | …“) zählen mit. */
export function normalizeMd(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .map((l) => {
      const m = /^((?:> ?)*)\s*(\|.*\|)\s*$/.exec(l)
      if (!m) return l
      const cells = m[2].slice(1, -1).split('|').map((c) => (/^\s*:?-+:?\s*$/.test(c) ? '---' : c.trim()))
      return `${m[1].replace(/ ?$/, m[1] ? ' ' : '')}| ${cells.join(' | ')} |`
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
