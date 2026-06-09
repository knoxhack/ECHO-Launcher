import type { Channel } from '../types/launcher'
import type { OfficialPackId, PackManifest } from '../types/manifests'
import type { CanonicalProductUpdate, CanonicalReleaseIndexEntry, ReleaseAsset, ReleaseEntry, ReleaseFeedConfig, ReleaseIndex } from '../types/releases'

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

export function moduleArtifactFamilyForPack(pack: OfficialPackId) {
  if (pack === 'ashfall-neoforge-edition') return 'neoforge'
  if (pack === 'ashfall-standalone-edition') return 'standalone'
  return 'echo-addon'
}

export function moduleArtifactName(moduleId: string, version: string, family: string) {
  const id = moduleId.trim().toLowerCase()
  if (family === 'neoforge') return `${id}-${version}-neoforge.jar`
  if (family === 'standalone') return `${id}-${version}-standalone.jar`
  return `${id}-${version}.echo-addon`
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
  const moduleRequirements = manifest.moduleRequirements ?? manifest.requiredModules
  if (moduleRequirements !== undefined && !Array.isArray(moduleRequirements)) {
    throw new Error('Manifest moduleRequirements must be an array.')
  }
  for (const requirement of moduleRequirements ?? []) {
    const moduleId = String(requirement.id ?? requirement.moduleId ?? '').trim()
    if (!moduleId) {
      throw new Error('Module requirements must include an id or moduleId.')
    }
    if (!requirement.version || typeof requirement.version !== 'string') {
      throw new Error(`Module requirement ${moduleId} must include a version.`)
    }
    const family = requirement.artifactFamily ?? requirement.family ?? moduleArtifactFamilyForPack(normalizedPack)
    const artifactName = requirement.assetName ?? requirement.artifactName ?? moduleArtifactName(moduleId, requirement.version, family)
    const artifactPath = requirement.path ?? (family === 'echo-addon' ? `addons/${artifactName}` : `mods/${artifactName}`)
    if (!isSafeRelativePath(artifactPath)) {
      throw new Error(`Unsafe module artifact path: ${artifactPath}`)
    }
    if (requirement.sha256 && !/^[a-f0-9]{64}$/i.test(requirement.sha256)) {
      throw new Error(`Module requirement ${moduleId} has an invalid SHA-256 hash.`)
    }
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

export type CanonicalArtifactRecord = {
  role: string
  name: string
  url?: string
  size?: number
  sha256?: string
  buildMode?: string
}

export type ArtifactChecksumStatus = {
  ok: boolean
  expected: string
  actual: string
  reason?: string
}

export type RollbackPlanInput = {
  installId: string
  operation: 'install' | 'update' | 'repair' | string
  installPath: string
  backedUp: Array<{ path: string; backupPath: string }>
  removed?: string[]
  createdAt: string
}

export type RollbackPlanSnapshot = RollbackPlanInput & {
  removed: string[]
}

export type EchoProtocolRequest =
  | { rawUrl: string; action: 'install-addon'; id: string; pack?: OfficialPackId }
  | { rawUrl: string; action: 'update-pack'; id: string }

export function canonicalArtifactRecords(artifacts: unknown): CanonicalArtifactRecord[] {
  const records: CanonicalArtifactRecord[] = []
  const visit = (node: unknown, role = 'asset') => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, role))
      return
    }
    if (!node || typeof node !== 'object') return
    const row = node as Record<string, unknown>
    if (row.file || row.name || row.filename || row.url || row.sha256) {
      records.push({
        role,
        name: String(row.file ?? row.name ?? row.filename ?? role),
        url: row.url || row.downloadUrl ? String(row.url ?? row.downloadUrl) : undefined,
        size: row.size === undefined ? undefined : Number(row.size),
        sha256: row.sha256 ? String(row.sha256) : undefined,
        buildMode: row.buildMode ? String(row.buildMode) : undefined,
      })
    }
    for (const [key, value] of Object.entries(row)) visit(value, key)
  }
  visit(artifacts)
  return records
}

