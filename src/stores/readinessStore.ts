import { create } from 'zustand'
import { invokeNative, isNativeAvailable } from '../services/nativeBridge'
import type { AppReadinessState } from '../types/native'

interface ReadinessStore {
  readiness: AppReadinessState | null
  loading: boolean
  error: string | null
  refreshReadiness: () => Promise<AppReadinessState | null>
}

let readinessInFlight: Promise<AppReadinessState | null> | null = null

export const useReadinessStore = create<ReadinessStore>()((set) => ({
  readiness: null,
  loading: false,
  error: null,
  refreshReadiness: () => {
    if (!isNativeAvailable()) return Promise.resolve(null)
    if (readinessInFlight) return readinessInFlight
    set({ loading: true, error: null })
    readinessInFlight = invokeNative('app:get-readiness')
      .then((readiness) => {
        set({ readiness, loading: false })
        return readiness
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to read launcher readiness.'
        set({ loading: false, error: message })
        return null
      })
      .finally(() => {
        readinessInFlight = null
      })
    return readinessInFlight
  },
}))
