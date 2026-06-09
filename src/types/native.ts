import type { PackManifest } from './manifests'
import type { LauncherProfile } from './profiles'
import type { CanonicalReleaseIndexCatalog, EchoProtocolAction, LauncherDesktopSettings, MobileBridgeDeviceRole, MobileBridgeState, ReleaseEntry, ReleaseFetchResult, ReleaseIndex } from './releases'
import type { AccountState } from './auth'
import type { LaunchPreflightReport, LaunchProcessState, MinecraftLauncherDependencyStatus, MinecraftLauncherHandoffResult, MinecraftLauncherProfileStatus, MinecraftLaunchPlan } from './launch'
import type { AssetValidationReport, WorldCompatibilityReport } from './diagnostics'
import type { PackOsLauncherState } from './packos'
import type { MinecraftRuntimeModeId } from './standaloneRuntime'

export interface NativePaths {
  root: string
  playerContentRoot?: string
  instances: string
  runtime: string
  manifests: string
  profiles: string
  backups: string
  exports: string
  downloads: string
  logs: string
  releaseCache: string
  auth: string
  launch: string
  settings: string
}

export type { MobileBridgeDeviceRole, MobileBridgeState }

export interface NativePlatformInfo {
  kind: 'windows' | 'linux' | 'macos' | 'unsupported'
  compat?: 'wine'
  arch: string
  launcherSupport: 'native' | 'wine-compatible' | 'unsupported'
  updatesSupported: boolean
}

export interface RuntimeVerificationResult {
  ok: boolean
  minecraftVersion: string
  runtimePath: string
  checkedAt: string
  total: number
  valid: string[]
  missing: string[]
  corrupt: Array<{ path: string; expectedSha1?: string; actualSha1?: string; expectedSize?: number; actualSize?: number }>
  warnings: string[]
}

export interface MinecraftRuntimeStatus {
  ok: boolean
  minecraftVersion: string
  runtimePath: string
  installed: boolean
  missing: number
  corrupt: number
  warnings: string[]
  checkedAt: string
}

export interface MinecraftRuntimeInstallReport {
  ok: boolean
  minecraftVersion: string
  runtimePath: string
  generatedAt: string
  downloaded: string[]
  verified: string[]
  repaired: string[]
  skipped: string[]
  warnings: string[]
}

export interface DefaultPackExportReport {
  ok: boolean
  generatedAt: string
  sourcePath: string
  outputDir: string
  version: string
  channel: string
  minecraftVersion: string
  neoforgeVersion: string
  ramMb: number
  counts: {
    totalFiles: number
    modJars: number
    configFiles: number
  }
  artifact: {
    name: string
    path: string
    size: number
    sha256: string
  }
  manifest: {
    name: string
    path: string
    size: number
    sha256: string
  }
  release: {
    name: string
    path: string
  }
}

export interface ModpackExportOptions {
  profileId?: string
  sourcePath?: string
  installPath?: string
  outputDir?: string
  outputPath?: string
  manifestPath?: string
  version?: string
  extraIncludePaths?: string[]
  changelog?: string[]
  releaseNotes?: string[]
  includeResourcepacks?: boolean
  includeShaderpacks?: boolean
  includeServerSafeFiles?: boolean
  emitReleaseSidecars?: boolean
}

export interface ModpackExportReport {
  ok: boolean
  generatedAt: string
  sourcePath: string
  outputPath: string
  zipPath: string
  zipName: string
  version: string
  channel: string
  sha256: string
  size: number
  totalBytes: number
  counts: {
    totalFiles: number
    modJars: number
    configFiles: number
  }
  manifestPath: string
  releaseMetadataPath: string
  neededJarsPath?: string
  neededJarsCount?: number
  checksumsPath: string
  includedFolders: string[]
  excludedTopLevel: string[]
  warnings: string[]
  files: Array<{ path: string; size: number; sha256: string }>
}

export interface NativeJavaRuntime {
  path: string
  version: string
  major: number
  vendor: string
  valid: boolean
  warning?: string
}

export interface NativeJavaDetection {
  runtimes: NativeJavaRuntime[]
  preferred: NativeJavaRuntime | null
}

export interface NativeBootstrapState {
  protocolVersion: number
  platform: NativePlatformInfo
  paths: NativePaths
  profiles: LauncherProfile[]
  settings: LauncherDesktopSettings
  account: AccountState
  launch: LaunchProcessState
  launcherUpdate?: NativeLauncherUpdateState
  releaseIndex?: ReleaseIndex | null
  releaseIndexCatalog?: CanonicalReleaseIndexCatalog | null
  pendingProtocolAction?: EchoProtocolAction | null
}

