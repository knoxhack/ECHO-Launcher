import AdmZip from 'adm-zip'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { resolveEchoProtocolEntry } from '../electron/release-index-resolver.mjs'

const MODULE_ID = 'echogalacticsurveyprotocol'
const MODULE_RELEASE_TAG = 'galactic-survey-0.1.0-alpha'
const TRUST_LABEL = 'local-galactic-survey-draft-smoke'

const EDITIONS = [
  {
    repoName: 'ECHO-Galactic-Survey-Native-Edition',
    packId: 'galactic-survey-native-edition',
    releaseTag: 'galactic-survey-native-0.1.0-alpha',
    artifactRole: 'native',
  },
  {
    repoName: 'ECHO-Galactic-Survey-NeoForge-Edition',
    packId: 'galactic-survey-neoforge-edition',
    releaseTag: 'galactic-survey-neoforge-0.1.0-alpha',
    artifactRole: 'neoforge',
  },
  {
    repoName: 'ECHO-Galactic-Survey-Standalone-Edition',
    packId: 'galactic-survey-standalone-edition',
    releaseTag: 'galactic-survey-standalone-0.1.0-alpha',
    artifactRole: 'standalone',
  },
]

function usage() {
  return `Usage: node scripts/galactic-survey-launcher-lifecycle-smoke.mjs [options]

Runs a Launcher-owned lifecycle smoke against downloaded Galactic Survey draft assets.

Options:
  --download-root <path>  Root containing downloaded edition assets.
                          Default: ../ECHO-Release-Index/tmp/galactic-survey-draft-download
  --work-root <path>      Temporary install root. Default: tmp/galactic-survey-launcher-lifecycle-smoke
  --out <path>            Evidence output path.
                          Default: ../ECHO-Release-Index/release-readiness/galactic-survey-launcher-lifecycle-smoke.json
  --clean                 Remove work-root before running.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    downloadRoot: path.resolve(root, '..', 'ECHO-Release-Index', 'tmp', 'galactic-survey-draft-download'),
    workRoot: path.resolve(root, 'tmp', 'galactic-survey-launcher-lifecycle-smoke'),
    out: path.resolve(root, '..', 'ECHO-Release-Index', 'release-readiness', 'galactic-survey-launcher-lifecycle-smoke.json'),
    clean: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--download-root') args.downloadRoot = path.resolve(next())
    else if (arg === '--work-root') args.workRoot = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--clean') args.clean = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath))
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
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

function protocolFile(manifest) {
  const targetFile = (manifest.files ?? []).find((file) => file.moduleId === MODULE_ID) ?? manifest.files?.[0]
  if (!targetFile) throw new Error(`${manifest.pack}: no manifest files available for lifecycle fixture`)
  return targetFile
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

async function preparePreviousInstallFixture(manifest, installRoot) {
  const targetFile = protocolFile(manifest)
  const targetPath = path.join(installRoot, targetFile.path)
  await fs.writeFile(targetPath, Buffer.from('previous version placeholder for Galactic Survey launcher update smoke\n', 'utf8'))
  const previousTargetSha = await sha256File(targetPath)
  const previousTargetStat = await fs.stat(targetPath)
  const obsoletePath = manifest.pack.endsWith('native-edition')
    ? 'addons/galactic-survey-obsolete-smoke.echo-addon'
    : 'mods/galactic-survey-obsolete-smoke.jar'
  const obsoleteAbsolute = path.join(installRoot, obsoletePath)
  await fs.mkdir(path.dirname(obsoleteAbsolute), { recursive: true })
  await fs.writeFile(obsoleteAbsolute, Buffer.from('obsolete Galactic Survey launcher update smoke file\n', 'utf8'))
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
        moduleId: 'galactic-survey-obsolete-smoke',
      },
    ],
  }
  await writeJson(path.join(installRoot, '.echo', 'installed-manifest.json'), previousManifest)
  const previousVerification = await verifyInstall(previousManifest, installRoot)
  if (!previousVerification.ok) throw new Error(`${manifest.pack}: previous-version update fixture did not verify`)
  return { targetFile, previousTargetSha, obsoletePath, previousManifest, previousVersion, previousVerification }
}

async function updateFromPackZip(manifest, zip, installRoot, fixture) {
  const backupRoot = path.join(installRoot, '.echo', 'rollback', 'launcher-update-smoke')
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

async function rollbackUpdate(rollbackPlan) {
  for (const relativePath of rollbackPlan.removed ?? []) {
    await fs.rm(path.join(rollbackPlan.installPath, relativePath), { force: true })
  }
  for (const backup of rollbackPlan.backedUp ?? []) {
    const destination = path.join(rollbackPlan.installPath, backup.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(backup.backupPath, destination)
  }
}

async function repairFromPackZip(manifest, zip, installRoot) {
  const targetFile = protocolFile(manifest)
  const targetPath = path.join(installRoot, targetFile.path)
  await fs.writeFile(targetPath, Buffer.from('corrupted Galactic Survey launcher repair smoke file\n', 'utf8'))
  const corruptSha = await sha256File(targetPath)
  if (corruptSha === String(targetFile.sha256).toLowerCase()) throw new Error(`${manifest.pack}: repair corruption did not alter file`)
  await extractFile(zip, targetFile, installRoot)
  const after = await verifyInstall(manifest, installRoot)
  if (!after.ok) throw new Error(`${manifest.pack}: repair verification failed`)
  return { repaired: targetFile.path, after }
}

async function buildCatalogEntries({ edition, manifest, manifestPath, moduleArtifactPath, moduleFile }) {
  const manifestStat = await fs.stat(manifestPath)
  const moduleStat = await fs.stat(moduleArtifactPath)
  const addonEntry = {
    id: MODULE_ID,
    kind: 'addon',
    version: moduleFile.version ?? '0.1.0',
    channel: 'alpha',
    publisher: 'knoxhack',
    sourceRepo: 'knoxhack/ECHO-Modules',
    releaseTag: MODULE_RELEASE_TAG,
    artifacts: {
      [edition.artifactRole]: {
        file: moduleFile.assetName ?? path.basename(moduleArtifactPath),
        url: pathToFileURL(moduleArtifactPath).href,
        size: moduleStat.size,
        sha256: await sha256File(moduleArtifactPath),
      },
    },
    dependencies: [],
    compatibility: [edition.packId],
    trust: TRUST_LABEL,
    validation: 'approved',
  }
  const packEntry = {
    id: edition.packId,
    kind: 'modpack',
    version: manifest.version,
    channel: manifest.channel,
    publisher: 'knoxhack',
    sourceRepo: `knoxhack/${edition.repoName}`,
    releaseTag: edition.releaseTag,
    artifacts: {
      manifest: {
        file: path.basename(manifestPath),
        url: pathToFileURL(manifestPath).href,
        size: manifestStat.size,
        sha256: await sha256File(manifestPath),
      },
    },
    dependencies: [{ id: MODULE_ID, kind: 'addon', version: '*' }],
    compatibility: [edition.packId],
    trust: TRUST_LABEL,
    validation: 'approved',
  }
  return [addonEntry, packEntry]
}

async function smokeEdition(args, edition) {
  const downloadDir = path.join(args.downloadRoot, edition.repoName)
  const release = await readJson(path.join(downloadDir, 'echo-release.json'))
  const manifestPath = path.join(downloadDir, release.manifestAsset)
  const manifest = await readJson(manifestPath)
  const zipPath = path.join(downloadDir, release.artifactAsset)
  const zipBytes = await fs.readFile(zipPath)
  if (sha256Bytes(zipBytes) !== String(release.artifactSha256).toLowerCase()) {
    throw new Error(`${edition.repoName}: release artifact SHA-256 mismatch`)
  }
  if (manifest.artifactSha256 !== release.artifactSha256) {
    throw new Error(`${edition.repoName}: release and pack manifest artifact SHA-256 differ`)
  }
  const topLevelChecksums = await verifyTopLevelChecksums(downloadDir)
  const zip = new AdmZip(zipPath)
  for (const required of ['.echo/pack-manifest.json', '.echo/export-report.json', '.echo/checksums.sha256']) {
    if (!zip.getEntry(required)) throw new Error(`${edition.repoName}: missing ${required}`)
  }

  const moduleFile = (manifest.files ?? []).find((file) => file.moduleId === MODULE_ID)
  if (!moduleFile) throw new Error(`${edition.repoName}: manifest missing ${MODULE_ID} file`)
  const moduleArtifactPath = path.join(args.workRoot, edition.repoName, 'module-artifacts', moduleFile.assetName ?? path.basename(moduleFile.path))
  await fs.mkdir(path.dirname(moduleArtifactPath), { recursive: true })
  await fs.writeFile(moduleArtifactPath, entryBytes(zip, moduleFile.path))

  const catalogEntries = await buildCatalogEntries({ edition, manifest, manifestPath, moduleArtifactPath, moduleFile })
  const updateLink = `echo://update/pack/${edition.packId}`
  const addonLink = `echo://install/addon/${MODULE_ID}?pack=${edition.packId}`
  const updateResolution = resolveEchoProtocolEntry(updateLink, catalogEntries)
  const addonResolution = resolveEchoProtocolEntry(addonLink, catalogEntries)
  if (!updateResolution) throw new Error(`${edition.repoName}: update deep link did not resolve`)
  if (!addonResolution) throw new Error(`${edition.repoName}: addon deep link did not resolve`)

  const installRoot = path.join(args.workRoot, edition.repoName, 'install')
  const installed = await installFromPackZip(manifest, zip, installRoot)
  const fixture = await preparePreviousInstallFixture(manifest, installRoot)
  const update = await updateFromPackZip(manifest, zip, installRoot, fixture)
  await rollbackUpdate(update.rollbackPlan)
  const restoredTargetSha = await sha256File(path.join(installRoot, fixture.targetFile.path))
  if (restoredTargetSha !== fixture.previousTargetSha) {
    throw new Error(`${edition.repoName}: rollback did not restore previous target file`)
  }
  await fs.access(path.join(installRoot, fixture.obsoletePath))
  const updateAfterRollback = await updateFromPackZip(manifest, zip, installRoot, fixture)
  const repair = await repairFromPackZip(manifest, zip, installRoot)

  return {
    repoName: edition.repoName,
    pack: manifest.pack,
    releaseTag: edition.releaseTag,
    manifestAsset: release.manifestAsset,
    artifactAsset: release.artifactAsset,
    moduleCount: manifest.modules?.length ?? manifest.files?.length ?? 0,
    fileCount: manifest.files?.length ?? 0,
    topLevelChecksums,
    deepLinks: {
      update: { url: updateLink, artifact: updateResolution.artifact.name },
      installAddon: { url: addonLink, artifact: addonResolution.artifact.name },
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
    },
    postRollbackUpdate: {
      updated: updateAfterRollback.updated.length,
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

  const editions = []
  for (const edition of EDITIONS) {
    editions.push(await smokeEdition(args, edition))
  }
  const report = {
    schemaVersion: 'echo.galactic_survey.launcher-lifecycle-smoke.v1',
    ok: true,
    generatedAt: new Date().toISOString(),
    downloadRoot: args.downloadRoot,
    workRoot: args.workRoot,
    editions,
    gates: {
      launcherReleaseIndexDeepLinks: 'passed',
      launcherInstallFromPackZip: 'passed',
      launcherUpdateReconciliation: 'passed',
      launcherVersionTransitionUpdate: 'passed',
      launcherRepairCorruptFile: 'passed',
      launcherRollbackSimulatedUpdate: 'passed',
      realVersionToVersionUpdate: 'passed_with_previous_version_fixture',
      packagedElectronCardUiSmoke: 'not_started',
      electronInstallUpdateRepairClickThrough: 'not_started',
      electronRollbackClickThrough: 'not_available_no_visible_ui_command',
    },
    blockers: [],
    residualRisks: [
      'The previous Galactic Survey version is a fixture-local manifest generated from current draft assets plus an older module placeholder; it proves launcher update mechanics without claiming a second public Galactic Survey release exists.',
      'This script uses Launcher-owned resolver and lifecycle contracts from Node against downloaded GitHub draft assets; packaged Electron install/update/repair click-through remains separate UI evidence.',
      'Real gameplay evidence remains required before public alpha promotion.',
    ],
  }
  await writeJson(args.out, report)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
