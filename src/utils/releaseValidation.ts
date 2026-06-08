import type { Channel } from '../types/launcher'
import type { OfficialPackId, PackManifest } from '../types/manifests'
import type { ReleaseEntry, ReleaseFeedConfig, ReleaseIndex } from '../types/releases'

const channels: Channel[] = ['alpha', 'experimental']
const RELEASE_CACHE_VERSION = 4
export const officialPackIds: OfficialPackId[] = ['ashfall-native-edition', 'ashfall-neoforge-edition', 'ashfall-standalone-edition']
export const playableAshfallPackIds: OfficialPackId[] = ['ashfall-native-edition', 'ashfall-neoforge-edition', 'ashfall-standalone-edition']

export function normalizeOfficialPackId(pack?: string): OfficialPackId | undefined {
  if (pack === 'ashfall') return 'ashfall-native-edition'
  if (pack === 'ashfall-native-loader') return 'ashfall-native-edition'
  if (pack === 'ashfall-neoforge') return 'ashfall-neoforge-edition'
  if (pack === 'ashfall-standalone-runtime' || pack === 'standalone-runtime-showcase') return 'ashfall-standalone-edition'
  return officialPackIds.includes(pack as OfficialPackId) ? (pack as OfficialPackId) : undefined
}

export function isSafeRelativePath(value: string) {
  if (!value || value.includes('\0')) return false
  if (/^[a-z]:/i.test(value) || value.startsWith('/') || value.startsWith('\\')) return false
  const parts = value.replace(/\\/g, '/').split('/')
  return parts.every((part) => part && part !== '.' && part !== '..')
}

export function packManifestAssetName(channel: Channel, version: string, pack: OfficialPackId = 'ashfall-native-edition') {
  return `${pack}-${channel}-${version}.pack.json`
}

export function normalizeReleaseFeedConfig(config: Partial<ReleaseFeedConfig>): ReleaseFeedConfig {
  return {
    provider: 'github',
    owner: config.owner?.trim() ?? '',
    repo: config.repo?.trim() ?? '',
    includePrereleases: config.includePrereleases ?? true,
  }
}

export function releaseFeedConfigured(config: ReleaseFeedConfig) {
  return config.provider === 'github' && config.owner.trim().length > 0 && config.repo.trim().length > 0
}

export function normalizeGitHubAssetDigest(digest?: string) {
  const match = digest?.match(/^sha256:([a-f0-9]{64})$/i)
  return match?.[1] ?? undefined
}

export function selectReleaseEntry(
  releases: ReleaseEntry[],
  channel: Channel,
  version?: string,
  pack?: string,
): ReleaseEntry | null {
  const requestedPack = normalizeOfficialPackId(pack)
  const candidates = releases
    .filter((release) => release.channel === channel)
    .filter((release) => !version || release.version === version)
    .filter((release) => !requestedPack || normalizeOfficialPackId(release.pack) === requestedPack)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  return candidates[0] ?? null
}

export function isPlayablePackRelease(release: ReleaseEntry | null | undefined, pack?: string) {
  const requestedPack = normalizeOfficialPackId(pack)
  const releasePack = normalizeOfficialPackId(release?.pack)
  return Boolean(
    release &&
      channels.includes(release.channel) &&
      release.trust === 'verified-metadata' &&
      release.manifestSha256 &&
      (!requestedPack || !releasePack || releasePack === requestedPack),
  )
}

export function isPlayableAshfallRelease(release: ReleaseEntry | null | undefined) {
  return isPlayablePackRelease(release, 'ashfall-native-edition')
}

export function latestPlayableRelease(index: ReleaseIndex | null | undefined): ReleaseEntry | null {
  if (!index) return null
  const latest = index.latestPlayableRelease ?? null
  return isPlayablePackRelease(latest)
    ? latest
    : index.releases.find((release) => isPlayablePackRelease(release)) ?? null
}