export interface NativeAppState extends NativeBootstrapState {
  manifest: PackManifest
  java: NativeJavaDetection
}

export interface AppReadinessState {
  ok: boolean
  generatedAt: string
  profile: LauncherProfile
  install: {
    installed: boolean
    status: string
    installPath?: string
    manifestPath?: string
    version?: string
  }
  releaseFeed: {
    configured: boolean
    ok: boolean
    source: string
    releases: number
    latestVersion?: string
    fetchedAt?: string
    warnings: string[]
  }
  minecraftLauncher: Partial<MinecraftLauncherProfileStatus> & {
    ok: boolean
    warnings: string[]
  }
  packOs?: PackOsLauncherState
  logs: {
    available: boolean
    count: number
    latestName?: string
    latestModifiedAt?: string
  }
  settings: {
    advancedMode: boolean
    creatorMode: boolean
    launchMode: string
  }
  platform: {
    kind: 'windows' | 'linux' | 'macos' | 'unsupported'
    compat?: 'wine'
    arch: string
    launcherSupport: 'native' | 'wine-compatible' | 'unsupported'
    updatesSupported: boolean
    os: string
    release: string
    cpus: number
    totalMemory: number
  }
  warnings: string[]
}

export interface NativeVerifyResult {
  installPath: string
  scanned: number
  missing: string[]
  corrupt: string[]
  valid: string[]
  cacheHits?: number
  hashed?: number
  results: Array<{
    path: string
    status: 'valid' | 'missing' | 'corrupt'
    expected?: string
    actual?: string | null
    size: number
  }>
}

export interface NativeOperationStatus {
  operationId: string | null
  kind: 'idle' | 'operation' | 'install' | 'handoff'
  status: 'idle' | 'running' | 'completed' | 'failed'
  phaseId: string
  label: string
  progress: number
  message?: string
  startedAt: string | null
  updatedAt: string
  completedAt?: string
}

export interface NativeLoaderAshfallStatus {
  ok: boolean
  ready: boolean
  running: boolean
  pid?: number
  launcherRoot: string
  nativeWorkspace: string
  scriptPath: string
  commandPath: string
  fixtureRoot: string
  gameDir: string
  m31Ready: boolean
  m31ReportPath: string
  processReportPath: string
  lastProcessId?: number
  lastProcessLaunched: boolean
  warnings: string[]
  message: string
}

export interface NativeLoaderAshfallLaunchResult {
  ok: boolean
  profileId: string
  pid?: number
  message: string
  warnings: string[]
  status: NativeLoaderAshfallStatus
  state: LaunchProcessState
}

export type LauncherUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'unavailable'
  | 'failed'
  | 'unsupported'

export interface NativeLauncherUpdateState {
  currentVersion: string
  status: LauncherUpdateStatus
  feedOwner: string
  feedRepo: string
  allowPrerelease: boolean
  availableVersion?: string
  releaseName?: string
  releaseDate?: string
  releaseNotes: string[]
  progress: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
  updateReady: boolean
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
  manualInstallRequired?: boolean
  platform?: NativePlatformInfo
}

export interface NativeBackupResult {
  ok: boolean
  reason?: string
  sourcePath?: string | null
  backupPath?: string
}

export interface BackupRestoreResult {
  ok: boolean
  backupPath: string
  destinationPath: string
  restoredAt: string
  filesRestored: number
  warnings: string[]
}

export interface ServerPlanResult {
  ok: boolean
  profileId: string
  installPath: string
  outputDirectory: string
  estimatedSizeMb: number
  requiredJava: string
  neoforgeVersion: string
  files: string[]
  warnings: string[]
}

export interface NativeServerExportResult {
  ok: boolean
  outputDirectory: string
  copied: string[]
  warnings: string[]
  requiredJava: string
  neoforgeVersion: string
}

export interface NativeLogResult {
  files: Array<{ path: string; name: string; modifiedAt: string; size: number }>
  latest: string
}

export interface LogsExportResult {
  ok: boolean
  zipPath: string
  files: string[]
  size: number
  generatedAt: string
}

export interface EcosystemModuleScan {
  id: string
  name: string
  installedVersion: string
  latestVersion: string
  status: string
  requiredDependencies: string[]
  optionalIntegrations: string[]
  notes: string
  missing: string[]
  corrupt: string[]
}

export interface EcosystemScanResult {
  ok: boolean
  generatedAt: string
  installPath: string
  profile: LauncherProfile
  currentVersion: string
  latestVersion?: string
  verification: NativeVerifyResult
  modules: EcosystemModuleScan[]
  assetReports: AssetValidationReport[]
  warnings: string[]
}

