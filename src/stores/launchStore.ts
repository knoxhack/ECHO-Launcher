import { create } from 'zustand'
import type { LaunchProcessState } from '../types/launch'

interface LaunchStore {
  launchState: LaunchProcessState
  setLaunchState: (launchState: LaunchProcessState) => void
}

export const defaultLaunchState: LaunchProcessState = {
  active: false,
  status: 'idle',
  message: 'Minecraft is not running.',
}

export const useLaunchStore = create<LaunchStore>()((set) => ({
  launchState: defaultLaunchState,
  setLaunchState: (launchState) => set({ launchState }),
}))
