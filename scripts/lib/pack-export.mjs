import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const DEFAULT_ASHFALL_SOURCE = 'C:\\CurseForge\\Instances\\Ashfall Protocol'
export const DEFAULT_RELEASE_VERSION = '1.2.0-beta.1'
export const DEFAULT_RELEASE_CHANNEL = 'alpha'
export const DEFAULT_OUTPUT_DIR = 'release-artifacts'
export const RELEASE_METADATA_ASSET = 'echo-release.json'
export const ECHO_PACK_EXTENSION = '.echo-pack.zip'
export const DEFAULT_ASHFALL_PACK_ID = 'ashfall-neoforge-edition'
export const DEFAULT_ASHFALL_PACK_NAME = 'Ashfall NeoForge Edition'
export const ECHO_NATIVE_LOADER_DOWNLOAD_URL = 'https://github.com/knoxhack/ECHO-Native-Platform/releases/download/v1.0.3/echo-native-loader-1.0.3.jar'
export const ECHO_NATIVE_LOADER_SHA1 = 'f00b56bb967bc2d5233888aa95facc545849b419'
export const ECHO_NATIVE_LOADER_SIZE = 1_833_864

export const INCLUDE_DIRS = ['mods', 'config', 'defaultconfigs', 'datapacks', 'resourcepacks', 'shaderpacks']

export const EXCLUDED_TOP_LEVEL = new Set([
  '.cache',
  '.curseclient',
  '.echo',
  'backups',
  'cache',
  'crash-reports',
  'debug',
  'downloads',
  'logs',
  'saves',
  'screenshots',
  'usercache.json',
  'usernamecache.json',
  'minecraftinstance.json',
  'launcher_profiles.json',
  'launcher_profiles_microsoft_store.json',
  'servers.dat',
  'options.txt',
  'optionsof.txt',
  'realms_persistence.json',
  'command_history.txt',
])

const EXCLUDED_SUFFIXES = ['.tmp', '.lock', '.old']
const EXPLICIT_EXTRA_FILES = new Set(['servers.dat'])

export function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

export function isSafeRelativePath(value) {
  if (!value || typeof value !== 'string' || value.includes('\0')) {
    return false
  }
  if (/^[a-z]:/i.test(value) || value.startsWith('/') || value.startsWith('\\')) {
    return false
  }
  return value
    .replace(/\\/g, '/')
    .split('/')
    .every((part) => part && part !== '.' && part !== '..')
}

function normalizedPathKey(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function assertInsideRoot(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  const rootKey = normalizedPathKey(resolvedRoot)
  const targetKey = normalizedPathKey(resolvedTarget)
  if (targetKey !== rootKey && !targetKey.startsWith(`${rootKey}${path.sep}`)) {
    throw new Error(`Extra export path must be inside the Ashfall instance: ${target}`)
  }
  return resolvedTarget
}

function normalizeRelativePath(relativePath) {
  return toPosixPath(relativePath).replace(/^\/+/, '')
}

function normalizePackId(pack = DEFAULT_ASHFALL_PACK_ID) {
  return pack === 'ashfall' || pack === 'ashfall-stable' || pack === 'ashfall-neoforge' ? DEFAULT_ASHFALL_PACK_ID : pack
}

function hasExcludedSuffix(relativePath) {
  const lower = relativePath.toLowerCase()
  return EXCLUDED_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

function isExcludedRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  if (!isSafeRelativePath(normalized)) {
    return true
  }
  const topLevel = normalized.split('/')[0]?.toLowerCase()
  return Boolean(topLevel && EXCLUDED_TOP_LEVEL.has(topLevel)) || hasExcludedSuffix(normalized)
}

function normalizeTextLines(value, fallback = []) {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/u) : fallback
  const lines = source.map((line) => String(line).trim()).filter(Boolean)
  return lines.length > 0 ? lines : fallback
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath)
  return sha256Buffer(buffer)
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function inferModuleId(relativePath) {
  const normalized = relativePath.toLowerCase()
  if (!normalized.startsWith('mods/')) {
    return normalized.split('/')[0] || 'ashfall'
  }

  const fileName = path.basename(normalized, '.jar')
  const withoutVersion = fileName.replace(/[-_]?v?\d[\w.+-]*$/u, '')
  return withoutVersion || fileName
}

export function inferSide(relativePath) {
  const normalized = relativePath.toLowerCase()
  if (normalized.includes('client') || normalized.includes('shaderpacks') || normalized.includes('resourcepacks')) {
    return 'client'
  }
  if (normalized.includes('server')) {
    return 'server'
  }
  return 'both'
}

