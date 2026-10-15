import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, get, post, setCsrfToken } from './api'
import type { Me } from './types'

interface AuthState {
  user: Me | null
  loading: boolean
  refresh: () => Promise<Me | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  const refresh = useCallback(async () => {
    try {
      const me = await get<{ user: Me; csrf_token: string }>('/auth/me')
      setCsrfToken(me.csrf_token)
      setUser(me.user)
      return me.user
    } catch (e) {
      if (!(e instanceof ApiError) || e.status === 401) setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout')
    } finally {
      setCsrfToken('')
      setUser(null)
      qc.clear()
    }
  }, [qc])

  useEffect(() => {
    void refresh()
    const onUnauthorized = () => {
      setUser(null)
      qc.clear()
    }
    window.addEventListener('kb:unauthorized', onUnauthorized)
    return () => window.removeEventListener('kb:unauthorized', onUnauthorized)
  }, [refresh, qc])

  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth außerhalb von AuthProvider')
  return ctx
}

export function useMe(): Me {
  const { user } = useAuth()
  if (!user) throw new Error('Nicht angemeldet')
  return user
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) {
    const next = location.pathname + location.search
    return <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />
  }
  return <>{children}</>
}
