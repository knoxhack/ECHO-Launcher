import AdmZip from 'adm-zip'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const OFFICIAL_PACKS = [
  ['ashfall-native-edition', 'Ashfall Native Edition', 'native', 'ashfall-native'],
  ['ashfall-neoforge-edition', 'Ashfall NeoForge Edition', 'neoforge', 'ashfall-neoforge'],
  ['ashfall-standalone-edition', 'Ashfall Standalone Edition', 'standalone', 'ashfall-standalone'],
  ['sky-relay-native-edition', 'Sky Relay Native Edition', 'native', 'sky-relay-native'],
  ['sky-relay-neoforge-edition', 'Sky Relay NeoForge Edition', 'neoforge', 'sky-relay-neoforge'],
  ['sky-relay-standalone-edition', 'Sky Relay Standalone Edition', 'standalone', 'sky-relay-standalone'],
  ['galactic-survey-native-edition', 'Galactic Survey Native Edition', 'native', 'galactic-survey-native'],
  ['galactic-survey-neoforge-edition', 'Galactic Survey NeoForge Edition', 'neoforge', 'galactic-survey-neoforge'],
  ['galactic-survey-standalone-edition', 'Galactic Survey Standalone Edition', 'standalone', 'galactic-survey-standalone'],
  ['openlands-native-edition', 'Openlands Native Edition', 'native', 'openlands-native'],
  ['openlands-neoforge-edition', 'Openlands NeoForge Edition', 'neoforge', 'openlands-neoforge'],
  ['openlands-standalone-edition', 'Openlands Standalone Edition', 'standalone', 'openlands-standalone'],
  ['arcana-division-native-edition', 'Arcana Division Native Edition', 'native', 'arcana-division-native'],
  ['arcana-division-neoforge-edition', 'Arcana Division NeoForge Edition', 'neoforge', 'arcana-division-neoforge'],
  ['arcana-division-standalone-edition', 'Arcana Division Standalone Edition', 'standalone', 'arcana-division-standalone'],
].map(([profileId, name, lane, modpackName]) => ({ profileId, name, lane, modpackName }))

const REQUIRED_ARTIFACT_ROLES = ['pack', 'manifest', 'checksums', 'releaseManifest']
const NEOFORGE_INSTALLER_CACHE = new Map()
const NEOFORGE_VERSION_BY_MINECRAFT_VERSION = new Map([['26.1.2', '26.1.2.43-beta']])

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    releaseIndexRoot: path.resolve(root, '..', 'ECHO-Release-Index'),
    cacheRoot: path.resolve(root, 'tmp', 'all-modpacks-pipeline-audit'),
    out: path.resolve(root, '..', 'ECHO-Release-Index', 'release-readiness', 'all-modpacks-pipeline-audit.json'),
    clean: false,
    packIds: [],
    skipZip: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--release-index-root') args.releaseIndexRoot = path.resolve(next())
    else if (arg === '--cache-root') args.cacheRoot = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--pack') args.packIds.push(next())
    else if (arg === '--clean') args.clean = true
    else if (arg === '--skip-zip') args.skipZip = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function usage() {
  return `Usage: node scripts/audit-all-modpacks-pipeline.mjs [options]

Audits all official ECHO modpacks from Release Index through install manifest,
pack zip, file hashes, lane metadata, module feed coverage, and runtime handoff
metadata assumptions.

Options:
  --release-index-root <dir>  Default: ../ECHO-Release-Index
  --cache-root <dir>          Default: tmp/all-modpacks-pipeline-audit
  --out <file>                Default: ../ECHO-Release-Index/release-readiness/all-modpacks-pipeline-audit.json
  --pack <profileId>          Limit to one pack. Can be repeated.
  --clean                     Remove cache root first.
  --skip-zip                  Skip pack zip download/open/hash checks.
`
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function sha1(bytes) {
  return crypto.createHash('sha1').update(bytes).digest('hex')
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'echo-all-modpacks-pipeline-audit' } })
  if (!response.ok) throw new Error(`GET ${url} failed HTTP ${response.status}: ${await response.text()}`)
  return Buffer.from(await response.arrayBuffer())
}

