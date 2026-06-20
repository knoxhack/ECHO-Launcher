import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const ASHFALL_LANES = [
  {
    packId: 'ashfall-native-edition',
    lane: 'native',
    name: 'Ashfall Native Edition',
    modulePattern: /^addons\/.+\.echo-addon$/iu,
    runtimeProofs: [
      'clientStarted',
      'mainMenuNativeReplacement',
      'worldCreatedOrLoaded',
      'hudVisible',
      'inventoryIndexVisible',
      'terminalVisible',
      'holomapVisible',
      'lensVisible',
      'creativeTabVisible',
      'creativeTabSearchVisible',
      'creativeItemSelectable',
      'creativeItemPlayable',
      'saveReloadVerified',
    ],
  },
  {
    packId: 'ashfall-neoforge-edition',
    lane: 'neoforge',
    name: 'Ashfall NeoForge Edition',
    modulePattern: /^mods\/.+-neoforge\.jar$/iu,
    runtimeProofs: [
      'clientStarted',
      'worldCreatedOrLoaded',
      'hudVisible',
      'inventoryIndexVisible',
      'terminalVisible',
      'holomapVisible',
      'lensVisible',
      'creativeTabVisible',
      'creativeTabSearchVisible',
      'creativeItemSelectable',
      'creativeItemPlayable',
      'saveReloadVerified',
    ],
  },
  {
    packId: 'ashfall-standalone-edition',
    lane: 'standalone',
    name: 'Ashfall Standalone Edition',
    modulePattern: /^mods\/.+-standalone\.jar$/iu,
    runtimeProofs: [
      'clientStarted',
      'worldCreatedOrLoaded',
      'hudVisible',
      'inventoryIndexVisible',
      'terminalVisible',
      'holomapVisible',
      'lensVisible',
      'creativeTabVisible',
      'creativeTabSearchVisible',
      'creativeItemSelectable',
      'creativeItemPlayable',
      'saveReloadVerified',
    ],
  },
]

const DEFAULT_OUT = '../ECHO-Release-Index/release-readiness/ashfall-lane-game-smoke.json'
const COMPUTER_USE_SESSION_SCHEMA = 'echo.ashfall.computer_use_gameplay_session.v1'
const COMPUTER_USE_CHECK_STATUSES = new Set(['captured', 'blocked', 'not-attempted'])
const EVIDENCE_FILE_NAMES = [
  'ashfall-lane-game-smoke-evidence.json',
  'ashfall-game-smoke-evidence.json',
  'game-smoke-evidence.json',
]

function usage() {
  return `Usage: node scripts/ashfall-lane-game-smoke.mjs [options]

Audits real local Ashfall lane launch/play evidence. This is intentionally not
an install-only check: strict mode fails unless each Ashfall lane has a valid
installed manifest, registry-backed module files, no newer crash report, and
real gameplay evidence for world entry, ECHO UI surfaces, creative inventory
visibility/search/selection, item use, and save/reload.

Evidence can be supplied per lane as JSON named one of:
  ${EVIDENCE_FILE_NAMES.join(', ')}

The script looks in each instance .echo folder, then in --evidence-root using
the pack id or display name as a child folder.

Options:
  --instance-root <path>  ECHO Launcher instance root.
                          Default: ~/ECHOLauncher/Instances
  --evidence-root <path>  Additional evidence root.
  --out <path>            Report path. Default: ${DEFAULT_OUT}
  --strict                Exit non-zero when any lane is not fully proven.
  --help                  Print this help text.

Evidence file format:
{
  "schemaVersion": "echo.ashfall.lane-game-smoke.evidence.v1",
  "packId": "ashfall-native-edition",
  "claims": {
    "clientStarted": true,
    "mainMenuNativeReplacement": true,
    "worldCreatedOrLoaded": true,
    "hudVisible": true,
    "inventoryIndexVisible": true,
    "terminalVisible": true,
    "holomapVisible": true,
    "lensVisible": true,
    "creativeTabVisible": true,
    "creativeTabSearchVisible": true,
    "creativeItemSelectable": true,
    "creativeItemPlayable": true,
    "saveReloadVerified": true
  },
  "proofs": {
    "hudVisible": ["screenshots/hud-visible.png"],
    "saveReloadVerified": ["logs/client-playthrough.log", "saves/reloaded-world.zip"]
  }
}
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    instanceRoot: path.join(os.homedir(), 'ECHOLauncher', 'Instances'),
    evidenceRoot: '',
    out: path.resolve(root, DEFAULT_OUT),
    strict: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${arg} requires a value`)
      return value
    }
    if (arg === '--instance-root') args.instanceRoot = path.resolve(next())
    else if (arg === '--evidence-root') args.evidenceRoot = path.resolve(next())
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--strict') args.strict = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
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
  const text = await fs.readFile(filePath, 'utf8')
  return JSON.parse(text.replace(/^\uFEFF/u, ''))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

