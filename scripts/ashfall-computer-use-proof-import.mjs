#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const EVIDENCE_FILE_NAME = 'ashfall-lane-game-smoke-evidence.json'
const SESSION_FILE_NAME = 'computer-use-session.json'
const EVIDENCE_SCHEMA_VERSION = 'echo.ashfall.lane-game-smoke.evidence.v1'
const SESSION_SCHEMA_VERSION = 'echo.ashfall.computer_use_gameplay_session.v1'
const VERIFICATION_CHECK_STATUSES = new Set(['captured', 'blocked', 'not-attempted'])

const ASHFALL_LANES = [
  {
    packId: 'ashfall-native-edition',
    lane: 'native',
    name: 'Ashfall Native Edition',
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

function usage() {
  return `Usage:
  node scripts/ashfall-computer-use-proof-import.mjs --lane native|neoforge|standalone --claim <claim=proof-file> [options]

Imports local screenshots/logs/save snapshots captured during a Computer Use
gameplay session into the strict Ashfall lane evidence file. This script does
not prove gameplay by itself; it only accepts non-empty local files that were
created by an actual visible session.

Options:
  --instance-root <path>  ECHO Launcher instance root.
                          Default: ~/ECHOLauncher/Instances
  --lane <lane>           native, neoforge, or standalone. Required.
  --claim <spec>          claim=path-to-proof-file. Repeat for multiple claims.
  --log <path>            Runtime/client log copied into .echo/proofs/logs.
  --save <path>           Save snapshot ZIP copied into .echo/proofs/saves.
  --action <text>         Visible action taken by Computer Use. Repeatable.
  --proof-source <value>  Source label for imported claim proof files.
                          Default: computer-use-window-screenshot.
  --verification-check <v> UI/gameplay check as id|label|status|evidenceRef|note.
                          Repeatable. Captured checks must reference an imported
                          claim id, imported proof path, or artifact proof.
  --app-id <id>           Target app id from Computer Use.
  --window-title <title>  Target game/runtime window title.
  --captured-at <iso>     Capture timestamp. Default: now.
  --strict                Exit non-zero when any supplied file is invalid.
  --json                  Print full import report.
  --help                  Print this help text.
`
}

function parseArgs(argv) {
  const args = {
    instanceRoot: path.join(os.homedir(), 'ECHOLauncher', 'Instances'),
    lane: '',
    claims: [],
    logs: [],
    saves: [],
    actions: [],
    proofSource: 'computer-use-window-screenshot',
    verificationChecks: [],
    appId: '',
    windowTitle: '',
    capturedAt: new Date().toISOString(),
    strict: false,
    json: false,
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
    else if (arg === '--lane') args.lane = next().toLowerCase()
    else if (arg === '--claim') args.claims.push(next())
    else if (arg === '--log') args.logs.push(path.resolve(next()))
    else if (arg === '--save') args.saves.push(path.resolve(next()))
    else if (arg === '--action') args.actions.push(next())
    else if (arg === '--proof-source') args.proofSource = next().trim()
    else if (arg === '--verification-check') args.verificationChecks.push(parseVerificationCheck(next()))
    else if (arg === '--app-id') args.appId = next()
    else if (arg === '--window-title') args.windowTitle = next()
    else if (arg === '--captured-at') args.capturedAt = new Date(next()).toISOString()
    else if (arg === '--strict') args.strict = true
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (args.help) return args
  if (!args.lane) throw new Error('--lane is required.')
  if (!Number.isFinite(Date.parse(args.capturedAt))) throw new Error('--captured-at must be an ISO timestamp.')
  if (!args.proofSource) throw new Error('--proof-source must not be empty.')
  return args
}

function selectedLane(laneName) {
  const found = ASHFALL_LANES.find((lane) => lane.lane === laneName || lane.packId === laneName)
  if (!found) throw new Error(`Unknown Ashfall lane: ${laneName}`)
  return found
}

function parseClaimSpec(spec, lane) {
  const equals = spec.indexOf('=')
  if (equals <= 0) throw new Error(`Claim must be formatted as claim=proof-file: ${spec}`)
  const claim = spec.slice(0, equals).trim()
  const source = path.resolve(spec.slice(equals + 1).trim())
  if (!lane.runtimeProofs.includes(claim)) throw new Error(`Unknown claim ${claim} for lane ${lane.lane}`)
  return { claim, source }
}

function parseVerificationCheck(spec) {
  const [id, label, status, evidenceRef = '', note = ''] = spec.split('|')
  if (!id || !label || !status) {
    throw new Error(`Verification check must be formatted as id|label|status|evidenceRef|note: ${spec}`)
  }
  const normalizedStatus = status.trim().toLowerCase()
  if (!VERIFICATION_CHECK_STATUSES.has(normalizedStatus)) {
    throw new Error(`Verification check ${id} status must be captured, blocked, or not-attempted.`)
  }
  if (normalizedStatus === 'captured' && !evidenceRef.trim()) {
    throw new Error(`Verification check ${id} captured status requires an evidenceRef.`)
  }
  return {
    id: id.trim(),
    label: label.trim(),
    status: normalizedStatus,
    evidenceRef: evidenceRef.trim() || null,
    note: note.trim() || null,
  }
}

async function readJsonIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return JSON.parse(text.replace(/^\uFEFF/u, ''))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function validateSourceFile(source) {
  const stat = await fs.stat(source).catch(() => null)
  if (!stat?.isFile()) return { ok: false, reason: 'file does not exist' }
  if (stat.size <= 0) return { ok: false, reason: 'file is empty' }
  return { ok: true, size: stat.size, mtime: stat.mtime.toISOString() }
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
}

function relativeProofPath(instancePath, absolutePath) {
  return path.relative(path.join(instancePath, '.echo'), absolutePath).replace(/\\/gu, '/')
}

async function copyProofFile({ source, destinationDir, prefix }) {
  const validation = await validateSourceFile(source)
  if (!validation.ok) return { ok: false, source, validation }
  const extension = path.extname(source) || '.proof'
  const destination = path.join(destinationDir, `${prefix}${extension}`)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.copyFile(source, destination)
  const copied = await validateSourceFile(destination)
  return {
    ok: copied.ok,
    source,
    destination,
    validation: copied.ok ? copied : { ok: false, reason: 'copied proof is invalid' },
  }
}

function emptyEvidence(lane, capturedAt) {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    packId: lane.packId,
    lane: lane.lane,
    name: lane.name,
    capturedAt,
    claims: Object.fromEntries(lane.runtimeProofs.map((claim) => [claim, false])),
    proofs: Object.fromEntries(lane.runtimeProofs.map((claim) => [claim, []])),
    notes: [
      'This file is updated by the Ashfall Computer Use proof importer.',
      'Every true claim must reference local proof captured from visible gameplay.',
    ],
  }
}

function normalizeEvidence(lane, existing, capturedAt) {
  const base = emptyEvidence(lane, capturedAt)
  if (!existing) return base
  return {
    ...existing,
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    packId: lane.packId,
    lane: lane.lane,
    name: lane.name,
    capturedAt: capturedAt ?? existing.capturedAt ?? null,
    claims: {
      ...base.claims,
      ...(existing.claims ?? {}),
    },
    proofs: {
      ...base.proofs,
      ...(existing.proofs ?? {}),
    },
    notes: Array.isArray(existing.notes) ? existing.notes : base.notes,
  }
}

function normalizeProofReference(value) {
  return String(value ?? '').trim().replace(/\\/gu, '/')
}

function verificationCheckReferencesImportedProof(check, importedClaims, importedArtifacts) {
  if (check.status !== 'captured') return true
  const reference = normalizeProofReference(check.evidenceRef)
  return importedClaims.some((entry) =>
    normalizeProofReference(entry.claim) === reference
      || normalizeProofReference(entry.proof) === reference
      || normalizeProofReference(entry.source) === reference)
    || importedArtifacts.some((entry) =>
      normalizeProofReference(entry.kind) === reference
        || normalizeProofReference(entry.proof) === reference
        || normalizeProofReference(entry.source) === reference)
}

function normalizeVerificationChecks(checks, importedClaims, importedArtifacts, errors) {
  const normalized = checks.map((check) => {
    const entry = {
      id: check.id,
      label: check.label,
      status: check.status,
      evidenceRef: check.evidenceRef,
      note: check.note,
    }
    if (check.status === 'captured' && !verificationCheckReferencesImportedProof(check, importedClaims, importedArtifacts)) {
      errors.push(`Verification check ${check.id} captured evidenceRef ${check.evidenceRef} does not reference an imported claim or artifact proof.`)
    }
    return entry
  })
  return {
    checks: normalized,
    summary: {
      checkCount: normalized.length,
      capturedCount: normalized.filter((check) => check.status === 'captured').length,
      blockedCount: normalized.filter((check) => check.status === 'blocked').length,
      notAttemptedCount: normalized.filter((check) => check.status === 'not-attempted').length,
    },
  }
}

async function importLane(args) {
  const lane = selectedLane(args.lane)
  const instancePath = path.join(args.instanceRoot, lane.name)
  const evidencePath = path.join(instancePath, '.echo', EVIDENCE_FILE_NAME)
  const sessionPath = path.join(instancePath, '.echo', 'proofs', SESSION_FILE_NAME)
  const errors = []
  const importedClaims = []
  const importedArtifacts = []
  const claimSpecs = args.claims.map((claim) => parseClaimSpec(claim, lane))

  const instanceStat = await fs.stat(instancePath).catch(() => null)
  if (!instanceStat?.isDirectory()) {
    return {
      ok: false,
      lane: lane.lane,
      packId: lane.packId,
      instancePath,
      errors: [`Missing installed instance directory: ${instancePath}`],
    }
  }

  const existingEvidence = await readJsonIfExists(evidencePath)
  const evidence = normalizeEvidence(lane, existingEvidence, args.capturedAt)
  if (args.actions.length === 0) {
    errors.push('At least one --action is required so the Computer Use session records visible UI steps.')
  }
  await fs.mkdir(path.join(instancePath, '.echo', 'proofs', 'screenshots'), { recursive: true })
  await fs.mkdir(path.join(instancePath, '.echo', 'proofs', 'logs'), { recursive: true })
  await fs.mkdir(path.join(instancePath, '.echo', 'proofs', 'saves'), { recursive: true })

  for (const entry of claimSpecs) {
    const proof = await copyProofFile({
      source: entry.source,
      destinationDir: path.join(instancePath, '.echo', 'proofs', 'screenshots'),
      prefix: `${slug(entry.claim)}-${slug(args.capturedAt)}`,
    })
    if (!proof.ok) {
      errors.push(`Claim ${entry.claim} proof ${entry.source} rejected: ${proof.validation.reason}`)
      evidence.claims[entry.claim] = false
      continue
    }
    const relativePath = relativeProofPath(instancePath, proof.destination)
    evidence.claims[entry.claim] = true
    evidence.proofs[entry.claim] = [...new Set([...(evidence.proofs[entry.claim] ?? []), relativePath])]
    importedClaims.push({
      claim: entry.claim,
      proof: relativePath,
      source: entry.source,
      size: proof.validation.size,
      mtime: proof.validation.mtime,
    })
  }

  for (const [kind, values, destinationDir] of [
    ['log', args.logs, path.join(instancePath, '.echo', 'proofs', 'logs')],
    ['save', args.saves, path.join(instancePath, '.echo', 'proofs', 'saves')],
  ]) {
    for (const source of values) {
      const proof = await copyProofFile({
        source,
        destinationDir,
        prefix: `${kind}-${slug(path.basename(source, path.extname(source)))}-${slug(args.capturedAt)}`,
      })
      if (!proof.ok) {
        errors.push(`${kind} proof ${source} rejected: ${proof.validation.reason}`)
        continue
      }
      importedArtifacts.push({
        kind,
        source,
        proof: relativeProofPath(instancePath, proof.destination),
        size: proof.validation.size,
        mtime: proof.validation.mtime,
      })
    }
  }

  const verification = normalizeVerificationChecks(args.verificationChecks, importedClaims, importedArtifacts, errors)
  const session = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    capturedAt: args.capturedAt,
    packId: lane.packId,
    lane: lane.lane,
    name: lane.name,
    appId: args.appId || null,
    windowTitle: args.windowTitle || null,
    actions: args.actions,
    proofSource: args.proofSource,
    verificationChecks: verification.checks,
    verificationSummary: verification.summary,
    claimProofs: importedClaims,
    artifacts: importedArtifacts,
    notes: [
      'This session file records local artifacts captured while controlling a visible game/runtime window with Computer Use.',
      'It is not sufficient by itself; Ashfall lane smoke validates every true claim against local non-empty proof files.',
    ],
  }
  await writeJson(sessionPath, session)
  evidence.computerUseSession = relativeProofPath(instancePath, sessionPath)
  evidence.visibleProofs = importedClaims.map((entry) => ({
    claim: entry.claim,
    proof: entry.proof,
    source: args.proofSource,
  }))
  evidence.verificationChecks = verification.checks
  evidence.verificationSummary = verification.summary
  await writeJson(evidencePath, evidence)

  return {
    ok: errors.length === 0,
    lane: lane.lane,
    packId: lane.packId,
    instancePath,
    evidencePath,
    sessionPath,
    importedClaims,
    importedArtifacts,
    verificationChecks: verification.checks,
    verificationSummary: verification.summary,
    errors,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  const report = {
    schemaVersion: 'echo.ashfall.computer_use_proof_import.v1',
    generatedAt: new Date().toISOString(),
    result: await importLane(args),
  }
  report.ok = report.result.ok
  if (args.json || !report.ok) console.log(JSON.stringify(report, null, 2))
  else console.log(`Imported Computer Use proof for ${report.result.packId}: ${report.result.importedClaims.length} claim(s).`)
  if (args.strict && !report.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
