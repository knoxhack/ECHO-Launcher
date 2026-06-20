import type { LogEntry } from './diagnostics'
import type { HealthStatus } from './launcher'
import type { NativeInstallResult, NativeVerifyResult } from './native'
import type { LauncherProfile } from './profiles'

export type LauncherRuntimeModeId = 'neoforge-minecraft' | 'native-loader-minecraft' | 'native-runtime'
export type MinecraftRuntimeModeId = Extract<LauncherRuntimeModeId, 'neoforge-minecraft' | 'native-loader-minecraft'>
export type StandaloneRuntimeModeId = LauncherRuntimeModeId

export type StandaloneRuntimeCheckSeverity = 'required' | 'recommended' | 'info'

export interface StandaloneRuntimeCheck {
  id: string
  label: string
  status: HealthStatus
  detail: string
  path?: string
  command?: string
  severity: StandaloneRuntimeCheckSeverity
}

export interface StandaloneRuntimeRepairAction {
  id: string
  title: string
  detail: string
  command?: string
  target?: string
  recommended?: boolean
  automated?: boolean
}

export interface StandaloneRuntimeSupportBundle {
  available: boolean
  entries: number
  reportPath?: string
}

export interface StandaloneRuntimeState {
  ok: boolean
  generatedAt: string
  runtimeRoot: string
  executablePath?: string
  version?: string
  checks: StandaloneRuntimeCheck[]
  repairPlan: StandaloneRuntimeRepairAction[]
  supportBundle: StandaloneRuntimeSupportBundle
  logs: LogEntry[]
  warnings: string[]
}

export interface StandaloneRuntimeLaunchPayload {
  runtimeRoot?: string
  profileId?: string
  installPath?: string
  manifestPath?: string
  packManifest?: string
  devAccount?: string
  operationId?: string
  quickPlayNewWorld?: boolean
}

export interface StandalonePackRepairBeforeLaunchResult {
  ok: boolean
  repaired: boolean
  profile: LauncherProfile
  installPath: string
  manifestPath?: string
  verification: NativeVerifyResult | null
  message?: string
  repair?: NativeInstallResult
}

export interface StandaloneRuntimeLaunchResult {
  ok: boolean
  profileId: string
  pid?: number
  executablePath?: string
  logPath?: string
  message: string
  warnings: string[]
  state: StandaloneRuntimeState | null
  packRepair?: StandalonePackRepairBeforeLaunchResult | null
}

export interface StandaloneRuntimeModeCard {
  id: StandaloneRuntimeModeId
  label: string
  eyebrow: string
  status: HealthStatus
  detail: string
  actionLabel: string
  disabledReason?: string
}

export interface StandaloneRuntimeLaunchButtonState {
  disabled: boolean
  label: string
  status: HealthStatus
  detail?: string
}
