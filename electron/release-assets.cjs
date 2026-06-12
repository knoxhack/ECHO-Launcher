function normalizeSha256(value) {
  const text = String(value ?? '').trim()
  return /^[a-f0-9]{64}$/i.test(text) ? text.toLowerCase() : undefined
}

function githubAssetSha256(asset) {
  const match = String(asset?.digest ?? '').match(/^sha256:([a-f0-9]{64})$/i)
  return match?.[1]?.toLowerCase()
}

function releaseAssetSha256(asset) {
  return normalizeSha256(asset?.sha256) ?? githubAssetSha256(asset)
}

function releaseAssetUrl(asset) {
  return asset?.url ?? asset?.browser_download_url
}

function releasePathBasename(value) {
  return String(value ?? '').replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
}

function buildReleaseAssetLookup(assets = []) {
  const byName = new Map()
  const byBasenameAndSha256 = new Map()

  for (const asset of assets) {
    if (!asset?.name) continue
    byName.set(asset.name, asset)

    const basename = releasePathBasename(asset.name).toLowerCase()
    const sha256 = releaseAssetSha256(asset)
    if (basename && sha256) {
      byBasenameAndSha256.set(`${basename}:${sha256}`, asset)
    }
  }

  return { byName, byBasenameAndSha256 }
}

function ensureReleaseAssetLookup(assetsOrLookup) {
  if (assetsOrLookup?.byName && assetsOrLookup?.byBasenameAndSha256) return assetsOrLookup
  return buildReleaseAssetLookup(assetsOrLookup ?? [])
}

function findReleaseAssetForManifestFile(file, assetsOrLookup) {
  const lookup = ensureReleaseAssetLookup(assetsOrLookup)
  if (file?.assetName && lookup.byName.has(file.assetName)) return lookup.byName.get(file.assetName)

  const basename = releasePathBasename(file?.path).toLowerCase()
  const sha256 = normalizeSha256(file?.sha256)
  if (!basename || !sha256) return null
  return lookup.byBasenameAndSha256.get(`${basename}:${sha256}`) ?? null
}

function missingPerFileUpdateAssets(manifest, assetsOrLookup) {
  const lookup = ensureReleaseAssetLookup(assetsOrLookup)
  const missing = []
  for (const file of manifest?.files ?? []) {
    if (findReleaseAssetForManifestFile(file, lookup)) continue
    missing.push({
      path: file?.path,
      assetName: file?.assetName,
    })
  }
  return missing
}

function describeMissingPerFileUpdateAssets(missingFileAssets) {
  const preview = missingFileAssets
    .slice(0, 8)
    .map((file) => file.assetName ? `${file.path} (${file.assetName})` : `${file.path} (manifest file is missing assetName)`)
    .join(', ')
  const suffix = missingFileAssets.length > 8 ? `, and ${missingFileAssets.length - 8} more` : ''
  return `Per-file update assets are unavailable for ${missingFileAssets.length} pack file${missingFileAssets.length === 1 ? '' : 's'}: ${preview}${suffix}. Fresh installs can still use the verified full pack archive.`
}

function validateZipManifestReleaseAssets(manifest, entryAssets = []) {
  const reasons = []
  const warnings = []
  const lookup = buildReleaseAssetLookup(entryAssets)
  const artifact = manifest?.artifactName ? lookup.byName.get(manifest.artifactName) : null

  if (manifest?.artifactMode !== 'zip') {
    return { reasons, warnings, missingFileAssets: [] }
  }

  if (!artifact) {
    reasons.push(`Manifest names pack artifact '${manifest.artifactName}', but that asset is missing from the GitHub release.`)
  }
  const artifactSha256 = releaseAssetSha256(artifact)
  const manifestArtifactSha256 = normalizeSha256(manifest?.artifactSha256)
  if (artifactSha256 && manifestArtifactSha256 && artifactSha256 !== manifestArtifactSha256) {
    reasons.push(`Pack artifact SHA-256 mismatch for '${manifest.artifactName}': manifest has ${manifest.artifactSha256}, metadata has ${artifactSha256}.`)
  }

  const missingFileAssets = missingPerFileUpdateAssets(manifest, lookup)
  if (missingFileAssets.length) {
    warnings.push(describeMissingPerFileUpdateAssets(missingFileAssets))
  }

  return { reasons, warnings, missingFileAssets }
}

function moduleArtifactFamilyForPack(pack) {
  if (String(pack ?? '').endsWith('-neoforge-edition')) return 'neoforge'
  if (String(pack ?? '').endsWith('-standalone-edition')) return 'standalone'
  return 'echo-addon'
}

