import { create } from 'zustand'
import { standaloneRuntimeService } from '../services/StandaloneRuntimeService'
import { isNativeAvailable } from '../services/nativeBridge'
import type {
  StandaloneRuntimeLaunchPayload,
  StandaloneRuntimeLaunchResult,
  StandaloneRuntimeModeId,
  StandaloneRuntimeState,
} from '../types/standaloneRuntime'

interface StandaloneRuntimeStore {
  state: StandaloneRuntimeState | null
  selectedMode: StandaloneRuntimeModeId
  loading: boolean
  launching: boolean
  error: string | null
  lastLaunch: StandaloneRuntimeLaunchResult | null
  setSelectedMode: (mode: StandaloneRuntimeModeId) => void
  refresh: (runtimeRoot?: string, profileId?: string) => Promise<StandaloneRuntimeState | null>
  launchStandalone: (payload?: StandaloneRuntimeLaunchPayload) => Promise<StandaloneRuntimeLaunchResult | null>
}

let runtimeRefreshInFlight: Promise<StandaloneRuntimeState | null> | null = null

export const useStandaloneRuntimeStore = create<StandaloneRuntimeStore>()((set, get) => ({
  state: null,
  selectedMode: 'standalone-engine',
  loading: false,
  launching: false,
  error: null,
  lastLaunch: null,
  setSelectedMode: (selectedMode) => set({ selectedMode }),
  refresh: (runtimeRoot, profileId) => {
    if (!isNativeAvailable()) {
      set({ error: 'Standalone runtime verification requires the desktop shell.', loading: false })
      return Promise.resolve(null)
    }
    if (runtimeRefreshInFlight) return runtimeRefreshInFlight
    set({ loading: true, error: null })
    const selectedMode = get().selectedMode
    runtimeRefreshInFlight = standaloneRuntimeService
      .getState(runtimeRoot, selectedMode, profileId)
      .then((state) => {
        set({ state, loading: false, error: null })
        return state
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to verify standalone runtime.'
        set({ loading: false, error: message })
        return null
      })
      .finally(() => {
        runtimeRefreshInFlight = null
      })
    return runtimeRefreshInFlight
  },
  launchStandalone: async (payload = {}) => {
    if (!isNativeAvailable()) {
      set({ error: 'Standalone runtime launch requires the desktop shell.' })
      return null
    }
    set({ launching: true, error: null })
    const selectedMode = get().selectedMode
    try {
      const result = await standaloneRuntimeService.launch(payload, selectedMode)
      set({ launching: false, state: result.state, lastLaunch: result, error: result.ok ? null : result.message })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to launch standalone runtime.'
      set({ launching: false, error: message })
      return null
    }
  },
}))
