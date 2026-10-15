import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
const KEY = 'kb-theme'

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const ThemeContext = createContext<{ theme: ThemeChoice; setTheme: (t: ThemeChoice) => void; dark: boolean }>({
  theme: 'system',
  setTheme: () => {},
  dark: false,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(read)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const setTheme = (t: ThemeChoice) => {
    setThemeState(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* privater Modus — dann eben nur für diese Sitzung */
    }
  }
  return <ThemeContext.Provider value={{ theme, setTheme, dark }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
