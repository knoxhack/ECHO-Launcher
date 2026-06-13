import type { Channel } from './launcher'
import type { OfficialPackId } from './manifests'

export type LaunchMode = 'minecraft_launcher'

export interface ReleaseIndexConfig {
  enabled: boolean
  channelUrl: string
}

export interface ReleaseIndexSource {
  provider: 'release-index'
  channelUrl: string
}


export type MobileBridgeDeviceRole = 'VIEWER' | 'PLAYER' | 'DEVELOPER' | 'ADMIN'

export interface MobileBridgePendingDevice {
  requestId: string
  deviceName: string
  requestedRole: MobileBridgeDeviceRole
  role: MobileBridgeDeviceRole
  requestedAt: string
  lastSeenAt: string
  status: 'pending' | 'approved'
}

export interface MobileBridgePairingSession {
  code: string
  bridgeUrl: string
  pairingPayload: string
  createdAt: string
  expiresAt: string
  pendingDevices: MobileBridgePendingDevice[]
}

export interface MobileBridgePairedDevice {
  deviceId: string
  deviceName: string
  role: MobileBridgeDeviceRole
  approvedAt: string
  lastSeenAt: string
}

export interface MobileBridgeSettings {
  enabled: boolean
  port: number
  pairedDevices: MobileBridgePairedDevice[]
  activePairing: MobileBridgePairingSession | null
}

export interface MobileBridgeState extends MobileBridgeSettings {
  status: 'running' | 'stopped' | 'error'
  lanAddress: string
  bridgeUrl: string
  error: string | null
}

export interface LauncherDesktopSettings {
  releaseIndex: ReleaseIndexConfig
  supportGuideUrl: string
  launchMode: LaunchMode
  advancedMode: boolean
  creatorMode: boolean
  officialServerStatusUrl: string
  officialDiscordInviteUrl: string
  officialServerName: string
  officialStatusPollSeconds: number
  communityApiUrl: string
  communityWebSocketUrl: string
  communityChatPortMigrationVersion?: number
  chatNickname: string
  chatNotifications: boolean
  packOsReportRoot?: string
  mobileBridge: MobileBridgeSettings
}

export interface ReleaseAsset {
  name: string
  url: string
  size: number
  sha256?: string
}

export type ReleaseIndexEntryKind = 'product' | 'modpack' | 'module' | 'addon' | 'runtime' | 'studio' | 'website'
export type ReleaseIndexTrust =
  | 'official'
  | 'reproducible-build'
  | 'echo-workflow-built'
  | 'provenance-attested'
  | 'source-linked'
  | 'community'
  | 'unverified'
  | 'deprecated'
  | 'blocked'
export type ReleaseIndexValidationState = 'approved' | 'warning' | 'rejected' | 'blocked'

export interface CanonicalReleaseIndexEntry {
  id: string
  kind: ReleaseIndexEntryKind
  version: string
  channel: string
  publisher: string
  sourceRepo: string
  releaseTag: string
  commitSha: string
  artifacts: Record<string, unknown> | unknown[]
  dependencies: Array<{ id: string; kind?: string; version?: string }>
  compatibility: string[]
  trust: ReleaseIndexTrust
  validation: ReleaseIndexValidationState
  notes?: string
  publishedAt?: string
}

export interface ReleaseIndexChannelPack {
  id: OfficialPackId
  name: string
  channel: string
  loader?: string
  moduleArtifactFamily?: string
  manifestUrl?: string
  catalogEntryUrl?: string
  repoUrl?: string
  catalogStatus?: ReleaseIndexValidationState | 'unpublished'
  diagnostic?: string
}

export interface CanonicalReleaseIndexCatalog {
  sourceUrl: string
  fetchedAt: string
  channel?: string
  entries: CanonicalReleaseIndexEntry[]
  packs: ReleaseIndexChannelPack[]
  warnings: string[]
}

export interface CanonicalProductUpdate {
  entry: CanonicalReleaseIndexEntry | null
  artifact?: ReleaseAsset
  warnings: string[]
}

export interface EchoProtocolAction {
  rawUrl: string
  action: 'install-addon' | 'update-pack'
  id: string
  pack?: OfficialPackId
  entry: CanonicalReleaseIndexEntry
  packEntry?: CanonicalReleaseIndexEntry
  dependencies?: CanonicalReleaseIndexEntry[]
  artifact?: ReleaseAsset
}

export interface ReleaseEntry {
  id: string
  pack?: OfficialPackId
  version: string
  channel: Channel
  tagName: string
  name: string
  draft: boolean
  prerelease: boolean
  publishedAt: string
  releasePageUrl: string
  releaseNotes: string[]
  manifestAssetName: string
  manifestUrl: string
  manifestSha256?: string
  metadataUrl?: string
  trust: 'verified-metadata' | 'derived'
  assets: ReleaseAsset[]
}

export interface ReleaseDiagnostic {
  tagName: string
  releaseName?: string
  severity: 'info' | 'warning' | 'critical'
  reason: string
  assets: string[]
}

export interface RejectedRelease {
  tagName: string
  name: string
  draft: boolean
  prerelease: boolean
  publishedAt: string
  releasePageUrl?: string
  assets: string[]
  reasons: string[]
}

export interface ReleaseIndex {
  cacheVersion?: number
  source: ReleaseIndexSource
  fetchedAt: string
  releases: ReleaseEntry[]
  packs?: ReleaseIndexChannelPack[]
  acceptedCount?: number
  rejectedReleases?: RejectedRelease[]
  diagnostics?: ReleaseDiagnostic[]
  latestPlayableRelease?: ReleaseEntry | null
  warnings: string[]
}

export interface ReleaseFetchResult {
  entry: ReleaseEntry
  manifestPath: string
  cached: boolean
}