export function fileAssetName(relativePath, sha256) {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Unsafe pack file path discovered: ${relativePath}`)
  }
  const hashPrefix = String(sha256 ?? '').slice(0, 12) || 'unhashed'
  const safePath = relativePath
    .replace(/\\/g, '/')
    .replace(/[^a-z0-9._/-]/gi, '-')
    .replace(/\//g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const extension = path.extname(safePath)
  const stem = extension ? safePath.slice(0, -extension.length) : safePath
  const maxStemLength = 180
  const truncatedStem = stem.length > maxStemLength ? stem.slice(0, maxStemLength) : stem
  return `file-${hashPrefix}-${truncatedStem}${extension}`
}

export function releaseAssetRecordForFile(file) {
  const name = file.assetName ?? fileAssetName(file.relativePath ?? file.path, file.sha256)
  return {
    name,
    role: 'pack-file',
    path: file.relativePath ?? file.path,
    sha256: file.sha256,
    size: file.size,
  }
}

function isPackModJar(file) {
  return /^mods\/[^/]+\.jar$/iu.test(file.relativePath ?? file.path ?? '')
}

function neededJarOutputName(file, usedNames) {
  const relativePath = file.relativePath ?? file.path
  const baseName = path.basename(relativePath)
  const normalized = baseName.toLowerCase()
  if (!usedNames.has(normalized)) {
    usedNames.add(normalized)
    return baseName
  }
  const fallback = file.assetName ?? fileAssetName(relativePath, file.sha256)
  usedNames.add(fallback.toLowerCase())
  return fallback
}

async function copyNeededJars(files, outputDir) {
  const neededJarsPath = path.join(outputDir, 'needed-jars')
  const jarFiles = files.filter(isPackModJar)
  await fs.rm(neededJarsPath, { recursive: true, force: true })
  await fs.mkdir(neededJarsPath, { recursive: true })
  const usedNames = new Set()
  const copied = []
  for (const file of jarFiles) {
    const name = neededJarOutputName(file, usedNames)
    const destination = path.join(neededJarsPath, name)
    await fs.copyFile(file.absolutePath, destination)
    copied.push({
      name,
      path: destination,
      packPath: file.relativePath ?? file.path,
      size: file.size,
      sha256: file.sha256,
    })
  }
  return { neededJarsPath, neededJarsCount: copied.length, copied }
}

export function shouldIncludeRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  if (!isSafeRelativePath(normalized)) {
    return false
  }
  const parts = normalized.split('/')
  if (!INCLUDE_DIRS.includes(parts[0])) {
    return false
  }
  return !isExcludedRelativePath(normalized)
}

async function walkDirectory(root, current, results) {
  const entries = await fs.readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name)
    const relativePath = toPosixPath(path.relative(root, absolutePath))
    if (entry.isDirectory()) {
      if (EXCLUDED_TOP_LEVEL.has(entry.name.toLowerCase())) {
        continue
      }
      await walkDirectory(root, absolutePath, results)
      continue
    }

    if (entry.isFile() && shouldIncludeRelativePath(relativePath)) {
      const stats = await fs.stat(absolutePath)
      results.push({
        absolutePath,
        relativePath,
        size: stats.size,
        sha256: await sha256File(absolutePath),
      })
    }
  }
}

export async function discoverPackFiles(sourcePath) {
  const results = []
  for (const folder of INCLUDE_DIRS) {
    const folderPath = path.join(sourcePath, folder)
    if (await fileExists(folderPath)) {
      await walkDirectory(sourcePath, folderPath, results)
    }
  }
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function shouldIncludeExtraRelativePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  return isSafeRelativePath(normalized) && !isExcludedRelativePath(normalized)
}

function shouldIncludeExplicitExtraFile(relativePath) {
  const normalized = normalizeRelativePath(relativePath).toLowerCase()
  return isSafeRelativePath(normalized) && !normalized.includes('/') && EXPLICIT_EXTRA_FILES.has(normalized)
}

async function packFileRecord(absolutePath, relativePath) {
  const stats = await fs.stat(absolutePath)
  return {
    absolutePath,
    relativePath: normalizeRelativePath(relativePath),
    size: stats.size,
    sha256: await sha256File(absolutePath),
  }
}

async function walkExtraDirectory(root, current, results) {
  const entries = await fs.readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name)
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath))
    if (entry.isDirectory()) {
      if (isExcludedRelativePath(relativePath)) {
        continue
      }
      await walkExtraDirectory(root, absolutePath, results)
      continue
    }
    if (entry.isFile() && shouldIncludeExtraRelativePath(relativePath)) {
      results.push(await packFileRecord(absolutePath, relativePath))
    }
  }
}

async function collectExtraPackFiles(sourcePath, extraIncludePaths = []) {
  const files = []
  const warnings = []
  const seenTargets = new Set()
  for (const candidate of extraIncludePaths.filter(Boolean)) {
    const target = assertInsideRoot(sourcePath, candidate)
    const key = normalizedPathKey(target)
    if (seenTargets.has(key)) {
      continue
    }
    seenTargets.add(key)
    const stats = await fs.stat(target).catch(() => null)
    if (!stats) {
      throw new Error(`Extra export path was not found: ${candidate}`)
    }
    const relativePath = normalizeRelativePath(path.relative(sourcePath, target))
    if (stats.isDirectory()) {
      if (relativePath && isExcludedRelativePath(relativePath)) {
        warnings.push(`Skipped excluded extra folder: ${relativePath}`)
        continue
      }
      await walkExtraDirectory(sourcePath, target, files)
    } else if (stats.isFile()) {
      if (!shouldIncludeExtraRelativePath(relativePath) && !shouldIncludeExplicitExtraFile(relativePath)) {
        warnings.push(`Skipped excluded extra file: ${relativePath}`)
        continue
      }
      files.push(await packFileRecord(target, relativePath))
    }
  }
  return { files, warnings }
}

function dedupePackFiles(files) {
  const byPath = new Map()
  for (const file of files) {
    const key = normalizeRelativePath(file.relativePath).toLowerCase()
    if (!byPath.has(key)) {
      byPath.set(key, { ...file, relativePath: normalizeRelativePath(file.relativePath) })
    }
  }
  return [...byPath.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function includedTopLevelForFiles(files) {
  const topLevels = new Set(files.map((file) => file.relativePath.split('/')[0]).filter(Boolean))
  const defaults = INCLUDE_DIRS.filter((folder) => topLevels.has(folder))
  const extras = [...topLevels].filter((folder) => !INCLUDE_DIRS.includes(folder)).sort()
  return [...defaults, ...extras]
}

function normalizeArgumentList(value) {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry
        }
        if (entry && typeof entry.value === 'string') {
          return entry.value
        }
        if (entry && Array.isArray(entry.value)) {
          return entry.value.filter((item) => typeof item === 'string')
        }
        return []
      })
      .flat()
  }
  return []
}

export function validateCurseForgeInstance(instance, sourcePath) {
  const missing = []
  if (!instance || typeof instance !== 'object') {
    throw new Error(`minecraftinstance.json parsed incomplete for ${sourcePath}: expected an object.`)
  }
  if (!instance.minecraftVersion || typeof instance.minecraftVersion !== 'string') missing.push('minecraftVersion')
  if (!instance.loaderVersion || typeof instance.loaderVersion !== 'string') missing.push('loaderVersion')
  if (!instance.minecraftLauncherVersionId || typeof instance.minecraftLauncherVersionId !== 'string') missing.push('minecraftLauncherVersionId')
  if (!instance.mainClass || typeof instance.mainClass !== 'string') missing.push('mainClass')
  if (!instance.versionJson || typeof instance.versionJson !== 'object') missing.push('versionJson')
  if (missing.length > 0) {
    throw new Error(`minecraftinstance.json parsed incomplete for ${sourcePath}: missing ${missing.join(', ')}.`)
  }
  return instance
}

export async function readCurseForgeInstance(sourcePath) {
  const instancePath = path.join(sourcePath, 'minecraftinstance.json')
  const raw = await fs.readFile(instancePath, 'utf8')
  const instance = JSON.parse(raw)
  const loader = instance.baseModLoader ?? {}
  const versionJson = typeof loader.versionJson === 'string' ? JSON.parse(loader.versionJson) : (loader.versionJson ?? {})
  const installProfileJson = typeof loader.installProfileJson === 'string' ? JSON.parse(loader.installProfileJson) : (loader.installProfileJson ?? null)
  const minecraftVersion = instance.baseModLoader?.minecraftVersion ?? instance.minecraftVersion ?? versionJson.inheritsFrom
  const loaderVersion = loader.forgeVersion ?? loader.name?.replace(/^neoforge-/u, '') ?? versionJson.id?.replace(/^neoforge-/u, '')
  const mainClass = versionJson.mainClass ?? 'net.neoforged.fml.startup.Client'
  const gameArgs = normalizeArgumentList(versionJson.arguments?.game)
  const jvmArgs = normalizeArgumentList(versionJson.arguments?.jvm)

  return validateCurseForgeInstance({
    name: instance.name ?? 'Ashfall Protocol',
    minecraftVersion,
    loaderVersion,
    minecraftLauncherVersionId: loader.name ?? versionJson.id ?? `neoforge-${loaderVersion}`,
    allocatedMemoryMb: instance.allocatedMemory ?? 6912,
    versionJson,
    installProfileJson,
    mainClass,
    gameArgs,
    jvmArgs,
    libraries: Array.isArray(versionJson.libraries) ? versionJson.libraries : [],
  }, sourcePath)
}

export function buildPackManifest({
  pack = DEFAULT_ASHFALL_PACK_ID,
  name = DEFAULT_ASHFALL_PACK_NAME,
  channel,
  version,
  artifactName,
  artifactSha256,
  artifactSize,
  files,
  instance,
  changelog,
}) {
  const manifestFiles = files.map((file) => ({
    path: file.relativePath,
    assetName: fileAssetName(file.relativePath, file.sha256),
    sha256: file.sha256,
    size: file.size,
    required: true,
    moduleId: inferModuleId(file.relativePath),
    side: inferSide(file.relativePath),
  }))

  const modules = [...new Set(manifestFiles.map((file) => file.moduleId))].sort()

  const normalizedPack = normalizePackId(pack)
  const baseManifest = {
    pack: normalizedPack,
    name,
    version,
    channel,
    minecraft: instance.minecraftVersion,
    minecraftVersion: instance.minecraftVersion,
    artifactMode: 'zip',
    artifactName,
    artifactSha256,
    artifactSize,
    loader: {
      type: 'neoforge',
      version: instance.loaderVersion,
      minecraftLauncherVersionId: instance.minecraftLauncherVersionId,
      versionJson: instance.versionJson,
      installProfileJson: instance.installProfileJson,
      libraries: instance.libraries,
    },
    runtime: {
      requiredJava: '25+',
      minecraftVersion: instance.minecraftVersion,
      assetIndex: instance.versionJson.assetIndex?.id ?? instance.minecraftVersion,
    },
    launch: {
      mainClass: instance.mainClass,
      gameArgs: instance.gameArgs,
      jvmArgs: instance.jvmArgs,
    },
    modules,
    files: manifestFiles,
    changelog: normalizeTextLines(changelog, [
      'Ashfall packaged from the official ECHO seed instance.',
      'Strict SHA-256 manifest and verified zip artifact release.',
      'Minecraft Launcher handoff path prepared for beta testers.',
    ]),
    worldgenWarning: true,
    ramMb: instance.allocatedMemoryMb,
  }
  if (normalizedPack === 'ashfall-native-edition') {
    baseManifest.nativeLoader = nativeLoaderManifestFromInstance(instance)
  }
  return baseManifest
}

export function nativeLoaderManifestFromInstance(instance) {
  const version = String(process.env.ECHO_NATIVE_LOADER_VERSION || '1.0.3').trim()
  const versionId = String(process.env.ECHO_NATIVE_LOADER_VERSION_ID || `echo-native-loader-${version}`).trim()
  const libraryName = process.env.ECHO_NATIVE_LOADER_LIBRARY || `com.echo:native-loader:${version}`
  const artifactPath = `com/echo/native-loader/${version}/native-loader-${version}.jar`
  return {
    version,
    minecraftLauncherVersionId: versionId,
    versionJson: {
      id: versionId,
      inheritsFrom: instance.minecraftVersion,
      mainClass: process.env.ECHO_NATIVE_LOADER_MAIN_CLASS || 'com.echo.NativeLoaderClient',
      arguments: {
        game: [],
        jvm: [],
      },
      libraries: [
        {
          name: libraryName,
          downloads: {
            artifact: {
              path: process.env.ECHO_NATIVE_LOADER_ARTIFACT_PATH || artifactPath,
              url: process.env.ECHO_NATIVE_LOADER_DOWNLOAD_URL || ECHO_NATIVE_LOADER_DOWNLOAD_URL,
              sha1: process.env.ECHO_NATIVE_LOADER_SHA1 || ECHO_NATIVE_LOADER_SHA1,
              size: Number(process.env.ECHO_NATIVE_LOADER_SIZE || ECHO_NATIVE_LOADER_SIZE),
            },
          },
        },
      ],
    },
  }
}

function manifestFromSource({ manifest, pack = DEFAULT_ASHFALL_PACK_ID, name = DEFAULT_ASHFALL_PACK_NAME, channel, version, artifactName, artifactSha256 = '', artifactSize = 0, files, instance, changelog }) {
  const normalizedPack = normalizePackId(manifest?.pack ?? pack)
  if (!manifest) {
    return buildPackManifest({
      pack: normalizedPack,
      name,
      channel,
      version,
      artifactName,
      artifactSha256,
      artifactSize,
      files,
      instance,
      changelog,
    })
  }

  const manifestFiles = files.map((file) => ({
    path: file.relativePath,
    assetName: fileAssetName(file.relativePath, file.sha256),
    sha256: file.sha256,
    size: file.size,
    required: true,
    moduleId: inferModuleId(file.relativePath),
    side: inferSide(file.relativePath),
  }))

  return {
    ...manifest,
    pack: normalizedPack,
    name: manifest.name ?? name,
    version,
    channel,
    artifactMode: 'zip',
    artifactName,
    artifactSha256,
    artifactSize,
    modules: [...new Set(manifestFiles.map((file) => file.moduleId))].sort(),
    files: manifestFiles,
    changelog: normalizeTextLines(changelog, manifest.changelog ?? []),
    worldgenWarning: manifest.worldgenWarning ?? true,
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function collectExcludedSummary(sourcePath) {
  const entries = await fs.readdir(sourcePath, { withFileTypes: true })
  const excluded = []
  for (const entry of entries) {
    if (INCLUDE_DIRS.includes(entry.name)) {
      continue
    }
    if (entry.isDirectory() || EXCLUDED_TOP_LEVEL.has(entry.name.toLowerCase())) {
      excluded.push(entry.name)
    }
  }
  return excluded.sort()
}

export function validateDiscoveredPackFiles(files, sourcePath) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`Ashfall export did not discover any pack files in ${sourcePath}.`)
  }
  for (const file of files) {
    if (!isSafeRelativePath(file.relativePath)) {
      throw new Error(`Unsafe pack file path discovered: ${file.relativePath}`)
    }
    if (!file.sha256 || !/^[a-f0-9]{64}$/iu.test(file.sha256)) {
      throw new Error(`Pack file ${file.relativePath} is missing a SHA-256 hash.`)
    }
    if (!Number.isInteger(file.size) || file.size < 0) {
      throw new Error(`Pack file ${file.relativePath} has an invalid size.`)
    }
  }
  return files
}

export function validateZipMatchesManifest(zipPath, manifest) {
  const zip = new AdmZip(zipPath)
  const missing = []
  const mismatched = []
  for (const file of manifest.files ?? []) {
    if (!isSafeRelativePath(file.path)) {
      throw new Error(`Unsafe manifest path: ${file.path}`)
    }
    const entry = zip.getEntry(file.path.replace(/\\/g, '/'))
    if (!entry || entry.isDirectory) {
      missing.push(file.path)
      continue
    }
    const data = entry.getData()
    const actualSha256 = sha256Buffer(data)
    if (actualSha256.toLowerCase() !== String(file.sha256).toLowerCase()) {
      mismatched.push(`${file.path} sha256 ${actualSha256}`)
    }
    if (data.length !== file.size) {
      mismatched.push(`${file.path} size ${data.length}`)
    }
  }
  if (missing.length > 0 || mismatched.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
      mismatched.length > 0 ? `mismatched: ${mismatched.join(', ')}` : '',
    ].filter(Boolean)
    throw new Error(`Pack zip does not match manifest (${details.join('; ')}).`)
  }
  return { checkedFiles: manifest.files?.length ?? 0 }
}

function filterEchoPackFiles(files, options = {}) {
  const includeResourcepacks = options.includeResourcepacks !== false
  const includeShaderpacks = options.includeShaderpacks !== false
  const includeServerSafeFiles = options.includeServerSafeFiles !== false

  return files.filter((file) => {
    const normalized = file.relativePath.toLowerCase()
    if (!includeResourcepacks && normalized.startsWith('resourcepacks/')) return false
    if (!includeShaderpacks && normalized.startsWith('shaderpacks/')) return false
    if (!includeServerSafeFiles && inferSide(file.relativePath) === 'server') return false
    return true
  })
}

function buildChecksums(files) {
  return files.map((file) => `${file.sha256}  ${file.relativePath}`).join('\n') + '\n'
}

function buildEchoPackReleaseMetadata({ pack = DEFAULT_ASHFALL_PACK_ID, name = DEFAULT_ASHFALL_PACK_NAME, version, channel, manifestName, manifestSha256, manifestSize, zipName, artifactSha256, artifactSize, fileAssets = [], releaseNotes }) {
  const normalizedPack = normalizePackId(pack)
  const packEntry = {
    pack: normalizedPack,
    name,
    version,
    channel,
    manifestAsset: manifestName,
    manifestSha256,
    artifactMode: 'zip',
    artifactAsset: zipName,
    artifactSha256,
    artifactSize,
  }
  return {
    formatVersion: 2,
    pack: normalizedPack,
    name,
    version,
    channel,
    releasedAt: new Date().toISOString(),
    manifestAsset: manifestName,
    manifestSha256,
    artifactMode: 'zip',
    artifactAsset: zipName,
    artifactSha256,
    artifactSize,
    packs: [packEntry],
    assets: [
      {
        name: manifestName,
        role: 'pack-manifest',
        sha256: manifestSha256,
        size: manifestSize,
      },
      {
        name: zipName,
        role: 'pack-artifact',
        sha256: artifactSha256,
        size: artifactSize,
      },
      ...fileAssets,
    ],
    notes: normalizeTextLines(releaseNotes, [
      'Ashfall export generated by ECHO Launcher.',
      'Install only through strict ECHO release metadata.',
    ]),
  }
}

export async function createEchoPackExport(options = {}) {
  const sourcePath = path.resolve(options.sourcePath ?? DEFAULT_ASHFALL_SOURCE)
  const pack = normalizePackId(options.pack ?? options.manifest?.pack ?? DEFAULT_ASHFALL_PACK_ID)
  const name = options.name ?? options.manifest?.name ?? DEFAULT_ASHFALL_PACK_NAME
  const version = options.version ?? options.manifest?.version ?? DEFAULT_RELEASE_VERSION
  const channel = options.channel ?? options.manifest?.channel ?? DEFAULT_RELEASE_CHANNEL
  const outputPath = path.resolve(
    options.outputPath ?? path.join(options.outputDir ?? DEFAULT_OUTPUT_DIR, `Ashfall-${version}${ECHO_PACK_EXTENSION}`),
  )
  const outputDir = path.dirname(outputPath)
  const zipName = path.basename(outputPath)
  const sidecarManifestName = `${pack}-${channel}-${version}.pack.json`
  const sidecarManifestPath = path.join(outputDir, sidecarManifestName)
  const releasePath = path.join(outputDir, RELEASE_METADATA_ASSET)

  if (!(await fileExists(sourcePath))) {
    throw new Error(`Ashfall source instance was not found: ${sourcePath}`)
  }

  let instance = null
  if (!options.manifest) {
    instance = await readCurseForgeInstance(sourcePath)
  }

  const discovered = await discoverPackFiles(sourcePath)
  const extras = await collectExtraPackFiles(sourcePath, options.extraIncludePaths ?? [])
  const files = validateDiscoveredPackFiles(dedupePackFiles(filterEchoPackFiles([...discovered, ...extras.files], options)), sourcePath)
  await fs.mkdir(outputDir, { recursive: true })

  const manifest = manifestFromSource({
    manifest: options.manifest,
    pack,
    name,
    channel,
    version,
    artifactName: zipName,
    files,
    instance,
    changelog: options.changelog,
  })
  const checksums = buildChecksums(files)
  const generatedAt = new Date().toISOString()
  const embeddedReport = {
    ok: true,
    generatedAt,
    sourcePath,
    version,
    channel,
    archive: {
      name: zipName,
      sha256: null,
      note: 'Archive SHA-256 is calculated after the zip is finalized and returned in the export report.',
    },
    counts: {
      totalFiles: files.length,
      modJars: files.filter((file) => file.relativePath.startsWith('mods/')).length,
      configFiles: files.filter((file) => file.relativePath.startsWith('config/')).length,
    },
    options: {
      includeResourcepacks: options.includeResourcepacks !== false,
      includeShaderpacks: options.includeShaderpacks !== false,
      includeServerSafeFiles: options.includeServerSafeFiles !== false,
      emitReleaseSidecars: Boolean(options.emitReleaseSidecars),
      extraIncludePaths: options.extraIncludePaths ?? [],
    },
  }

  const zip = new AdmZip()
  for (const file of files) {
    zip.addLocalFile(file.absolutePath, path.posix.dirname(file.relativePath), path.posix.basename(file.relativePath))
  }
  zip.addFile('.echo/pack-manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'))
  zip.addFile('.echo/export-report.json', Buffer.from(`${JSON.stringify(embeddedReport, null, 2)}\n`, 'utf8'))
  zip.addFile('.echo/checksums.sha256', Buffer.from(checksums, 'utf8'))
  zip.writeZip(outputPath)

  const artifactSha256 = await sha256File(outputPath)
  const artifactStats = await fs.stat(outputPath)
  const finalManifest = {
    ...manifest,
    artifactSha256,
    artifactSize: artifactStats.size,
  }
  const sidecarManifestText = `${JSON.stringify(finalManifest, null, 2)}\n`
  const sidecarManifestSha256 = sha256Buffer(Buffer.from(sidecarManifestText, 'utf8'))
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const excludedTopLevel = await collectExcludedSummary(sourcePath)
  const neededJars = await copyNeededJars(files, outputDir)

  if (options.emitReleaseSidecars) {
    await writeJson(sidecarManifestPath, finalManifest)
    const manifestStats = await fs.stat(sidecarManifestPath)
    const releaseIndex = buildEchoPackReleaseMetadata({
      pack,
      name,
      version,
      channel,
      manifestName: sidecarManifestName,
      manifestSha256: sidecarManifestSha256,
      manifestSize: manifestStats.size,
      zipName,
      artifactSha256,
      artifactSize: artifactStats.size,
      fileAssets: finalManifest.files.map((file) => releaseAssetRecordForFile(file)),
      releaseNotes: options.releaseNotes,
    })
    await writeJson(releasePath, releaseIndex)
  }

  return {
    ok: true,
    generatedAt,
    sourcePath,
    outputPath,
    zipPath: outputPath,
    zipName,
    version,
    channel,
    sha256: artifactSha256,
    size: artifactStats.size,
    totalBytes,
    counts: {
      totalFiles: files.length,
      modJars: files.filter((file) => file.relativePath.startsWith('mods/')).length,
      configFiles: files.filter((file) => file.relativePath.startsWith('config/')).length,
    },
    manifestPath: options.emitReleaseSidecars ? sidecarManifestPath : '',
    releaseMetadataPath: options.emitReleaseSidecars ? releasePath : '',
    neededJarsPath: neededJars.neededJarsPath,
    neededJarsCount: neededJars.neededJarsCount,
    checksumsPath: '.echo/checksums.sha256',
    includedFolders: includedTopLevelForFiles(files),
    excludedTopLevel,
    warnings: [
      ...extras.warnings,
      ...(options.emitReleaseSidecars
        ? []
        : ['Release sidecars were not emitted. Use the .echo-pack.zip for local transfer/import only.']),
    ],
    files: files.map((file) => ({
      path: file.relativePath,
      size: file.size,
      sha256: file.sha256,
    })),
  }
}

function validateReleaseIndexHashes(releaseIndex, expected) {
  const manifestAsset = releaseIndex.assets.find((asset) => asset.name === expected.manifestName)
  const artifactAsset = releaseIndex.assets.find((asset) => asset.name === expected.zipName)
  if (releaseIndex.manifestSha256 !== expected.manifestSha256 || manifestAsset?.sha256 !== expected.manifestSha256) {
    throw new Error(`${RELEASE_METADATA_ASSET} manifest hash does not match ${expected.manifestName}.`)
  }
  if (releaseIndex.artifactSha256 !== expected.artifactSha256 || artifactAsset?.sha256 !== expected.artifactSha256) {
    throw new Error(`${RELEASE_METADATA_ASSET} artifact hash does not match ${expected.zipName}.`)
  }
  if (manifestAsset?.size !== expected.manifestSize) {
    throw new Error(`${RELEASE_METADATA_ASSET} manifest size does not match ${expected.manifestName}.`)
  }
  if (artifactAsset?.size !== expected.artifactSize) {
    throw new Error(`${RELEASE_METADATA_ASSET} artifact size does not match ${expected.zipName}.`)
  }
}

function buildUploadPrep({ version, releaseName, releasePath, releaseSha256, releaseSize, manifestName, manifestPath, manifestSha256, manifestSize, zipName, zipPath, artifactSha256, artifactSize, fileAssetFiles = [] }) {
  return {
    recommendedTag: `v${version}`,
    releaseTitle: `Ashfall ${version}`,
    manualUploadOrder: [releaseName, manifestName, zipName, ...fileAssetFiles.map((file) => file.name)],
    files: [
      {
        name: releaseName,
        role: 'release-metadata',
        path: releasePath,
        size: releaseSize,
        sha256: releaseSha256,
      },
      {
        name: manifestName,
        role: 'pack-manifest',
        path: manifestPath,
        size: manifestSize,
        sha256: manifestSha256,
      },
      {
        name: zipName,
        role: 'pack-artifact',
        path: zipPath,
        size: artifactSize,
        sha256: artifactSha256,
      },
      ...fileAssetFiles,
    ],
  }
}

export async function createAshfallPackArtifacts(options = {}) {
  const sourcePath = path.resolve(options.sourcePath ?? DEFAULT_ASHFALL_SOURCE)
  const outputDir = path.resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR)
  const pack = normalizePackId(options.pack ?? DEFAULT_ASHFALL_PACK_ID)
  const name = options.name ?? DEFAULT_ASHFALL_PACK_NAME
  const version = options.version ?? DEFAULT_RELEASE_VERSION
  const channel = options.channel ?? DEFAULT_RELEASE_CHANNEL
  const baseName = `${pack}-${channel}-${version}`
  const zipName = `${baseName}-pack.zip`
  const manifestName = `${baseName}.pack.json`
  const reportName = `${baseName}-export-report.json`
  const releaseName = RELEASE_METADATA_ASSET
  const fileAssetsDir = path.join(outputDir, `${baseName}-file-assets`)

  if (!(await fileExists(sourcePath))) {
    throw new Error(`Ashfall source instance was not found: ${sourcePath}`)
  }

  const instance = await readCurseForgeInstance(sourcePath)
  const files = await discoverPackFiles(sourcePath)
  validateDiscoveredPackFiles(files, sourcePath)
  await fs.mkdir(outputDir, { recursive: true })

  const zipPath = path.join(outputDir, zipName)
  const zip = new AdmZip()
  for (const file of files) {
    zip.addLocalFile(file.absolutePath, path.posix.dirname(file.relativePath), path.posix.basename(file.relativePath))
  }
  zip.writeZip(zipPath)

  const artifactSha256 = await sha256File(zipPath)
  const artifactStats = await fs.stat(zipPath)
  const manifest = buildPackManifest({
    pack,
    name,
    channel,
    version,
    artifactName: zipName,
    artifactSha256,
    artifactSize: artifactStats.size,
    files,
    instance,
  })
  validateZipMatchesManifest(zipPath, manifest)

  const manifestPath = path.join(outputDir, manifestName)
  await writeJson(manifestPath, manifest)
  const manifestSha256 = await sha256File(manifestPath)
  const manifestStats = await fs.stat(manifestPath)
  await fs.mkdir(fileAssetsDir, { recursive: true })
  const fileAssetFiles = []
  for (const file of files) {
    const assetName = fileAssetName(file.relativePath, file.sha256)
    const assetPath = path.join(fileAssetsDir, assetName)
    await fs.copyFile(file.absolutePath, assetPath)
    fileAssetFiles.push({
      name: assetName,
      role: 'pack-file',
      path: assetPath,
      packPath: file.relativePath,
      size: file.size,
      sha256: file.sha256,
    })
  }
  const neededJars = await copyNeededJars(files, outputDir)

  const releaseIndex = {
    formatVersion: 2,
    pack,
    name,
    version,
    channel,
    releasedAt: new Date().toISOString(),
    manifestAsset: manifestName,
    manifestSha256,
    artifactMode: 'zip',
    artifactAsset: zipName,
    artifactSha256,
    artifactSize: artifactStats.size,
    packs: [
      {
        pack,
        name,
        version,
        channel,
        manifestAsset: manifestName,
        manifestSha256,
        artifactMode: 'zip',
        artifactAsset: zipName,
        artifactSha256,
        artifactSize: artifactStats.size,
      },
    ],
    minecraftVersion: instance.minecraftVersion,
    loader: {
      type: 'neoforge',
      version: instance.loaderVersion,
      minecraftLauncherVersionId: instance.minecraftLauncherVersionId,
    },
    assets: [
      {
        name: manifestName,
        role: 'pack-manifest',
        sha256: manifestSha256,
        size: manifestStats.size,
      },
      {
        name: zipName,
        role: 'pack-artifact',
        sha256: artifactSha256,
        size: artifactStats.size,
      },
      ...fileAssetFiles.map((file) => ({
        name: file.name,
        role: 'pack-file',
        path: file.packPath,
        sha256: file.sha256,
        size: file.size,
      })),
    ],
    notes: [
      'Upload this file, the pack manifest, the pack zip, and the per-file assets to the same GitHub Release.',
      'Fresh installs use the full zip; updates download only missing or changed file assets.',
    ],
  }
  validateReleaseIndexHashes(releaseIndex, {
    manifestName,
    manifestSha256,
    manifestSize: manifestStats.size,
    zipName,
    artifactSha256,
    artifactSize: artifactStats.size,
  })

  const releasePath = path.join(outputDir, releaseName)
  await writeJson(releasePath, releaseIndex)
  const releaseSha256 = await sha256File(releasePath)
  const releaseStats = await fs.stat(releasePath)

  const modFiles = files.filter((file) => file.relativePath.startsWith('mods/'))
  const configFiles = files.filter((file) => file.relativePath.startsWith('config/'))
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const report = {
    ok: true,
    generatedAt: releaseIndex.releasedAt,
    sourcePath,
    outputDir,
    version,
    channel,
    minecraftVersion: instance.minecraftVersion,
    neoforgeVersion: instance.loaderVersion,
    ramMb: instance.allocatedMemoryMb,
    includedFolders: INCLUDE_DIRS.filter((folder) => files.some((file) => file.relativePath.startsWith(`${folder}/`))),
    excludedTopLevel: await collectExcludedSummary(sourcePath),
    counts: {
      totalFiles: files.length,
      modJars: modFiles.length,
      configFiles: configFiles.length,
    },
    totalBytes,
    neededJarsPath: neededJars.neededJarsPath,
    neededJarsCount: neededJars.neededJarsCount,
    artifact: {
      name: zipName,
      path: zipPath,
      size: artifactStats.size,
      sha256: artifactSha256,
    },
    manifest: {
      name: manifestName,
      path: manifestPath,
      size: manifestStats.size,
      sha256: manifestSha256,
    },
    release: {
      name: releaseName,
      path: releasePath,
    },
    uploadPrep: buildUploadPrep({
      version,
      releaseName,
      releasePath,
      releaseSha256,
      releaseSize: releaseStats.size,
      manifestName,
      manifestPath,
      manifestSha256,
      manifestSize: manifestStats.size,
      zipName,
      zipPath,
      artifactSha256,
      artifactSize: artifactStats.size,
      fileAssetFiles,
    }),
    largestFiles: [...files]
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((file) => ({ path: file.relativePath, size: file.size })),
  }

  const reportPath = path.join(outputDir, reportName)
  await writeJson(reportPath, report)

  return {
    ...report,
    files,
    paths: {
      release: releasePath,
      manifest: manifestPath,
      artifact: zipPath,
      report: reportPath,
    },
  }
}
