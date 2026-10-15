import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Dialog as D } from 'radix-ui'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { ShellContext } from './shell'
import { OfflineBanner } from './OfflineBanner'
import { PasswordChangeGate } from './PasswordChangeGate'

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setNavOpen(false), [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <ShellContext.Provider value={{ openNav: () => setNavOpen(true), openPalette: () => setPaletteOpen(true) }}>
      <div className="flex min-h-dvh">
        <aside className="no-print sticky top-0 hidden h-dvh w-[272px] shrink-0 border-r border-line bg-sunken/60 lg:block">
          <Sidebar />
        </aside>
        <D.Root open={navOpen} onOpenChange={setNavOpen}>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-40 bg-[rgb(8_14_20/0.42)] lg:hidden" />
            <D.Content className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[300px] border-r border-line bg-canvas shadow-pop lg:hidden">
              <D.Title className="sr-only">Navigation</D.Title>
              <D.Description className="sr-only">Bereiche und Seiten</D.Description>
              <Sidebar />
            </D.Content>
          </D.Portal>
        </D.Root>
        <main className="flex min-w-0 flex-1 flex-col">
          <OfflineBanner />
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <PasswordChangeGate />
    </ShellContext.Provider>
  )
}
