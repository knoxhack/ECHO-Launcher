import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Channel, PageId, ToastMessage, ToastTone, ToolsTabId } from '../types/launcher'
import type { PackOsVariant } from '../types/packos'
import { normalizePageId } from '../components/shell/navigation'

interface LauncherStore {
  activePage: PageId
  selectedProfileId: string
  selectedChannel: Channel
  selectedVariant: PackOsVariant
  activeToolsTab: ToolsTabId
  desktopBackend: 'checking' | 'connected' | 'browser-preview' | 'error'
  launcherVersion: string
  toasts: ToastMessage[]
  setActivePage: (page: PageId) => void
  setSelectedProfileId: (profileId: string) => void
  setSelectedChannel: (channel: Channel) => void
  setSelectedVariant: (variant: PackOsVariant) => void
  setActiveToolsTab: (tab: ToolsTabId) => void
  setDesktopBackend: (status: LauncherStore['desktopBackend']) => void
  setLauncherVersion: (launcherVersion: string) => void
  addToast: (title: string, detail?: string, tone?: ToastTone) => void
  removeToast: (toastId: string) => void
}

const defaultProfileId = 'ashfall-native-edition'
const selectableProfileIds = new Set([
  'ashfall-native-edition',
  'ashfall-neoforge-edition',
  'ashfall-standalone-edition',
  'sky-relay-native-edition',
  'sky-relay-neoforge-edition',
  'sky-relay-standalone-edition',
  'openlands-native-edition',
  'openlands-neoforge-edition',
  'openlands-standalone-edition',
  'arcana-division-native-edition',
  'arcana-division-neoforge-edition',
  'arcana-division-standalone-edition',
  'galactic-survey-native-edition',
  'galactic-survey-neoforge-edition',
  'galactic-survey-standalone-edition',
])

function normalizeSelectedProfileId(profileId?: string) {
  if (profileId === 'ashfall' || profileId === 'ashfall-stable') return defaultProfileId
  if (profileId === 'ashfall-neoforge') return 'ashfall-neoforge-edition'
  if (profileId === 'ashfall-native-loader') return defaultProfileId
  if (profileId === 'ashfall-standalone-runtime' || profileId === 'standalone-runtime-showcase') return 'ashfall-standalone-edition'
  if (profileId === 'sky-relay' || profileId === 'sky-relay-native-loader') return 'sky-relay-native-edition'
  if (profileId === 'sky-relay-neoforge') return 'sky-relay-neoforge-edition'
  if (profileId === 'sky-relay-standalone-runtime') return 'sky-relay-standalone-edition'
  if (profileId === 'openlands' || profileId === 'openlands-native-loader' || profileId === 'openlans' || profileId === 'openlans-native-loader') return 'openlands-native-edition'
  if (profileId === 'openlands-neoforge' || profileId === 'openlans-neoforge') return 'openlands-neoforge-edition'
  if (profileId === 'openlands-standalone-runtime' || profileId === 'openlans-standalone-runtime') return 'openlands-standalone-edition'
  if (profileId === 'arcana-division' || profileId === 'arcana-division-native-loader' || profileId === 'arcane-division') return 'arcana-division-native-edition'
  if (profileId === 'arcana-division-neoforge') return 'arcana-division-neoforge-edition'
  if (profileId === 'arcana-division-standalone-runtime') return 'arcana-division-standalone-edition'
  if (profileId === 'galactic-survey' || profileId === 'galactic-survey-native-loader') return 'galactic-survey-native-edition'
  if (profileId === 'galactic-survey-neoforge') return 'galactic-survey-neoforge-edition'
  if (profileId === 'galactic-survey-standalone-runtime') return 'galactic-survey-standalone-edition'
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
      launcherVersion: '',
      toasts: [],
      setActivePage: (activePage) => set({ activePage }),
      setSelectedProfileId: (selectedProfileId) => set({ selectedProfileId }),
      setSelectedChannel: (selectedChannel) => set({ selectedChannel }),
      setSelectedVariant: (selectedVariant) => set({ selectedVariant }),
      setActiveToolsTab: (activeToolsTab) => set({ activeToolsTab }),
      setDesktopBackend: (desktopBackend) => set({ desktopBackend }),
      setLauncherVersion: (launcherVersion) => set({ launcherVersion }),
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
        activePage: state.activePage,
        selectedProfileId: state.selectedProfileId,
        selectedChannel: state.selectedChannel,
        selectedVariant: state.selectedVariant,
        activeToolsTab: state.activeToolsTab,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<LauncherStore>),
        selectedProfileId: normalizeSelectedProfileId((persisted as Partial<LauncherStore>)?.selectedProfileId),
        selectedChannel: (persisted as Partial<LauncherStore>)?.selectedChannel ?? 'alpha',
        selectedVariant: (persisted as Partial<LauncherStore>)?.selectedVariant ?? 'standard',
        activeToolsTab: (persisted as Partial<LauncherStore>)?.activeToolsTab ?? current.activeToolsTab,
        activePage: normalizePageId((persisted as Partial<LauncherStore>)?.activePage),
        toasts: [],
      }),
    },
  ),
)