async function cachedDownload(args, artifact, role, packId) {
  const cachePath = path.join(args.cacheRoot, packId, `${role}-${artifact.file}`)
  if (await exists(cachePath)) {
    const bytes = await fs.readFile(cachePath)
    if ((!artifact.sha256 || sha256(bytes) === artifact.sha256) && (!artifact.size || bytes.length === artifact.size)) {
      return { bytes, cachePath, downloaded: false }
    }
  }
  const bytes = await fetchBytes(artifact.url)
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.writeFile(cachePath, bytes)
  return { bytes, cachePath, downloaded: true }
}

function artifactForRole(entry, role) {
  const artifact = entry.artifacts?.[role]
  if (!artifact) return null
  return {
    role,
    file: artifact.file,
    url: artifact.url,
    sha256: String(artifact.sha256 ?? '').toLowerCase(),
    size: Number(artifact.size ?? 0),
  }
}

function checksumRows(text) {
  const rows = new Map()
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/iu)
    if (match) rows.set(match[2].trim(), match[1].toLowerCase())
  }
  return rows
}

function laneFilePattern(lane) {
  if (lane === 'native') return /^addons\/.+\.echo-addon$/iu
  if (lane === 'neoforge') return /^mods\/.+\.jar$/iu
  return /^mods\/.+\.jar$/iu
}

function laneArtifactKey(lane) {
  if (lane === 'native') return 'native'
  return lane
}

function minecraftVersionFromManifest(manifest) {
  const value = manifest.minecraft
  if (typeof value === 'string' && value.trim() && value !== 'Standalone') return value.trim()
  if (value && typeof value === 'object' && typeof value.version === 'string') return value.version.trim()
  return manifest.loader?.versionJson?.inheritsFrom ?? manifest.nativeLoader?.versionJson?.inheritsFrom ?? null
}

function normalizePackRootModulePath(file, pack) {
  const relative = String(file?.path ?? '').replace(/\\/g, '/')
  if (!relative.toLowerCase().startsWith('pack-root/')) return null
  if (!file?.moduleId) return null
  const name = path.basename(relative)
  if (pack.lane === 'native' && /\.echo-addon$/iu.test(name)) return `addons/${name}`
  if ((pack.lane === 'neoforge' || pack.lane === 'standalone') && /\.jar$/iu.test(name)) return `mods/${name}`
  return null
}

function normalizeAuditManifest(manifest, pack, warnings) {
  if (!manifest || typeof manifest !== 'object') return manifest
  for (const file of manifest.files ?? []) {
    const targetPath = normalizePackRootModulePath(file, pack)
    if (!targetPath) continue
    const archivePath = String(file.path ?? '').replace(/\\/g, '/')
    if (archivePath === targetPath) continue
    file.archivePath = file.archivePath ?? archivePath
    file.path = targetPath
    warnings.push(`Legacy pack-root module ${archivePath} normalizes to installed path ${targetPath}.`)
  }
  if (pack.lane === 'neoforge' && manifest.loader && typeof manifest.loader === 'object') {
    const rawVersion = String(manifest.loader.version ?? '').trim()
    const normalizedVersion = NEOFORGE_VERSION_BY_MINECRAFT_VERSION.get(rawVersion)
    if (normalizedVersion) {
      manifest.loader.version = normalizedVersion
      warnings.push(`Legacy NeoForge loader ${rawVersion} normalizes to ${normalizedVersion}.`)
      const installer = manifest.loader.installer
      const installerSha = String(installer?.sha256 ?? '').toLowerCase()
      const staleInstallerName = installer?.assetName && !String(installer.assetName).includes(normalizedVersion)
      if (/^f{64}$/iu.test(installerSha) || staleInstallerName) {
        delete manifest.loader.installer
        warnings.push(`Legacy NeoForge installer metadata ignored; launcher resolves official installer ${normalizedVersion}.`)
      }
    }
  }
  return manifest
}

