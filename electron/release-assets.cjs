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

module.exports = {
  buildReleaseAssetLookup,
  findReleaseAssetForManifestFile,
  githubAssetSha256,
  releaseAssetSha256,
  releaseAssetUrl,
  validateZipManifestReleaseAssets,
}
