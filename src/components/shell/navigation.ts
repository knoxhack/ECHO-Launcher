import {
  Activity,
  Boxes,
  DownloadCloud,
  FileText,
  Home,
  MessageSquare,
  Monitor,
  PackageOpen,
  UploadCloud,
  Server,
  Settings,
  Wrench,
} from 'lucide-react'
import type { NavItem, PageId } from '../../types/launcher'

export const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'runtime', label: 'Runtime', icon: Monitor },
  { id: 'modpacks', label: 'Official Packs', icon: PackageOpen },
  { id: 'profiles', label: 'Loadout', icon: Boxes },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'chat', label: 'Community', icon: MessageSquare },
  { id: 'ecosystem', label: 'ECHO Ecosystem', icon: Activity },
  { id: 'publisher', label: 'Publisher', icon: UploadCloud, requiresCreator: true },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'downloads', label: 'Downloads', icon: DownloadCloud },
  { id: 'logs', label: 'Logs', icon: FileText },
]

export function getVisibleNavItems(settings: { advancedMode?: boolean; creatorMode?: boolean }) {
  return navItems.filter((item) => {
    if (item.requiresCreator) return Boolean(settings.creatorMode)
    if (item.requiresAdvanced) return Boolean(settings.advancedMode || settings.creatorMode)
    return true
  })
}

export function getPageLabel(pageId: PageId) {
  return navItems.find((item) => item.id === pageId)?.label ?? 'ECHO Launcher'
}