function modpackFileForProfile(profileId) {
  return `${profileId.replace(/-edition$/u, '').replace(/-native$/u, '-native')}.json`
}

async function readCatalog(args) {
  const channel = await readJson(path.join(args.releaseIndexRoot, 'channels', 'alpha', 'launcher-channel.json'))
  const moduleEntries = new Map()
  for (const folder of ['modules', 'addons']) {
    const root = path.join(args.releaseIndexRoot, folder)
    const names = await fs.readdir(root).catch(() => [])
    for (const name of names.filter((entry) => entry.endsWith('.json'))) {
      const entry = await readJson(path.join(root, name))
      moduleEntries.set(entry.id, entry)
    }
  }
  return { channel, moduleEntries }
}

function channelPack(channel, profileId) {
  return (channel.packs ?? []).find((pack) => pack.id === profileId)
}

function validateArtifactMetadata(issues, entry, pack) {
  const artifacts = {}
  for (const role of REQUIRED_ARTIFACT_ROLES) {
    const artifact = artifactForRole(entry, role)
    artifacts[role] = artifact
    if (!artifact) {
      issues.push(`Missing ${role} artifact metadata.`)
      continue
    }
    if (!artifact.file) issues.push(`${role} artifact is missing file.`)
    if (!/^https?:\/\//iu.test(artifact.url ?? '')) issues.push(`${role} artifact ${artifact.file} has no HTTP(S) URL.`)
    if (!/^[a-f0-9]{64}$/iu.test(artifact.sha256 ?? '')) issues.push(`${role} artifact ${artifact.file} has invalid SHA-256.`)
    if (!Number.isFinite(artifact.size) || artifact.size <= 0) issues.push(`${role} artifact ${artifact.file} has invalid size.`)
  }
  if (entry.validation !== 'approved') issues.push(`Catalog modpack validation is ${entry.validation ?? 'missing'}, expected approved.`)
  if (pack?.catalogStatus !== 'approved') issues.push(`Launcher channel catalogStatus is ${pack?.catalogStatus ?? 'missing'}, expected approved.`)
  return artifacts
}

function validateDownloadedArtifact(issues, artifact, bytes) {
  const actualSha = sha256(bytes)
  if (artifact.sha256 && actualSha !== artifact.sha256) issues.push(`${artifact.role} ${artifact.file} SHA-256 mismatch: ${actualSha} != ${artifact.sha256}.`)
  if (artifact.size && bytes.length !== artifact.size) issues.push(`${artifact.role} ${artifact.file} size mismatch: ${bytes.length} != ${artifact.size}.`)
  return { sha256: actualSha, size: bytes.length }
}

function validateInstallManifest(issues, warnings, pack, entry, manifest, artifacts) {
  if (manifest.pack !== pack.profileId) issues.push(`Install manifest pack is ${manifest.pack ?? 'missing'}, expected ${pack.profileId}.`)
  if (manifest.artifactMode !== 'zip') issues.push(`Install manifest artifactMode is ${manifest.artifactMode ?? 'missing'}, expected zip.`)
  if (manifest.artifactName !== artifacts.pack?.file) issues.push(`Install manifest artifactName is ${manifest.artifactName ?? 'missing'}, expected ${artifacts.pack?.file}.`)
  if (String(manifest.artifactSha256 ?? '').toLowerCase() !== artifacts.pack?.sha256) issues.push('Install manifest artifactSha256 does not match catalog pack hash.')
  if (Number(manifest.artifactSize ?? 0) !== artifacts.pack?.size) issues.push('Install manifest artifactSize does not match catalog pack size.')
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) issues.push('Install manifest has no files.')
  const inferredRequirements = legacyModuleRequirementsFromFiles(manifest, pack)
  if (!Array.isArray(manifest.moduleRequirements) || manifest.moduleRequirements.length === 0) {
    if (inferredRequirements.length > 0) {
      warnings.push(`Install manifest has no moduleRequirements; launcher can infer ${inferredRequirements.length} requirement(s) from module files.`)
      manifest.moduleRequirements = inferredRequirements
    } else {
      issues.push('Install manifest has no moduleRequirements and none can be inferred from module files.')
    }
  }
  const minecraftVersion = minecraftVersionFromManifest(manifest)
  if (pack.lane !== 'standalone' && !minecraftVersion) issues.push('Minecraft Launcher pack manifest requires a Minecraft version.')
  if (pack.lane === 'native') {
    if (manifest.runtimeTarget !== 'echo_native') warnings.push(`Native runtimeTarget is ${manifest.runtimeTarget ?? 'missing'}, expected echo_native.`)
    if (!manifest.nativeLoader?.version) issues.push('Native manifest is missing nativeLoader.version.')
    const artifact = manifest.nativeLoader?.versionJson?.libraries?.find((library) => library?.name === 'com.echo:native-loader:1.0.1')?.downloads?.artifact
    if (!artifact?.url || artifact.url.startsWith('file:')) warnings.push('Native Loader versionJson is missing a public native-loader artifact URL; launcher must inject verified Native Loader metadata before handoff.')
    if (!artifact?.sha1 || !artifact?.size) warnings.push('Native Loader versionJson is missing native-loader SHA-1 or size; launcher must inject verified Native Loader metadata before handoff.')
  }
  if (pack.lane === 'neoforge') {
    if (!manifest.loader?.version) issues.push('NeoForge manifest is missing loader.version.')
    if (!minecraftVersion) issues.push('NeoForge manifest is missing Minecraft version/inheritsFrom.')
    const versionJson = manifest.loader?.versionJson
    if (!versionJson?.id || !versionJson?.mainClass || !versionJson?.arguments || !Array.isArray(versionJson?.libraries)) {
      warnings.push('NeoForge manifest loader.versionJson is incomplete; ECHO Launcher must replace it with official installer metadata before handoff.')
    } else if (!Array.isArray(versionJson.arguments.game) || !versionJson.arguments.game.includes('--fml.neoForgeVersion')) {
      warnings.push('NeoForge manifest loader.versionJson is a launcher stub; ECHO Launcher must replace it with official installer metadata before handoff.')
    }
  }
  if (pack.lane === 'standalone') {
    if (manifest.runtimeTarget !== 'echo_runtime_standalone') warnings.push(`Standalone runtimeTarget is ${manifest.runtimeTarget ?? 'missing'}, expected echo_runtime_standalone.`)
    if (manifest.loader !== 'echo-standalone-runtime') warnings.push(`Standalone manifest loader is ${manifest.loader ?? 'missing'}, expected echo-standalone-runtime; launcher profile runtimeMode must select standalone runtime.`)
  }
  const expectedPattern = laneFilePattern(pack.lane)
  for (const file of manifest.files ?? []) {
    const relative = String(file.path ?? '').replace(/\\/g, '/')
    if (!relative || relative.startsWith('/') || relative.includes('..')) issues.push(`Unsafe or missing file path: ${file.path ?? 'missing'}.`)
    if (file.required !== false && file.moduleId && /^(addons|mods|pack-root)\//iu.test(relative) && !expectedPattern.test(relative)) issues.push(`${relative} does not match ${pack.lane} lane module file family.`)
    if (!/^[a-f0-9]{64}$/iu.test(String(file.sha256 ?? ''))) issues.push(`${relative} has invalid SHA-256.`)
    if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) issues.push(`${relative} has invalid size.`)
  }
  return { minecraftVersion }
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

function legacyModuleRequirementsFromFiles(manifest, pack) {
  const byModule = new Map()
  const family = pack.lane === 'native' ? 'echo-addon' : pack.lane
  for (const file of manifest?.files ?? []) {
    const filePath = String(file?.path ?? '').replace(/\\/g, '/')
    if (!/^(addons|mods)\//iu.test(filePath)) continue
    const moduleId = String(file?.moduleId ?? '').trim().toLowerCase()
    if (!moduleId || byModule.has(moduleId)) continue
    const version = inferModuleRequirementVersion(file, moduleId)
    if (!version) continue
    byModule.set(moduleId, {
      id: moduleId,
      version,
      artifactFamily: filePath.toLowerCase().startsWith('addons/') ? 'echo-addon' : family,
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

function validateModuleCoverage(warnings, pack, manifest, moduleEntries) {
  const bundledModuleIds = new Set((manifest.files ?? []).map((file) => file.moduleId).filter(Boolean))
  const required = []
  for (const requirement of manifest.moduleRequirements ?? []) {
    const id = String(requirement.id ?? '').trim()
    if (!id) {
      warnings.push('Module requirement is missing id.')
      continue
    }
    const entry = moduleEntries.get(id)
    const artifact = entry?.artifacts?.[laneArtifactKey(pack.lane)]
    const bundled = bundledModuleIds.has(id)
    const status = artifact?.url && artifact?.sha256 ? 'feed' : bundled ? 'pack-bundled' : 'missing'
    if (status === 'missing') warnings.push(`${id} has no ${pack.lane} module-feed artifact and is not bundled in the pack payload.`)
    if (status === 'pack-bundled') warnings.push(`${id} has no ${pack.lane} module-feed artifact; install relies on the pack-bundled file.`)
    required.push({
      id,
      requestedVersion: requirement.version ?? null,
      catalogValidation: entry?.validation ?? null,
      catalogReleaseTag: entry?.releaseTag ?? null,
      status,
      bundled,
      artifact: artifact
        ? {
            file: artifact.file,
            url: artifact.url,
            sha256: artifact.sha256,
            size: artifact.size,
          }
        : null,
    })
  }
  return required
}

function validateZipPayload(issues, zipBytes, manifest) {
  const zip = new AdmZip(zipBytes)
  const entries = new Map(zip.getEntries().filter((entry) => !entry.isDirectory).map((entry) => [entry.entryName.replace(/\\/g, '/'), entry]))
  const files = []
  for (const file of manifest.files ?? []) {
    if (file.required === false) continue
    const relative = String(file.path ?? '').replace(/\\/g, '/')
    const archivePath = String(file.archivePath ?? file.path ?? '').replace(/\\/g, '/')
    const entry = entries.get(archivePath)
    if (!entry) {
      issues.push(`Pack zip is missing ${archivePath} for installed path ${relative}.`)
      continue
    }
    const data = entry.getData()
    const actualSha = sha256(data)
    if (actualSha !== String(file.sha256 ?? '').toLowerCase()) issues.push(`Pack zip file ${archivePath} SHA-256 mismatch: ${actualSha} != ${file.sha256}.`)
    if (Number(file.size ?? 0) !== data.length) issues.push(`Pack zip file ${archivePath} size mismatch: ${data.length} != ${file.size}.`)
    files.push({ path: relative, archivePath, size: data.length, sha256: actualSha })
  }
  return { entryCount: entries.size, fileCount: files.length, files }
}

function neoforgeMavenBase(version) {
  const encoded = encodeURIComponent(version)
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${encoded}/neoforge-${encoded}`
}

async function neoforgeInstallerMetadata(version) {
  if (NEOFORGE_INSTALLER_CACHE.has(version)) return NEOFORGE_INSTALLER_CACHE.get(version)
  const url = `${neoforgeMavenBase(version)}-installer.jar`
  const shaText = (await fetchBytes(`${url}.sha256`)).toString('utf8').trim().split(/\s+/u)[0].toLowerCase()
  const bytes = await fetchBytes(url)
  const actualSha = sha256(bytes)
  const zip = new AdmZip(bytes)
  const versionEntry = zip.getEntry('version.json')
  const installProfileEntry = zip.getEntry('install_profile.json')
  const versionJson = versionEntry ? JSON.parse(versionEntry.getData().toString('utf8')) : null
  const installProfile = installProfileEntry ? JSON.parse(installProfileEntry.getData().toString('utf8')) : null
  const metadata = {
    url,
    sha256: actualSha,
    expectedSha256: shaText,
    size: bytes.length,
    hashOk: actualSha === shaText,
    versionJson: versionJson
      ? {
          id: versionJson.id,
          inheritsFrom: versionJson.inheritsFrom,
          mainClass: versionJson.mainClass,
          libraryCount: versionJson.libraries?.length ?? 0,
          hasFmlArgs: Array.isArray(versionJson.arguments?.game) && versionJson.arguments.game.includes('--fml.neoForgeVersion'),
          downloadableLibraryCount: (versionJson.libraries ?? []).filter((library) => library.downloads?.artifact?.url).length,
        }
      : null,
    installerLibraryCount: installProfile?.libraries?.length ?? 0,
    installerHasPatchedClientProcessor: JSON.stringify(installProfile ?? {}).includes('minecraft-client-patched'),
  }
  NEOFORGE_INSTALLER_CACHE.set(version, metadata)
  return metadata
}

async function auditPack(args, pack, catalog) {
  const issues = []
  const warnings = []
  const entryPath = path.join(args.releaseIndexRoot, 'modpacks', `${pack.modpackName}.json`)
  const entry = await readJson(entryPath)
  const channelEntry = channelPack(catalog.channel, pack.profileId)
  if (!channelEntry) issues.push('Pack is missing from launcher channel.')
  if (entry.id !== pack.profileId) issues.push(`Modpack entry id is ${entry.id}, expected ${pack.profileId}.`)
  const artifacts = validateArtifactMetadata(issues, entry, channelEntry)
  const downloads = {}
  let manifest = null
  let checksums = null
  let releaseManifest = null

  for (const role of ['manifest', 'checksums', 'releaseManifest']) {
    const artifact = artifacts[role]
    if (!artifact) continue
    const downloaded = await cachedDownload(args, artifact, role, pack.profileId)
    downloads[role] = { cachePath: downloaded.cachePath, downloaded: downloaded.downloaded, ...validateDownloadedArtifact(issues, artifact, downloaded.bytes) }
    if (role === 'manifest') manifest = JSON.parse(downloaded.bytes.toString('utf8'))
    if (role === 'checksums') checksums = checksumRows(downloaded.bytes.toString('utf8'))
    if (role === 'releaseManifest') releaseManifest = JSON.parse(downloaded.bytes.toString('utf8'))
  }

  if (checksums) {
    for (const role of ['manifest', 'pack', 'releaseManifest']) {
      const artifact = artifacts[role]
      if (!artifact) continue
      const checksum = checksums.get(artifact.file)
      if (!checksum) issues.push(`checksums.txt does not list ${artifact.file}.`)
      else if (checksum !== artifact.sha256) issues.push(`checksums.txt hash for ${artifact.file} does not match catalog.`)
    }
  }

  if (releaseManifest?.assets) {
    for (const role of ['manifest', 'pack']) {
      const artifact = artifacts[role]
      const actual = releaseManifest.assets.find((asset) => asset.name === artifact?.file)
      if (!actual) issues.push(`echo-release.json does not list ${artifact?.file}.`)
      else if (actual.sha256 && actual.sha256 !== artifact.sha256) issues.push(`echo-release.json hash for ${artifact.file} does not match catalog.`)
    }
  } else if (releaseManifest?.artifacts?.pack && releaseManifest?.artifacts?.manifest) {
    warnings.push('echo-release.json uses legacy artifacts map instead of assets array; canonical Release Index metadata supplies install assets.')
  } else {
    issues.push('echo-release.json has no assets array.')
  }

  let installManifest = null
  let moduleCoverage = []
  let zipPayload = null
  let neoforge = null
  if (manifest) {
    manifest = normalizeAuditManifest(manifest, pack, warnings)
    installManifest = {
      pack: manifest.pack,
      name: manifest.name,
      version: manifest.version,
      channel: manifest.channel,
      runtimeTarget: manifest.runtimeTarget,
      loader: pack.lane === 'neoforge' ? manifest.loader?.version : manifest.loader,
      minecraftVersion: minecraftVersionFromManifest(manifest),
      artifactMode: manifest.artifactMode,
      artifactName: manifest.artifactName,
      fileCount: manifest.files?.filter((file) => file.required !== false).length ?? 0,
      moduleRequirementCount: manifest.moduleRequirements?.length ?? 0,
    }
    validateInstallManifest(issues, warnings, pack, entry, manifest, artifacts)
    moduleCoverage = validateModuleCoverage(warnings, pack, manifest, catalog.moduleEntries)
    if (pack.lane === 'neoforge' && manifest.loader?.version) {
      try {
        neoforge = await neoforgeInstallerMetadata(manifest.loader.version)
        if (!neoforge.hashOk) issues.push(`NeoForge installer ${manifest.loader.version} SHA-256 does not match Maven checksum.`)
        if (!neoforge.versionJson?.hasFmlArgs) issues.push(`NeoForge installer ${manifest.loader.version} version.json is missing FML args.`)
        if (!neoforge.versionJson?.downloadableLibraryCount) issues.push(`NeoForge installer ${manifest.loader.version} version.json has no downloadable libraries.`)
      } catch (error) {
        issues.push(`NeoForge installer metadata for ${manifest.loader.version} is not resolvable: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  if (!args.skipZip && artifacts.pack && manifest) {
    const downloaded = await cachedDownload(args, artifacts.pack, 'pack', pack.profileId)
    downloads.pack = { cachePath: downloaded.cachePath, downloaded: downloaded.downloaded, ...validateDownloadedArtifact(issues, artifacts.pack, downloaded.bytes) }
    zipPayload = validateZipPayload(issues, downloaded.bytes, manifest)
  }

  return {
    profileId: pack.profileId,
    name: pack.name,
    lane: pack.lane,
    ok: issues.length === 0,
    issues,
    warnings,
    catalog: {
      modpackValidation: entry.validation,
      modpackTrust: entry.trust,
      releaseTag: entry.releaseTag,
      sourceRepo: entry.sourceRepo,
      channelCatalogStatus: channelEntry?.catalogStatus ?? null,
      channelManifestUrl: channelEntry?.manifestUrl ?? null,
      channelCatalogEntryUrl: channelEntry?.catalogEntryUrl ?? null,
    },
    artifacts,
    downloads,
    installManifest,
    moduleCoverage,
    zipPayload,
    neoforge,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (args.clean) await fs.rm(args.cacheRoot, { recursive: true, force: true })
  await fs.mkdir(args.cacheRoot, { recursive: true })

  const selected = args.packIds.length ? OFFICIAL_PACKS.filter((pack) => args.packIds.includes(pack.profileId)) : OFFICIAL_PACKS
  if (!selected.length) throw new Error(`No official packs matched: ${args.packIds.join(', ')}`)

  const catalog = await readCatalog(args)
  const report = {
    schemaVersion: 'echo.all-modpacks-pipeline-audit.v1',
    ok: false,
    generatedAt: new Date().toISOString(),
    releaseIndexRoot: args.releaseIndexRoot,
    cacheRoot: args.cacheRoot,
    packs: [],
    summary: {},
  }
  for (const pack of selected) {
    const result = await auditPack(args, pack, catalog)
    report.packs.push(result)
    await writeJson(args.out, report)
    const icon = result.ok ? 'PASS' : 'FAIL'
    console.log(`${icon} ${result.name}: ${result.issues.length} issue(s), ${result.warnings.length} warning(s)`)
    for (const issue of result.issues.slice(0, 5)) console.log(`  issue: ${issue}`)
    for (const warning of result.warnings.slice(0, 3)) console.log(`  warning: ${warning}`)
  }
  report.summary = {
    total: report.packs.length,
    passed: report.packs.filter((pack) => pack.ok).length,
    failed: report.packs.filter((pack) => !pack.ok).length,
    warnings: report.packs.reduce((total, pack) => total + pack.warnings.length, 0),
  }
  report.ok = report.summary.failed === 0
  report.completedAt = new Date().toISOString()
  await writeJson(args.out, report)
  if (!report.ok) {
    throw new Error(`All-modpacks pipeline audit failed for ${report.summary.failed}/${report.summary.total} pack(s). Report: ${args.out}`)
  }
  console.log(`All-modpacks pipeline audit passed: ${args.out}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
