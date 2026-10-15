import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { post } from '@/lib/api'
import { qk } from '@/lib/queries'
import type { Space } from '@/lib/types'
import { TopBar } from '@/components/TopBar'
import { SpaceForm } from '@/components/SpaceForm'

export default function NewSpace() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <TopBar crumbs={[{ label: 'Neuer Bereich' }]} />
      <div className="mx-auto max-w-[560px] px-5 pt-12 pb-24 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight">Neuer Bereich</h1>
        <p className="mt-1.5 mb-8 text-sm text-ink-muted">Ein Bereich bündelt Seiten zu einem Thema oder Team. Du wirst automatisch verwaltendes Mitglied.</p>
        <SpaceForm submitLabel="Bereich anlegen" busy={busy} onSubmit={async (v) => {
          setBusy(true)
          try {
            const s = await post<Space>('/spaces', v)
            qc.invalidateQueries({ queryKey: qk.spaces })
            toast.success(`${s.name} angelegt`)
            navigate(`/s/${s.slug}`)
          } catch (e) {
            toast.error((e as Error).message)
            setBusy(false)
          }
        }} />
      </div>
    </div>
  )
}
