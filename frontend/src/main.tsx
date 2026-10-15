import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ApiError } from '@/lib/api'
import { AuthProvider } from '@/lib/auth'
import { ThemeProvider, useTheme } from '@/lib/theme'
import { TipProvider } from '@/components/ui/misc'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

function ThemedToaster() {
  const { dark } = useTheme()
  return (
    <Toaster
      theme={dark ? 'dark' : 'light'}
      position="bottom-right"
      toastOptions={{ className: '!rounded-xl !border-line !bg-surface !text-ink !shadow-pop !font-sans' }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TipProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
              <ThemedToaster />
            </AuthProvider>
          </BrowserRouter>
        </TipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
