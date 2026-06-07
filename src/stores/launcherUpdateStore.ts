import { create } from 'zustand'
import { launcherUpdateService } from '../services/LauncherUpdateService'
import type { NativeLauncherUpdateState } from '../types/native'
import { mergeLauncherUpdateState } from '../utils/launcherUpdateState'

interface LauncherUpdateStore {
  state: NativeLauncherUpdateState | null
  loading: boolean
  error: string | null
  setState: (state: NativeLauncherUpdateState | null) => void
  refresh: () => Promise<NativeLauncherUpdateState | null>
  check: () => Promise<NativeLauncherUpdateState | null>
  download: () => Promise<NativeLauncherUpdateState | null>
  install: () => Promise<NativeLauncherUpdateState | null>
}

async function runUpdateAction(
  action: () => Promise<NativeLauncherUpdateState>,
  set: (partial: Partial<LauncherUpdateStore> | ((state: LauncherUpdateStore) => Partial<LauncherUpdateStore>)) => void,
) {
  set({ loading: true, error: null })
  try {
    const next = await action()
    set((current) => ({
      state: mergeLauncherUpdateState(current.state, next),
      loading: false,
      error: next.error ?? null,
    }))
    return next
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Launcher update action failed.'
    set({ loading: false, error: message })
    return null
  }
}

export const useLauncherUpdateStore = create<LauncherUpdateStore>()((set) => ({
  state: null,
  loading: false,
  error: null,
  setState: (state) => set({ state, error: state?.error ?? null }),
  refresh: () => runUpdateAction(() => launcherUpdateService.getState(), set),
  check: () => runUpdateAction(() => launcherUpdateService.check(), set),
  download: () => runUpdateAction(() => launcherUpdateService.download(), set),
  install: () => runUpdateAction(() => launcherUpdateService.install(), set),
}))
