import { Link } from 'react-router'
import { Compass } from 'lucide-react'
import { TopBar } from '@/components/TopBar'
import { Button } from '@/components/ui/button'

export function NotFound({ what = 'Diese Seite' }: { what?: string }) {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-sunken text-ink-subtle">
          <Compass className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{what} gibt es nicht</h1>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-muted">
          Vielleicht wurde sie verschoben, gelöscht, oder dir fehlt der Zugriff auf ihren Bereich.
        </p>
        <Button asChild variant="primary" className="mt-7">
          <Link to="/">Zur Startseite</Link>
        </Button>
      </div>
    </div>
  )
}

export default function NotFoundPage() {
  return <NotFound />
}
