import {
  Home,
  MessageSquare,
  PackageOpen,
  Settings,
  Wrench,
} from 'lucide-react'
import type { LegacyPageId, NavItem, PageId } from '../../types/launcher'

export const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'library', label: 'Library', icon: PackageOpen },
  { id: 'community', label: 'Community', icon: MessageSquare },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const legacyPageMap: Record<Exclude<LegacyPageId, PageId>, PageId> = {
  runtime: 'library',
  modpacks: 'library',
  downloads: 'library',
  profiles: 'library',
  logs: 'tools',
  ecosystem: 'tools',
  servers: 'community',
  chat: 'community',
  publisher: 'home',
}

const currentPageIds = new Set<PageId>(navItems.map((item) => item.id))

export function normalizePageId(pageId?: string | null): PageId {
  if (!pageId) return 'home'
  if (currentPageIds.has(pageId as PageId)) return pageId as PageId
  return legacyPageMap[pageId as Exclude<LegacyPageId, PageId>] ?? 'home'
}

export function getVisibleNavItems(settings: { advancedMode?: boolean; creatorMode?: boolean }) {
  return navItems.filter((item) => {
    if (item.requiresCreator) return Boolean(settings.creatorMode)
    if (item.requiresAdvanced) return Boolean(settings.advancedMode || settings.creatorMode)
    return true
  })
}

export function getPageLabel(pageId: PageId) {
  return navItems.find((item) => item.id === normalizePageId(pageId))?.label ?? 'ECHO Launcher'
}