function moduleArtifactName(moduleId, version, family) {
  const id = String(moduleId ?? '').trim().toLowerCase()
  const moduleVersion = String(version ?? '').trim()
  if (!id || !moduleVersion) return ''
  if (family === 'neoforge') return `${id}-${moduleVersion}-neoforge.jar`
  if (family === 'standalone') return `${id}-${moduleVersion}-standalone.jar`
  return `${id}-${moduleVersion}.echo-addon`
}

function moduleArtifactPath(assetName, family) {
  if (!assetName) return ''
  return family === 'echo-addon' ? `addons/${assetName}` : `mods/${assetName}`
}

function normalizeModuleRequirement(requirement, manifest = {}) {
  if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) return null
  const moduleId = String(requirement.id ?? requirement.moduleId ?? '').trim().toLowerCase()
  const version = String(requirement.version ?? '').trim()
  if (!moduleId || !version) return null
  const family = String(
    requirement.artifactFamily ?? requirement.family ?? manifest.moduleArtifactFamily ?? moduleArtifactFamilyForPack(manifest.pack),
  ).trim().toLowerCase()
  const assetName = String(requirement.assetName ?? requirement.artifactName ?? moduleArtifactName(moduleId, version, family)).trim()
  const path = String(requirement.path ?? moduleArtifactPath(assetName, family)).trim()
  return {
    moduleId,
    version,
    family,
    assetName,
    path,
    required: requirement.required !== false,
    side: requirement.side ?? 'both',
    sha256: normalizeSha256(requirement.sha256),
    size: Number.isFinite(Number(requirement.size)) ? Number(requirement.size) : undefined,
  }
}

function normalizeModuleRequirements(manifest = {}) {
  return (manifest.moduleRequirements ?? manifest.requiredModules ?? [])
    .map((requirement) => normalizeModuleRequirement(requirement, manifest))
    .filter(Boolean)
}

function moduleCatalogFromReleaseAssets(releaseAssets = []) {
  const byName = new Map()
  for (const asset of releaseAssets) {
    if (!asset?.name) continue
    byName.set(asset.name, asset)
  }
  return { byName }
}

function resolveModuleRequirement(requirement, catalog) {
  const asset = catalog.byName.get(requirement.assetName)
  if (!asset) {
    throw new Error(`Module artifact '${requirement.assetName}' was not found in the ECHO-Modules release feed.`)
  }
  const sha256 = requirement.sha256 ?? releaseAssetSha256(asset)
  if (!sha256) {
    throw new Error(`Module artifact '${requirement.assetName}' is missing a SHA-256 hash.`)
  }
  return {
    path: requirement.path,
    assetName: requirement.assetName,
    url: releaseAssetUrl(asset),
    sha256,
    size: requirement.size ?? asset.size ?? 0,
    required: requirement.required,
    moduleId: requirement.moduleId,
    side: requirement.side,
  }
}

function resolveModuleRequirements(manifest = {}, releaseAssets = []) {
  const requirements = normalizeModuleRequirements(manifest)
  if (!requirements.length) return manifest
  const catalog = moduleCatalogFromReleaseAssets(releaseAssets)
  const existingPaths = new Set((manifest.files ?? []).map((file) => releasePathBasename(file?.path ? String(file.path).replace(/\\/g, '/').toLowerCase() : '')))
  const existingFullPaths = new Set((manifest.files ?? []).map((file) => String(file?.path ?? '').replace(/\\/g, '/').toLowerCase()))
  const moduleFiles = []
  for (const requirement of requirements) {
    const resolved = resolveModuleRequirement(requirement, catalog)
    const normalizedPath = resolved.path.replace(/\\/g, '/').toLowerCase()
    if (existingFullPaths.has(normalizedPath) || existingPaths.has(releasePathBasename(normalizedPath))) continue
    existingFullPaths.add(normalizedPath)
    moduleFiles.push(resolved)
  }
  return {
    ...manifest,
    modules: [...new Set([...(manifest.modules ?? []), ...requirements.map((item) => item.moduleId)])],
    files: [...(manifest.files ?? []), ...moduleFiles],
  }
}

module.exports = {
  buildReleaseAssetLookup,
  findReleaseAssetForManifestFile,
  githubAssetSha256,
  moduleArtifactFamilyForPack,
  moduleArtifactName,
  normalizeModuleRequirements,
  releaseAssetSha256,
  releaseAssetUrl,
  resolveModuleRequirements,
  validateZipManifestReleaseAssets,
}
