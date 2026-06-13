import { create } from 'zustand'
import { invokeNative, isNativeAvailable } from '../services/nativeBridge'
import type { NativePackState } from '../types/native'

interface PackStateStore {
  states: Record<string, NativePackState>
  loading: Record<string, boolean>
  error: Record<string, string | null>
  refreshPackState: (profileId: string) => Promise<NativePackState | null>
  refreshManyPackStates: (profileIds: string[]) => Promise<Record<string, NativePackState>>
}

const packStateInFlight = new Map<string, Promise<NativePackState | null>>()

export const usePackStateStore = create<PackStateStore>()((set, get) => ({
  states: {},
  loading: {},
  error: {},
  refreshPackState: (profileId) => {
    if (!isNativeAvailable()) return Promise.resolve(null)
    const pending = packStateInFlight.get(profileId)
    if (pending) return pending
    set((state) => ({
      loading: { ...state.loading, [profileId]: true },
      error: { ...state.error, [profileId]: null },
    }))
    const request = invokeNative('app:get-pack-state', { profileId })
      .then((packState) => {
        set((state) => ({
          states: { ...state.states, [profileId]: packState },
          loading: { ...state.loading, [profileId]: false },
        }))
        return packState
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to read pack state.'
        set((state) => ({
          loading: { ...state.loading, [profileId]: false },
          error: { ...state.error, [profileId]: message },
        }))
        return null
      })
      .finally(() => {
        packStateInFlight.delete(profileId)
      })
    packStateInFlight.set(profileId, request)
    return request
  },
  refreshManyPackStates: async (profileIds) => {
    const uniqueIds = [...new Set(profileIds)]
    const results = await Promise.all(uniqueIds.map((profileId) => get().refreshPackState(profileId)))
    return Object.fromEntries(
      results
        .filter((packState): packState is NativePackState => Boolean(packState))
        .map((packState) => [packState.profile.id, packState]),
    ) as Record<string, NativePackState>
  },
}))
