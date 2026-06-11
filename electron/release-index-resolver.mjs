// Shared ECHO Release Index resolver.
//
// This module is the single source of truth for catalog entry resolution,
// artifact selection, dependency closure, and echo:// deep-link validation.
// It is consumed by:
// - the Electron main process (electron/main.cjs via require)
// - the renderer (src/utils/releaseValidation.ts via re-export)
// - the Release Index local E2E (scripts/release-index-local-e2e.mjs)
// Keep it dependency-free and side-effect-free.

export const officialPackIds = ['ashfall-native-edition', 'ashfall-neoforge-edition', 'ashfall-standalone-edition']

export function normalizeOfficialPackId(pack) {
  if (pack === 'ashfall') return 'ashfall-native-edition'
  if (pack === 'ashfall-native-loader') return 'ashfall-native-edition'
  if (pack === 'ashfall-neoforge') return 'ashfall-neoforge-edition'
  if (pack === 'ashfall-standalone-runtime' || pack === 'standalone-runtime-showcase') return 'ashfall-standalone-edition'
  return officialPackIds.includes(pack) ? pack : undefined
}

export function canonicalArtifactRecords(artifacts) {
  const records = []
  const visit = (node, role = 'asset') => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, role))
      return
    }
    if (!node || typeof node !== 'object') return
    if (node.file || node.name || node.filename || node.url || node.sha256) {
      records.push({
        role,
        name: String(node.file ?? node.name ?? node.filename ?? role),
        url: node.url || node.downloadUrl ? String(node.url ?? node.downloadUrl) : undefined,
        size: node.size === undefined ? undefined : Number(node.size),
        sha256: node.sha256 ? String(node.sha256) : undefined,
        buildMode: node.buildMode ? String(node.buildMode) : undefined,
      })
    }
    for (const [key, value] of Object.entries(node)) visit(value, key)
  }
  visit(artifacts)
  return records
}

export function installableArtifactRecords(artifacts) {
  return canonicalArtifactRecords(artifacts).filter((artifact) => artifact.buildMode !== 'source-packaged')
}

export function artifactForPackTarget(entry, pack) {
  const target = normalizeOfficialPackId(pack)
  const artifacts = installableArtifactRecords(entry.artifacts)
  if (target === 'ashfall-neoforge-edition') return artifacts.find((artifact) => artifact.role === 'neoforge' || /-neoforge\.jar$/i.test(artifact.name)) ?? null
  if (target === 'ashfall-standalone-edition') return artifacts.find((artifact) => artifact.role === 'standalone' || /-standalone\.jar$/i.test(artifact.name)) ?? null
  return artifacts.find((artifact) => artifact.role === 'native' || /\.echo-addon$/i.test(artifact.name)) ?? null
}

export function dependencyClosure(entries, rootIds) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const seen = new Set()
  const out = []
  const visit = (id) => {
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

export function parseEchoProtocolUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(String(rawUrl))
  } catch {
    return null
  }
  if (parsed.protocol !== 'echo:') return null
  const parts = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)].filter(Boolean)
  if (parts[0] === 'install' && parts[1] === 'addon' && parts[2]) {
    return {
      rawUrl: String(rawUrl),
      action: 'install-addon',
      id: decodeURIComponent(parts[2]).toLowerCase(),
      pack: normalizeOfficialPackId(parsed.searchParams.get('pack') ?? undefined),
    }
  }
  if (parts[0] === 'update' && parts[1] === 'pack' && parts[2]) {
    return {
      rawUrl: String(rawUrl),
      action: 'update-pack',
      id: normalizeOfficialPackId(decodeURIComponent(parts[2])) ?? decodeURIComponent(parts[2]).toLowerCase(),
    }
  }
  return null
}

export function packManifestArtifact(entry) {
  const manifest = installableArtifactRecords(entry.artifacts)
    .find((artifact) => artifact.role === 'manifest' || /\.pack\.json$/i.test(artifact.name))
  if (!manifest?.url || !manifest.sha256) return null
  return manifest
}

export function resolveEchoProtocolEntry(rawUrl, entries) {
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
    const packEntry = entries.find((candidate) =>
      candidate.kind === 'modpack' &&
      candidate.validation === 'approved' &&
      candidate.id.toLowerCase() === targetPack,
    )
    if (!packEntry) return null
    const packAllowsEntry = (packEntry.dependencies ?? []).some((dependency) => String(dependency.id).toLowerCase() === entry.id.toLowerCase())
      || (entry.compatibility ?? []).map((item) => String(item).toLowerCase()).includes(targetPack)
    if (!packAllowsEntry) return null
    const artifact = artifactForPackTarget(entry, targetPack)
    if (!artifact?.url || !artifact.sha256) return null
    let dependencies
    try {
      dependencies = dependencyClosure(entries, [entry.id, packEntry.id])
        .filter((dependency) => dependency.id !== entry.id && dependency.id !== packEntry.id)
    } catch {
      return null
    }
    return {
      ...request,
      entry,
      packEntry,
      dependencies,
      artifact: {
        name: artifact.name,
        url: artifact.url,
        size: artifact.size ?? 0,
        sha256: artifact.sha256,
      },
    }
  }
  const manifest = packManifestArtifact(entry)
  if (!manifest) return null
  let dependencies
  try {
    dependencies = dependencyClosure(entries, [entry.id]).filter((dependency) => dependency.id !== entry.id)
  } catch {
    return null
  }
  return {
    ...request,
    entry,
    dependencies,
    artifact: {
      name: manifest.name,
      url: manifest.url,
      size: manifest.size ?? 0,
      sha256: manifest.sha256,
    },
  }
}

