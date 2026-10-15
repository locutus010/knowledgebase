import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, FolderInput, History, MoreHorizontal, Printer, Trash2 } from 'lucide-react'
import { del } from '@/lib/api'
import { canEdit, qk } from '@/lib/queries'
import type { Page } from '@/lib/types'
import { Button } from './ui/button'
import { Confirm } from './ui/dialog'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './ui/menu'
import { MovePageDialog } from './MovePageDialog'

export function PageMenu({ page, onTrashed }: { page: Page; onTrashed: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [moving, setMoving] = useState(false)
  const editable = canEdit(page.my_level)

  const trash = async () => {
    try {
      await del(`/pages/${page.id}`)
      qc.invalidateQueries({ queryKey: qk.tree(page.space.slug) })
      qc.invalidateQueries({ queryKey: qk.home })
      qc.removeQueries({ queryKey: qk.page(page.id) })
      toast.success(`„${page.title}“ liegt im Papierkorb`)
      onTrashed()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Weitere Aktionen">
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={<History />} onSelect={() => navigate(`/p/${page.id}/history`)}>Versionen</MenuItem>
          <MenuItem icon={<Download />} onSelect={() => { window.location.href = `/api/v1/pages/${page.id}/export.md` }}>Als Markdown herunterladen</MenuItem>
          <MenuItem icon={<Printer />} onSelect={() => setTimeout(() => window.print(), 50)}>Drucken oder als PDF sichern</MenuItem>
          {editable ? (
            <>
              <MenuSeparator />
              <MenuItem icon={<FolderInput />} onSelect={() => setMoving(true)}>Verschieben</MenuItem>
              <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirm(true)}>In den Papierkorb</MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      <Confirm
        open={confirm}
        onOpenChange={setConfirm}
        title="In den Papierkorb legen?"
        description={`„${page.title}“ und alle Unterseiten verschwinden aus dem Baum und der Suche. Aus dem Papierkorb lassen sie sich wiederherstellen.`}
        confirmLabel="In den Papierkorb"
        danger
        onConfirm={() => void trash()}
      />
      {moving ? <MovePageDialog page={page} onClose={() => setMoving(false)} /> : null}
    </>
  )
}
