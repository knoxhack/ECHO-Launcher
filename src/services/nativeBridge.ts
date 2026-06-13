import type {
  NativeAppState,
  NativeBootstrapState,
  AppReadinessState,
  BackupRestoreResult,
  ClientOptionsApplyResult,
  EcosystemScanResult,
  LoadoutApplyResult,
  LogsExportResult,
  NativeBackupResult,
  NativeImportCandidate,
  NativeImportResult,
  NativeJavaDetection,
  NativeLauncherSettings,
  NativeNeoForgeResult,
  AccountState,
  AssetValidationReport,
  LaunchPreflightReport,
  LaunchProcessState,
  MinecraftLauncherHandoffResult,
  MinecraftLauncherDependencyStatus,
  MinecraftLauncherProfileStatus,
  MinecraftLaunchPlan,
  NativeInstallResult,
  NativeHandoffPreparationResult,
  NativeLoaderAshfallLaunchResult,
  NativeLoaderAshfallStatus,
  NativeLauncherUpdateState,
  MinecraftRuntimeInstallReport,
  MinecraftRuntimeStatus,
  NativeLogResult,
  NativeOperationStatus,
  NativePackState,
  NativeDiagnosticExportResult,
  NativePaths,
  NativeRepairResult,
  NativeServerExportResult,
  ServerPlanResult,
  NativeVerifyResult,
  MobileBridgeDeviceRole,
  MobileBridgeState,
  ModpackExportOptions,
  ModpackExportReport,
  RuntimeVerificationResult,
  WorldCompatibilityReport,
  DefaultPackExportReport,
} from '../types/native'
import type { OfficialPackId, PackManifest } from '../types/manifests'
import type { CanonicalProductUpdate, CanonicalReleaseIndexCatalog, ReleaseFetchResult, ReleaseIndex } from '../types/releases'
import type { PackOsLauncherState } from '../types/packos'
import type { LauncherProfile } from '../types/profiles'
import type { Channel } from '../types/launcher'
import type { MinecraftRuntimeModeId, StandaloneRuntimeLaunchPayload, StandaloneRuntimeLaunchResult, StandaloneRuntimeState } from '../types/standaloneRuntime'