async function listFiles(root, predicate = () => true) {
  const found = []
  async function walk(dir) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
      } else if (predicate(absolute, entry.name)) {
        found.push(absolute)
      }
    }
  }
  await walk(root)
  return found
}

async function newestFile(files) {
  let newest = null
  for (const filePath of files) {
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat) continue
    if (!newest || stat.mtimeMs > newest.mtimeMs) newest = { path: filePath, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString() }
  }
  return newest
}

async function readRuntimeLogText(files, minimumMtimeMs = 0) {
  const logs = []
  for (const filePath of files) {
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat || stat.mtimeMs < minimumMtimeMs) continue
    const text = await readTextIfExists(filePath)
    if (text) logs.push({ mtimeMs: stat.mtimeMs, text })
  }
  logs.sort((left, right) => left.mtimeMs - right.mtimeMs)
  return logs.map((log) => log.text).join('\n')
}

function normalizeRelative(filePath) {
  return String(filePath ?? '').replace(/\\/gu, '/')
}

function hasWorldLoadedSignal(text) {
  return /\bServerLevel\[/iu.test(text) ||
    /\bIntegrated singleplayer server\b/iu.test(text) ||
    /\bPreparing start region\b/iu.test(text) ||
    /\bJoined world\b/iu.test(text) ||
    /\bLevel dimension:/iu.test(text)
}

function hasClientStartedSignal(text) {
  return /\bGame directory:/iu.test(text) ||
    /\bMinecraft Version:/iu.test(text) ||
    /\bNative profile screen:/iu.test(text) ||
    /\bECHO Launcher initialized/iu.test(text) ||
    /\bECHO Native/iu.test(text)
}

function hasNativeMenuSignal(text) {
  return /\bNative profile screen:\s*Ashfall\b/iu.test(text) ||
    /\bECHO BUS\b/iu.test(text) ||
    /\bCreate Ashfall World\b/iu.test(text) ||
    /\bASHFALL WORLD\b/iu.test(text)
}

function claimValue(evidence, key) {
  if (!evidence || typeof evidence !== 'object') return false
  if (evidence.claims && typeof evidence.claims === 'object') return evidence.claims[key] === true
  return evidence[key] === true
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function collectProofPathValues(value, found = []) {
  if (!value) return found
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) found.push(trimmed)
    return found
  }
  if (Array.isArray(value)) {
    for (const item of value) collectProofPathValues(item, found)
    return found
  }
  if (typeof value !== 'object') return found

  for (const key of [
    'path',
    'file',
    'notes',
    'screenshot',
    'log',
    'launcherLog',
    'clientLog',
    'saveSnapshot',
    'artifact',
  ]) {
    collectProofPathValues(value[key], found)
  }
  for (const key of [
    'paths',
    'files',
    'supportingFiles',
    'screenshots',
    'logs',
    'saveSnapshots',
    'artifacts',
  ]) {
    collectProofPathValues(value[key], found)
  }
  return found
}

