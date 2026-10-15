// Setzt das Farbschema vor dem ersten Zeichnen, damit der Dunkelmodus nicht aufblitzt.
// Als eigene Datei statt inline, weil die CSP keine Inline-Skripte erlaubt.
try {
  var t = localStorage.getItem('kb-theme') || 'system'
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch (e) {}
