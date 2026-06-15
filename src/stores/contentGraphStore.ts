import { create } from 'zustand'
import { invokeNative, isNativeAvailable } from '../services/nativeBridge'
import type { InstalledContentGraphSummary } from '../types/native'

interface ContentGraphStore {
  graphs: Record<string, InstalledContentGraphSummary>
  loading: Record<string, boolean>
  loadInstalledContentGraph: (installPath: string) => Promise<InstalledContentGraphSummary | null>
}

const inFlight = new Map<string, Promise<InstalledContentGraphSummary | null>>()

export const useContentGraphStore = create<ContentGraphStore>()((set) => ({
  graphs: {},
  loading: {},
  loadInstalledContentGraph: async (installPath) => {
    if (!isNativeAvailable()) return null
    const pending = inFlight.get(installPath)
    if (pending) return pending
    set((state) => ({
      loading: { ...state.loading, [installPath]: true },
    }))
    const request = invokeNative('content-graph:load-installed', { installPath })
      .then((summary) => {
        set((state) => ({
          graphs: { ...state.graphs, [installPath]: summary },
          loading: { ...state.loading, [installPath]: false },
        }))
        return summary
      })
      .catch((error: unknown) => {
        const fallback: InstalledContentGraphSummary = {
          schema: 'echo.launcher.content_graph.v1',
          generatedAt: new Date().toISOString(),
          available: false,
          aggregate: null,
          modules: [],
          message: error instanceof Error ? error.message : 'Unable to load installed content graph.',
        }
        set((state) => ({
          graphs: { ...state.graphs, [installPath]: fallback },
          loading: { ...state.loading, [installPath]: false },
        }))
        return fallback
      })
      .finally(() => {
        inFlight.delete(installPath)
      })
    inFlight.set(installPath, request)
    return request
  },
}))
