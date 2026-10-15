import { useNavigate } from 'react-router'
import { LogOut, Monitor, Moon, Shield, Sun, UserRound } from 'lucide-react'
import { DropdownMenu as M } from 'radix-ui'
import { useAuth } from '@/lib/auth'
import { useTheme, type ThemeChoice } from '@/lib/theme'
import { Avatar } from './ui/misc'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from './ui/menu'

const ROLE_LABEL = { admin: 'Administration', editor: 'Redaktion', reader: 'Lesen' } as const

export function UserMenu() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  if (!user) return null
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-line/60">
          <Avatar name={user.name} color={user.avatar_color} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">{user.name}</span>
            <span className="block truncate text-xs text-ink-subtle">{ROLE_LABEL[user.role]}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>{user.email}</MenuLabel>
        <MenuItem icon={<UserRound />} onSelect={() => navigate('/profile')}>Profil</MenuItem>
        {user.role === 'admin' ? <MenuItem icon={<Shield />} onSelect={() => navigate('/admin')}>Verwaltung</MenuItem> : null}
        <MenuSeparator />
        <M.Sub>
          <M.SubTrigger className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken data-[state=open]:bg-sunken [&_svg]:size-4 [&_svg]:text-ink-subtle">
            <ThemeIcon />
            Darstellung
          </M.SubTrigger>
          <M.Portal>
            <M.SubContent sideOffset={6} className="z-50 min-w-40 rounded-xl border border-line bg-surface p-1 shadow-pop">
              <MenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeChoice)}>
                <MenuRadioItem value="light">Hell</MenuRadioItem>
                <MenuRadioItem value="dark">Dunkel</MenuRadioItem>
                <MenuRadioItem value="system">Wie das System</MenuRadioItem>
              </MenuRadioGroup>
            </M.SubContent>
          </M.Portal>
        </M.Sub>
        <MenuSeparator />
        <MenuItem icon={<LogOut />} onSelect={() => void logout().then(() => navigate('/login'))}>Abmelden</MenuItem>
      </MenuContent>
    </Menu>
  )
}
