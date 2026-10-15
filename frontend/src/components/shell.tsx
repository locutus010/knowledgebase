import { createContext, useContext } from 'react'

export const ShellContext = createContext<{ openNav: () => void; openPalette: () => void }>({
  openNav: () => {},
  openPalette: () => {},
})
export const useShell = () => useContext(ShellContext)
