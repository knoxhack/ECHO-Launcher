#!/usr/bin/env node
import AdmZip from 'adm-zip'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PACK_ID = 'ashfall-standalone-engine-edition'
const VERSION = '2.0.0-beta.2'
const RELEASE_FOLDER_PREFIX = 'v2.0.0-ashfall-standalone-engine-edition-beta'
const ZIP_NAME = `${PACK_ID}-${VERSION}.zip`
const MANIFEST_NAME = `${PACK_ID}-beta-${VERSION}.pack.json`

function usage() {
  return `Usage: node scripts/ashfall-standalone-engine-local-e2e.mjs [options]

Installs the locally staged Ashfall Standalone Engine Edition ZIP, verifies all
manifest-required files, corrupts one required module file, repairs it from the
ZIP, then runs the packaged engine with --headless-smoke.

Options:
  --release-root <path>       Staged release asset folder.
                              Default: latest ../ECHO-Ashfall-Standalone-Engine-Edition/release-assets/${RELEASE_FOLDER_PREFIX}*
  --work-root <path>          Temporary install root.
                              Default: OS temp echo-standalone-engine-local-e2e
  --out <path>                Evidence report path.
                              Default: ../ECHO-Release-Index/release-readiness/ashfall-standalone-engine-local-e2e.json
  --java <path>               Java executable. Default: java
  --launch-timeout-ms <ms>    Headless launch timeout. Default: 120000
  --clean                     Remove work-root before running.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    releaseRoot: null,
    workRoot: path.join(os.tmpdir(), 'echo-standalone-engine-local-e2e'),
    out: path.resolve(root, '..', 'ECHO-Release-Index', 'release-readiness', 'ashfall-standalone-engine-local-e2e.json'),
    java: 'java',
    launchTimeoutMs: 120_000,
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
    if (arg === '--release-root') args.releaseRoot = path.resolve(next())
    else if (arg === '--work-root') args.workRoot = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--java') args.java = next()
    else if (arg === '--launch-timeout-ms') args.launchTimeoutMs = Number(next())
    else if (arg === '--clean') args.clean = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isFinite(args.launchTimeoutMs) || args.launchTimeoutMs < 10_000) {
    throw new Error('--launch-timeout-ms must be at least 10000.')
  }
  return args
}

function releaseFolderRank(folderName) {
  if (folderName === RELEASE_FOLDER_PREFIX) return 0
  if (!folderName.startsWith(`${RELEASE_FOLDER_PREFIX}.`)) return -1
  const suffix = folderName.slice(RELEASE_FOLDER_PREFIX.length + 1)
  if (!/^\d+$/u.test(suffix)) return -1
  return Number(suffix)
}

async function resolveDefaultReleaseRoot(root) {
  const releaseAssetsRoot = path.resolve(root, '..', 'ECHO-Ashfall-Standalone-Engine-Edition', 'release-assets')
  const entries = await fs.readdir(releaseAssetsRoot, { withFileTypes: true })
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, rank: releaseFolderRank(entry.name) }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) => right.rank - left.rank)
  assert(candidates.length > 0, `No staged release folder matching ${RELEASE_FOLDER_PREFIX}* under ${releaseAssetsRoot}.`)
  return path.join(releaseAssetsRoot, candidates[0].name)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath))
}

function parseChecksums(text) {
  const rows = new Map()
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([a-f0-9]{64})\s+\*?(.+)$/iu)
    if (!match) throw new Error(`Invalid checksum row: ${line}`)
    rows.set(match[2].trim().replace(/\\/g, '/'), match[1].toLowerCase())
  }
  return rows
}

async function verifyChecksums(releaseRoot) {
  const rows = parseChecksums(await fs.readFile(path.join(releaseRoot, 'checksums.txt'), 'utf8'))
  const verified = []
  for (const [name, expected] of rows.entries()) {
    const actual = await sha256File(path.join(releaseRoot, name))
    if (actual !== expected) throw new Error(`checksums.txt mismatch for ${name}: ${actual} != ${expected}`)
    verified.push(name)
  }
  return verified.sort()
}

function normalizedPath(filePath) {
  return String(filePath ?? '').replace(/\\/g, '/')
}

function detectZipRoot(zip, manifest) {
  const firstPath = normalizedPath(manifest.files?.[0]?.path)
  if (!firstPath) return ''
  const suffix = `/${firstPath}`
  const direct = zip.getEntry(firstPath)
  if (direct && !direct.isDirectory) return ''
  const entry = zip.getEntries().find((item) => !item.isDirectory && normalizedPath(item.entryName).endsWith(suffix))
  if (!entry) throw new Error(`Could not find ${firstPath} in ${ZIP_NAME}.`)
  return normalizedPath(entry.entryName).slice(0, -suffix.length)
}

function zipPath(root, filePath) {
  const relative = normalizedPath(filePath)
  return root ? `${root}/${relative}` : relative
}

function entryBytes(zip, root, filePath) {
  const entry = zip.getEntry(zipPath(root, filePath))
  if (!entry || entry.isDirectory) throw new Error(`ZIP entry missing: ${zipPath(root, filePath)}`)
  return Buffer.from(entry.getData())
}

async function extractManifestFile(zip, root, file, installRoot) {
  const bytes = entryBytes(zip, root, file.path)
  const actualSha = sha256Bytes(bytes)
  if (actualSha !== String(file.sha256).toLowerCase()) throw new Error(`${file.path}: ZIP SHA-256 mismatch`)
  if (bytes.length !== Number(file.size)) throw new Error(`${file.path}: ZIP size mismatch`)
  const target = path.join(installRoot, file.path)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, bytes)
  return target
}

async function installFromZip(manifest, zip, root, installRoot) {
  await fs.rm(installRoot, { recursive: true, force: true })
  await fs.mkdir(path.join(installRoot, '.echo'), { recursive: true })
  const installed = []
  for (const file of manifest.files ?? []) {
    await extractManifestFile(zip, root, file, installRoot)
    installed.push(file.path)
  }
  await writeJson(path.join(installRoot, '.echo', 'installed-manifest.json'), manifest)
  return installed
}

async function verifyInstall(manifest, installRoot) {
  const valid = []
  const missing = []
  const corrupt = []
  for (const file of manifest.files ?? []) {
    const target = path.join(installRoot, file.path)
    try {
      const stat = await fs.stat(target)
      const actualSha = await sha256File(target)
      if (actualSha !== String(file.sha256).toLowerCase() || stat.size !== Number(file.size)) corrupt.push(file.path)
      else valid.push(file.path)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      missing.push(file.path)
    }
  }
  return { ok: missing.length === 0 && corrupt.length === 0, valid, missing, corrupt }
}

async function repairCorruptFile(manifest, zip, root, installRoot) {
  const targetFile = (manifest.files ?? []).find((file) => file.required !== false && /^mods\/.+\.jar$/iu.test(normalizedPath(file.path)))
    ?? (manifest.files ?? []).find((file) => file.required !== false)
  assert(targetFile, 'Manifest has no required file to corrupt for repair smoke.')
  const targetPath = path.join(installRoot, targetFile.path)
  await fs.writeFile(targetPath, Buffer.from('corrupted ashfall standalone engine local e2e file\n', 'utf8'))
  const corruptSha = await sha256File(targetPath)
  assert(corruptSha !== String(targetFile.sha256).toLowerCase(), `${targetFile.path}: corruption did not alter file hash.`)
  const beforeRepair = await verifyInstall(manifest, installRoot)
  assert(beforeRepair.corrupt.includes(targetFile.path), `${targetFile.path}: corruption was not detected.`)
  await extractManifestFile(zip, root, targetFile, installRoot)
  const afterRepair = await verifyInstall(manifest, installRoot)
  assert(afterRepair.ok, `${targetFile.path}: repair did not restore manifest verification.`)
  return { repaired: targetFile.path, beforeRepair, afterRepair }
}

async function runHeadlessSmoke(args, manifest, installRoot) {
  const engineFile = (manifest.files ?? []).find((file) => /^echo-standalone-engine-.*\.jar$/iu.test(path.basename(normalizedPath(file.path))))
  assert(engineFile, 'Manifest does not list an echo-standalone-engine-*.jar file.')
  const engineJar = path.join(installRoot, engineFile.path)
  assert(await exists(engineJar), `Engine JAR is missing: ${engineJar}`)
  const logDir = path.join(installRoot, 'logs')
  await fs.mkdir(logDir, { recursive: true })
  const logPath = path.join(logDir, 'ashfall-standalone-engine-local-e2e-headless.log')
  const saveRoot = path.join(installRoot, 'saves')
  const commandArgs = [
    '-Dfile.encoding=UTF-8',
    '-jar',
    engineJar,
    '--pack-root',
    installRoot,
    '--manifest',
    'pack.json',
    '--save-root',
    saveRoot,
    '--headless-smoke',
  ]
  const result = await execFileAsync(args.java, commandArgs, {
    cwd: installRoot,
    timeout: args.launchTimeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  })
  const combined = `${result.stdout ?? ''}${result.stderr ? `\n${result.stderr}` : ''}`
  await fs.writeFile(logPath, combined, 'utf8')
  const smokeReportPath = path.join(saveRoot, 'headless-smoke', 'headless-smoke-report.json')
  assert(await exists(smokeReportPath), `Headless smoke report was not written: ${smokeReportPath}`)
  const smokeReport = await readJson(smokeReportPath)
  assert(smokeReport.status === 'PASS', `Headless smoke status is ${smokeReport.status ?? 'missing'}.`)
  return { command: [args.java, ...commandArgs], logPath, smokeReportPath, status: smokeReport.status }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (!args.releaseRoot) args.releaseRoot = await resolveDefaultReleaseRoot(process.cwd())
  const zipPathOnDisk = path.join(args.releaseRoot, ZIP_NAME)
  const manifestPath = path.join(args.releaseRoot, MANIFEST_NAME)
  const releasePath = path.join(args.releaseRoot, 'echo-release.json')
  const auditPath = path.join(args.releaseRoot, 'release-audit.json')
  assert(await exists(zipPathOnDisk), `Missing staged ZIP: ${zipPathOnDisk}`)
  assert(await exists(manifestPath), `Missing staged manifest: ${manifestPath}`)
  const [manifest, release, audit, checksumRows] = await Promise.all([
    readJson(manifestPath),
    readJson(releasePath),
    readJson(auditPath),
    verifyChecksums(args.releaseRoot),
  ])
  assert(manifest.pack === PACK_ID || manifest.id === PACK_ID, `Manifest pack is ${manifest.pack ?? manifest.id}, expected ${PACK_ID}.`)
  assert(manifest.loader === 'echo-standalone-engine', `Manifest loader is ${manifest.loader}, expected echo-standalone-engine.`)
  assert(manifest.runtime?.requiredJava === '21+', `Manifest runtime.requiredJava is ${manifest.runtime?.requiredJava}, expected 21+.`)
  assert(manifest.artifactName === ZIP_NAME, `Manifest artifactName is ${manifest.artifactName}, expected ${ZIP_NAME}.`)
  assert(String(manifest.artifactSha256).toLowerCase() === await sha256File(zipPathOnDisk), 'Manifest artifactSha256 does not match staged ZIP.')
  assert(Number(manifest.artifactSize) === (await fs.stat(zipPathOnDisk)).size, 'Manifest artifactSize does not match staged ZIP.')
  assert(release.validation === 'warning' || release.warningGated === true || release.validation?.status === 'warning' || release.status === 'warning', 'echo-release.json must remain warning-gated.')
  const releaseTag = release.releaseTag ?? audit.releaseTag ?? path.basename(args.releaseRoot)
  assert(releaseTag.startsWith(RELEASE_FOLDER_PREFIX), `Release tag is ${releaseTag}, expected ${RELEASE_FOLDER_PREFIX}*.`)
  if (audit.releaseTag) assert(audit.releaseTag === releaseTag, `release-audit.json releaseTag ${audit.releaseTag} does not match ${releaseTag}.`)
  const gameplayParity = (audit.checks ?? []).find((check) => check?.id === 'gameplay-parity')
  assert(gameplayParity?.status === 'NOT_CLAIMED', 'release-audit.json must not claim gameplay parity.')

  const zip = new AdmZip(zipPathOnDisk)
  const root = detectZipRoot(zip, manifest)
  const installRoot = path.join(args.workRoot, 'Ashfall Standalone Engine Edition')
  if (args.clean) await fs.rm(args.workRoot, { recursive: true, force: true })
  const installed = await installFromZip(manifest, zip, root, installRoot)
  const installedVerification = await verifyInstall(manifest, installRoot)
  assert(installedVerification.ok, 'Installed file verification failed.')
  const repair = await repairCorruptFile(manifest, zip, root, installRoot)
  const headless = await runHeadlessSmoke(args, manifest, installRoot)
  const report = {
    schemaVersion: 'echo.ashfall-standalone-engine-local-e2e.v1',
    generatedAt: new Date().toISOString(),
    packId: PACK_ID,
    version: VERSION,
    releaseTag,
    releaseRoot: args.releaseRoot,
    installRoot,
    zipRoot: root,
    checksumRows,
    manifest: {
      file: MANIFEST_NAME,
      files: manifest.files?.length ?? 0,
      modules: manifest.moduleRequirements?.length ?? 0,
      artifactSha256: manifest.artifactSha256,
      artifactSize: manifest.artifactSize,
    },
    installed: {
      files: installed.length,
      verified: installedVerification.valid.length,
    },
    repair: {
      repaired: repair.repaired,
      corruptBeforeRepair: repair.beforeRepair.corrupt,
      verifiedAfterRepair: repair.afterRepair.valid.length,
    },
    headless,
    warnings: [
      'This is a local staged-asset smoke. Public URL hash verification and gameplay parity remain separate proof gates.',
    ],
  }
  await writeJson(args.out, report)
  console.log(`Ashfall Standalone Engine local E2E PASS: ${args.out}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