function claimProofReferences(evidence, key) {
  if (!evidence || typeof evidence !== 'object') return []
  return [
    ...collectProofPathValues(objectValue(evidence.proofs)?.[key]),
    ...collectProofPathValues(objectValue(evidence.claimEvidence)?.[key]),
    ...collectProofPathValues(objectValue(evidence.evidence)?.[key]),
  ]
}

function resolveProofPath(reference, evidencePath, instancePath) {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(reference)) return ''
  if (path.isAbsolute(reference)) return path.normalize(reference)
  const baseDir = evidencePath ? path.dirname(evidencePath) : instancePath
  return path.resolve(baseDir, reference)
}

async function verifyClaimProofFiles(evidenceRecord, instancePath, key) {
  const references = [...new Set(claimProofReferences(evidenceRecord.evidence, key))]
  const files = []
  const missing = []
  for (const reference of references) {
    const absolutePath = resolveProofPath(reference, evidenceRecord.path, instancePath)
    if (!absolutePath) {
      missing.push({ reference, reason: 'URL references are not accepted as local gameplay proof.' })
      continue
    }
    const stat = await fs.stat(absolutePath).catch(() => null)
    if (!stat?.isFile()) {
      missing.push({ reference, path: absolutePath, reason: 'Proof file does not exist.' })
      continue
    }
    if (stat.size <= 0) {
      missing.push({ reference, path: absolutePath, reason: 'Proof file is empty.' })
      continue
    }
    files.push({ reference, path: absolutePath, size: stat.size, mtime: stat.mtime.toISOString() })
  }
  return {
    ok: files.length > 0 && missing.length === 0,
    files,
    missing,
  }
}

function normalizeReference(value) {
  return String(value ?? '').trim().replace(/\\/gu, '/')
}

function relativeProofPath(instancePath, absolutePath) {
  return normalizeReference(path.relative(path.join(instancePath, '.echo'), absolutePath))
}

async function localProofFile(reference, evidencePath, instancePath) {
  const absolutePath = resolveProofPath(reference, evidencePath, instancePath)
  if (!absolutePath) return { ok: false, reference, reason: 'URL references are not accepted as local gameplay proof.' }
  const stat = await fs.stat(absolutePath).catch(() => null)
  if (!stat?.isFile()) return { ok: false, reference, path: absolutePath, reason: 'Proof file does not exist.' }
  if (stat.size <= 0) return { ok: false, reference, path: absolutePath, reason: 'Proof file is empty.' }
  return {
    ok: true,
    reference,
    path: absolutePath,
    relativePath: relativeProofPath(instancePath, absolutePath),
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  }
}

async function loadComputerUseSession(evidenceRecord, instancePath) {
  const reference = evidenceRecord.evidence?.computerUseSession
  if (!reference) {
    return {
      present: false,
      path: null,
      reference: null,
      session: null,
    }
  }
  const record = await localProofFile(reference, evidenceRecord.path, instancePath)
  if (!record.ok) {
    return {
      present: false,
      path: record.path ?? null,
      reference,
      session: null,
      blockers: [`Computer Use session ${reference}: ${record.reason}`],
    }
  }
  return {
    present: true,
    path: record.path,
    reference,
    session: await readJson(record.path),
    blockers: [],
  }
}

async function acceptedComputerUseRefs({ session, evidenceRecord, instancePath, claims, claimProofs }) {
  const refs = new Set()
  for (const [claim, proof] of Object.entries(claimProofs)) {
    if (claims[claim] !== true || proof?.ok !== true) continue
    refs.add(normalizeReference(claim))
    for (const file of proof.files ?? []) {
      refs.add(normalizeReference(file.reference))
      refs.add(relativeProofPath(instancePath, file.path))
    }
  }

  const artifactProofs = []
  for (const artifact of Array.isArray(session?.artifacts) ? session.artifacts : []) {
    const proofReference = artifact?.proof
    if (!proofReference) continue
    const record = await localProofFile(proofReference, evidenceRecord.path, instancePath)
    artifactProofs.push({
      kind: artifact.kind ?? null,
      proof: proofReference,
      ok: record.ok,
      reason: record.reason ?? null,
      path: record.path ?? null,
      relativePath: record.relativePath ?? null,
    })
    if (!record.ok) continue
    refs.add(normalizeReference(artifact.kind))
    refs.add(normalizeReference(proofReference))
    refs.add(record.relativePath)
  }
  return { refs, artifactProofs }
}

