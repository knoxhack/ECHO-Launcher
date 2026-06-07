import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Channel, PageId, ToastMessage, ToastTone, ToolsTabId } from '../types/launcher'
import type { PackOsVariant } from '../types/packos'

interface LauncherStore {
  activePage: PageId
  selectedProfileId: string
  selectedChannel: Channel
  selectedVariant: PackOsVariant
  activeToolsTab: ToolsTabId
  desktopBackend: 'checking' | 'connected' | 'browser-preview' | 'error'
  toasts: ToastMessage[]
  setActivePage: (page: PageId) => void
  setSelectedProfileId: (profileId: string) => void
  setSelectedChannel: (channel: Channel) => void
  setSelectedVariant: (variant: PackOsVariant) => void
  setActiveToolsTab: (tab: ToolsTabId) => void
  setDesktopBackend: (status: LauncherStore['desktopBackend']) => void
  addToast: (title: string, detail?: string, tone?: ToastTone) => void
  removeToast: (toastId: string) => void
}

const defaultProfileId = 'ashfall-native-edition'
const selectableProfileIds = new Set(['ashfall-native-edition', 'standalone-runtime-showcase'])

function normalizeSelectedProfileId(profileId?: string) {
  if (profileId === 'ashfall' || profileId === 'ashfall-stable') return defaultProfileId
  if (profileId === 'ashfall-neoforge' || profileId === 'ashfall-native-loader') return defaultProfileId
  if (profileId === 'ashfall-standalone-runtime') return 'standalone-runtime-showcase'
  return profileId && selectableProfileIds.has(profileId) ? profileId : defaultProfileId
}

export const useLauncherStore = create<LauncherStore>()(
  persist(
    (set) => ({
      activePage: 'home',
      selectedProfileId: defaultProfileId,
      selectedChannel: 'alpha',
      selectedVariant: 'standard',
      activeToolsTab: 'repair',
      desktopBackend: 'checking',
      toasts: [],
      setActivePage: (activePage) => set({ activePage }),
      setSelectedProfileId: (selectedProfileId) => set({ selectedProfileId }),
      setSelectedChannel: (selectedChannel) => set({ selectedChannel }),
      setSelectedVariant: (selectedVariant) => set({ selectedVariant }),
      setActiveToolsTab: (activeToolsTab) => set({ activeToolsTab }),
      setDesktopBackend: (desktopBackend) => set({ desktopBackend }),
      addToast: (title, detail, tone = 'info') =>
        set((state) => ({
          toasts: [
            ...state.toasts,
            {
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              title,
              detail,
              tone,
            },
          ].slice(-4),
        })),
      removeToast: (toastId) =>
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== toastId),
        })),
    }),
    {
      name: 'echo-launcher-store',
      partialize: (state) => ({
        selectedProfileId: state.selectedProfileId,
        selectedChannel: state.selectedChannel,
        selectedVariant: state.selectedVariant,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<LauncherStore>),
        selectedProfileId: normalizeSelectedProfileId((persisted as Partial<LauncherStore>)?.selectedProfileId),
        selectedChannel: 'alpha',
        selectedVariant: (persisted as Partial<LauncherStore>)?.selectedVariant ?? 'standard',
        activeToolsTab: current.activeToolsTab,
        activePage: 'home',
        toasts: [],
      }),
    },
  ),
)
