import { create } from 'zustand'
import { invokeNative, isNativeAvailable } from '../services/nativeBridge'
import type { AppReadinessState } from '../types/native'

interface ReadinessStore {
  readiness: AppReadinessState | null
  loading: boolean
  error: string | null
  refreshReadiness: (profileId?: string) => Promise<AppReadinessState | null>
}

const readinessInFlight = new Map<string, Promise<AppReadinessState | null>>()

export const useReadinessStore = create<ReadinessStore>()((set) => ({
  readiness: null,
  loading: false,
  error: null,
  refreshReadiness: (profileId) => {
    if (!isNativeAvailable()) return Promise.resolve(null)
    const key = profileId ?? '__default__'
    const pending = readinessInFlight.get(key)
    if (pending) return pending
    set({ loading: true, error: null })
    const request = invokeNative('app:get-readiness', profileId ? { profileId } : undefined)
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
        readinessInFlight.delete(key)
      })
    readinessInFlight.set(key, request)
    return request
  },
}))