export function latestPlayableReleaseForPack(index: ReleaseIndex | null | undefined, pack: string): ReleaseEntry | null {
  if (!index) return null
  const normalizedPack = normalizeOfficialPackId(pack)
  return [...index.releases]
    .filter((release) => isPlayablePackRelease(release, normalizedPack))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null
}

export function nativeLoaderMinecraftVersionId(manifest: Pick<PackManifest, 'nativeLoader'>) {
  const version = manifest.nativeLoader?.version?.trim()
  return manifest.nativeLoader?.minecraftLauncherVersionId?.trim() || (version ? `echo-native-loader-${version}` : '')
}

export function nativeLoaderMetadataStatus(manifest: Pick<PackManifest, 'minecraft' | 'minecraftVersion' | 'nativeLoader'>) {
  const nativeLoader = manifest.nativeLoader
  if (!nativeLoader) {
    return {
      ok: false,
      reason: 'Native Loader metadata is not included in this Ashfall release.',
      versionId: '',
    }
  }
  if (!nativeLoader.version?.trim()) {
    return {
      ok: false,
      reason: 'Native Loader metadata must include a version.',
      versionId: '',
    }
  }

  const versionId = nativeLoaderMinecraftVersionId(manifest)
  const versionJson = nativeLoader.versionJson
  const minecraftVersion = manifest.minecraftVersion ?? manifest.minecraft
  if (!versionJson || typeof versionJson !== 'object' || Array.isArray(versionJson)) {
    return {
      ok: false,
      reason: `Native Loader metadata is missing versionJson for '${versionId}'.`,
      versionId,
    }
  }

  const candidate = versionJson as {
    id?: unknown
    inheritsFrom?: unknown
    mainClass?: unknown
    arguments?: unknown
    libraries?: unknown
  }
  if (String(candidate.id ?? '') !== versionId) {
    return {
      ok: false,
      reason: `Native Loader versionJson id is '${String(candidate.id ?? 'missing')}', expected '${versionId}'.`,
      versionId,
    }
  }
  if (String(candidate.inheritsFrom ?? '') !== String(minecraftVersion ?? '')) {
    return {
      ok: false,
      reason: `Native Loader versionJson inheritsFrom is '${String(candidate.inheritsFrom ?? 'missing')}', expected '${minecraftVersion}'.`,
      versionId,
    }
  }
  if (!candidate.mainClass || typeof candidate.mainClass !== 'string') {
    return {
      ok: false,
      reason: 'Native Loader versionJson is missing mainClass.',
      versionId,
    }
  }
  if (!candidate.arguments || typeof candidate.arguments !== 'object' || Array.isArray(candidate.arguments)) {
    return {
      ok: false,
      reason: 'Native Loader versionJson is missing launcher arguments.',
      versionId,
    }
  }
  if (!Array.isArray(candidate.libraries) || candidate.libraries.length === 0) {
    return {
      ok: false,
      reason: 'Native Loader versionJson is missing libraries.',
      versionId,
    }
  }

  return { ok: true, reason: '', versionId }
}

export function releaseAcceptedCount(index: ReleaseIndex | null | undefined) {
  return index?.acceptedCount ?? index?.releases.length ?? 0
}

export function releaseRejectedCount(index: ReleaseIndex | null | undefined) {
  return index?.rejectedReleases?.length ?? 0
}

export function isUsableReleaseCache(value: ReleaseIndex | null | undefined) {
  if (!value) return false
  return Boolean(
      value.cacheVersion === RELEASE_CACHE_VERSION &&
      Array.isArray(value.releases) &&
      value.releases.length > 0 &&
      Array.isArray(value.diagnostics) &&
      Array.isArray(value.rejectedReleases) &&
      value.releases.every((release) => release.trust === 'verified-metadata'),
  )
}

