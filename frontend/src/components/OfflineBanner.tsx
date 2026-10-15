import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const down = () => setOffline(true)
    const up = () => setOffline(false)
    window.addEventListener('offline', down)
    window.addEventListener('kb:offline', down)
    window.addEventListener('online', up)
    const t = setInterval(() => {
      if (offline) fetch('/api/healthz').then((r) => r.ok && setOffline(false)).catch(() => {})
    }, 5000)
    return () => {
      window.removeEventListener('offline', down)
      window.removeEventListener('kb:offline', down)
      window.removeEventListener('online', up)
      clearInterval(t)
    }
  }, [offline])
  if (!offline) return null
  return (
    <div role="status" className="no-print flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm text-warn">
      <WifiOff className="size-4" />
      Keine Verbindung zum Server. Ungespeicherte Änderungen bleiben im Editor und werden erneut gesendet.
    </div>
  )
}