export function releaseEntryFromCanonicalModpack(entry: CanonicalReleaseIndexEntry, fetchedAt: string): ReleaseEntry | null {
  if (entry.kind !== 'modpack' || entry.validation !== 'approved') return null
  const artifacts = canonicalArtifactRecords(entry.artifacts)
  const manifest = artifacts.find((artifact) => artifact.role === 'manifest' || /\.pack\.json$/i.test(artifact.name))
  if (!manifest?.url || !manifest.sha256) return null
  const releasePageUrl = `https://github.com/${entry.sourceRepo}/releases/tag/${encodeURIComponent(entry.releaseTag)}`
  return {
    id: `release-index:${entry.id}:${entry.version}`,
    pack: normalizeOfficialPackId(entry.id),
    version: entry.version,
    channel: entry.channel as Channel,
    tagName: entry.releaseTag,
    name: `${entry.id} ${entry.version}`,
    draft: false,
    prerelease: entry.channel !== 'stable',
    publishedAt: fetchedAt,
    releasePageUrl,
    releaseNotes: [`Resolved through ECHO Release Index entry ${entry.id}.`],
    manifestAssetName: manifest.name,
    manifestUrl: manifest.url,
    manifestSha256: manifest.sha256,
    trust: 'verified-metadata',
    assets: artifacts.map((artifact) => ({
      name: artifact.name,
      url: artifact.url ?? '',
      size: artifact.size ?? 0,
      sha256: artifact.sha256,
    })),
  }
}

export function artifactForPackTarget(entry: CanonicalReleaseIndexEntry, pack: string): CanonicalArtifactRecord | null {
  const target = normalizeOfficialPackId(pack)
  const artifacts = canonicalArtifactRecords(entry.artifacts)
  if (target === 'ashfall-neoforge-edition') return artifacts.find((artifact) => artifact.role === 'neoforge' || /-neoforge\.jar$/i.test(artifact.name)) ?? null
  if (target === 'ashfall-standalone-edition') return artifacts.find((artifact) => artifact.role === 'standalone' || /-standalone\.jar$/i.test(artifact.name)) ?? null
  return artifacts.find((artifact) => artifact.role === 'native' || /\.echo-addon$/i.test(artifact.name)) ?? null
}

export function parseEchoProtocolUrl(rawUrl: string): EchoProtocolRequest | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'echo:') return null
  const parts = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)].filter(Boolean)
  if (parts[0] === 'install' && parts[1] === 'addon' && parts[2]) {
    return {
      rawUrl,
      action: 'install-addon',
      id: decodeURIComponent(parts[2]).toLowerCase(),
      pack: normalizeOfficialPackId(parsed.searchParams.get('pack') ?? undefined),
    }
  }
  if (parts[0] === 'update' && parts[1] === 'pack' && parts[2]) {
    return {
      rawUrl,
      action: 'update-pack',
      id: normalizeOfficialPackId(decodeURIComponent(parts[2])) ?? decodeURIComponent(parts[2]).toLowerCase(),
    }
  }
  return null
}

export function resolveEchoProtocolEntry(rawUrl: string, entries: CanonicalReleaseIndexEntry[]) {
  const request = parseEchoProtocolUrl(rawUrl)
  if (!request) return null
  const entry = entries.find((candidate) => {
    if (candidate.validation !== 'approved') return false
    if (request.action === 'install-addon') {
      return (candidate.kind === 'addon' || candidate.kind === 'module') && candidate.id.toLowerCase() === request.id
    }
    return candidate.kind === 'modpack' && candidate.id.toLowerCase() === request.id.toLowerCase()
  })
  if (!entry) return null
  if (request.action === 'install-addon') {
    const targetPack = request.pack ?? 'ashfall-native-edition'
    const artifact = artifactForPackTarget(entry, targetPack)
    if (!artifact?.url || !artifact.sha256) return null
    return {
      ...request,
      entry,
      artifact: {
        name: artifact.name,
        url: artifact.url,
        size: artifact.size ?? 0,
        sha256: artifact.sha256,
      },
    }
  }
  return { ...request, entry }
}

export function dependencyClosure(entries: CanonicalReleaseIndexEntry[], rootIds: string[]): CanonicalReleaseIndexEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const seen = new Set<string>()
  const out: CanonicalReleaseIndexEntry[] = []
  const visit = (id: string) => {
    if (seen.has(id)) return
    const entry = byId.get(id)
    if (!entry) throw new Error(`Missing Release Index dependency ${id}.`)
    if (entry.validation === 'blocked') throw new Error(`Blocked Release Index dependency ${id}.`)
    if (entry.validation !== 'approved') throw new Error(`Unapproved Release Index dependency ${id}.`)
    seen.add(id)
    for (const dependency of entry.dependencies ?? []) visit(dependency.id)
    out.push(entry)
  }
  rootIds.forEach(visit)
  return out
}

