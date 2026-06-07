import { create } from 'zustand'
import { invokeNative, isNativeAvailable } from '../services/nativeBridge'
import type { PackOsLauncherState } from '../types/packos'

interface PackOsStore {
  packOs: PackOsLauncherState | null
  loading: boolean
  error: string | null
  refreshPackOs: () => Promise<PackOsLauncherState | null>
}

let packOsInFlight: Promise<PackOsLauncherState | null> | null = null

export const usePackOsStore = create<PackOsStore>()((set) => ({
  packOs: null,
  loading: false,
  error: null,
  refreshPackOs: () => {
    if (!isNativeAvailable()) return Promise.resolve(null)
    if (packOsInFlight) return packOsInFlight
    set({ loading: true, error: null })
    packOsInFlight = invokeNative('packos:get-state')
      .then((packOs) => {
        set({ packOs, loading: false })
        return packOs
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to read PackOS reports.'
        set({ loading: false, error: message })
        return null
      })
      .finally(() => {
        packOsInFlight = null
      })
    return packOsInFlight
  },
}))