export interface LoadoutApplyResult {
  ok: boolean
  profile: LauncherProfile
  loadoutPath: string
  enabledAddons: string[]
  disabledAddons: string[]
  movedEnabled: string[]
  movedDisabled: string[]
  warnings: string[]
}

export interface ClientOptionsApplyResult {
  ok: boolean
  optionsPath: string
  appliedAt: string
  warnings: string[]
}

export interface NativeRepairResult {
  ok: boolean
  repairId: string
  profileId: string
  installPath: string
  generatedAt: string
  repaired: string[]
  skipped: Array<{ path: string; reason: string }>
  warnings: string[]
  backupRoot?: string
  rollbackPlanPath?: string
  neoforge?: NativeNeoForgeResult
  before: NativeVerifyResult
  after: NativeVerifyResult
  reportPath: string
}

export interface NativeInstallResult {
  ok: boolean
  installId: string
  operation?: 'install' | 'update' | 'verify'
  profileId: string
  installPath: string
  generatedAt: string
  downloaded?: string[]
  updated?: string[]
  removed?: string[]
  installed: string[]
  verified: string[]
  skipped: Array<{ path: string; reason: string }>
  failed: Array<{ path: string; reason: string }>
  backupRoot?: string
  rollbackPlanPath?: string
  neoforge?: NativeNeoForgeResult
  runtime?: Partial<MinecraftRuntimeInstallReport>
  before: NativeVerifyResult
  after: NativeVerifyResult
  reportPath: string
}

export interface PublisherSettingsState {
  owner: string
  repo: string
  hasToken: boolean
}

export interface PublisherFile {
  path: string
  assetName: string
  sha256: string
  size: number
  required: boolean
  moduleId: string
  side: 'client' | 'server' | 'both'
}

export interface PublisherScanResult {
  ok: boolean
  generatedAt: string
  sourcePath: string
  version: string
  channel: string
  minecraftVersion: string
  neoforgeVersion: string
  ramMb: number
  counts: {
    totalFiles: number
    modJars: number
    configFiles: number
  }
  modules: string[]
  files: PublisherFile[]
  warnings: string[]
}

export interface PublisherDiffResult {
  ok: boolean
  generatedAt: string
  baselineVersion?: string
  targetVersion: string
  added: PublisherFile[]
  changed: PublisherFile[]
  unchanged: PublisherFile[]
  removed: PublisherFile[]
  upload: PublisherFile[]
  scan: PublisherScanResult
  warnings: string[]
}

export interface PublisherPublishResult {
  ok: boolean
  tagName: string
  releaseUrl: string
  manifestPath: string
  releaseMetadataPath: string
  artifactPath: string
  neededJarsPath?: string
  neededJarsCount?: number
  uploaded: Array<{ name: string; role: string; size: number }>
  reused: PublisherFile[]
  removed: PublisherFile[]
  warnings: string[]
}

export interface NativeHandoffPreparationPhase {
  id: string
  label: string
  status: 'running' | 'completed' | 'failed'
  timestamp: string
  message?: string
}

export interface NativeHandoffPreparationResult {
  ok: boolean
  profileId: string
  runtimeMode?: MinecraftRuntimeModeId
  runtimeLabel?: string
  operationId?: string
  phases: NativeHandoffPreparationPhase[]
  release: ReleaseEntry | null
  install: NativeInstallResult | null
  verification?: NativeVerifyResult | null
  handoff: MinecraftLauncherHandoffResult | null
  packOs?: PackOsLauncherState
  message: string
  warnings: string[]
}

export interface NativeDiagnosticExportResult {
  ok: boolean
  reportPath: string
  summary: {
    missing: number
    corrupt: number
    javaRuntimes: number
    logFiles: number
  }
}

export interface NativeNeoForgeResult {
  ok: boolean
  version: string
  installerPath?: string
  installPath?: string
  javaPath?: string
  mode?: 'client' | 'server'
  skipped?: boolean
  message: string
}

export interface NativeImportCandidate {
  id: string
  name: string
  path: string
  detectedBy: string[]
  moduleCount: number
  manifestPath?: string
  version?: string
  channel?: string
  alreadyManaged: boolean
}

export interface NativeImportResult {
  ok: boolean
  profile: LauncherProfile
  candidate: NativeImportCandidate
}

export type {
  AccountState,
  AssetValidationReport,
  LaunchPreflightReport,
  LaunchProcessState,
  MinecraftLauncherDependencyStatus,
  MinecraftLauncherHandoffResult,
  MinecraftLauncherProfileStatus,
  MinecraftLaunchPlan,
  WorldCompatibilityReport,
}

export type NativeLauncherSettings = LauncherDesktopSettings
export type { LauncherDesktopSettings, ReleaseFetchResult, ReleaseIndex }
