import { diffLines } from 'diff'
import type { Conflict } from '@/lib/types'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { DiffView } from './DiffView'

export function ConflictDialog({ conflict, mine, onKeepMine, onTakeTheirs, onClose }: {
  conflict: Conflict | null
  mine: string
  onKeepMine: () => void
  onTakeTheirs: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={!!conflict}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-3xl"
      title="Jemand hat die Seite inzwischen geändert"
      description={conflict ? `${conflict.updated_by ?? 'Jemand'} hat die Seite gespeichert, während du geschrieben hast. Unten siehst du, was deine Fassung gegenüber der gespeicherten ändern würde.` : undefined}
      footer={
        <>
          <Button onClick={onTakeTheirs}>Gespeicherte Fassung laden</Button>
          <Button variant="primary" onClick={onKeepMine}>Meine Fassung speichern</Button>
        </>
      }
    >
      {conflict ? <DiffView parts={diffLines(conflict.content_md, mine)} /> : null}
    </Dialog>
  )
}