function verificationSummaryBlockers(checks, summary) {
  if (!summary || typeof summary !== 'object') return ['Computer Use session verificationSummary is missing.']
  const statuses = checks.map((check) => String(check?.status ?? '').trim().toLowerCase())
  const expected = {
    checkCount: checks.length,
    capturedCount: statuses.filter((status) => status === 'captured').length,
    blockedCount: statuses.filter((status) => status === 'blocked').length,
    notAttemptedCount: statuses.filter((status) => status === 'not-attempted').length,
  }
  const blockers = []
  for (const [key, value] of Object.entries(expected)) {
    if (summary[key] !== value) blockers.push(`Computer Use session verificationSummary.${key} is ${summary[key] ?? 'missing'}, expected ${value}.`)
  }
  return blockers
}

async function validateComputerUseSession({ evidenceRecord, instancePath, lane, claims, claimProofs }) {
  const record = await loadComputerUseSession(evidenceRecord, instancePath)
  const blockers = [...(record.blockers ?? [])]
  if (!record.present) return { ...record, blockers }

  const session = record.session
  if (session?.schemaVersion !== COMPUTER_USE_SESSION_SCHEMA) {
    blockers.push(`Computer Use session schemaVersion is ${session?.schemaVersion ?? 'missing'}, expected ${COMPUTER_USE_SESSION_SCHEMA}.`)
  }
  if (session?.packId !== lane.packId) blockers.push(`Computer Use session packId is ${session?.packId ?? 'missing'}, expected ${lane.packId}.`)
  if (session?.lane !== lane.lane) blockers.push(`Computer Use session lane is ${session?.lane ?? 'missing'}, expected ${lane.lane}.`)
  if (!Array.isArray(session?.actions) || session.actions.length === 0) {
    blockers.push('Computer Use session must list visible UI actions.')
  }
  if (!Array.isArray(session?.verificationChecks)) {
    blockers.push('Computer Use session verificationChecks must be an array.')
  }

  const checks = Array.isArray(session?.verificationChecks) ? session.verificationChecks : []
  const { refs, artifactProofs } = await acceptedComputerUseRefs({ session, evidenceRecord, instancePath, claims, claimProofs })
  for (const artifact of artifactProofs) {
    if (!artifact.ok) blockers.push(`Computer Use session artifact proof ${artifact.proof}: ${artifact.reason}`)
  }
  for (const [index, check] of checks.entries()) {
    const prefix = `Computer Use session verificationChecks[${index}]`
    if (!String(check?.id ?? '').trim()) blockers.push(`${prefix}.id is required.`)
    if (!String(check?.label ?? '').trim()) blockers.push(`${prefix}.label is required.`)
    const status = String(check?.status ?? '').trim().toLowerCase()
    if (!COMPUTER_USE_CHECK_STATUSES.has(status)) blockers.push(`${prefix}.status must be captured, blocked, or not-attempted.`)
    if (status === 'captured') {
      const evidenceRef = normalizeReference(check.evidenceRef)
      if (!evidenceRef) blockers.push(`${prefix}.evidenceRef is required when status is captured.`)
      else if (!refs.has(evidenceRef)) blockers.push(`${prefix}.evidenceRef ${evidenceRef} must reference a validated local claim proof or imported artifact proof.`)
    }
  }
  blockers.push(...verificationSummaryBlockers(checks, session?.verificationSummary))

  return {
    present: true,
    path: record.path,
    reference: record.reference,
    schemaVersion: session?.schemaVersion ?? null,
    capturedAt: session?.capturedAt ?? null,
    actionCount: Array.isArray(session?.actions) ? session.actions.length : 0,
    verificationSummary: session?.verificationSummary ?? null,
    artifactProofs,
    blockers,
  }
}

