import { create } from 'zustand'
import { releaseService } from '../services/ReleaseService'
import type { ReleaseIndex } from '../types/releases'

const RELEASE_CACHE_TTL_MS = 60_000

interface ReleaseStore {
  releaseIndex: ReleaseIndex | null
  loadingReleases: boolean
  releaseError: string | null
  lastLoadedAt: number
  inFlight: Promise<ReleaseIndex> | null
  setReleaseIndex: (index: ReleaseIndex | null) => void
  loadReleases: (refresh?: boolean) => Promise<ReleaseIndex>
}

export const useReleaseStore = create<ReleaseStore>()((set, get) => ({
  releaseIndex: null,
  loadingReleases: false,
  releaseError: null,
  lastLoadedAt: 0,
  inFlight: null,
  setReleaseIndex: (index) => {
    const acceptedCount = index?.acceptedCount ?? index?.releases.length ?? 0
    set({
      releaseIndex: index,
      releaseError: acceptedCount === 0 ? index?.warnings?.[0] ?? null : null,
      loadingReleases: false,
      lastLoadedAt: index ? Date.now() : 0,
      inFlight: null,
    })
  },
  loadReleases: async (refresh = false) => {
    const state = get()
    if (!refresh && state.releaseIndex && Date.now() - state.lastLoadedAt < RELEASE_CACHE_TTL_MS) {
      return state.releaseIndex
    }
    if (state.inFlight) return state.inFlight

    const request = releaseService
      .listReleases(refresh)
      .then((index) => {
        set({
          releaseIndex: index,
          loadingReleases: false,
          releaseError: null,
          lastLoadedAt: Date.now(),
          inFlight: null,
        })
        return index
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Configure the GitHub release feed in Settings.'
        set({ loadingReleases: false, releaseError: message, inFlight: null })
        throw error
      })

    set({ loadingReleases: true, releaseError: null, inFlight: request })
    return request
  },
}))
