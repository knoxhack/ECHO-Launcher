export type PackOsUiState =
  | 'ready'
  | 'playable_with_warnings'
  | 'degraded'
  | 'needs_repair'
  | 'repair_available'
  | 'manual_review_required'
  | 'blocked'
  | 'unsupported'
  | 'not_installed'
  | 'unknown'

export type PackOsReportStatus = 'loaded' | 'missing' | 'invalid' | 'unreadable'

export type PackOsVariant = 'standard' | 'performance' | 'cinematic' | 'server' | 'creator' | 'dev' | 'unknown'

export type PackOsChannel = 'stable' | 'beta' | 'alpha' | 'nightly' | 'dev-local' | 'experimental' | 'unknown'

export interface PackOsReportRef {
  fileName: string
  path?: string
  status: PackOsReportStatus
  schema?: string
  generatedAt?: string
  warnings: string[]
}

export interface PackOsLauncherPackState {
  packId: string
  name: string
  selected: boolean
  launcherVisible: boolean
  publicRelease: boolean
  storefrontReady: boolean
  variant: PackOsVariant | string
  channel: PackOsChannel | string
  saveCompatibilityVersion: string
  readinessStatus: string
  lockfileStatus: string
  installStateStatus: string
  repairPlanStatus: string
  healthStatus: string
  recoveryMode: string
  safeForLauncher: boolean
  launchAllowed: boolean
  uiState: PackOsUiState
  blockingReasons: string[]
  warnings: string[]
  reportPaths: Record<string, string>
  safeCommands: string[]
}

export interface PackOsLauncherState {
  ok: boolean
  generatedAt: string
  status: PackOsUiState
  source: 'launcher-status' | 'pack-doctor-fallback' | 'missing' | 'error'
  reportRoot?: string
  selectedPackId: string
  selectedPack: PackOsLauncherPackState
  packs: PackOsLauncherPackState[]
  reports: PackOsReportRef[]
  warnings: string[]
  safeCommands: string[]
}