type NativeCommandMap = {
  'app:get-bootstrap-state': { payload: undefined; result: NativeBootstrapState }
  'app:get-state': { payload: undefined; result: NativeAppState }
  'app:get-pack-state': { payload: { profileId?: string } | undefined; result: NativePackState }
  'app:get-readiness': { payload: { profileId?: string } | undefined; result: AppReadinessState }
  'packos:get-state': { payload: undefined; result: PackOsLauncherState }
  'native-loader:get-status': { payload: undefined; result: NativeLoaderAshfallStatus }
  'native-loader:launch-ashfall': { payload: { operationId?: string; profileId?: string } | undefined; result: NativeLoaderAshfallLaunchResult }
  'standalone-runtime:get-state': { payload: { runtimeRoot?: string } | undefined; result: StandaloneRuntimeState }
  'standalone-runtime:launch': { payload: StandaloneRuntimeLaunchPayload | undefined; result: StandaloneRuntimeLaunchResult }
  'paths:get': { payload: undefined; result: NativePaths }
  'profile:list': { payload: undefined; result: LauncherProfile[] }
  'profile:save': { payload: LauncherProfile; result: LauncherProfile }
  'profile:duplicate': { payload: { profileId: string }; result: LauncherProfile }
  'manifest:load': { payload: { manifestPath?: string; channel?: Channel; version?: string; refresh?: boolean; pack?: OfficialPackId; profileId?: string } | undefined; result: PackManifest }
  'manifest:import': { payload: { filePath: string; profileId?: string; pack?: OfficialPackId }; result: { manifest: PackManifest; manifestPath: string } }
  'manifest:verify': {
    payload: { profileId?: string; pack?: OfficialPackId; installPath?: string; manifestPath?: string; manifest?: PackManifest }
    result: NativeVerifyResult
  }
  'settings:get': { payload: undefined; result: NativeLauncherSettings }
  'settings:save': { payload: Partial<NativeLauncherSettings>; result: NativeLauncherSettings }
  'mobile-bridge:get-state': { payload: undefined; result: MobileBridgeState }
  'mobile-bridge:create-pairing-code': { payload: undefined; result: MobileBridgeState }
  'mobile-bridge:approve-device': { payload: { requestId: string; role?: MobileBridgeDeviceRole }; result: MobileBridgeState }
  'mobile-bridge:deny-device': { payload: { requestId: string }; result: MobileBridgeState }
  'mobile-bridge:revoke-device': { payload: { deviceId: string }; result: MobileBridgeState }
  'mobile-bridge:restart': { payload: undefined; result: MobileBridgeState }
  'release:list': { payload: { refresh?: boolean } | undefined; result: ReleaseIndex }
  'release-index:catalog': { payload: { refresh?: boolean } | undefined; result: CanonicalReleaseIndexCatalog }
  'release-index:product': { payload: { id: string; compatibility?: string; refresh?: boolean }; result: CanonicalProductUpdate }
  'release:fetch-manifest': {
    payload: { channel: Channel; version?: string; refresh?: boolean; pack?: OfficialPackId }
    result: ReleaseFetchResult & { manifest: PackManifest }
  }
  'release:cache-clear': { payload: undefined; result: { ok: boolean } }
  'neoforge:ensure': {
    payload: { manifest?: PackManifest; installPath?: string; profileId?: string; channel?: Channel }
    result: NativeNeoForgeResult
  }
  'instance:scan-imports': { payload: { rootPath?: string } | undefined; result: NativeImportCandidate[] }
  'instance:import': { payload: { path: string; name?: string }; result: NativeImportResult }
  'auth:get-state': { payload: undefined; result: AccountState }
  'minecraft:install-runtime': {
    payload: { manifest?: PackManifest; minecraftVersion?: string; force?: boolean } | undefined
    result: MinecraftRuntimeInstallReport
  }
  'minecraft:verify-runtime': {
    payload: { manifest?: PackManifest; minecraftVersion?: string } | undefined
    result: RuntimeVerificationResult
  }
  'minecraft:repair-runtime': {
    payload: { manifest?: PackManifest; minecraftVersion?: string } | undefined
    result: MinecraftRuntimeInstallReport
  }
  'minecraft:get-runtime-status': {
    payload: { manifest?: PackManifest; minecraftVersion?: string } | undefined
    result: MinecraftRuntimeStatus
  }
  'operation:get-status': {
    payload: { operationId?: string } | undefined
    result: NativeOperationStatus
  }
  'launch:prepare-handoff': {
    payload: { profileId?: string; installPath?: string; ramGb?: number; version?: string; refreshRelease?: boolean; operationId?: string; updatePolicy?: 'allow' | 'skip'; runtimeMode?: MinecraftRuntimeModeId; prepareOnly?: boolean } | undefined
    result: NativeHandoffPreparationResult
  }
  'launch:preflight': { payload: { profileId: string; installPath?: string; ramGb?: number }; result: LaunchPreflightReport }
  'launch:build-command': { payload: { profileId: string; installPath?: string; ramGb?: number }; result: MinecraftLaunchPlan }
  'launch:start': { payload: { profileId: string; installPath?: string; ramGb?: number }; result: LaunchProcessState }
  'launch:stop': { payload: undefined; result: LaunchProcessState }
  'launch:read-log': { payload: undefined; result: { state: LaunchProcessState; log: string } }
  'launcher-update:get-state': { payload: undefined; result: NativeLauncherUpdateState }
  'launcher-update:check': { payload: undefined; result: NativeLauncherUpdateState }
  'launcher-update:download': { payload: undefined; result: NativeLauncherUpdateState }
  'launcher-update:install': { payload: undefined; result: NativeLauncherUpdateState }
  'minecraft-launcher:status': {
    payload: { profileId: string; installPath?: string; runtimeMode?: MinecraftRuntimeModeId }
    result: MinecraftLauncherProfileStatus
  }
  'minecraft-launcher:dependency-status': {
    payload: undefined
    result: MinecraftLauncherDependencyStatus
  }
  'minecraft-launcher:ensure-dependency': {
    payload: undefined
    result: MinecraftLauncherDependencyStatus
  }
  'minecraft-launcher:open': {
    payload: { ensure?: boolean; launcherExecutablePath?: string; launcherDependencySource?: 'system' | 'managed' | 'missing' } | undefined
    result: MinecraftLauncherDependencyStatus & { opened: boolean; openedLauncher: boolean; method?: string; warnings?: string[] }
  }
  'minecraft-launcher:handoff': {
    payload: { profileId: string; installPath?: string; ramGb?: number; runtimeMode?: MinecraftRuntimeModeId; prepareOnly?: boolean }
    result: MinecraftLauncherHandoffResult
  }
  'world:scan': { payload: { worldPath: string; profileId?: string }; result: WorldCompatibilityReport }
  'ecosystem:scan': { payload: { profileId?: string; installPath?: string } | undefined; result: EcosystemScanResult }
  'java:detect': { payload: undefined; result: NativeJavaDetection }
  'backup:create': { payload: { profileId: string; sourcePath?: string }; result: NativeBackupResult }
  'backup:restore': { payload: { backupPath: string; destinationPath: string }; result: BackupRestoreResult }
  'logs:read': { payload: { installPath?: string }; result: NativeLogResult }
  'logs:export': { payload: { profileId?: string; installPath?: string } | undefined; result: LogsExportResult }
  'asset:validate': { payload: { installPath: string; moduleId?: string; expected?: string[] }; result: AssetValidationReport }
  'server:plan': {
    payload: {
      profileId: string
      installPath?: string
      outputDir?: string
      includeConfigs?: boolean
      includeDatapacks?: boolean
      includeWorldBackup?: boolean
      ramGb?: number
      manifest?: PackManifest
    }
    result: ServerPlanResult
  }
  'server:generate': {
    payload: {
      profileId: string
      installPath?: string
      outputDir?: string
      includeConfigs?: boolean
      includeDatapacks?: boolean
      includeWorldBackup?: boolean
      ramGb?: number
      manifest?: PackManifest
    }
    result: NativeServerExportResult
  }
  'profile:apply-loadout': {
    payload: { profileId?: string; installPath?: string; enabledAddons: string[] }
    result: LoadoutApplyResult
  }
  'settings:apply-client-options': {
    payload: { profileId?: string; installPath?: string; options: Record<string, unknown> }
    result: ClientOptionsApplyResult
  }
  'install:run': {
    payload: {
      profileId: string
      installPath?: string
      manifest?: PackManifest
      manifestPath?: string
      channel?: Channel
      pack?: OfficialPackId
      version?: string
      operationId?: string
      refresh?: boolean
    }
    result: NativeInstallResult
  }
  'repair:run': {
    payload: {
      profileId: string
      installPath?: string
      manifest?: PackManifest
      manifestPath?: string
      backupConfigs?: boolean
      channel?: Channel
      pack?: OfficialPackId
      version?: string
    }
    result: NativeRepairResult
  }
  'pack:export-default': {
    payload: { sourcePath?: string; outputDir?: string; version?: string; channel?: Channel } | undefined
    result: DefaultPackExportReport
  }
  'pack:export': {
    payload: ModpackExportOptions | undefined
    result: ModpackExportReport
  }
  'diagnostic:export': {
    payload: { profileId: string; installPath?: string; manifest?: PackManifest }
    result: NativeDiagnosticExportResult
  }
  'download:file': { payload: { url: string; destination?: string; sha256?: string }; result: { destination: string; sha256: string; verified: boolean } }
  'dialog:select-directory': {
    payload: { title?: string; defaultPath?: string }
    result: { canceled: boolean; path: string | null }
  }
  'dialog:select-file': {
    payload: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }
    result: { canceled: boolean; path: string | null }
  }
  'shell:open-path': { payload: { path: string }; result: { ok: boolean } }
  'window:minimize': { payload: undefined; result: { ok: boolean } }
  'window:maximize-toggle': { payload: undefined; result: { ok: boolean } }
  'window:close': { payload: undefined; result: { ok: boolean } }
}

type NativeCommand = keyof NativeCommandMap

export class DesktopRequiredError extends Error {
  code = 'ECHO_DESKTOP_REQUIRED'

  constructor(message = 'ECHO Launcher Version 3 requires the desktop app. Run npm run desktop for native services.') {
    super(message)
    this.name = 'DesktopRequiredError'
  }
}

declare global {
  interface Window {
    echoNative?: {
      invoke: <Command extends NativeCommand>(
        command: Command,
        payload?: NativeCommandMap[Command]['payload'],
      ) => Promise<NativeCommandMap[Command]['result']>
    }
  }
}

export function isNativeAvailable() {
  return typeof window !== 'undefined' && Boolean(window.echoNative)
}

export function requireNative() {
  if (!isNativeAvailable()) {
    throw new DesktopRequiredError()
  }
}

export async function invokeNative<Command extends NativeCommand>(
  command: Command,
  payload?: NativeCommandMap[Command]['payload'],
): Promise<NativeCommandMap[Command]['result']> {
  if (!window.echoNative) {
    throw new DesktopRequiredError()
  }
  return window.echoNative.invoke(command, payload)
}
