const { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const fssync = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const { Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { execFile, spawn } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const zlib = require('node:zlib')
const AdmZip = require('adm-zip')
const {
  ECHO_MODULE_RELEASE_DOWNLOAD_TAGS,
  githubAssetSha256,
  moduleArtifactFamilyForPack,
  moduleArtifactName,
  moduleReleaseAssetsFromChecksumText,
  moduleReleaseAssetsFromMetadata,
  releaseAssetUrl,
  resolveManifestReleaseAssets,
  resolveModuleRequirements,
  validateZipManifestReleaseAssets,
} = require('./release-assets.cjs')
const { isNewerPackVersion, versionParts } = require('./version-compare.cjs')
const {
  BLOCKING_UI_STATES,
  readPackOsStateFromRoot,
  unknownPackOsState,
} = require('./packos-reports.cjs')
const {
  buildAndroidCommandCenterSnapshot,
  buildBridgeApiUrl,
  buildMobileBridgeHealth,
  canRunMobileAction,
  createPairingSession,
  denyPendingDevice,
  approvePendingDevice,
  authenticateDevice,
  getLanAddress,
  isRunningMobileOperation,
  mapMobileAction,
  normalizeMobileBridgeSettings,
  publicMobileBridgeState,
  requestPairing,
  revokePairedDevice,
} = require('./mobile-bridge.cjs')
const {
  buildPlatformInfo,
  commonImportRootsForPlatform,
  javaSearchConfigForPlatform,
  launcherUpdateUnsupportedMessage,
  launcherUpdatesSupportedForPlatform,
  linuxMinecraftLauncherCandidates,
  minecraftLauncherExecutableCandidatesForPlatform,
  minecraftLauncherRootsForPlatform,
} = require('./platform-support.cjs')
const {
  materializeNativeLoaderAddons,
  nativeBootstrapGameArguments,
  nativeBootstrapJvmArguments,
  nativeLauncherArgumentStatus,
  nativeModuleClasspathEntries,
} = require('./native-loader-handoff.cjs')
const {
  assertSelectedManifestPack,
  normalizeOfficialPackId,
  canonicalArtifactRecords,
  artifactForPackTarget,
  dependencyClosure,
  parseEchoProtocolUrl,
  resolveEchoProtocolEntry,
  releaseEntryFromCanonicalModpack,
  productUpdateArtifact,
  productUpdateSelection,
} = require('./release-index-resolver.mjs')
let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch {
  autoUpdater = null
}

const APP_PROTOCOL_VERSION = 3
const APP_ID = 'com.echo.launcher'
const APP_NAME = 'ECHO Launcher'
const LAUNCHER_UPDATE_OWNER = 'knoxhack'
const LAUNCHER_UPDATE_REPO = 'ECHO-Launcher'
const LAUNCHER_UPDATE_STREAM = 'public'
const MODULE_RELEASE_OWNER = 'knoxhack'
const MODULE_RELEASE_REPO = 'ECHO-Modules'
const CANONICAL_RELEASE_INDEX_CHANNEL_URL = 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/launcher-channel.json'
const MINECRAFT_DOWNLOAD_URL = 'https://www.minecraft.net/en-us/download'
const MINECRAFT_HELP_URL = 'https://help.minecraft.net/hc/en-us/articles/23907917790093-How-to-Download-and-Install-the-Minecraft-Launcher'
const MINECRAFT_WINDOWS_DOWNLOAD_URL = 'https://aka.ms/minecraftClientGameCoreWindows'
const MINECRAFT_WINDOWS_STORE_URL = 'ms-windows-store://pdp/?ProductId=9PGW18NPBZV5'
const MINECRAFT_WINDOWS_WINGET_ID = 'Mojang.MinecraftLauncher'
const MINECRAFT_LINUX_DEB_URL = 'https://launcher.mojang.com/download/Minecraft.deb'
const MINECRAFT_LINUX_TAR_URL = 'https://launcher.mojang.com/download/Minecraft.tar.gz'
const ECHO_NATIVE_LOADER_VERSION = '1.0.1'
const ECHO_NATIVE_LOADER_LIBRARY_NAME = `com.echo:native-loader:${ECHO_NATIVE_LOADER_VERSION}`
const ECHO_NATIVE_LOADER_LIBRARY_PATH = `com/echo/native-loader/${ECHO_NATIVE_LOADER_VERSION}/native-loader-${ECHO_NATIVE_LOADER_VERSION}.jar`
const ECHO_NATIVE_LOADER_DOWNLOAD_URL = 'https://github.com/knoxhack/ECHO-Native-Platform/releases/download/v1.0.1/echo-native-loader-1.0.1.jar'
const ECHO_NATIVE_LOADER_SHA1 = '8e04a73e3dda61021ed2bbf24165c4a7930ea01c'
const ECHO_NATIVE_LOADER_SIZE = 1_828_904
const ECHO_NATIVE_LOADER_PUBLIC_FILE_NAME = `echo-native-loader-${ECHO_NATIVE_LOADER_VERSION}.jar`
const ECHO_NATIVE_LOADER_LIBRARY_FILE_NAME = `native-loader-${ECHO_NATIVE_LOADER_VERSION}.jar`
const ECHO_NATIVE_LOADER_MAIN_CLASS = 'com.echo.NativeLoaderClient'
const RELEASE_METADATA_ASSET = 'echo-release.json'
const RELEASE_CACHE_VERSION = 4
const LEGACY_ASHFALL_PROFILE_ID = 'ashfall'
const CANONICAL_PROFILE_ID = 'ashfall-native-edition'
const CANONICAL_PROFILE_NAME = 'Ashfall Native Edition'
const CANONICAL_CHANNEL = 'alpha'
const CANONICAL_VERSION = 'Catalog latest'
const OFFICIAL_PACK_IDS = new Set([
  'ashfall-native-edition',
  'ashfall-neoforge-edition',
  'ashfall-standalone-edition',
  'sky-relay-native-edition',
  'sky-relay-neoforge-edition',
  'sky-relay-standalone-edition',
  'galactic-survey-native-edition',
  'galactic-survey-neoforge-edition',
  'galactic-survey-standalone-edition',
  'openlands-native-edition',
  'openlands-neoforge-edition',
  'openlands-standalone-edition',
  'arcana-division-native-edition',
  'arcana-division-neoforge-edition',
  'arcana-division-standalone-edition',
])
const ASHFALL_RUNTIME_PACK_IDS = new Set(['ashfall-native-edition', 'ashfall-neoforge-edition', 'ashfall-standalone-edition'])
const ASHFALL_PROFILE_DEFINITIONS = [
  {
    id: 'ashfall-native-edition',
    name: 'Ashfall Native Edition',
    runtimeMode: 'native-loader-minecraft',
    channel: 'alpha',
    channelLabel: 'Alpha',
    installFolder: 'Ashfall Native Edition',
    minecraft: '26.1.2',
    neoforge: 'N/A',
  },
  {
    id: 'ashfall-neoforge-edition',
    name: 'Ashfall NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    channel: 'alpha',
    channelLabel: 'Alpha',
    installFolder: 'Ashfall NeoForge Edition',
    minecraft: '26.1.2',
    neoforge: '26.1.2',
  },
  {
    id: 'ashfall-standalone-edition',
    name: 'Ashfall Standalone Edition',
    runtimeMode: 'native-runtime',
    channel: 'experimental',
    channelLabel: 'Experimental',
    installFolder: 'Ashfall Standalone Edition',
    minecraft: 'Standalone',
    neoforge: 'N/A',
  },
  {
    id: 'sky-relay-native-edition',
    name: 'Sky Relay Native Edition',
    runtimeMode: 'native-loader-minecraft',
    channel: 'alpha',
    channelLabel: 'Alpha',
    installFolder: 'Sky Relay Native Edition',
    minecraft: '26.1.2',
    neoforge: 'N/A',
  },
  {
    id: 'sky-relay-neoforge-edition',
    name: 'Sky Relay NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    channel: 'alpha',
    channelLabel: 'Alpha',
    installFolder: 'Sky Relay NeoForge Edition',
    minecraft: '26.1.2',
    neoforge: '26.1.2',
  },
  {
    id: 'sky-relay-standalone-edition',
    name: 'Sky Relay Standalone Edition',
    runtimeMode: 'native-runtime',
    channel: 'alpha',
    channelLabel: 'Alpha',
    installFolder: 'Sky Relay Standalone Edition',
    minecraft: 'Standalone',
    neoforge: 'N/A',
  },
  {
    id: 'galactic-survey-native-edition',
    name: 'Galactic Survey Native Edition',
    runtimeMode: 'native-loader-minecraft',
    channel: 'alpha',
    channelLabel: 'Draft',
    installFolder: 'Galactic Survey Native Edition',
    minecraft: '26.1.2',
    neoforge: 'N/A',
  },
  {
    id: 'galactic-survey-neoforge-edition',
    name: 'Galactic Survey NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    channel: 'alpha',
    channelLabel: 'Draft',
    installFolder: 'Galactic Survey NeoForge Edition',
    minecraft: '26.1.2',
    neoforge: '26.1.2',
  },
  {
    id: 'galactic-survey-standalone-edition',
    name: 'Galactic Survey Standalone Edition',
    runtimeMode: 'native-runtime',
    channel: 'alpha',
    channelLabel: 'Draft',
    installFolder: 'Galactic Survey Standalone Edition',
    minecraft: 'Standalone',
    neoforge: 'N/A',
  },
  {
    id: 'openlands-native-edition',
    name: 'Openlands Native Edition',
    runtimeMode: 'native-loader-minecraft',
    channel: 'alpha',
    channelLabel: 'Planned',
    installFolder: 'Openlands Native Edition',
    minecraft: '26.1.2',
    neoforge: 'N/A',
  },
  {
    id: 'openlands-neoforge-edition',
    name: 'Openlands NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    channel: 'alpha',
    channelLabel: 'Planned',
    installFolder: 'Openlands NeoForge Edition',
    minecraft: '26.1.2',
    neoforge: '26.1.2',
  },
  {
    id: 'openlands-standalone-edition',
    name: 'Openlands Standalone Edition',
    runtimeMode: 'native-runtime',
    channel: 'experimental',
    channelLabel: 'Experimental',
    installFolder: 'Openlands Standalone Edition',
    minecraft: 'Standalone',
    neoforge: 'N/A',
  },
  {
    id: 'arcana-division-native-edition',
    name: 'Arcana Division Native Edition',
    runtimeMode: 'native-loader-minecraft',
    channel: 'beta',
    channelLabel: 'Beta',
    installFolder: 'Arcana Division Native Edition',
    minecraft: '26.1.2',
    neoforge: 'N/A',
  },
  {
    id: 'arcana-division-neoforge-edition',
    name: 'Arcana Division NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    channel: 'beta',
    channelLabel: 'Beta',
    installFolder: 'Arcana Division NeoForge Edition',
    minecraft: '26.1.2',
    neoforge: '26.1.2',
  },
  {
    id: 'arcana-division-standalone-edition',
    name: 'Arcana Division Standalone Edition',
    runtimeMode: 'native-runtime',
    channel: 'beta',
    channelLabel: 'Beta',
    installFolder: 'Arcana Division Standalone Edition',
    minecraft: 'Standalone',
    neoforge: 'N/A',
  },
]
const KNOWN_ASHFALL_INSTANCE_PATHS = process.platform === 'win32' ? ['C:\\CurseForge\\Instances\\Ashfall Protocol'] : []
const CHANNELS = new Set([CANONICAL_CHANNEL, 'beta', 'experimental'])
const PACK_CHANNELS = [CANONICAL_CHANNEL, 'beta', 'experimental']
const OFFICIAL_SERVER_STALE_MS = 120_000
const OFFICIAL_SERVER_STATUS_URL = process.env.ECHO_OFFICIAL_SERVER_STATUS_URL || 'https://api.echoplatform.dev/status.json'
const OFFICIAL_COMMUNITY_API_URL = process.env.ECHO_COMMUNITY_API_URL || 'https://api.echoplatform.dev'
const OFFICIAL_COMMUNITY_WEBSOCKET_URL = process.env.ECHO_COMMUNITY_WEBSOCKET_URL || 'wss://api.echoplatform.dev/v1/chat/socket'
const DEFAULT_DESKTOP_SETTINGS = {
  releaseIndex: {
    enabled: true,
    channelUrl: CANONICAL_RELEASE_INDEX_CHANNEL_URL,
  },
  supportGuideUrl: '',
  launchMode: 'minecraft_launcher',
  advancedMode: false,
  creatorMode: false,
  officialServerStatusUrl: OFFICIAL_SERVER_STATUS_URL,
  officialDiscordInviteUrl: '',
  officialServerName: 'Ashfall Official',
  officialStatusPollSeconds: 30,
  communityApiUrl: OFFICIAL_COMMUNITY_API_URL,
  communityWebSocketUrl: OFFICIAL_COMMUNITY_WEBSOCKET_URL,
  communityChatPortMigrationVersion: 2,
  chatNickname: 'Launcher Player',
  chatNotifications: true,
  packOsReportRoot: '',
  mobileBridge: {
    enabled: true,
    port: 4177,
    pairedDevices: [],
    activePairing: null,
  },
}
const MINECRAFT_RUNTIME_MODES = new Set(['neoforge-minecraft', 'native-loader-minecraft'])
const DEFAULT_ECHO_NATIVE_LAUNCHER_ROOT = 'C:\\Experimental\\Codex\\ECHONATIVEPLATFORM\\ECHO-Native'
let activeLaunch = null
const operationStatuses = new Map()
let latestOperationId = null
let operationSequence = 0
let releaseRefreshInFlight = null
let releaseIndexCatalogRefreshInFlight = null
let launcherUpdatesInitialized = false
let launcherUpdateCheckPromise = null
let launcherUpdateState = null
let mobileBridgeServer = null
let mobileBridgeStartError = null
let pendingProtocolAction = null

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu-compositing')
app.setName(APP_NAME)
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
const launcherUserDataPath = String(process.env.ECHO_LAUNCHER_USER_DATA_DIR ?? '').trim()
app.setPath('userData', launcherUserDataPath ? path.resolve(launcherUserDataPath) : path.join(app.getPath('appData'), 'echo-launcher'))

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function normalizePath(input) {
  return path.resolve(String(input ?? ''))
}

function echoNativeLauncherRoot() {
  const candidates = [
    process.env.ECHO_NATIVE_LAUNCHER_ROOT,
    path.resolve(__dirname, '..', '..', 'ECHO-Native'),
    DEFAULT_ECHO_NATIVE_LAUNCHER_ROOT,
  ].filter(Boolean)
  return candidates.find((candidate) => fssync.existsSync(path.join(candidate, 'Launch-AshfallNativeLoader.ps1'))) ?? candidates[candidates.length - 1]
}

function echoNativeWorkspaceRoot() {
  return process.env.ECHO_NATIVE_WORKSPACE_ROOT || path.resolve(echoNativeLauncherRoot(), '..', 'Echo', 'echo-native-platform')
}

function echoNativeAshfallGameDir() {
  return path.join(echoNativeWorkspaceRoot(), 'fixtures', 'ashfall', 'isolated-runtime', 'game')
}

async function findEchoNativeAshfallProcess() {
  if (process.platform !== 'win32') return null
  const gameDir = echoNativeAshfallGameDir()
  const result = await execFileSafe('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `$gameDir = ${JSON.stringify(gameDir)}; Get-CimInstance Win32_Process -Filter "name='java.exe'" | Where-Object { $_.CommandLine -and ($_.CommandLine -like "*$gameDir*" -or $_.CommandLine -like '*EchoNativeBootstrapMain*' -or $_.CommandLine -like '*--echo-pack-id ashfall*') } | Select-Object -First 1 -ExpandProperty ProcessId`,
  ], { timeout: 8000, windowsHide: true })
  const pid = Number(String(result.stdout ?? '').trim())
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

function safeFileName(input) {
  return String(input ?? 'item').replace(/[^a-z0-9._-]/gi, '-')
}

function isSafeRelativePath(input) {
  if (!input || typeof input !== 'string' || input.includes('\0')) return false
  if (/^[a-z]:/i.test(input) || input.startsWith('/') || input.startsWith('\\')) return false
  return input
    .replace(/\\/g, '/')
    .split('/')
    .every((part) => part && part !== '.' && part !== '..')
}

function safeJoin(root, relativePath) {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Unsafe manifest path: ${relativePath}`)
  }
  const resolvedRoot = normalizePath(root)
  const resolved = path.resolve(resolvedRoot, relativePath)
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Path escapes install root: ${relativePath}`)
  }
  return resolved
}

function samePath(left, right) {
  const normalizedLeft = normalizePath(left)
  const normalizedRight = normalizePath(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function pathInsideRoot(target, root) {
  const normalizedTarget = normalizePath(target)
  const normalizedRoot = normalizePath(root)
  const left = process.platform === 'win32' ? normalizedTarget.toLowerCase() : normalizedTarget
  const right = process.platform === 'win32' ? normalizedRoot.toLowerCase() : normalizedRoot
  return left === right || left.startsWith(`${right}${path.sep}`)
}

function manifestAssetName(channel, version, pack = CANONICAL_PROFILE_ID) {
  return `${pack}-${channel}-${version}.pack.json`
}

function defaultChannelForPack(pack) {
  const normalized = normalizeOfficialPackId(pack)
  return profileDefinition(normalized ?? CANONICAL_PROFILE_ID).channel ?? CANONICAL_CHANNEL
}

function profileDefinition(profileId) {
  const normalized = normalizeOfficialPackId(profileId) ?? CANONICAL_PROFILE_ID
  return ASHFALL_PROFILE_DEFINITIONS.find((definition) => definition.id === normalized) ?? ASHFALL_PROFILE_DEFINITIONS[0]
}

function officialPackDisplayName(pack) {
  const normalized = normalizeOfficialPackId(pack)
  if (!normalized) return String(pack ?? 'unknown pack')
  return profileDefinition(normalized).name ?? normalized
}

function manifestPackId(manifest) {
  return normalizeOfficialPackId(manifest?.pack ?? manifest?.id)
}

function assertManifestMatchesSelectedPack(manifest, selectedPack) {
  return assertSelectedManifestPack(manifest, selectedPack, { displayName: officialPackDisplayName })
}

function validateSelectedPackManifest(manifest, selectedPack, options = {}) {
  assertManifestMatchesSelectedPack(manifest, selectedPack)
  const validated = validatePackManifest(manifest, options)
  const familyStatus = manifestArtifactFamilyStatus(validated, selectedPack)
  if (!familyStatus.ok) throw new Error(familyStatus.message)
  return assertManifestMatchesSelectedPack(validated, selectedPack)
}

function selectLauncherProfile(profiles = [], payload = {}, fallbackToFirst = true) {
  const requestedPack = normalizeOfficialPackId(payload.profileId ?? payload.pack)
  if ((payload.profileId || payload.pack) && !requestedPack) {
    throw new Error(`Unknown official pack profile: ${payload.profileId ?? payload.pack}.`)
  }
  if (requestedPack) {
    const profile = profiles.find((item) => item.id === requestedPack)
    if (!profile) throw new Error(`Selected profile not found: ${officialPackDisplayName(requestedPack)}.`)
    return profile
  }
  return fallbackToFirst ? profiles[0] : undefined
}

function moduleCountFromManifest(manifest, fallback) {
  const requirements = manifest?.moduleRequirements ?? manifest?.requiredModules ?? manifest?.modules
  return Array.isArray(requirements) ? requirements.length : fallback
}

function requiredManifestFilePaths(manifest) {
  return (manifest?.files ?? [])
    .filter((file) => file?.required !== false)
    .map((file) => String(file?.path ?? '').replace(/\\/g, '/'))
    .filter(Boolean)
}

function manifestArtifactFamilyStatus(manifest, expectedPackId) {
  const packId = normalizeOfficialPackId(expectedPackId ?? manifest?.pack ?? manifest?.id)
  const packName = officialPackDisplayName(packId)
  const paths = requiredManifestFilePaths(manifest)
  const addonFiles = paths.filter((filePath) => /^addons\/.+\.echo-addon$/iu.test(filePath))
  const modJars = paths.filter((filePath) => /^mods\/.+\.jar$/iu.test(filePath))

  if (packId?.endsWith('-native-edition')) {
    if (addonFiles.length === 0) {
      return {
        ok: false,
        code: modJars.length > 0 ? 'wrongArtifactFamily' : 'missingNativeAddons',
        message: `${packName} requires Native addon files under addons/*.echo-addon, but this manifest lists ${modJars.length} NeoForge mod jar${modJars.length === 1 ? '' : 's'} and ${addonFiles.length} Native addon file${addonFiles.length === 1 ? '' : 's'}.`,
      }
    }
  }

  if (packId?.endsWith('-neoforge-edition')) {
    if (modJars.length === 0) {
      return {
        ok: false,
        code: addonFiles.length > 0 ? 'wrongArtifactFamily' : 'missingNeoForgeMods',
        message: `${packName} requires NeoForge mod jars under mods/*.jar, but this manifest lists ${addonFiles.length} Native addon file${addonFiles.length === 1 ? '' : 's'} and ${modJars.length} NeoForge mod jar${modJars.length === 1 ? '' : 's'}.`,
      }
    }
  }

  return { ok: true, code: 'ok', message: '' }
}

function manifestRequiresNeoForge(manifest) {
  const packId = normalizeOfficialPackId(manifest?.pack) ?? String(manifest?.pack ?? '')
  if (packId.endsWith('-neoforge-edition')) return true
  const loaderType = String(manifest?.loader?.type ?? '').trim().toLowerCase()
  if (loaderType === 'neoforge') return true
  const runtimeTarget = String(manifest?.runtimeTarget ?? '').trim().toLowerCase()
  return Boolean(manifest?.loader?.version && runtimeTarget !== 'echo_runtime_standalone')
}

function communityChatUrlsFromStatusUrl(statusUrl) {
  try {
    const parsed = new URL(statusUrl)
    const basePath = parsed.pathname.replace(/\/status\.json$/i, '').replace(/\/+$/, '')
    const apiProtocol = parsed.protocol === 'https:' ? 'https:' : 'http:'
    const socketProtocol = apiProtocol === 'https:' ? 'wss:' : 'ws:'
    return {
      communityApiUrl: `${apiProtocol}//${parsed.host}${basePath}`,
      communityWebSocketUrl: `${socketProtocol}//${parsed.host}${basePath}/v1/chat/socket`,
    }
  } catch {
    return {
      communityApiUrl: DEFAULT_DESKTOP_SETTINGS.communityApiUrl,
      communityWebSocketUrl: DEFAULT_DESKTOP_SETTINGS.communityWebSocketUrl,
    }
  }
}

function isLegacyLocalCommunityUrl(value) {
  const normalized = String(value ?? '').trim()
  return [
    'http://127.0.0.1:47870',
    'http://127.0.0.1:47870/',
    'http://10.0.2.2:47870',
    'http://10.0.2.2:47870/',
    'ws://127.0.0.1:47870/v1/chat/socket',
    'ws://10.0.2.2:47870/v1/chat/socket',
  ].includes(normalized)
}

function isLegacyOfficialServerStatusUrl(value) {
  return [
    'http://64.74.111.235:16363/status.json',
    'http://64.74.111.235:16363/status.json/',
  ].includes(String(value ?? '').trim())
}

function isLegacyOfficialCommunityUrl(value) {
  return [
    'http://64.74.111.235:16363',
    'http://64.74.111.235:16363/',
    'ws://64.74.111.235:16363/v1/chat/socket',
  ].includes(String(value ?? '').trim())
}

function mergeSettings(settings) {
  const safeSettings = { ...(settings ?? {}) }
  delete safeSettings.microsoftClientId
  delete safeSettings.devOfflineLaunch
  delete safeSettings.minecraftLauncherHandoffConfirmed
  delete safeSettings.launchMode
  delete safeSettings.releaseFeed
  delete safeSettings.publisher
  delete safeSettings.publisherToken
  const communityChatPortMigrationVersion = Number(settings?.communityChatPortMigrationVersion ?? 0)
  const rawOfficialServerStatusUrl = String(settings?.officialServerStatusUrl ?? DEFAULT_DESKTOP_SETTINGS.officialServerStatusUrl).trim() || DEFAULT_DESKTOP_SETTINGS.officialServerStatusUrl
  const officialServerStatusUrl = communityChatPortMigrationVersion < 2 && isLegacyOfficialServerStatusUrl(rawOfficialServerStatusUrl)
    ? DEFAULT_DESKTOP_SETTINGS.officialServerStatusUrl
    : rawOfficialServerStatusUrl
  const derivedCommunity = communityChatUrlsFromStatusUrl(officialServerStatusUrl)
  const rawCommunityApiUrl = String(settings?.communityApiUrl ?? derivedCommunity.communityApiUrl).trim() || derivedCommunity.communityApiUrl
  const rawCommunityWebSocketUrl = String(settings?.communityWebSocketUrl ?? derivedCommunity.communityWebSocketUrl).trim() || derivedCommunity.communityWebSocketUrl
  const migrateLegacyCommunityUrls = communityChatPortMigrationVersion < 2
  return {
    ...DEFAULT_DESKTOP_SETTINGS,
    ...safeSettings,
    releaseIndex: {
      ...DEFAULT_DESKTOP_SETTINGS.releaseIndex,
      ...(settings?.releaseIndex ?? {}),
      enabled: true,
      channelUrl: String(settings?.releaseIndex?.channelUrl ?? '').trim() || DEFAULT_DESKTOP_SETTINGS.releaseIndex.channelUrl,
    },
    supportGuideUrl: String(settings?.supportGuideUrl ?? ''),
    launchMode: DEFAULT_DESKTOP_SETTINGS.launchMode,
    advancedMode: Boolean(settings?.advancedMode),
    creatorMode: Boolean(settings?.creatorMode),
    officialServerStatusUrl,
    officialDiscordInviteUrl: String(settings?.officialDiscordInviteUrl ?? DEFAULT_DESKTOP_SETTINGS.officialDiscordInviteUrl).trim(),
    officialServerName: String(settings?.officialServerName ?? DEFAULT_DESKTOP_SETTINGS.officialServerName).trim() || DEFAULT_DESKTOP_SETTINGS.officialServerName,
    officialStatusPollSeconds: Math.max(10, Math.min(300, Number(settings?.officialStatusPollSeconds ?? DEFAULT_DESKTOP_SETTINGS.officialStatusPollSeconds) || DEFAULT_DESKTOP_SETTINGS.officialStatusPollSeconds)),
    communityApiUrl: migrateLegacyCommunityUrls && (isLegacyLocalCommunityUrl(rawCommunityApiUrl) || isLegacyOfficialCommunityUrl(rawCommunityApiUrl)) ? derivedCommunity.communityApiUrl : rawCommunityApiUrl,
    communityWebSocketUrl: migrateLegacyCommunityUrls && (isLegacyLocalCommunityUrl(rawCommunityWebSocketUrl) || isLegacyOfficialCommunityUrl(rawCommunityWebSocketUrl)) ? derivedCommunity.communityWebSocketUrl : rawCommunityWebSocketUrl,
    communityChatPortMigrationVersion: 2,
    chatNickname: String(settings?.chatNickname ?? DEFAULT_DESKTOP_SETTINGS.chatNickname).replace(/\s+/g, ' ').trim().slice(0, 32) || DEFAULT_DESKTOP_SETTINGS.chatNickname,
    chatNotifications: settings?.chatNotifications ?? true,
    packOsReportRoot: String(settings?.packOsReportRoot ?? '').trim(),
    mobileBridge: normalizeMobileBridgeSettings(settings?.mobileBridge ?? DEFAULT_DESKTOP_SETTINGS.mobileBridge),
  }
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true })
}

async function readJson(target, fallback) {
  try {
    const text = await fs.readFile(target, 'utf8')
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return fallback
  }
}

async function writeJson(target, value) {
  await ensureDir(path.dirname(target))
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function isoNow() {
  return new Date().toISOString()
}

function createOperationId(kind = 'operation') {
  operationSequence += 1
  return `${safeFileName(kind)}-${Date.now()}-${operationSequence}`
}

function trimOperationStatuses() {
  if (operationStatuses.size <= 24) return
  const sorted = [...operationStatuses.entries()].sort((a, b) => String(a[1].updatedAt).localeCompare(String(b[1].updatedAt)))
  for (const [id] of sorted.slice(0, operationStatuses.size - 24)) {
    operationStatuses.delete(id)
  }
}

function updateOperationStatus(operationId, patch = {}) {
  if (!operationId) return null
  const current = operationStatuses.get(operationId) ?? {
    operationId,
    kind: patch.kind ?? 'operation',
    status: 'running',
    phaseId: patch.phaseId ?? 'starting',
    label: patch.label ?? 'Preparing',
    progress: 0,
    message: '',
    startedAt: isoNow(),
    updatedAt: isoNow(),
  }
  const next = {
    ...current,
    ...patch,
    operationId,
    progress: Math.max(0, Math.min(100, Number(patch.progress ?? current.progress ?? 0))),
    updatedAt: isoNow(),
  }
  if (next.status === 'completed' || next.status === 'failed') {
    next.completedAt = next.completedAt ?? next.updatedAt
  }
  latestOperationId = operationId
  operationStatuses.set(operationId, next)
  trimOperationStatuses()
  return next
}

function operationStatus(payload = {}) {
  const operationId = payload?.operationId ?? latestOperationId
  if (!operationId || !operationStatuses.has(operationId)) {
    return {
      operationId: operationId ?? null,
      kind: 'idle',
      status: 'idle',
      phaseId: 'idle',
      label: 'Ready',
      progress: 0,
      message: '',
      startedAt: null,
      updatedAt: isoNow(),
    }
  }
  return operationStatuses.get(operationId)
}

function runningMobileOperation(phaseId) {
  return [...operationStatuses.values()].find((operation) => isRunningMobileOperation(operation, phaseId)) ?? null
}

function isPrereleaseVersion(version) {
  return /-\w/.test(String(version ?? ''))
}

function launcherUpdatesSupported() {
  return launcherUpdatesSupportedForPlatform(getPlatformInfo(), app.isPackaged, Boolean(autoUpdater), process.env)
}

function assertLauncherUpdateFeedConfig(feed) {
  if (
    LAUNCHER_UPDATE_STREAM !== 'public' ||
    feed?.owner !== LAUNCHER_UPDATE_OWNER ||
    feed?.repo !== LAUNCHER_UPDATE_REPO
  ) {
    throw new Error(`Invalid launcher updater feed: ${feed?.owner ?? '<empty>'}/${feed?.repo ?? '<empty>'}.`)
  }
}

function wineManualLauncherUpdateInstall() {
  return getPlatformInfo().compat === 'wine'
}

function launcherUpdateUnsupportedError() {
  return launcherUpdateUnsupportedMessage(getPlatformInfo(), app.isPackaged, process.env)
}

function normalizeLauncherReleaseNotes(notes) {
  if (!notes) return []
  if (typeof notes === 'string') return notes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8)
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') return item.note ?? item.notes ?? item.version
        return ''
      })
      .flatMap((item) => String(item ?? '').split(/\r?\n/))
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8)
  }
  return []
}

function updateInfoPatch(info = {}) {
  return {
    availableVersion: info.version ? String(info.version) : launcherUpdateState?.availableVersion,
    releaseName: info.releaseName ? String(info.releaseName) : info.version ? `ECHO Launcher ${info.version}` : launcherUpdateState?.releaseName,
    releaseDate: info.releaseDate ? String(info.releaseDate) : launcherUpdateState?.releaseDate,
    releaseNotes: normalizeLauncherReleaseNotes(info.releaseNotes),
  }
}

function setLauncherUpdateState(patch = {}) {
  const currentVersion = app.getVersion()
  const platformInfo = getPlatformInfo()
  const updatesSupported = launcherUpdatesSupported()
  const manualInstallRequired = wineManualLauncherUpdateInstall()
  const base = launcherUpdateState ?? {
    currentVersion,
    status: updatesSupported ? 'idle' : 'unsupported',
    feedOwner: LAUNCHER_UPDATE_OWNER,
    feedRepo: LAUNCHER_UPDATE_REPO,
    allowPrerelease: isPrereleaseVersion(currentVersion),
    availableVersion: undefined,
    releaseName: undefined,
    releaseDate: undefined,
    releaseNotes: [],
    progress: 0,
    error: undefined,
    updateReady: false,
    canCheck: updatesSupported,
    canDownload: false,
    canInstall: false,
    manualInstallRequired,
    platform: platformInfo,
  }
  const next = {
    ...base,
    ...patch,
    currentVersion,
    feedOwner: LAUNCHER_UPDATE_OWNER,
    feedRepo: LAUNCHER_UPDATE_REPO,
    allowPrerelease: isPrereleaseVersion(currentVersion),
    manualInstallRequired,
    platform: platformInfo,
  }
  next.progress = Math.max(0, Math.min(100, Number(next.progress ?? 0)))
  next.updateReady = next.status === 'downloaded'
  next.canCheck = updatesSupported && !['checking', 'downloading'].includes(next.status)
  next.canDownload = updatesSupported && next.status === 'available'
  next.canInstall = updatesSupported && !manualInstallRequired && next.status === 'downloaded'
  launcherUpdateState = next
  return next
}

function initializeLauncherUpdates() {
  if (launcherUpdatesInitialized) return launcherUpdateState ?? setLauncherUpdateState()
  launcherUpdatesInitialized = true
  setLauncherUpdateState()

  if (!launcherUpdatesSupported()) return launcherUpdateState

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = isPrereleaseVersion(app.getVersion())
  const launcherFeed = {
    provider: 'github',
    owner: LAUNCHER_UPDATE_OWNER,
    repo: LAUNCHER_UPDATE_REPO,
  }
  assertLauncherUpdateFeedConfig(launcherFeed)
  autoUpdater.setFeedURL(launcherFeed)

  autoUpdater.on('checking-for-update', () => {
    setLauncherUpdateState({ status: 'checking', error: undefined, progress: 0 })
  })

  autoUpdater.on('update-available', (info) => {
    setLauncherUpdateState({
      status: 'available',
      error: undefined,
      progress: 0,
      ...updateInfoPatch(info),
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    setLauncherUpdateState({
      status: 'unavailable',
      error: undefined,
      progress: 0,
      ...updateInfoPatch(info),
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setLauncherUpdateState({
      status: 'downloading',
      error: undefined,
      progress: Number(progress?.percent ?? 0),
      bytesPerSecond: Number(progress?.bytesPerSecond ?? 0),
      transferred: Number(progress?.transferred ?? 0),
      total: Number(progress?.total ?? 0),
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setLauncherUpdateState({
      status: 'downloaded',
      error: undefined,
      progress: 100,
      ...updateInfoPatch(info),
    })
  })

  autoUpdater.on('error', (error) => {
    setLauncherUpdateState({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
    void appendLauncherLog('ERROR', `Launcher update failed: ${error instanceof Error ? error.message : String(error)}`)
  })

  return launcherUpdateState
}

async function launcherUpdateGetState() {
  return initializeLauncherUpdates()
}

async function launcherUpdateCheck() {
  initializeLauncherUpdates()
  if (!launcherUpdatesSupported()) {
    return setLauncherUpdateState({
      status: 'unsupported',
      error: launcherUpdateUnsupportedError(),
    })
  }
  if (launcherUpdateCheckPromise) return launcherUpdateCheckPromise
  setLauncherUpdateState({ status: 'checking', error: undefined, progress: 0 })
  launcherUpdateCheckPromise = autoUpdater
    .checkForUpdates()
    .then(() => launcherUpdateState)
    .catch((error) =>
      setLauncherUpdateState({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    .finally(() => {
      launcherUpdateCheckPromise = null
    })
  return launcherUpdateCheckPromise
}

async function launcherUpdateDownload() {
  initializeLauncherUpdates()
  if (!launcherUpdatesSupported()) {
    return setLauncherUpdateState({
      status: 'unsupported',
      error: launcherUpdateUnsupportedError(),
    })
  }
  if (launcherUpdateState?.status !== 'available') {
    return launcherUpdateState
  }
  setLauncherUpdateState({ status: 'downloading', error: undefined, progress: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    setLauncherUpdateState({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return launcherUpdateState
}

async function launcherUpdateInstall() {
  initializeLauncherUpdates()
  if (!launcherUpdatesSupported()) {
    return setLauncherUpdateState({
      status: 'unsupported',
      error: launcherUpdateUnsupportedError(),
    })
  }
  if (wineManualLauncherUpdateInstall()) {
    return setLauncherUpdateState({
      status: launcherUpdateState?.status ?? 'downloaded',
      error: 'Wine compatibility mode can check and download Windows launcher updates, but automatic installer restart is disabled. Run the downloaded Windows installer inside the same Wine prefix.',
    })
  }
  if (activeLaunch?.process && !activeLaunch.exitedAt) {
    return setLauncherUpdateState({
      status: launcherUpdateState?.status ?? 'downloaded',
      error: 'Close Minecraft before installing a launcher update.',
    })
  }
  if (launcherUpdateState?.status !== 'downloaded') return launcherUpdateState
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return launcherUpdateState
}

async function appendLauncherLog(level, message) {
  try {
    const paths = getPaths()
    await ensureDir(paths.logs)
    await fs.appendFile(path.join(paths.logs, 'latest.log'), `[${isoNow()}] ${level} ${message}\n`, 'utf8')
  } catch {
    // Logging must never take down the app.
  }
}

async function readSettings() {
  const paths = getPaths()
  const settings = await readJson(paths.settings, DEFAULT_DESKTOP_SETTINGS)
  const merged = mergeSettings(settings)
  return merged
}

async function writeSettings(patch) {
  const current = await readSettings()
  const next = mergeSettings({
    ...current,
    ...(patch ?? {}),
  })
  await writeJson(getPaths().settings, next)
  return next
}

function getPlatformInfo() {
  return buildPlatformInfo({
    platform: process.platform,
    arch: process.arch,
    env: process.env,
    packaged: app.isPackaged,
  })
}

function getPaths() {
  const root = path.join(app.getPath('userData'), 'ECHO')
  const launcherPlayerContentPath = String(process.env.ECHO_LAUNCHER_PLAYER_CONTENT_ROOT ?? '').trim()
  const playerContentRoot = launcherPlayerContentPath ? path.resolve(launcherPlayerContentPath) : path.join(app.getPath('home') || os.homedir(), 'ECHOLauncher')
  return {
    root,
    playerContentRoot,
    instances: path.join(playerContentRoot, 'Instances'),
    runtime: path.join(root, 'runtime'),
    manifests: path.join(root, 'manifests'),
    profiles: path.join(root, 'profiles'),
    backups: path.join(root, 'backups'),
    exports: path.join(root, 'exports'),
    downloads: path.join(root, 'downloads'),
    logs: path.join(root, 'launcher-logs'),
    releaseCache: path.join(root, 'release-cache'),
    auth: path.join(root, 'auth'),
    launch: path.join(root, 'launch'),
    settings: path.join(root, 'settings.json'),
  }
}

function defaultInstallPathForProfile(paths, profileId = CANONICAL_PROFILE_ID) {
  return path.join(paths.instances, profileDefinition(profileId).installFolder)
}

function defaultAshfallInstallPath(paths) {
  return defaultInstallPathForProfile(paths, CANONICAL_PROFILE_ID)
}

function standaloneRuntimeRootCandidates(payload = {}) {
  const configured = String(payload?.runtimeRoot ?? '').trim()
  const envRoot = String(process.env.ECHO_STANDALONE_RUNTIME_ROOT ?? '').trim()
  const appRoot = app.getAppPath()
  const resourcesRoot = String(process.resourcesPath ?? '').trim()
  const candidates = [
    configured,
    envRoot,
    path.resolve(resourcesRoot, 'Echo', 'echo-standalone-runtime'),
    path.resolve(resourcesRoot, 'ECHO', 'echo-standalone-runtime'),
    path.resolve(resourcesRoot, 'echo-standalone-runtime'),
    path.resolve(process.cwd(), '..', 'ECHO-Standalone-Runtime'),
    path.resolve(appRoot, '..', '..', '..', 'ECHO-Standalone-Runtime'),
    path.resolve(process.cwd(), '..', 'Echo', 'echo-standalone-runtime'),
    path.resolve(process.cwd(), '..', 'ECHO', 'echo-standalone-runtime'),
    path.resolve(appRoot, '..', 'Echo', 'echo-standalone-runtime'),
    path.resolve(appRoot, '..', 'ECHO', 'echo-standalone-runtime'),
    path.resolve(appRoot, '..', '..', 'Echo', 'echo-standalone-runtime'),
    path.resolve(appRoot, '..', '..', 'ECHO', 'echo-standalone-runtime'),
  ].filter(Boolean)
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))]
}

async function resolveStandaloneRuntimeRoot(payload = {}) {
  const candidates = standaloneRuntimeRootCandidates(payload)
  for (const candidate of candidates) {
    const markers = [
      path.join(candidate, 'settings.gradle'),
      path.join(candidate, 'build.gradle'),
      path.join(candidate, 'reports', 'echo', 'standalone', 'runtime-alpha-readiness.json'),
    ]
    for (const marker of markers) {
      if (await exists(marker)) return candidate
    }
  }
  return candidates[0] ?? path.resolve(process.cwd(), '..', 'Echo', 'echo-standalone-runtime')
}

function standaloneRuntimeExecutablePath(runtimeRoot) {
  const executableName = process.platform === 'win32' ? 'EchoStandaloneRuntime.exe' : 'EchoStandaloneRuntime'
  const buildRoot = path.join(runtimeRoot, 'build')
  const relativeExecutable = path.join('EchoStandaloneRuntime', executableName)
  const packagedCandidates = [
    path.join(runtimeRoot, executableName),
    path.join(runtimeRoot, relativeExecutable),
    path.join(runtimeRoot, 'jpackage-opengl-client', relativeExecutable),
  ]
  for (const candidate of packagedCandidates) {
    if (fssync.existsSync(candidate)) return candidate
  }
  const fallback = path.join(buildRoot, 'jpackage', relativeExecutable)
  try {
    const candidates = fssync
      .readdirSync(buildRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^jpackage(?:-|$)/.test(entry.name))
      .map((entry) => path.join(buildRoot, entry.name, relativeExecutable))
      .filter((candidate) => fssync.existsSync(candidate))
      .sort((left, right) => fssync.statSync(right).mtimeMs - fssync.statSync(left).mtimeMs)
    return candidates[0] ?? fallback
  } catch {
    return fallback
  }
}

function revealStandaloneRuntimeWindow(rootPid) {
  if (process.platform !== 'win32' || !Number.isFinite(Number(rootPid))) return false
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$rootPid = [uint32]${Number(rootPid)}
$code = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class EchoRuntimeWindowReveal {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
Add-Type $code
function Test-EchoRuntimeDescendant([uint32]$processId, $parentMap) {
  $seen = @{}
  while ($processId -ne 0) {
    if ($processId -eq $rootPid) { return $true }
    if ($seen.ContainsKey($processId)) { return $false }
    $seen[$processId] = $true
    if (-not $parentMap.ContainsKey($processId)) { return $false }
    $processId = [uint32]$parentMap[$processId]
  }
  return $false
}
for ($attempt = 0; $attempt -lt 32; $attempt++) {
  Start-Sleep -Milliseconds 250
  $runtimeProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'EchoStandaloneRuntime.exe' })
  $parentMap = @{}
  foreach ($process in $runtimeProcesses) {
    $parentMap[[uint32]$process.ProcessId] = [uint32]$process.ParentProcessId
  }
  $targetIds = @(
    $runtimeProcesses |
      Where-Object { ([uint32]$_.ProcessId) -eq $rootPid -or (Test-EchoRuntimeDescendant ([uint32]$_.ProcessId) $parentMap) } |
      ForEach-Object { [uint32]$_.ProcessId }
  )
  if ($targetIds.Count -eq 0) { continue }
  $script:shown = $false
  [EchoRuntimeWindowReveal]::EnumWindows({
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    [uint32]$processId = 0
    [void][EchoRuntimeWindowReveal]::GetWindowThreadProcessId($hWnd, [ref]$processId)
    if ($targetIds -contains $processId) {
      $title = New-Object System.Text.StringBuilder 512
      $className = New-Object System.Text.StringBuilder 256
      [void][EchoRuntimeWindowReveal]::GetWindowText($hWnd, $title, $title.Capacity)
      [void][EchoRuntimeWindowReveal]::GetClassName($hWnd, $className, $className.Capacity)
      if ($className.ToString() -eq 'SunAwtFrame' -and $title.ToString() -eq 'ECHO Ashfall Standalone') {
        [void][EchoRuntimeWindowReveal]::ShowWindow($hWnd, 9)
        [void][EchoRuntimeWindowReveal]::ShowWindow($hWnd, 5)
        [void][EchoRuntimeWindowReveal]::SetForegroundWindow($hWnd)
        $script:shown = $true
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  if ($script:shown) { break }
}
`
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return true
}

function standaloneRuntimeReportPath(runtimeRoot, fileName) {
  return path.join(runtimeRoot, 'reports', 'echo', 'standalone', fileName)
}

async function standaloneRuntimeVersion(runtimeRoot) {
  try {
    const text = await fs.readFile(path.join(runtimeRoot, 'build.gradle'), 'utf8')
    const match = text.match(/version\s*=\s*['"]([^'"]+)['"]/)
    return match?.[1]
  } catch {
    return undefined
  }
}

async function standaloneRuntimeReportStatus(reportPath) {
  if (!(await exists(reportPath))) return { status: 'missing', detail: 'Report is missing.' }
  const report = await readJson(reportPath, null)
  const summaryStatus = String(report?.summary?.status ?? report?.status ?? '').toUpperCase()
  if (summaryStatus === 'READY' || summaryStatus === 'PASS' || summaryStatus === 'PASSED') {
    return { status: 'healthy', detail: `${path.basename(reportPath)} reports ${summaryStatus}.` }
  }
  if (summaryStatus) return { status: 'warning', detail: `${path.basename(reportPath)} reports ${summaryStatus}.` }
  return { status: 'operational', detail: `${path.basename(reportPath)} is present.` }
}

async function standaloneRuntimeSupportBundle(runtimeRoot) {
  const reportsDir = standaloneRuntimeReportPath(runtimeRoot, '')
  const reportPath = standaloneRuntimeReportPath(runtimeRoot, 'alpha-readiness-support-bundle.json')
  let entries = 0
  try {
    const files = await fs.readdir(reportsDir)
    entries = files.filter((file) => /\.json$/i.test(file)).length
  } catch {
    entries = 0
  }
  return {
    available: await exists(reportPath),
    entries,
    reportPath,
  }
}

function runtimeCheckLevel(status) {
  if (status === 'healthy' || status === 'operational' || status === 'completed') return 'INFO'
  if (status === 'warning' || status === 'missing') return 'WARN'
  return 'ERROR'
}

async function standaloneRuntimeGetState(payload = {}) {
  const runtimeRoot = await resolveStandaloneRuntimeRoot(payload)
  const executablePath = standaloneRuntimeExecutablePath(runtimeRoot)
  const readinessPath = standaloneRuntimeReportPath(runtimeRoot, 'runtime-alpha-readiness.json')
  const verticalSlicePath = standaloneRuntimeReportPath(runtimeRoot, 'runtime-vertical-slice.json')
  const launcherPath = standaloneRuntimeReportPath(runtimeRoot, 'runtime-launcher.json')
  const [rootExists, settingsExists, executableExists, readiness, verticalSlice, launcher, version, supportBundle] =
    await Promise.all([
      exists(runtimeRoot),
      exists(path.join(runtimeRoot, 'settings.gradle')),
      exists(executablePath),
      standaloneRuntimeReportStatus(readinessPath),
      standaloneRuntimeReportStatus(verticalSlicePath),
      standaloneRuntimeReportStatus(launcherPath),
      standaloneRuntimeVersion(runtimeRoot),
      standaloneRuntimeSupportBundle(runtimeRoot),
    ])

  const checks = [
    {
      id: 'runtime-root',
      label: 'Runtime root',
      status: rootExists ? 'healthy' : 'missing',
      detail: rootExists ? `Resolved ${runtimeRoot}.` : `Runtime root was not found at ${runtimeRoot}.`,
      path: runtimeRoot,
      severity: 'required',
    },
    {
      id: 'runtime-settings',
      label: 'Gradle workspace',
      status: settingsExists ? 'healthy' : 'missing',
      detail: settingsExists ? 'settings.gradle is present.' : 'settings.gradle is missing.',
      path: path.join(runtimeRoot, 'settings.gradle'),
      severity: 'required',
    },
    {
      id: 'alpha-readiness',
      label: 'Alpha readiness',
      status: readiness.status,
      detail: readiness.detail,
      path: readinessPath,
      severity: 'required',
    },
    {
      id: 'vertical-slice',
      label: 'Vertical slice',
      status: verticalSlice.status,
      detail: verticalSlice.detail,
      path: verticalSlicePath,
      severity: 'required',
    },
    {
      id: 'launcher-contract',
      label: 'Launcher contract',
      status: launcher.status,
      detail: launcher.detail,
      path: launcherPath,
      severity: 'required',
    },
    {
      id: 'runtime-executable',
      label: 'Runtime executable',
      status: executableExists ? 'healthy' : 'missing',
      detail: executableExists ? `Executable is ready at ${executablePath}.` : 'Build the jpackage app-image before launching standalone mode.',
      path: executablePath,
      command: 'jpackage --type app-image --name EchoStandaloneRuntime --input build/libs --main-jar echo-runtime-app.jar',
      severity: 'required',
    },
    {
      id: 'support-bundle',
      label: 'Support bundle',
      status: supportBundle.available ? 'healthy' : 'warning',
      detail: supportBundle.available
        ? `Support bundle report is present with ${supportBundle.entries} standalone report entries.`
        : 'Support bundle report is missing; runtime can still launch, but diagnostics are incomplete.',
      path: supportBundle.reportPath,
      severity: 'recommended',
    },
  ]

  const requiredOk = checks
    .filter((check) => check.severity === 'required')
    .every((check) => check.status === 'healthy' || check.status === 'operational' || check.status === 'completed')
  const repairPlan = checks
    .filter((check) => check.status === 'missing' || check.status === 'critical' || check.status === 'failed')
    .map((check) => ({
      id: `repair-${check.id}`,
      title: `Restore ${check.label}`,
      detail:
        check.id === 'runtime-executable'
          ? 'Rebuild the standalone runtime executable from the runtime workspace, then verify again.'
          : `Restore or regenerate ${check.path ?? check.label}.`,
      command: check.command ?? 'gradlew.bat build --console=plain',
      target: check.path,
      recommended: check.severity === 'required',
      automated: false,
    }))
  const warnings = checks
    .filter((check) => check.status !== 'healthy' && check.status !== 'operational' && check.status !== 'completed')
    .map((check) => check.detail)
  const logs = checks.map((check) => ({
    id: `runtime-${check.id}`,
    timestamp: isoNow(),
    level: runtimeCheckLevel(check.status),
    source: 'runtime',
    message: `${check.label}: ${check.detail}`,
  }))

  return {
    ok: requiredOk,
    generatedAt: isoNow(),
    runtimeRoot,
    executablePath: executableExists ? executablePath : undefined,
    version,
    checks,
    repairPlan,
    supportBundle,
    logs,
    warnings,
  }
}

async function standaloneRuntimeLaunch(payload = {}) {
  const state = await standaloneRuntimeGetState(payload)
  const profileId = String(payload?.profileId ?? CANONICAL_PROFILE_ID)
  if (!state.ok || !state.executablePath) {
    const message = state.warnings[0] ?? 'Standalone runtime verification failed.'
    await appendLauncherLog('WARN', `Standalone runtime launch blocked for ${profileId}: ${message}`)
    return {
      ok: false,
      profileId,
      executablePath: state.executablePath,
      message,
      warnings: state.warnings,
      state,
    }
  }
  const args = ['--live', state.runtimeRoot]
  const child = spawn(state.executablePath, args, {
    cwd: state.runtimeRoot,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  revealStandaloneRuntimeWindow(child.pid)
  await appendLauncherLog('INFO', `Standalone runtime launched for ${profileId}: pid=${child.pid ?? 'unknown'} path=${state.executablePath} args=${args.join(' ')}`)
  return {
    ok: true,
    profileId,
    pid: child.pid,
    executablePath: state.executablePath,
    message: `Standalone runtime launched for ${profileId}.`,
    warnings: state.warnings,
    state,
  }
}

function packOsReportRootCandidates(settings = {}) {
  const configured = String(settings.packOsReportRoot ?? '').trim()
  const appRoot = app.getAppPath()
  const candidates = []
  if (configured) candidates.push(path.resolve(configured))
  if (!configured) {
    candidates.push(
      path.resolve(process.cwd(), 'reports', 'echo'),
      path.resolve(process.cwd(), '..', 'Echo', 'reports', 'echo'),
      path.resolve(process.cwd(), '..', 'ECHO', 'reports', 'echo'),
      path.resolve(appRoot, 'reports', 'echo'),
      path.resolve(appRoot, '..', 'Echo', 'reports', 'echo'),
      path.resolve(appRoot, '..', 'ECHO', 'reports', 'echo'),
    )
  }
  return [...new Set(candidates)]
}

function existingDirectory(candidate) {
  try {
    return Boolean(candidate && fssync.existsSync(candidate) && fssync.statSync(candidate).isDirectory())
  } catch {
    return false
  }
}

function resolvePackOsReportRoot(settings = {}) {
  const candidates = packOsReportRootCandidates(settings)
  if (String(settings.packOsReportRoot ?? '').trim()) return candidates[0] ?? ''
  return candidates.find((candidate) => existingDirectory(candidate)) ?? ''
}

async function readPackOsStateForSettings(settings = {}) {
  const reportRoot = resolvePackOsReportRoot(settings)
  return readPackOsStateFromRoot(reportRoot, {
    generatedAt: isoNow(),
    selectedPackId: CANONICAL_PROFILE_ID,
  })
}

async function packOsGetState() {
  return readPackOsStateForSettings(await readSettings())
}

function legacyPrivateInstancesRoot(paths) {
  return path.join(paths.root, 'instances')
}

function legacyPrivateAshfallInstallPaths(paths) {
  const root = legacyPrivateInstancesRoot(paths)
  return [
    path.join(root, CANONICAL_PROFILE_NAME),
    path.join(root, 'Ashfall Protocol Beta'),
  ]
}

function pathInsideOrEqual(root, candidate) {
  if (!root || !candidate) return false
  const normalizedRoot = normalizePath(root).toLowerCase()
  const normalizedCandidate = normalizePath(candidate).toLowerCase()
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
}

function isLegacyPrivateInstancePath(paths, candidate) {
  return pathInsideOrEqual(legacyPrivateInstancesRoot(paths), candidate)
}

function defaultProfiles(paths) {
  const ashfallEnabledAddons = [
    'arcanaveil',
    'echoagriculturereclamation',
    'echoarmory',
    'echoashfallprotocol',
    'echoblackboxprotocol',
    'echoblockworks',
    'echoconvoyprotocol',
    'echocore',
    'echodatacore',
    'echoholomap',
    'echoindustrialnexus',
    'echolens',
    'echologisticsnetwork',
    'echomissioncore',
    'echomultiblockcore',
    'echonetcore',
    'echonexusprotocol',
    'echoorbitalremnants',
    'echoplayercore',
    'echopowergrid',
    'echorecovery',
    'echorelictech',
    'echorendercore',
    'echoruntimeguard',
    'echosoundcore',
    'echostationfall',
    'echoterminal',
    'echothemecore',
    'echotutorialcore',
    'echoweathercore',
    'echoworldcore',
    'signalos',
    'signalosexample',
  ]
  const skyRelayEnabledAddons = [
    'echocore',
    'echoadaptercore',
    'echonetcore',
    'echoruntimeguard',
    'echolens',
    'echoterminal',
    'echoholomap',
    'echopowergrid',
    'echoweathercore',
    'echorecovery',
    'echologisticsnetwork',
    'echoskyrelayprotocol',
  ]
  const galacticSurveyEnabledAddons = [
    'echocore',
    'echoaddonapi',
    'echoadaptercore',
    'echonetcore',
    'echoruntimeguard',
    'echoterminal',
    'echoindex',
    'echolens',
    'echoholomap',
    'echomissioncore',
    'echopowergrid',
    'echologisticsnetwork',
    'echoprogressioncore',
    'echosoundcore',
    'echogalacticcore',
    'echoorbitalremnants',
    'echovehiclecore',
    'echogalacticsurveyprotocol',
  ]
  const openlandsEnabledAddons = [
    'echocore',
    'echoadaptercore',
    'echonetcore',
    'echoruntimeguard',
    'echoopenlandsprotocol',
  ]
  const arcanaDivisionEnabledAddons = [
    'echocore',
    'echoadaptercore',
    'echonetcore',
    'echofoundationcore',
    'echomaterialcore',
    'echotoolcore',
    'echostationcore',
    'echoworldstarter',
    'echocommonloot',
    'echocreatureroles',
    'echoarcanacore',
    'echoaetherworks',
    'echocursecore',
    'echofamiliarcore',
    'echogrimoire',
    'echoriftworlds',
    'echoritualcore',
    'echospellcore',
    'echoholomap',
    'echoindex',
    'echolens',
    'echoterminal',
    'echothemecore',
    'echomissioncore',
    'echoarcanadivisionprotocol',
  ]
  const enabledAddonsForProfile = (id) => {
    if (String(id).startsWith('sky-relay-')) return skyRelayEnabledAddons
    if (String(id).startsWith('galactic-survey-')) return galacticSurveyEnabledAddons
    if (String(id).startsWith('openlands-')) return openlandsEnabledAddons
    if (String(id).startsWith('arcana-division-')) return arcanaDivisionEnabledAddons
    return ashfallEnabledAddons
  }
  return ASHFALL_PROFILE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    runtimeMode: definition.runtimeMode,
    channel: definition.channel ?? CANONICAL_CHANNEL,
    channelLabel: definition.channelLabel,
    version: CANONICAL_VERSION,
    minecraft: definition.minecraft,
    neoforge: definition.neoforge,
    ramGb: 7,
    moduleCount: enabledAddonsForProfile(definition.id).length,
    lastPlayed: 'Never',
    playtime: '0h 00m',
    status: 'missing',
    installPath: defaultInstallPathForProfile(paths, definition.id),
    manifestPath: undefined,
    enabledAddons: enabledAddonsForProfile(definition.id),
  }))
}

function uniqueNormalizedPaths(paths) {
  const seen = new Set()
  const normalized = []
  for (const item of paths.filter(Boolean)) {
    const next = normalizePath(item)
    const key = next.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(next)
  }
  return normalized
}

async function readInstalledProfileManifestState(installPath, expectedPackId) {
  if (!installPath) return null
  const normalizedInstallPath = normalizePath(installPath)
  const manifestPath = path.join(normalizedInstallPath, '.echo', 'installed-manifest.json')
  const manifest = await readJson(manifestPath, null)
  if (!manifest) {
    return {
      valid: false,
      code: 'missing',
      installPath: normalizedInstallPath,
      manifestPath,
      manifest: null,
      pack: undefined,
      message: 'No installed manifest was found for this pack.',
    }
  }

  const packId = normalizeOfficialPackId(manifest.pack ?? manifest.id)
  const packName = String(manifest.name ?? '').toLowerCase()
  const expected = normalizeOfficialPackId(expectedPackId)
  if (expected && packId && packId !== expected) {
    return {
      valid: false,
      code: 'packMismatch',
      installPath: normalizedInstallPath,
      manifestPath,
      manifest: { ...manifest, pack: packId ?? manifest.pack },
      pack: packId,
      message: `Selected manifest is for ${officialPackDisplayName(packId)}, not ${officialPackDisplayName(expected)}.`,
    }
  }
  if (!packId && !/(ashfall|sky relay|sky-relay|galactic survey|galactic-survey)/i.test(packName)) {
    return {
      valid: false,
      code: 'unknownPack',
      installPath: normalizedInstallPath,
      manifestPath,
      manifest,
      pack: undefined,
      message: `Installed manifest pack must be one of: ${Array.from(OFFICIAL_PACK_IDS).join(', ')}.`,
    }
  }

  try {
    const selectedPack = expected ?? packId
    const validated = validateSelectedPackManifest(manifest, selectedPack, { allowLocalPlaceholders: false })
    const familyStatus = manifestArtifactFamilyStatus(validated, selectedPack)
    if (!familyStatus.ok) {
      return {
        valid: false,
        code: familyStatus.code,
        installPath: normalizedInstallPath,
        manifestPath,
        manifest: validated,
        pack: selectedPack,
        message: familyStatus.message,
      }
    }
    return {
      valid: true,
      code: 'ok',
      installPath: normalizedInstallPath,
      manifestPath,
      manifest: validated,
      pack: selectedPack,
      message: '',
    }
  } catch (error) {
    return {
      valid: false,
      code: 'invalidManifest',
      installPath: normalizedInstallPath,
      manifestPath,
      manifest: { ...manifest, pack: packId ?? manifest.pack },
      pack: packId,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function detectInstallOperation(installPath, expectedPackId) {
  const state = await readInstalledProfileManifestState(installPath, expectedPackId)
  return state?.valid ? 'update' : 'install'
}

async function readInstalledProfileManifest(installPath, expectedPackId) {
  const state = await readInstalledProfileManifestState(installPath, expectedPackId)
  if (!state?.valid) return null

  return {
    installPath: state.installPath,
    manifestPath: state.manifestPath,
    manifest: state.manifest,
  }
}

async function readProfileManifestForProfile(manifestPath, expectedPackId) {
  if (!manifestPath) return null
  try {
    const raw = await readJson(normalizePath(manifestPath), null)
    if (!raw) return null
    const manifest = validateSelectedPackManifest(raw, expectedPackId, { allowLocalPlaceholders: false })
    return manifestArtifactFamilyStatus(manifest, expectedPackId).ok ? manifest : null
  } catch {
    return null
  }
}

async function profileHasInstalledManifest(installPath) {
  return Boolean(await readInstalledProfileManifest(installPath))
}

async function selectProfileInstallPath(paths, profiles = [], baseProfile) {
  const preferred = profiles.find((profile) => profile.id === baseProfile.id)
  const legacy = baseProfile.id === CANONICAL_PROFILE_ID
    ? profiles.find((profile) => profile.id === LEGACY_ASHFALL_PROFILE_ID || profile.id === 'ashfall-stable')
    : null
  const named = baseProfile.id === CANONICAL_PROFILE_ID
    ? profiles.find((profile) => /ashfall/i.test(profile.name ?? '') && !ASHFALL_RUNTIME_PACK_IDS.has(profile.id))
    : null
  const source = preferred ?? legacy ?? named ?? {}
  const defaultInstallPath = defaultInstallPathForProfile(paths, baseProfile.id)
  const installedCandidates = uniqueNormalizedPaths([
    preferred?.installPath,
    legacy?.installPath,
    named?.installPath,
    source.installPath,
    defaultInstallPath,
    ...(baseProfile.id === CANONICAL_PROFILE_ID ? legacyPrivateAshfallInstallPaths(paths) : []),
    ...(baseProfile.id === CANONICAL_PROFILE_ID ? KNOWN_ASHFALL_INSTANCE_PATHS : []),
  ])

  for (const candidate of installedCandidates) {
    if (await readInstalledProfileManifest(candidate, baseProfile.id)) return candidate
  }

  if (source.installPath && !isLegacyPrivateInstancePath(paths, source.installPath)) {
    const sourceInstalled = await readInstalledProfileManifest(source.installPath)
    const sourcePack = manifestPackId(sourceInstalled?.manifest)
    if (sourcePack && sourcePack !== baseProfile.id) return normalizePath(defaultInstallPath)
    return normalizePath(source.installPath)
  }

  return normalizePath(defaultInstallPath)
}

async function normalizeProfileList(paths, profiles = []) {
  const bases = defaultProfiles(paths)
  const normalized = []
  for (const base of bases) {
    const preferred = profiles.find((profile) => profile.id === base.id)
    const legacy = base.id === CANONICAL_PROFILE_ID
      ? profiles.find((profile) => profile.id === LEGACY_ASHFALL_PROFILE_ID || profile.id === 'ashfall-stable')
      : null
    const named = base.id === CANONICAL_PROFILE_ID
      ? profiles.find((profile) => /ashfall/i.test(profile.name ?? '') && !ASHFALL_RUNTIME_PACK_IDS.has(profile.id))
      : null
    const source = preferred ?? legacy ?? named ?? {}
    const installPath = await selectProfileInstallPath(paths, profiles, base)
    const installedState = await readInstalledProfileManifestState(installPath, base.id)
    const installed = installedState?.valid && manifestPackId(installedState.manifest) === base.id ? installedState : null
    const installedManifestPath = installed?.manifestPath ?? path.join(installPath, '.echo', 'installed-manifest.json')
    const installedManifest = installed?.manifest ?? null
    const sourceManifest = await readProfileManifestForProfile(source.manifestPath, base.id)
    const hasInvalidInstalledManifest = Boolean(installedState && !installedState.valid && installedState.code !== 'missing')
    const hasRejectedSourceManifest = Boolean(source.manifestPath && !sourceManifest && !installedManifest)
    normalized.push({
      ...base,
      ramGb: Number(source.ramGb ?? base.ramGb),
      lastPlayed: source.lastPlayed ?? base.lastPlayed,
      playtime: source.playtime ?? base.playtime,
      enabledAddons: Array.isArray(source.enabledAddons) && source.enabledAddons.length ? source.enabledAddons : base.enabledAddons,
      installPath,
      manifestPath: installedManifest ? installedManifestPath : sourceManifest ? normalizePath(source.manifestPath) : base.manifestPath,
      version: installedManifest?.version ?? sourceManifest?.version ?? base.version,
      minecraft: installedManifest ? minecraftVersionFromManifest(installedManifest) : sourceManifest ? minecraftVersionFromManifest(sourceManifest) : base.minecraft,
      neoforge: installedManifest?.loader?.version ?? sourceManifest?.loader?.version ?? base.neoforge,
      moduleCount: moduleCountFromManifest(installedManifest, moduleCountFromManifest(sourceManifest, base.moduleCount)),
      status: installedManifest ? 'healthy' : hasInvalidInstalledManifest || hasRejectedSourceManifest ? 'warning' : source.status && source.status !== 'healthy' ? source.status : base.status,
      id: base.id,
      name: base.name,
      runtimeMode: base.runtimeMode,
      channel: base.channel ?? CANONICAL_CHANNEL,
      channelLabel: base.channelLabel,
    })
  }
  return normalized
}

async function seedDesktopData() {
  const paths = getPaths()
  await Promise.all(Object.values(paths).filter((value) => !value.endsWith('.json')).map(ensureDir))
  for (const profile of defaultProfiles(paths)) {
    await ensureDir(profile.installPath)
    await ensureDir(path.join(profile.installPath, 'mods'))
    await ensureDir(path.join(profile.installPath, 'config'))
    await ensureDir(path.join(profile.installPath, 'logs'))
  }

  const oldBundledManifestPath = path.join(paths.manifests, 'ashfall.json')
  const oldBundledManifest = await readJson(oldBundledManifestPath, null)
  if (
    oldBundledManifest &&
    (oldBundledManifest.artifactSha256 === '' ||
      oldBundledManifest.version === '1.2.0-beta.1' ||
      isLegacyPrivateInstancePath(paths, oldBundledManifest.localInstallRoot))
  ) {
    await fs.rm(oldBundledManifestPath, { force: true }).catch(() => undefined)
  }

  const profilesPath = path.join(paths.profiles, 'profiles.json')
  const profiles = await readJson(profilesPath, defaultProfiles(paths))
  const normalizedProfiles = await normalizeProfileList(paths, profiles)
  if (JSON.stringify(normalizedProfiles) !== JSON.stringify(profiles)) {
    await backupLauncherProfileStore(profilesPath)
    await writeJson(profilesPath, normalizedProfiles)
  }
  await repairReservedMinecraftLauncherProfiles(normalizedProfiles).catch((error) => appendLauncherLog('WARN', `Minecraft Launcher profile adoption skipped: ${error.message}`))

  if (!(await exists(paths.settings))) {
    await writeJson(paths.settings, DEFAULT_DESKTOP_SETTINGS)
  }

  const latestLog = path.join(defaultAshfallInstallPath(paths), 'logs', 'latest.log')
  if (!(await exists(latestLog))) {
    await fs.writeFile(
      latestLog,
      [
        '[INFO] ECHO Launcher initialized local Ashfall instance directory.',
        '[WARN] No installed mod files were found yet. Install Ashfall from strict release assets to complete setup.',
        '[INFO] Minecraft Launcher handoff is the beta launch path.',
      ].join(os.EOL),
      'utf8',
    )
  }
}

async function profileList() {
  const paths = getPaths()
  const profilesPath = path.join(paths.profiles, 'profiles.json')
  const profiles = await readJson(profilesPath, defaultProfiles(paths))
  const normalizedProfiles = await normalizeProfileList(paths, profiles)
  if (JSON.stringify(normalizedProfiles) !== JSON.stringify(profiles)) {
    await backupLauncherProfileStore(profilesPath)
    await writeJson(profilesPath, normalizedProfiles)
  }
  return normalizedProfiles
}

async function backupLauncherProfileStore(profilesPath) {
  const backupPath = path.join(getPaths().backups, 'launcher-profiles', `${nowStamp()}-profiles.json`)
  await ensureDir(path.dirname(backupPath))
  if (await exists(profilesPath)) {
    await fs.copyFile(profilesPath, backupPath)
  } else {
    await fs.writeFile(backupPath, `${JSON.stringify(defaultProfiles(getPaths()), null, 2)}\n`, 'utf8')
  }
  return backupPath
}

async function profileSave(profile) {
  const paths = getPaths()
  const profilesPath = path.join(paths.profiles, 'profiles.json')
  const current = await profileList()
  const profileId = normalizeOfficialPackId(profile?.id) ?? CANONICAL_PROFILE_ID
  const base = defaultProfiles(paths).find((item) => item.id === profileId) ?? defaultProfiles(paths)[0]
  const nextProfile = {
    ...base,
    ...profile,
    id: base.id,
    name: base.name,
    runtimeMode: base.runtimeMode,
    channel: base.channel ?? CANONICAL_CHANNEL,
    channelLabel: base.channelLabel,
  }
  const next = current.map((item) => (item.id === nextProfile.id ? nextProfile : item))
  await writeJson(profilesPath, next)
  return next.find((item) => item.id === nextProfile.id) ?? nextProfile
}

async function profileApplyLoadout(payload = {}) {
  const paths = getPaths()
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === (payload.profileId ?? CANONICAL_PROFILE_ID)) ?? profiles[0]
  const manifest = await manifestLoad({ manifestPath: profile?.manifestPath, pack: profile?.id })
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const requested = new Set((payload.enabledAddons ?? []).map((item) => String(item).toLowerCase()))
  const required = new Set(
    (manifest.files ?? [])
      .filter((file) => file.required !== false && file.moduleId)
      .map((file) => String(file.moduleId).toLowerCase()),
  )
  required.forEach((moduleId) => requested.add(moduleId))
  const modules = [...new Set([...(manifest.modules ?? []), ...(manifest.files ?? []).map((file) => file.moduleId).filter(Boolean)])].map((item) => String(item).toLowerCase())
  const enabledAddons = modules.filter((moduleId) => requested.has(moduleId))
  const disabledAddons = modules.filter((moduleId) => !requested.has(moduleId))
  const disabledSet = new Set(disabledAddons)
  const enabledSet = new Set(enabledAddons)
  const disabledRoot = path.join(installPath, '.echo', 'disabled-mods')
  const movedEnabled = []
  const movedDisabled = []
  const warnings = []

  await ensureDir(path.join(installPath, '.echo'))

  for (const file of manifest.files ?? []) {
    if (!file.moduleId || file.required !== false || !String(file.path).replace(/\\/g, '/').startsWith('mods/')) continue
    const moduleId = String(file.moduleId).toLowerCase()
    const activePath = safeJoin(installPath, file.path)
    const disabledPath = safeJoin(disabledRoot, file.path)
    if (disabledSet.has(moduleId) && (await exists(activePath))) {
      await ensureDir(path.dirname(disabledPath))
      await fs.rename(activePath, disabledPath)
      movedDisabled.push(file.path)
    } else if (enabledSet.has(moduleId) && (await exists(disabledPath)) && !(await exists(activePath))) {
      await ensureDir(path.dirname(activePath))
      await fs.rename(disabledPath, activePath)
      movedEnabled.push(file.path)
    }
  }

  for (const moduleId of payload.enabledAddons ?? []) {
    if (!modules.includes(String(moduleId).toLowerCase())) {
      warnings.push(`${moduleId} is not present in the installed manifest and was ignored.`)
    }
  }

  const saved = await profileSave({
    ...profile,
    enabledAddons,
    installPath,
  })
  const loadoutPath = path.join(installPath, '.echo', 'loadout.json')
  await writeJson(loadoutPath, {
    profileId: saved.id,
    appliedAt: isoNow(),
    enabledAddons,
    disabledAddons,
    movedEnabled,
    movedDisabled,
    warnings,
  })

  return {
    ok: true,
    profile: saved,
    loadoutPath,
    enabledAddons,
    disabledAddons,
    movedEnabled,
    movedDisabled,
    warnings,
  }
}

async function settingsApplyClientOptions(payload = {}) {
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === (payload.profileId ?? CANONICAL_PROFILE_ID)) ?? profiles[0]
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? defaultAshfallInstallPath(getPaths()))
  await ensureDir(path.join(installPath, '.echo'))
  const optionsPath = path.join(installPath, '.echo', 'client-options.json')
  await writeJson(optionsPath, {
    profileId: profile?.id ?? CANONICAL_PROFILE_ID,
    appliedAt: isoNow(),
    options: payload.options ?? {},
  })
  return {
    ok: true,
    optionsPath,
    appliedAt: isoNow(),
    warnings: ['Minecraft reads many client options from its own options.txt; ECHO stored these launcher preferences for support and future pack config application.'],
  }
}

async function profileDuplicate(profileId) {
  const profiles = await profileList()
  const source = profiles.find((profile) => profile.id === profileId)
  if (!source) throw new Error(`Profile not found: ${profileId}`)
  return source
}

async function manifestLoad(payload = {}) {
  const selectedPack = normalizeOfficialPackId(payload.profileId ?? payload.pack)
  if (payload.manifestPath) {
    const manifestPath = normalizePath(payload.manifestPath)
    const manifest = await readJson(manifestPath, null)
    if (!manifest) {
      throw new Error(`Pack manifest was not found at ${manifestPath}. Install or refresh the latest approved Catalog release.`)
    }
    return validateSelectedPackManifest(manifest, selectedPack, { allowLocalPlaceholders: false })
  }
  const fetched = await releaseFetchManifest({
    channel: payload.channel ?? CANONICAL_CHANNEL,
    version: payload.version,
    refresh: payload.refresh ?? false,
    pack: selectedPack ?? payload.pack,
  })
  return assertManifestMatchesSelectedPack(fetched.manifest, selectedPack)
}

async function manifestImport(payload = {}) {
  if (!payload.filePath) throw new Error('Manifest file path is required.')
  const sourcePath = normalizePath(payload.filePath)
  const selectedPack = normalizeOfficialPackId(payload.profileId ?? payload.pack)
  const manifest = validateSelectedPackManifest(await readJson(sourcePath, null), selectedPack, { allowLocalPlaceholders: false })
  const paths = getPaths()
  const safeVersion = String(manifest.version).replace(/[^a-z0-9.-]/gi, '-')
  const destination = path.join(paths.manifests, `${manifest.pack}-${manifest.channel}-${safeVersion}.json`)
  await writeJson(destination, manifest)
  return { manifest, manifestPath: destination }
}

function validatePackManifest(manifest, options = {}) {
  const normalizedPack = normalizeOfficialPackId(manifest?.pack)
  manifest = normalizeLegacyPackManifest(manifest, normalizedPack)
  if (!manifest || !normalizedPack || !manifest.version || !Array.isArray(manifest.files)) {
    throw new Error(`The selected file is not a valid official ECHO pack manifest. Expected one of: ${Array.from(OFFICIAL_PACK_IDS).join(', ')}.`)
  }
  if (!CHANNELS.has(manifest.channel)) {
    throw new Error('Pack manifest channel is invalid.')
  }
  if (normalizedPack.endsWith('-standalone-edition')) {
    if (!manifest.runtime?.requiredJava) {
      throw new Error(`${manifest.name ?? normalizedPack} manifests must include runtime.requiredJava.`)
    }
    if (!manifest.launch?.mainClass) {
      throw new Error(`${manifest.name ?? normalizedPack} manifests must include launch metadata.`)
    }
  } else if (normalizedPack.endsWith('-native-edition')) {
    if (!manifest.minecraft && !manifest.minecraftVersion) {
      throw new Error('Pack manifest requires a Minecraft version.')
    }
    if (!manifest.nativeLoader) {
      throw new Error(`${manifest.name ?? normalizedPack} manifests must include Native Loader metadata.`)
    }
  } else if (normalizedPack.endsWith('-neoforge-edition')) {
    if (!manifest.minecraft && !manifest.minecraftVersion) {
      throw new Error('Pack manifest requires a Minecraft version.')
    }
    if (manifest.loader?.type !== 'neoforge') {
      throw new Error(`${manifest.name ?? normalizedPack} manifests must include NeoForge loader metadata.`)
    }
  }
  if (normalizedPack.endsWith('-native-edition') || manifest.nativeLoader) {
    const nativeLoaderValidation = validateReleaseLauncherVersionManifest(
      manifest,
      nativeLoaderMinecraftVersionId(manifest),
      'native-loader-minecraft',
    )
    if (!nativeLoaderValidation.ok) throw new Error(nativeLoaderValidation.reason)
  }
  if (!options.allowLocalPlaceholders && manifest.artifactMode === 'zip') {
    if (!manifest.artifactName || !isSafeRelativePath(manifest.artifactName)) {
      throw new Error('Zip artifact manifests require a safe artifactName.')
    }
    if (!manifest.artifactSha256 || !/^[a-f0-9]{64}$/i.test(manifest.artifactSha256)) {
      throw new Error('Zip artifact manifests require an artifact SHA-256 hash.')
    }
    if (!manifest.launch?.mainClass) {
      throw new Error('Zip artifact manifests require launch metadata.')
    }
  }
  const moduleRequirements = manifest.moduleRequirements ?? manifest.requiredModules
  if (!Array.isArray(moduleRequirements)) {
    throw new Error(`${manifest.name ?? normalizedPack} manifests must include moduleRequirements.`)
  }
  if (moduleRequirements.length === 0) {
    throw new Error(`${manifest.name ?? normalizedPack} manifests must include at least one module requirement.`)
  }
  for (const requirement of moduleRequirements ?? []) {
    const moduleId = String(requirement?.id ?? requirement?.moduleId ?? '').trim()
    if (!moduleId) {
      throw new Error('Module requirements must include an id or moduleId.')
    }
    if (!requirement?.version || typeof requirement.version !== 'string') {
      throw new Error(`Module requirement ${moduleId} must include a version.`)
    }
    const family = String(
      requirement.artifactFamily ?? requirement.family ?? manifest.moduleArtifactFamily ?? moduleArtifactFamilyForPack(normalizedPack),
    ).trim().toLowerCase()
    const assetName = String(requirement.assetName ?? requirement.artifactName ?? moduleArtifactName(moduleId, requirement.version, family)).trim()
    const artifactPath = String(
      requirement.path ?? (family === 'echo-addon' ? `addons/${assetName}` : `mods/${assetName}`),
    )
    if (!isSafeRelativePath(artifactPath)) {
      throw new Error(`Unsafe module artifact path: ${artifactPath}`)
    }
    if (requirement.sha256 && !/^[a-f0-9]{64}$/i.test(requirement.sha256)) {
      throw new Error(`Module requirement ${moduleId} has an invalid SHA-256 hash.`)
    }
  }
  const manifestPaths = new Set()
  for (const file of manifest.files) {
    if (!isSafeRelativePath(file.path)) {
      throw new Error(`Unsafe manifest path: ${file.path}`)
    }
    const normalizedPath = file.path.replace(/\\/g, '/').toLowerCase()
    if (manifestPaths.has(normalizedPath)) {
      throw new Error(`Duplicate manifest path: ${file.path}`)
    }
    manifestPaths.add(normalizedPath)
    if (!options.allowLocalPlaceholders) {
      if (!file.sha256 || !/^[a-f0-9]{64}$/i.test(file.sha256)) {
        throw new Error(`Manifest file ${file.path} must include a SHA-256 hash.`)
      }
      if (manifest.artifactMode !== 'zip' && !file.url && !file.assetName) {
        throw new Error(`Manifest file ${file.path} must include a URL or release asset name.`)
      }
    }
  }
  const installer = manifest.loader?.installer
  if (installer) {
    if (!installer.url && !installer.assetName) {
      throw new Error('NeoForge installer metadata requires a URL or release asset name.')
    }
    if (!installer.sha256 || !/^[a-f0-9]{64}$/i.test(installer.sha256)) {
      throw new Error('NeoForge installer metadata requires a SHA-256 hash.')
    }
    if (!['client', 'server'].includes(installer.installMode)) {
      throw new Error('NeoForge installer mode must be client or server.')
    }
  }
  return { ...manifest, pack: normalizedPack }
}

function inferModuleRequirementVersion(file, moduleId) {
  const baseName = path.basename(String(file?.path ?? file?.assetName ?? ''))
    .replace(/\.echo-addon$/iu, '')
    .replace(/\.jar$/iu, '')
    .replace(/-(?:neoforge|standalone)$/iu, '')
  const normalizedModuleId = String(moduleId ?? '').trim().toLowerCase()
  if (normalizedModuleId && baseName.toLowerCase().startsWith(`${normalizedModuleId}-`)) {
    return baseName.slice(normalizedModuleId.length + 1)
  }
  return baseName.match(/-(\d[\w.+-]*)$/u)?.[1] ?? ''
}

function legacyModuleRequirementsFromFiles(manifest, normalizedPack) {
  const familyForPack = moduleArtifactFamilyForPack(normalizedPack)
  const byModule = new Map()
  for (const file of manifest?.files ?? []) {
    const filePath = String(file?.path ?? '').replace(/\\/g, '/')
    if (!/^(addons|mods)\//iu.test(filePath)) continue
    const moduleId = String(file?.moduleId ?? '').trim().toLowerCase()
    if (!moduleId || moduleId === 'config' || byModule.has(moduleId)) continue
    const version = inferModuleRequirementVersion(file, moduleId)
    if (!version) continue
    byModule.set(moduleId, {
      id: moduleId,
      version,
      artifactFamily: filePath.toLowerCase().startsWith('addons/') ? 'echo-addon' : familyForPack,
      assetName: path.basename(filePath),
      path: filePath,
      sha256: file.sha256,
      size: file.size,
      required: file.required !== false,
      side: file.side ?? 'both',
    })
  }
  return [...byModule.values()]
}

const NEOFORGE_VERSION_BY_MINECRAFT_VERSION = new Map([
  ['26.1.2', '26.1.2.43-beta'],
])

function normalizedPackRootModulePath(file, normalizedPack) {
  const filePath = String(file?.path ?? '').replace(/\\/g, '/')
  if (!filePath.toLowerCase().startsWith('pack-root/')) return null
  if (!file?.moduleId) return null
  const basename = path.basename(filePath)
  if (!basename) return null
  if (normalizedPack.endsWith('-native-edition') && /\.echo-addon$/iu.test(basename)) return `addons/${basename}`
  if ((normalizedPack.endsWith('-neoforge-edition') || normalizedPack.endsWith('-standalone-edition')) && /\.jar$/iu.test(basename)) return `mods/${basename}`
  return null
}

function normalizeLegacyPackFiles(manifest, normalizedPack) {
  return (manifest.files ?? []).map((file) => {
    const normalizedPath = normalizedPackRootModulePath(file, normalizedPack)
    if (!normalizedPath) return file
    return {
      ...file,
      archivePath: String(file.path ?? '').replace(/\\/g, '/'),
      path: normalizedPath,
    }
  })
}

function normalizeLegacyNeoForgeLoader(manifest, normalizedPack) {
  if (!normalizedPack.endsWith('-neoforge-edition') || manifest.loader?.type !== 'neoforge') return manifest.loader
  const minecraftVersion = String(manifest.minecraftVersion ?? manifest.minecraft ?? manifest.loader?.versionJson?.inheritsFrom ?? '').trim()
  const loaderVersion = String(manifest.loader?.version ?? '').trim()
  const replacement = NEOFORGE_VERSION_BY_MINECRAFT_VERSION.get(loaderVersion) ?? (loaderVersion === minecraftVersion ? NEOFORGE_VERSION_BY_MINECRAFT_VERSION.get(minecraftVersion) : undefined)
  if (!replacement || replacement === loaderVersion) return manifest.loader
  const next = {
    ...manifest.loader,
    version: replacement,
    minecraftLauncherVersionId: `neoforge-${replacement}`,
  }
  if (next.versionJson && typeof next.versionJson === 'object' && !Array.isArray(next.versionJson)) {
    next.versionJson = {
      ...next.versionJson,
      id: `neoforge-${replacement}`,
      inheritsFrom: next.versionJson.inheritsFrom ?? minecraftVersion,
    }
  }
  const installerSha = String(next.installer?.sha256 ?? '').toLowerCase()
  if (installerSha === 'f'.repeat(64) || (next.installer?.assetName && !String(next.installer.assetName).includes(replacement))) {
    delete next.installer
  }
  return next
}

function normalizeLegacyPackManifest(manifest, normalizedPack) {
  if (!manifest || !normalizedPack) return manifest
  const moduleRequirements = manifest.moduleRequirements ?? manifest.requiredModules
  const next = { ...manifest }
  if (Array.isArray(next.files)) next.files = normalizeLegacyPackFiles(next, normalizedPack)
  next.loader = normalizeLegacyNeoForgeLoader(next, normalizedPack)
  if (!next.moduleArtifactFamily) next.moduleArtifactFamily = moduleArtifactFamilyForPack(normalizedPack)
  if (!Array.isArray(moduleRequirements)) {
    const inferred = legacyModuleRequirementsFromFiles(next, normalizedPack)
    if (inferred.length > 0) {
      next.moduleRequirements = inferred
      next.modules = [...new Set([...(Array.isArray(next.modules) ? next.modules : []), ...inferred.map((item) => item.id)])]
    }
  }
  return next
}

async function sha256File(target) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = fssync.createReadStream(target)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function formatBytes(value) {
  const bytes = Number(value ?? 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / 1024 ** exponent
  return `${amount >= 10 || exponent === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[exponent]}`
}

function manifestFileKey(filePath) {
  return String(filePath ?? '').replace(/\\/g, '/')
}

function verificationCachePath(installPath) {
  return path.join(installPath, '.echo', 'verification-cache.json')
}

async function readVerificationCache(installPath) {
  const fallback = { version: 1, generatedAt: isoNow(), files: {} }
  const cached = await readJson(verificationCachePath(installPath), fallback)
  if (!cached || typeof cached !== 'object' || typeof cached.files !== 'object' || Array.isArray(cached.files)) {
    return fallback
  }
  return { version: 1, generatedAt: cached.generatedAt ?? isoNow(), files: cached.files }
}

async function writeVerificationCache(installPath, cache) {
  await writeJson(verificationCachePath(installPath), {
    version: 1,
    generatedAt: isoNow(),
    files: cache.files ?? {},
  })
}

async function rememberVerifiedFile(installPath, relativePath, sha256, source = 'verified') {
  if (!sha256) return
  const absolutePath = safeJoin(installPath, relativePath)
  if (!(await exists(absolutePath))) return
  const stats = await fs.stat(absolutePath)
  const cache = await readVerificationCache(installPath)
  cache.files[manifestFileKey(relativePath)] = {
    sha256: String(sha256).toLowerCase(),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    source,
    verifiedAt: isoNow(),
  }
  await writeVerificationCache(installPath, cache)
}

async function stageVerifiedCacheEntry(cache, installPath, relativePath, sha256, source = 'verified') {
  if (!sha256) return false
  const absolutePath = safeJoin(installPath, relativePath)
  if (!(await exists(absolutePath))) return false
  const stats = await fs.stat(absolutePath)
  cache.files[manifestFileKey(relativePath)] = {
    sha256: String(sha256).toLowerCase(),
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    source,
    verifiedAt: isoNow(),
  }
  return true
}

async function sha1File(target) {
  const hash = crypto.createHash('sha1')
  await new Promise((resolve, reject) => {
    const stream = fssync.createReadStream(target)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

function minecraftVersionFromManifest(manifest = {}) {
  return manifest.minecraftVersion ?? manifest.runtime?.minecraftVersion ?? manifest.minecraft ?? '26.1.2'
}

function runtimePaths() {
  const root = getPaths().runtime
  return {
    root,
    metadata: path.join(root, 'metadata'),
    versions: path.join(root, 'versions'),
    libraries: path.join(root, 'libraries'),
    assets: path.join(root, 'assets'),
    natives: path.join(root, 'natives'),
  }
}

function relativeRuntimePath(target) {
  const root = runtimePaths().root
  return path.relative(root, target).replace(/\\/g, '/')
}

async function verifyManifest(payload = {}) {
  const profiles = await profileList().catch(() => [])
  const profile = selectLauncherProfile(profiles, payload, !payload.installPath)
  const selectedPack = normalizeOfficialPackId(payload.profileId ?? payload.pack ?? profile?.id ?? payload.manifest?.pack)
  const manifest = payload.manifest
    ? validateSelectedPackManifest(payload.manifest, selectedPack)
    : await manifestLoad({ ...payload, pack: selectedPack ?? payload.pack })
  const installPath = normalizePath(
    payload.installPath ??
      profile?.installPath ??
      manifest.localInstallRoot ??
      defaultInstallPathForProfile(getPaths(), selectedPack ?? CANONICAL_PROFILE_ID),
  )
  const results = []
  const files = manifest.files ?? []
  const onProgress = typeof payload.onProgress === 'function' ? payload.onProgress : null
  const trustCacheOnly = payload.trustCacheOnly === true
  const cache = await readVerificationCache(installPath)
  let cacheDirty = false
  let cacheHits = 0
  let hashed = 0
  let lastProgressAt = 0

  const reportProgress = (checked, currentPath = '') => {
    if (!onProgress) return
    const now = Date.now()
    if (checked < files.length && now - lastProgressAt < 250) return
    lastProgressAt = now
    onProgress({
      checked,
      total: files.length,
      currentPath,
      cacheHits,
      hashed,
      missing: results.filter((item) => item.status === 'missing').length,
      corrupt: results.filter((item) => item.status === 'corrupt').length,
    })
  }

  for (const [index, file] of files.entries()) {
    const absolutePath = safeJoin(installPath, file.path)
    const key = manifestFileKey(file.path)
    const present = await exists(absolutePath)
    if (!present) {
      results.push({ path: file.path, status: 'missing', expected: file.sha256, actual: null, size: 0 })
      reportProgress(index + 1, file.path)
      continue
    }
    const stats = await fs.stat(absolutePath)
    const expected = file.sha256 ? String(file.sha256).toLowerCase() : ''
    const cached = expected ? cache.files[key] : null
    const useCached =
      cached &&
      String(cached.sha256 ?? '').toLowerCase() === expected &&
      Number(cached.size) === stats.size &&
      Math.abs(Number(cached.mtimeMs) - stats.mtimeMs) < 1
    let actual = ''
    if (expected && useCached) {
      actual = String(cached.sha256).toLowerCase()
      cacheHits += 1
    } else if (expected && trustCacheOnly) {
      actual = null
    } else {
      actual = file.sha256 ? await sha256File(absolutePath) : ''
      if (file.sha256) {
        hashed += 1
        cache.files[key] = {
          sha256: actual.toLowerCase(),
          size: stats.size,
          mtimeMs: stats.mtimeMs,
          source: 'manifest-verify',
          verifiedAt: isoNow(),
        }
        cacheDirty = true
      }
    }
    const valid = file.sha256 && typeof actual === 'string' ? actual.toLowerCase() === String(file.sha256).toLowerCase() : !file.sha256
    results.push({
      path: file.path,
      status: valid ? 'valid' : 'corrupt',
      expected: file.sha256,
      actual,
      size: stats.size,
    })
    reportProgress(index + 1, file.path)
  }

  if (cacheDirty) await writeVerificationCache(installPath, cache)

  return {
    installPath,
    scanned: results.length,
    missing: results.filter((item) => item.status === 'missing').map((item) => item.path),
    corrupt: results.filter((item) => item.status === 'corrupt').map((item) => item.path),
    valid: results.filter((item) => item.status === 'valid').map((item) => item.path),
    cacheHits,
    hashed,
    results,
  }
}

function parseJavaVersion(output) {
  const match = output.match(/version "([^"]+)"/) ?? output.match(/openjdk ([^\s]+)/i)
  const version = match?.[1] ?? 'unknown'
  const majorMatch = version.match(/^(\d+)/)
  return { version, major: majorMatch ? Number(majorMatch[1]) : 0 }
}

function execFileSafe(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 8000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout, stderr, error: error?.message })
    })
  })
}

async function javaDetect() {
  const candidates = []
  const search = javaSearchConfigForPlatform({
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
  })
  const [pathCommand, pathArgs] = search.pathCommand
  const detectedOnPath = await execFileSafe(pathCommand, pathArgs)
  if (detectedOnPath.ok) {
    candidates.push(...detectedOnPath.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
  }

  for (const base of search.roots) {
    if (!(await exists(base))) continue
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const javaExe = path.join(base, entry.name, 'bin', search.executableName)
      if (await exists(javaExe)) candidates.push(javaExe)
    }
  }

  const collectMinecraftJava = async (root, depth = 0) => {
    if (!root || depth > 8 || !(await exists(root))) return
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === search.executableName.toLowerCase()) {
        candidates.push(fullPath)
      } else if (entry.isDirectory()) {
        await collectMinecraftJava(fullPath, depth + 1)
      }
    }
  }
  for (const root of search.minecraftRuntimeRoots) {
    await collectMinecraftJava(root)
  }

  const unique = [...new Set(candidates)]
  const runtimes = []
  for (const javaPath of unique) {
    const versionResult = await execFileSafe(javaPath, ['-version'])
    const parsed = parseJavaVersion(`${versionResult.stdout}\n${versionResult.stderr}`)
    runtimes.push({
      path: javaPath,
      version: parsed.version,
      major: parsed.major,
      vendor: `${versionResult.stderr}\n${versionResult.stdout}`.includes('OpenJDK') ? 'OpenJDK' : 'Java Runtime',
      valid: parsed.major >= 25,
      warning: parsed.major >= 25 ? undefined : 'Java 25+ is recommended for Ashfall 1.4.0.',
    })
  }

  return {
    runtimes,
    preferred: runtimes.find((runtime) => runtime.valid) ?? runtimes[0] ?? null,
  }
}

async function copyRecursive(source, destination) {
  const stats = await fs.stat(source)
  if (stats.isDirectory()) {
    await ensureDir(destination)
    const entries = await fs.readdir(source, { withFileTypes: true })
    for (const entry of entries) {
      await copyRecursive(path.join(source, entry.name), path.join(destination, entry.name))
    }
    return
  }
  await ensureDir(path.dirname(destination))
  await fs.copyFile(source, destination)
}

async function backupCreate(payload = {}) {
  const paths = getPaths()
  const sourcePath = normalizePath(payload.sourcePath)
  if (!payload.sourcePath || !(await exists(sourcePath))) {
    return {
      ok: false,
      reason: 'Source path does not exist. Select or create a world/config directory before backing it up.',
      sourcePath: payload.sourcePath ?? null,
    }
  }

  const profileId = payload.profileId ?? 'ashfall'
  const destination = path.join(paths.backups, profileId, nowStamp())
  await copyRecursive(sourcePath, destination)
  return { ok: true, sourcePath, backupPath: destination }
}

async function countFilesRecursive(target) {
  if (!(await exists(target))) return { files: 0, bytes: 0 }
  const stats = await fs.stat(target)
  if (stats.isFile()) return { files: 1, bytes: stats.size }
  if (!stats.isDirectory()) return { files: 0, bytes: 0 }
  let files = 0
  let bytes = 0
  const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const counted = await countFilesRecursive(path.join(target, entry.name))
    files += counted.files
    bytes += counted.bytes
  }
  return { files, bytes }
}

async function backupRestore(payload = {}) {
  if (!payload.backupPath || !payload.destinationPath) {
    throw new Error('Backup path and destination path are required.')
  }
  const paths = getPaths()
  const backupPath = normalizePath(payload.backupPath)
  const backupsRoot = normalizePath(paths.backups)
  if (backupPath !== backupsRoot && !backupPath.startsWith(`${backupsRoot}${path.sep}`)) {
    throw new Error('Backup restore is limited to ECHO-managed backup folders.')
  }
  if (!(await exists(backupPath))) throw new Error('Selected backup folder does not exist.')
  const destinationPath = normalizePath(payload.destinationPath)
  await ensureDir(destinationPath)
  await copyRecursive(backupPath, destinationPath)
  const restored = await countFilesRecursive(backupPath)
  return {
    ok: true,
    backupPath,
    destinationPath,
    restoredAt: isoNow(),
    filesRestored: restored.files,
    warnings: [],
  }
}

function safeRelativePathList(values = []) {
  const seen = new Set()
  const safe = []
  for (const value of values) {
    const relativePath = String(value ?? '').replace(/\\/g, '/')
    if (!isSafeRelativePath(relativePath)) continue
    const key = relativePath.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    safe.push(relativePath)
  }
  return safe
}

function rollbackPlanCreatedPaths(plan = {}) {
  return safeRelativePathList([
    ...(Array.isArray(plan.created) ? plan.created : []),
    ...(Array.isArray(plan.createdByOperation) ? plan.createdByOperation : []),
    ...(Array.isArray(plan.createdDuringOperation) ? plan.createdDuringOperation : []),
  ])
}

async function rollbackRestoreLatest(payload = {}) {
  const paths = getPaths()
  const profiles = await profileList()
  const profile = selectLauncherProfile(profiles, payload, true)
  const profileId = payload.profileId ?? profile?.id
  const installPath = normalizePath(payload.installPath ?? profile?.installPath)
  if (!profileId) throw new Error('Profile id is required to restore a rollback plan.')
  if (!payload.installPath && !profile?.installPath) throw new Error('Install path is required to restore a rollback plan.')

  const logsRoot = normalizePath(paths.logs)
  await ensureDir(logsRoot)
  const entries = await fs.readdir(logsRoot, { withFileTypes: true }).catch(() => [])
  const candidates = []
  for (const entry of entries) {
    if (!entry.isFile() || !/^rollback-(?:legacy-)?install-.+\.json$/u.test(entry.name)) continue
    const filePath = path.join(logsRoot, entry.name)
    const plan = await readJson(filePath, null)
    if (!plan?.installPath || !samePath(plan.installPath, installPath)) continue
    if (plan.profileId && plan.profileId !== profileId) continue
    const created = rollbackPlanCreatedPaths(plan)
    const backedUp = Array.isArray(plan.backedUp) ? plan.backedUp : []
    if (!created.length && !backedUp.length) continue
    const stat = await fs.stat(filePath).catch(() => null)
    candidates.push({
      filePath,
      plan,
      created,
      backedUp,
      sortTime: Number.isFinite(Date.parse(plan.createdAt)) ? Date.parse(plan.createdAt) : stat?.mtimeMs ?? 0,
    })
  }
  candidates.sort((a, b) => b.sortTime - a.sortTime)
  const selected = candidates[0]
  if (!selected) {
    throw new Error('No launcher-managed install/update rollback plan is available for this profile.')
  }

  const rollbackId = nowStamp()
  const restored = []
  const removed = []
  const skipped = []
  const warnings = []
  const backedUpPaths = new Set(selected.backedUp
    .map((item) => String(item?.path ?? '').replace(/\\/g, '/').toLowerCase())
    .filter(Boolean))

  for (const relativePath of selected.created) {
    if (backedUpPaths.has(relativePath.toLowerCase())) continue
    try {
      await fs.rm(safeJoin(installPath, relativePath), { recursive: true, force: true })
      removed.push(relativePath)
    } catch (error) {
      skipped.push({ path: relativePath, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  const backupsRoot = normalizePath(paths.backups)
  for (const backup of selected.backedUp) {
    const relativePath = String(backup?.path ?? '').replace(/\\/g, '/')
    if (!isSafeRelativePath(relativePath)) {
      skipped.push({ path: relativePath || '(empty)', reason: 'Rollback backup path is unsafe.' })
      continue
    }
    const backupPath = normalizePath(backup.backupPath)
    if (!pathInsideRoot(backupPath, backupsRoot)) {
      skipped.push({ path: relativePath, reason: 'Rollback backup is outside the launcher-managed backup folder.' })
      continue
    }
    if (!(await exists(backupPath))) {
      skipped.push({ path: relativePath, reason: `Rollback backup is missing: ${backupPath}` })
      continue
    }
    try {
      await copyRecursive(backupPath, safeJoin(installPath, relativePath))
      restored.push(relativePath)
    } catch (error) {
      skipped.push({ path: relativePath, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  const manifestPath = normalizePath(payload.manifestPath ?? profile?.manifestPath ?? path.join(installPath, '.echo', 'installed-manifest.json'))
  const restoredManifest = await readJson(manifestPath, null)
  const after = restoredManifest ? await verifyManifest({ manifest: restoredManifest, installPath }) : undefined
  if (!restoredManifest) warnings.push('Restored install manifest was not found; file integrity verification was skipped.')
  if (after && (after.missing.length || after.corrupt.length)) {
    warnings.push(`Restored manifest still reports ${after.missing.length} missing and ${after.corrupt.length} corrupt files.`)
  }

  const ok = skipped.length === 0 && warnings.length === 0
  const report = {
    ok,
    rollbackId,
    profileId,
    installPath,
    restoredAt: isoNow(),
    rollbackPlanPath: selected.filePath,
    restored,
    removed,
    skipped,
    warnings,
    after,
  }
  const reportPath = path.join(paths.logs, `rollback-restore-${rollbackId}.json`)
  await writeJson(reportPath, report)

  if (profile && restoredManifest) {
    await profileSave({
      ...profile,
      installPath,
      version: restoredManifest.version ?? profile.version,
      minecraft: minecraftVersionFromManifest(restoredManifest),
      neoforge: restoredManifest.loader?.version ?? profile.neoforge,
      status: ok ? 'healthy' : 'warning',
      manifestPath,
    })
  }
  await appendLauncherLog(ok ? 'INFO' : 'WARN', `Rollback restore ${rollbackId} completed for ${profileId}. Restored ${restored.length}, removed ${removed.length}, skipped ${skipped.length}.`)
  return { ...report, reportPath }
}

async function logsRead(payload = {}) {
  const installPath = normalizePath(payload.installPath)
  const logDir = payload.installPath ? path.join(installPath, 'logs') : path.join(getPaths().logs)
  const crashDir = payload.installPath ? path.join(installPath, 'crash-reports') : null
  const files = []

  for (const dir of [logDir, crashDir].filter(Boolean)) {
    if (!(await exists(dir))) continue
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && /\.(log|txt|json)$/i.test(entry.name)) {
        const absolutePath = path.join(dir, entry.name)
        const stats = await fs.stat(absolutePath)
        files.push({ path: absolutePath, name: entry.name, modifiedAt: stats.mtime.toISOString(), size: stats.size })
      }
    }
  }

  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  const latest = files[0] ? await fs.readFile(files[0].path, 'utf8') : ''
  return { files, latest }
}

async function logsExport(payload = {}) {
  const paths = getPaths()
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === payload.profileId) ?? profiles[0]
  const installPath = normalizePath(payload.installPath ?? profile?.installPath)
  const installLogs = payload.installPath || profile?.installPath ? await logsRead({ installPath }) : { files: [] }
  const launcherLogs = await logsRead({})
  const zip = new AdmZip()
  const added = []
  const seen = new Set()
  for (const file of [...installLogs.files, ...launcherLogs.files]) {
    if (seen.has(file.path)) continue
    seen.add(file.path)
    if (!(await exists(file.path))) continue
    const relativeRoot = file.path.startsWith(installPath) ? installPath : paths.logs
    const relativePath = path.relative(relativeRoot, file.path).replace(/\\/g, '/')
    const zipPath = `${file.path.startsWith(installPath) ? 'install' : 'launcher'}/${relativePath}`
    zip.addLocalFile(file.path, path.dirname(zipPath), path.basename(zipPath))
    added.push(file.path)
  }
  const diagnostic = await diagnosticExport({ profileId: profile?.id, installPath }).catch(() => null)
  if (diagnostic?.reportPath && (await exists(diagnostic.reportPath))) {
    zip.addLocalFile(diagnostic.reportPath, 'diagnostics')
    added.push(diagnostic.reportPath)
  }
  const zipPath = path.join(paths.logs, `echo-logs-${nowStamp()}.zip`)
  await ensureDir(path.dirname(zipPath))
  await new Promise((resolve, reject) => {
    zip.writeZip(zipPath, (error) => (error ? reject(error) : resolve()))
  })
  const stats = await fs.stat(zipPath)
  return {
    ok: true,
    zipPath,
    files: added,
    size: stats.size,
    generatedAt: isoNow(),
  }
}

async function assetValidate(payload = {}) {
  const installPath = normalizePath(payload.installPath)
  const moduleId = payload.moduleId ?? 'echosoundcore'
  const expected =
    payload.expected ??
    (moduleId === 'echoweathercore'
      ? ['config/weathercore/client.toml', 'config/weathercore/worldgen.toml', 'config/ashfall/worldgen.toml']
      : [
          'menu_blackbox_theme.ogg',
          'nexus_siege_01.ogg',
          'boss_station_mother_01.ogg',
          'ashfall_menu_horizon.ogg',
        ])
  const missing = []
  const present = []

  for (const asset of expected) {
    const assetPath = path.join(installPath, asset)
    if (await exists(assetPath)) present.push(asset)
    else missing.push(asset)
  }

  return {
    moduleId,
    installPath,
    scannedAt: isoNow(),
    expected: expected.length,
    present,
    missing,
    warnings: missing.length ? [`${missing.length} ${moduleId} asset/profile entries are missing.`] : [],
  }
}

function titleFromModuleId(moduleId) {
  return String(moduleId ?? 'module')
    .replace(/^echo/i, 'ECHO ')
    .replace(/ashfall/i, 'Ashfall ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

async function ecosystemScan(payload = {}) {
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === (payload.profileId ?? CANONICAL_PROFILE_ID)) ?? profiles[0]
  const manifest = await manifestLoad({ manifestPath: profile?.manifestPath, pack: profile?.id })
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const verification = await verifyManifest({ manifest, installPath })
  const missingSet = new Set(verification.missing.map((item) => item.replace(/\\/g, '/').toLowerCase()))
  const corruptSet = new Set(verification.corrupt.map((item) => item.replace(/\\/g, '/').toLowerCase()))
  const moduleFiles = new Map()
  for (const file of manifest.files ?? []) {
    const moduleId = String(file.moduleId ?? inferModuleIdFromPath(file.path) ?? 'pack-files').toLowerCase()
    if (!moduleFiles.has(moduleId)) moduleFiles.set(moduleId, [])
    moduleFiles.get(moduleId).push(file)
  }

  let latestVersion = undefined
  const releaseWarnings = []
  try {
    const index = await releaseList({ refresh: false })
    latestVersion = index.releases.find((release) => release.channel === CANONICAL_CHANNEL)?.version
    releaseWarnings.push(...(index.warnings ?? []))
  } catch (error) {
    releaseWarnings.push(error instanceof Error ? error.message : String(error))
  }

  const modules = [...moduleFiles.entries()].map(([moduleId, files]) => {
    const missing = files
      .map((file) => file.path)
      .filter((filePath) => missingSet.has(filePath.replace(/\\/g, '/').toLowerCase()))
    const corrupt = files
      .map((file) => file.path)
      .filter((filePath) => corruptSet.has(filePath.replace(/\\/g, '/').toLowerCase()))
    const status = corrupt.length ? 'critical' : missing.length ? 'warning' : latestVersion && latestVersion !== manifest.version ? 'update_available' : 'healthy'
    return {
      id: moduleId,
      name: titleFromModuleId(moduleId),
      installedVersion: manifest.version ?? profile.version,
      latestVersion: latestVersion ?? manifest.version ?? profile.version,
      status,
      requiredDependencies: [],
      optionalIntegrations: [],
      notes:
        status === 'healthy'
          ? `${files.length} manifest file${files.length === 1 ? '' : 's'} verified.`
          : `${missing.length} missing and ${corrupt.length} corrupt file${missing.length + corrupt.length === 1 ? '' : 's'} detected.`,
      missing,
      corrupt,
    }
  })

  const assetReports = []
  for (const moduleId of ['echosoundcore', 'echoweathercore']) {
    assetReports.push(await assetValidate({ installPath, moduleId }))
  }
  const warnings = [
    ...releaseWarnings,
    ...assetReports.flatMap((report) => report.warnings),
    ...(verification.missing.length || verification.corrupt.length
      ? [`${verification.missing.length} files missing and ${verification.corrupt.length} corrupt.`]
      : []),
  ]

  return {
    ok: warnings.length === 0,
    generatedAt: isoNow(),
    installPath,
    profile,
    currentVersion: manifest.version ?? profile.version,
    latestVersion,
    verification,
    modules: modules.sort((a, b) => a.name.localeCompare(b.name)),
    assetReports,
    warnings,
  }
}

function readmeText(profile, manifest) {
  return `# Ashfall Server Pack ${manifest.version}

Generated by ECHO Launcher.

Profile: ${profile?.name ?? 'Ashfall'}
Minecraft: ${manifest.minecraft}
NeoForge: ${manifest.loader?.version ?? 'unknown'}
Required Java: Java 25+

Run start.bat on Windows or start.sh on Linux/macOS after accepting the Minecraft EULA.
`
}

async function copyIfExists(sourceRoot, relativePath, destinationRoot, copied, warnings) {
  const source = safeJoin(sourceRoot, relativePath)
  if (!(await exists(source))) {
    warnings.push(`Missing source file: ${relativePath}`)
    return
  }
  const destination = safeJoin(destinationRoot, relativePath)
  await copyRecursive(source, destination)
  copied.push(relativePath)
}

async function serverPlan(payload = {}) {
  const paths = getPaths()
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === payload.profileId) ?? profiles[0]
  const manifest = payload.manifest ?? (await manifestLoad({ ...payload, pack: payload.pack ?? profile?.id }))
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const outputDirectory = normalizePath(payload.outputDir ?? path.join(paths.exports, `Ashfall-Server-Pack-${manifest.version}`))
  const files = ['server-manifest.json', 'README.md', 'start.bat', 'start.sh']
  const warnings = []
  let estimatedBytes = 0

  for (const file of manifest.files ?? []) {
    if (file.side === 'client') continue
    files.push(file.path)
    estimatedBytes += Number(file.size ?? 0)
  }
  if (payload.includeConfigs !== false) {
    for (const configDir of ['config', 'defaultconfigs']) {
      files.push(configDir)
      estimatedBytes += (await countFilesRecursive(path.join(installPath, configDir))).bytes
    }
  }
  if (payload.includeDatapacks !== false) {
    files.push('datapacks')
    estimatedBytes += (await countFilesRecursive(path.join(installPath, 'datapacks'))).bytes
  }
  if (payload.includeWorldBackup) {
    warnings.push('World backups can be large; verify the output size before sharing.')
    estimatedBytes += (await countFilesRecursive(path.join(installPath, 'saves'))).bytes
  }
  if (!(await exists(installPath))) warnings.push('Ashfall install folder does not exist yet.')

  return {
    ok: warnings.length === 0 || (await exists(installPath)),
    profileId: profile?.id ?? payload.profileId ?? CANONICAL_PROFILE_ID,
    installPath,
    outputDirectory,
    estimatedSizeMb: Math.max(1, Math.round(estimatedBytes / 1024 / 1024)),
    requiredJava: 'Java 25+',
    neoforgeVersion: manifest.loader?.version ?? 'unknown',
    files: [...new Set(files)],
    warnings,
  }
}

async function serverGenerate(payload = {}) {
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === payload.profileId) ?? profiles[0]
  const manifest = payload.manifest ?? (await manifestLoad({ ...payload, pack: payload.pack ?? profile?.id }))
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const plan = await serverPlan(payload)
  const outputDir = plan.outputDirectory
  const warnings = []
  const copied = []

  await ensureDir(outputDir)
  await ensureDir(path.join(outputDir, 'mods'))
  await writeJson(path.join(outputDir, 'server-manifest.json'), {
    generatedAt: new Date().toISOString(),
    profileId: profile?.id ?? payload.profileId,
    manifest,
    options: payload,
  })
  await fs.writeFile(path.join(outputDir, 'README.md'), readmeText(profile, manifest), 'utf8')
  await fs.writeFile(
    path.join(outputDir, 'start.bat'),
    `@echo off\r\njava -Xmx${payload.ramGb ?? 6}G -jar neoforge-server.jar nogui\r\npause\r\n`,
    'utf8',
  )
  await fs.writeFile(
    path.join(outputDir, 'start.sh'),
    `#!/usr/bin/env sh\njava -Xmx${payload.ramGb ?? 6}G -jar neoforge-server.jar nogui\n`,
    'utf8',
  )

  for (const file of manifest.files ?? []) {
    if (file.side === 'client') continue
    await copyIfExists(installPath, file.path, outputDir, copied, warnings)
  }

  if (payload.includeConfigs !== false) {
    for (const configDir of ['config', 'defaultconfigs']) {
      if (await exists(path.join(installPath, configDir))) {
        await copyRecursive(path.join(installPath, configDir), path.join(outputDir, configDir))
        copied.push(configDir)
      }
    }
  }

  if (payload.includeDatapacks !== false) {
    const datapacks = path.join(installPath, 'datapacks')
    if (await exists(datapacks)) {
      await copyRecursive(datapacks, path.join(outputDir, 'datapacks'))
      copied.push('datapacks')
    }
  }

  return {
    ok: true,
    outputDirectory: outputDir,
    copied,
    warnings: [...plan.warnings, ...warnings],
    requiredJava: plan.requiredJava,
    neoforgeVersion: plan.neoforgeVersion,
  }
}

function requestHeaders(extra = {}) {
  return {
    'User-Agent': 'ECHO-Launcher/2.0',
    Accept: 'application/vnd.github+json, application/json, */*',
    ...extra,
  }
}

function requestBuffer(url, options = {}, redirects = 0) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return Promise.reject(new Error('A valid http(s) URL is required.'))
  }
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const request = client.request(url, {
      method: options.method ?? 'GET',
      headers: requestHeaders({
        ...(options.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(options.body) } : {}),
        ...(options.headers ?? {}),
      }),
    }, (response) => {
      const status = response.statusCode ?? 0
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location && redirects < 5) {
        response.resume()
        resolve(requestBuffer(new URL(response.headers.location, url).toString(), options, redirects + 1))
        return
      }
      if (status >= 400) {
        response.resume()
        reject(new Error(`Request failed with HTTP ${status}`))
        return
      }
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    })
    request.on('error', reject)
    if (options.body) request.write(options.body)
    request.end()
  })
}

async function fetchJson(url, options = {}) {
  const body = await requestBuffer(url, options)
  return JSON.parse(body.toString('utf8'))
}

function normalizeCanonicalIndexEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const required = ['id', 'kind', 'version', 'channel', 'publisher', 'sourceRepo', 'releaseTag', 'commitSha', 'artifacts', 'dependencies', 'compatibility', 'trust', 'validation']
  if (required.some((field) => value[field] === undefined || value[field] === null || value[field] === '')) return null
  return {
    id: String(value.id),
    kind: String(value.kind),
    version: String(value.version),
    channel: String(value.channel),
    publisher: String(value.publisher),
    sourceRepo: String(value.sourceRepo),
    releaseTag: String(value.releaseTag),
    commitSha: String(value.commitSha),
    artifacts: value.artifacts,
    dependencies: Array.isArray(value.dependencies) ? value.dependencies : [],
    compatibility: Array.isArray(value.compatibility) ? value.compatibility.map((item) => String(item)) : [],
    trust: String(value.trust),
    validation: String(value.validation),
    notes: value.notes === undefined ? undefined : String(value.notes),
    publishedAt: value.publishedAt === undefined ? undefined : String(value.publishedAt),
  }
}

function catalogUrlsFromLauncherChannel(channel) {
  const urls = []
  const catalogUrls = channel?.catalogUrls && typeof channel.catalogUrls === 'object' ? channel.catalogUrls : {}
  const allowLocalUrls = process.env.ECHO_RELEASE_INDEX_ALLOW_LOCAL_URLS === '1'
  for (const value of Object.values(catalogUrls)) {
    if (Array.isArray(value)) urls.push(...value)
    else if (typeof value === 'string') urls.push(value)
  }
  return [...new Set(urls.map((url) => String(url).trim()).filter((url) => {
    if (/^https:\/\/raw\.githubusercontent\.com\//.test(url)) return true
    return allowLocalUrls && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\//i.test(url)
  }))]
}

function normalizeLauncherChannelPack(value, fallbackChannel) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = normalizeOfficialPackId(value.id)
  if (!id) return null
  const pack = {
    id,
    name: String(value.name ?? id),
    channel: String(value.channel ?? fallbackChannel ?? CANONICAL_CHANNEL),
  }
  for (const field of ['loader', 'moduleArtifactFamily', 'manifestUrl', 'catalogEntryUrl', 'repoUrl', 'catalogStatus', 'diagnostic']) {
    if (value[field] !== undefined && value[field] !== null && value[field] !== '') {
      pack[field] = String(value[field])
    }
  }
  return pack
}

function launcherChannelPacks(channel) {
  return (Array.isArray(channel?.packs) ? channel.packs : [])
    .map((pack) => normalizeLauncherChannelPack(pack, channel?.channel))
    .filter(Boolean)
}

async function fetchCanonicalReleaseIndexCatalog(config, cachePath) {
  const channelUrl = String(config?.channelUrl ?? CANONICAL_RELEASE_INDEX_CHANNEL_URL).trim() || CANONICAL_RELEASE_INDEX_CHANNEL_URL
  const channel = await fetchJson(channelUrl)
  const warnings = []
  const entries = []
  for (const url of catalogUrlsFromLauncherChannel(channel)) {
    try {
      const payload = await fetchJson(url)
      const rows = Array.isArray(payload) ? payload : [payload]
      for (const row of rows) {
        const normalized = normalizeCanonicalIndexEntry(row)
        if (normalized) entries.push(normalized)
        else warnings.push(`Skipped non-canonical index payload from ${url}.`)
      }
    } catch (error) {
      warnings.push(`Unable to fetch catalog entry ${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const catalog = {
    sourceUrl: channelUrl,
    fetchedAt: isoNow(),
    channel: channel?.channel,
    entries,
    packs: launcherChannelPacks(channel),
    warnings,
  }
  await writeJson(cachePath, catalog)
  return catalog
}

function isReleaseIndexCatalogCacheValid(cached, config) {
  const fetchedAt = Date.parse(cached?.fetchedAt ?? '')
  return (
    cached &&
    cached.sourceUrl === config.channelUrl &&
    Array.isArray(cached.entries) &&
    Array.isArray(cached.packs) &&
    Number.isFinite(fetchedAt) &&
    Date.now() - fetchedAt < 15 * 60 * 1000
  )
}

async function releaseIndexCatalog(payload = {}) {
  const settings = await readSettings()
  const config = settings.releaseIndex ?? DEFAULT_DESKTOP_SETTINGS.releaseIndex
  const paths = getPaths()
  const cachePath = path.join(paths.releaseCache, 'canonical-release-index.json')
  if (!config.enabled) {
    return { sourceUrl: config.channelUrl, fetchedAt: isoNow(), channel: undefined, entries: [], packs: [], warnings: ['Canonical Release Index is disabled in settings.'] }
  }
  if (!payload.refresh && await exists(cachePath)) {
    const cached = await readJson(cachePath, null)
    if (isReleaseIndexCatalogCacheValid(cached, config)) return cached
  }
  if (releaseIndexCatalogRefreshInFlight) return releaseIndexCatalogRefreshInFlight
  releaseIndexCatalogRefreshInFlight = fetchCanonicalReleaseIndexCatalog(config, cachePath).finally(() => {
    releaseIndexCatalogRefreshInFlight = null
  })
  return releaseIndexCatalogRefreshInFlight
}

async function releaseIndexProduct(payload = {}) {
  const id = String(payload.id ?? '').trim()
  if (!id) throw new Error('Release Index product id is required.')
  const compatibility = payload.compatibility ? String(payload.compatibility) : ''
  const catalog = await releaseIndexCatalog({ refresh: payload.refresh })
  const productKinds = new Set(['product', 'runtime', 'studio', 'website'])
  const candidates = catalog.entries
    .filter((item) => productKinds.has(item.kind))
    .filter((item) => item.validation === 'approved')
    .filter((item) => item.id === id)
    .filter((item) => !compatibility || item.compatibility.includes(compatibility))
    .sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }))
  const warnings = [...catalog.warnings]
  for (const entry of candidates) {
    const artifact = productUpdateArtifact(entry, compatibility)
    if (artifact) return { entry, artifact, warnings }
    warnings.push(`Release Index product ${entry.id} ${entry.version} has no indexed updater artifact${compatibility ? ` for ${compatibility}` : ''}.`)
  }
  return { entry: null, warnings }
}


async function mergeCanonicalReleaseEntries(index, settings, payload = {}) {
  if (!settings.releaseIndex?.enabled) return index
  try {
    const catalog = await releaseIndexCatalog({ refresh: payload.refresh })
    const canonicalEntries = catalog.entries
      .map((entry) => releaseEntryFromCanonicalModpack(entry, catalog.fetchedAt))
      .filter(Boolean)
    const nonApprovedModpacks = catalog.entries.filter((entry) => entry.kind === 'modpack' && entry.validation !== 'approved')
    const byKey = new Map()
    for (const entry of [...canonicalEntries, ...index.releases]) {
      byKey.set(`${normalizeOfficialPackId(entry.pack) ?? entry.pack}:${entry.channel}:${entry.version}`, entry)
    }
    const releases = [...byKey.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    const warnings = [
      ...catalog.warnings,
      ...index.warnings,
    ]
    return {
      ...index,
      fetchedAt: isoNow(),
      releases,
      packs: catalog.packs ?? [],
      acceptedCount: releases.length,
      latestPlayableRelease: releases[0] ?? null,
      warnings,
      diagnostics: [
        ...(index.diagnostics ?? []),
        ...canonicalEntries.map((entry) => ({
          tagName: entry.tagName,
          releaseName: entry.name,
          severity: 'info',
          reason: `Accepted Release Index ${entry.pack} ${entry.version}.`,
          assets: entry.assets.map((asset) => asset.name),
        })),
        ...nonApprovedModpacks.map((entry) => ({
          tagName: entry.releaseTag,
          releaseName: entry.id,
          severity: entry.validation === 'blocked' || entry.validation === 'rejected' ? 'critical' : 'warning',
          reason: entry.notes ?? `Release Index ${entry.id} is ${entry.validation}.`,
          assets: [],
        })),
      ],
    }
  } catch (error) {
    return {
      ...index,
      warnings: [
        `Canonical Release Index unavailable: ${error instanceof Error ? error.message : String(error)}`,
        ...index.warnings,
      ],
    }
  }
}

async function canonicalOnlyReleaseIndex(config, settings, payload = {}, extraWarnings = []) {
  const catalog = await releaseIndexCatalog({ refresh: payload.refresh })
  const releases = catalog.entries
    .map((entry) => releaseEntryFromCanonicalModpack(entry, catalog.fetchedAt))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  const nonApprovedModpacks = catalog.entries.filter((entry) => entry.kind === 'modpack' && entry.validation !== 'approved')
  return {
    cacheVersion: RELEASE_CACHE_VERSION,
    source: config,
    fetchedAt: isoNow(),
    releases,
    packs: catalog.packs ?? [],
    acceptedCount: releases.length,
    rejectedReleases: [],
    diagnostics: [
      ...releases.map((entry) => ({
        tagName: entry.tagName,
        releaseName: entry.name,
        severity: 'info',
        reason: `Accepted Release Index ${entry.pack} ${entry.version}.`,
        assets: entry.assets.map((asset) => asset.name),
      })),
      ...nonApprovedModpacks.map((entry) => ({
        tagName: entry.releaseTag,
        releaseName: entry.id,
        severity: entry.validation === 'blocked' || entry.validation === 'rejected' ? 'critical' : 'warning',
        reason: entry.notes ?? `Release Index ${entry.id} is ${entry.validation}.`,
        assets: [],
      })),
    ],
    latestPlayableRelease: releases[0] ?? null,
    warnings: [...extraWarnings, ...catalog.warnings],
  }
}

async function resolveEchoProtocolUrl(rawUrl) {
  const request = parseEchoProtocolUrl(rawUrl)
  if (!request) throw new Error(`Unsupported ECHO protocol URL: ${rawUrl}`)
  const catalog = await releaseIndexCatalog({ refresh: false })
  const entry = catalog.entries.find((item) => {
    if (item.validation !== 'approved') return false
    if (request.action === 'install-addon') {
      return (item.kind === 'addon' || item.kind === 'module') && item.id.toLowerCase() === request.id
    }
    return item.kind === 'modpack' && item.id.toLowerCase() === String(request.id).toLowerCase()
  })
  if (!entry) throw new Error(`No approved Release Index entry found for ${request.action} ${request.id}.`)
  const dependencies = dependencyClosure(catalog.entries, [entry.id]).filter((dependency) => dependency.id !== entry.id)
  if (request.action === 'install-addon') {
    const targetPack = request.pack ?? 'ashfall-native-edition'
    const artifact = artifactForPackTarget(entry, targetPack)
    if (!artifact?.url || !artifact.sha256) {
      throw new Error(`No indexed ${targetPack} artifact found for ${entry.id}.`)
    }
    return {
      ...request,
      entry,
      dependencies,
      artifact: {
        name: artifact.name,
        url: artifact.url,
        size: artifact.size,
        sha256: artifact.sha256,
      },
    }
  }
  return { ...request, entry, dependencies }
}

async function handleEchoProtocolUrl(rawUrl) {
  try {
    pendingProtocolAction = await resolveEchoProtocolUrl(rawUrl)
    await appendLauncherLog('INFO', `Resolved ECHO protocol action: ${pendingProtocolAction.action} ${pendingProtocolAction.id}`)
  } catch (error) {
    pendingProtocolAction = null
    await appendLauncherLog('ERROR', `Rejected ECHO protocol URL ${rawUrl}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const window = BrowserWindow.getAllWindows()[0]
  if (window) {
    if (window.isMinimized()) window.restore()
    window.focus()
  }
  return pendingProtocolAction
}

function githubApiUrl(owner, repo, suffix) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`
}

function githubUploadUrl(uploadUrl, assetName) {
  const base = String(uploadUrl).replace(/\{.*$/u, '')
  return `${base}?name=${encodeURIComponent(assetName)}`
}

function githubJsonRequest(url, { method = 'GET', token, body, accept404 = false } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8')
    const request = https.request(url, {
      method,
      headers: requestHeaders({
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      }),
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const status = response.statusCode ?? 0
        const text = Buffer.concat(chunks).toString('utf8')
        if (status === 404 && accept404) {
          resolve(null)
          return
        }
        if (status >= 400) {
          reject(new Error(`GitHub request failed with HTTP ${status}: ${text.slice(0, 240)}`))
          return
        }
        resolve(text ? JSON.parse(text) : {})
      })
    })
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

function githubUploadAsset(uploadUrl, assetName, filePath, token, contentType = 'application/octet-stream') {
  return new Promise(async (resolve, reject) => {
    try {
      const stats = await fs.stat(filePath)
      const request = https.request(githubUploadUrl(uploadUrl, assetName), {
        method: 'POST',
        headers: requestHeaders({
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'Content-Length': stats.size,
        }),
      }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const status = response.statusCode ?? 0
          const text = Buffer.concat(chunks).toString('utf8')
          if (status >= 400) {
            reject(new Error(`GitHub asset upload failed with HTTP ${status}: ${text.slice(0, 240)}`))
            return
          }
          resolve(text ? JSON.parse(text) : {})
        })
      })
      request.on('error', reject)
      fssync.createReadStream(filePath).on('error', reject).pipe(request)
    } catch (error) {
      reject(error)
    }
  })
}

async function downloadFile(payload = {}) {
  if (!payload.url || !/^https?:\/\//i.test(payload.url)) {
    throw new Error('A valid http(s) URL is required for download.')
  }
  const paths = getPaths()
  const destination = normalizePath(payload.destination ?? path.join(paths.downloads, path.basename(new URL(payload.url).pathname)))
  await ensureDir(path.dirname(destination))
  const body = await requestBuffer(payload.url, { headers: payload.headers })
  await fs.writeFile(destination, body)

  const sha256 = await sha256File(destination)
  const verified = payload.sha256 ? sha256.toLowerCase() === String(payload.sha256).toLowerCase() : true
  if (!verified) {
    await fs.rm(destination, { force: true })
    throw new Error(`SHA-256 mismatch for ${path.basename(destination)}.`)
  }
  return { destination, sha256, verified }
}

function isGitHubReleaseAssetApiUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'api.github.com' && /\/repos\/[^/]+\/[^/]+\/releases\/assets\/\d+$/u.test(parsed.pathname)
  } catch {
    return false
  }
}

async function backupFileIfExists(sourcePath, backupRoot, relativePath) {
  if (!(await exists(sourcePath))) return null
  const backupPath = safeJoin(backupRoot, relativePath)
  await ensureDir(path.dirname(backupPath))
  await fs.copyFile(sourcePath, backupPath)
  return backupPath
}

function officialPackZipAsset(assets, pack = CANONICAL_PROFILE_ID) {
  const escapedPack = String(pack).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return assets.find((asset) => new RegExp(`^${escapedPack}[-_].+\\.zip$`, 'i').test(asset.name)) ?? assets.find((asset) => /\.zip$/i.test(asset.name))
}

function releaseAssetNames(assets) {
  return assets.map((asset) => asset.name).filter(Boolean)
}

function releaseDiagnostic(release, severity, reason, assets = []) {
  return {
    tagName: release?.tag_name ?? 'unknown',
    releaseName: release?.name ?? release?.tag_name ?? 'unknown',
    severity,
    reason,
    assets: releaseAssetNames(assets),
  }
}

async function fetchReleaseAssets(release, fallbackAssets = []) {
  if (!release?.assets_url) return fallbackAssets
  const all = []
  for (let page = 1; page <= 20; page += 1) {
    const separator = release.assets_url.includes('?') ? '&' : '?'
    const pageAssets = await fetchJson(`${release.assets_url}${separator}per_page=100&page=${page}`)
    if (!Array.isArray(pageAssets)) break
    all.push(...pageAssets)
    if (pageAssets.length < 100) break
  }
  return all.length ? all : fallbackAssets
}

function rejectedRelease(release, reasons, assets = []) {
  return {
    tagName: release?.tag_name ?? 'unknown',
    name: release?.name ?? release?.tag_name ?? 'unknown',
    draft: Boolean(release?.draft),
    prerelease: Boolean(release?.prerelease),
    publishedAt: release?.published_at ?? release?.created_at ?? new Date().toISOString(),
    releasePageUrl: release?.html_url,
    assets: releaseAssetNames(assets),
    reasons,
  }
}

function metadataShaGetter(metadata) {
  return (assetName) => {
    if (!assetName) return undefined
    if (Array.isArray(metadata?.assets)) return metadata.assets.find((asset) => asset.name === assetName)?.sha256
    return metadata?.assets?.[assetName]?.sha256
  }
}

let moduleReleaseAssetsCache = null
let moduleReleaseAssetsInFlight = null

async function fetchIndexedModuleReleaseAssets(payload = {}) {
  const catalog = await releaseIndexCatalog({ refresh: payload.refresh })
  const assets = []
  for (const entry of catalog.entries ?? []) {
    if (entry.kind !== 'module' && entry.kind !== 'addon') continue
    const artifacts = entry.artifacts && typeof entry.artifacts === 'object' ? entry.artifacts : {}
    for (const [family, artifact] of Object.entries(artifacts)) {
      if (family === 'sources' || !artifact || typeof artifact !== 'object') continue
      const name = String(artifact.file ?? artifact.name ?? artifact.assetName ?? '').trim()
      const url = String(artifact.url ?? artifact.browser_download_url ?? artifact.browserDownloadUrl ?? '').trim()
      const sha256 = String(artifact.sha256 ?? '').trim()
      if (!name || !/^https?:\/\//i.test(url) || !/^[a-f0-9]{64}$/i.test(sha256)) continue
      assets.push({
        name,
        url,
        browser_download_url: url,
        sha256: sha256.toLowerCase(),
        size: Number.isFinite(Number(artifact.size)) ? Number(artifact.size) : 0,
        moduleId: entry.id,
        family,
        releaseTag: entry.releaseTag,
        releasePageUrl: `https://github.com/${entry.sourceRepo}/releases/tag/${entry.releaseTag}`,
        validation: entry.validation,
      })
    }
  }
  return assets
}

async function fetchKnownModuleReleaseAssetsFromPublicMetadata() {
  const assets = []
  for (const tag of ECHO_MODULE_RELEASE_DOWNLOAD_TAGS) {
    const baseUrl = `https://github.com/${MODULE_RELEASE_OWNER}/${MODULE_RELEASE_REPO}/releases/download/${encodeURIComponent(tag)}`
    try {
      const metadata = await fetchJson(`${baseUrl}/${encodeURIComponent(RELEASE_METADATA_ASSET)}`)
      assets.push(...moduleReleaseAssetsFromMetadata(metadata, tag))
      continue
    } catch {
      // Older module releases may only carry checksums.txt. That is still enough
      // to build hash-verified public download URLs for individual module files.
    }
    try {
      const checksumText = (await requestBuffer(`${baseUrl}/checksums.txt`)).toString('utf8')
      assets.push(...moduleReleaseAssetsFromChecksumText(checksumText, tag))
    } catch {
      // Keep trying the remaining known releases.
    }
  }
  return assets
}

function dedupeModuleReleaseAssets(assets = []) {
  const byNameAndSha = new Set()
  const deduped = []
  for (const asset of assets) {
    const name = String(asset?.name ?? '').trim()
    if (!name) continue
    const sha256 = String(asset?.sha256 ?? '').trim().toLowerCase()
    const key = `${name}:${sha256 || asset?.url || asset?.browser_download_url || ''}`
    if (byNameAndSha.has(key)) continue
    byNameAndSha.add(key)
    deduped.push(asset)
  }
  return deduped
}

async function fetchModuleReleaseAssets(payload = {}) {
  if (!payload.refresh && moduleReleaseAssetsCache) return moduleReleaseAssetsCache
  if (moduleReleaseAssetsInFlight) return moduleReleaseAssetsInFlight
  moduleReleaseAssetsInFlight = (async () => {
    const indexedAssets = await fetchIndexedModuleReleaseAssets(payload).catch(() => [])
    const publicMetadataAssets = await fetchKnownModuleReleaseAssetsFromPublicMetadata().catch(() => [])
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(MODULE_RELEASE_OWNER)}/${encodeURIComponent(MODULE_RELEASE_REPO)}/releases`
    let releases
    try {
      releases = await fetchJson(apiUrl)
    } catch {
      moduleReleaseAssetsCache = dedupeModuleReleaseAssets([...indexedAssets, ...publicMetadataAssets])
      return moduleReleaseAssetsCache
    }
    if (!Array.isArray(releases)) throw new Error('ECHO Modules release source did not return a release list.')
    const assets = [...indexedAssets, ...publicMetadataAssets]
    const sorted = releases
      .filter((release) => !release.draft)
      .sort((a, b) => Date.parse(b.published_at ?? b.created_at ?? 0) - Date.parse(a.published_at ?? a.created_at ?? 0))

    for (const release of sorted) {
      let releaseAssets
      try {
        releaseAssets = await fetchReleaseAssets(release, Array.isArray(release.assets) ? release.assets : [])
      } catch {
        continue
      }
      const metadataAsset = releaseAssets.find((asset) => asset.name === RELEASE_METADATA_ASSET)
      let metadataSha = () => undefined
      if (metadataAsset?.browser_download_url) {
        try {
          metadataSha = metadataShaGetter(await fetchJson(metadataAsset.browser_download_url))
        } catch {
          metadataSha = () => undefined
        }
      }
      for (const asset of releaseAssets) {
        if (!asset?.name || asset.name === RELEASE_METADATA_ASSET) continue
        assets.push({
          ...asset,
          sha256: metadataSha(asset.name) ?? githubAssetSha256(asset) ?? asset.sha256,
          releaseTag: release.tag_name,
          releasePageUrl: release.html_url,
        })
      }
    }
    moduleReleaseAssetsCache = dedupeModuleReleaseAssets(assets)
    return moduleReleaseAssetsCache
  })().finally(() => {
    moduleReleaseAssetsInFlight = null
  })
  return moduleReleaseAssetsInFlight
}

function releaseIndexWarnings(diagnostics) {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'info')
    .map((diagnostic) => `${diagnostic.tagName}: ${diagnostic.reason}`)
}

function blankReleaseIndex(config, warnings = [], diagnostics = [], rejectedReleases = []) {
  return {
    cacheVersion: RELEASE_CACHE_VERSION,
    source: config,
    fetchedAt: new Date().toISOString(),
    releases: [],
    packs: [],
    acceptedCount: 0,
    rejectedReleases,
    diagnostics,
    latestPlayableRelease: null,
    warnings,
  }
}

function catalogReleaseSource(settings) {
  return {
    provider: 'release-index',
    channelUrl: String(settings?.releaseIndex?.channelUrl ?? '').trim() || CANONICAL_RELEASE_INDEX_CHANNEL_URL,
  }
}

function parseReleaseMetadataEntry(metadata, release, assets, diagnostics, item = metadata) {
  const reasons = []
  if (!metadata || typeof metadata !== 'object') {
    reasons.push(`Missing or unreadable ${RELEASE_METADATA_ASSET}.`)
    diagnostics.push(releaseDiagnostic(release, 'critical', reasons.at(-1), assets))
    return { entry: null, reasons }
  }

  const effectiveMetadata = { ...metadata, ...(item ?? {}) }
  const metadataSha = metadataShaGetter({ ...metadata, assets: effectiveMetadata.assets ?? metadata.assets })
  const rawPack = effectiveMetadata.pack ?? metadata.pack
  const pack = normalizeOfficialPackId(rawPack) ?? CANONICAL_PROFILE_ID
  const manifestAssetFromMetadata = effectiveMetadata.manifestAsset ?? effectiveMetadata.manifestAssetName ?? effectiveMetadata.manifestName
  const manifestSha256 = effectiveMetadata.manifestSha256 ?? effectiveMetadata.sha256 ?? metadataSha(manifestAssetFromMetadata)
  const manifestAsset = assets.find((asset) => asset.name === manifestAssetFromMetadata)
  const fallbackManifest = assets.find((asset) => PACK_CHANNELS.some((channel) => new RegExp(`^${pack}-${channel}-.+\\.pack\\.json$`, 'i').test(asset.name)))
  const legacyFallbackManifest = pack === CANONICAL_PROFILE_ID
    ? assets.find((asset) => /^ashfall-stable-.+\.pack\.json$/i.test(asset.name))
    : null
  const selectedManifest = manifestAsset ?? fallbackManifest ?? legacyFallbackManifest
  const parsed = selectedManifest?.name.match(new RegExp(`^${pack}-(${PACK_CHANNELS.join('|')})-(.+)\\.pack\\.json$`, 'i'))
    ?? selectedManifest?.name.match(/^ashfall-stable-(.+)\.pack\.json$/i)
  const channel = effectiveMetadata.channel ?? (parsed?.[1] && CHANNELS.has(parsed[1]) ? parsed[1] : defaultChannelForPack(pack))
  const version = effectiveMetadata.version ?? (parsed?.[2] ?? parsed?.[1]) ?? release.tag_name.replace(/^v/i, '')
  const artifactAssetName = effectiveMetadata.artifactAsset ?? effectiveMetadata.artifactAssetName ?? effectiveMetadata.artifactName
  const artifactAsset = artifactAssetName ? assets.find((asset) => asset.name === artifactAssetName) : null

  if (!CHANNELS.has(channel)) {
    reasons.push(`Unsupported release channel '${channel}'. Expected '${CANONICAL_CHANNEL}'.`)
    diagnostics.push(releaseDiagnostic(release, 'warning', reasons.at(-1), assets))
    return { entry: null, reasons }
  }

  if (!selectedManifest) {
    reasons.push(`Missing pack manifest asset '${manifestAssetFromMetadata || manifestAssetName(CANONICAL_CHANNEL, '<version>', pack)}'.`)
    diagnostics.push(releaseDiagnostic(release, 'critical', reasons.at(-1), assets))
    return { entry: null, reasons }
  }
  if (!manifestSha256) {
    reasons.push(`${RELEASE_METADATA_ASSET} is missing manifestSha256 for '${selectedManifest.name}'.`)
    diagnostics.push(releaseDiagnostic(release, 'critical', reasons.at(-1), assets))
    return { entry: null, reasons }
  }
  const githubManifestSha256 = githubAssetSha256(selectedManifest)
  if (githubManifestSha256 && githubManifestSha256.toLowerCase() !== String(manifestSha256).toLowerCase()) {
    reasons.push(`Manifest SHA-256 mismatch for '${selectedManifest.name}': ${RELEASE_METADATA_ASSET} has ${manifestSha256}, GitHub reports ${githubManifestSha256}.`)
    diagnostics.push(releaseDiagnostic(release, 'critical', reasons.at(-1), assets))
    return { entry: null, reasons }
  }
  if (!artifactAssetName) {
    reasons.push(`${RELEASE_METADATA_ASSET} is missing artifactAsset. Metadata must name the compressed ${pack} pack archive.`)
    diagnostics.push(releaseDiagnostic(release, 'critical', reasons.at(-1), assets))
    return { entry: null, reasons }
  }
  if (!artifactAsset) {
    reasons.push(`Missing pack artifact asset '${artifactAssetName}'.`)
    diagnostics.push(releaseDiagnostic(release, 'critical', reasons.at(-1), assets))
    return { entry: null, reasons }
  }

  const artifactSha256 = effectiveMetadata.artifactSha256 ?? metadataSha(artifactAssetName) ?? githubAssetSha256(artifactAsset)
  if (!artifactSha256) {
    reasons.push(`${RELEASE_METADATA_ASSET} is missing artifactSha256 for '${artifactAssetName}'.`)
    diagnostics.push(releaseDiagnostic(release, 'critical', reasons.at(-1), assets))
    return { entry: null, reasons }
  }
  const githubArtifactSha256 = githubAssetSha256(artifactAsset)
  if (githubArtifactSha256 && githubArtifactSha256.toLowerCase() !== String(artifactSha256).toLowerCase()) {
    reasons.push(`Artifact SHA-256 mismatch for '${artifactAssetName}': ${RELEASE_METADATA_ASSET} has ${artifactSha256}, GitHub reports ${githubArtifactSha256}.`)
    diagnostics.push(releaseDiagnostic(release, 'critical', reasons.at(-1), assets))
    return { entry: null, reasons }
  }

  const entry = {
    id: `${release.id ? String(release.id) : release.tag_name}:${pack}`,
    pack,
    version,
    channel,
    tagName: release.tag_name,
    name: release.name || release.tag_name,
    draft: Boolean(release.draft),
    prerelease: Boolean(release.prerelease),
    publishedAt: release.published_at ?? release.created_at ?? new Date().toISOString(),
    releasePageUrl: release.html_url,
    releaseNotes: Array.isArray(metadata?.notes)
      ? metadata.notes
      : String(release.body ?? '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 8),
    manifestAssetName: selectedManifest.name,
    manifestUrl: selectedManifest.browser_download_url,
    manifestSha256,
    metadataUrl: assets.find((asset) => asset.name === RELEASE_METADATA_ASSET)?.browser_download_url,
    trust: 'verified-metadata',
    assets: assets.map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size ?? 0,
      sha256: metadataSha(asset.name) ?? githubAssetSha256(asset),
    })),
  }
  return { entry, reasons }
}

function parseReleaseMetadata(metadata, release, assets, diagnostics = []) {
  if (!metadata || typeof metadata !== 'object') {
    const parsed = parseReleaseMetadataEntry(metadata, release, assets, diagnostics)
    return { entries: [], reasons: parsed.reasons }
  }
  const items = Array.isArray(metadata.packs) && metadata.packs.length ? metadata.packs : [metadata]
  const entries = []
  const reasons = []
  for (const item of items) {
    const parsed = parseReleaseMetadataEntry(metadata, release, assets, diagnostics, item)
    if (parsed.entry) entries.push(parsed.entry)
    reasons.push(...parsed.reasons)
  }
  return { entries, reasons }
}

async function validateReleaseManifestAsset(entry, release, assets, diagnostics) {
  const reasons = []
  const warnings = []
  try {
    const body = await requestBuffer(entry.manifestUrl)
    const actualSha256 = sha256Buffer(body)
    if (actualSha256.toLowerCase() !== String(entry.manifestSha256).toLowerCase()) {
      reasons.push(`Manifest SHA-256 mismatch for '${entry.manifestAssetName}': expected ${entry.manifestSha256}, downloaded ${actualSha256}.`)
    } else {
      const manifest = validatePackManifest(JSON.parse(body.toString('utf8')), { allowLocalPlaceholders: false })
      const manifestPack = normalizeOfficialPackId(manifest.pack)
      if (manifestPack !== entry.pack) {
        reasons.push(`Manifest pack '${manifest.pack}' does not match release metadata pack '${entry.pack}'.`)
      }
      if (String(manifest.version) !== String(entry.version)) {
        reasons.push(`Manifest version '${manifest.version}' does not match release metadata version '${entry.version}'.`)
      }
      if (manifest.channel !== entry.channel) {
        reasons.push(`Manifest channel '${manifest.channel}' does not match release metadata channel '${entry.channel}'.`)
      }
      if (manifest.artifactMode === 'zip') {
        const zipAssetValidation = validateZipManifestReleaseAssets(manifest, entry.assets)
        reasons.push(...zipAssetValidation.reasons)
        warnings.push(...zipAssetValidation.warnings)
      }
    }
  } catch (error) {
    reasons.push(`Manifest validation failed for '${entry.manifestAssetName}': ${error instanceof Error ? error.message : String(error)}`)
  }

  for (const reason of reasons) {
    diagnostics.push(releaseDiagnostic(release, 'critical', reason, assets))
  }
  for (const warning of warnings) {
    diagnostics.push(releaseDiagnostic(release, 'warning', warning, assets))
  }
  return reasons
}

function isReleaseIndexCacheValid(cached, config) {
  const fetchedAt = Date.parse(cached?.fetchedAt ?? '')
  return (
    cached?.cacheVersion === RELEASE_CACHE_VERSION &&
    Array.isArray(cached.releases) &&
    cached.releases.length > 0 &&
    Array.isArray(cached.packs) &&
    Array.isArray(cached.diagnostics) &&
    Array.isArray(cached.rejectedReleases) &&
    cached.source?.provider === config.provider &&
    cached.source?.owner === config.owner &&
    cached.source?.repo === config.repo &&
    cached.source?.includePrereleases === config.includePrereleases &&
    Number.isFinite(fetchedAt) &&
    cached.releases.every((release) => release.trust === 'verified-metadata')
  )
}

async function readCachedReleaseIndex(config, cachePath) {
  if (!(await exists(cachePath))) return null
  const cached = await readJson(cachePath, null)
  if (isReleaseIndexCacheValid(cached, config)) return cached
  await fs.rm(cachePath, { force: true }).catch(() => undefined)
  return null
}

async function readCachedReleaseIndexForSettings(settings) {
  const config = catalogReleaseSource(settings)
  const paths = getPaths()
  return readCachedReleaseIndex(config, path.join(paths.releaseCache, 'release-index.json'))
}

async function fetchFreshReleaseIndex(config, cachePath) {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/releases`
  let releases
  try {
    releases = await fetchJson(apiUrl)
  } catch (error) {
    throw new Error(`Legacy repository metadata unavailable for ${config.owner}/${config.repo}. The repository may be private, unreachable, or the network request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(releases)) throw new Error('Legacy repository metadata did not return a release list.')

  const entries = []
  const diagnostics = []
  const rejectedReleases = []
  if (releases.length === 0) {
    diagnostics.push({
      tagName: 'release-feed',
      releaseName: `${config.owner}/${config.repo}`,
      severity: 'critical',
      reason: 'GitHub returned no releases.',
      assets: [],
    })
  }
  for (const release of releases) {
    const listedAssets = Array.isArray(release.assets) ? release.assets : []
    let assets = listedAssets
    try {
      assets = await fetchReleaseAssets(release, listedAssets)
    } catch (error) {
      const reason = `Unable to fetch complete release asset list: ${error instanceof Error ? error.message : String(error)}`
      diagnostics.push(releaseDiagnostic(release, 'critical', reason, listedAssets))
      rejectedReleases.push(rejectedRelease(release, [reason], listedAssets))
      continue
    }
    if (release.draft) {
      const reason = 'Release is a draft and is hidden from players.'
      diagnostics.push(releaseDiagnostic(release, 'info', reason, assets))
      rejectedReleases.push(rejectedRelease(release, [reason], assets))
      continue
    }
    if (release.prerelease && !config.includePrereleases) {
      const reason = 'Prerelease is hidden by legacy metadata settings.'
      diagnostics.push(releaseDiagnostic(release, 'warning', reason, assets))
      rejectedReleases.push(rejectedRelease(release, [reason], assets))
      continue
    }

    const metadataAsset = assets.find((asset) => asset.name === RELEASE_METADATA_ASSET)
    let metadata = null
    if (metadataAsset?.browser_download_url) {
      try {
        metadata = await fetchJson(metadataAsset.browser_download_url)
      } catch (error) {
        const reason = `Unable to read ${RELEASE_METADATA_ASSET}: ${error instanceof Error ? error.message : String(error)}`
        diagnostics.push(releaseDiagnostic(release, 'critical', reason, assets))
      }
    } else {
      const reason = `Missing ${RELEASE_METADATA_ASSET}; manifest fetch is blocked until trusted metadata is added.`
      diagnostics.push(releaseDiagnostic(release, 'critical', reason, assets))
    }

    const parsed = parseReleaseMetadata(metadata, release, assets, diagnostics)
    if (parsed.entries.length > 0) {
      const acceptedEntries = []
      const manifestReasons = []
      for (const entry of parsed.entries) {
        const entryReasons = await validateReleaseManifestAsset(entry, release, assets, diagnostics)
        if (entryReasons.length === 0) {
          acceptedEntries.push(entry)
        } else {
          manifestReasons.push(...entryReasons)
        }
      }
      if (manifestReasons.length === 0) {
        entries.push(...acceptedEntries)
        for (const entry of acceptedEntries) {
          diagnostics.push(releaseDiagnostic(release, 'info', `Accepted strict ${entry.pack ?? CANONICAL_PROFILE_ID} release ${entry.version}.`, assets))
        }
      } else {
        rejectedReleases.push(rejectedRelease(release, manifestReasons, assets))
        entries.push(...acceptedEntries)
        for (const entry of acceptedEntries) {
          diagnostics.push(releaseDiagnostic(release, 'info', `Accepted strict ${entry.pack ?? CANONICAL_PROFILE_ID} release ${entry.version}.`, assets))
        }
      }
    } else {
      rejectedReleases.push(rejectedRelease(release, parsed.reasons.length ? parsed.reasons : [`Missing ${RELEASE_METADATA_ASSET}.`], assets))
    }
  }

  entries.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  const warnings = releaseIndexWarnings(diagnostics)
  const index = {
    cacheVersion: RELEASE_CACHE_VERSION,
    source: config,
    fetchedAt: new Date().toISOString(),
    releases: entries,
    packs: [],
    acceptedCount: entries.length,
    rejectedReleases,
    diagnostics,
    latestPlayableRelease: entries[0] ?? null,
    warnings,
  }
  await writeJson(cachePath, index)
  return index
}

async function releaseList(payload = {}) {
  const settings = await readSettings()
  const source = catalogReleaseSource(settings)
  if (releaseRefreshInFlight) {
    return releaseRefreshInFlight
  }
  const request = canonicalOnlyReleaseIndex(source, settings, payload)
  releaseRefreshInFlight = request.finally(() => {
    releaseRefreshInFlight = null
  })
  return releaseRefreshInFlight
}

function selectReleaseEntry(index, channel, version, pack) {
  const normalizedPack = normalizeOfficialPackId(pack)
  const candidates = index.releases
    .filter((release) => !normalizedPack || normalizeOfficialPackId(release.pack) === normalizedPack)
    .filter((release) => release.channel === channel)
    .filter((release) => !version || release.version === version)
    .sort((a, b) => {
      const aDate = Date.parse(a.publishedAt)
      const bDate = Date.parse(b.publishedAt)
      if (Number.isFinite(aDate) && Number.isFinite(bDate)) return bDate - aDate
      if (Number.isFinite(aDate)) return -1
      if (Number.isFinite(bDate)) return 1
      return String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? ''))
    })
  return candidates[0] ?? null
}

function resolveManifestAssets(manifest, entry) {
  return resolveManifestReleaseAssets(manifest, entry.assets)
}

async function resolveInstallableManifest(manifest, entry, payload = {}) {
  const requirements = manifest.moduleRequirements ?? manifest.requiredModules
  const existingPaths = new Set((manifest.files ?? []).map((file) => String(file?.path ?? '').replace(/\\/g, '/').toLowerCase()))
  const existingBasenames = new Set([...existingPaths].map((filePath) => path.basename(filePath)))
  const hasMissingRequiredModules = Array.isArray(requirements) && requirements.some((requirement) => {
    const moduleId = String(requirement?.id ?? requirement?.moduleId ?? '').trim()
    const version = String(requirement?.version ?? '').trim()
    if (!moduleId || !version) return false
    const family = String(requirement.artifactFamily ?? requirement.family ?? manifest.moduleArtifactFamily ?? moduleArtifactFamilyForPack(manifest.pack)).trim().toLowerCase()
    const assetName = String(requirement.assetName ?? requirement.artifactName ?? moduleArtifactName(moduleId, version, family)).trim()
    const requirementPath = String(requirement.path ?? (family === 'echo-addon' ? `addons/${assetName}` : `mods/${assetName}`)).replace(/\\/g, '/').toLowerCase()
    return !existingPaths.has(requirementPath) && !existingBasenames.has(path.basename(requirementPath))
  })
  if (hasMissingRequiredModules) {
    const moduleAssets = await fetchModuleReleaseAssets({ refresh: payload.refresh })
    return resolveManifestAssets(resolveModuleRequirements(manifest, moduleAssets), entry)
  }
  if (Array.isArray(requirements) && requirements.length > 0) {
    return resolveManifestAssets(resolveModuleRequirements(manifest, []), entry)
  }
  return resolveManifestAssets(manifest, entry)
}

async function resolveReleaseEntry(payload, profile) {
  const channel = payload.channel ?? profile?.channel ?? defaultChannelForPack(payload.pack ?? profile?.id)
  const pack = normalizeOfficialPackId(payload.pack) ?? normalizeOfficialPackId(profile?.id) ?? CANONICAL_PROFILE_ID
  const index = await releaseList({ refresh: payload.refresh })
  const entry = selectReleaseEntry(index, channel, payload.version, pack)
  if (!entry) throw new Error(`No approved ${pack ?? 'official pack'} ${channel} release was found in the ECHO Catalog.`)
  return entry
}

async function releaseFetchManifest(payload = {}) {
  const channel = payload.channel ?? defaultChannelForPack(payload.pack)
  if (!CHANNELS.has(channel)) throw new Error(`Unsupported pack channel: ${channel}`)

  const entry = await resolveReleaseEntry(payload, { channel, id: normalizeOfficialPackId(payload.pack) ?? CANONICAL_PROFILE_ID })
  if (!entry.manifestSha256) {
    throw new Error(`${entry.tagName} is missing a manifest SHA-256 in ${RELEASE_METADATA_ASSET}.`)
  }

  const paths = getPaths()
  const pack = entry.pack ?? CANONICAL_PROFILE_ID
  const cacheName = `${safeFileName(pack)}-${safeFileName(channel)}-${safeFileName(entry.version)}.pack.json`
  const cachePath = path.join(paths.releaseCache, 'manifests', cacheName)
  const manifestPath = path.join(paths.manifests, `${safeFileName(pack)}-${safeFileName(channel)}-${safeFileName(entry.version)}.json`)

  if (!payload.refresh && (await exists(cachePath))) {
    const cachedHash = await sha256File(cachePath)
    if (cachedHash.toLowerCase() === entry.manifestSha256.toLowerCase()) {
      const manifest = await resolveInstallableManifest(validatePackManifest(await readJson(cachePath, null)), entry, payload)
      await writeJson(manifestPath, manifest)
      return { entry, manifest, manifestPath, cached: true }
    }
  }

  const download = await downloadFile({
    url: entry.manifestUrl,
    destination: cachePath,
    sha256: entry.manifestSha256,
  })
  if (!download.verified) throw new Error(`Manifest verification failed for ${entry.manifestAssetName}.`)

  const manifest = await resolveInstallableManifest(validatePackManifest(await readJson(cachePath, null)), entry, payload)
  await writeJson(manifestPath, manifest)
  return { entry, manifest, manifestPath, cached: false }
}

async function releaseCacheClear() {
  const paths = getPaths()
  await fs.rm(paths.releaseCache, { recursive: true, force: true })
  await ensureDir(paths.releaseCache)
  return { ok: true }
}

function artifactCachePath(file, url) {
  const paths = getPaths()
  const name = safeFileName(file.assetName || path.basename(new URL(url).pathname) || file.path)
  const hashPrefix = file.sha256 ? String(file.sha256).slice(0, 16) : 'unhashed'
  return path.join(paths.downloads, 'artifacts', `${hashPrefix}-${name}`)
}

function artifactDownloadUrls(file) {
  return [
    file?.url,
    ...(Array.isArray(file?.urls) ? file.urls : []),
  ]
    .map((url) => String(url ?? '').trim())
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

async function downloadVerifiedArtifact(file) {
  const urls = artifactDownloadUrls(file)
  if (!urls.length) {
    throw new Error('No artifact URL is configured in the selected release manifest.')
  }
  if (!file.sha256) {
    throw new Error('Artifact is missing a SHA-256 hash.')
  }
  const errors = []
  for (const url of urls) {
    const cachePath = artifactCachePath(file, url)
    if (await exists(cachePath)) {
      const cached = await sha256File(cachePath)
      if (cached.toLowerCase() === String(file.sha256).toLowerCase()) return cachePath
      await fs.rm(cachePath, { force: true })
    }
    try {
      const headers = isGitHubReleaseAssetApiUrl(url) ? { Accept: 'application/octet-stream' } : undefined
      const download = await downloadFile({ url, destination: cachePath, sha256: file.sha256, headers })
      if (!download.verified) throw new Error(`Artifact verification failed for ${file.path}.`)
      return cachePath
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
      await fs.rm(cachePath, { force: true }).catch(() => undefined)
    }
  }
  throw new Error(`Artifact verification failed for ${file.path}. ${errors.slice(0, 3).join(' | ')}`)
}

async function downloadSha1Artifact(file) {
  if (!file.url) throw new Error(`No URL configured for runtime artifact ${file.path}.`)
  await ensureDir(path.dirname(file.absolutePath))
  if (await exists(file.absolutePath)) {
    const actual = await sha1File(file.absolutePath)
    const stats = await fs.stat(file.absolutePath)
    if ((!file.sha1 || actual.toLowerCase() === String(file.sha1).toLowerCase()) && (!file.size || stats.size === file.size)) {
      return { status: 'verified', path: file.absolutePath }
    }
    await fs.rm(file.absolutePath, { force: true })
  }
  const body = await requestBuffer(file.url)
  await fs.writeFile(file.absolutePath, body)
  const actual = await sha1File(file.absolutePath)
  if (file.sha1 && actual.toLowerCase() !== String(file.sha1).toLowerCase()) {
    await fs.rm(file.absolutePath, { force: true })
    throw new Error(`SHA-1 mismatch for ${file.path}.`)
  }
  if (file.size && body.length !== file.size) {
    await fs.rm(file.absolutePath, { force: true })
    throw new Error(`Size mismatch for ${file.path}.`)
  }
  return { status: 'downloaded', path: file.absolutePath }
}

async function getMojangVersionMetadata(minecraftVersion, refresh = false) {
  const paths = runtimePaths()
  const versionManifestPath = path.join(paths.metadata, 'version_manifest_v2.json')
  await ensureDir(paths.metadata)
  let versionManifest = null
  if (!refresh && (await exists(versionManifestPath))) {
    versionManifest = await readJson(versionManifestPath, null)
  }
  if (!versionManifest) {
    versionManifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
    await writeJson(versionManifestPath, versionManifest)
  }

  const versionEntry = (versionManifest.versions ?? []).find((entry) => entry.id === minecraftVersion)
  if (!versionEntry?.url) {
    throw new Error(`Minecraft ${minecraftVersion} was not found in Mojang version metadata.`)
  }

  const versionPath = path.join(paths.versions, minecraftVersion, `${minecraftVersion}.json`)
  await ensureDir(path.dirname(versionPath))
  let metadata = null
  if (!refresh && (await exists(versionPath))) {
    metadata = await readJson(versionPath, null)
    if (metadata?.id !== minecraftVersion) metadata = null
  }
  if (!metadata) {
    const body = await requestBuffer(versionEntry.url)
    if (versionEntry.sha1) {
      const actual = crypto.createHash('sha1').update(body).digest('hex')
      if (actual.toLowerCase() !== String(versionEntry.sha1).toLowerCase()) {
        throw new Error(`Minecraft ${minecraftVersion} metadata SHA-1 verification failed.`)
      }
    }
    await fs.writeFile(versionPath, body)
    metadata = JSON.parse(body.toString('utf8'))
  }
  return { metadata, versionPath }
}

function minecraftLibraryAllowed(library) {
  if (!Array.isArray(library.rules) || library.rules.length === 0) return true
  let allowed = false
  for (const rule of library.rules) {
    const osRule = rule.os
    const matchesOs = !osRule?.name || osRule.name === 'windows'
    const matchesArch = !osRule?.arch || osRule.arch === os.arch()
    if (matchesOs && matchesArch) allowed = rule.action === 'allow'
  }
  return allowed
}

function nativeClassifierKey(library) {
  const template = library.natives?.windows
  if (!template) return null
  const arch = os.arch() === 'ia32' ? '32' : '64'
  return template.replace('${arch}', arch)
}

function runtimeArtifactFromDownload(download, baseRoot, kind, extra = {}) {
  if (!download?.url || !download.path) return null
  return {
    kind,
    path: download.path,
    absolutePath: path.join(baseRoot, download.path),
    url: download.url,
    sha1: download.sha1,
    size: download.size,
    ...extra,
  }
}

async function expectedMinecraftRuntimeFiles(manifest = {}) {
  const minecraftVersion = minecraftVersionFromManifest(manifest)
  const paths = runtimePaths()
  const { metadata, versionPath } = await getMojangVersionMetadata(minecraftVersion)
  const expected = [
    {
      kind: 'version-json',
      path: relativeRuntimePath(versionPath),
      absolutePath: versionPath,
      sha1: undefined,
      size: undefined,
    },
  ]

  const client = metadata.downloads?.client
  if (client?.url) {
    expected.push({
      kind: 'client',
      path: `versions/${minecraftVersion}/${minecraftVersion}.jar`,
      absolutePath: path.join(paths.versions, minecraftVersion, `${minecraftVersion}.jar`),
      url: client.url,
      sha1: client.sha1,
      size: client.size,
    })
  }

  for (const library of metadata.libraries ?? []) {
    if (!minecraftLibraryAllowed(library)) continue
    const artifact = runtimeArtifactFromDownload(library.downloads?.artifact, paths.libraries, 'library', { libraryName: library.name })
    if (artifact) expected.push(artifact)

    const classifierKey = nativeClassifierKey(library)
    if (classifierKey) {
      const nativeArtifact = runtimeArtifactFromDownload(library.downloads?.classifiers?.[classifierKey], paths.libraries, 'native', {
        libraryName: library.name,
        classifierKey,
        extractTo: path.join(paths.natives, minecraftVersion),
      })
      if (nativeArtifact) expected.push(nativeArtifact)
    }
  }

  for (const library of manifest.loader?.versionJson?.libraries ?? manifest.loader?.libraries ?? []) {
    if (!minecraftLibraryAllowed(library)) continue
    const artifact = runtimeArtifactFromDownload(library.downloads?.artifact, paths.libraries, 'neoforge-library', { libraryName: library.name })
    if (artifact && !expected.some((file) => file.path === artifact.path)) expected.push(artifact)

    const classifierKey = nativeClassifierKey(library)
    if (classifierKey) {
      const nativeArtifact = runtimeArtifactFromDownload(library.downloads?.classifiers?.[classifierKey], paths.libraries, 'neoforge-native', {
        libraryName: library.name,
        classifierKey,
        extractTo: path.join(paths.natives, minecraftVersion),
      })
      if (nativeArtifact && !expected.some((file) => file.path === nativeArtifact.path)) expected.push(nativeArtifact)
    }
  }

  const nativeLoaderVersionJson = manifest.nativeLoader?.versionJson
    ? normalizeEchoNativeLoaderVersionJson(manifest.nativeLoader.versionJson, manifest)
    : null
  for (const library of nativeLoaderVersionJson?.libraries ?? []) {
    if (!minecraftLibraryAllowed(library)) continue
    const artifact = runtimeArtifactFromDownload(library.downloads?.artifact, paths.libraries, 'native-loader-library', { libraryName: library.name })
    if (artifact && !expected.some((file) => file.path === artifact.path)) expected.push(artifact)
  }

  const assetIndex = metadata.assetIndex
  let assetIndexDocument = null
  if (assetIndex?.url) {
    const indexPath = path.join(paths.assets, 'indexes', `${assetIndex.id}.json`)
    expected.push({
      kind: 'asset-index',
      path: `assets/indexes/${assetIndex.id}.json`,
      absolutePath: indexPath,
      url: assetIndex.url,
      sha1: assetIndex.sha1,
      size: assetIndex.size,
    })

    if (await exists(indexPath)) {
      assetIndexDocument = await readJson(indexPath, null)
    }
  }

  if (assetIndexDocument?.objects) {
    for (const [assetPath, asset] of Object.entries(assetIndexDocument.objects)) {
      const hash = asset.hash
      if (!hash) continue
      expected.push({
        kind: 'asset',
        path: `assets/objects/${hash.slice(0, 2)}/${hash}`,
        absolutePath: path.join(paths.assets, 'objects', hash.slice(0, 2), hash),
        url: `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`,
        sha1: hash,
        size: asset.size,
        assetPath,
      })
    }
  }

  return { minecraftVersion, metadata, expected }
}

async function verifyRuntimeExpectedFiles(manifest = {}) {
  const paths = runtimePaths()
  const minecraftVersion = minecraftVersionFromManifest(manifest)
  const valid = []
  const missing = []
  const corrupt = []
  const warnings = []
  let expected = []

  try {
    const resolved = await expectedMinecraftRuntimeFiles(manifest)
    expected = resolved.expected
    if (!expected.some((file) => file.kind === 'asset')) {
      warnings.push('Asset objects were not fully checked because the asset index is not installed yet.')
    }
  } catch (error) {
    return {
      ok: false,
      minecraftVersion,
      runtimePath: paths.root,
      checkedAt: isoNow(),
      total: 0,
      valid,
      missing: ['metadata/version_manifest_v2.json'],
      corrupt,
      warnings: [error instanceof Error ? error.message : String(error)],
    }
  }

  for (const file of expected) {
    if (!(await exists(file.absolutePath))) {
      missing.push(file.path)
      continue
    }
    const stats = await fs.stat(file.absolutePath)
    const actualSha1 = file.sha1 ? await sha1File(file.absolutePath) : undefined
    if ((file.sha1 && actualSha1.toLowerCase() !== String(file.sha1).toLowerCase()) || (file.size && stats.size !== file.size)) {
      corrupt.push({
        path: file.path,
        expectedSha1: file.sha1,
        actualSha1,
        expectedSize: file.size,
        actualSize: stats.size,
      })
      continue
    }
    valid.push(file.path)
  }

  return {
    ok: missing.length === 0 && corrupt.length === 0,
    minecraftVersion,
    runtimePath: paths.root,
    checkedAt: isoNow(),
    total: expected.length,
    valid,
    missing,
    corrupt,
    warnings,
  }
}

async function minecraftVerifyRuntime(payload = {}) {
  return verifyRuntimeExpectedFiles(payload.manifest ?? { minecraft: payload.minecraftVersion })
}

async function minecraftInstallRuntime(payload = {}) {
  const manifest = payload.manifest ?? { minecraft: payload.minecraftVersion }
  const paths = runtimePaths()
  await Promise.all([ensureDir(paths.root), ensureDir(paths.versions), ensureDir(paths.libraries), ensureDir(paths.assets), ensureDir(paths.natives)])
  const { minecraftVersion, expected } = await expectedMinecraftRuntimeFiles(manifest)
  const downloaded = []
  const verified = []
  const repaired = []
  const skipped = []
  const warnings = []

  const installOne = async (file) => {
    if (!file.url) {
      skipped.push(file.path)
      return
    }
    const existed = await exists(file.absolutePath)
    const result = await downloadSha1Artifact(file)
    if (result.status === 'downloaded') {
      ;(existed ? repaired : downloaded).push(file.path)
    } else {
      verified.push(file.path)
    }

    if (file.kind === 'native' && file.extractTo) {
      await ensureDir(file.extractTo)
      const zip = new AdmZip(file.absolutePath)
      for (const entry of zip.getEntries()) {
        const entryName = entry.entryName.replace(/\\/g, '/')
        if (entry.isDirectory || entryName.startsWith('META-INF/')) continue
        const destination = safeJoin(file.extractTo, entryName)
        await ensureDir(path.dirname(destination))
        await fs.writeFile(destination, entry.getData())
      }
    }
  }

  for (const file of expected.filter((item) => item.kind !== 'asset')) {
    await installOne(file)
  }

  const refreshedExpected = await expectedMinecraftRuntimeFiles(manifest)
  for (const file of refreshedExpected.expected.filter((item) => item.kind === 'asset')) {
    await installOne(file)
  }

  const verification = await verifyRuntimeExpectedFiles(manifest)
  if (!verification.ok) warnings.push(`${verification.missing.length} runtime files missing and ${verification.corrupt.length} corrupt after install.`)

  return {
    ok: verification.ok,
    minecraftVersion,
    runtimePath: paths.root,
    generatedAt: isoNow(),
    downloaded,
    verified,
    repaired,
    skipped,
    warnings,
  }
}

async function minecraftRepairRuntime(payload = {}) {
  return minecraftInstallRuntime({ ...payload, force: true })
}

async function minecraftGetRuntimeStatus(payload = {}) {
  const verification = await minecraftVerifyRuntime(payload)
  return {
    ok: verification.ok,
    minecraftVersion: verification.minecraftVersion,
    runtimePath: verification.runtimePath,
    installed: verification.total > 0 && verification.missing.length === 0,
    missing: verification.missing.length,
    corrupt: verification.corrupt.length,
    warnings: verification.warnings,
    checkedAt: verification.checkedAt,
  }
}

async function packExportDefault(payload = {}) {
  const scriptPath = path.join(app.getAppPath(), 'scripts', 'lib', 'pack-export.mjs')
  const moduleUrl = pathToFileURL(scriptPath).href
  const { createAshfallPackArtifacts } = await import(moduleUrl)
  return createAshfallPackArtifacts({
    sourcePath: payload.sourcePath,
    outputDir: payload.outputDir,
    version: payload.version,
    channel: payload.channel,
  })
}

async function packExportLibrary() {
  const scriptPath = path.join(app.getAppPath(), 'scripts', 'lib', 'pack-export.mjs')
  return import(pathToFileURL(scriptPath).href)
}

async function ensureGitHubRelease(owner, repo, token, version, changelog = [], prerelease = true) {
  const tagName = `v${version}`
  const existing = await githubJsonRequest(githubApiUrl(owner, repo, `/releases/tags/${encodeURIComponent(tagName)}`), {
    token,
    accept404: true,
  })
  const body = {
    tag_name: tagName,
    name: `Ashfall ${version}`,
    body: changelog.join('\n') || `Ashfall ${version}`,
    draft: false,
    prerelease,
  }
  if (!existing) {
    return githubJsonRequest(githubApiUrl(owner, repo, '/releases'), { method: 'POST', token, body })
  }
  return githubJsonRequest(githubApiUrl(owner, repo, `/releases/${existing.id}`), { method: 'PATCH', token, body })
}

async function deleteReleaseAssetsByName(owner, repo, token, release, names) {
  const wanted = new Set(names)
  for (const asset of release.assets ?? []) {
    if (!wanted.has(asset.name)) continue
    await githubJsonRequest(githubApiUrl(owner, repo, `/releases/assets/${asset.id}`), { method: 'DELETE', token })
  }
}

async function resolveInstallManifest(payload, profile) {
  const selectedPack = normalizeOfficialPackId(payload.profileId ?? payload.pack ?? profile?.id)
  if (!selectedPack) throw new Error('Selected official pack profile is required.')
  if (payload.manifest) return validateSelectedPackManifest(payload.manifest, selectedPack)
  if (payload.manifestPath) return manifestLoad({ ...payload, pack: selectedPack })
  const channel = payload.channel ?? profile?.channel ?? defaultChannelForPack(selectedPack)
  const fetched = await releaseFetchManifest({ channel, version: payload.version, refresh: payload.refresh ?? true, pack: selectedPack })
  return assertManifestMatchesSelectedPack(fetched.manifest, selectedPack)
}

function legacyZipAssetForEntry(entry) {
  return officialPackZipAsset((entry.assets ?? []).map((asset) => ({
    name: asset.name,
    browser_download_url: asset.url,
    size: asset.size,
    digest: asset.sha256 ? `sha256:${asset.sha256}` : undefined,
  })), entry.pack ?? CANONICAL_PROFILE_ID)
}

function stripCommonZipRoot(entryNames) {
  const firstSegments = entryNames
    .map((name) => name.replace(/\\/g, '/').replace(/^\/+/, ''))
    .filter(Boolean)
    .map((name) => name.split('/')[0])
  const unique = [...new Set(firstSegments)]
  if (unique.length !== 1) return ''
  const root = `${unique[0]}/`
  const meaningful = entryNames.map((name) => name.replace(/\\/g, '/').replace(/^\/+/, '')).filter((name) => name && name !== root)
  return meaningful.every((name) => name.startsWith(root)) ? root : ''
}

function parseCurseForgeManifest(zip, rootPrefix) {
  const candidates = ['manifest.json', `${rootPrefix}manifest.json`].filter(Boolean)
  const entry = candidates.map((name) => zip.getEntry(name)).find(Boolean)
  if (!entry) return null
  try {
    return JSON.parse(entry.getData().toString('utf8'))
  } catch {
    return null
  }
}

function legacyZipTargetPath(entryName, rootPrefix) {
  let name = entryName.replace(/\\/g, '/').replace(/^\/+/, '')
  if (rootPrefix && name.startsWith(rootPrefix)) name = name.slice(rootPrefix.length)
  if (!name || name.endsWith('/')) return null

  if (name === 'manifest.json') return '.echo/source-curseforge-manifest.json'
  if (name === 'modlist.html') return '.echo/source-modlist.html'
  if (name.startsWith('overrides/')) return name.slice('overrides/'.length)
  return name
}

function inferModuleIdFromPath(relativePath) {
  const base = path.basename(relativePath).replace(/\.[^.]+$/, '')
  const cleaned = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (relativePath.startsWith('mods/')) return cleaned || 'mod'
  if (relativePath.startsWith('config/')) return 'config'
  if (relativePath.startsWith('resourcepacks/')) return 'resourcepack'
  if (relativePath.startsWith('.echo/')) return 'echo-metadata'
  return cleaned || 'legacy-pack-file'
}

function manifestFromLegacyZip({ cfManifest, entry, installPath, files }) {
  const primaryLoader = cfManifest?.minecraft?.modLoaders?.find((loader) => loader.primary) ?? cfManifest?.minecraft?.modLoaders?.[0]
  const loaderId = primaryLoader?.id ?? ''
  const loaderVersion = loaderId.replace(/^neoforge-/i, '') || '26.1.2.29-beta'
  return {
    pack: CANONICAL_PROFILE_ID,
    version: cfManifest?.version ?? entry.version,
    channel: entry.channel,
    minecraft: cfManifest?.minecraft?.version ?? '26.1.2',
    loader: {
      type: 'neoforge',
      version: loaderVersion,
    },
    modules: [...new Set(files.map((file) => file.moduleId).filter((moduleId) => moduleId && moduleId !== 'echo-metadata'))],
    files,
    changelog: entry.releaseNotes ?? [],
    worldgenWarning: true,
    localInstallRoot: installPath,
    source: {
      type: 'legacy-release-zip',
      release: entry.tagName,
      url: entry.releasePageUrl,
    },
  }
}

async function installLegacyReleaseZip(payload, profile, entry) {
  const paths = getPaths()
  const zipAsset = legacyZipAssetForEntry(entry)
  if (!zipAsset?.browser_download_url) {
    throw new Error(`${entry.tagName} does not include an Ashfall zip asset.`)
  }
  const zipSha256 = githubAssetSha256(zipAsset)
  if (!zipSha256) {
    throw new Error(`${zipAsset.name} is missing a SHA-256 digest. Add echo-release.json for strict installs or re-upload the asset with a digest.`)
  }

  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? defaultAshfallInstallPath(paths))
  const installId = nowStamp()
  const backupRoot = path.join(paths.backups, payload.profileId ?? profile?.id ?? 'ashfall', `legacy-install-${installId}`)
  const rollbackPlanPath = path.join(paths.logs, `rollback-legacy-install-${installId}.json`)
  await ensureDir(installPath)
  await ensureDir(path.join(installPath, '.echo'))
  await ensureDir(paths.logs)

  const zipPath = await downloadVerifiedArtifact({
    path: zipAsset.name,
    assetName: zipAsset.name,
    url: zipAsset.browser_download_url,
    sha256: zipSha256,
  })
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()
  const rootPrefix = stripCommonZipRoot(entries.map((item) => item.entryName))
  const cfManifest = parseCurseForgeManifest(zip, rootPrefix)
  const installed = []
  const failed = []
  const backedUp = []
  const manifestFiles = []
  const manifestPath = path.join(installPath, '.echo', 'installed-manifest.json')
  const previousManifestBackupPath = await backupFileIfExists(manifestPath, backupRoot, '.echo/installed-manifest.json')
  if (previousManifestBackupPath) backedUp.push({ path: '.echo/installed-manifest.json', backupPath: previousManifestBackupPath })
  const operation = await detectInstallOperation(installPath, payload.profileId ?? profile?.id)

  for (const entryItem of entries) {
    if (entryItem.isDirectory) continue
    const relativePath = legacyZipTargetPath(entryItem.entryName, rootPrefix)
    if (!relativePath) continue
    if (!isSafeRelativePath(relativePath)) {
      failed.push({ path: entryItem.entryName, reason: 'Zip entry path is unsafe.' })
      continue
    }

    try {
      const destination = safeJoin(installPath, relativePath)
      const backupPath = await backupFileIfExists(destination, backupRoot, relativePath)
      if (backupPath) backedUp.push({ path: relativePath, backupPath })
      const data = entryItem.getData()
      await ensureDir(path.dirname(destination))
      await fs.writeFile(destination, data)
      installed.push(relativePath)
      manifestFiles.push({
        path: relativePath,
        url: '',
        sha256: sha256Buffer(data),
        size: data.length,
        required: true,
        moduleId: inferModuleIdFromPath(relativePath),
        side: relativePath.startsWith('client') || relativePath.includes('/client/') ? 'client' : 'both',
      })
    } catch (error) {
      failed.push({ path: relativePath, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  const skipped = []
  if (Array.isArray(cfManifest?.files) && cfManifest.files.length > 0) {
    skipped.push({
      path: 'curseforge-remote-files',
      reason: `CurseForge manifest declares ${cfManifest.files.length} remote project files. ECHO installed bundled zip contents; remote dependency conversion is a future importer step.`,
    })
  }

  const manifest = manifestFromLegacyZip({ cfManifest, entry, installPath, files: manifestFiles })
  await writeJson(manifestPath, manifest)
  const after = await verifyManifest({ manifest, installPath })
  const ok = installed.length > 0 && failed.length === 0 && after.missing.length === 0 && after.corrupt.length === 0
  const report = {
    ok,
    installId,
    operation,
    profileId: payload.profileId ?? profile?.id ?? 'ashfall',
    installPath,
    generatedAt: new Date().toISOString(),
    installed,
    verified: after.valid,
    skipped,
    failed,
    backupRoot,
    rollbackPlanPath,
    neoforge: {
      ok: false,
      version: manifest.loader.version,
      installPath,
      skipped: true,
      message: 'Legacy GitHub zip installed. Handoff mode will prepare launcher metadata; full releases should ship a verified NeoForge installer artifact.',
    },
    before: {
      installPath,
      scanned: 0,
      missing: [],
      corrupt: [],
      valid: [],
      results: [],
    },
    after,
  }
  await writeJson(rollbackPlanPath, {
    installId,
    operation,
    profileId: payload.profileId ?? profile?.id ?? 'ashfall',
    installPath,
    backedUp,
    created: installed,
    createdAt: new Date().toISOString(),
  })
  const reportPath = path.join(paths.logs, `legacy-install-${installId}.json`)
  await writeJson(reportPath, report)

  if (profile) {
    await profileSave({
      ...profile,
      installPath,
      version: payload.version ?? manifest.version ?? profile.version,
      minecraft: manifest.minecraft ?? profile.minecraft,
      neoforge: manifest.loader?.version ?? profile.neoforge,
      status: ok ? 'healthy' : 'warning',
      manifestPath,
    })
  }

  await appendLauncherLog('INFO', `Legacy GitHub zip install ${installId} completed from ${zipAsset.name}: installed=${installed.length} failed=${failed.length}.`)
  return { ...report, reportPath }
}

async function authGetState() {
  return {
    linked: true,
    displayName: 'Minecraft Launcher',
    provider: 'minecraft_launcher',
    username: 'Minecraft Launcher',
    uuid: '00000000000000000000000000000000',
    canRefresh: false,
    authConfigured: false,
    warning: 'Microsoft login is delegated to the official Minecraft Launcher.',
  }
}

function neoforgeMavenBaseUrl(version) {
  const encoded = String(version)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${encoded}/neoforge-${encodeURIComponent(version)}`
}

async function fetchChecksumText(url, algorithm) {
  const body = await requestBuffer(url)
  const checksum = body.toString('utf8').trim().split(/\s+/u)[0]
  const expectedLength = algorithm === 'sha256' ? 64 : 40
  if (!new RegExp(`^[a-f0-9]{${expectedLength}}$`, 'iu').test(checksum)) {
    throw new Error(`NeoForge ${algorithm.toUpperCase()} checksum at ${url} was not valid.`)
  }
  return checksum.toLowerCase()
}

async function resolveNeoForgeInstallerMetadata(manifest, reportOperation) {
  const configured = manifest.loader?.installer
  const configuredSha256 = String(configured?.sha256 ?? '').trim().toLowerCase()
  const hasTrustedConfiguredSha256 = /^[a-f0-9]{64}$/i.test(configuredSha256) && configuredSha256 !== 'f'.repeat(64)
  if (configured?.url && hasTrustedConfiguredSha256) return { ...configured, sha256: configuredSha256 }

  const version = manifest.loader?.version
  if (!version) return null
  const url = configured?.url ?? `${neoforgeMavenBaseUrl(version)}-installer.jar`
  reportOperation?.({
    phaseId: 'neoforge',
    label: 'Resolving NeoForge installer',
    progress: 95,
    message: `Checking NeoForge ${version} installer checksum.`,
  })
  const sha256 = hasTrustedConfiguredSha256 ? configuredSha256 : await fetchChecksumText(`${url}.sha256`, 'sha256')
  return {
    assetName: hasTrustedConfiguredSha256 ? (configured?.assetName ?? `neoforge-${version}-installer.jar`) : `neoforge-${version}-installer.jar`,
    url,
    sha256,
    installMode: configured?.installMode ?? 'client',
    inferred: !configured?.url || !hasTrustedConfiguredSha256,
  }
}

function readNeoForgeInstallerJson(installerPath, entryName) {
  const zip = new AdmZip(installerPath)
  const entry = zip.getEntry(entryName)
  if (!entry) return null
  try {
    return JSON.parse(entry.getData().toString('utf8'))
  } catch {
    return null
  }
}

function normalizeNeoForgeInstallerVersionJson(versionJson, manifest, versionId = minecraftLauncherVersionId(manifest, 'neoforge-minecraft')) {
  if (!versionJson || typeof versionJson !== 'object' || Array.isArray(versionJson)) return null
  return stripNullishLauncherFields({
    ...versionJson,
    id: versionId,
    inheritsFrom: versionJson.inheritsFrom ?? minecraftVersionFromManifest(manifest),
  })
}

function minecraftLibraryDownloadArtifacts(minecraftRoot, versionJson, labelPrefix = 'Minecraft Launcher library') {
  const artifacts = []
  for (const library of versionJson?.libraries ?? []) {
    if (!minecraftLibraryAllowed(library)) continue
    const artifact = library.downloads?.artifact
    if (!artifact?.path || !artifact?.url) continue
    artifacts.push({
      label: `${labelPrefix} ${library.name ?? artifact.path}`,
      libraryName: library.name,
      path: path.join(minecraftRoot, 'libraries', String(artifact.path).replace(/\\/g, '/')),
      relativePath: String(artifact.path).replace(/\\/g, '/'),
      url: artifact.url,
      sha1: artifact.sha1,
      size: artifact.size,
    })
  }
  return artifacts
}

async function missingMinecraftLibraryArtifacts(minecraftRoot, versionJson, labelPrefix) {
  const missing = []
  for (const artifact of minecraftLibraryDownloadArtifacts(minecraftRoot, versionJson, labelPrefix)) {
    if (!(await exists(artifact.path))) {
      missing.push({ ...artifact, reason: 'missing' })
      continue
    }
    const stats = await fs.stat(artifact.path)
    const actualSha1 = artifact.sha1 ? await sha1File(artifact.path) : ''
    if ((artifact.sha1 && actualSha1.toLowerCase() !== String(artifact.sha1).toLowerCase()) || (artifact.size && stats.size !== artifact.size)) {
      missing.push({ ...artifact, reason: 'corrupt' })
    }
  }
  return missing
}

async function ensureMinecraftLibraryArtifacts(minecraftRoot, versionJson, labelPrefix) {
  const before = await missingMinecraftLibraryArtifacts(minecraftRoot, versionJson, labelPrefix)
  for (const artifact of before) {
    await downloadSha1Artifact({
      kind: 'minecraft-launcher-library',
      path: artifact.relativePath,
      absolutePath: artifact.path,
      url: artifact.url,
      sha1: artifact.sha1,
      size: artifact.size,
      libraryName: artifact.libraryName,
    })
  }
  const after = await missingMinecraftLibraryArtifacts(minecraftRoot, versionJson, labelPrefix)
  if (after.length > 0) {
    throw new Error(`${labelPrefix} preparation failed: ${after.map((artifact) => `${artifact.relativePath} (${artifact.reason})`).join(', ')}.`)
  }
  return before
}

async function neoforgeEnsure(payload = {}) {
  const operationId = payload.operationId
  const operationKind = payload.operationKind ?? operationStatuses.get(operationId)?.kind ?? 'operation'
  const reportOperation = (patch) => updateOperationStatus(operationId, { kind: operationKind, ...patch })
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === payload.profileId) ?? profiles[0]
  const manifest = payload.manifest ?? (await resolveInstallManifest(payload, profile))
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  if (!manifestRequiresNeoForge(manifest)) {
    return {
      ok: true,
      version: manifest.loader?.version ?? 'standalone-runtime',
      installPath,
      skipped: true,
      message: 'NeoForge installer skipped for the standalone runtime pack.',
    }
  }
  const installer = await resolveNeoForgeInstallerMetadata(manifest, reportOperation)

  if (!installer) {
    return {
      ok: false,
      version: manifest.loader?.version ?? 'unknown',
      installPath,
      skipped: true,
      message: 'No NeoForge installer artifact is configured or inferable for the selected manifest.',
    }
  }

  reportOperation({
    phaseId: 'neoforge',
    label: 'Checking Java for NeoForge',
    progress: 95,
    message: 'Looking for Java 25+ to run the NeoForge client installer.',
  })
  const java = await javaDetect()
  if (!java.preferred || !java.preferred.valid) {
    return {
      ok: false,
      version: manifest.loader.version,
      installPath,
      skipped: true,
      message: 'Java 25+ is required before the NeoForge installer can run. Install/open Minecraft Launcher once so its Java runtime is available, or install Java 25+.',
    }
  }

  reportOperation({
    phaseId: 'neoforge',
    label: 'Downloading NeoForge installer',
    progress: 96,
    message: `Downloading and SHA-256 verifying ${installer.assetName ?? `neoforge-${manifest.loader.version}-installer.jar`}.`,
  })
  const installerPath = await downloadVerifiedArtifact({
    path: installer.assetName ?? `neoforge-${manifest.loader.version}-installer.jar`,
    assetName: installer.assetName,
    url: installer.url,
    sha256: installer.sha256,
  })
  const installerVersionJson = normalizeNeoForgeInstallerVersionJson(
    readNeoForgeInstallerJson(installerPath, 'version.json'),
    manifest,
    minecraftLauncherVersionId(manifest, 'neoforge-minecraft'),
  )
  const installProfileJson = readNeoForgeInstallerJson(installerPath, 'install_profile.json')
  await ensureDir(installPath)
  const launcherProfilesPath = path.join(installPath, 'launcher_profiles.json')
  if (!(await exists(launcherProfilesPath))) {
    await writeJson(launcherProfilesPath, { profiles: {}, settings: {}, version: 3 })
  }

  const mode = installer.installMode ?? 'client'
  const args = ['-jar', installerPath, mode === 'server' ? '--installServer' : '--installClient', installPath]
  const logPath = path.join(getPaths().logs, `neoforge-installer-${nowStamp()}.log`)
  reportOperation({
    phaseId: 'neoforge',
    label: 'Generating NeoForge client files',
    progress: 97,
    message: `Running NeoForge installer. This can take a few minutes on first setup. Log: ${logPath}`,
  })
  const result = await execFileSafe(java.preferred.path, args, { timeout: 600000, maxBuffer: 16 * 1024 * 1024 })
  await writeJson(logPath, {
    generatedAt: isoNow(),
    ok: result.ok,
    javaPath: java.preferred.path,
    installerPath,
    installPath,
    mode,
    installerVersionId: installerVersionJson?.id,
    installerVersionLibraries: installerVersionJson?.libraries?.length ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  })
  if (!result.ok) {
    return {
      ok: false,
      version: manifest.loader.version,
      installerPath,
      installPath,
      javaPath: java.preferred.path,
      mode,
      logPath,
      message: `${result.error || result.stderr || 'NeoForge installer failed.'} Installer log: ${logPath}`,
    }
  }

  reportOperation({
    phaseId: 'neoforge',
    label: 'NeoForge client files generated',
    progress: 98,
    message: 'NeoForge generated the Minecraft client patch artifacts.',
  })
  return {
    ok: true,
    version: manifest.loader.version,
    installerPath,
    versionJson: installerVersionJson,
    installProfileJson,
    installPath,
    javaPath: java.preferred.path,
    mode,
    logPath,
    message: `NeoForge ${manifest.loader.version} ${mode} installer completed.`,
  }
}

function launchState(status = 'idle', message = 'Minecraft is not running.') {
  if (!activeLaunch) return { active: false, status, message }
  return {
    active: Boolean(activeLaunch.process && !activeLaunch.exitedAt),
    pid: activeLaunch.process?.pid,
    profileId: activeLaunch.profileId,
    startedAt: activeLaunch.startedAt,
    exitedAt: activeLaunch.exitedAt,
    exitCode: activeLaunch.exitCode,
    logPath: activeLaunch.logPath,
    status: activeLaunch.status,
    message: activeLaunch.message,
  }
}

async function resolveProfileAndManifest(payload = {}) {
  const profiles = await profileList()
  const profile = selectLauncherProfile(profiles, payload, true)
  if (!profile) throw new Error('No launcher profile is available.')
  const manifest = payload.manifest
    ? validateSelectedPackManifest(payload.manifest, profile.id)
    : await manifestLoad({
        ...payload,
        manifestPath: payload.manifestPath ?? profile.manifestPath,
        pack: profile.id,
      })
  const installPath = normalizePath(payload.installPath ?? profile.installPath ?? manifest.localInstallRoot)
  return { profile, manifest, installPath }
}

function defaultMinecraftRuntimeMode(profileOrId = CANONICAL_PROFILE_ID) {
  if (profileOrId && typeof profileOrId === 'object' && MINECRAFT_RUNTIME_MODES.has(profileOrId.runtimeMode)) {
    return profileOrId.runtimeMode
  }
  const profileId = typeof profileOrId === 'string' ? profileOrId : profileOrId?.id
  const packId = normalizeOfficialPackId(profileId)
  if (packId?.endsWith('-native-edition')) return 'native-loader-minecraft'
  return 'neoforge-minecraft'
}

function normalizeMinecraftRuntimeMode(runtimeMode, profileOrId = CANONICAL_PROFILE_ID) {
  return MINECRAFT_RUNTIME_MODES.has(runtimeMode) ? runtimeMode : defaultMinecraftRuntimeMode(profileOrId)
}

function minecraftRuntimeLabel(runtimeMode) {
  return normalizeMinecraftRuntimeMode(runtimeMode) === 'native-loader-minecraft'
    ? 'Native Loader + Minecraft'
    : 'NeoForge + Minecraft'
}

function minecraftRuntimeLoaderKey(runtimeMode) {
  return normalizeMinecraftRuntimeMode(runtimeMode) === 'native-loader-minecraft' ? 'native-loader' : 'neoforge'
}

function minecraftLauncherProfileId(profileId, runtimeMode) {
  const safeId = safeFileName(profileId).toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '')
  const baseId = `echo-${safeId || 'profile'}`
  return normalizeMinecraftRuntimeMode(runtimeMode, profileId) === 'native-loader-minecraft' && !baseId.endsWith('-native-loader') ? `${baseId}-native-loader` : baseId
}

function minecraftLauncherProfileName(profile, runtimeMode) {
  const baseName = profile.name?.startsWith('ECHO ') ? profile.name : profile.name ?? 'ECHO Pack'
  return normalizeMinecraftRuntimeMode(runtimeMode, profile) === 'native-loader-minecraft' && !/native loader/i.test(baseName) ? `${baseName} - Native Loader` : baseName
}

function nativeLoaderMinecraftVersionId(manifest) {
  const version = ECHO_NATIVE_LOADER_VERSION
  const packId = normalizeOfficialPackId(manifest?.pack) ?? safeFileName(manifest?.pack ?? 'pack').toLowerCase()
  return version && packId ? `echo-${packId}-native-loader-${version}` : ''
}

function minecraftLauncherVersionId(manifest, runtimeMode) {
  if (normalizeMinecraftRuntimeMode(runtimeMode, manifest?.pack) === 'native-loader-minecraft') return nativeLoaderMinecraftVersionId(manifest)
  return manifest.loader?.minecraftLauncherVersionId ?? `neoforge-${manifest.loader?.version ?? 'unknown'}`
}

let reservedEchoMinecraftProfileIdsCache = null

function reservedEchoMinecraftProfileIds() {
  if (!reservedEchoMinecraftProfileIdsCache) {
    reservedEchoMinecraftProfileIdsCache = new Set([
      minecraftLauncherProfileId(LEGACY_ASHFALL_PROFILE_ID),
      minecraftLauncherProfileId(LEGACY_ASHFALL_PROFILE_ID, 'native-loader-minecraft'),
      minecraftLauncherProfileId('ashfall-neoforge'),
      minecraftLauncherProfileId('ashfall-neoforge', 'native-loader-minecraft'),
    ])
    for (const packId of OFFICIAL_PACK_IDS) {
      reservedEchoMinecraftProfileIdsCache.add(minecraftLauncherProfileId(packId, 'neoforge-minecraft'))
      reservedEchoMinecraftProfileIdsCache.add(minecraftLauncherProfileId(packId, 'native-loader-minecraft'))
    }
  }
  return reservedEchoMinecraftProfileIdsCache
}

function isReservedEchoMinecraftProfileId(profileId) {
  return reservedEchoMinecraftProfileIds().has(String(profileId ?? ''))
}

function isEchoManagedMinecraftProfile(profile, profileId) {
  return (
    profile?.echoManaged === true ||
    profile?.echoLauncher?.managedBy === 'ECHO Launcher' ||
    isReservedEchoMinecraftProfileId(profileId)
  )
}

function normalizeLauncherGameDir(input) {
  const value = String(input ?? '').trim()
  if (!value) return ''
  return path.resolve(value).replace(/[\\/]+$/u, '').toLowerCase()
}

function sameLauncherGameDir(left, right) {
  return normalizeLauncherGameDir(left) === normalizeLauncherGameDir(right)
}

function isGenericNeoForgeLauncherProfile(profileId, profile, versionId) {
  const id = String(profileId ?? '').toLowerCase()
  const name = String(profile?.name ?? '').trim().toLowerCase()
  const expectedVersionId = String(versionId ?? '').toLowerCase()
  const loaderVersion = expectedVersionId.replace(/^neoforge-/u, '')
  const genericNames = new Set([
    'neoforge',
    expectedVersionId,
    loaderVersion,
    `neoforge ${loaderVersion}`,
    `neoforge-${loaderVersion}`,
  ])

  return (
    id === expectedVersionId ||
    id === loaderVersion ||
    id.startsWith('neoforge-') ||
    genericNames.has(name) ||
    name.startsWith('neoforge ') ||
    name.startsWith('neoforge-') ||
    (!name && profile?.type === 'custom')
  )
}

function cleanupConflictingMinecraftLauncherProfiles(document, profileId, versionId, installPath) {
  const removedProfiles = []
  const warnings = []
  if (!document.profiles || typeof document.profiles !== 'object') document.profiles = {}

  for (const [candidateId, candidate] of Object.entries(document.profiles)) {
    if (candidateId === profileId) continue
    if (candidate?.lastVersionId !== versionId) continue
    if (sameLauncherGameDir(candidate.gameDir, installPath)) continue

    const label = String(candidate?.name ?? '').trim() || candidateId
    if (isEchoManagedMinecraftProfile(candidate, candidateId)) {
      warnings.push(`Another ECHO-managed Minecraft Launcher profile '${label}' uses ${versionId} with a different game directory.`)
      continue
    }

    if (isGenericNeoForgeLauncherProfile(candidateId, candidate, versionId)) {
      delete document.profiles[candidateId]
      removedProfiles.push(label)
      continue
    }

    warnings.push(`Another Minecraft Launcher profile '${label}' uses ${versionId} with a different game directory. ECHO left it untouched.`)
  }

  return { removedProfiles, warnings }
}

function manifestMinecraftRuntimeFilePaths(manifest, runtimeMode) {
  const normalizedMode = normalizeMinecraftRuntimeMode(runtimeMode, manifest?.pack)
  const pattern = normalizedMode === 'native-loader-minecraft' ? /^addons\/.+\.echo-addon$/iu : /^mods\/.+\.jar$/iu
  return (manifest.files ?? [])
    .filter((file) => file.required !== false)
    .map((file) => String(file.path ?? '').replace(/\\/g, '/'))
    .filter((filePath) => pattern.test(filePath))
}

async function validateAshfallInstanceMods(installPath, manifest, runtimeMode) {
  const normalizedMode = normalizeMinecraftRuntimeMode(runtimeMode, manifest?.pack)
  const expectedFiles = manifestMinecraftRuntimeFilePaths(manifest, normalizedMode)
  const manifestName = manifest?.name ?? officialPackDisplayName(manifest?.pack) ?? 'Selected pack'
  const missingFiles = []
  for (const relativePath of expectedFiles) {
    if (!(await exists(safeJoin(installPath, relativePath)))) missingFiles.push(relativePath)
  }
  const validatedModsCount = expectedFiles.length - missingFiles.length
  const native = normalizedMode === 'native-loader-minecraft'
  const itemLabel = native ? 'Native addon file' : 'mod jar'
  const folderName = native ? 'addons' : 'mods'
  if (expectedFiles.length === 0) {
    return {
      ok: false,
      validatedModsCount,
      warnings: [`${manifestName} manifest does not list any ${native ? 'Native addon files' : 'mod jars'}, so ECHO cannot prepare a safe Minecraft Launcher handoff.`],
    }
  }
  if (missingFiles.length > 0) {
    const preview = missingFiles.slice(0, 5).join(', ')
    return {
      ok: false,
      validatedModsCount,
      warnings: [
        `${missingFiles.length} ${manifestName} ${itemLabel}${missingFiles.length === 1 ? '' : 's'} missing from ${path.join(installPath, folderName)}. First missing: ${preview}.`,
      ],
    }
  }
  return { ok: true, validatedModsCount, validatedFileLabel: itemLabel, warnings: [] }
}

function validateMinecraftLauncherProfileReady(document, profileId, versionId, installPath) {
  const warnings = []
  const profile = document.profiles?.[profileId]
  if (!profile) {
    warnings.push(`Minecraft Launcher profile '${profileId}' was not written.`)
  } else {
    if (profile.lastVersionId !== versionId) {
      warnings.push(`Minecraft Launcher profile '${profileId}' uses '${profile.lastVersionId ?? 'missing'}' instead of '${versionId}'.`)
    }
    if (!sameLauncherGameDir(profile.gameDir, installPath)) {
      warnings.push(`Minecraft Launcher profile '${profileId}' game directory is '${profile.gameDir ?? 'missing'}' instead of '${installPath}'.`)
    }
  }
  return {
    ok: warnings.length === 0,
    warnings,
  }
}

function launcherRuntimeManifestDefinition(manifest, runtimeMode) {
  const normalizedMode = normalizeMinecraftRuntimeMode(runtimeMode, manifest?.pack)
  const manifestName = manifest?.name ?? officialPackDisplayName(manifest?.pack) ?? 'Selected pack'
  if (normalizedMode === 'native-loader-minecraft') {
    return {
      runtimeMode: normalizedMode,
      label: 'Native Loader',
      loaderKey: 'native-loader',
      version: ECHO_NATIVE_LOADER_VERSION,
      versionJson: manifest.nativeLoader?.versionJson,
      versionId: minecraftLauncherVersionId(manifest, normalizedMode),
      librariesLabel: 'Native Loader libraries',
      missingMetadataMessage: `${manifestName} manifest is missing nativeLoader metadata.`,
      manifestName,
    }
  }
  return {
    runtimeMode: normalizedMode,
    label: 'NeoForge',
    loaderKey: 'neoforge',
    version: manifest.loader?.version ?? 'unknown',
    versionJson: manifest.loader?.versionJson,
    versionId: minecraftLauncherVersionId(manifest, normalizedMode),
    librariesLabel: 'NeoForge libraries',
    missingMetadataMessage: `${manifestName} manifest is missing loader metadata.`,
    manifestName,
  }
}

function launcherVersionManifestRequirement(manifest, versionId, runtimeMode) {
  const runtime = launcherRuntimeManifestDefinition(manifest, runtimeMode)
  const versionJson = runtime.versionJson
  const expectedInheritsFrom = versionJson?.inheritsFrom ?? minecraftVersionFromManifest(manifest)
  return {
    versionId,
    inheritsFrom: expectedInheritsFrom,
    mainClass: versionJson?.mainClass,
  }
}

function echoNativeLoaderDownloadArtifact() {
  return {
    path: ECHO_NATIVE_LOADER_LIBRARY_PATH,
    url: ECHO_NATIVE_LOADER_DOWNLOAD_URL,
    sha1: ECHO_NATIVE_LOADER_SHA1,
    size: ECHO_NATIVE_LOADER_SIZE,
  }
}

function nativeLoaderLocalCandidatePaths() {
  const configured = String(process.env.ECHO_NATIVE_LOADER_LOCAL_JAR ?? '').trim()
  const appRoot = app.getAppPath()
  const resourcesRoot = String(process.resourcesPath ?? '').trim()
  const executableResourcesRoot = path.join(path.dirname(process.execPath), 'resources')
  const sourceRoots = [
    path.join(appRoot, 'build', 'native-loader'),
    path.join(appRoot, 'native-loader'),
    path.join(resourcesRoot, 'build', 'native-loader'),
    path.join(resourcesRoot, 'native-loader'),
    path.join(resourcesRoot, 'app.asar.unpacked', 'build', 'native-loader'),
    path.join(resourcesRoot, 'app.asar.unpacked', 'native-loader'),
    path.join(executableResourcesRoot, 'build', 'native-loader'),
    path.join(executableResourcesRoot, 'native-loader'),
    path.resolve(process.cwd(), 'build', 'native-loader'),
    path.resolve(process.cwd(), '..', 'ECHO-Native-Platform', 'build', 'public-alpha'),
    path.resolve(process.cwd(), '..', 'ECHO-Native-Platform', 'build', 'native-loader-client-library'),
    path.resolve(appRoot, '..', 'ECHO-Native-Platform', 'build', 'public-alpha'),
    path.resolve(appRoot, '..', 'ECHO-Native-Platform', 'build', 'native-loader-client-library'),
    path.resolve(appRoot, '..', '..', 'ECHO-Native-Platform', 'build', 'public-alpha'),
    path.resolve(appRoot, '..', '..', 'ECHO-Native-Platform', 'build', 'native-loader-client-library'),
  ].filter(Boolean)
  const candidatePaths = []
  if (configured) candidatePaths.push(path.resolve(configured))
  for (const root of sourceRoots) {
    candidatePaths.push(path.join(root, ECHO_NATIVE_LOADER_PUBLIC_FILE_NAME))
    candidatePaths.push(path.join(root, ECHO_NATIVE_LOADER_LIBRARY_FILE_NAME))
  }
  return [...new Set(candidatePaths.map((candidate) => path.resolve(candidate)))]
}

async function verifiedNativeLoaderLocalCandidate(candidatePath, artifact) {
  if (!(await exists(candidatePath))) return null
  const stats = await fs.stat(candidatePath).catch(() => null)
  if (!stats?.isFile() || stats.size <= 0) return null
  if (artifact.size && stats.size !== artifact.size) return null
  const actualSha1 = await sha1File(candidatePath)
  if (artifact.sha1 && actualSha1.toLowerCase() !== String(artifact.sha1).toLowerCase()) return null
  return {
    path: candidatePath,
    sha1: actualSha1,
    size: stats.size,
  }
}

async function installNativeLoaderClientArtifactFromLocalSource(artifact) {
  const targetPath = artifact.absolutePath ?? artifact.path
  if (!targetPath) return null
  for (const candidatePath of nativeLoaderLocalCandidatePaths()) {
    const candidate = await verifiedNativeLoaderLocalCandidate(candidatePath, artifact)
    if (!candidate) continue
    await ensureDir(path.dirname(targetPath))
    if (path.resolve(candidate.path) !== path.resolve(targetPath)) {
      await fs.copyFile(candidate.path, targetPath)
    }
    return {
      status: path.resolve(candidate.path) === path.resolve(targetPath) ? 'verified' : 'copied',
      path: targetPath,
      sourcePath: candidate.path,
      sha1: candidate.sha1,
      size: candidate.size,
    }
  }
  return null
}

function libraryHasEchoNativeLoaderDownload(library) {
  if (String(library?.name ?? '') !== ECHO_NATIVE_LOADER_LIBRARY_NAME) return false
  const artifact = library?.downloads?.artifact
  return Boolean(
    artifact?.url &&
      artifact?.path &&
      String(artifact.sha1 ?? '').toLowerCase() === ECHO_NATIVE_LOADER_SHA1 &&
      Number(artifact.size ?? 0) === ECHO_NATIVE_LOADER_SIZE,
  )
}

function nativeLoaderLibraryWithDownload(library = {}) {
  return {
    ...library,
    name: ECHO_NATIVE_LOADER_LIBRARY_NAME,
    downloads: {
      ...(library.downloads && typeof library.downloads === 'object' ? library.downloads : {}),
      artifact: echoNativeLoaderDownloadArtifact(),
    },
  }
}

function nativePackJvmArguments(manifest, nativeRuntime = null) {
  return nativeBootstrapJvmArguments(
    {
      ...manifest,
      pack: normalizeOfficialPackId(manifest?.pack) ?? String(manifest?.pack ?? ''),
    },
    nativeRuntime,
  )
}

function normalizeEchoNativeLoaderVersionJson(versionJson, manifest, versionId = nativeLoaderMinecraftVersionId(manifest), packLibraries = [], nativeRuntime = null) {
  const source = versionJson && typeof versionJson === 'object' && !Array.isArray(versionJson) ? versionJson : {}
  const libraries = Array.isArray(source.libraries) ? source.libraries : []
  let found = false
  const normalizedLibraries = libraries
    .filter((library) => library?.echoLauncher?.packAddon !== true)
    .map((library) => {
      if (String(library?.name ?? '') !== ECHO_NATIVE_LOADER_LIBRARY_NAME) return library
      found = true
      return nativeLoaderLibraryWithDownload(library)
    })
  if (!found) normalizedLibraries.push(nativeLoaderLibraryWithDownload())
  for (const library of packLibraries) {
    if (!normalizedLibraries.some((candidate) => candidate?.echoLauncher?.sourcePath === library?.echoLauncher?.sourcePath)) {
      normalizedLibraries.push(library)
    }
  }
  const sourceArguments = source.arguments && typeof source.arguments === 'object' && !Array.isArray(source.arguments)
    ? source.arguments
    : { game: [], jvm: [] }
  const jvmArguments = [
    ...(Array.isArray(sourceArguments.jvm) ? sourceArguments.jvm : []),
    ...nativePackJvmArguments(manifest, nativeRuntime),
  ].filter((value, index, values) => value && values.indexOf(value) === index)
  const gameArguments = [
    ...nativeBootstrapGameArguments(
      {
        ...manifest,
        pack: normalizeOfficialPackId(manifest?.pack) ?? String(manifest?.pack ?? ''),
      },
      nativeRuntime,
    ),
    ...(Array.isArray(sourceArguments.game) ? sourceArguments.game : []),
  ].filter(Boolean)
  return stripNullishLauncherFields({
    ...source,
    id: versionId,
    inheritsFrom: source.inheritsFrom ?? minecraftVersionFromManifest(manifest),
    mainClass: source.mainClass || ECHO_NATIVE_LOADER_MAIN_CLASS,
    arguments: {
      ...sourceArguments,
      game: gameArguments,
      jvm: jvmArguments,
    },
    libraries: normalizedLibraries,
  })
}

function validateReleaseLauncherVersionManifest(manifest, versionId, runtimeMode, runtimeVersionJson = null) {
  const runtime = launcherRuntimeManifestDefinition(manifest, runtimeMode)
  const versionJson = runtime.runtimeMode === 'native-loader-minecraft'
    ? normalizeEchoNativeLoaderVersionJson(runtime.versionJson, manifest, versionId)
    : (runtimeVersionJson ?? runtime.versionJson)
  const requirement = launcherVersionManifestRequirement(manifest, versionId, runtimeMode)
  if (runtime.runtimeMode === 'native-loader-minecraft' && !runtime.version) {
    return {
      ok: false,
      reason: `${runtime.manifestName} manifest nativeLoader metadata must include a version.`,
    }
  }
  if (runtime.runtimeMode === 'neoforge-minecraft' && !runtime.version) {
    return {
      ok: false,
      reason: `${runtime.manifestName} manifest NeoForge loader metadata must include a version.`,
    }
  }
  if (runtime.runtimeMode === 'neoforge-minecraft' && (!versionJson || typeof versionJson !== 'object' || Array.isArray(versionJson))) {
    return {
      ok: true,
      versionJson: null,
      requirement,
      externalRuntimeMetadataRequired: true,
    }
  }
  if (runtime.runtimeMode === 'neoforge-minecraft') {
    const hasStrictNeoForgeVersionJson =
      String(versionJson.id ?? '') === versionId &&
      String(versionJson.inheritsFrom ?? '') === String(requirement.inheritsFrom ?? '') &&
      typeof versionJson.mainClass === 'string' &&
      versionJson.arguments &&
      typeof versionJson.arguments === 'object' &&
      !Array.isArray(versionJson.arguments) &&
      Array.isArray(versionJson.libraries) &&
      versionJson.libraries.length > 0
    if (!hasStrictNeoForgeVersionJson) {
      return {
        ok: true,
        versionJson: null,
        requirement,
        externalRuntimeMetadataRequired: true,
      }
    }
  }
  if (!versionJson || typeof versionJson !== 'object' || Array.isArray(versionJson)) {
    return {
      ok: false,
      reason: `${runtime.manifestName} manifest is missing ${runtime.loaderKey === 'native-loader' ? 'nativeLoader.versionJson' : 'loader.versionJson'} for '${versionId}'.`,
    }
  }
  if (String(versionJson.id ?? '') !== versionId) {
    return {
      ok: false,
      reason: `${runtime.manifestName} manifest ${runtime.label} versionJson id is '${versionJson.id ?? 'missing'}', expected '${versionId}'.`,
    }
  }
  if (String(versionJson.inheritsFrom ?? '') !== String(requirement.inheritsFrom ?? '')) {
    return {
      ok: false,
      reason: `${runtime.manifestName} manifest ${runtime.label} versionJson inheritsFrom is '${versionJson.inheritsFrom ?? 'missing'}', expected '${requirement.inheritsFrom}'.`,
    }
  }
  if (!versionJson.mainClass || typeof versionJson.mainClass !== 'string') {
    return {
      ok: false,
      reason: `${runtime.manifestName} manifest ${runtime.label} versionJson is missing mainClass.`,
    }
  }
  if (!versionJson.arguments || typeof versionJson.arguments !== 'object' || Array.isArray(versionJson.arguments)) {
    return {
      ok: false,
      reason: `${runtime.manifestName} manifest ${runtime.label} versionJson is missing launcher arguments.`,
    }
  }
  if (!Array.isArray(versionJson.libraries) || versionJson.libraries.length === 0) {
    return {
      ok: false,
      reason: `${runtime.manifestName} manifest ${runtime.label} versionJson is missing ${runtime.librariesLabel}.`,
    }
  }
  return { ok: true, versionJson, requirement }
}

function validateMinecraftLauncherVersionDocument(document, manifest, versionId, runtimeMode) {
  const manifestValidation = validateReleaseLauncherVersionManifest(manifest, versionId, runtimeMode)
  if (!manifestValidation.ok) {
    return { valid: false, source: 'invalid', reason: manifestValidation.reason }
  }
  const requirement = manifestValidation.requirement
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { valid: false, source: 'invalid', reason: 'version metadata is not valid JSON object data' }
  }
  if (document.echoLauncher?.bootstrap === true) {
    return { valid: false, source: 'invalid', reason: 'metadata is ECHO bootstrap-only and has no real NeoForge classpath' }
  }
  for (const key of ['assetIndex', 'assets', 'downloads', 'jar', 'logging', 'minecraftArguments']) {
    if (Object.prototype.hasOwnProperty.call(document, key) && document[key] == null) {
      return { valid: false, source: 'invalid', reason: `${key} is null and can break inherited Minecraft Launcher metadata` }
    }
  }
  if (String(document.id ?? '') !== versionId) {
    return { valid: false, source: 'invalid', reason: `id is '${document.id ?? 'missing'}', expected '${versionId}'` }
  }
  if (String(document.inheritsFrom ?? '') !== String(requirement.inheritsFrom ?? '')) {
    return { valid: false, source: 'invalid', reason: `inheritsFrom is '${document.inheritsFrom ?? 'missing'}', expected '${requirement.inheritsFrom}'` }
  }
  const runtime = launcherRuntimeManifestDefinition(manifest, runtimeMode)
  if (runtime.runtimeMode === 'native-loader-minecraft' && String(document.mainClass ?? '') !== String(requirement.mainClass ?? '')) {
    return { valid: false, source: 'invalid', reason: `mainClass is '${document.mainClass ?? 'missing'}', expected '${requirement.mainClass}'` }
  }
  if (!document.mainClass || typeof document.mainClass !== 'string') {
    return { valid: false, source: 'invalid', reason: 'mainClass is missing' }
  }
  if (!document.arguments || typeof document.arguments !== 'object' || Array.isArray(document.arguments)) {
    return { valid: false, source: 'invalid', reason: 'launcher arguments are missing' }
  }
  if (!Array.isArray(document.libraries) || document.libraries.length === 0) {
    return { valid: false, source: 'invalid', reason: `${runtime.librariesLabel} are missing` }
  }
  if (runtime.runtimeMode === 'neoforge-minecraft') {
    const gameArguments = Array.isArray(document.arguments.game) ? document.arguments.game : []
    const neoForgeLibraryDownloads = minecraftLibraryDownloadArtifacts('', document, 'NeoForge library')
    if (!gameArguments.includes('--fml.neoForgeVersion')) {
      return { valid: false, source: 'invalid', reason: 'NeoForge launcher arguments are missing --fml.neoForgeVersion' }
    }
    if (neoForgeLibraryDownloads.length === 0) {
      return { valid: false, source: 'invalid', reason: 'NeoForge library download metadata is missing' }
    }
  }
  if (normalizeMinecraftRuntimeMode(runtimeMode, manifest?.pack) === 'native-loader-minecraft') {
    if (!document.libraries.some((library) => libraryHasEchoNativeLoaderDownload(library))) {
      return { valid: false, source: 'invalid', reason: 'Native Loader library download metadata is missing or stale' }
    }
    const argumentStatus = nativeLauncherArgumentStatus(document, manifest)
    if (!argumentStatus.ok) {
      return { valid: false, source: 'invalid', reason: argumentStatus.errors[0] ?? 'Native Loader bootstrap arguments are missing or stale' }
    }
    for (const library of document.libraries.filter((item) => item?.echoLauncher?.packAddon === true)) {
      const artifact = library.downloads?.artifact
      const artifactUrl = String(artifact?.url ?? '').trim().toLowerCase()
      if (artifactUrl.startsWith('file:')) {
        return { valid: false, source: 'invalid', reason: `Native Loader pack addon '${library.echoLauncher?.sourcePath ?? library.name}' uses an unsupported file URL.` }
      }
      const expectedLibraryPath = artifactPathFromMavenCoordinate(String(library.name ?? ''))?.replace(/\\/g, '/')
      const actualLibraryPath = String(artifact?.path ?? '').replace(/\\/g, '/')
      if (!expectedLibraryPath || actualLibraryPath !== expectedLibraryPath) {
        return { valid: false, source: 'invalid', reason: `Native Loader pack addon '${library.echoLauncher?.sourcePath ?? library.name}' is not stored at its Minecraft library coordinate path.` }
      }
    }
    const expectedAddons = (manifest.files ?? [])
      .filter((file) => file?.required !== false)
      .filter((file) => /^addons\/.+\.echo-addon$/iu.test(String(file.path ?? '').replace(/\\/g, '/')))
      .map((file) => ({
        path: String(file.path ?? '').replace(/\\/g, '/'),
        sha256: String(file.sha256 ?? '').toLowerCase(),
      }))
    const missingAddons = expectedAddons.filter((expected) =>
      !document.libraries.some(
        (library) =>
          library?.echoLauncher?.packAddon === true &&
          library?.echoLauncher?.sourcePath === expected.path &&
          (!expected.sha256 || String(library?.echoLauncher?.sourceSha256 ?? '').toLowerCase() === expected.sha256),
      ),
    )
    if (missingAddons.length > 0) {
      return { valid: false, source: 'invalid', reason: `Native Loader pack addon classpath is missing: ${missingAddons.slice(0, 5).map((entry) => entry.path).join(', ')}` }
    }
  }
  return {
    valid: true,
    source: document.echoLauncher?.managedBy === 'ECHO Launcher' ? 'echo-managed' : 'installed',
    reason: '',
  }
}

function stripNullishLauncherFields(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stripNullishLauncherFields(entry)).filter((entry) => entry !== undefined)
  }
  if (!value || typeof value !== 'object') return value ?? undefined

  const next = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null) continue
    const cleaned = stripNullishLauncherFields(entry)
    if (cleaned !== undefined) next[key] = cleaned
  }
  return next
}

function validateMinecraftLauncherBaseVersionDocument(document, minecraftVersion) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { ok: false, reason: 'base version metadata is not valid JSON object data' }
  }
  if (String(document.id ?? '') !== String(minecraftVersion)) {
    return { ok: false, reason: `base version id is '${document.id ?? 'missing'}', expected '${minecraftVersion}'` }
  }
  if (!document.assetIndex?.id || !document.assetIndex?.url) {
    return { ok: false, reason: 'base version assetIndex is missing its id or URL' }
  }
  if (!document.downloads?.client?.url) {
    return { ok: false, reason: 'base version client download metadata is missing' }
  }
  if (!Array.isArray(document.libraries) || document.libraries.length === 0) {
    return { ok: false, reason: 'base version libraries are missing' }
  }
  return { ok: true, reason: '' }
}

function artifactPathFromMavenCoordinate(coordinate) {
  if (!coordinate || typeof coordinate !== 'string') return null
  const [group, artifact, version, classifierAndExtension] = coordinate.split(':')
  if (!group || !artifact || !version) return null
  const classifier = classifierAndExtension?.replace(/@.+$/u, '')
  const extension = classifierAndExtension?.match(/@(.+)$/u)?.[1] ?? 'jar'
  const fileName = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`
  return path.join(...group.split('.'), artifact, version, fileName)
}

function nativeLoaderRequiredClientArtifacts(minecraftRoot, manifestOrDocument) {
  const versionJson = manifestOrDocument?.nativeLoader?.versionJson
    ? normalizeEchoNativeLoaderVersionJson(manifestOrDocument.nativeLoader.versionJson, manifestOrDocument)
    : manifestOrDocument
  const artifacts = []
  for (const library of versionJson?.libraries ?? []) {
    if (!minecraftLibraryAllowed(library)) continue
    if (String(library?.name ?? '') !== ECHO_NATIVE_LOADER_LIBRARY_NAME) continue
    const artifact = library.downloads?.artifact ?? echoNativeLoaderDownloadArtifact()
    const relativePath = String(artifact.path ?? ECHO_NATIVE_LOADER_LIBRARY_PATH).replace(/\\/g, '/')
    artifacts.push({
      label: 'ECHO Native Loader client library',
      libraryName: ECHO_NATIVE_LOADER_LIBRARY_NAME,
      path: path.join(minecraftRoot, 'libraries', relativePath),
      relativePath,
      url: artifact.url ?? ECHO_NATIVE_LOADER_DOWNLOAD_URL,
      sha1: artifact.sha1 ?? ECHO_NATIVE_LOADER_SHA1,
      size: artifact.size ?? ECHO_NATIVE_LOADER_SIZE,
    })
  }
  if (artifacts.length === 0) {
    const artifact = echoNativeLoaderDownloadArtifact()
    artifacts.push({
      label: 'ECHO Native Loader client library',
      libraryName: ECHO_NATIVE_LOADER_LIBRARY_NAME,
      path: path.join(minecraftRoot, 'libraries', artifact.path),
      relativePath: artifact.path,
      url: artifact.url,
      sha1: artifact.sha1,
      size: artifact.size,
    })
  }
  return artifacts
}

function nativePackLibraryPath(libraryName) {
  const resolved = artifactPathFromMavenCoordinate(libraryName)
  if (!resolved) throw new Error(`Native Loader pack addon library coordinate is invalid: ${libraryName}`)
  return resolved.replace(/\\/g, '/')
}

function nativePackLibraryName(manifest, file, index) {
  const packId = normalizeOfficialPackId(manifest?.pack) ?? safeFileName(manifest?.pack ?? 'pack').toLowerCase()
  const moduleId = safeFileName(file?.moduleId ?? path.basename(String(file?.path ?? ''), path.extname(String(file?.path ?? ''))) ?? `addon-${index}`).toLowerCase()
  const version = safeFileName(manifest?.version ?? '0').toLowerCase() || '0'
  return `dev.echo.packs:${packId}-${moduleId}-${index + 1}:${version}`
}

async function ensureNativeLoaderPackLibraries(minecraftRoot, manifest, installPath) {
  const libraries = []
  const addonFiles = (manifest.files ?? [])
    .filter((file) => file?.required !== false)
    .filter((file) => /^addons\/.+\.echo-addon$/iu.test(String(file.path ?? '').replace(/\\/g, '/')))
  for (let index = 0; index < addonFiles.length; index += 1) {
    const file = addonFiles[index]
    const sourcePath = String(file.path ?? '').replace(/\\/g, '/')
    const sourceAbsolutePath = safeJoin(installPath, sourcePath)
    if (!(await exists(sourceAbsolutePath))) {
      throw new Error(`Native Loader addon library source is missing: ${sourcePath}. Run Install or Repair before Play.`)
    }
    const expectedSha256 = String(file.sha256 ?? '').toLowerCase()
    if (expectedSha256) {
      const actualSha256 = await sha256File(sourceAbsolutePath)
      if (actualSha256.toLowerCase() !== expectedSha256) {
        throw new Error(`Native Loader addon library source is corrupt: ${sourcePath}. Run Repair before Play.`)
      }
    }
    const libraryName = nativePackLibraryName(manifest, file, index)
    const libraryPath = nativePackLibraryPath(libraryName)
    const absolutePath = path.join(minecraftRoot, 'libraries', libraryPath)
    await ensureDir(path.dirname(absolutePath))
    await fs.copyFile(sourceAbsolutePath, absolutePath)
    const stats = await fs.stat(absolutePath)
    const sha1 = await sha1File(absolutePath)
    libraries.push({
      name: libraryName,
      downloads: {
        artifact: {
          path: libraryPath,
          sha1,
          size: stats.size,
        },
      },
      echoLauncher: {
        managedBy: 'ECHO Launcher',
        packAddon: true,
        pack: manifest.pack,
        sourcePath,
        sourceSha256: expectedSha256 || undefined,
      },
    })
  }
  return libraries
}

function nativeLoaderPackLibraryArtifacts(minecraftRoot, document) {
  const artifacts = []
  for (const library of document?.libraries ?? []) {
    if (!minecraftLibraryAllowed(library)) continue
    if (library?.echoLauncher?.packAddon !== true) continue
    const artifact = library.downloads?.artifact
    const relativePath = String(artifact?.path ?? '').replace(/\\/g, '/')
    if (!relativePath) continue
    artifacts.push({
      label: `Native Loader pack addon ${library.echoLauncher?.sourcePath ?? library.name ?? relativePath}`,
      libraryName: library.name,
      path: path.join(minecraftRoot, 'libraries', relativePath),
      relativePath,
      url: artifact.url,
      sha1: artifact.sha1,
      size: artifact.size,
      sourcePath: library.echoLauncher?.sourcePath,
    })
  }
  return artifacts
}

async function missingNativeLoaderPackLibraryArtifacts(minecraftRoot, document) {
  const missing = []
  for (const artifact of nativeLoaderPackLibraryArtifacts(minecraftRoot, document)) {
    if (!(await exists(artifact.path))) {
      missing.push({ ...artifact, reason: 'missing' })
      continue
    }
    const stats = await fs.stat(artifact.path)
    const actualSha1 = artifact.sha1 ? await sha1File(artifact.path) : ''
    if ((artifact.sha1 && actualSha1.toLowerCase() !== String(artifact.sha1).toLowerCase()) || (artifact.size && stats.size !== artifact.size)) {
      missing.push({ ...artifact, reason: 'corrupt' })
    }
  }
  return missing
}

async function missingNativeLoaderRuntimeClasspathArtifacts(document) {
  const missing = []
  for (const entryPath of nativeModuleClasspathEntries(document)) {
    if (!(await exists(entryPath))) {
      missing.push({ label: `Native Loader module runtime ${entryPath}`, path: entryPath, relativePath: entryPath, reason: 'missing' })
      continue
    }
    const stats = await fs.stat(entryPath)
    if (!stats.isFile() || stats.size <= 0) {
      missing.push({ label: `Native Loader module runtime ${entryPath}`, path: entryPath, relativePath: entryPath, reason: 'corrupt' })
    }
  }
  return missing
}

async function missingNativeLoaderClientArtifacts(minecraftRoot, manifestOrDocument) {
  const missing = []
  for (const artifact of nativeLoaderRequiredClientArtifacts(minecraftRoot, manifestOrDocument)) {
    if (!(await exists(artifact.path))) {
      missing.push({ ...artifact, reason: 'missing' })
      continue
    }
    const stats = await fs.stat(artifact.path)
    const actualSha1 = artifact.sha1 ? await sha1File(artifact.path) : ''
    if ((artifact.sha1 && actualSha1.toLowerCase() !== String(artifact.sha1).toLowerCase()) || (artifact.size && stats.size !== artifact.size)) {
      missing.push({ ...artifact, reason: 'corrupt' })
    }
  }
  return missing
}

async function ensureNativeLoaderClientArtifacts(minecraftRoot, manifest, installPath) {
  const before = await missingNativeLoaderClientArtifacts(minecraftRoot, manifest)
  const packLibraries = installPath ? await ensureNativeLoaderPackLibraries(minecraftRoot, manifest, installPath) : []
  const nativeRuntime = installPath ? await materializeNativeLoaderAddons(manifest, installPath, { writeReport: true }) : null
  if (before.length === 0) return { created: false, packLibraries, nativeRuntime, warnings: [] }

  const installedFromLocal = []
  for (const artifact of nativeLoaderRequiredClientArtifacts(minecraftRoot, manifest)) {
    const file = {
      kind: 'native-loader-library',
      path: artifact.relativePath,
      absolutePath: artifact.path,
      url: artifact.url,
      sha1: artifact.sha1,
      size: artifact.size,
      libraryName: artifact.libraryName,
    }
    const localInstall = await installNativeLoaderClientArtifactFromLocalSource(file)
    if (localInstall) {
      installedFromLocal.push(localInstall)
      continue
    }
    await downloadSha1Artifact(file)
  }

  const after = await missingNativeLoaderClientArtifacts(minecraftRoot, manifest)
  if (after.length > 0) {
    throw new Error(`Native Loader client library preparation failed: ${after.map((artifact) => `${artifact.label} (${artifact.reason})`).join(', ')}.`)
  }

  return {
    created: true,
    packLibraries,
    nativeRuntime,
    warnings: [
      installedFromLocal.length > 0
        ? `Native Loader client library was ${before.some((artifact) => artifact.reason === 'corrupt') ? 'corrupt or missing' : 'missing'}. ECHO installed ${ECHO_NATIVE_LOADER_LIBRARY_PATH} from the bundled Native Loader library.`
        : `Native Loader client library was ${before.some((artifact) => artifact.reason === 'corrupt') ? 'corrupt or missing' : 'missing'}. ECHO installed ${ECHO_NATIVE_LOADER_LIBRARY_PATH} into Minecraft Launcher libraries.`,
    ],
  }
}

function neoforgeRequiredClientArtifactPaths(minecraftRoot, manifest) {
  const versionJson = manifest?.loader?.versionJson ? manifest.loader.versionJson : manifest
  return minecraftLibraryDownloadArtifacts(minecraftRoot, versionJson, 'NeoForge launcher library')
}

async function missingNeoForgeClientArtifacts(minecraftRoot, manifest) {
  const missing = []
  for (const artifact of neoforgeRequiredClientArtifactPaths(minecraftRoot, manifest)) {
    if (!(await exists(artifact.path))) {
      missing.push({ ...artifact, reason: 'missing' })
      continue
    }
    const stats = await fs.stat(artifact.path)
    const actualSha1 = artifact.sha1 ? await sha1File(artifact.path) : ''
    if ((artifact.sha1 && actualSha1.toLowerCase() !== String(artifact.sha1).toLowerCase()) || (artifact.size && stats.size !== artifact.size)) {
      missing.push({ ...artifact, reason: 'corrupt' })
    }
  }
  return missing
}

function buildEchoManagedVersionManifest(manifest, versionId, runtimeMode, packLibraries = [], runtimeVersionJson = null, nativeRuntime = null) {
  const runtime = launcherRuntimeManifestDefinition(manifest, runtimeMode)
  const validation = validateReleaseLauncherVersionManifest(manifest, versionId, runtimeMode, runtimeVersionJson)
  if (!validation.ok) {
    throw new Error(`${validation.reason} Publish a strict ${runtime.manifestName} release with ${runtime.loaderKey === 'native-loader' ? 'nativeLoader.versionJson' : 'loader.versionJson'} including id, inheritsFrom, mainClass, arguments, and libraries.`)
  }
  if (runtime.runtimeMode === 'neoforge-minecraft' && !validation.versionJson) {
    throw new Error(`${runtime.manifestName} NeoForge handoff requires official installer metadata for '${runtime.version}'.`)
  }
  const versionJson = runtime.runtimeMode === 'native-loader-minecraft'
    ? normalizeEchoNativeLoaderVersionJson(validation.versionJson, manifest, versionId, packLibraries, nativeRuntime)
    : stripNullishLauncherFields(validation.versionJson)
  return {
    ...versionJson,
    echoLauncher: {
      ...(versionJson.echoLauncher && typeof versionJson.echoLauncher === 'object'
        ? versionJson.echoLauncher
        : {}),
      managedBy: 'ECHO Launcher',
      pack: manifest.pack,
      channel: manifest.channel,
      version: manifest.version,
      runtimeMode: runtime.runtimeMode,
      loader: runtime.loaderKey,
      loaderVersion: runtime.version || 'unknown',
      preparedAt: isoNow(),
      source: runtimeVersionJson ? 'neoforge-installer' : 'release-manifest',
    },
  }
}

async function ensureMinecraftLauncherBaseVersionMetadata(minecraftRoot, manifest) {
  const minecraftVersion = minecraftVersionFromManifest(manifest)
  const metadataPath = path.join(minecraftRoot, 'versions', minecraftVersion, `${minecraftVersion}.json`)
  const existing = await readJson(metadataPath, null)
  const existingValidation = validateMinecraftLauncherBaseVersionDocument(existing, minecraftVersion)
  let metadata = existingValidation.ok ? existing : null
  let metadataCreated = false
  if (existingValidation.ok) {
    metadataCreated = false
  } else {
    const resolved = await getMojangVersionMetadata(minecraftVersion)
    metadata = resolved.metadata
    const metadataValidation = validateMinecraftLauncherBaseVersionDocument(metadata, minecraftVersion)
    if (!metadataValidation.ok) {
      throw new Error(`Minecraft ${minecraftVersion} metadata from Mojang is incomplete: ${metadataValidation.reason}.`)
    }

    await writeJson(metadataPath, metadata)
    metadataCreated = true
  }

  const warnings = []
  let clientCreated = false
  if (metadataCreated) {
    warnings.push(
      existing
        ? `Minecraft Launcher base version '${minecraftVersion}' metadata was invalid (${existingValidation.reason}). ECHO rewrote it from Mojang metadata so assets can download.`
        : `Minecraft Launcher base version '${minecraftVersion}' metadata was missing. ECHO wrote it from Mojang metadata so assets can download.`,
    )
  }

  const clientDownload = metadata?.downloads?.client
  if (clientDownload?.url) {
    const clientPath = path.join(minecraftRoot, 'versions', minecraftVersion, `${minecraftVersion}.jar`)
    const result = await downloadSha1Artifact({
      kind: 'minecraft-client',
      path: path.join('versions', minecraftVersion, `${minecraftVersion}.jar`).replace(/\\/g, '/'),
      absolutePath: clientPath,
      url: clientDownload.url,
      sha1: clientDownload.sha1,
      size: clientDownload.size,
    })
    if (result.status === 'downloaded') {
      clientCreated = true
      warnings.push(`Minecraft ${minecraftVersion} client jar was missing or corrupt. ECHO downloaded it so NeoForge can generate its patched client.`)
    }
  }

  return {
    created: metadataCreated || clientCreated,
    metadataPath,
    warnings,
  }
}

async function ensureNeoForgeClientArtifacts(minecraftRoot, manifest, profile, operationId) {
  const versionId = minecraftLauncherVersionId(manifest, 'neoforge-minecraft')
  const metadataPath = path.join(minecraftRoot, 'versions', versionId, `${versionId}.json`)
  const existing = await readJson(metadataPath, null)
  const existingValidation = validateMinecraftLauncherVersionDocument(existing, manifest, versionId, 'neoforge-minecraft')
  const existingMissing = existingValidation.valid ? await missingNeoForgeClientArtifacts(minecraftRoot, existing) : []
  if (existingValidation.valid && existingMissing.length === 0) {
    return { created: false, versionJson: existing, warnings: [] }
  }

  const neoforge = await neoforgeEnsure({
    manifest,
    installPath: minecraftRoot,
    profileId: profile.id,
    operationId,
    operationKind: 'handoff',
  })
  if (!neoforge.ok) {
    throw new Error(`NeoForge client artifact preparation failed: ${neoforge.message}`)
  }

  const versionJson = neoforge.versionJson
  if (!versionJson) {
    throw new Error('NeoForge client artifact preparation failed: the official installer did not include version.json metadata.')
  }

  const launcherLibraries = await ensureMinecraftLibraryArtifacts(minecraftRoot, versionJson, 'NeoForge launcher library')
  const installerLibraries = neoforge.installProfileJson
    ? await ensureMinecraftLibraryArtifacts(minecraftRoot, { libraries: neoforge.installProfileJson.libraries ?? [] }, 'NeoForge installer library')
    : []
  const after = await missingNeoForgeClientArtifacts(minecraftRoot, versionJson)
  if (after.length > 0) {
    throw new Error(`NeoForge installer completed, but ${after.length} launcher librar${after.length === 1 ? 'y is' : 'ies are'} still missing: ${after.map((artifact) => artifact.relativePath ?? artifact.label).join(', ')}.`)
  }

  const warnings = []
  if (!existingValidation.valid && existing) {
    warnings.push(`Minecraft Launcher NeoForge version metadata '${versionId}' was invalid (${existingValidation.reason}). ECHO refreshed it from the official NeoForge installer.`)
  }
  if (existingMissing.length > 0) {
    warnings.push(`NeoForge launcher libraries were missing or corrupt (${existingMissing.map((artifact) => artifact.relativePath ?? artifact.label).join(', ')}). ECHO repaired them.`)
  }
  if (launcherLibraries.length > 0) {
    warnings.push(`NeoForge launcher libraries were installed from verified metadata (${launcherLibraries.length} artifact${launcherLibraries.length === 1 ? '' : 's'}).`)
  }
  if (installerLibraries.length > 0) {
    warnings.push(`NeoForge installer support libraries were installed from verified metadata (${installerLibraries.length} artifact${installerLibraries.length === 1 ? '' : 's'}).`)
  }

  return {
    created: true,
    versionJson,
    warnings,
  }
}

function minecraftLauncherRoots() {
  return minecraftLauncherRootsForPlatform({
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
  }).map((root) => normalizePath(root))
}

async function detectMinecraftRoot(options = {}) {
  for (const root of minecraftLauncherRoots()) {
    if (await exists(root)) return root
  }
  if (options.createIfMissing) {
    const root = minecraftLauncherRoots()[0]
    await ensureDir(root)
    await ensureDir(path.join(root, 'versions'))
    return root
  }
  return null
}

async function findMinecraftLauncherVersion(minecraftRoot, manifest, runtimeMode) {
  const expected = minecraftLauncherVersionId(manifest, runtimeMode)
  const manifestValidation = validateReleaseLauncherVersionManifest(manifest, expected, runtimeMode)
  if (!manifestValidation.ok) {
    return { versionId: expected || 'missing-native-loader-version', ready: false, source: 'invalid', metadataPath: expected ? path.join(minecraftRoot, 'versions', expected, `${expected}.json`) : '', reason: manifestValidation.reason }
  }
  const expectedJson = path.join(minecraftRoot, 'versions', expected, `${expected}.json`)
  if (await exists(expectedJson)) {
    const document = await readJson(expectedJson, null)
    const validation = validateMinecraftLauncherVersionDocument(document, manifest, expected, runtimeMode)
    if (validation.valid && normalizeMinecraftRuntimeMode(runtimeMode, manifest?.pack) === 'neoforge-minecraft') {
      const missingArtifacts = await missingNeoForgeClientArtifacts(minecraftRoot, document)
      if (missingArtifacts.length > 0) {
        return {
          versionId: expected,
          ready: false,
          source: 'missing',
          metadataPath: expectedJson,
          reason: `NeoForge launcher library is ${missingArtifacts.map((artifact) => artifact.reason).includes('corrupt') ? 'corrupt' : 'missing'}: ${missingArtifacts.map((artifact) => artifact.relativePath ?? artifact.label).join(', ')}`,
        }
      }
    }
    if (validation.valid && normalizeMinecraftRuntimeMode(runtimeMode, manifest?.pack) === 'native-loader-minecraft') {
      const missingArtifacts = [
        ...(await missingNativeLoaderClientArtifacts(minecraftRoot, document)),
        ...(await missingNativeLoaderPackLibraryArtifacts(minecraftRoot, document)),
        ...(await missingNativeLoaderRuntimeClasspathArtifacts(document)),
      ]
      if (missingArtifacts.length > 0) {
        return {
          versionId: expected,
          ready: false,
          source: 'missing',
          metadataPath: expectedJson,
          reason: `Native Loader classpath artifact is ${missingArtifacts.map((artifact) => artifact.reason).includes('corrupt') ? 'corrupt' : 'missing'}: ${missingArtifacts.map((artifact) => artifact.relativePath).join(', ')}`,
        }
      }
    }
    return {
      versionId: expected,
      ready: validation.valid,
      source: validation.source,
      metadataPath: expectedJson,
      reason: validation.reason,
    }
  }
  return { versionId: expected, ready: false, source: 'missing', metadataPath: expectedJson }
}

function repairableEchoManagedRuntimeMetadata(versionId, metadataPath, reason) {
  const id = String(versionId ?? '')
  if (!metadataPath || path.basename(metadataPath) !== `${id}.json`) return false
  if (/\bmanifest\b/iu.test(String(reason ?? ''))) return false
  if (id.startsWith('echo-')) return true
  if (id.startsWith('neoforge-') && /bootstrap-only|no real NeoForge classpath/iu.test(String(reason ?? ''))) return true
  return false
}

async function ensureMinecraftLauncherVersionMetadata(minecraftRoot, manifest, profile, operationId, runtimeMode, installPath) {
  const normalizedMode = normalizeMinecraftRuntimeMode(runtimeMode, profile)
  const baseVersion = await ensureMinecraftLauncherBaseVersionMetadata(minecraftRoot, manifest)
  const runtimeArtifacts = normalizedMode === 'neoforge-minecraft'
    ? await ensureNeoForgeClientArtifacts(minecraftRoot, manifest, profile, operationId)
    : normalizedMode === 'native-loader-minecraft'
      ? await ensureNativeLoaderClientArtifacts(minecraftRoot, manifest, installPath ?? profile.installPath)
      : { created: false, warnings: [] }
  const initial = await findMinecraftLauncherVersion(minecraftRoot, manifest, normalizedMode)
  const warnings = [...baseVersion.warnings, ...runtimeArtifacts.warnings]
  if (initial.source === 'invalid' && !initial.metadataPath) {
    throw new Error(initial.reason ?? 'Minecraft Launcher runtime metadata is invalid.')
  }
  if (initial.ready) return { ...initial, created: baseVersion.created || runtimeArtifacts.created, warnings }

  const metadata = buildEchoManagedVersionManifest(
    manifest,
    initial.versionId,
    normalizedMode,
    runtimeArtifacts.packLibraries ?? [],
    normalizedMode === 'neoforge-minecraft' ? runtimeArtifacts.versionJson : null,
    normalizedMode === 'native-loader-minecraft' ? runtimeArtifacts.nativeRuntime : null,
  )
  await ensureDir(path.dirname(initial.metadataPath))
  await writeJson(initial.metadataPath, metadata)

  const runtimeLabel = minecraftRuntimeLabel(normalizedMode)
  const manifestName = manifest?.name ?? profile?.name ?? officialPackDisplayName(manifest?.pack) ?? 'Selected pack'
  if (initial.source === 'invalid') {
    warnings.push(`Minecraft Launcher ${runtimeLabel} version metadata '${initial.versionId}' was invalid (${initial.reason}). ECHO rewrote it from the verified ${manifestName} manifest.`)
  } else {
    warnings.push(`Minecraft Launcher ${runtimeLabel} version metadata '${initial.versionId}' was missing. ECHO wrote it from the verified ${manifestName} manifest.`)
  }

  return {
    versionId: initial.versionId,
    ready: true,
    source: 'echo-managed',
    metadataPath: initial.metadataPath,
    created: true,
    warnings,
  }
}

async function readMinecraftLauncherProfiles(launcherProfilesPath) {
  const document = await readJson(launcherProfilesPath, null)
  if (!document || typeof document !== 'object') return { profiles: {}, settings: {}, version: 3 }
  if (!document.profiles || typeof document.profiles !== 'object') document.profiles = {}
  return document
}

async function backupMinecraftLauncherProfiles(launcherProfilesPath) {
  const backupPath = path.join(getPaths().backups, 'minecraft-launcher-profiles', `${nowStamp()}-launcher_profiles.json`)
  await ensureDir(path.dirname(backupPath))
  if (await exists(launcherProfilesPath)) {
    await fs.copyFile(launcherProfilesPath, backupPath)
  } else {
    await fs.writeFile(backupPath, `${JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2)}\n`, 'utf8')
  }
  return backupPath
}

function minecraftLauncherDependencyPaths() {
  const root = path.join(getPaths().root, 'minecraft-launcher-dependency')
  return {
    root,
    statusPath: path.join(root, 'status.json'),
    logPath: path.join(root, 'install.log'),
    downloads: path.join(root, 'downloads'),
  }
}

async function appendMinecraftLauncherDependencyLog(message) {
  const paths = minecraftLauncherDependencyPaths()
  await ensureDir(paths.root)
  await fs.appendFile(paths.logPath, `[${isoNow()}] ${message}\n`, 'utf8')
  return paths.logPath
}

async function writeMinecraftLauncherDependencyStatus(status) {
  const paths = minecraftLauncherDependencyPaths()
  await writeJson(paths.statusPath, {
    ...status,
    checkedAt: isoNow(),
  })
}

async function firstExecutableCandidate(candidates) {
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    if (process.platform === 'linux' && !candidate.includes('/')) {
      const located = await execFileSafe('which', [candidate])
      const command = located.ok ? located.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) : null
      if (command) return command
      continue
    }
    if (await exists(candidate)) return candidate
  }
  return null
}

async function detectLinuxDistroFamily() {
  const releaseText = await fs.readFile('/etc/os-release', 'utf8').catch(() => '')
  const normalized = releaseText.toLowerCase()
  if (/id(_like)?=.*(debian|ubuntu|linuxmint|pop|elementary)/.test(normalized)) return 'debian'
  if (/id(_like)?=.*(arch|manjaro|endeavouros|garuda)/.test(normalized)) return 'arch'
  if (/id(_like)?=.*(fedora|rhel|suse|opensuse)/.test(normalized)) return 'rpm'
  return 'other'
}

function launcherInstallPathFromExecutable(executablePath) {
  if (!executablePath) return undefined
  return path.dirname(executablePath)
}

function describeMinecraftLauncherInstallAction(platformInfo, distroFamily) {
  if (platformInfo.kind === 'windows') {
    return {
      method: 'winget-or-store',
      detail: 'ECHO will try the official Minecraft Launcher winget package first, then open the Microsoft Store or official Minecraft download page if the installer needs user confirmation.',
      urls: [MINECRAFT_WINDOWS_DOWNLOAD_URL, MINECRAFT_DOWNLOAD_URL, MINECRAFT_HELP_URL],
    }
  }
  if (platformInfo.kind === 'linux' && distroFamily === 'debian') {
    return {
      method: 'official-deb',
      detail: 'ECHO will download the official Minecraft.deb launcher package and ask the system package installer to install it.',
      urls: [MINECRAFT_LINUX_DEB_URL, MINECRAFT_DOWNLOAD_URL],
    }
  }
  if (platformInfo.kind === 'linux' && distroFamily === 'arch') {
    return {
      method: 'official-arch-guidance',
      detail: 'Minecraft lists an Arch-based Linux launcher path, but installation is distro-managed. ECHO will open the official download page with exact status details.',
      urls: [MINECRAFT_DOWNLOAD_URL, MINECRAFT_HELP_URL],
    }
  }
  return {
      method: 'official-download-page',
    detail: 'ECHO could not choose a safe automatic installer for this system, so it will open Minecraft official download page.',
    urls: [MINECRAFT_LINUX_TAR_URL, MINECRAFT_DOWNLOAD_URL, MINECRAFT_HELP_URL],
  }
}

async function minecraftLauncherDependencyStatus(payload = {}) {
  const platformInfo = getPlatformInfo()
  const paths = minecraftLauncherDependencyPaths()
  const warnings = []
  const distroFamily = platformInfo.kind === 'linux' ? await detectLinuxDistroFamily() : undefined
  const executablePath = await firstExecutableCandidate(
    minecraftLauncherExecutableCandidatesForPlatform({
      platform: process.platform,
      env: process.env,
      home: os.homedir(),
    }),
  )
  const cached = await readJson(paths.statusPath, null)
  const source = executablePath
    ? cached?.launcherExecutablePath === executablePath && cached?.launcherDependencySource === 'managed'
      ? 'managed'
      : 'system'
    : 'missing'
  const installAction = describeMinecraftLauncherInstallAction(platformInfo, distroFamily)

  if (!executablePath) {
    warnings.push(
      platformInfo.kind === 'linux'
        ? 'Official Minecraft Launcher executable was not found. ECHO will avoid minecraft:// until a handler is verified.'
        : platformInfo.compat === 'wine'
          ? 'Windows Minecraft Launcher was not found inside this Wine prefix.'
          : 'Official Minecraft Launcher executable was not found.',
    )
  }
  if (source === 'missing') warnings.push(installAction.detail)

  const status = {
    ok: Boolean(executablePath),
    platform: platformInfo,
    launcherDependencySource: source,
    launcherExecutablePath: executablePath ?? undefined,
    launcherInstallPath: launcherInstallPathFromExecutable(executablePath),
    launcherInstallLogPath: paths.logPath,
    launcherDependencyWarnings: warnings,
    installAction,
    distroFamily,
  }
  if (payload.writeCache !== false) await writeMinecraftLauncherDependencyStatus(status)
  return status
}

async function runProcessForInstall(command, args, options = {}) {
  return new Promise((resolve) => {
    const { timeoutMs = 360_000, ...spawnOptions } = options
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...spawnOptions,
    })
    const stdout = []
    const stderr = []
    const timeout = setTimeout(() => {
      child.kill()
      resolve({ ok: false, code: null, stdout: stdout.join(''), stderr: `${stderr.join('')}\nTimed out waiting for ${command}.` })
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => stdout.push(String(chunk)))
    child.stderr?.on('data', (chunk) => stderr.push(String(chunk)))
    child.on('error', (error) => {
      clearTimeout(timeout)
      resolve({ ok: false, code: null, stdout: stdout.join(''), stderr: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({ ok: code === 0, code, stdout: stdout.join(''), stderr: stderr.join('') })
    })
  })
}

async function installMinecraftLauncherOnWindows() {
  const logPath = await appendMinecraftLauncherDependencyLog(`Starting Windows official Minecraft Launcher dependency install (${MINECRAFT_WINDOWS_WINGET_ID}).`)
  const winget = await execFileSafe('where.exe', ['winget.exe'])
  if (winget.ok) {
    const result = await runProcessForInstall('winget.exe', [
      'install',
      '--id',
      MINECRAFT_WINDOWS_WINGET_ID,
      '-e',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--disable-interactivity',
    ])
    await appendMinecraftLauncherDependencyLog(`winget exit=${result.code ?? 'unknown'} ok=${result.ok}\n${result.stdout}\n${result.stderr}`.trim())
    if (result.ok) return { ok: true, method: 'winget', logPath }
  } else {
    await appendMinecraftLauncherDependencyLog('winget.exe was not available.')
  }

  try {
    const paths = minecraftLauncherDependencyPaths()
    const installerPath = path.join(paths.downloads, 'MinecraftInstaller.exe')
    await downloadFile({ url: MINECRAFT_WINDOWS_DOWNLOAD_URL, destination: installerPath })
    await appendMinecraftLauncherDependencyLog(`Downloaded official Windows installer to ${installerPath}.`)
    const openedInstaller = await shell.openPath(installerPath).then((error) => !error, () => false)
    await appendMinecraftLauncherDependencyLog(openedInstaller ? `Opened official Windows installer ${installerPath}.` : `Could not open official Windows installer ${installerPath}.`)
    if (openedInstaller) return { ok: false, method: 'windows-installer', logPath }
  } catch (error) {
    await appendMinecraftLauncherDependencyLog(`Official Windows installer download/open failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  const openedStore = await shell.openExternal(MINECRAFT_WINDOWS_STORE_URL).then(() => true, () => false)
  await appendMinecraftLauncherDependencyLog(openedStore ? `Opened Microsoft Store product page ${MINECRAFT_WINDOWS_STORE_URL}.` : 'Microsoft Store product page could not be opened.')
  if (!openedStore) {
    await shell.openExternal(MINECRAFT_DOWNLOAD_URL).catch(() => undefined)
    await appendMinecraftLauncherDependencyLog(`Opened official Minecraft download page ${MINECRAFT_DOWNLOAD_URL}.`)
  }
  return { ok: false, method: openedStore ? 'microsoft-store' : 'download-page', logPath }
}

async function installMinecraftLauncherOnLinux() {
  const distroFamily = await detectLinuxDistroFamily()
  const logPath = await appendMinecraftLauncherDependencyLog(`Starting Linux official Minecraft Launcher dependency install. distroFamily=${distroFamily}.`)
  if (distroFamily === 'debian') {
    const paths = minecraftLauncherDependencyPaths()
    const debPath = path.join(paths.downloads, 'Minecraft.deb')
    try {
      await downloadFile({ url: MINECRAFT_LINUX_DEB_URL, destination: debPath })
      await appendMinecraftLauncherDependencyLog(`Downloaded official Minecraft Launcher package to ${debPath}.`)
      const pkexec = await execFileSafe('which', ['pkexec'])
      const aptGet = await execFileSafe('which', ['apt-get'])
      const apt = await execFileSafe('which', ['apt'])
      const installer = aptGet.ok ? 'apt-get' : apt.ok ? 'apt' : null
      if (pkexec.ok && installer) {
        const result = await runProcessForInstall('pkexec', [installer, 'install', '-y', debPath], { timeoutMs: 600_000 })
        await appendMinecraftLauncherDependencyLog(`pkexec ${installer} exit=${result.code ?? 'unknown'} ok=${result.ok}\n${result.stdout}\n${result.stderr}`.trim())
        if (result.ok) return { ok: true, method: `pkexec-${installer}`, logPath }
      }
      const openedPackage = await shell.openPath(debPath).then((error) => !error, () => false)
      await appendMinecraftLauncherDependencyLog(openedPackage ? `Opened ${debPath} with the system package installer.` : `Could not open package installer for ${debPath}.`)
      return { ok: false, method: openedPackage ? 'open-deb' : 'downloaded-deb', logPath }
    } catch (error) {
      await appendMinecraftLauncherDependencyLog(`Official .deb install attempt failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  await shell.openExternal(MINECRAFT_DOWNLOAD_URL).catch(() => undefined)
  await appendMinecraftLauncherDependencyLog(`Opened official Minecraft download page ${MINECRAFT_DOWNLOAD_URL}.`)
  return { ok: false, method: 'download-page', logPath }
}

async function minecraftLauncherEnsureDependency(payload = {}) {
  const before = await minecraftLauncherDependencyStatus()
  if (before.ok) return before
  const platformInfo = getPlatformInfo()
  const install =
    platformInfo.kind === 'windows'
      ? await installMinecraftLauncherOnWindows()
      : platformInfo.kind === 'linux'
        ? await installMinecraftLauncherOnLinux()
        : { ok: false, method: 'unsupported', logPath: minecraftLauncherDependencyPaths().logPath }
  const after = await minecraftLauncherDependencyStatus()
  const warnings = [
    ...(after.launcherDependencyWarnings ?? []),
    ...(after.ok
      ? [`Minecraft Launcher dependency resolved through ${install.method}.`]
      : [`Minecraft Launcher install was started through ${install.method}, but ECHO could not confirm the executable yet. Finish the vendor installer, then retry Play.`]),
  ]
  const status = {
    ...after,
    launcherDependencyWarnings: warnings,
    installerMethod: install.method,
    launcherInstallLogPath: install.logPath,
  }
  await writeMinecraftLauncherDependencyStatus(status)
  return status
}

async function protocolHandlerVerifiedForMinecraft() {
  const platformInfo = getPlatformInfo()
  if (platformInfo.kind === 'linux') {
    const query = await execFileSafe('xdg-mime', ['query', 'default', 'x-scheme-handler/minecraft'])
    const handler = query.ok ? query.stdout.trim() : ''
    return Boolean(handler && /minecraft/i.test(handler))
  }
  return platformInfo.kind === 'windows'
}

async function minecraftLauncherOpen(payload = {}) {
  const dependency = payload.launcherExecutablePath
    ? {
        ok: true,
        launcherDependencySource: payload.launcherDependencySource ?? 'system',
        launcherExecutablePath: payload.launcherExecutablePath,
        launcherInstallPath: launcherInstallPathFromExecutable(payload.launcherExecutablePath),
        launcherInstallLogPath: minecraftLauncherDependencyPaths().logPath,
        launcherDependencyWarnings: [],
      }
    : payload.ensure === false
      ? await minecraftLauncherDependencyStatus()
      : await minecraftLauncherEnsureDependency()
  const warnings = [...(dependency.launcherDependencyWarnings ?? [])]

  if (dependency.launcherExecutablePath) {
    try {
      const child = spawn(dependency.launcherExecutablePath, [], { detached: true, stdio: 'ignore' })
      child.unref()
      return { ...dependency, opened: true, openedLauncher: true, method: dependency.launcherExecutablePath, warnings }
    } catch (error) {
      warnings.push(`Could not open ${dependency.launcherExecutablePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (getPlatformInfo().kind === 'linux') {
    for (const executable of linuxMinecraftLauncherCandidates()) {
      const located = await execFileSafe('which', [executable])
      const command = located.ok ? located.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) : null
      if (command) {
        const child = spawn(command, [], { detached: true, stdio: 'ignore' })
        child.unref()
        return { ...dependency, launcherExecutablePath: command, opened: true, openedLauncher: true, method: command, warnings }
      }
    }
    if (await protocolHandlerVerifiedForMinecraft()) {
      const xdgOpen = await execFileSafe('which', ['xdg-open'])
      const xdgOpenCommand = xdgOpen.ok ? xdgOpen.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) : null
      if (xdgOpenCommand) {
        const child = spawn(xdgOpenCommand, ['minecraft://'], { detached: true, stdio: 'ignore' })
        child.unref()
        return { ...dependency, opened: true, openedLauncher: true, method: 'xdg-open minecraft://', warnings }
      }
    } else {
      warnings.push('minecraft:// protocol handler was not verified, so ECHO skipped it to avoid desktop file-handler errors.')
    }
    return { ...dependency, opened: false, openedLauncher: false, method: undefined, warnings }
  }

  if (process.platform === 'win32') {
    try {
      const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', 'minecraft://'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.unref()
      return { ...dependency, opened: true, openedLauncher: true, method: 'minecraft://', warnings }
    } catch {
      // Fall through to Electron's URI opener below.
    }
  }

  try {
    const opened = await Promise.race([
      shell.openExternal('minecraft://').then(() => true, () => false),
      new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
    ])
    return { ...dependency, opened: Boolean(opened), openedLauncher: Boolean(opened), method: opened ? 'minecraft://' : undefined, warnings }
  } catch {
    return { ...dependency, opened: false, openedLauncher: false, method: undefined, warnings }
  }
}

async function repairReservedMinecraftLauncherProfiles(profiles = []) {
  const minecraftRoot = await detectMinecraftRoot({ createIfMissing: false })
  if (!minecraftRoot) return { ok: true, updated: [], backupPath: undefined, warnings: ['Minecraft root was not found.'] }
  const launcherProfilesPath = path.join(minecraftRoot, 'launcher_profiles.json')
  if (!(await exists(launcherProfilesPath))) return { ok: true, updated: [], backupPath: undefined, warnings: ['Minecraft launcher_profiles.json was not found.'] }

  const document = await readMinecraftLauncherProfiles(launcherProfilesPath)
  const updated = []
  const timestamp = isoNow()
  for (const profile of profiles) {
    const runtimeMode = normalizeMinecraftRuntimeMode(profile.runtimeMode, profile)
    if (!MINECRAFT_RUNTIME_MODES.has(runtimeMode)) continue
    const profileKey = minecraftLauncherProfileId(profile.id, runtimeMode)
    const existing = document.profiles?.[profileKey]
    if (!existing || !isReservedEchoMinecraftProfileId(profileKey)) continue

    const installed = profile.installPath ? await readInstalledProfileManifest(profile.installPath, profile.id) : null
    const versionId = installed?.manifest ? minecraftLauncherVersionId(installed.manifest, runtimeMode) : existing.lastVersionId
    const gameDir = profile.installPath ?? existing.gameDir
    if (!versionId || !gameDir) continue

    const currentProfileId = existing.echoLauncher?.profileId
    const needsMarker =
      existing.echoManaged !== true ||
      existing.echoLauncher?.managedBy !== 'ECHO Launcher' ||
      currentProfileId !== profile.id ||
      !sameLauncherGameDir(existing.gameDir, gameDir) ||
      existing.lastVersionId !== versionId
    if (!needsMarker) continue

    document.profiles[profileKey] = {
      ...existing,
      name: minecraftLauncherProfileName(profile, runtimeMode),
      type: 'custom',
      created: existing.created ?? timestamp,
      lastUsed: existing.lastUsed ?? timestamp,
      lastVersionId: versionId,
      gameDir,
      javaArgs: existing.javaArgs ?? `-Xmx${Number(profile.ramGb ?? 8)}G`,
      echoManaged: true,
      echoLauncher: {
        managedBy: 'ECHO Launcher',
        profileId: profile.id,
        pack: installed?.manifest?.pack ?? profile.id,
        channel: profile.channel,
        version: installed?.manifest?.version ?? profile.version,
        runtimeMode,
        runtimeLabel: minecraftRuntimeLabel(runtimeMode),
        loader: minecraftRuntimeLoaderKey(runtimeMode),
        updatedAt: timestamp,
      },
    }
    updated.push(profileKey)
  }

  if (!updated.length) return { ok: true, updated, backupPath: undefined, warnings: [] }
  const backupPath = await backupMinecraftLauncherProfiles(launcherProfilesPath)
  await writeJson(launcherProfilesPath, document)
  await appendLauncherLog('INFO', `Adopted ${updated.length} deterministic ECHO Minecraft Launcher profile${updated.length === 1 ? '' : 's'}: ${updated.join(', ')}.`)
  return { ok: true, updated, backupPath, warnings: [] }
}

async function minecraftLauncherProfileStatus(payload = {}) {
  const { profile, manifest, installPath } = await resolveProfileAndManifest(payload)
  const runtimeMode = normalizeMinecraftRuntimeMode(payload.runtimeMode, profile)
  const runtimeLabel = minecraftRuntimeLabel(runtimeMode)
  const minecraftRoot = await detectMinecraftRoot({ createIfMissing: payload.createMinecraftRoot === true })
  const profileId = minecraftLauncherProfileId(profile.id, runtimeMode)
  const profileName = minecraftLauncherProfileName(profile, runtimeMode)
  const warnings = []
  const dependency = await minecraftLauncherDependencyStatus().catch((error) => ({
    ok: false,
    launcherDependencySource: 'missing',
    launcherInstallLogPath: minecraftLauncherDependencyPaths().logPath,
    launcherDependencyWarnings: [error instanceof Error ? error.message : String(error)],
  }))

  if (!minecraftRoot) {
    const platformInfo = getPlatformInfo()
    const launcherHint =
      platformInfo.kind === 'linux'
        ? 'Minecraft data folder was not found. Open the official Minecraft Launcher for Linux once, then retry handoff.'
        : platformInfo.compat === 'wine'
          ? 'Minecraft data folder was not found in the Wine prefix. Open the Windows Minecraft Launcher inside this Wine prefix once, then retry handoff.'
          : 'Minecraft data folder was not found. Open the official Minecraft Launcher once, then retry handoff.'
    return {
      ok: false,
      runtimeMode,
      runtimeLabel,
      profileId,
      launcherProfileId: profileId,
      profileName,
      profileExists: false,
      profileCurrent: false,
      versionId: minecraftLauncherVersionId(manifest, runtimeMode),
      versionReady: false,
      gameDir: installPath,
      warnings: [launcherHint, ...(dependency.launcherDependencyWarnings ?? [])],
      launcherDependencySource: dependency.launcherDependencySource,
      launcherExecutablePath: dependency.launcherExecutablePath,
      launcherInstallPath: dependency.launcherInstallPath,
      launcherInstallLogPath: dependency.launcherInstallLogPath,
      launcherDependencyWarnings: dependency.launcherDependencyWarnings ?? [],
    }
  }

  const launcherProfilesPath = path.join(minecraftRoot, 'launcher_profiles.json')
  const { versionId, ready, source, metadataPath, reason } = await findMinecraftLauncherVersion(minecraftRoot, manifest, runtimeMode)
  if (!ready) {
    if (source === 'invalid') {
      warnings.push(`Minecraft Launcher ${runtimeLabel} version metadata '${versionId}' is invalid (${reason}).`)
    } else {
      warnings.push(`Minecraft Launcher ${runtimeLabel} version metadata '${versionId}' is not prepared yet. ECHO will prepare it during handoff.`)
    }
  }

  const document = await readMinecraftLauncherProfiles(launcherProfilesPath)
  const existing = document.profiles[profileId]
  const profileExists = Boolean(existing)
  const profileCurrent = Boolean(
    existing &&
      isEchoManagedMinecraftProfile(existing, profileId) &&
      sameLauncherGameDir(existing.gameDir ?? '', installPath) &&
      existing.lastVersionId === versionId,
  )
  const conflictPreview = runtimeMode === 'neoforge-minecraft'
    ? cleanupConflictingMinecraftLauncherProfiles(
        { ...document, profiles: { ...(document.profiles ?? {}) } },
        profileId,
        versionId,
        installPath,
      )
    : { removedProfiles: [], warnings: [] }

  if (existing && !isEchoManagedMinecraftProfile(existing, profileId)) {
    warnings.push(`Minecraft Launcher profile '${profileId}' exists but is not ECHO-managed. It will not be overwritten.`)
  }
  if (!profileExists) warnings.push('Minecraft Launcher profile has not been created yet.')
  if (profileExists && !profileCurrent) warnings.push('Minecraft Launcher profile exists but is out of date.')
  if (conflictPreview.removedProfiles.length) {
    warnings.push(`${conflictPreview.removedProfiles.length} generic NeoForge launcher profile${conflictPreview.removedProfiles.length === 1 ? '' : 's'} will be removed during handoff so testers launch Ashfall instead of pure NeoForge.`)
  }
  warnings.push(...conflictPreview.warnings)
  warnings.push(...(dependency.launcherDependencyWarnings ?? []))

  const profileOwnedOrAvailable = !existing || isEchoManagedMinecraftProfile(existing, profileId)
  const runtimeMetadataRepairable = source === 'invalid' && repairableEchoManagedRuntimeMetadata(versionId, metadataPath, reason)
  const runtimeMetadataUsable = source !== 'invalid' || runtimeMetadataRepairable
  if (runtimeMetadataRepairable) {
    warnings.push(`Minecraft Launcher ${runtimeLabel} version metadata '${versionId}' is ECHO-managed but stale; ECHO will rewrite it during handoff.`)
  }
  return {
    ok: profileOwnedOrAvailable && runtimeMetadataUsable,
    runtimeMode,
    runtimeLabel,
    minecraftRoot,
    launcherProfilesPath,
    profileId,
    launcherProfileId: profileId,
    profileName,
    profileExists,
    profileCurrent,
    versionId,
    versionReady: ready,
    versionSource: source,
    versionMetadataPath: metadataPath,
    gameDir: installPath,
    warnings,
    launcherDependencySource: dependency.launcherDependencySource,
    launcherExecutablePath: dependency.launcherExecutablePath,
    launcherInstallPath: dependency.launcherInstallPath,
    launcherInstallLogPath: dependency.launcherInstallLogPath,
    launcherDependencyWarnings: dependency.launcherDependencyWarnings ?? [],
  }
}

async function openOfficialMinecraftLauncher() {
  return minecraftLauncherOpen()
}

async function minecraftLauncherHandoff(payload = {}) {
  const status = await minecraftLauncherProfileStatus({ ...payload, createMinecraftRoot: true })
  const runtimeMode = status.runtimeMode
  const runtimeLabel = status.runtimeLabel
  if (!status.ok) {
    return {
      ...status,
      runtimeMode,
      runtimeLabel,
      backupPath: undefined,
      openedLauncher: false,
      updatedProfile: false,
      message: status.warnings.join(' '),
    }
  }

  const { profile, manifest, installPath } = await resolveProfileAndManifest(payload)
  const versionPrep = await ensureMinecraftLauncherVersionMetadata(status.minecraftRoot, manifest, profile, payload.operationId, runtimeMode, installPath)
  const statusWithVersion = {
    ...status,
    runtimeMode,
    runtimeLabel,
    versionId: versionPrep.versionId,
    versionReady: versionPrep.ready,
    versionSource: versionPrep.source,
    versionMetadataPath: versionPrep.metadataPath,
    warnings: [
      ...status.warnings.filter((warning) => !/version metadata/i.test(warning)),
      ...versionPrep.warnings,
    ],
  }
  const verification = payload.skipVerification === true ? { missing: [], corrupt: [] } : await verifyManifest({ manifest, installPath })
  const warnings = statusWithVersion.warnings.filter((warning) => !/not been created yet|out of date/i.test(warning))
  if (verification.missing.length || verification.corrupt.length) {
    return {
      ...statusWithVersion,
      ok: false,
      backupPath: undefined,
      openedLauncher: false,
      preparedVersionMetadata: versionPrep.created,
      updatedProfile: false,
      warnings: [
        ...warnings,
        `${verification.missing.length} files are missing and ${verification.corrupt.length} files are corrupt. Run Install / Update or Repair before handoff.`,
      ],
      message: versionPrep.created
        ? 'Minecraft Launcher metadata was prepared, but handoff is blocked by file verification.'
        : 'Minecraft Launcher handoff blocked by file verification.',
    }
  }

  const launcherProfilesPath = status.launcherProfilesPath
  const backupPath = await backupMinecraftLauncherProfiles(launcherProfilesPath)
  const document = await readMinecraftLauncherProfiles(launcherProfilesPath)
  const profileCleanup = runtimeMode === 'neoforge-minecraft'
    ? cleanupConflictingMinecraftLauncherProfiles(
        document,
        statusWithVersion.profileId,
        statusWithVersion.versionId,
        installPath,
      )
    : { removedProfiles: [], warnings: [] }
  if (profileCleanup.removedProfiles.length > 0) {
    warnings.push(
      `Removed ${profileCleanup.removedProfiles.length} generic NeoForge launcher profile${profileCleanup.removedProfiles.length === 1 ? '' : 's'} (${profileCleanup.removedProfiles.join(', ')}) so Minecraft Launcher uses ${profile.name} with the ECHO-managed instance folder.`,
    )
  }
  warnings.push(...profileCleanup.warnings)
  const existing = document.profiles[statusWithVersion.profileId]
  if (existing && !isEchoManagedMinecraftProfile(existing, statusWithVersion.profileId)) {
    throw new Error(`Minecraft Launcher profile '${statusWithVersion.profileId}' is not ECHO-managed and will not be overwritten.`)
  }

  const timestamp = isoNow()
  document.profiles[statusWithVersion.profileId] = {
    ...(existing ?? {}),
    name: statusWithVersion.profileName,
    type: 'custom',
    created: existing?.created ?? timestamp,
    lastUsed: timestamp,
    lastVersionId: statusWithVersion.versionId,
    gameDir: installPath,
    javaArgs: `-Xmx${Number(payload.ramGb ?? profile.ramGb ?? 8)}G`,
    echoManaged: true,
    echoLauncher: {
      managedBy: 'ECHO Launcher',
      profileId: profile.id,
      pack: manifest.pack,
      channel: profile.channel,
      version: manifest.version ?? profile.version,
      runtimeMode,
      runtimeLabel,
      loader: minecraftRuntimeLoaderKey(runtimeMode),
      updatedAt: timestamp,
    },
  }
  await writeJson(launcherProfilesPath, document)

  const savedDocument = await readMinecraftLauncherProfiles(launcherProfilesPath)
  const profileValidation = validateMinecraftLauncherProfileReady(
    savedDocument,
    statusWithVersion.profileId,
    statusWithVersion.versionId,
    installPath,
  )
  const modsValidation = await validateAshfallInstanceMods(installPath, manifest, runtimeMode)
  const launcherProfileWarnings = [...profileCleanup.warnings, ...profileValidation.warnings, ...modsValidation.warnings]
  if (!profileValidation.ok || !modsValidation.ok) {
    const message = launcherProfileWarnings.join(' ')
    await appendLauncherLog('ERROR', `Minecraft Launcher handoff blocked for ${profile.name}: ${message}`)
    return {
      ...statusWithVersion,
      ok: false,
      profileExists: Boolean(savedDocument.profiles?.[statusWithVersion.profileId]),
      profileCurrent: false,
      warnings: [...warnings, ...profileValidation.warnings, ...modsValidation.warnings],
      backupPath,
      openedLauncher: false,
      openMethod: undefined,
      preparedVersionMetadata: versionPrep.created,
      removedLauncherProfiles: profileCleanup.removedProfiles,
      launcherProfileWarnings,
      validatedGameDir: installPath,
      validatedModsCount: modsValidation.validatedModsCount,
      updatedProfile: true,
      message,
    }
  }

  if (payload.prepareOnly === true) {
    await appendLauncherLog(
      'INFO',
      `Minecraft Launcher ${runtimeLabel} handoff profile ${statusWithVersion.profileId} prepared for ${profile.name}; launcher open skipped by prepare-only mode.`,
    )
    return {
      ...statusWithVersion,
      profileExists: true,
      profileCurrent: true,
      warnings,
      backupPath,
      openedLauncher: false,
      openMethod: undefined,
      launcherDependencySource: statusWithVersion.launcherDependencySource,
      launcherExecutablePath: statusWithVersion.launcherExecutablePath,
      launcherInstallPath: statusWithVersion.launcherInstallPath,
      launcherInstallLogPath: statusWithVersion.launcherInstallLogPath,
      launcherDependencyWarnings: statusWithVersion.launcherDependencyWarnings ?? [],
      preparedVersionMetadata: versionPrep.created,
      removedLauncherProfiles: profileCleanup.removedProfiles,
      launcherProfileWarnings,
      validatedGameDir: installPath,
      validatedModsCount: modsValidation.validatedModsCount,
      updatedProfile: true,
      prepareOnly: true,
      openSkipped: true,
      message: `${profile.name} ${runtimeLabel} profile is ready in Minecraft Launcher; opening the launcher was skipped by prepare-only mode.`,
    }
  }

  const dependencyBeforeOpen = await minecraftLauncherDependencyStatus({ writeCache: false }).catch(() => null)
  updateOperationStatus(payload.operationId, {
    kind: 'handoff',
    status: 'running',
    phaseId: dependencyBeforeOpen?.ok ? 'launcher-open' : 'launcher-dependency',
    label: dependencyBeforeOpen?.ok ? 'Opening Minecraft Launcher' : 'Installing Minecraft Launcher dependency',
    progress: 97,
    message: dependencyBeforeOpen?.ok
      ? `Opening ${dependencyBeforeOpen.launcherDependencySource ?? 'system'} launcher.`
      : 'Official Minecraft Launcher is missing; starting the vendor installer flow.',
  })
  const opened = await openOfficialMinecraftLauncher()
  warnings.push(...(opened.warnings ?? opened.launcherDependencyWarnings ?? []))
  if (!opened.opened) {
    warnings.push(
      opened.launcherExecutablePath
        ? `Minecraft Launcher profile was updated, but ${opened.launcherExecutablePath} could not be opened automatically.`
        : `Minecraft Launcher profile was updated, but the official launcher could not be opened automatically. Installer log: ${opened.launcherInstallLogPath ?? 'not available'}.`,
    )
  }
  const removedProfileMessage = profileCleanup.removedProfiles.length
    ? ` Removed generic NeoForge profile${profileCleanup.removedProfiles.length === 1 ? '' : 's'}: ${profileCleanup.removedProfiles.join(', ')}.`
    : ''
  await appendLauncherLog(
    'INFO',
    `Minecraft Launcher ${runtimeLabel} handoff profile ${statusWithVersion.profileId} updated for ${profile.name}; ${modsValidation.validatedModsCount} ${modsValidation.validatedFileLabel ?? 'runtime file'}${modsValidation.validatedModsCount === 1 ? '' : 's'} validated in ${installPath}.${removedProfileMessage}`,
  )
  const validatedRuntimeFiles = `${modsValidation.validatedModsCount} ${modsValidation.validatedFileLabel ?? 'runtime file'}${modsValidation.validatedModsCount === 1 ? '' : 's'}`

  return {
    ...statusWithVersion,
    profileExists: true,
    profileCurrent: true,
    warnings,
    backupPath,
    openedLauncher: opened.opened,
    openMethod: opened.method,
    launcherDependencySource: opened.launcherDependencySource ?? statusWithVersion.launcherDependencySource,
    launcherExecutablePath: opened.launcherExecutablePath ?? statusWithVersion.launcherExecutablePath,
    launcherInstallPath: opened.launcherInstallPath ?? statusWithVersion.launcherInstallPath,
    launcherInstallLogPath: opened.launcherInstallLogPath ?? statusWithVersion.launcherInstallLogPath,
    launcherDependencyWarnings: opened.launcherDependencyWarnings ?? opened.warnings ?? statusWithVersion.launcherDependencyWarnings ?? [],
    preparedVersionMetadata: versionPrep.created,
    removedLauncherProfiles: profileCleanup.removedProfiles,
    launcherProfileWarnings,
    validatedGameDir: installPath,
    validatedModsCount: modsValidation.validatedModsCount,
    updatedProfile: true,
    message: opened.opened
      ? `Minecraft Launcher opened with the ${profile.name} ${runtimeLabel} profile ready (${opened.launcherDependencySource ?? 'system'}). ${validatedRuntimeFiles} are available in the ECHO instance.${removedProfileMessage}`
      : `${profile.name} ${runtimeLabel} profile is ready in Minecraft Launcher. ${validatedRuntimeFiles} are available in the ECHO instance; finish/open the official launcher manually from ${opened.launcherExecutablePath ?? opened.launcherInstallPath ?? MINECRAFT_DOWNLOAD_URL}.${removedProfileMessage}`,
  }
}

function phaseSnapshot(id, label, status, extra = {}) {
  return {
    id,
    label,
    status,
    timestamp: isoNow(),
    ...extra,
  }
}

function summarizeInstallProblems(install) {
  const failed = install.failed ?? []
  const skipped = install.skipped ?? []
  const missing = install.after?.missing ?? []
  const corrupt = install.after?.corrupt ?? []
  const total = failed.length + skipped.length + missing.length + corrupt.length
  const firstFailure = failed[0] ? `${failed[0].path}: ${failed[0].reason}` : null
  const firstSkipped = skipped[0] ? `${skipped[0].path}: ${skipped[0].reason}` : null
  const firstMissing = missing[0] ? `${missing[0]} is missing` : null
  const firstCorrupt = corrupt[0] ? `${corrupt[0]} is corrupt` : null
  const detail = firstFailure ?? firstSkipped ?? firstMissing ?? firstCorrupt
  if (!total) return 'Ashfall install did not pass verification.'
  return detail ? `${total} install item${total === 1 ? '' : 's'} need attention. ${detail}` : `${total} install item${total === 1 ? '' : 's'} need attention.`
}

async function createVerifiedInstallReport(profile, manifest, installPath, verification) {
  const installId = `verify-${nowStamp()}`
  const packName = profile?.name ?? manifest?.name ?? officialPackDisplayName(manifest?.pack) ?? 'Selected pack'
  const neoforge = {
    ok: true,
    version: manifest.loader?.version ?? 'unknown',
    skipped: true,
    message: `${packName} is already installed; no archive download was needed.`,
  }
  const runtime = {
    ok: true,
    warnings: ['Internal Minecraft runtime install skipped for Minecraft Launcher handoff mode.'],
  }
  const report = {
    ok: true,
    installId,
    operation: 'verify',
    profileId: profile.id,
    installPath,
    generatedAt: isoNow(),
    downloaded: [],
    updated: [],
    removed: [],
    installed: [],
    verified: verification.valid,
    skipped: [],
    failed: [],
    neoforge,
    runtime,
    before: verification,
    after: verification,
  }

  await profileSave({
    ...profile,
    installPath,
    version: manifest.version ?? profile.version,
    minecraft: minecraftVersionFromManifest(manifest),
    neoforge: manifest.loader?.version ?? profile.neoforge,
    ramGb: manifest.ramMb ? Math.max(2, Math.round(manifest.ramMb / 1024)) : profile.ramGb,
    status: 'healthy',
    manifestPath: path.join(installPath, '.echo', 'installed-manifest.json'),
  })
  await appendLauncherLog('INFO', `${packName} install verified without archive download. Verified ${verification.valid.length} files.`)
  return writeInstallLikeReport('install', installId, report)
}

function packOsLaunchBlockResult(packOs, operationId, phases, runtimeMode, profileId = CANONICAL_PROFILE_ID) {
  const selectedPack = packOs?.packs?.find((pack) => pack.packId === profileId) ?? packOs?.selectedPack
  if (!selectedPack || selectedPack.launchAllowed !== false || !BLOCKING_UI_STATES.has(selectedPack.uiState)) return null
  const reason = [
    ...(Array.isArray(selectedPack.blockingReasons) ? selectedPack.blockingReasons : []),
    ...(Array.isArray(selectedPack.warnings) ? selectedPack.warnings : []),
  ].find(Boolean) ?? `PackOS reports ${selectedPack.name ?? selectedPack.packId ?? 'Ashfall'} is ${selectedPack.uiState}.`
  const message = `PackOS blocked launch: ${reason}`
  phases.push(phaseSnapshot('packos', 'Check PackOS launcher state', 'failed', { message }))
  updateOperationStatus(operationId, {
    kind: 'handoff',
    status: 'failed',
    phaseId: 'packos',
    label: 'PackOS blocks launch',
    progress: 96,
    message,
  })
  return {
    ok: false,
    profileId: selectedPack.packId ?? profileId,
    runtimeMode: normalizeMinecraftRuntimeMode(runtimeMode, profileId),
    runtimeLabel: minecraftRuntimeLabel(normalizeMinecraftRuntimeMode(runtimeMode, profileId)),
    operationId,
    phases,
    release: null,
    install: null,
    verification: null,
    handoff: null,
    packOs,
    message,
    warnings: [message],
  }
}

async function launchPrepareHandoff(payload = {}) {
  const operationId = payload.operationId ?? createOperationId('handoff')
  const updatePolicy = payload.updatePolicy === 'skip' ? 'skip' : 'allow'
  const runtimeMode = normalizeMinecraftRuntimeMode(payload.runtimeMode, payload.profileId ?? CANONICAL_PROFILE_ID)
  const runtimeLabel = minecraftRuntimeLabel(runtimeMode)
  updateOperationStatus(operationId, {
    kind: 'handoff',
    status: 'running',
    phaseId: 'release',
    label: `Checking ${officialPackDisplayName(payload.profileId ?? CANONICAL_PROFILE_ID)} install`,
    progress: 4,
    message: '',
  })
  const phases = []
  const runPhase = async (id, label, progress, task) => {
    phases.push(phaseSnapshot(id, label, 'running'))
    updateOperationStatus(operationId, {
      kind: 'handoff',
      status: 'running',
      phaseId: id,
      label,
      progress,
      message: '',
    })
    try {
      const result = await task()
      phases.push(phaseSnapshot(id, label, 'completed'))
      updateOperationStatus(operationId, {
        kind: 'handoff',
        status: 'running',
        phaseId: id,
        label,
        progress: Math.max(progress, operationStatuses.get(operationId)?.progress ?? progress),
        message: 'Completed',
      })
      return result
    } catch (error) {
      phases.push(phaseSnapshot(id, label, 'failed', { message: error instanceof Error ? error.message : String(error) }))
      updateOperationStatus(operationId, {
        kind: 'handoff',
        status: 'failed',
        phaseId: id,
        label,
        progress: Math.max(progress, operationStatuses.get(operationId)?.progress ?? progress),
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  try {
    const packOs = await packOsGetState()
    const packOsBlocked = packOsLaunchBlockResult(packOs, operationId, phases, runtimeMode, payload.profileId ?? CANONICAL_PROFILE_ID)
    if (packOsBlocked) return packOsBlocked

    if (updatePolicy === 'skip') {
      const profiles = await profileList()
      const profile = selectLauncherProfile(profiles, payload, true)
      if (!profile) throw new Error('No launcher profile is available.')
      const installPath = normalizePath(payload.installPath ?? profile.installPath ?? defaultInstallPathForProfile(getPaths(), profile.id))
      const installed = await readInstalledProfileManifest(installPath, profile.id)
      if (!installed?.manifest) {
        const message = `${profile.name} is not installed yet. Install ${profile.name} before using Play.`
        phases.push(phaseSnapshot('check', `Check installed ${profile.name} files`, 'failed', { message }))
        updateOperationStatus(operationId, {
          kind: 'handoff',
          status: 'failed',
          phaseId: 'check',
          label: `${profile.name} install required`,
          progress: 96,
          message,
        })
        return {
          ok: false,
          profileId: profile.id,
          runtimeMode,
          runtimeLabel,
          operationId,
          phases,
          release: null,
          install: null,
          verification: null,
          handoff: null,
          packOs,
          message,
          warnings: [message],
        }
      }

      const manifest = installed.manifest
      const verification = await runPhase('check', `Check installed ${profile.name} files`, 12, () =>
        verifyManifest({
          profileId: profile.id,
          manifest,
          installPath: installed.installPath,
          onProgress: (progress) => {
            updateOperationStatus(operationId, {
              kind: 'handoff',
              status: 'running',
              phaseId: 'check',
              label: `Checking installed files (${progress.checked}/${progress.total})`,
              progress: 12 + (progress.total ? (progress.checked / progress.total) * 6 : 6),
              message: progress.currentPath,
            })
          },
        }),
      )

      if (verification.missing.length || verification.corrupt.length) {
        const verificationProblem = `${verification.missing.length} files missing and ${verification.corrupt.length} corrupt.${verification.missing[0] ? ` First missing: ${verification.missing[0]}.` : ''}${verification.corrupt[0] ? ` First corrupt: ${verification.corrupt[0]}.` : ''}`
        updateOperationStatus(operationId, {
          kind: 'handoff',
          status: 'failed',
          phaseId: 'verify',
          label: 'Ashfall verification failed',
          progress: 96,
          message: verificationProblem,
        })
        return {
          ok: false,
          profileId: profile.id,
          runtimeMode,
          runtimeLabel,
          operationId,
          phases,
          release: null,
          install: null,
          verification,
          handoff: null,
          packOs,
          message: verificationProblem,
          warnings: [verificationProblem],
        }
      }

      updateOperationStatus(operationId, {
        kind: 'handoff',
        status: 'running',
        phaseId: 'check',
        label: `${profile.name} already installed`,
        progress: 86,
        message: `${verification.valid.length} files verified locally. No ${profile.name} update was applied.`,
      })
      const install = await createVerifiedInstallReport(profile, manifest, installed.installPath, verification)
      const handoff = await runPhase('handoff', `Prepare ${runtimeLabel} profile`, 95, () =>
        minecraftLauncherHandoff({
          profileId: profile.id,
          installPath: install.installPath,
          manifest,
          ramGb: payload.ramGb,
          skipVerification: true,
          operationId,
          runtimeMode,
          prepareOnly: payload.prepareOnly === true,
        }),
      )
      updateOperationStatus(operationId, {
        kind: 'handoff',
        status: handoff.ok ? 'completed' : 'failed',
        phaseId: 'handoff',
        label: handoff.ok ? 'Ready in Minecraft Launcher' : 'Minecraft Launcher needs attention',
        progress: handoff.ok ? 100 : 96,
        message: handoff.message,
      })

      return {
        ok: handoff.ok,
        profileId: profile.id,
        runtimeMode,
        runtimeLabel,
        operationId,
        phases,
        release: null,
        install,
        verification,
        handoff,
        packOs,
        message: handoff.message,
        warnings: handoff.warnings ?? [],
      }
    }

    const { profile } = await resolveProfileAndManifest({ ...payload, profileId: payload.profileId ?? CANONICAL_PROFILE_ID })
    const release = await runPhase('release', `Refresh ${profile.name} release metadata`, 8, () =>
      releaseFetchManifest({
        channel: profile.channel ?? CANONICAL_CHANNEL,
        version: payload.version,
        refresh: payload.refreshRelease,
        pack: profile.id,
      }),
    )
    const installPath = normalizePath(payload.installPath ?? profile.installPath ?? release.manifest.localInstallRoot)
    const installed = await readInstalledProfileManifest(installPath, profile.id)
    const releaseVersion = String(release.manifest.version ?? release.entry.version ?? '')
    const installedVersion = String(installed?.manifest?.version ?? '')
    let install = null
    let verification = null

    if (installed && installedVersion === releaseVersion) {
      verification = await runPhase('check', `Check installed ${profile.name} files`, 12, () =>
        verifyManifest({
          profileId: profile.id,
          manifest: release.manifest,
          installPath,
          onProgress: (progress) => {
            updateOperationStatus(operationId, {
              kind: 'handoff',
              status: 'running',
              phaseId: 'check',
              label: `Checking installed files (${progress.checked}/${progress.total})`,
              progress: 12 + (progress.total ? (progress.checked / progress.total) * 6 : 6),
              message: progress.currentPath,
            })
          },
        }),
      )

      if (verification.missing.length === 0 && verification.corrupt.length === 0) {
        updateOperationStatus(operationId, {
          kind: 'handoff',
          status: 'running',
          phaseId: 'check',
          label: `${profile.name} already installed`,
          progress: 86,
          message: `${verification.valid.length} files verified locally. No ${profile.name} archive download needed.`,
        })
        install = await createVerifiedInstallReport(profile, release.manifest, installPath, verification)
      }
    }

    if (!install) {
      install = await runPhase(
        'install',
        installed
          ? installedVersion === releaseVersion
            ? `Repair ${profile.name} files`
            : `Update ${profile.name} files`
          : `Install ${profile.name} files`,
        18,
        () =>
          installRun({
            profileId: profile.id,
            installPath,
            manifestPath: release.manifestPath,
            channel: profile.channel ?? CANONICAL_CHANNEL,
            version: release.entry.version,
            installRuntime: false,
            operationId,
            operationKind: 'handoff',
          }),
      )
      verification = install.after
    }

    if (!install.ok) {
      const installProblem = summarizeInstallProblems(install)
      updateOperationStatus(operationId, {
        kind: 'handoff',
        status: 'failed',
        phaseId: 'install',
        label: 'Ashfall install needs attention',
        progress: 96,
        message: installProblem,
      })
      return {
        ok: false,
        profileId: profile.id,
        runtimeMode,
        runtimeLabel,
        operationId,
        phases,
        release: release.entry,
        install,
        handoff: null,
        packOs,
        message: installProblem,
        warnings: [
          ...((install.runtime?.warnings ?? [])),
          `${install.failed.length + install.skipped.length + install.after.missing.length + install.after.corrupt.length} install items still need attention.`,
        ],
      }
    }

    verification = verification ?? install.after
    if (verification.missing.length || verification.corrupt.length) {
      const verificationProblem = `${verification.missing.length} files missing and ${verification.corrupt.length} corrupt.${verification.missing[0] ? ` First missing: ${verification.missing[0]}.` : ''}${verification.corrupt[0] ? ` First corrupt: ${verification.corrupt[0]}.` : ''}`
      updateOperationStatus(operationId, {
        kind: 'handoff',
        status: 'failed',
        phaseId: 'verify',
        label: 'Ashfall verification failed',
        progress: 96,
        message: verificationProblem,
      })
      return {
        ok: false,
        profileId: profile.id,
        runtimeMode,
        runtimeLabel,
        operationId,
        phases,
        release: release.entry,
        install,
        verification,
        handoff: null,
        packOs,
        message: verificationProblem,
        warnings: [verificationProblem],
      }
    }

    const handoff = await runPhase('handoff', `Prepare ${runtimeLabel} profile`, 95, () =>
      minecraftLauncherHandoff({
        profileId: profile.id,
        installPath: install.installPath,
        manifest: release.manifest,
        ramGb: payload.ramGb,
        skipVerification: true,
        operationId,
        runtimeMode,
        prepareOnly: payload.prepareOnly === true,
      }),
    )
    updateOperationStatus(operationId, {
      kind: 'handoff',
      status: handoff.ok ? 'completed' : 'failed',
      phaseId: 'handoff',
      label: handoff.ok ? 'Ready in Minecraft Launcher' : 'Minecraft Launcher needs attention',
      progress: handoff.ok ? 100 : 96,
      message: handoff.message,
    })

    return {
      ok: handoff.ok,
      profileId: profile.id,
      runtimeMode,
      runtimeLabel,
      operationId,
      phases,
      release: release.entry,
      install,
      verification,
      handoff,
      packOs,
      message: handoff.message,
      warnings: handoff.warnings ?? [],
    }
  } catch (error) {
    updateOperationStatus(operationId, {
      kind: 'handoff',
      status: 'failed',
      phaseId: 'error',
      label: 'Ashfall handoff failed',
      progress: Math.max(96, operationStatuses.get(operationId)?.progress ?? 0),
      message: error instanceof Error ? error.message : String(error),
    })
    return {
      ok: false,
      profileId: payload.profileId ?? CANONICAL_PROFILE_ID,
      runtimeMode,
      runtimeLabel,
      operationId,
      phases,
      release: null,
      install: null,
      verification: null,
      handoff: null,
      message: error instanceof Error ? error.message : String(error),
      warnings: [],
    }
  }
}

async function nativeLoaderAshfallStatus() {
  const launcherRoot = echoNativeLauncherRoot()
  const nativeWorkspace = echoNativeWorkspaceRoot()
  const scriptPath = path.join(launcherRoot, 'Launch-AshfallNativeLoader.ps1')
  const commandPath = path.join(launcherRoot, 'Launch-AshfallNativeLoader.cmd')
  const fixtureRoot = path.join(nativeWorkspace, 'fixtures', 'ashfall')
  const reportsRoot = path.join(nativeWorkspace, 'reports', 'echo-native', 'ashfall')
  const m31ReportPath = path.join(reportsRoot, 'phase13-m31-completion.json')
  const processReportPath = path.join(reportsRoot, 'tester-launch-process.json')
  const requiredFiles = [
    scriptPath,
    commandPath,
    path.join(fixtureRoot, 'runtime-artifacts.json'),
    path.join(fixtureRoot, 'runtime-fixture-approvals.json'),
    path.join(fixtureRoot, 'local-runtime', 'minecraft', '26.1.2', 'client', 'minecraft-client-26.1.2.jar'),
    path.join(fixtureRoot, 'local-runtime', 'minecraft', '26.1.2', 'natives', 'minecraft-26.1.2-natives.zip'),
  ]
  const missing = []
  for (const file of requiredFiles) {
    if (!(await exists(file))) missing.push(file)
  }
  const m31 = await readJson(m31ReportPath, null)
  const processReport = await readJson(processReportPath, null)
  const pid = await findEchoNativeAshfallProcess()
  const m31Ready = m31?.status === 'PASS' || m31?.data?.phase13M31Complete === true || m31?.data?.publicBetaOpen === true
  const ready = missing.length === 0 && m31Ready
  return {
    ok: ready,
    ready,
    running: Boolean(pid),
    pid: pid ?? undefined,
    launcherRoot,
    nativeWorkspace,
    scriptPath,
    commandPath,
    fixtureRoot,
    gameDir: echoNativeAshfallGameDir(),
    m31Ready,
    m31ReportPath,
    processReportPath,
    lastProcessId: processReport?.data?.processId,
    lastProcessLaunched: Boolean(processReport?.data?.processLaunched),
    warnings: [
      ...missing.map((file) => `Missing native loader launcher file: ${file}`),
      ...(m31Ready ? [] : [`Native loader beta gate is not PASS: ${m31ReportPath}`]),
    ],
    message: ready
      ? 'Ashfall Native Loader launcher is ready.'
      : 'Ashfall Native Loader launcher is missing required local files or readiness reports.',
  }
}

async function nativeLoaderLaunchAshfall(payload = {}) {
  const profileId = normalizeOfficialPackId(payload.profileId) ?? CANONICAL_PROFILE_ID
  const status = await nativeLoaderAshfallStatus()
  if (!status.ok) {
    activeLaunch = {
      active: false,
      status: 'preflight_failed',
      profileId,
      message: status.message,
      logPath: '',
      exitCode: null,
      exitedAt: isoNow(),
    }
    return {
      ok: false,
      profileId,
      pid: status.pid,
      message: status.message,
      warnings: status.warnings,
      status,
      state: launchState(),
    }
  }

  const operationId = payload.operationId ?? createOperationId('native-loader')
  updateOperationStatus(operationId, {
    kind: 'handoff',
    status: 'running',
    phaseId: 'native-loader',
    label: 'Starting Ashfall Native Loader',
    progress: 88,
    message: 'Running the local ECHO Native launcher handoff.',
  })

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    status.scriptPath,
    '-SkipBuild',
  ]
  const result = await execFileSafe('powershell.exe', args, {
    cwd: status.launcherRoot,
    timeout: 180000,
    windowsHide: false,
  })
  const nextStatus = await nativeLoaderAshfallStatus()
  const ok = result.ok && (nextStatus.running || nextStatus.lastProcessLaunched)
  const stdout = String(result.stdout ?? '').trim()
  const stderr = String(result.stderr ?? '').trim()
  const message = ok
    ? `Ashfall Native Loader started${nextStatus.pid ? ` (PID ${nextStatus.pid})` : ''}.`
    : `Ashfall Native Loader launch failed.${stderr ? ` ${stderr}` : stdout ? ` ${stdout}` : ''}`

  activeLaunch = {
    active: ok,
    pid: nextStatus.pid,
    profileId,
    startedAt: ok ? isoNow() : undefined,
    exitedAt: ok ? undefined : isoNow(),
    exitCode: result.code,
    logPath: path.join(nextStatus.gameDir, 'logs', 'echo-native-tester-launch.out.log'),
    status: ok ? 'running' : 'failed',
    message,
  }
  updateOperationStatus(operationId, {
    kind: 'handoff',
    status: ok ? 'completed' : 'failed',
    phaseId: 'native-loader',
    label: ok ? 'Ashfall Native Loader running' : 'Native Loader failed',
    progress: ok ? 100 : 96,
    message,
  })
  await appendLauncherLog(ok ? 'INFO' : 'ERROR', message)
  return {
    ok,
    profileId,
    pid: nextStatus.pid,
    message,
    warnings: [
      ...(nextStatus.warnings ?? []),
      ...(stderr && !ok ? [stderr] : []),
    ],
    status: nextStatus,
    state: launchState(),
  }
}

async function packExport(payload = {}) {
  const paths = getPaths()
  const { profile, manifest, installPath } = await resolveProfileAndManifest({
    profileId: payload.profileId ?? CANONICAL_PROFILE_ID,
    installPath: payload.sourcePath ?? payload.installPath,
    manifestPath: payload.manifestPath,
  })
  const sourcePath = normalizePath(payload.sourcePath ?? installPath)
  const version = payload.version ?? manifest.version ?? profile.version ?? CANONICAL_VERSION
  const outputDir = normalizePath(payload.outputDir ?? paths.exports)
  const outputPath = normalizePath(payload.outputPath ?? path.join(outputDir, `Ashfall-${version}.echo-pack.zip`))
  const scriptPath = path.join(app.getAppPath(), 'scripts', 'lib', 'pack-export.mjs')
  const moduleUrl = pathToFileURL(scriptPath).href
  const { createEchoPackExport } = await import(moduleUrl)
  return createEchoPackExport({
    sourcePath,
    outputDir,
    outputPath,
    version,
    channel: profile.channel ?? manifest.channel ?? CANONICAL_CHANNEL,
    manifest,
    extraIncludePaths: Array.isArray(payload.extraIncludePaths) ? payload.extraIncludePaths : [],
    changelog: Array.isArray(payload.changelog) ? payload.changelog : undefined,
    releaseNotes: Array.isArray(payload.releaseNotes) ? payload.releaseNotes : undefined,
    includeResourcepacks: payload.includeResourcepacks ?? true,
    includeShaderpacks: payload.includeShaderpacks ?? true,
    includeServerSafeFiles: payload.includeServerSafeFiles ?? true,
    emitReleaseSidecars: Boolean(payload.emitReleaseSidecars),
  })
}

function nativeLaunchRemovedMessage() {
  return 'Native launch was removed. Use Minecraft Launcher Handoff so the official launcher handles Microsoft login and play.'
}

async function launchBuildCommand() {
  throw new Error(nativeLaunchRemovedMessage())
}

async function launchPreflight(payload = {}) {
  const { profile, manifest, installPath } = await resolveProfileAndManifest(payload)
  const [java, verification, runtimeVerification] = await Promise.all([
    javaDetect(),
    verifyManifest({ manifest, installPath }),
    minecraftVerifyRuntime({ manifest }),
  ])
  const blockers = [
    {
      id: 'minecraft-launcher-handoff',
      severity: 'critical',
      message: nativeLaunchRemovedMessage(),
      action: 'Use Play Ashfall to prepare the Minecraft Launcher profile and open the official launcher.',
    },
  ]
  return {
    ok: false,
    profileId: profile.id,
    installPath,
    checkedAt: isoNow(),
    java: java.preferred,
    verification,
    runtimeVerification,
    accountLinked: true,
    sessionReady: true,
    neoforgeReady: Boolean(manifest.loader?.version),
    ramGb: Number(payload.ramGb ?? profile.ramGb ?? 8),
    blockers,
  }
}

async function launchStart(payload = {}) {
  const profileId = payload.profileId ?? CANONICAL_PROFILE_ID
  activeLaunch = {
    status: 'preflight_failed',
    message: nativeLaunchRemovedMessage(),
    profileId,
    logPath: '',
    exitCode: null,
    exitedAt: isoNow(),
  }
  return launchState()
}

async function launchStop() {
  if (activeLaunch?.process && !activeLaunch.exitedAt) {
    if (process.platform === 'win32' && activeLaunch.process.pid) {
      await new Promise((resolve) => {
        execFile('taskkill.exe', ['/pid', String(activeLaunch.process.pid), '/t', '/f'], () => resolve())
      })
    } else {
      activeLaunch.process.kill()
    }
    activeLaunch.status = 'stopped'
    activeLaunch.message = 'Minecraft stop requested.'
    activeLaunch.exitedAt = isoNow()
    await fs.appendFile(activeLaunch.logPath, `[${isoNow()}] Stop requested by ECHO Launcher.\n`).catch(() => undefined)
  }
  return launchState()
}

async function launchReadLog() {
  const state = launchState()
  const log = state.logPath && (await exists(state.logPath)) ? await fs.readFile(state.logPath, 'utf8') : ''
  return { state, log }
}

async function downloadZipPackArtifact(manifest) {
  if (manifest.artifactMode !== 'zip') {
    throw new Error('Selected manifest is not a zip artifact manifest.')
  }
  if (!manifest.artifactUrl) {
    throw new Error(`Pack artifact ${manifest.artifactName} is missing a resolved GitHub asset URL.`)
  }
  return downloadVerifiedArtifact({
    path: manifest.artifactName,
    assetName: manifest.artifactName,
    url: manifest.artifactUrl,
    sha256: manifest.artifactSha256,
    size: manifest.artifactSize,
  })
}

async function zipEntryDataOffset(zipPath, entry) {
  const file = await fs.open(zipPath, 'r')
  try {
    const header = Buffer.alloc(30)
    await file.read(header, 0, header.length, entry.header.offset)
    if (header.readUInt32LE(0) !== 0x04034b50) {
      throw new Error(`Zip local header is invalid for ${entry.entryName}.`)
    }
    const fileNameLength = header.readUInt16LE(26)
    const extraLength = header.readUInt16LE(28)
    return entry.header.offset + 30 + fileNameLength + extraLength
  } finally {
    await file.close()
  }
}

async function extractZipEntryToFile(zipPath, entry, destination, options = {}) {
  if (entry.header.encrypted) {
    throw new Error(`Zip entry ${entry.entryName} is encrypted and cannot be installed.`)
  }

  const method = Number(entry.header.method)
  if (method !== 0 && method !== 8) {
    throw new Error(`Zip entry ${entry.entryName} uses unsupported compression method ${method}.`)
  }

  const compressedSize = Number(entry.header.compressedSize)
  const expectedSize = Number(options.expectedSize ?? entry.header.size ?? 0)
  if (!Number.isFinite(compressedSize) || compressedSize < 0) {
    throw new Error(`Zip entry ${entry.entryName} has an invalid compressed size.`)
  }

  const dataOffset = await zipEntryDataOffset(zipPath, entry)
  const tempPath = `${destination}.echo-part-${process.pid}-${Date.now()}`
  const hash = crypto.createHash('sha256')
  let written = 0
  let lastProgressAt = 0
  const report = (force = false) => {
    if (!options.onProgress) return
    const now = Date.now()
    if (!force && now - lastProgressAt < 250) return
    lastProgressAt = now
    options.onProgress({ written, total: expectedSize })
  }

  await ensureDir(path.dirname(destination))
  if (compressedSize === 0) {
    try {
      await fs.writeFile(tempPath, '')
      const actual = hash.digest('hex')
      if (options.expectedSha256 && actual.toLowerCase() !== String(options.expectedSha256).toLowerCase()) {
        throw new Error(`Zip entry SHA-256 mismatch: ${actual}`)
      }
      if (expectedSize && written !== expectedSize) {
        throw new Error(`Zip entry size mismatch: ${written} bytes`)
      }
      await fs.rm(destination, { force: true })
      await fs.rename(tempPath, destination)
      report(true)
      return { sha256: actual, size: written }
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      written += chunk.length
      hash.update(chunk)
      report(false)
      callback(null, chunk)
    },
  })

  const source = fssync.createReadStream(zipPath, {
    start: dataOffset,
    end: dataOffset + compressedSize - 1,
  })
  const unzip = method === 8 ? zlib.createInflateRaw() : null
  const output = fssync.createWriteStream(tempPath)

  try {
    if (unzip) {
      await pipeline(source, unzip, meter, output)
    } else {
      await pipeline(source, meter, output)
    }
    report(true)
    const actual = hash.digest('hex')
    if (options.expectedSha256 && actual.toLowerCase() !== String(options.expectedSha256).toLowerCase()) {
      throw new Error(`Zip entry SHA-256 mismatch: ${actual}`)
    }
    if (expectedSize && written !== expectedSize) {
      throw new Error(`Zip entry size mismatch: ${written} bytes`)
    }
    await fs.rm(destination, { force: true })
    await fs.rename(tempPath, destination)
    return { sha256: actual, size: written }
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function extractManifestFileFromZip(zipPath, zip, file, destination, options = {}) {
  const archivePath = String(file.archivePath ?? file.path ?? '').replace(/\\/g, '/')
  const entry = zip.getEntry(archivePath)
  if (!entry || entry.isDirectory) {
    throw new Error(`File is missing from the verified pack zip: ${archivePath}.`)
  }
  return extractZipEntryToFile(zipPath, entry, destination, {
    expectedSha256: file.sha256,
    expectedSize: file.size,
    onProgress: options.onProgress,
  })
}

async function writeInstallLikeReport(kind, id, report) {
  const paths = getPaths()
  const reportPath = path.join(paths.logs, `${kind}-${id}.json`)
  await writeJson(reportPath, report)
  return { ...report, reportPath }
}

async function installZipPackArtifact(payload, profile, manifest) {
  const paths = getPaths()
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const operationId = payload.operationId
  const operationKind = payload.operationKind ?? operationStatuses.get(operationId)?.kind ?? 'install'
  const installId = nowStamp()
  const backupRoot = path.join(paths.backups, payload.profileId ?? 'ashfall', `install-${installId}`)
  const rollbackPlanPath = path.join(paths.logs, `rollback-install-${installId}.json`)
  const installed = []
  const verified = []
  const downloaded = []
  const updated = []
  const removed = []
  const skipped = []
  const failed = []
  const backedUp = []
  const runtime = { ok: true, warnings: ['Internal Minecraft runtime install skipped for Minecraft Launcher handoff mode.'] }
  const neoforge = { ok: true, version: manifest.loader?.version ?? 'unknown', skipped: true, message: 'NeoForge libraries are provided by the strict pack manifest/runtime metadata.' }

  await ensureDir(installPath)
  await ensureDir(path.join(installPath, '.echo'))
  await ensureDir(paths.logs)

  const files = manifest.files ?? []
  const reportOperation = (patch) => updateOperationStatus(operationId, { kind: operationKind, ...patch })
  const totalInstallBytes = files.reduce((total, file) => total + Number(file.size ?? 0), 0)
  let completedInstallBytes = 0
  let lastInstallProgressAt = 0
  const reportFileProgress = (index, file, written = 0, force = false) => {
    if (!operationId) return
    const now = Date.now()
    if (!force && now - lastInstallProgressAt < 250) return
    lastInstallProgressAt = now
    const expectedSize = Number(file.size ?? 0)
    const completedBytes = completedInstallBytes + Math.max(0, Math.min(Number(written ?? 0), expectedSize || Number(written ?? 0)))
    const fraction = totalInstallBytes > 0 ? completedBytes / totalInstallBytes : (index + 1) / Math.max(files.length, 1)
    reportOperation({
      phaseId: 'install',
      label: `Extracting Ashfall files (${index + 1}/${files.length})`,
      progress: 54 + 22 * Math.max(0, Math.min(1, fraction)),
      message: `${file.path} (${formatBytes(written)} / ${formatBytes(expectedSize)})`,
    })
  }

  if (payload.installRuntime === true) {
    runtime.ok = false
    runtime.warnings = []
    try {
      Object.assign(runtime, await minecraftInstallRuntime({ manifest }))
    } catch (error) {
      failed.push({ path: 'minecraft-runtime', reason: error instanceof Error ? error.message : String(error) })
    }
  }

  const previousManifestPath = path.join(installPath, '.echo', 'installed-manifest.json')
  const previousManifestState = await readInstalledProfileManifestState(installPath, payload.profileId ?? profile?.id)
  const previousManifest = previousManifestState?.manifest ?? null
  const previousManifestBackupPath = await backupFileIfExists(previousManifestPath, backupRoot, '.echo/installed-manifest.json')
  if (previousManifestBackupPath) backedUp.push({ path: '.echo/installed-manifest.json', backupPath: previousManifestBackupPath })
  const operation = previousManifestState?.valid ? 'update' : 'install'
  reportOperation({ phaseId: 'install', label: 'Checking existing Ashfall files', progress: 18 })
  const before = await verifyManifest({
    manifest,
    installPath,
    trustCacheOnly: true,
    onProgress: (progress) => {
      reportOperation({
        phaseId: 'install',
        label: `Checking existing files (${progress.checked}/${progress.total})`,
        progress: 18 + (progress.total ? (progress.checked / progress.total) * 10 : 10),
        message: progress.currentPath,
      })
    },
  })
  const beforeByPath = new Map(before.results.map((item) => [item.path, item]))
  const verificationCache = await readVerificationCache(installPath)
  let verificationCacheDirty = false
  const archiveDownloadName = manifest.artifactName ?? 'pack.zip'
  let zipArtifact = null
  const getZipArtifact = async (label = 'Downloading Ashfall archive') => {
    if (zipArtifact) return zipArtifact
    reportOperation({ phaseId: 'install', label, progress: 30, message: archiveDownloadName })
    const zipPath = await downloadZipPackArtifact(manifest)
    if (!downloaded.includes(archiveDownloadName)) downloaded.push(archiveDownloadName)
    zipArtifact = { zipPath, zip: new AdmZip(zipPath) }
    return zipArtifact
  }

  if (operation === 'install') {
    try {
      const { zipPath, zip } = await getZipArtifact('Downloading Ashfall archive')
      reportOperation({ phaseId: 'install', label: 'Reading Ashfall archive', progress: 52, message: archiveDownloadName })
      for (const [index, file] of files.entries()) {
        const destination = safeJoin(installPath, file.path)
        const current = beforeByPath.get(file.path)
        if (current?.status === 'valid') {
          verified.push(file.path)
          completedInstallBytes += Number(file.size ?? 0)
          reportFileProgress(index, file, Number(file.size ?? 0), true)
          continue
        }

        const existed = await exists(destination)
        const backupPath = await backupFileIfExists(destination, backupRoot, file.path)
        if (backupPath) backedUp.push({ path: file.path, backupPath })
        reportFileProgress(index, file, 0, true)
        let extracted
        try {
          if (file.url) {
            const cachedArtifact = await downloadVerifiedArtifact(file)
            downloaded.push(file.assetName ?? file.path)
            await ensureDir(path.dirname(destination))
            await fs.copyFile(cachedArtifact, destination)
            extracted = { sha256: file.sha256, size: Number(file.size ?? (await fs.stat(destination)).size) }
          } else {
            extracted = await extractManifestFileFromZip(zipPath, zip, file, destination, {
              onProgress: ({ written }) => reportFileProgress(index, file, written, false),
            })
          }
        } catch (error) {
          failed.push({ path: file.path, reason: error instanceof Error ? error.message : String(error) })
          continue
        }
        verificationCacheDirty = (await stageVerifiedCacheEntry(verificationCache, installPath, file.path, extracted.sha256, file.url ? 'artifact-install' : 'zip-install')) || verificationCacheDirty
        ;(existed ? updated : installed).push(file.path)
        completedInstallBytes += extracted.size
        reportFileProgress(index, file, extracted.size, true)
      }
    } catch (error) {
      failed.push({ path: manifest.artifactName ?? 'pack.zip', reason: error instanceof Error ? error.message : String(error) })
    }
  } else {
    reportOperation({ phaseId: 'install', label: 'Downloading changed Ashfall files', progress: 30 })
    for (const [index, file] of files.entries()) {
      const destination = safeJoin(installPath, file.path)
      const current = beforeByPath.get(file.path)
      if (current?.status === 'valid') {
        verified.push(file.path)
        completedInstallBytes += Number(file.size ?? 0)
        reportFileProgress(index, file, Number(file.size ?? 0), true)
        continue
      }

      const existed = await exists(destination)
      const backupPath = await backupFileIfExists(destination, backupRoot, file.path)
      if (backupPath) backedUp.push({ path: file.path, backupPath })
      reportFileProgress(index, file, 0, true)
      try {
        if (file.url) {
          const cachedArtifact = await downloadVerifiedArtifact(file)
          downloaded.push(file.assetName ?? file.path)
          await ensureDir(path.dirname(destination))
          await fs.copyFile(cachedArtifact, destination)
          verificationCacheDirty = (await stageVerifiedCacheEntry(verificationCache, installPath, file.path, file.sha256, 'artifact-update')) || verificationCacheDirty
        } else {
          const { zipPath, zip } = await getZipArtifact('Downloading Ashfall archive fallback')
          const extracted = await extractManifestFileFromZip(zipPath, zip, file, destination, {
            onProgress: ({ written }) => reportFileProgress(index, file, written, false),
          })
          verificationCacheDirty = (await stageVerifiedCacheEntry(verificationCache, installPath, file.path, extracted.sha256, 'zip-update')) || verificationCacheDirty
        }
        ;(existed ? updated : installed).push(file.path)
        completedInstallBytes += Number(file.size ?? 0)
        reportFileProgress(index, file, Number(file.size ?? 0), true)
      } catch (error) {
        failed.push({ path: file.path, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  if (operation === 'update') {
    const nextPaths = new Set((manifest.files ?? []).map((file) => file.path.replace(/\\/g, '/').toLowerCase()))
    for (const previousFile of previousManifest.files ?? []) {
      if (!previousFile?.path || nextPaths.has(previousFile.path.replace(/\\/g, '/').toLowerCase())) continue
      if (!isSafeRelativePath(previousFile.path)) {
        skipped.push({ path: String(previousFile.path), reason: 'Previous manifest path is unsafe and was not removed.' })
        continue
      }
      const destination = safeJoin(installPath, previousFile.path)
      if (!(await exists(destination))) continue
      const backupPath = await backupFileIfExists(destination, backupRoot, previousFile.path)
      if (backupPath) backedUp.push({ path: previousFile.path, backupPath })
      await fs.rm(destination, { force: true })
      removed.push(previousFile.path)
    }
  }

  if (verificationCacheDirty) await writeVerificationCache(installPath, verificationCache)
  await writeJson(previousManifestPath, manifest)
  reportOperation({ phaseId: 'install', label: 'Verifying Ashfall install', progress: 78 })
  const after = await verifyManifest({
    manifest,
    installPath,
    onProgress: (progress) => {
      reportOperation({
        phaseId: 'install',
        label: `Verifying Ashfall files (${progress.checked}/${progress.total})`,
        progress: 78 + (progress.total ? (progress.checked / progress.total) * 10 : 10),
        message: progress.currentPath,
      })
    },
  })
  const ok = after.missing.length === 0 && after.corrupt.length === 0 && failed.length === 0 && runtime.ok !== false
  const report = {
    ok,
    installId,
    operation,
    profileId: payload.profileId ?? profile?.id ?? 'ashfall',
    installPath,
    generatedAt: isoNow(),
    downloaded,
    updated,
    removed,
    installed,
    verified,
    skipped,
    failed,
    backupRoot,
    rollbackPlanPath,
    neoforge,
    runtime,
    before,
    after,
  }
  await writeJson(rollbackPlanPath, {
    installId,
    operation,
    profileId: payload.profileId ?? profile?.id ?? 'ashfall',
    installPath,
    backedUp,
    created: installed,
    removed,
    removedDuringOperation: removed,
    createdAt: isoNow(),
  })
  if (profile) {
    await profileSave({
      ...profile,
      installPath,
      version: payload.version ?? manifest.version ?? profile.version,
      minecraft: minecraftVersionFromManifest(manifest),
      neoforge: manifest.loader?.version ?? profile.neoforge,
      ramGb: manifest.ramMb ? Math.max(2, Math.round(manifest.ramMb / 1024)) : profile.ramGb,
      status: ok ? 'healthy' : 'warning',
      manifestPath: path.join(installPath, '.echo', 'installed-manifest.json'),
    })
  }
  await appendLauncherLog(ok ? 'INFO' : 'WARN', `Hybrid ${operation} ${installId} completed. Installed ${installed.length}, updated ${updated.length}, removed ${removed.length}, verified ${verified.length}, failed ${failed.length}.`)
  return writeInstallLikeReport('install', installId, report)
}

async function repairZipPackArtifact(payload, profile, manifest) {
  const paths = getPaths()
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const repairId = nowStamp()
  const repairBackupRoot = path.join(paths.backups, payload.profileId ?? 'ashfall', `repair-${repairId}`)
  const rollbackPlanPath = path.join(paths.logs, `rollback-repair-${repairId}.json`)
  const before = await verifyManifest({ manifest, installPath })
  const repairablePaths = new Set([...before.missing, ...before.corrupt])
  const repaired = []
  const skipped = []
  const warnings = []
  const backedUp = []
  let runtime = { ok: true, warnings: ['Internal Minecraft runtime repair skipped for Minecraft Launcher handoff mode.'] }

  await ensureDir(installPath)
  await ensureDir(path.join(installPath, '.echo'))
  await ensureDir(paths.logs)
  let zipArtifact = null
  const getZipArtifact = async () => {
    if (zipArtifact) return zipArtifact
    const zipPath = await downloadZipPackArtifact(manifest)
    zipArtifact = { zipPath, zip: new AdmZip(zipPath) }
    return zipArtifact
  }

  if (payload.installRuntime === true) {
    try {
      runtime = await minecraftRepairRuntime({ manifest })
    } catch (error) {
      runtime = { ok: false, warnings: [error instanceof Error ? error.message : String(error)] }
      warnings.push(`Minecraft runtime repair failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const file of manifest.files ?? []) {
    if (!repairablePaths.has(file.path)) continue
    const destination = safeJoin(installPath, file.path)
    try {
      const backupPath = await backupFileIfExists(destination, repairBackupRoot, file.path)
      if (backupPath) backedUp.push({ path: file.path, backupPath })
      if (file.url) {
        const cachedArtifact = await downloadVerifiedArtifact(file)
        await ensureDir(path.dirname(destination))
        await fs.copyFile(cachedArtifact, destination)
      } else {
        const { zipPath, zip } = await getZipArtifact()
        await extractManifestFileFromZip(zipPath, zip, file, destination)
      }
      repaired.push(file.path)
    } catch (error) {
      skipped.push({ path: file.path, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  await writeJson(path.join(installPath, '.echo', 'installed-manifest.json'), manifest)
  const after = await verifyManifest({ manifest, installPath })
  const ok = after.missing.length === 0 && after.corrupt.length === 0 && warnings.length === 0
  const report = {
    ok,
    repairId,
    profileId: payload.profileId ?? profile?.id ?? 'ashfall',
    installPath,
    generatedAt: isoNow(),
    repaired,
    skipped,
    warnings,
    backupRoot: repairBackupRoot,
    rollbackPlanPath,
    neoforge: { ok: true, version: manifest.loader?.version ?? 'unknown', skipped: true, message: 'NeoForge libraries are provided by the strict pack manifest/runtime metadata.' },
    runtime,
    before,
    after,
  }
  await writeJson(rollbackPlanPath, { repairId, installPath, backedUp, createdAt: isoNow() })
  await appendLauncherLog(ok ? 'INFO' : 'WARN', `Zip repair ${repairId} completed. Repaired ${repaired.length}, skipped ${skipped.length}.`)
  return writeInstallLikeReport('repair', repairId, report)
}

async function repairRun(payload = {}) {
  const paths = getPaths()
  const profiles = await profileList()
  const profile = selectLauncherProfile(profiles, payload, true)
  const manifest = await resolveInstallManifest(payload, profile)
  if (manifest.artifactMode === 'zip') {
    return repairZipPackArtifact(payload, profile, manifest)
  }
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const repairId = nowStamp()
  const repairBackupRoot = path.join(paths.backups, payload.profileId ?? 'ashfall', `repair-${repairId}`)
  const rollbackPlanPath = path.join(paths.logs, `rollback-repair-${repairId}.json`)
  const before = await verifyManifest({ manifest, installPath })
  const repaired = []
  const skipped = []
  const warnings = []
  const backedUp = []
  const neoforge = await neoforgeEnsure({ manifest, installPath, profileId: payload.profileId })
  if (!neoforge.ok) warnings.push(neoforge.message)

  await ensureDir(installPath)
  await ensureDir(path.join(installPath, 'mods'))
  await ensureDir(path.join(installPath, 'config'))
  await ensureDir(paths.logs)

  const repairablePaths = new Set([...before.missing, ...before.corrupt])
  for (const file of manifest.files ?? []) {
    if (!repairablePaths.has(file.path)) continue
    const destination = safeJoin(installPath, file.path)
    if (!file.url) {
      skipped.push({
        path: file.path,
        reason: 'No download URL is configured in the manifest.',
      })
      continue
    }

    try {
      const backupPath = await backupFileIfExists(destination, repairBackupRoot, file.path)
      if (backupPath) backedUp.push({ path: file.path, backupPath })
      const cachedArtifact = await downloadVerifiedArtifact(file)
      await ensureDir(path.dirname(destination))
      await fs.copyFile(cachedArtifact, destination)
      repaired.push(file.path)
    } catch (error) {
      skipped.push({
        path: file.path,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (payload.backupConfigs !== false) {
    const configDir = path.join(installPath, 'config')
    if (await exists(configDir)) {
      const backupPath = path.join(repairBackupRoot, 'config')
      await copyRecursive(configDir, backupPath)
      warnings.push(`Config backup created at ${backupPath}`)
    }
  }

  const after = await verifyManifest({ manifest, installPath })
  const ok = after.missing.length === 0 && after.corrupt.length === 0
  const report = {
    ok,
    repairId,
    profileId: payload.profileId ?? profile?.id ?? 'ashfall',
    installPath,
    generatedAt: new Date().toISOString(),
    repaired,
    skipped,
    warnings,
    backupRoot: repairBackupRoot,
    rollbackPlanPath,
    neoforge,
    before,
    after,
  }
  await writeJson(rollbackPlanPath, {
    repairId,
    installPath,
    backedUp,
    createdAt: new Date().toISOString(),
  })
  const reportPath = path.join(paths.logs, `repair-${repairId}.json`)
  await writeJson(reportPath, report)

  const launcherLogPath = path.join(paths.logs, 'latest.log')
  await fs.appendFile(
    launcherLogPath,
    [
      `[${new Date().toISOString()}] ${ok ? 'INFO' : 'WARN'} Repair ${repairId} completed.`,
      `[${new Date().toISOString()}] INFO Repaired: ${repaired.length}; skipped: ${skipped.length}; remaining missing: ${after.missing.length}; remaining corrupt: ${after.corrupt.length}.`,
    ].join(os.EOL) + os.EOL,
    'utf8',
  )

  return { ...report, reportPath }
}

async function installRun(payload = {}) {
  if (payload.operationId && !operationStatuses.has(payload.operationId)) {
    updateOperationStatus(payload.operationId, {
      kind: payload.operationKind ?? 'install',
      status: 'running',
      phaseId: 'release',
      label: 'Resolving strict release assets',
      progress: 6,
      message: '',
    })
  }
  const paths = getPaths()
  const profiles = await profileList()
  const profile = selectLauncherProfile(profiles, payload, true)
  if (!payload.manifest && !payload.manifestPath) {
    const entry = await resolveReleaseEntry({ ...payload, refresh: payload.refresh ?? true }, profile)
    if (entry.trust !== 'verified-metadata') {
      throw new Error(`${entry.tagName} is missing trusted manifest metadata. Beta installs require ${RELEASE_METADATA_ASSET}, a hashed pack manifest, and the metadata-named compressed pack archive.`)
    }
  }
  const manifest = await resolveInstallManifest(payload, profile)
  if (manifest.artifactMode === 'zip') {
    const result = await installZipPackArtifact(payload, profile, manifest)
    if (payload.operationId && (payload.operationKind ?? 'install') === 'install') {
      updateOperationStatus(payload.operationId, {
        kind: 'install',
        status: result.ok ? 'completed' : 'failed',
        phaseId: 'install',
        label: result.ok ? 'Install complete' : 'Install needs attention',
        progress: result.ok ? 100 : 96,
        message: result.ok
          ? `Installed ${result.installed.length} and verified ${result.verified.length} files.`
          : `${result.failed.length + result.skipped.length + result.after.missing.length + result.after.corrupt.length} files still need attention.`,
      })
    }
    return result
  }
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const installId = nowStamp()
  const backupRoot = path.join(paths.backups, payload.profileId ?? 'ashfall', `install-${installId}`)
  const rollbackPlanPath = path.join(paths.logs, `rollback-install-${installId}.json`)
  const installed = []
  const verified = []
  const skipped = []
  const failed = []
  const backedUp = []
  const neoforge = await neoforgeEnsure({ manifest, installPath, profileId: payload.profileId })

  await ensureDir(installPath)
  await ensureDir(path.join(installPath, '.echo'))
  await ensureDir(paths.logs)
  const previousManifestPath = path.join(installPath, '.echo', 'installed-manifest.json')
  const previousManifestBackupPath = await backupFileIfExists(previousManifestPath, backupRoot, '.echo/installed-manifest.json')
  if (previousManifestBackupPath) backedUp.push({ path: '.echo/installed-manifest.json', backupPath: previousManifestBackupPath })
  const operation = await detectInstallOperation(installPath, payload.profileId ?? profile?.id)

  const installFiles = manifest.files ?? []
  const operationId = payload.operationId
  const operationKind = payload.operationKind ?? operationStatuses.get(operationId)?.kind ?? 'install'
  const reportOperation = (patch) => updateOperationStatus(operationId, { kind: operationKind, ...patch })
  reportOperation({ phaseId: 'install', label: 'Checking existing Ashfall files', progress: 18 })
  const before = await verifyManifest({
    manifest,
    installPath,
    onProgress: (progress) => {
      reportOperation({
        phaseId: 'install',
        label: `Checking existing files (${progress.checked}/${progress.total})`,
        progress: 18 + (progress.total ? (progress.checked / progress.total) * 10 : 10),
        message: progress.currentPath,
      })
    },
  })
  const beforeByPath = new Map(before.results.map((item) => [item.path, item]))
  const verificationCache = await readVerificationCache(installPath)
  let verificationCacheDirty = false
  let lastInstallProgressAt = 0

  for (const [index, file] of installFiles.entries()) {
    const destination = safeJoin(installPath, file.path)
    const current = beforeByPath.get(file.path)
    if (current?.status === 'valid') {
      verified.push(file.path)
      continue
    }

    if (!file.url) {
      skipped.push({
        path: file.path,
        reason: 'No artifact URL is configured in the manifest.',
      })
      continue
    }

    try {
      if (current?.status === 'corrupt') {
        const backupPath = await backupFileIfExists(destination, backupRoot, file.path)
        if (backupPath) backedUp.push({ path: file.path, backupPath })
      }
      const cachedArtifact = await downloadVerifiedArtifact(file)
      await ensureDir(path.dirname(destination))
      await fs.copyFile(cachedArtifact, destination)
      verificationCacheDirty = (await stageVerifiedCacheEntry(verificationCache, installPath, file.path, file.sha256, 'artifact-install')) || verificationCacheDirty
      installed.push(file.path)
      const now = Date.now()
      if (operationId && (index + 1 === installFiles.length || now - lastInstallProgressAt > 250)) {
        lastInstallProgressAt = now
        reportOperation({
          phaseId: 'install',
          label: `Installing Ashfall files (${index + 1}/${installFiles.length})`,
          progress: 32 + (installFiles.length ? ((index + 1) / installFiles.length) * 44 : 44),
          message: file.path,
        })
      }
    } catch (error) {
      failed.push({
        path: file.path,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (verificationCacheDirty) await writeVerificationCache(installPath, verificationCache)
  await writeJson(previousManifestPath, manifest)
  reportOperation({ phaseId: 'install', label: 'Verifying Ashfall install', progress: 78 })
  const after = await verifyManifest({
    manifest,
    installPath,
    onProgress: (progress) => {
      reportOperation({
        phaseId: 'install',
        label: `Verifying Ashfall files (${progress.checked}/${progress.total})`,
        progress: 78 + (progress.total ? (progress.checked / progress.total) * 10 : 10),
        message: progress.currentPath,
      })
    },
  })
  const ok = after.missing.length === 0 && after.corrupt.length === 0 && failed.length === 0
  const report = {
    ok,
    installId,
    operation,
    profileId: payload.profileId ?? profile?.id ?? 'ashfall',
    installPath,
    generatedAt: new Date().toISOString(),
    installed,
    verified,
    skipped,
    failed,
    backupRoot,
    rollbackPlanPath,
    neoforge,
    before,
    after,
  }
  const reportPath = path.join(paths.logs, `install-${installId}.json`)
  await writeJson(rollbackPlanPath, {
    installId,
    operation,
    profileId: payload.profileId ?? profile?.id ?? 'ashfall',
    installPath,
    backedUp,
    created: installed,
    createdAt: new Date().toISOString(),
  })
  await writeJson(reportPath, report)

  if (profile) {
    await profileSave({
      ...profile,
      installPath,
      version: payload.version ?? manifest.version ?? profile.version,
      minecraft: manifest.minecraft ?? profile.minecraft,
      neoforge: manifest.loader?.version ?? profile.neoforge,
      status: ok ? 'healthy' : 'warning',
      manifestPath: path.join(installPath, '.echo', 'installed-manifest.json'),
    })
  }

  const launcherLogPath = path.join(paths.logs, 'latest.log')
  await fs.appendFile(
    launcherLogPath,
    [
      `[${new Date().toISOString()}] ${ok ? 'INFO' : 'WARN'} Install/update ${installId} completed.`,
      `[${new Date().toISOString()}] INFO Installed: ${installed.length}; verified: ${verified.length}; skipped: ${skipped.length}; failed: ${failed.length}.`,
    ].join(os.EOL) + os.EOL,
    'utf8',
  )

  const result = { ...report, reportPath }
  if (payload.operationId && operationKind === 'install') {
    updateOperationStatus(payload.operationId, {
      kind: 'install',
      status: result.ok ? 'completed' : 'failed',
      phaseId: 'install',
      label: result.ok ? 'Install complete' : 'Install needs attention',
      progress: result.ok ? 100 : 96,
      message: result.ok
        ? `Installed ${result.installed.length} and verified ${result.verified.length} files.`
        : `${result.failed.length + result.skipped.length + result.after.missing.length + result.after.corrupt.length} files still need attention.`,
    })
  }

  return result
}

async function diagnosticExport(payload = {}) {
  const paths = getPaths()
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === payload.profileId) ?? profiles[0]
  const manifest = payload.manifest ?? (await manifestLoad({ ...payload, pack: payload.pack ?? profile?.id }))
  const installPath = normalizePath(payload.installPath ?? profile?.installPath ?? manifest.localInstallRoot)
  const [verification, java, logs] = await Promise.all([
    verifyManifest({ manifest, installPath }),
    javaDetect(),
    logsRead({ installPath }),
  ])
  const report = {
    generatedAt: new Date().toISOString(),
    appProtocolVersion: APP_PROTOCOL_VERSION,
    platform: {
      os: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
    },
    profile,
    manifest,
    installPath,
    verification,
    java,
    logs: {
      files: logs.files,
      latestExcerpt: logs.latest.slice(-8000),
    },
  }
  const reportPath = path.join(paths.logs, `diagnostic-${nowStamp()}.json`)
  await writeJson(reportPath, report)
  return {
    ok: true,
    reportPath,
    summary: {
      missing: verification.missing.length,
      corrupt: verification.corrupt.length,
      javaRuntimes: java.runtimes.length,
      logFiles: logs.files.length,
    },
  }
}

async function worldScan(payload = {}) {
  if (!payload.worldPath) throw new Error('World path is required.')
  const worldPath = normalizePath(payload.worldPath)
  if (!(await exists(worldPath))) throw new Error('Selected world path does not exist.')
  const markerCandidates = [
    path.join(worldPath, '.echo', 'worldgen.json'),
    path.join(worldPath, 'data', 'ashfall_worldgen.json'),
    path.join(worldPath, 'serverconfig', 'ashfall-worldgen.toml'),
    path.join(worldPath, 'datapacks', 'ashfall-worldgen'),
  ]
  const markerFiles = []
  let currentWorldgenVersion = 'unknown'
  for (const marker of markerCandidates) {
    if (!(await exists(marker))) continue
    markerFiles.push(marker)
    if (marker.endsWith('.json')) {
      const markerJson = await readJson(marker, null)
      if (markerJson?.version) currentWorldgenVersion = markerJson.version
    } else {
      const text = await fs.readFile(marker, 'utf8').catch(() => '')
      const match = text.match(/worldgen[_-]?version\s*=\s*["']?([^"'\r\n]+)/i)
      if (match) currentWorldgenVersion = match[1].trim()
    }
  }
  const profiles = await profileList()
  const profile = profiles.find((item) => item.id === payload.profileId) ?? profiles[0]
  const manifest = await manifestLoad({ manifestPath: profile?.manifestPath, pack: profile?.id })
  const profileWorldgenVersion = manifest.version ?? profile?.version ?? 'unknown'
  const warnings = []
  const recommendations = []
  if (markerFiles.length === 0) {
    warnings.push('No Ashfall worldgen marker was found in this world.')
    recommendations.push('Back up the world before launching with updated Ashfall worldgen data.')
  } else if (currentWorldgenVersion !== 'unknown' && currentWorldgenVersion !== profileWorldgenVersion) {
    warnings.push(`Worldgen marker ${currentWorldgenVersion} differs from selected profile ${profileWorldgenVersion}.`)
    recommendations.push('Generate new chunks after updating for full WeatherCore resource distribution.')
  }
  if (await exists(path.join(worldPath, 'region'))) {
    recommendations.push('Existing region files are present; keep a backup before changing major Ashfall versions.')
  }
  return {
    ok: warnings.length === 0,
    worldPath,
    scannedAt: isoNow(),
    currentWorldgenVersion,
    profileWorldgenVersion,
    warnings,
    recommendations,
    markerFiles,
  }
}

function commonImportRoots() {
  return commonImportRootsForPlatform({
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
  })
}

async function candidateFromPath(targetPath, managedPaths) {
  const detectedBy = []
  const modsDir = path.join(targetPath, 'mods')
  const echoDir = path.join(targetPath, '.echo')
  const manifestPath = path.join(echoDir, 'installed-manifest.json')
  let manifest = null
  let moduleCount = 0

  if (await exists(manifestPath)) {
    try {
      manifest = validatePackManifest(await readJson(manifestPath, null), { allowLocalPlaceholders: true })
      detectedBy.push('.echo manifest')
      moduleCount = manifest.modules?.length ?? 0
    } catch {
      detectedBy.push('.echo metadata')
    }
  }

  if (await exists(modsDir)) {
    const modFiles = (await fs.readdir(modsDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.jar$/i.test(entry.name))
      .map((entry) => entry.name)
    const echoMods = modFiles.filter((name) => /echo|ashfall/i.test(name))
    if (echoMods.length > 0) detectedBy.push(`${echoMods.length} ECHO/Ashfall mod jars`)
    moduleCount = Math.max(moduleCount, echoMods.length)
  }

  for (const configFile of ['manifest.json', 'minecraftinstance.json', 'modrinth.index.json']) {
    const configPath = path.join(targetPath, configFile)
    if (await exists(configPath)) {
      const raw = await fs.readFile(configPath, 'utf8').catch(() => '')
      if (/ashfall|echo/i.test(raw)) detectedBy.push(configFile)
    }
  }

  if (detectedBy.length === 0) return null
  const name = path.basename(targetPath) || 'Imported Ashfall Instance'
  return {
    id: crypto.createHash('sha1').update(targetPath).digest('hex').slice(0, 12),
    name,
    path: targetPath,
    detectedBy: [...new Set(detectedBy)],
    moduleCount,
    manifestPath: manifest ? manifestPath : undefined,
    version: manifest?.version,
    channel: manifest?.channel,
    alreadyManaged: managedPaths.has(normalizePath(targetPath).toLowerCase()),
  }
}

async function instanceScanImports(payload = {}) {
  const profiles = await profileList()
  const managedPaths = new Set(profiles.map((profile) => normalizePath(profile.installPath).toLowerCase()))
  const roots = payload.rootPath ? [normalizePath(payload.rootPath)] : commonImportRoots()
  const candidates = []
  const seen = new Set()

  for (const root of roots) {
    if (!(await exists(root))) continue
    const pathsToCheck = [root]
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isDirectory()) pathsToCheck.push(path.join(root, entry.name))
    }
    for (const targetPath of pathsToCheck) {
      const normalized = normalizePath(targetPath)
      if (seen.has(normalized.toLowerCase())) continue
      seen.add(normalized.toLowerCase())
      const candidate = await candidateFromPath(normalized, managedPaths)
      if (candidate) candidates.push(candidate)
    }
  }

  return candidates.sort((a, b) => Number(a.alreadyManaged) - Number(b.alreadyManaged) || a.name.localeCompare(b.name))
}

async function instanceImport(payload = {}) {
  if (!payload.path) throw new Error('Import path is required.')
  const targetPath = normalizePath(payload.path)
  if (!(await exists(targetPath))) throw new Error('Import path does not exist.')
  const candidates = await instanceScanImports({ rootPath: targetPath })
  const candidate = candidates.find((item) => normalizePath(item.path) === targetPath) ?? (await candidateFromPath(targetPath, new Set()))
  if (!candidate) throw new Error('The selected folder does not look like an Ashfall/ECHO install.')

  const profiles = await profileList()
  const existing = profiles.find((profile) => normalizePath(profile.installPath).toLowerCase() === targetPath.toLowerCase())
  if (existing) return { ok: true, profile: existing, candidate: { ...candidate, alreadyManaged: true } }

  const profile = {
    id: `imported-${candidate.id}`,
    name: payload.name ?? candidate.name,
    channel: CHANNELS.has(candidate.channel) ? candidate.channel : CANONICAL_CHANNEL,
    channelLabel: 'Imported Install',
    version: candidate.version ?? 'unknown',
    minecraft: 'unknown',
    neoforge: 'unknown',
    ramGb: 8,
    moduleCount: candidate.moduleCount,
    lastPlayed: 'Imported',
    playtime: '0h 00m',
    status: 'warning',
    installPath: targetPath,
    manifestPath: candidate.manifestPath,
    enabledAddons: [],
  }
  const saved = await profileSave(profile)
  return { ok: true, profile: saved, candidate }
}

async function selectDirectory(payload = {}, event) {
  const window = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(window, {
    title: payload.title ?? 'Select directory',
    defaultPath: payload.defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  })
  return {
    canceled: result.canceled,
    path: result.filePaths[0] ?? null,
  }
}

async function selectFile(payload = {}, event) {
  const window = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(window, {
    title: payload.title ?? 'Select file',
    defaultPath: payload.defaultPath,
    filters: payload.filters ?? [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  return {
    canceled: result.canceled,
    path: result.filePaths[0] ?? null,
  }
}

async function openPath(payload = {}) {
  if (!payload.path) throw new Error('Path is required.')
  await shell.openPath(normalizePath(payload.path))
  return { ok: true }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function startupRecoveryHtml(reason) {
  const paths = getPaths()
  const logsPath = path.join(paths.logs, 'latest.log')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ECHO Launcher Startup Recovery</title>
</head>
<body style="margin:0;background:#020711;color:#e5eef7;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">
  <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;background:radial-gradient(circle at top right,rgba(37,232,255,.14),transparent 34%),#020711;">
    <section style="max-width:760px;border:1px solid rgba(125,211,252,.25);background:rgba(15,23,42,.86);border-radius:16px;padding:28px;box-shadow:0 20px 80px rgba(0,0,0,.45);">
      <p style="margin:0 0 10px;color:#fbbf24;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">ECHO Launcher Startup Recovery</p>
      <h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;">The launcher UI failed to render.</h1>
      <p style="margin:0 0 18px;color:#cbd5e1;line-height:1.6;">The desktop shell is running, but the renderer did not mount correctly. This screen replaces the black window and records the failure in the launcher log.</p>
      <div style="border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.08);border-radius:12px;padding:14px;margin-bottom:14px;color:#fde68a;line-height:1.5;">
        ${escapeHtml(reason)}
      </div>
      <p style="margin:0;color:#94a3b8;line-height:1.6;">Log file: <code style="color:#e0f2fe;">${escapeHtml(logsPath)}</code></p>
    </section>
  </main>
</body>
</html>`
}

function packOsIdForPackState(packId) {
  const aliases = {
    'arcana-division-native-edition': 'arcana_division',
    'arcana-division-neoforge-edition': 'arcana_division',
    'arcana-division-standalone-edition': 'arcana_division',
  }
  return aliases[packId] ?? packId
}

function selectedPackOsState(packOs, profileId) {
  const packOsId = packOsIdForPackState(profileId)
  return (packOs?.packs ?? []).find((pack) => pack.packId === profileId || pack.packId === packOsId) ?? null
}

function packRouteForProfile(profile) {
  const runtimeMode = profile?.runtimeMode ?? (String(profile?.id ?? '').endsWith('-standalone-edition') ? 'native-runtime' : defaultMinecraftRuntimeMode(profile))
  if (runtimeMode === 'native-runtime') {
    return {
      mode: runtimeMode,
      label: 'ECHO Standalone Engine',
      shortLabel: 'Standalone',
      detail: 'Runs through the standalone ECHO runtime.',
    }
  }
  if (runtimeMode === 'native-loader-minecraft') {
    return {
      mode: runtimeMode,
      label: 'Minecraft + Native Loader',
      shortLabel: 'Native Loader',
      detail: 'Uses the official Minecraft Launcher with ECHO Native Loader metadata.',
    }
  }
  return {
    mode: 'neoforge-minecraft',
    label: 'Minecraft + NeoForge',
    shortLabel: 'NeoForge',
    detail: 'Uses the official Minecraft Launcher with the selected NeoForge profile.',
  }
}

function latestCatalogReleaseForProfile(index, profile) {
  if (!index?.releases?.length || !profile) return null
  return selectReleaseEntry(index, profile.channel ?? defaultChannelForPack(profile.id), undefined, profile.id)
}

function packCatalogMetadata(index, profile) {
  const pack = (index?.packs ?? []).find((item) => item.id === profile?.id)
  const release = latestCatalogReleaseForProfile(index, profile)
  const available = Boolean(release?.trust === 'verified-metadata' && release.manifestSha256)
  const rawCatalogStatus = String(pack?.catalogStatus ?? (release ? 'approved' : 'missing')).toLowerCase()
  const approvedWithoutInstallableRelease = rawCatalogStatus === 'approved' && !available
  const catalogStatus = approvedWithoutInstallableRelease ? 'missing' : rawCatalogStatus
  const diagnostic = approvedWithoutInstallableRelease
    ? 'Catalog entry is approved-looking, but no approved release is installable yet.'
    : pack?.diagnostic ?? null
  return {
    pack,
    release,
    available,
    status: catalogStatus,
    diagnostic,
  }
}

function packStateBlocker(id, title, detail, status = 'warning', action = 'diagnostics') {
  return { id, title, detail, status, action }
}

function packStateAction(kind, label, options = {}) {
  return {
    kind,
    label,
    enabled: options.enabled ?? !['unavailable'].includes(kind),
    variant: options.variant ?? (kind === 'play' ? 'primary' : kind === 'repair' || kind === 'diagnostics' ? 'warning' : kind === 'unavailable' ? 'ghost' : 'secondary'),
    reason: options.reason ?? '',
  }
}

async function appPackState(payload = {}) {
  await seedDesktopData()
  const settings = await readSettings()
  const profiles = await profileList()
  const profile = selectLauncherProfile(profiles, payload, true)
  if (!profile) throw new Error('No launcher profile is available.')

  const route = packRouteForProfile(profile)
  const installPath = profile.installPath ? normalizePath(profile.installPath) : undefined
  const installedState = installPath ? await readInstalledProfileManifestState(installPath, profile.id) : null
  const localManifestStatus = installedState?.valid ? 'valid' : installedState?.code === 'missing' || !installedState ? 'missing' : 'invalid'
  const localManifest = {
    status: localManifestStatus,
    valid: installedState?.valid === true,
    code: installedState?.code ?? 'missing',
    message: installedState?.message ?? 'No installed manifest was found for this pack.',
    manifestPath: installedState?.valid ? installedState.manifestPath : undefined,
    invalidManifestPath: installedState && !installedState.valid && installedState.code !== 'missing' ? installedState.manifestPath : undefined,
    pack: installedState?.pack,
    version: installedState?.manifest?.version,
  }

  let catalog = {
    configured: true,
    ok: false,
    source: catalogReleaseSource(settings).channelUrl,
    releases: 0,
    latestVersion: undefined,
    fetchedAt: undefined,
    status: 'missing',
    diagnostic: null,
    release: null,
    warnings: [],
  }
  let release = null
  try {
    const index = await releaseList({ refresh: false })
    const metadata = packCatalogMetadata(index, profile)
    release = metadata.release
    catalog = {
      configured: true,
      ok: metadata.available,
      source: index.source.channelUrl,
      releases: index.acceptedCount ?? index.releases.length,
      latestVersion: release?.version,
      fetchedAt: index.fetchedAt,
      status: metadata.status,
      diagnostic: metadata.diagnostic,
      release,
      warnings: metadata.available ? [] : [metadata.diagnostic ?? `${profile.name} has no approved installable Catalog release.`],
    }
  } catch (error) {
    catalog = {
      ...catalog,
      warnings: [error instanceof Error ? error.message : String(error)],
    }
  }

  let verification = null
  if (installedState?.valid) {
    try {
      verification = await verifyManifest({ manifest: installedState.manifest, installPath })
    } catch (error) {
      verification = {
        installPath,
        scanned: 0,
        missing: [],
        corrupt: [],
        valid: [],
        results: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const packOs = await readPackOsStateForSettings(settings).catch((error) =>
    unknownPackOsState({
      generatedAt: isoNow(),
      selectedPackId: profile.id,
      warnings: [error instanceof Error ? error.message : String(error)],
    }),
  )
  const selectedPackOs = selectedPackOsState(packOs, profile.id)
  const packOsReasons = [
    ...(selectedPackOs?.blockingReasons ?? []),
    ...(selectedPackOs?.warnings ?? []),
    ...(packOs?.warnings ?? []),
  ].filter(Boolean)
  const packOsBlocked = Boolean(selectedPackOs && BLOCKING_UI_STATES.has(selectedPackOs.uiState))

  let minecraftLauncher = { ok: route.mode === 'native-runtime', warnings: [] }
  if (MINECRAFT_RUNTIME_MODES.has(route.mode)) {
    if (installedState?.valid) {
      try {
        minecraftLauncher = await minecraftLauncherProfileStatus({
          profileId: profile.id,
          installPath,
          manifest: installedState.manifest,
          runtimeMode: route.mode,
        })
      } catch (error) {
        minecraftLauncher = { ok: false, warnings: [error instanceof Error ? error.message : String(error)] }
      }
    } else {
      minecraftLauncher = {
        ok: false,
        warnings: ['Install a valid pack manifest before Minecraft Launcher handoff can be checked.'],
      }
    }
  }

  const blockers = []
  if (localManifest.status === 'invalid') {
    blockers.push(packStateBlocker('invalidLocalManifest', 'Installed manifest is not usable', localManifest.message, 'critical', catalog.ok ? 'install' : 'diagnostics'))
  }
  if (localManifest.status === 'missing') {
    blockers.push(packStateBlocker('missingInstall', `${profile.name} is not installed`, catalog.ok ? 'Install the approved Catalog release.' : 'No local install manifest exists for this pack.', 'missing', catalog.ok ? 'install' : 'diagnostics'))
  }
  if (!catalog.ok && localManifest.status !== 'valid') {
    blockers.push(packStateBlocker('missingCatalogRelease', 'No approved install release', catalog.warnings[0] ?? `${profile.name} cannot be installed until the Catalog has a verified release.`, 'warning', 'diagnostics'))
  }
  if (verification?.error) {
    blockers.push(packStateBlocker('verificationError', 'File verification failed', verification.error, 'critical', 'diagnostics'))
  } else if ((verification?.missing?.length ?? 0) > 0 || (verification?.corrupt?.length ?? 0) > 0) {
    blockers.push(packStateBlocker('fileVerification', 'Installed files need repair', `${verification.missing.length} missing and ${verification.corrupt.length} corrupt file${verification.missing.length + verification.corrupt.length === 1 ? '' : 's'} found.`, 'warning', 'repair'))
  }
  if (packOsBlocked) {
    blockers.push(packStateBlocker('packOsBlocked', 'PackOS blocks launch', packOsReasons[0] ?? `${profile.name} is blocked by PackOS policy.`, 'critical', 'diagnostics'))
  }
  if (localManifest.status === 'valid' && !minecraftLauncher.ok) {
    blockers.push(packStateBlocker('launchRoute', 'Launch route needs attention', (minecraftLauncher.warnings ?? [])[0] ?? 'Minecraft Launcher handoff is not ready.', 'warning', 'diagnostics'))
  }

  const installed = localManifest.status === 'valid'
  const needsFileRepair = Boolean((verification?.missing?.length ?? 0) > 0 || (verification?.corrupt?.length ?? 0) > 0)
  const currentVersion = localManifest.version ?? profile.version
  const currentVersionParts = currentVersion ? versionParts(currentVersion) : null
  const needsUpdate = Boolean(
    installed &&
      release?.version &&
      (currentVersionParts
        ? isNewerPackVersion(release.version, currentVersion)
        : currentVersion !== release.version),
  )
  let primaryAction
  if (localManifest.status === 'invalid') {
    primaryAction = catalog.ok
      ? packStateAction('install', `Reinstall ${profile.name}`, { variant: 'primary', reason: localManifest.message })
      : packStateAction('diagnostics', 'Open Diagnostics', { reason: localManifest.message })
  } else if (!installed) {
    primaryAction = catalog.ok
      ? packStateAction('install', `Install ${profile.name}`, { variant: 'primary' })
      : packStateAction('unavailable', 'Unavailable', { enabled: false, reason: catalog.warnings[0] ?? 'No approved release is available.' })
  } else if (needsFileRepair) {
    primaryAction = packStateAction('repair', `Repair ${profile.name}`, { reason: 'Missing or corrupt files can be restored from this pack manifest.' })
  } else if (needsUpdate) {
    primaryAction = packStateAction('update', `Update ${profile.name}`, { variant: 'primary', reason: `Approved ${release.version} is available.` })
  } else if (packOsBlocked || !minecraftLauncher.ok) {
    primaryAction = packStateAction('diagnostics', 'Open Diagnostics', { reason: blockers[0]?.detail ?? 'Launch route needs attention.' })
  } else {
    primaryAction = packStateAction(route.mode === 'native-runtime' ? 'launch-standalone' : 'play', `Play ${profile.name}`, { variant: 'primary' })
  }

  const playReady = installed && !needsFileRepair && !packOsBlocked && minecraftLauncher.ok
  return {
    ok: playReady,
    generatedAt: isoNow(),
    profile,
    route,
    install: {
      installed,
      status: profile.status,
      installPath,
      manifestPath: localManifest.manifestPath,
      version: localManifest.version ?? profile.version,
      verification,
    },
    localManifest,
    catalog,
    minecraftLauncher,
    packOs,
    selectedPackOs,
    primaryAction,
    blockers,
    warnings: blockers.map((blocker) => blocker.detail),
  }
}

function resolveAppIconPath() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const appRoot = app.getAppPath()
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'build', iconName),
    path.join(process.resourcesPath, 'build', iconName),
    path.join(appRoot, 'build', iconName),
    path.join(__dirname, '..', 'build', iconName),
  ]
  return candidates.find((candidate) => fssync.existsSync(candidate)) ?? path.join(appRoot, 'build', iconName)
}

function loadAppIcon() {
  const icon = nativeImage.createFromPath(resolveAppIconPath())
  return icon.isEmpty() ? undefined : icon
}

async function appReadiness(payload = {}) {
  const packState = await appPackState(payload)
  const settings = await readSettings()
  const profile = packState.profile
  const installPath = packState.install.installPath
  const logs = await logsRead({ installPath }).catch(() => ({ files: [], latest: '' }))
  const warnings = [
    ...packState.warnings,
    ...(logs.files.length ? [] : ['No launcher or install logs were found yet.']),
  ].filter(Boolean)

  return {
    ok: warnings.length === 0,
    generatedAt: isoNow(),
    profile,
    install: {
      installed: packState.install.installed,
      status: profile.status ?? 'missing',
      installPath,
      manifestPath: packState.install.manifestPath,
      version: packState.install.version,
    },
    catalog: packState.catalog,
    minecraftLauncher: packState.minecraftLauncher,
    packOs: packState.packOs,
    packState,
    logs: {
      available: logs.files.length > 0,
      count: logs.files.length,
      latestName: logs.files[0]?.name,
      latestModifiedAt: logs.files[0]?.modifiedAt,
    },
    settings: {
      advancedMode: Boolean(settings.advancedMode),
      creatorMode: Boolean(settings.creatorMode),
      launchMode: settings.launchMode,
    },
    platform: {
      ...getPlatformInfo(),
      os: os.platform(),
      release: os.release(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
    },
    warnings,
  }
}

async function appBootstrapState() {
  await seedDesktopData()
  const paths = getPaths()
  const settings = await readSettings()
  let releaseIndex = null
  let releaseIndexCatalogState = null
  try {
    releaseIndex = await releaseList({ refresh: false })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    releaseIndex = blankReleaseIndex(catalogReleaseSource(settings), [reason], [{
      tagName: 'catalog',
      releaseName: 'ECHO Catalog',
      severity: 'critical',
      reason,
      assets: [],
    }], [])
  }
  try {
    releaseIndexCatalogState = await releaseIndexCatalog({ refresh: false })
  } catch (error) {
    releaseIndexCatalogState = {
      sourceUrl: settings.releaseIndex.channelUrl,
      fetchedAt: isoNow(),
      entries: [],
      warnings: [error instanceof Error ? error.message : String(error)],
    }
  }
  const [profiles, account, launcherUpdate] = await Promise.all([profileList(), authGetState(), launcherUpdateGetState()])
  return {
    protocolVersion: APP_PROTOCOL_VERSION,
    platform: getPlatformInfo(),
    paths,
    profiles,
    settings,
    account,
    launch: launchState(),
    launcherUpdate,
    releaseIndex,
    releaseIndexCatalog: releaseIndexCatalogState,
    pendingProtocolAction,
  }
}

async function saveMobileBridgeSettings(mobileBridge) {
  const saved = await writeSettings({ mobileBridge })
  return saved.mobileBridge
}

function currentMobileBridgeHost() {
  return getLanAddress()
}

async function mobileBridgeGetState() {
  const settings = await readSettings()
  return publicMobileBridgeState(settings.mobileBridge, {
    host: currentMobileBridgeHost(),
    running: Boolean(mobileBridgeServer),
    error: mobileBridgeStartError,
  })
}

async function mobileBridgeCreatePairingCode() {
  const settings = await readSettings()
  await saveMobileBridgeSettings(createPairingSession(settings.mobileBridge, { host: currentMobileBridgeHost() }))
  return mobileBridgeGetState()
}

async function mobileBridgeApproveDevice(payload = {}) {
  const settings = await readSettings()
  await saveMobileBridgeSettings(approvePendingDevice(settings.mobileBridge, String(payload.requestId ?? ''), payload.role))
  return mobileBridgeGetState()
}

async function mobileBridgeDenyDevice(payload = {}) {
  const settings = await readSettings()
  await saveMobileBridgeSettings(denyPendingDevice(settings.mobileBridge, String(payload.requestId ?? '')))
  return mobileBridgeGetState()
}

async function mobileBridgeRevokeDevice(payload = {}) {
  const settings = await readSettings()
  await saveMobileBridgeSettings(revokePairedDevice(settings.mobileBridge, String(payload.deviceId ?? '')))
  return mobileBridgeGetState()
}

async function mobileBridgeRestart() {
  await stopMobileBridgeServer()
  await startMobileBridgeServer()
  return mobileBridgeGetState()
}

async function mobileBridgeHealth() {
  const settings = await readSettings()
  return buildMobileBridgeHealth(settings.mobileBridge, {
    host: currentMobileBridgeHost(),
    running: Boolean(mobileBridgeServer),
    error: mobileBridgeStartError,
    version: app.getVersion(),
  })
}

function parseMobileOfficialServerStatus(input, settings = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (Number(input.schemaVersion) !== 1) return null
  const version = input.version && typeof input.version === 'object' ? input.version : {}
  const discord = input.discord && typeof input.discord === 'object' && !Array.isArray(input.discord) ? input.discord : {}
  const inviteUrl = String(discord.inviteUrl ?? settings.officialDiscordInviteUrl ?? '').trim()
  const lastUpdated = Number.isFinite(Date.parse(String(input.lastUpdated ?? ''))) ? new Date(input.lastUpdated).toISOString() : isoNow()
  return {
    serverId: String(input.serverId ?? 'official-ashfall'),
    serverName: String(input.serverName ?? settings.officialServerName ?? 'Ashfall Official'),
    motd: String(input.motd ?? ''),
    online: Boolean(input.online),
    playerCount: Math.max(0, Math.floor(Number(input.playerCount ?? 0))),
    maxPlayers: Math.max(0, Math.floor(Number(input.maxPlayers ?? input.playerCount ?? 0))),
    pingMs: Math.max(0, Math.floor(Number(input.pingMs ?? input.latencyMs ?? 0))),
    players: Array.isArray(input.players) ? input.players.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 64) : [],
    discord: {
      linked: Boolean(discord.linked) || Boolean(inviteUrl),
      ...(inviteUrl ? { inviteUrl } : {}),
    },
    version: {
      minecraft: String(version.minecraft ?? ''),
      neoforge: String(version.neoforge ?? ''),
      echo: String(version.echo ?? ''),
    },
    recentEvents: Array.isArray(input.recentEvents)
      ? input.recentEvents
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null
          const createdAt = Number.isFinite(Date.parse(String(item.createdAt ?? ''))) ? new Date(item.createdAt).toISOString() : ''
          if (!createdAt) return null
          return {
            type: String(item.type ?? 'event').trim() || 'event',
            player: String(item.player ?? '').trim(),
            message: String(item.message ?? '').trim(),
            createdAt,
          }
        })
        .filter(Boolean)
        .slice(0, 24)
      : [],
    lastUpdated,
    stale: Date.now() - Date.parse(lastUpdated) > OFFICIAL_SERVER_STALE_MS,
  }
}

async function fetchMobileOfficialServerStatus(settings = {}) {
  const statusUrl = String(settings.officialServerStatusUrl ?? '').trim()
  if (!statusUrl) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const response = await fetch(statusUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return null
    return parseMobileOfficialServerStatus(await response.json(), settings)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function mobileLogsSummary(profile) {
  const installPath = profile?.installPath ? normalizePath(profile.installPath) : ''
  const [launcherLogs, installLogs] = await Promise.all([
    logsRead({}).catch(() => ({ files: [] })),
    installPath ? logsRead({ installPath }).catch(() => ({ files: [] })) : Promise.resolve({ files: [] }),
  ])
  const files = [...(launcherLogs.files ?? []), ...(installLogs.files ?? [])]
    .sort((left, right) => String(right.modifiedAt).localeCompare(String(left.modifiedAt)))
  const latest = files[0]
  return {
    latestName: latest?.name ?? '',
    latestModifiedAt: latest?.modifiedAt ?? '',
    latestSize: latest?.size ?? 0,
    fileCount: files.length,
  }
}

async function mobileSupportBundleSummary(profile) {
  const paths = getPaths()
  let exportedBundles = []
  try {
    const entries = await fs.readdir(paths.logs, { withFileTypes: true })
    exportedBundles = (await Promise.all(entries
      .filter((entry) => entry.isFile() && /^echo-logs-.+\.zip$/i.test(entry.name))
      .map(async (entry) => {
        const bundlePath = path.join(paths.logs, entry.name)
        const stats = await fs.stat(bundlePath)
        return {
          path: bundlePath,
          name: entry.name,
          modifiedAt: stats.mtime.toISOString(),
          size: stats.size,
        }
      })))
      .sort((left, right) => String(right.modifiedAt).localeCompare(String(left.modifiedAt)))
  } catch {
    exportedBundles = []
  }
  const logs = await mobileLogsSummary(profile)
  const latestBundle = exportedBundles[0]
  return {
    available: logs.fileCount > 0 || exportedBundles.length > 0,
    fileCount: logs.fileCount,
    bundleCount: exportedBundles.length,
    latestName: latestBundle?.name ?? '',
    latestPath: latestBundle?.path ?? '',
    latestSize: latestBundle?.size ?? 0,
    generatedAt: latestBundle?.modifiedAt ?? isoNow(),
  }
}

async function mobileCommandCenterSnapshot(device = null) {
  const settings = await readSettings()
  const profiles = await profileList().catch(() => [])
  const profile = profiles.find((item) => item.id === CANONICAL_PROFILE_ID) ?? profiles[0]
  const operation = operationStatus({})
  const installedProfile = profile ? await readInstalledProfileManifest(profile.installPath, profile.id).catch(() => null) : null
  const [packOs, latestManifest, serverStatus, logsSummary, supportBundle] = await Promise.all([
    readPackOsStateForSettings(settings).catch(() => null),
    profile ? manifestLoad({ manifestPath: profile.manifestPath, pack: profile.id }).catch(() => null) : Promise.resolve(null),
    fetchMobileOfficialServerStatus(settings),
    mobileLogsSummary(profile),
    mobileSupportBundleSummary(profile),
  ])
  const manifest = installedProfile?.manifest ?? latestManifest
  const profileForSnapshot = installedProfile
    ? {
        ...profile,
        installPath: installedProfile.installPath,
        manifestPath: installedProfile.manifestPath,
        status: 'healthy',
        version: installedProfile.manifest?.version ?? profile?.version,
      }
    : profile
  const selectedPackOs = packOs?.selectedPack
  const packOsReason = selectedPackOs?.blockingReasons?.[0] ?? selectedPackOs?.warnings?.[0] ?? packOs?.warnings?.[0] ?? ''
  const packOsRuntime = selectedPackOs
    ? `${selectedPackOs.name ?? selectedPackOs.packId ?? 'PackOS'}: ${selectedPackOs.uiState ?? selectedPackOs.status ?? 'unknown'}`
    : 'Unknown'
  const bridgeUrl = buildBridgeApiUrl(currentMobileBridgeHost(), settings.mobileBridge.port)
  return buildAndroidCommandCenterSnapshot({
    role: device?.role ?? 'PLAYER',
    bridgeUrl,
    profile: profileForSnapshot,
    operation,
    installed: Boolean(installedProfile),
    installStatus: installedProfile ? 'healthy' : profile?.status ?? 'missing',
    officialServerName: settings.officialServerName,
    serverStatus,
    manifest,
    logsSummary,
    supportBundle,
    pairingCode: settings.mobileBridge.activePairing?.code ?? '',
    packVersion: manifest?.version ?? profile?.version,
    packOsRuntime,
    packOsReason,
    nativeAdapter: selectedPackOs?.packId ? 'Reported' : 'No report',
  })
}

function sendMobileJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function readMobileRequestBody(request) {
  return new Promise((resolve, reject) => {
    let text = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      text += chunk
      if (text.length > 64 * 1024) {
        reject(new Error('Request body is too large.'))
        request.destroy()
      }
    })
    request.on('end', () => {
      if (!text.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('Request body must be valid JSON.'))
      }
    })
    request.on('error', reject)
  })
}

function bearerToken(request) {
  const header = String(request.headers.authorization ?? '')
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() ?? ''
}

async function requireMobileDevice(request) {
  const token = bearerToken(request)
  if (!token) return null
  const settings = await readSettings()
  const result = authenticateDevice(settings.mobileBridge, token)
  if (!result.device) return null
  await saveMobileBridgeSettings(result.settings)
  return result.device
}

async function handleMobilePair(body = {}) {
  const settings = await readSettings()
  const result = requestPairing(settings.mobileBridge, body, { host: currentMobileBridgeHost() })
  await saveMobileBridgeSettings(result.settings)
  const snapshot = await mobileCommandCenterSnapshot({ role: body.requestedRole ?? 'PLAYER' })
  if (result.status === 'paired') {
    return {
      ok: true,
      message: result.message,
      deviceToken: result.token,
      snapshot,
    }
  }
  return {
    ok: false,
    message: result.message,
    snapshot,
  }
}

async function handleMobileAction(body = {}, device) {
  const action = String(body.action ?? '').trim()
  const mapped = mapMobileAction(action)
  if (!mapped) {
    return { ok: false, message: 'Unknown mobile action.', snapshot: await mobileCommandCenterSnapshot(device) }
  }
  if (!canRunMobileAction(device.role, action)) {
    return { ok: false, message: `${device.role} devices cannot run "${action}".`, snapshot: await mobileCommandCenterSnapshot(device) }
  }

  const profileId = normalizeOfficialPackId(body.profileId) ?? CANONICAL_PROFILE_ID
  let ok = true
  let message = `${action} acknowledged.`
  if (mapped.type === 'launch') {
    const active = runningMobileOperation('mobile-launch')
    if (active) {
      return {
        ok: true,
        message: active.message || 'Launch is already running in ECHO Launcher.',
        snapshot: await mobileCommandCenterSnapshot(device),
      }
    }
    const operationId = createOperationId('handoff')
    updateOperationStatus(operationId, {
      kind: 'handoff',
      status: 'running',
      phaseId: 'mobile-launch',
      mobileActionType: 'mobile-launch',
      label: 'Mobile launch requested',
      progress: 4,
      message: `${device.deviceName} requested ${action}.`,
    })
    launchPrepareHandoff({ profileId, operationId, refreshRelease: true }).catch((error) => {
      updateOperationStatus(operationId, {
        kind: 'handoff',
        status: 'failed',
        phaseId: 'mobile-launch',
        label: 'Mobile launch failed',
        progress: 96,
        message: error instanceof Error ? error.message : String(error),
      })
    })
    message = 'Launch queued in ECHO Launcher.'
  } else if (mapped.type === 'open-minecraft-launcher') {
    const active = runningMobileOperation('mobile-open-minecraft-launcher')
    if (active) {
      return {
        ok: true,
        message: active.message || 'Minecraft Launcher open is already running in ECHO Launcher.',
        snapshot: await mobileCommandCenterSnapshot(device),
      }
    }
    const operationId = createOperationId('open-minecraft-launcher')
    updateOperationStatus(operationId, {
      kind: 'operation',
      status: 'running',
      phaseId: 'mobile-open-minecraft-launcher',
      mobileActionType: 'mobile-open-minecraft-launcher',
      label: 'Mobile Minecraft Launcher open requested',
      progress: 12,
      message: `${device.deviceName} requested ${action}.`,
    })
    minecraftLauncherOpen()
      .then((result) => {
        const opened = Boolean(result.opened)
        updateOperationStatus(operationId, {
          kind: 'operation',
          status: opened ? 'completed' : 'failed',
          phaseId: 'mobile-open-minecraft-launcher',
          label: opened ? 'Minecraft Launcher opened' : 'Minecraft Launcher open needs attention',
          progress: opened ? 100 : 96,
          message: opened ? 'Minecraft Launcher opened.' : (result.warnings ?? []).join(' ') || 'Minecraft Launcher could not be opened.',
        })
      })
      .catch((error) => {
        updateOperationStatus(operationId, {
          kind: 'operation',
          status: 'failed',
          phaseId: 'mobile-open-minecraft-launcher',
          label: 'Minecraft Launcher open failed',
          progress: 96,
          message: error instanceof Error ? error.message : String(error),
        })
      })
    message = 'Minecraft Launcher open queued in ECHO Launcher.'
  } else if (mapped.type === 'update') {
    const active = runningMobileOperation('mobile-update')
    if (active) {
      return {
        ok: true,
        message: active.message || 'Update is already running in ECHO Launcher.',
        snapshot: await mobileCommandCenterSnapshot(device),
      }
    }
    const operationId = createOperationId('install')
    updateOperationStatus(operationId, {
      kind: 'install',
      status: 'running',
      phaseId: 'mobile-update',
      mobileActionType: 'mobile-update',
      label: 'Mobile update requested',
      progress: 4,
      message: `${device.deviceName} requested ${action}.`,
    })
    installRun({ profileId, operationId, operationKind: 'install', refresh: true }).catch((error) => {
      updateOperationStatus(operationId, {
        kind: 'install',
        status: 'failed',
        phaseId: 'mobile-update',
        label: 'Mobile update failed',
        progress: 96,
        message: error instanceof Error ? error.message : String(error),
      })
    })
    message = 'Update queued in ECHO Launcher.'
  } else if (mapped.type === 'repair') {
    const active = runningMobileOperation('mobile-repair')
    if (active) {
      return {
        ok: true,
        message: active.message || 'Repair is already running in ECHO Launcher.',
        snapshot: await mobileCommandCenterSnapshot(device),
      }
    }
    const operationId = createOperationId('repair')
    updateOperationStatus(operationId, {
      kind: 'operation',
      status: 'running',
      phaseId: 'mobile-repair',
      mobileActionType: 'mobile-repair',
      label: 'Mobile repair requested',
      progress: 4,
      message: `${device.deviceName} requested ${action}.`,
    })
    repairRun({ profileId, operationId })
      .then((result) => {
        updateOperationStatus(operationId, {
          kind: 'operation',
          status: result.ok ? 'completed' : 'failed',
          phaseId: 'mobile-repair',
          label: result.ok ? 'Mobile repair complete' : 'Mobile repair needs attention',
          progress: result.ok ? 100 : 96,
          message: result.ok ? `Repaired ${result.repaired.length} files.` : `${result.after?.missing?.length ?? 0} files still missing.`,
        })
      })
      .catch((error) => {
        updateOperationStatus(operationId, {
          kind: 'operation',
          status: 'failed',
          phaseId: 'mobile-repair',
          label: 'Mobile repair failed',
          progress: 96,
          message: error instanceof Error ? error.message : String(error),
        })
      })
    message = 'Repair queued in ECHO Launcher.'
  } else if (mapped.type === 'verify') {
    const active = runningMobileOperation('mobile-verify')
    if (active) {
      return {
        ok: true,
        message: active.message || 'Scan Install is already running in ECHO Launcher.',
        snapshot: await mobileCommandCenterSnapshot(device),
      }
    }
    const operationId = createOperationId('verify')
    updateOperationStatus(operationId, {
      kind: 'operation',
      status: 'running',
      phaseId: 'mobile-verify',
      mobileActionType: 'mobile-verify',
      label: 'Mobile scan requested',
      progress: 4,
      message: `${device.deviceName} requested ${action}.`,
    })
    try {
      const report = await verifyManifest({
        profileId,
        onProgress: (progress) => {
          const total = Math.max(1, Number(progress.total ?? 0))
          const checked = Math.max(0, Number(progress.checked ?? 0))
          updateOperationStatus(operationId, {
            kind: 'operation',
            status: 'running',
            phaseId: 'mobile-verify',
            label: `Scanning install (${checked}/${total})`,
            progress: 4 + Math.min(92, (checked / total) * 92),
            message: progress.currentPath || `${progress.missing ?? 0} missing, ${progress.corrupt ?? 0} corrupt.`,
          })
        },
      })
      ok = report.missing.length === 0 && report.corrupt.length === 0
      message = `Verification complete: ${report.missing.length} missing, ${report.corrupt.length} corrupt.`
      updateOperationStatus(operationId, {
        kind: 'operation',
        status: ok ? 'completed' : 'failed',
        phaseId: 'mobile-verify',
        label: ok ? 'Mobile scan complete' : 'Mobile scan found issues',
        progress: ok ? 100 : 96,
        message,
      })
    } catch (error) {
      ok = false
      message = error instanceof Error ? error.message : String(error)
      updateOperationStatus(operationId, {
        kind: 'operation',
        status: 'failed',
        phaseId: 'mobile-verify',
        label: 'Mobile scan failed',
        progress: 96,
        message,
      })
    }
  } else if (mapped.type === 'packos-check') {
    const operationId = createOperationId('packos-check')
    updateOperationStatus(operationId, {
      kind: 'operation',
      status: 'running',
      phaseId: 'mobile-packos-check',
      mobileActionType: 'mobile-packos-check',
      label: 'Mobile PackOS check requested',
      progress: 24,
      message: `${device.deviceName} requested ${action}.`,
    })
    try {
      const settings = await readSettings()
      const packOs = await readPackOsStateForSettings(settings)
      const selectedPack = packOs?.packs?.find((pack) => pack.packId === profileId) ?? packOs?.selectedPack
      const reasons = [
        ...(selectedPack?.blockingReasons ?? []),
        ...(selectedPack?.warnings ?? []),
        ...(packOs?.warnings ?? []),
      ].filter(Boolean)
      const stateLabel = selectedPack?.uiState ?? selectedPack?.status ?? 'unknown'
      const packName = selectedPack?.name ?? selectedPack?.packId ?? profileId
      ok = Boolean(selectedPack) && !BLOCKING_UI_STATES.has(selectedPack.uiState)
      message = selectedPack
        ? `${packName} PackOS state: ${stateLabel}.${reasons[0] ? ` ${reasons[0]}` : ''}`
        : `PackOS state unavailable for ${profileId}.${reasons[0] ? ` ${reasons[0]}` : ''}`
      updateOperationStatus(operationId, {
        kind: 'operation',
        status: ok ? 'completed' : 'failed',
        phaseId: 'mobile-packos-check',
        label: ok ? 'PackOS check complete' : selectedPack ? 'PackOS blocks launch' : 'PackOS check unavailable',
        progress: ok ? 100 : 96,
        message,
      })
    } catch (error) {
      ok = false
      message = error instanceof Error ? error.message : String(error)
      updateOperationStatus(operationId, {
        kind: 'operation',
        status: 'failed',
        phaseId: 'mobile-packos-check',
        label: 'PackOS check failed',
        progress: 96,
        message,
      })
    }
  } else if (mapped.type === 'logs') {
    try {
      if (/crash/i.test(action)) {
        const profiles = await profileList().catch(() => [])
        const profile = profiles.find((item) => item.id === profileId) ?? profiles[0]
        const logs = profile?.installPath ? await logsRead({ installPath: profile.installPath }) : { files: [] }
        const crash = logs.files.find((file) => /crash-reports/i.test(String(file.path ?? '')) || /crash/i.test(String(file.name ?? '')))
        message = crash?.name ? `Latest crash log: ${crash.name}` : 'No crash logs are available for this install.'
      } else {
        const logs = await logsRead({})
        message = logs.files[0]?.name ? `Latest launcher log: ${logs.files[0].name}` : 'No launcher logs are available yet.'
      }
    } catch (error) {
      ok = false
      message = error instanceof Error ? error.message : String(error)
    }
  } else if (mapped.type === 'support-bundle') {
    const active = runningMobileOperation('mobile-support-bundle')
    if (active) {
      return {
        ok: true,
        message: active.message || 'Support bundle export is already running in ECHO Launcher.',
        snapshot: await mobileCommandCenterSnapshot(device),
      }
    }
    const operationId = createOperationId('support-bundle')
    updateOperationStatus(operationId, {
      kind: 'operation',
      status: 'running',
      phaseId: 'mobile-support-bundle',
      mobileActionType: 'mobile-support-bundle',
      label: 'Mobile support bundle requested',
      progress: 12,
      message: `${device.deviceName} requested ${action}.`,
    })
    try {
      const result = await logsExport({ profileId })
      ok = result.ok !== false
      message = result.zipPath ? `Support bundle exported: ${result.zipPath}` : 'Support bundle export completed.'
      updateOperationStatus(operationId, {
        kind: 'operation',
        status: ok ? 'completed' : 'failed',
        phaseId: 'mobile-support-bundle',
        label: ok ? 'Support bundle exported' : 'Support bundle needs attention',
        progress: ok ? 100 : 96,
        message: result.zipPath ? `Exported ${result.files?.length ?? 0} files to ${result.zipPath}.` : message,
      })
    } catch (error) {
      ok = false
      message = error instanceof Error ? error.message : String(error)
      updateOperationStatus(operationId, {
        kind: 'operation',
        status: 'failed',
        phaseId: 'mobile-support-bundle',
        label: 'Support bundle export failed',
        progress: 96,
        message,
      })
    }
  } else if (mapped.type === 'dev-note') {
    message = `${action} is tracked on desktop; open ECHO Launcher Dev tools to continue.`
  } else if (mapped.type === 'refresh') {
    message = 'Launcher snapshot refreshed for Android chat.'
  } else if (mapped.type === 'news') {
    message = 'Latest news is available in the Android app.'
  }

  return {
    ok,
    message,
    snapshot: await mobileCommandCenterSnapshot(device),
  }
}

async function handleMobileBridgeRequest(request, response) {
  if (request.method === 'OPTIONS') {
    sendMobileJson(response, 204, {})
    return
  }
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  try {
    if (url.pathname === '/api/mobile/pair' && request.method === 'POST') {
      sendMobileJson(response, 200, await handleMobilePair(await readMobileRequestBody(request)))
      return
    }

    if (url.pathname === '/api/mobile/health' && request.method === 'GET') {
      sendMobileJson(response, 200, await mobileBridgeHealth())
      return
    }

    if (url.pathname === '/api/mobile/command-center' && request.method === 'GET') {
      const device = await requireMobileDevice(request)
      if (!device) {
        sendMobileJson(response, 401, { ok: false, message: 'Mobile device is not paired.' })
        return
      }
      sendMobileJson(response, 200, await mobileCommandCenterSnapshot(device))
      return
    }

    if (url.pathname === '/api/mobile/actions' && request.method === 'POST') {
      const device = await requireMobileDevice(request)
      if (!device) {
        sendMobileJson(response, 401, { ok: false, message: 'Mobile device is not paired.' })
        return
      }
      sendMobileJson(response, 200, await handleMobileAction(await readMobileRequestBody(request), device))
      return
    }

    sendMobileJson(response, 404, { ok: false, message: 'Mobile bridge endpoint not found.' })
  } catch (error) {
    sendMobileJson(response, 500, { ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}

async function startMobileBridgeServer() {
  const settings = await readSettings()
  const mobileBridge = normalizeMobileBridgeSettings(settings.mobileBridge)
  if (!mobileBridge.enabled) return null
  if (mobileBridgeServer) return mobileBridgeServer
  await saveMobileBridgeSettings(mobileBridge)
  mobileBridgeStartError = null
  mobileBridgeServer = http.createServer((request, response) => {
    handleMobileBridgeRequest(request, response)
  })
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      mobileBridgeStartError = error instanceof Error ? error.message : String(error)
      mobileBridgeServer = null
      reject(error)
    }
    mobileBridgeServer.once('error', onError)
    mobileBridgeServer.listen(mobileBridge.port, '0.0.0.0', () => {
      mobileBridgeServer.off('error', onError)
      resolve()
    })
  })
  await appendLauncherLog('INFO', `Mobile bridge listening on ${buildBridgeApiUrl(currentMobileBridgeHost(), mobileBridge.port)}`)
  return mobileBridgeServer
}

async function stopMobileBridgeServer() {
  if (!mobileBridgeServer) return
  const server = mobileBridgeServer
  mobileBridgeServer = null
  mobileBridgeStartError = null
  await new Promise((resolve) => server.close(resolve))
}

const handlers = {
  'app:get-bootstrap-state': appBootstrapState,
  'app:get-pack-state': appPackState,
  'app:get-readiness': appReadiness,
  'app:get-state': async () => {
    const bootstrap = await appBootstrapState()
    return {
      ...bootstrap,
      manifest: await manifestLoad(),
      java: await javaDetect(),
    }
  },
  'paths:get': async () => getPaths(),
  'profile:list': profileList,
  'profile:save': profileSave,
  'profile:apply-loadout': profileApplyLoadout,
  'profile:duplicate': ({ profileId }) => profileDuplicate(profileId),
  'manifest:load': manifestLoad,
  'manifest:import': manifestImport,
  'manifest:verify': verifyManifest,
  'settings:get': readSettings,
  'settings:save': writeSettings,
  'mobile-bridge:get-state': mobileBridgeGetState,
  'mobile-bridge:create-pairing-code': mobileBridgeCreatePairingCode,
  'mobile-bridge:approve-device': mobileBridgeApproveDevice,
  'mobile-bridge:deny-device': mobileBridgeDenyDevice,
  'mobile-bridge:revoke-device': mobileBridgeRevokeDevice,
  'mobile-bridge:restart': mobileBridgeRestart,
  'release:list': releaseList,
  'release-index:catalog': releaseIndexCatalog,
  'release-index:product': releaseIndexProduct,
  'packos:get-state': packOsGetState,
  'native-loader:get-status': nativeLoaderAshfallStatus,
  'native-loader:launch-ashfall': nativeLoaderLaunchAshfall,
  'standalone-runtime:get-state': standaloneRuntimeGetState,
  'standalone-runtime:launch': standaloneRuntimeLaunch,
  'release:fetch-manifest': releaseFetchManifest,
  'release:cache-clear': releaseCacheClear,
  'neoforge:ensure': neoforgeEnsure,
  'instance:scan-imports': instanceScanImports,
  'instance:import': instanceImport,
  'auth:get-state': authGetState,
  'minecraft:install-runtime': minecraftInstallRuntime,
  'minecraft:verify-runtime': minecraftVerifyRuntime,
  'minecraft:repair-runtime': minecraftRepairRuntime,
  'minecraft:get-runtime-status': minecraftGetRuntimeStatus,
  'operation:get-status': operationStatus,
  'launch:prepare-handoff': launchPrepareHandoff,
  'launch:preflight': launchPreflight,
  'launch:build-command': launchBuildCommand,
  'launch:start': launchStart,
  'launch:stop': launchStop,
  'launch:read-log': launchReadLog,
  'launcher-update:get-state': launcherUpdateGetState,
  'launcher-update:check': launcherUpdateCheck,
  'launcher-update:download': launcherUpdateDownload,
  'launcher-update:install': launcherUpdateInstall,
  'minecraft-launcher:dependency-status': minecraftLauncherDependencyStatus,
  'minecraft-launcher:ensure-dependency': minecraftLauncherEnsureDependency,
  'minecraft-launcher:open': minecraftLauncherOpen,
  'minecraft-launcher:status': minecraftLauncherProfileStatus,
  'minecraft-launcher:handoff': minecraftLauncherHandoff,
  'world:scan': worldScan,
  'ecosystem:scan': ecosystemScan,
  'java:detect': javaDetect,
  'backup:create': backupCreate,
  'backup:restore': backupRestore,
  'rollback:restore-latest': rollbackRestoreLatest,
  'logs:read': logsRead,
  'logs:export': logsExport,
  'asset:validate': assetValidate,
  'server:plan': serverPlan,
  'server:generate': serverGenerate,
  'settings:apply-client-options': settingsApplyClientOptions,
  'install:run': installRun,
  'repair:run': repairRun,
  'pack:export-default': packExportDefault,
  'pack:export': packExport,
  'diagnostic:export': diagnosticExport,
  'download:file': downloadFile,
  'dialog:select-directory': selectDirectory,
  'dialog:select-file': selectFile,
  'shell:open-path': openPath,
  'window:minimize': async (_payload, event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
    return { ok: true }
  },
  'window:maximize-toggle': async (_payload, event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false }
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return { ok: true }
  },
  'window:close': async (_payload, event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
    return { ok: true }
  },
}

ipcMain.handle('echo:invoke', async (_event, command, payload) => {
  const handler = handlers[command]
  if (!handler) throw new Error(`Unsupported ECHO command: ${command}`)
  return handler(payload ?? {}, _event)
})

function createWindow() {
  const isDev = !app.isPackaged
  const appIcon = loadAppIcon()
  if (process.platform === 'darwin' && appIcon) app.dock.setIcon(appIcon)
  let recoveryShown = false
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#020711',
    ...(appIcon ? { icon: appIcon } : {}),
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })
  if (appIcon && process.platform === 'win32') win.setIcon(appIcon)

  const showStartupRecovery = (reason) => {
    if (recoveryShown || win.isDestroyed()) return
    recoveryShown = true
    void appendLauncherLog('ERROR', `Startup recovery shown: ${reason}`)
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(startupRecoveryHtml(reason))}`).catch((error) => {
      void appendLauncherLog('ERROR', `Startup recovery page failed: ${error.message}`)
    })
  }

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      void appendLauncherLog('ERROR', `Renderer console: ${message} (${sourceId}:${line})`)
    }
  })

  win.webContents.on('did-finish-load', () => {
    if (isDev || recoveryShown) return
    setTimeout(() => {
      if (win.isDestroyed() || recoveryShown) return
      win.webContents
        .executeJavaScript(
          `(() => {
            const root = document.getElementById('root');
            return {
              mounted: Boolean(root && root.childElementCount > 0 && !document.querySelector('[data-echo-startup-recovery]')),
              recovery: Boolean(document.querySelector('[data-echo-startup-recovery]')),
              href: location.href,
            };
          })()`,
          true,
        )
        .then((state) => {
          if (!state?.mounted) {
            showStartupRecovery(state?.recovery ? 'Renderer bundle did not mount before the inline recovery timer fired.' : 'Renderer root stayed empty after production assets loaded.')
          }
        })
        .catch((error) => showStartupRecovery(`Renderer health check failed: ${error.message}`))
    }, 6500)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    appendLauncherLog('ERROR', `Renderer process gone: ${details.reason} exitCode=${details.exitCode ?? 'unknown'}`)
    if (!win.isDestroyed() && !recoveryShown) {
      if (isDev) win.loadURL('http://127.0.0.1:5173')
      else showStartupRecovery(`Renderer process gone: ${details.reason} exitCode=${details.exitCode ?? 'unknown'}`)
    }
  })

  win.webContents.on('unresponsive', () => {
    appendLauncherLog('WARN', 'Renderer became unresponsive.')
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    appendLauncherLog('ERROR', `Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`)
    if (!isDev) showStartupRecovery(`Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`)
  })
}

const smokeMode = Boolean(String(process.env.ECHO_LAUNCHER_SMOKE ?? '').trim())
const gotSingleInstanceLock = smokeMode || app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.whenReady().then(async () => {
    await seedDesktopData()
    app.setAsDefaultProtocolClient('echo')
    initializeLauncherUpdates()
    await startMobileBridgeServer().catch((error) => appendLauncherLog('ERROR', `Mobile bridge failed to start: ${error.message}`))
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  void handleEchoProtocolUrl(url)
})

app.on('second-instance', (_event, argv) => {
  const url = argv.find((arg) => String(arg).startsWith('echo://'))
  if (url) void handleEchoProtocolUrl(url)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (mobileBridgeServer) {
    mobileBridgeServer.close()
    mobileBridgeServer = null
  }
})
