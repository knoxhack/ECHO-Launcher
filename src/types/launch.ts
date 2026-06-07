import type { NativeJavaRuntime, NativeVerifyResult, RuntimeVerificationResult } from './native'
import type { MinecraftRuntimeModeId } from './standaloneRuntime'

export interface LaunchBlocker {
  id: string
  severity: 'warning' | 'critical'
  message: string
  action: string
}

export interface LaunchPreflightReport {
  ok: boolean
  profileId: string
  installPath: string
  checkedAt: string
  java: NativeJavaRuntime | null
  verification: NativeVerifyResult
  runtimeVerification?: RuntimeVerificationResult
  accountLinked: boolean
  sessionReady: boolean
  neoforgeReady: boolean
  ramGb: number
  blockers: LaunchBlocker[]
}

export interface MinecraftLaunchPlan {
  profileId: string
  installPath: string
  javaPath: string
  mainClass: string
  classpath: string[]
  jvmArgs: string[]
  gameArgs: string[]
  commandPreview: string
  logPath: string
  createdAt: string
}

export interface MinecraftLauncherProfileStatus {
  ok: boolean
  runtimeMode?: MinecraftRuntimeModeId
  runtimeLabel?: string
  minecraftRoot?: string
  launcherProfilesPath?: string
  profileId: string
  launcherProfileId?: string
  profileName: string
  profileExists: boolean
  profileCurrent: boolean
  versionId: string
  versionReady: boolean
  versionSource?: 'installed' | 'echo-managed' | 'missing' | 'invalid'
  versionMetadataPath?: string
  gameDir: string
  warnings: string[]
  launcherDependencySource?: 'system' | 'managed' | 'missing'
  launcherExecutablePath?: string
  launcherInstallPath?: string
  launcherInstallLogPath?: string
  launcherDependencyWarnings?: string[]
}

export interface MinecraftLauncherHandoffResult extends MinecraftLauncherProfileStatus {
  backupPath?: string
  openedLauncher: boolean
  openMethod?: string
  preparedVersionMetadata?: boolean
  removedLauncherProfiles?: string[]
  launcherProfileWarnings?: string[]
  validatedGameDir?: string
  validatedModsCount?: number
  updatedProfile: boolean
  message: string
}

export interface MinecraftLauncherDependencyStatus {
  ok: boolean
  launcherDependencySource: 'system' | 'managed' | 'missing'
  launcherExecutablePath?: string
  launcherInstallPath?: string
  launcherInstallLogPath?: string
  launcherDependencyWarnings: string[]
  installAction?: {
    method: string
    detail: string
    urls: string[]
  }
  distroFamily?: 'debian' | 'arch' | 'rpm' | 'other'
  installerMethod?: string
}

export interface LaunchProcessState {
  active: boolean
  pid?: number
  profileId?: string
  startedAt?: string
  exitedAt?: string
  exitCode?: number | null
  logPath?: string
  status: 'idle' | 'preflight_failed' | 'starting' | 'running' | 'stopped' | 'exited' | 'failed' | 'handoff'
  message: string
}