function compactCrashSummary(text) {
  const lines = text.split(/\r?\n/u)
  const summary = []
  for (const line of lines) {
    if (/^(Time|Description):/u.test(line) || /^\S.*(?:Exception|Error):/u.test(line) || /^\s*at\s/u.test(line)) {
      summary.push(line.trim())
    }
    if (summary.length >= 8) break
  }
  return summary
}

async function loadEvidence(args, lane, instancePath) {
  const candidates = []
  for (const fileName of EVIDENCE_FILE_NAMES) {
    candidates.push(path.join(instancePath, '.echo', fileName))
  }
  if (args.evidenceRoot) {
    for (const child of [lane.packId, lane.name]) {
      for (const fileName of EVIDENCE_FILE_NAMES) {
        candidates.push(path.join(args.evidenceRoot, child, fileName))
      }
    }
  }

  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue
    const evidence = await readJson(candidate)
    return { path: candidate, evidence }
  }
  return { path: '', evidence: null }
}

async function auditLane(args, lane) {
  const instancePath = path.join(args.instanceRoot, lane.name)
  const blockers = []
  const warnings = []
  const manifestPath = path.join(instancePath, '.echo', 'installed-manifest.json')
  const manifest = await exists(manifestPath) ? await readJson(manifestPath) : null
  const manifestStat = manifest ? await fs.stat(manifestPath).catch(() => null) : null
  if (!manifest) blockers.push(`Missing installed manifest: ${manifestPath}`)
  if (manifest && manifest.pack && manifest.pack !== lane.packId) blockers.push(`Installed manifest pack is ${manifest.pack}, expected ${lane.packId}.`)

  const manifestFiles = Array.isArray(manifest?.files) ? manifest.files : []
  const expectedModules = manifestFiles
    .map((file) => normalizeRelative(file.path))
    .filter((filePath) => lane.modulePattern.test(filePath))
  if (manifest && expectedModules.length === 0) blockers.push('Installed manifest contains no lane module files.')

  const missingModuleFiles = []
  for (const relativePath of expectedModules) {
    if (!(await exists(path.join(instancePath, relativePath)))) missingModuleFiles.push(relativePath)
  }
  if (missingModuleFiles.length > 0) blockers.push(`${missingModuleFiles.length} module file(s) listed in the installed manifest are missing on disk.`)

  const logFiles = await listFiles(path.join(instancePath, 'logs'), (filePath, name) => /\.log$/iu.test(name) || /\.txt$/iu.test(name))
  const newestLog = await newestFile(logFiles)
  const newestLogText = newestLog ? await readTextIfExists(newestLog.path) : ''
  const logText = await readRuntimeLogText(logFiles, manifestStat?.mtimeMs ?? 0) || newestLogText
  if (!newestLog) blockers.push('No runtime log file found under the instance logs directory.')

  const crashFiles = await listFiles(path.join(instancePath, 'crash-reports'), (filePath, name) => /\.txt$/iu.test(name))
  const newestCrash = await newestFile(crashFiles)
  const crashText = newestCrash ? await readTextIfExists(newestCrash.path) : ''
  const hasCrashAfterInstall = Boolean(newestCrash && (!manifestStat || newestCrash.mtimeMs >= manifestStat.mtimeMs))
  if (hasCrashAfterInstall) blockers.push(`Crash report exists after install: ${newestCrash.path}`)

  const screenshots = await listFiles(path.join(instancePath, 'screenshots'), (filePath, name) => /\.(png|jpg|jpeg|webp)$/iu.test(name))
  const evidenceRecord = await loadEvidence(args, lane, instancePath)
  const evidence = evidenceRecord.evidence
  if (!evidence) blockers.push('Missing real gameplay evidence JSON for launch/world/UI/creative-tab proof.')
  if (evidence?.packId && evidence.packId !== lane.packId) blockers.push(`Evidence packId is ${evidence.packId}, expected ${lane.packId}.`)

  const derivedClaims = {
    clientStarted: hasClientStartedSignal(logText) || hasClientStartedSignal(crashText),
    mainMenuNativeReplacement: lane.lane === 'native' ? hasNativeMenuSignal(logText) || hasNativeMenuSignal(crashText) : true,
    worldCreatedOrLoaded: hasWorldLoadedSignal(logText) || hasWorldLoadedSignal(crashText),
  }
  const claims = {}
  const claimProofs = {}
  for (const proof of lane.runtimeProofs) {
    const derived = derivedClaims[proof] === true
    const evidenceClaim = claimValue(evidence, proof)
    let evidenceProof = null
    if (evidenceClaim) {
      evidenceProof = await verifyClaimProofFiles(evidenceRecord, instancePath, proof)
      claimProofs[proof] = evidenceProof
      if (!evidenceProof.ok) {
        blockers.push(`Gameplay proof ${proof} is claimed true but does not reference at least one non-empty local proof file.`)
      }
    }
    claims[proof] = derived || (evidenceClaim && evidenceProof?.ok === true)
    if (!claims[proof]) blockers.push(`Missing gameplay proof: ${proof}`)
  }

  const computerUseSession = evidence
    ? await validateComputerUseSession({ evidenceRecord, instancePath, lane, claims, claimProofs })
    : { present: false, path: null, reference: null, blockers: [] }
  blockers.push(...computerUseSession.blockers.map((blocker) => `Computer Use session: ${blocker}`))

  if (lane.lane !== 'native' && evidence && Object.hasOwn(evidence.claims ?? evidence, 'mainMenuNativeReplacement')) {
    warnings.push('mainMenuNativeReplacement evidence is ignored for non-Native lane.')
  }

  const ok = blockers.length === 0
  return {
    packId: lane.packId,
    lane: lane.lane,
    name: lane.name,
    ok,
    instancePath,
    manifestPath,
    installedManifest: {
      present: Boolean(manifest),
      version: manifest?.version ?? null,
      fileCount: manifestFiles.length,
      expectedModuleFileCount: expectedModules.length,
      missingModuleFileCount: missingModuleFiles.length,
      missingModuleFiles: missingModuleFiles.slice(0, 25),
    },
    runtimeLog: newestLog,
    crashReport: newestCrash
      ? {
          ...newestCrash,
          afterInstall: hasCrashAfterInstall,
          summary: compactCrashSummary(crashText),
        }
      : null,
    screenshots: {
      count: screenshots.length,
      newest: await newestFile(screenshots),
    },
    evidence: {
      path: evidenceRecord.path,
      present: Boolean(evidence),
      schemaVersion: evidence?.schemaVersion ?? null,
      capturedAt: evidence?.capturedAt ?? null,
    },
    computerUseSession,
    claimProofs,
    claims,
    blockers,
    warnings,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }

  const lanes = []
  for (const lane of ASHFALL_LANES) {
    lanes.push(await auditLane(args, lane))
  }
  const blockers = lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.packId}: ${blocker}`))
  const report = {
    schemaVersion: 'echo.ashfall.lane-game-smoke.v1',
    generatedAt: new Date().toISOString(),
    strict: args.strict,
    ok: blockers.length === 0,
    scope: 'real-local-ashfall-launch-play-ui-creative-evidence',
    instanceRoot: args.instanceRoot,
    evidenceRoot: args.evidenceRoot || null,
    lanes,
    blockers,
    notes: [
      'This gate does not treat install success, metadata presence, or module class discovery as gameplay proof.',
      'Strict mode requires every Ashfall lane to prove world entry, ECHO surfaces, creative tab visibility/search/selection/use, save/reload, and no newer crash report.',
      'Native main-menu replacement is required only for the Native lane; NeoForge is judged on mod load, world entry, UI/content proof, and crash-free play evidence.',
    ],
  }
  await writeJson(args.out, report)
  if (!report.ok) {
    const message = `Ashfall lane game smoke failed: ${blockers.length} blocker(s). Report: ${args.out}`
    if (args.strict) throw new Error(message)
    console.warn(message)
  } else {
    console.log(`Ashfall lane game smoke passed: ${args.out}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
