import type { Channel, HealthStatus } from './launcher'
import type { LauncherRuntimeModeId } from './standaloneRuntime'

export interface LauncherProfile {
  id: string
  name: string
  runtimeMode?: LauncherRuntimeModeId
  channel: Channel
  channelLabel: string
  version: string
  minecraft: string
  neoforge: string
  ramGb: number
  moduleCount: number
  lastPlayed: string
  playtime: string
  status: HealthStatus
  installPath?: string
  manifestPath?: string
  enabledAddons: string[]
}
