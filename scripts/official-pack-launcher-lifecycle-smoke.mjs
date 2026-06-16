#!/usr/bin/env node
import AdmZip from 'adm-zip'
import crypto from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { officialPackIds, resolveEchoProtocolEntry } from '../electron/release-index-resolver.mjs'

const REQUIRED_ZIP_ENTRIES = ['.echo/pack-manifest.json', '.echo/export-report.json', '.echo/checksums.sha256']

function usage() {
  return `Usage: node scripts/official-pack-launcher-lifecycle-smoke.mjs [options]

Runs a Launcher-owned lifecycle smoke across every official pack lane from live
Release Index GitHub assets.

Options:
  --release-index-root <path>  Release Index checkout. Default: ../ECHO-Release-Index
  --download-root <path>       Asset cache. Default: tmp/official-pack-launcher-lifecycle-downloads
  --work-root <path>           Temporary install root. Default: tmp/official-pack-launcher-lifecycle-smoke
  --out <path>                 Evidence output path.
                               Default: ../ECHO-Release-Index/release-readiness/official-pack-launcher-lifecycle-smoke.json
  --limit <pack-id[,pack-id]>  Run only selected official pack ids.
  --clean                      Remove work-root before running.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    releaseIndexRoot: path.resolve(root, '..', 'ECHO-Release-Index'),
    downloadRoot: path.resolve(root, 'tmp', 'official-pack-launcher-lifecycle-downloads'),
    workRoot: path.resolve(root, 'tmp', 'official-pack-launcher-lifecycle-smoke'),
    out: path.resolve(root, '..', 'ECHO-Release-Index', 'release-readiness', 'official-pack-launcher-lifecycle-smoke.json'),
    clean: false,
    limits: null,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--release-index-root') args.releaseIndexRoot = path.resolve(next())
    else if (arg === '--download-root') args.downloadRoot = path.resolve(next())
    else if (arg === '--work-root') args.workRoot = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--limit') args.limits = new Set(next().split(',').map((item) => item.trim()).filter(Boolean))
    else if (arg === '--clean') args.clean = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
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

function parseChecksums(text) {
  const checksums = new Map()
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([a-f0-9]{64})\s+\*?(.+)$/iu)
    if (!match) throw new Error(`Invalid checksum line: ${line}`)
    checksums.set(match[2].trim().replace(/\\/g, '/'), match[1].toLowerCase())
  }
  return checksums
}

async function verifyTopLevelChecksums(downloadDir) {
  const checksums = parseChecksums(await fs.readFile(path.join(downloadDir, 'checksums.txt'), 'utf8'))
  const verified = []
  for (const [name, expected] of checksums.entries()) {
    const actual = await sha256File(path.join(downloadDir, name))
    if (actual !== expected) throw new Error(`${downloadDir}: checksum mismatch for ${name}`)
    verified.push(name)
  }
  return verified.sort()
}

function entryBytes(zip, relativePath) {
  const entry = zip.getEntry(relativePath.replace(/\\/g, '/'))
  if (!entry || entry.isDirectory) throw new Error(`ZIP entry missing: ${relativePath}`)
  return Buffer.from(entry.getData())
}

function moduleIdFor(record) {
  return record?.moduleId ?? record?.id
}

function pickLifecycleModule(manifest) {
  const files = manifest.files ?? []
  if (!files.length) throw new Error(`${manifest.pack}: no manifest files available`)
  const tokens = String(manifest.pack ?? '')
    .split('-')
    .filter((token) => !['edition', 'native', 'neoforge', 'standalone'].includes(token))
  const protocolFile = files.find((file) => {
    const id = String(moduleIdFor(file) ?? '').toLowerCase()
    return id.includes('protocol') && tokens.some((token) => id.includes(token))
  })
  const packFile = files.find((file) => {
    const id = String(moduleIdFor(file) ?? '').toLowerCase()
    return tokens.some((token) => id.includes(token))
  })
  return protocolFile ?? packFile ?? files[0]
}

async function extractFile(zip, file, installRoot) {
  const bytes = entryBytes(zip, file.path)
  const actualSha = sha256Bytes(bytes)
  if (actualSha !== String(file.sha256).toLowerCase()) throw new Error(`${file.path}: ZIP hash mismatch`)
  if (bytes.length !== Number(file.size)) throw new Error(`${file.path}: ZIP size mismatch`)
  const destination = path.join(installRoot, file.path)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(destination, bytes)
  return destination
}

async function verifyInstall(manifest, installRoot) {
  const valid = []
  const missing = []
  const corrupt = []
  for (const file of manifest.files ?? []) {
    const target = path.join(installRoot, file.path)
    try {
      const stat = await fs.stat(target)
      const actual = await sha256File(target)
      if (actual !== String(file.sha256).toLowerCase() || stat.size !== Number(file.size)) corrupt.push(file.path)
      else valid.push(file.path)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      missing.push(file.path)
    }
  }
  return {
    ok: missing.length === 0 && corrupt.length === 0,
    valid,
    missing,
    corrupt,
  }
}

async function backupFileIfExists(installRoot, backupRoot, relativePath) {
  const source = path.join(installRoot, relativePath)
  try {
    await fs.access(source)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  const backupPath = path.join(backupRoot, relativePath)
  await fs.mkdir(path.dirname(backupPath), { recursive: true })
  await fs.copyFile(source, backupPath)
  return backupPath
}

async function installFromPackZip(manifest, zip, installRoot) {
  await fs.rm(installRoot, { recursive: true, force: true })
  await fs.mkdir(path.join(installRoot, '.echo'), { recursive: true })
  const installed = []
  for (const file of manifest.files ?? []) {
    await extractFile(zip, file, installRoot)
    installed.push(file.path)
  }
  await writeJson(path.join(installRoot, '.echo', 'installed-manifest.json'), manifest)
  const after = await verifyInstall(manifest, installRoot)
  if (!after.ok) throw new Error(`${manifest.pack}: install verification failed`)
  return { installed, after }
}

function obsoletePathFor(targetFile) {
  const parts = String(targetFile.path).split('/')
  const directory = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  const extension = path.posix.extname(parts.at(-1) ?? '') || '.artifact'
  return `${directory ? `${directory}/` : ''}official-pack-obsolete-smoke${extension}`
}

async function preparePreviousInstallFixture(manifest, installRoot, lifecycleFile) {
  const targetFile = lifecycleFile ?? pickLifecycleModule(manifest)
  const targetPath = path.join(installRoot, targetFile.path)
  await fs.writeFile(targetPath, Buffer.from('previous version placeholder for official pack launcher update smoke\n', 'utf8'))
  const previousTargetSha = await sha256File(targetPath)
  const previousTargetStat = await fs.stat(targetPath)
  const obsoletePath = obsoletePathFor(targetFile)
  const obsoleteAbsolute = path.join(installRoot, obsoletePath)
  await fs.mkdir(path.dirname(obsoleteAbsolute), { recursive: true })
  await fs.writeFile(obsoleteAbsolute, Buffer.from('obsolete official pack launcher update smoke file\n', 'utf8'))
  const obsoleteStat = await fs.stat(obsoleteAbsolute)
  const previousVersion = `${manifest.version}-previous-smoke`
  const previousManifest = {
    ...manifest,
    version: previousVersion,
    files: [
      ...(manifest.files ?? []).map((file) => file.path === targetFile.path
        ? {
            ...file,
            version: `${file.version ?? manifest.version}-previous-smoke`,
            sha256: previousTargetSha,
            size: previousTargetStat.size,
          }
        : file),
      {
        path: obsoletePath,
        sha256: await sha256File(obsoleteAbsolute),
        size: obsoleteStat.size,
        required: true,
        moduleId: 'official-pack-obsolete-smoke',
      },
    ],
  }
  await writeJson(path.join(installRoot, '.echo', 'installed-manifest.json'), previousManifest)
  const previousVerification = await verifyInstall(previousManifest, installRoot)
  if (!previousVerification.ok) throw new Error(`${manifest.pack}: previous-version update fixture did not verify`)
  return { targetFile, previousTargetSha, obsoletePath, previousManifest, previousVersion, previousVerification }
}

async function updateFromPackZip(manifest, zip, installRoot, fixture) {
  const backupRoot = path.join(installRoot, '.echo', 'rollback', 'official-pack-launcher-update-smoke')
  const before = await verifyInstall(manifest, installRoot)
  const valid = new Set(before.valid)
  const updated = []
  const verified = []
  const backedUp = []
  const removed = []

  for (const file of manifest.files ?? []) {
    if (valid.has(file.path)) {
      verified.push(file.path)
      continue
    }
    const backupPath = await backupFileIfExists(installRoot, backupRoot, file.path)
    if (backupPath) backedUp.push({ path: file.path, backupPath })
    await extractFile(zip, file, installRoot)
    updated.push(file.path)
  }

  const obsoleteBackupPath = await backupFileIfExists(installRoot, backupRoot, fixture.obsoletePath)
  if (obsoleteBackupPath) {
    backedUp.push({ path: fixture.obsoletePath, backupPath: obsoleteBackupPath })
    await fs.rm(path.join(installRoot, fixture.obsoletePath), { force: true })
    removed.push(fixture.obsoletePath)
  }

  await writeJson(path.join(installRoot, '.echo', 'installed-manifest.json'), manifest)
  const after = await verifyInstall(manifest, installRoot)
  if (!after.ok) throw new Error(`${manifest.pack}: update verification failed`)
  const rollbackPlan = {
    operation: 'update',
    installPath: installRoot,
    fromVersion: fixture.previousVersion,
    toVersion: manifest.version,
    backedUp,
    removed: updated,
    createdAt: new Date().toISOString(),
  }
  await writeJson(path.join(backupRoot, 'rollback-plan.json'), rollbackPlan)
  return { updated, verified, removed, backedUp, after, rollbackPlan }
}

async function rollbackUpdate(rollbackPlan, previousManifest) {
  for (const relativePath of rollbackPlan.removed ?? []) {
    await fs.rm(path.join(rollbackPlan.installPath, relativePath), { force: true })
  }
  for (const backup of rollbackPlan.backedUp ?? []) {
    const destination = path.join(rollbackPlan.installPath, backup.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(backup.backupPath, destination)
  }
  if (previousManifest) {
    await writeJson(path.join(rollbackPlan.installPath, '.echo', 'installed-manifest.json'), previousManifest)
  }
}

async function repairFromPackZip(manifest, zip, installRoot, lifecycleFile) {
  const targetFile = lifecycleFile ?? pickLifecycleModule(manifest)
  const targetPath = path.join(installRoot, targetFile.path)
  await fs.writeFile(targetPath, Buffer.from('corrupted official pack launcher repair smoke file\n', 'utf8'))
  const corruptSha = await sha256File(targetPath)
  if (corruptSha === String(targetFile.sha256).toLowerCase()) throw new Error(`${manifest.pack}: repair corruption did not alter file`)
  await extractFile(zip, targetFile, installRoot)
  const after = await verifyInstall(manifest, installRoot)
  if (!after.ok) throw new Error(`${manifest.pack}: repair verification failed`)
  return { repaired: targetFile.path, after }
}

async function downloadToFile(url, targetPath) {
  const response = await fetch(url, { headers: { 'user-agent': 'echo-launcher-official-pack-lifecycle-smoke' } })
  if (!response.ok) throw new Error(`GET ${url} failed ${response.status}: ${await response.text()}`)
  if (!response.body) throw new Error(`GET ${url} returned no response body`)
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath))
    await fs.rename(tempPath, targetPath)
  } catch (error) {
    await fs.rm(tempPath, { force: true })
    throw error
  }
}

async function validateAsset(filePath, artifact, context) {
  const stat = await fs.stat(filePath)
  const actualSha = await sha256File(filePath)
  if (actualSha !== String(artifact.sha256).toLowerCase()) throw new Error(`${context}: SHA-256 mismatch for ${artifact.file}`)
  if (stat.size !== Number(artifact.size)) throw new Error(`${context}: size mismatch for ${artifact.file}`)
  return { sha256: actualSha, size: stat.size }
}

async function ensureAsset(downloadDir, artifact, context) {
  if (!artifact?.file || !artifact?.url || !artifact?.sha256 || artifact.size === undefined) {
    throw new Error(`${context}: incomplete asset metadata`)
  }
  const filePath = path.join(downloadDir, artifact.file)
  let reused = false
  if (await exists(filePath)) {
    try {
      await validateAsset(filePath, artifact, context)
      reused = true
    } catch {
      await fs.rm(filePath, { force: true })
    }
  }
  if (!reused) {
    await downloadToFile(artifact.url, filePath)
    await validateAsset(filePath, artifact, context)
  }
  return { filePath, name: artifact.file, url: artifact.url, sha256: String(artifact.sha256).toLowerCase(), size: Number(artifact.size), reused }
}

function artifactRecords(modpack) {
  return Object.entries(modpack.artifacts ?? {})
    .filter(([, artifact]) => artifact?.file && artifact?.url)
    .map(([role, artifact]) => ({ role, artifact }))
}

async function loadJsonDirectory(root, directory) {
  const entries = []
  const dir = path.join(root, directory)
  for (const fileName of (await fs.readdir(dir)).sort()) {
    if (!fileName.endsWith('.json')) continue
    entries.push(await readJson(path.join(dir, fileName)))
  }
  return entries
}

async function loadReleaseIndex(args) {
  const modpacks = await loadJsonDirectory(args.releaseIndexRoot, 'modpacks')
  const modules = await loadJsonDirectory(args.releaseIndexRoot, 'modules')
  const packs = await loadJsonDirectory(args.releaseIndexRoot, 'packs')
  const modpacksById = new Map(modpacks.map((entry) => [entry.id, entry]))
  const packsById = new Map(packs.map((entry) => [entry.id, entry]))
  const selectedPackIds = args.limits ? officialPackIds.filter((packId) => args.limits.has(packId)) : officialPackIds
  const unknownLimits = args.limits ? [...args.limits].filter((packId) => !officialPackIds.includes(packId)) : []
  if (unknownLimits.length) throw new Error(`Unknown official pack id(s): ${unknownLimits.join(', ')}`)
  const rows = selectedPackIds.map((packId) => {
    const modpack = modpacksById.get(packId)
    const pack = packsById.get(packId)
    if (!modpack) throw new Error(`Missing Release Index modpack row for ${packId}`)
    if (!pack) throw new Error(`Missing Release Index pack descriptor for ${packId}`)
    return { packId, modpack, pack }
  })
  return { rows, modules }
}

function syntheticPackEntry(modpack, manifest) {
  return {
    ...JSON.parse(JSON.stringify(modpack)),
    dependencies: (manifest.moduleRequirements ?? []).map((requirement) => ({
      id: moduleIdFor(requirement),
      kind: 'module',
      version: requirement.version ?? '*',
    })),
    compatibility: [manifest.pack ?? modpack.id],
  }
}

function validateReleaseMetadata(row, release, manifest, paths) {
  const packArtifact = row.modpack.artifacts?.pack
  const manifestArtifact = row.modpack.artifacts?.manifest
  if (release.manifestAsset !== manifestArtifact?.file) throw new Error(`${row.packId}: release manifestAsset does not match catalog manifest artifact`)
  if (release.artifactAsset !== packArtifact?.file) throw new Error(`${row.packId}: release artifactAsset does not match catalog pack artifact`)
  if (String(release.artifactSha256).toLowerCase() !== String(packArtifact?.sha256).toLowerCase()) throw new Error(`${row.packId}: release artifactSha256 does not match catalog pack artifact`)
  if (Number(release.artifactSize) !== Number(packArtifact?.size)) throw new Error(`${row.packId}: release artifactSize does not match catalog pack artifact`)
  if (manifest.pack !== row.packId && manifest.id !== row.packId) throw new Error(`${row.packId}: pack manifest id mismatch`)
  if (manifest.artifactName && manifest.artifactName !== packArtifact?.file) throw new Error(`${row.packId}: pack manifest artifactName mismatch`)
  if (manifest.artifactSha256 && String(manifest.artifactSha256).toLowerCase() !== String(packArtifact?.sha256).toLowerCase()) throw new Error(`${row.packId}: pack manifest artifactSha256 mismatch`)
  if (manifest.artifactSize && Number(manifest.artifactSize) !== Number(packArtifact?.size)) throw new Error(`${row.packId}: pack manifest artifactSize mismatch`)
  if (paths.manifestPath !== path.join(paths.downloadDir, release.manifestAsset)) throw new Error(`${row.packId}: release manifest path mismatch`)
  if (paths.zipPath !== path.join(paths.downloadDir, release.artifactAsset)) throw new Error(`${row.packId}: release artifact path mismatch`)
}

function validateZipManifest(row, manifest, zip) {
  const requiredEntries = []
  for (const entryPath of REQUIRED_ZIP_ENTRIES) {
    entryBytes(zip, entryPath)
    requiredEntries.push(entryPath)
  }
  const embeddedManifest = JSON.parse(entryBytes(zip, '.echo/pack-manifest.json').toString('utf8'))
  if ((embeddedManifest.pack ?? embeddedManifest.id) !== (manifest.pack ?? manifest.id)) throw new Error(`${row.packId}: embedded pack manifest id mismatch`)
  if (embeddedManifest.artifactSha256 && embeddedManifest.artifactSha256 !== manifest.artifactSha256) throw new Error(`${row.packId}: embedded pack manifest artifact hash mismatch`)
  for (const file of manifest.files ?? []) entryBytes(zip, file.path)
  return { requiredEntries, embeddedManifestFileCount: embeddedManifest.files?.length ?? 0 }
}

async function smokePack(args, row, moduleEntries) {
  const repoName = String(row.modpack.sourceRepo ?? '').split('/').at(-1)
  const downloadDir = path.join(args.downloadRoot, repoName, row.modpack.releaseTag)
  const downloadedAssets = []
  for (const { role, artifact } of artifactRecords(row.modpack)) {
    downloadedAssets.push({ role, ...await ensureAsset(downloadDir, artifact, `${row.packId}:${role}`) })
  }

  const releaseArtifact = row.modpack.artifacts?.releaseManifest
  const manifestArtifact = row.modpack.artifacts?.manifest
  const packArtifact = row.modpack.artifacts?.pack
  const releasePath = path.join(downloadDir, releaseArtifact.file)
  const manifestPath = path.join(downloadDir, manifestArtifact.file)
  const zipPath = path.join(downloadDir, packArtifact.file)
  const release = await readJson(releasePath)
  const manifest = await readJson(manifestPath)
  validateReleaseMetadata(row, release, manifest, { downloadDir, manifestPath, zipPath })
  const topLevelChecksums = await verifyTopLevelChecksums(downloadDir)
  const zip = new AdmZip(zipPath)
  const packZip = validateZipManifest(row, manifest, zip)

  const lifecycleFile = pickLifecycleModule(manifest)
  const selectedModuleId = moduleIdFor(lifecycleFile)
  const packEntry = syntheticPackEntry(row.modpack, manifest)
  const catalogEntries = [...moduleEntries, packEntry]
  const updateLink = `echo://update/pack/${row.packId}`
  const addonLink = `echo://install/addon/${selectedModuleId}?pack=${row.packId}`
  const updateResolution = resolveEchoProtocolEntry(updateLink, catalogEntries)
  const addonResolution = resolveEchoProtocolEntry(addonLink, catalogEntries)
  if (!updateResolution) throw new Error(`${row.packId}: update deep link did not resolve`)
  if (!addonResolution) throw new Error(`${row.packId}: install-addon deep link did not resolve`)

  const installRoot = path.join(args.workRoot, repoName, row.packId, 'install')
  const installed = await installFromPackZip(manifest, zip, installRoot)
  const fixture = await preparePreviousInstallFixture(manifest, installRoot, lifecycleFile)
  const update = await updateFromPackZip(manifest, zip, installRoot, fixture)
  await rollbackUpdate(update.rollbackPlan, fixture.previousManifest)
  const restoredTargetSha = await sha256File(path.join(installRoot, fixture.targetFile.path))
  if (restoredTargetSha !== fixture.previousTargetSha) throw new Error(`${row.packId}: rollback did not restore previous target file`)
  await fs.access(path.join(installRoot, fixture.obsoletePath))
  const rollbackVerification = await verifyInstall(fixture.previousManifest, installRoot)
  if (!rollbackVerification.ok) throw new Error(`${row.packId}: rollback did not verify previous manifest`)
  const updateAfterRollback = await updateFromPackZip(manifest, zip, installRoot, fixture)
  const repair = await repairFromPackZip(manifest, zip, installRoot, lifecycleFile)

  return {
    status: 'pass',
    repoName,
    sourceRepo: row.modpack.sourceRepo,
    packId: row.packId,
    pack: manifest.pack ?? manifest.id,
    releaseTag: row.modpack.releaseTag,
    validation: row.modpack.validation,
    moduleArtifactFamily: manifest.moduleArtifactFamily,
    manifestAsset: release.manifestAsset,
    artifactAsset: release.artifactAsset,
    moduleCount: manifest.moduleRequirements?.length ?? 0,
    fileCount: manifest.files?.length ?? 0,
    selectedModuleId,
    downloadedAssets: downloadedAssets.map((asset) => ({
      role: asset.role,
      name: asset.name,
      sha256: asset.sha256,
      size: asset.size,
      reused: asset.reused,
    })),
    topLevelChecksums: {
      verified: topLevelChecksums,
    },
    packZip,
    deepLinks: {
      update: {
        url: updateLink,
        resolved: true,
        artifact: updateResolution.artifact.name,
        dependencyCount: updateResolution.dependencies.length,
      },
      installAddon: {
        url: addonLink,
        resolved: true,
        artifact: addonResolution.artifact.name,
        dependencyCount: addonResolution.dependencies.length,
      },
    },
    install: {
      installed: installed.installed.length,
      verifiedAfterInstall: installed.after.valid.length,
    },
    update: {
      fromVersion: fixture.previousVersion,
      toVersion: manifest.version,
      versionTransition: true,
      updated: update.updated.length,
      verified: update.verified.length,
      removed: update.removed.length,
      verifiedAfterUpdate: update.after.valid.length,
      sameVersionReconciliation: false,
    },
    rollback: {
      restoredPreviousTarget: fixture.targetFile.path,
      restoredObsoletePath: fixture.obsoletePath,
      restoredPreviousVersion: fixture.previousVersion,
      verifiedAfterRollback: rollbackVerification.valid.length,
    },
    postRollbackUpdate: {
      updated: updateAfterRollback.updated.length,
      removed: updateAfterRollback.removed.length,
      verifiedAfterUpdate: updateAfterRollback.after.valid.length,
    },
    repair: {
      repaired: repair.repaired,
      verifiedAfterRepair: repair.after.valid.length,
    },
    installRoot,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (args.clean) await fs.rm(args.workRoot, { recursive: true, force: true })
  await fs.mkdir(args.workRoot, { recursive: true })
  await fs.mkdir(args.downloadRoot, { recursive: true })

  const { rows, modules } = await loadReleaseIndex(args)
  const moduleEntries = modules.filter((entry) => entry?.kind === 'module')
  const editions = []
  for (const row of rows) {
    console.log(`Smoking ${row.packId} from ${row.modpack.sourceRepo}@${row.modpack.releaseTag}`)
    editions.push(await smokePack(args, row, moduleEntries))
  }
  const report = {
    schemaVersion: 'echo.official_pack.launcher_lifecycle_smoke.v1',
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'live-github-release-assets',
    releaseIndexRoot: args.releaseIndexRoot,
    downloadRoot: args.downloadRoot,
    workRoot: args.workRoot,
    officialPackCount: officialPackIds.length,
    coveredPackCount: editions.length,
    editions,
    gates: {
      liveReleaseAssetsDownloaded: 'passed',
      releaseIndexCatalogMetadata: 'passed',
      topLevelChecksums: 'passed',
      packZipPayloadIntegrity: 'passed',
      launcherReleaseIndexDeepLinks: 'passed',
      launcherInstallFromPackZip: 'passed',
      launcherUpdateReconciliation: 'passed',
      launcherVersionTransitionUpdate: 'passed_with_previous_version_fixture',
      launcherRollbackSimulatedUpdate: 'passed_with_previous_version_fixture',
      launcherPostRollbackUpdate: 'passed',
      launcherRepairCorruptFile: 'passed',
      packagedElectronClickThrough: 'covered_separately',
    },
    blockers: [],
    residualRisks: [
      'The previous version used for update and rollback is a fixture-local manifest derived from the current public pack plus one older-file placeholder; it proves launcher lifecycle mechanics without claiming a second public release exists for every lane.',
      'This smoke exercises Launcher resolver and lifecycle contracts in Node. Packaged Electron click-through remains covered by the existing per-pack Electron UI and all-modpack install smokes.',
    ],
  }
  await writeJson(args.out, report)
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion,
    ok: report.ok,
    coveredPackCount: report.coveredPackCount,
    out: args.out,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