export function validatePackManifest(value: unknown): PackManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Manifest must be a JSON object.')
  }

  const manifest = value as PackManifest
  const normalizedPack = normalizeOfficialPackId(manifest.pack)
  if (!normalizedPack) {
    throw new Error(`Manifest pack must be one of: ${officialPackIds.join(', ')}.`)
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    throw new Error('Manifest version is required.')
  }
  if (!channels.includes(manifest.channel)) {
    throw new Error('Manifest channel is invalid.')
  }
  if (normalizedPack === 'ashfall-standalone-edition') {
    if (!manifest.runtime?.requiredJava) {
      throw new Error('Ashfall Standalone Edition manifests must include runtime.requiredJava.')
    }
    if (!manifest.launch?.mainClass) {
      throw new Error('Ashfall Standalone Edition manifests must include launch metadata.')
    }
  } else if (normalizedPack === 'ashfall-native-edition') {
    if (!(manifest.minecraftVersion ?? manifest.minecraft) || typeof (manifest.minecraftVersion ?? manifest.minecraft) !== 'string') {
      throw new Error('Manifest Minecraft version is required.')
    }
    if (!manifest.nativeLoader) {
      throw new Error('Ashfall Native Edition manifests must include Native Loader metadata.')
    }
  } else if (normalizedPack === 'ashfall-neoforge-edition') {
    if (!(manifest.minecraftVersion ?? manifest.minecraft) || typeof (manifest.minecraftVersion ?? manifest.minecraft) !== 'string') {
      throw new Error('Manifest Minecraft version is required.')
    }
    if (manifest.loader?.type !== 'neoforge') {
      throw new Error('Ashfall NeoForge Edition manifests must include NeoForge loader metadata.')
    }
  }
  if (normalizedPack === 'ashfall-native-edition' || manifest.nativeLoader) {
    const nativeLoaderStatus = nativeLoaderMetadataStatus(manifest)
    if (!nativeLoaderStatus.ok) {
      throw new Error(nativeLoaderStatus.reason)
    }
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('Manifest files must be an array.')
  }

  if (manifest.artifactMode === 'zip') {
    if (!manifest.artifactName || !isSafeRelativePath(manifest.artifactName)) {
      throw new Error('Zip artifact manifests must include a safe artifactName.')
    }
    if (!manifest.artifactSha256 || !/^[a-f0-9]{64}$/i.test(manifest.artifactSha256)) {
      throw new Error('Zip artifact manifests must include an artifact SHA-256 hash.')
    }
    if (!manifest.launch?.mainClass) {
      throw new Error('Zip artifact manifests must include launch metadata.')
    }
  }

  const manifestPaths = new Set<string>()
  for (const file of manifest.files) {
    if (!isSafeRelativePath(file.path)) {
      throw new Error(`Unsafe manifest path: ${file.path}`)
    }
    const normalizedPath = file.path.replace(/\\/g, '/').toLowerCase()
    if (manifestPaths.has(normalizedPath)) {
      throw new Error(`Duplicate manifest path: ${file.path}`)
    }
    manifestPaths.add(normalizedPath)
    if (!file.sha256 || !/^[a-f0-9]{64}$/i.test(file.sha256)) {
      throw new Error(`File ${file.path} must include a SHA-256 hash.`)
    }
    if (manifest.artifactMode !== 'zip' && !file.url && !file.assetName) {
      throw new Error(`File ${file.path} must include a URL or release asset name.`)
    }
  }

  const installer = manifest.loader?.installer
  if (installer) {
    if (!installer.url && !installer.assetName) {
      throw new Error('NeoForge installer must include a URL or release asset name.')
    }
    if (!/^[a-f0-9]{64}$/i.test(installer.sha256)) {
      throw new Error('NeoForge installer must include a SHA-256 hash.')
    }
    if (!['client', 'server'].includes(installer.installMode)) {
      throw new Error('NeoForge installer mode must be client or server.')
    }
  }

  return { ...manifest, pack: normalizedPack }
}