export function releaseEntryFromCanonicalModpack(entry, fetchedAt) {
  if (entry.kind !== 'modpack' || entry.validation !== 'approved') return null
  const artifacts = installableArtifactRecords(entry.artifacts)
  const manifest = packManifestArtifact(entry)
  if (!manifest) return null
  const sourceRepo = String(entry.sourceRepo)
  const releasePageUrl = `https://github.com/${sourceRepo}/releases/tag/${encodeURIComponent(entry.releaseTag)}`
  return {
    id: `release-index:${entry.id}:${entry.version}`,
    pack: normalizeOfficialPackId(entry.id) ?? entry.id,
    version: entry.version,
    channel: entry.channel,
    tagName: entry.releaseTag,
    name: `${entry.id} ${entry.version}`,
    draft: false,
    prerelease: entry.channel !== 'stable',
    publishedAt: entry.publishedAt ?? fetchedAt ?? new Date().toISOString(),
    releasePageUrl,
    releaseNotes: [`Resolved through the approved Catalog entry ${entry.id}.`],
    manifestAssetName: manifest.name,
    manifestUrl: manifest.url,
    manifestSha256: manifest.sha256,
    metadataUrl: undefined,
    trust: 'verified-metadata',
    assets: artifacts.map((artifact) => ({
      name: artifact.name,
      url: artifact.url ?? '',
      browser_download_url: artifact.url ?? '',
      size: artifact.size ?? 0,
      sha256: artifact.sha256,
      releaseTag: entry.releaseTag,
      releasePageUrl,
    })),
  }
}

function artifactToReleaseAsset(artifact) {
  if (!artifact.url || !artifact.sha256) return null
  return {
    name: artifact.name,
    url: artifact.url,
    size: artifact.size ?? 0,
    sha256: artifact.sha256,
  }
}

function isMetadataProductArtifact(artifact) {
  return /(?:latest\.ya?ml|\.blockmap|checksums?\.sha256|checksums?\.txt|license(?:\.|$))/iu.test(artifact.name)
}

export function productUpdateArtifact(entry, compatibility) {
  const artifacts = installableArtifactRecords(entry.artifacts)
  const usable = artifacts
    .map((artifact) => ({ artifact, releaseAsset: artifactToReleaseAsset(artifact) }))
    .filter((row) => Boolean(row.releaseAsset))
  if (!usable.length) return null
  const installable = usable.filter(({ artifact }) => !isMetadataProductArtifact(artifact))
  const normalizedCompatibility = String(compatibility ?? '').trim().toLowerCase()
  if (normalizedCompatibility) {
    const pools = [installable, usable].filter((pool) => pool.length)
    for (const pool of pools) {
      if (normalizedCompatibility === 'windows-x64') {
        const windowsArtifact = pool.find(({ artifact }) => {
          const haystack = `${artifact.role} ${artifact.name}`.toLowerCase()
          return /(?:windows|win|setup|installer|portable|\.exe)/iu.test(haystack)
        })
        if (windowsArtifact) return windowsArtifact.releaseAsset
      }
      if (normalizedCompatibility === 'linux-x64') {
        const linuxArtifact = pool.find(({ artifact }) => {
          const haystack = `${artifact.role} ${artifact.name}`.toLowerCase()
          return /(?:linux|appimage|\.appimage)/iu.test(haystack)
        })
        if (linuxArtifact) return linuxArtifact.releaseAsset
      }
    }
    const compatibilityTokens = normalizedCompatibility.split(/[^a-z0-9]+/u).filter(Boolean)
    const compatible = installable.find(({ artifact }) => {
      const haystack = `${artifact.role} ${artifact.name}`.toLowerCase()
      return compatibilityTokens.every((token) => haystack.includes(token))
        || (normalizedCompatibility === 'windows-x64' && /(windows|win|setup|installer).*x?64|x?64.*(windows|win|setup|installer)/iu.test(haystack))
    })
    if (compatible) return compatible.releaseAsset
  }
  return (installable[0] ?? usable[0]).releaseAsset
}

export function productUpdateEntry(entries, id, compatibility) {
  const productKinds = new Set(['product', 'runtime', 'studio', 'website'])
  const candidates = entries
    .filter((entry) => productKinds.has(entry.kind))
    .filter((entry) => entry.validation === 'approved')
    .filter((entry) => entry.id === id)
    .filter((entry) => !compatibility || entry.compatibility.includes(compatibility))
    .sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }))
  return candidates[0] ?? null
}

export function productUpdateSelection(entries, id, compatibility) {
  const productKinds = new Set(['product', 'runtime', 'studio', 'website'])
  const candidates = entries
    .filter((entry) => productKinds.has(entry.kind))
    .filter((entry) => entry.validation === 'approved')
    .filter((entry) => entry.id === id)
    .filter((entry) => !compatibility || entry.compatibility.includes(compatibility))
    .sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }))
  const warnings = []
  for (const entry of candidates) {
    const artifact = productUpdateArtifact(entry, compatibility)
    if (artifact) return { entry, artifact, warnings }
    warnings.push(`Release Index product ${entry.id} ${entry.version} has no indexed updater artifact${compatibility ? ` for ${compatibility}` : ''}.`)
  }
  return { entry: null, warnings }
}
