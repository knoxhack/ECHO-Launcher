import type { Channel } from './launcher'
import type { OfficialPackId } from './manifests'

export type ReleaseProvider = 'github'
export type LaunchMode = 'minecraft_launcher'

export interface ReleaseFeedConfig {
  provider: ReleaseProvider
  owner: string
  repo: string
  includePrereleases: boolean
}

export interface PublisherSettings {
  owner: string
  repo: string
  hasToken: boolean
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
  releaseFeed: ReleaseFeedConfig
  publisher: PublisherSettings
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
  source: ReleaseFeedConfig
  fetchedAt: string
  releases: ReleaseEntry[]
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
