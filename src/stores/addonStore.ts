import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildPresets, bundledAddons } from '../data/bundledAddons'

const requiredIds = bundledAddons.filter((addon) => addon.locked).map((addon) => addon.id)
const defaultEnabledIds = bundledAddons.filter((addon) => addon.defaultEnabled).map((addon) => addon.id)

interface AddonStore {
  enabledAddonIds: string[]
  toggleAddon: (addonId: string) => void
  applyPreset: (presetId: string) => void
}

export const useAddonStore = create<AddonStore>()(
  persist(
    (set) => ({
      enabledAddonIds: defaultEnabledIds,
      toggleAddon: (addonId) =>
        set((state) => {
          const addon = bundledAddons.find((item) => item.id === addonId)
          if (!addon || addon.locked) return state
          const enabled = new Set(state.enabledAddonIds)
          if (enabled.has(addonId)) {
            enabled.delete(addonId)
          } else {
            enabled.add(addonId)
            addon.dependencies.forEach((dependency) => enabled.add(dependency))
          }
          requiredIds.forEach((requiredId) => enabled.add(requiredId))
          return { enabledAddonIds: Array.from(enabled) }
        }),
      applyPreset: (presetId) =>
        set(() => {
          const preset = buildPresets.find((item) => item.id === presetId)
          const enabled = new Set([...(preset?.addonIds ?? defaultEnabledIds), ...requiredIds])
          return { enabledAddonIds: Array.from(enabled) }
        }),
    }),
    {
      name: 'echo-addon-store',
    },
  ),
)