export function artifactChecksumStatus(expectedSha256: string | undefined, actualSha256: string | undefined): ArtifactChecksumStatus {
  const expected = String(expectedSha256 ?? '').trim().toLowerCase()
  const actual = String(actualSha256 ?? '').trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/i.test(expected)) {
    return { ok: false, expected, actual, reason: 'Expected SHA-256 is missing or invalid.' }
  }
  if (!/^[a-f0-9]{64}$/i.test(actual)) {
    return { ok: false, expected, actual, reason: 'Actual SHA-256 is missing or invalid.' }
  }
  if (expected !== actual) {
    return { ok: false, expected, actual, reason: `SHA-256 mismatch: expected ${expected}, got ${actual}.` }
  }
  return { ok: true, expected, actual }
}

function artifactToReleaseAsset(artifact: CanonicalArtifactRecord): ReleaseAsset | null {
  if (!artifact.url || !artifact.sha256) return null
  return {
    name: artifact.name,
    url: artifact.url,
    size: artifact.size ?? 0,
    sha256: artifact.sha256,
  }
}

export function productUpdateArtifact(entry: CanonicalReleaseIndexEntry, compatibility?: string): ReleaseAsset | null {
  const artifacts = canonicalArtifactRecords(entry.artifacts)
  const usable = artifacts
    .map((artifact) => ({ artifact, releaseAsset: artifactToReleaseAsset(artifact) }))
    .filter((row): row is { artifact: CanonicalArtifactRecord; releaseAsset: ReleaseAsset } => Boolean(row.releaseAsset))
  if (!usable.length) return null
  const normalizedCompatibility = String(compatibility ?? '').trim().toLowerCase()
  if (normalizedCompatibility) {
    const compatibilityTokens = normalizedCompatibility.split(/[^a-z0-9]+/u).filter(Boolean)
    const compatible = usable.find(({ artifact }) => {
      const haystack = `${artifact.role} ${artifact.name}`.toLowerCase()
      return compatibilityTokens.every((token) => haystack.includes(token))
        || (normalizedCompatibility === 'windows-x64' && /(windows|win|setup|installer).*x?64|x?64.*(windows|win|setup|installer)/iu.test(haystack))
    })
    if (compatible) return compatible.releaseAsset
  }
  return usable[0].releaseAsset
}

export function rollbackPlanSnapshot(input: RollbackPlanInput): RollbackPlanSnapshot {
  if (!input.installId.trim()) throw new Error('Rollback plan requires an installId.')
  if (!input.installPath.trim()) throw new Error('Rollback plan requires an installPath.')
  const backedUp = input.backedUp.map((item) => {
    if (!item.path.trim() || !item.backupPath.trim()) throw new Error('Rollback backup entries require path and backupPath.')
    return {
      path: item.path.replace(/\\/g, '/'),
      backupPath: item.backupPath,
    }
  })
  return {
    installId: input.installId,
    operation: input.operation,
    installPath: input.installPath,
    backedUp,
    removed: (input.removed ?? []).map((item) => item.replace(/\\/g, '/')).sort(),
    createdAt: input.createdAt,
  }
}

export function productUpdateEntry(entries: CanonicalReleaseIndexEntry[], id: string, compatibility?: string): CanonicalReleaseIndexEntry | null {
  const productKinds = new Set(['product', 'runtime', 'studio', 'website'])
  const candidates = entries
    .filter((entry) => productKinds.has(entry.kind))
    .filter((entry) => entry.validation === 'approved')
    .filter((entry) => entry.id === id)
    .filter((entry) => !compatibility || entry.compatibility.includes(compatibility))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
  return candidates[0] ?? null
}

export function productUpdateSelection(entries: CanonicalReleaseIndexEntry[], id: string, compatibility?: string): CanonicalProductUpdate {
  const productKinds = new Set(['product', 'runtime', 'studio', 'website'])
  const candidates = entries
    .filter((entry) => productKinds.has(entry.kind))
    .filter((entry) => entry.validation === 'approved')
    .filter((entry) => entry.id === id)
    .filter((entry) => !compatibility || entry.compatibility.includes(compatibility))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))

  const warnings: string[] = []
  for (const entry of candidates) {
    const artifact = productUpdateArtifact(entry, compatibility)
    if (artifact) return { entry, artifact, warnings }
    warnings.push(`Release Index product ${entry.id} ${entry.version} has no indexed updater artifact${compatibility ? ` for ${compatibility}` : ''}.`)
  }
  return { entry: null, warnings }
}
