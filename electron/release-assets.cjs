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

const ECHO_MODULE_RELEASE_DOWNLOAD_TAGS = [
  'modules-arcana-division-1.0.0-beta',
  'sky-relay-0.1.0-alpha',
  'galactic-survey-0.1.0-alpha',
  'modules-v0.1.0-alpha',
  'modules-source-packaged-0.1.0',
]

function moduleReleaseDownloadUrl(tag, assetName) {
  return `https://github.com/knoxhack/ECHO-Modules/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`
}

function releaseAssetUrls(asset) {
  return [
    asset?.browser_download_url,
    asset?.browserDownloadUrl,
    asset?.url,
    ...(Array.isArray(asset?.urls) ? asset.urls : []),
  ]
    .map((url) => String(url ?? '').trim())
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url, index, urls) => urls.indexOf(url) === index)
}

function releaseAssetUrl(asset) {
  return releaseAssetUrls(asset)[0]
}

function moduleArtifactFallbackUrls(assetName) {
  const name = String(assetName ?? '').trim()
  if (!name || /[<>=]/u.test(name)) return []
  return ECHO_MODULE_RELEASE_DOWNLOAD_TAGS.map((tag) => moduleReleaseDownloadUrl(tag, name))
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

function resolveManifestReleaseAssets(manifest, entryAssets = []) {
  const lookup = buildReleaseAssetLookup(entryAssets)
  const artifact =
    manifest?.artifactMode === 'zip' && manifest?.artifactName && lookup.byName.has(manifest.artifactName)
      ? lookup.byName.get(manifest.artifactName)
      : null
  const files = (manifest?.files ?? []).map((file) => {
    const asset = findReleaseAssetForManifestFile(file, lookup)
    if (!asset) return file
    const urls = releaseAssetUrls(asset)
    const url = urls[0]
    return {
      ...file,
      ...(url ? { url } : {}),
      ...(urls.length > 1 ? { urls } : {}),
      size: file.size || asset.size,
    }
  })
  const loader = manifest?.loader && typeof manifest.loader === 'object' && !Array.isArray(manifest.loader)
    ? manifest.loader
    : manifest?.loader
  const installer = loader && typeof loader === 'object' && !Array.isArray(loader)
    ? loader.installer
    : undefined
  const installerAsset = installer?.assetName ? lookup.byName.get(installer.assetName) : null
  const installerUrls = releaseAssetUrls(installerAsset)
  const installerUrl = installerUrls[0]
  const resolvedInstaller = installerAsset
    ? {
        ...installer,
        ...(installerUrl ? { url: installerUrl } : {}),
        ...(installerUrls.length > 1 ? { urls: installerUrls } : {}),
        size: installer.size || installerAsset.size,
      }
    : installer
  return {
    ...manifest,
    artifactUrl: releaseAssetUrl(artifact) ?? manifest?.artifactUrl,
    artifactSize: artifact?.size ?? manifest?.artifactSize,
    files,
    loader: loader && typeof loader === 'object' && !Array.isArray(loader)
      ? {
          ...loader,
          installer: resolvedInstaller,
        }
      : loader,
  }
}

function moduleArtifactFamilyForPack(pack) {
  const normalizedPack = String(pack ?? '').trim().toLowerCase()
  if (normalizedPack.endsWith('-neoforge-edition')) return 'neoforge'
  if (normalizedPack.endsWith('-standalone-edition') || normalizedPack.endsWith('-standalone-engine-edition')) return 'standalone'
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
    if (!byName.has(asset.name)) byName.set(asset.name, asset)
  }
  return { byName, assets: releaseAssets.filter((asset) => asset?.name) }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function moduleArtifactPattern(moduleId, family) {
  const id = escapeRegExp(moduleId)
  if (family === 'echo-addon') return new RegExp(`^${id}-.+\\.echo-addon$`, 'iu')
  if (family === 'standalone') return new RegExp(`^${id}-.+-standalone\\.jar$`, 'iu')
  return new RegExp(`^${id}-.+-neoforge\\.jar$`, 'iu')
}

function moduleArtifactFamilyFromAssetName(assetName) {
  const name = String(assetName ?? '').trim().toLowerCase()
  if (name.endsWith('.echo-addon')) return 'echo-addon'
  if (name.endsWith('-standalone.jar')) return 'standalone'
  if (name.endsWith('-neoforge.jar')) return 'neoforge'
  return undefined
}

function moduleIdFromArtifactName(assetName, fallback = '') {
  const name = String(assetName ?? '').trim().toLowerCase()
  const normalizedFallback = String(fallback ?? '').trim().toLowerCase()
  if (!name) return normalizedFallback
  const match = name.match(/^([a-z0-9_.-]+?)-\d/u)
  return match?.[1] ?? normalizedFallback
}

function moduleReleaseAssetsFromMetadata(metadata, releaseTag) {
  const tag = String(releaseTag ?? metadata?.releaseId ?? '').trim()
  if (!tag || !Array.isArray(metadata?.modules)) return []
  const assets = []
  for (const moduleEntry of metadata.modules) {
    const moduleId = String(moduleEntry?.moduleId ?? moduleEntry?.id ?? '').trim().toLowerCase()
    for (const artifact of moduleEntry?.artifacts ?? []) {
      const name = String(artifact?.filename ?? artifact?.file ?? artifact?.name ?? '').trim()
      const sha256 = normalizeSha256(artifact?.sha256)
      if (!name || !sha256) continue
      const url = String(artifact?.downloadUrl ?? artifact?.url ?? '').trim()
      const publicUrl = /^https?:\/\//i.test(url) ? url : moduleReleaseDownloadUrl(tag, name)
      const kind = String(artifact?.kind ?? '').trim().toLowerCase()
      assets.push({
        name,
        url: publicUrl,
        browser_download_url: publicUrl,
        sha256,
        size: Number.isFinite(Number(artifact?.size)) ? Number(artifact.size) : 0,
        moduleId: moduleId || moduleIdFromArtifactName(name),
        family: kind === 'native' ? 'echo-addon' : (kind || moduleArtifactFamilyFromAssetName(name)),
        releaseTag: tag,
      })
    }
  }
  return assets
}

function moduleReleaseAssetsFromChecksumText(text, releaseTag) {
  const tag = String(releaseTag ?? '').trim()
  if (!tag) return []
  return String(text ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .map((line) => line.match(/^([a-f0-9]{64})\s+\*?(.+)$/iu))
    .filter(Boolean)
    .map((match) => {
      const filePath = String(match[2] ?? '').replace(/\\/g, '/')
      const name = releasePathBasename(filePath)
      const moduleId = filePath.includes('/') ? filePath.split('/')[0].toLowerCase() : moduleIdFromArtifactName(name)
      return {
        name,
        url: moduleReleaseDownloadUrl(tag, name),
        browser_download_url: moduleReleaseDownloadUrl(tag, name),
        sha256: match[1].toLowerCase(),
        size: 0,
        moduleId,
        family: moduleArtifactFamilyFromAssetName(name),
        releaseTag: tag,
      }
    })
    .filter((asset) => asset.name && asset.family)
}

function findModuleArtifactForRequirement(requirement, catalog) {
  const pattern = moduleArtifactPattern(requirement.moduleId, requirement.family)
  return (catalog.assets ?? []).find((asset) => pattern.test(asset.name)) ?? null
}

function resolveModuleRequirement(requirement, catalog) {
  let asset = catalog.byName.get(requirement.assetName)
  let assetName = requirement.assetName
  let artifactPath = requirement.path
  if (!asset) {
    asset = findModuleArtifactForRequirement(requirement, catalog)
    if (asset?.name) {
      assetName = asset.name
      artifactPath = moduleArtifactPath(assetName, requirement.family)
    }
  }
  const fallbackUrls = asset ? [] : moduleArtifactFallbackUrls(assetName)
  if (!asset && !fallbackUrls.length) {
    throw new Error(`Module artifact '${requirement.assetName}' was not found in the ECHO-Modules release feed.`)
  }
  const sha256 = releaseAssetSha256(asset) ?? requirement.sha256
  if (!sha256) {
    throw new Error(`Module artifact '${assetName}' is missing a SHA-256 hash.`)
  }
  const urls = asset ? releaseAssetUrls(asset) : fallbackUrls
  return {
    path: artifactPath,
    assetName,
    url: urls[0],
    ...(urls.length > 1 ? { urls } : {}),
    sha256,
    size: asset?.size ?? requirement.size ?? 0,
    required: requirement.required,
    moduleId: requirement.moduleId,
    side: requirement.side,
  }
}

function moduleRequirementInstallPath(requirement) {
  return String(requirement.path ?? moduleArtifactPath(requirement.assetName, requirement.family)).replace(/\\/g, '/')
}

function moduleRequirementMetadata(requirement, resolvedFile) {
  return {
    id: requirement.moduleId,
    version: requirement.version,
    artifactFamily: requirement.family,
    assetName: resolvedFile?.assetName ?? requirement.assetName,
    path: resolvedFile?.path ?? requirement.path,
    sha256: resolvedFile?.sha256 ?? requirement.sha256,
    size: resolvedFile?.size ?? requirement.size,
    required: requirement.required,
    side: requirement.side,
  }
}

function normalizedReleasePath(value) {
  return String(value ?? '').replace(/\\/g, '/').toLowerCase()
}

function findModuleFileIndex(files, expectedPath, assetName) {
  const normalizedExpectedPath = normalizedReleasePath(expectedPath)
  const expectedBasename = releasePathBasename(normalizedExpectedPath)
  const expectedAssetName = releasePathBasename(String(assetName ?? '').toLowerCase())
  return files.findIndex((file) => {
    const filePath = normalizedReleasePath(file?.path)
    const fileBasename = releasePathBasename(filePath)
    const fileAssetName = releasePathBasename(String(file?.assetName ?? '').toLowerCase())
    return (
      (normalizedExpectedPath && filePath === normalizedExpectedPath) ||
      (expectedBasename && fileBasename === expectedBasename) ||
      (expectedAssetName && fileAssetName === expectedAssetName) ||
      (expectedAssetName && fileBasename === expectedAssetName)
    )
  })
}

function mergeResolvedModuleFile(file, resolved) {
  const next = {
    ...file,
    path: resolved.path,
    assetName: resolved.assetName,
    sha256: resolved.sha256,
    size: resolved.size,
    required: resolved.required,
    moduleId: resolved.moduleId,
    side: resolved.side,
  }
  if (resolved.url) {
    next.url = resolved.url
  } else {
    delete next.url
  }
  if (Array.isArray(resolved.urls) && resolved.urls.length > 1) {
    next.urls = resolved.urls
  } else {
    delete next.urls
  }
  return next
}

function resolveModuleRequirements(manifest = {}, releaseAssets = []) {
  const requirements = normalizeModuleRequirements(manifest)
  if (!requirements.length) return manifest
  const catalog = moduleCatalogFromReleaseAssets(releaseAssets)
  const files = [...(manifest.files ?? [])]
  const resolvedRequirements = []
  for (const requirement of requirements) {
    const expectedPath = moduleRequirementInstallPath(requirement)
    const matchingAsset = catalog.byName.get(requirement.assetName) ?? findModuleArtifactForRequirement(requirement, catalog)
    let resolved = matchingAsset ? resolveModuleRequirement(requirement, catalog) : null
    let existingIndex = findModuleFileIndex(files, resolved?.path ?? expectedPath, resolved?.assetName ?? requirement.assetName)
    if (existingIndex >= 0) {
      if (resolved) files[existingIndex] = mergeResolvedModuleFile(files[existingIndex], resolved)
      resolvedRequirements.push(moduleRequirementMetadata(requirement, resolved ?? files[existingIndex]))
      continue
    }
    resolved = resolved ?? resolveModuleRequirement(requirement, catalog)
    existingIndex = findModuleFileIndex(files, resolved.path, resolved.assetName)
    if (existingIndex >= 0) {
      files[existingIndex] = mergeResolvedModuleFile(files[existingIndex], resolved)
      resolvedRequirements.push(moduleRequirementMetadata(requirement, resolved))
      continue
    }
    files.push(resolved)
    resolvedRequirements.push(moduleRequirementMetadata(requirement, resolved))
  }
  return {
    ...manifest,
    modules: [...new Set([...(manifest.modules ?? []), ...requirements.map((item) => item.moduleId)])],
    moduleRequirements: resolvedRequirements,
    files,
  }
}

module.exports = {
  buildReleaseAssetLookup,
  ECHO_MODULE_RELEASE_DOWNLOAD_TAGS,
  findReleaseAssetForManifestFile,
  githubAssetSha256,
  moduleArtifactFamilyForPack,
  moduleArtifactName,
  moduleReleaseAssetsFromChecksumText,
  moduleReleaseAssetsFromMetadata,
  normalizeModuleRequirements,
  releaseAssetSha256,
  releaseAssetUrl,
  releaseAssetUrls,
  resolveManifestReleaseAssets,
  resolveModuleRequirements,
  validateZipManifestReleaseAssets,
}
