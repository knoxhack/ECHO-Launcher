import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const EVIDENCE_FILE_NAME = 'ashfall-lane-game-smoke-evidence.json'
const SCHEMA_VERSION = 'echo.ashfall.lane-game-smoke.evidence.v1'

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
  return `Usage: node scripts/ashfall-lane-game-capture-assist.mjs [options]

Prepares Ashfall lane gameplay evidence JSON and proof folders. This helper does
not prove gameplay by itself: it refuses to mark a claim true unless every
referenced local proof file exists and is non-empty.

Options:
  --instance-root <path>  ECHO Launcher instance root.
                          Default: ~/ECHOLauncher/Instances
  --lane <lane>           native, neoforge, standalone, or all. Default: all
  --claim <spec>          Mark a claim true when proof files exist.
                          Use claim=proofs/file.txt for one selected lane or
                          lane:claim=proofs/file.txt for --lane all.
                          Repeat for multiple claims. Use comma-separated files
                          to attach multiple proof files.
  --captured-at <iso>     capturedAt value to write.
  --reset                 Reset selected evidence files to all claims false.
  --json                  Print JSON report.
  --strict                Exit non-zero if any requested claim is rejected.
  --help                  Print this help text.

Example:
  node scripts/ashfall-lane-game-capture-assist.mjs --lane native \\
    --claim hudVisible=proofs/screenshots/hud-visible.png
`
}

function parseArgs(argv) {
  const args = {
    instanceRoot: path.join(os.homedir(), 'ECHOLauncher', 'Instances'),
    lane: 'all',
    claims: [],
    capturedAt: null,
    reset: false,
    json: false,
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
    else if (arg === '--lane') args.lane = next().toLowerCase()
    else if (arg === '--claim') args.claims.push(next())
    else if (arg === '--captured-at') args.capturedAt = next()
    else if (arg === '--reset') args.reset = true
    else if (arg === '--json') args.json = true
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

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function selectedLanes(laneName) {
  if (laneName === 'all') return ASHFALL_LANES
  const found = ASHFALL_LANES.find((lane) => lane.lane === laneName || lane.packId === laneName)
  if (!found) throw new Error(`Unknown Ashfall lane: ${laneName}`)
  return [found]
}

function emptyRecord(lane, capturedAt = null) {
  return {
    schemaVersion: SCHEMA_VERSION,
    packId: lane.packId,
    lane: lane.lane,
    name: lane.name,
    capturedAt,
    claims: Object.fromEntries(lane.runtimeProofs.map((claim) => [claim, false])),
    proofs: Object.fromEntries(lane.runtimeProofs.map((claim) => [claim, []])),
    notes: [
      'This file is prepared by the Ashfall lane capture assistant.',
      'Claims must remain false until a real playthrough creates non-empty local proof files.',
      'Run npm run test:e2e:ashfall-lane-game-smoke after filling proof files.',
    ],
  }
}

function normalizeExisting(lane, existing, { reset, capturedAt }) {
  if (!existing || reset) return emptyRecord(lane, capturedAt)
  const record = emptyRecord(lane, existing.capturedAt ?? capturedAt)
  record.claims = Object.fromEntries(lane.runtimeProofs.map((claim) => [
    claim,
    existing.claims?.[claim] === true,
  ]))
  record.proofs = Object.fromEntries(lane.runtimeProofs.map((claim) => [
    claim,
    Array.isArray(existing.proofs?.[claim]) ? existing.proofs[claim].filter(Boolean) : [],
  ]))
  return {
    ...existing,
    schemaVersion: SCHEMA_VERSION,
    packId: lane.packId,
    lane: lane.lane,
    name: lane.name,
    capturedAt: capturedAt ?? existing.capturedAt ?? null,
    claims: record.claims,
    proofs: record.proofs,
    notes: record.notes,
  }
}

function parseClaimSpec(spec, lanes) {
  const equals = spec.indexOf('=')
  if (equals <= 0) throw new Error(`Claim must be formatted as claim=proof or lane:claim=proof: ${spec}`)
  const left = spec.slice(0, equals).trim()
  const right = spec.slice(equals + 1).trim()
  const [maybeLane, maybeClaim] = left.includes(':') ? left.split(':', 2) : [null, left]
  const targetLane = maybeLane
    ? ASHFALL_LANES.find((lane) => lane.lane === maybeLane || lane.packId === maybeLane)
    : lanes.length === 1
      ? lanes[0]
      : null
  if (!targetLane) throw new Error(`Claim must include a lane when --lane all is used: ${spec}`)
  if (!targetLane.runtimeProofs.includes(maybeClaim)) {
    throw new Error(`Unknown claim ${maybeClaim} for lane ${targetLane.lane}`)
  }
  if (right.toLowerCase() === 'false') {
    return { lane: targetLane.lane, claim: maybeClaim, value: false, references: [] }
  }
  const references = right.split(',').map((value) => value.trim()).filter(Boolean)
  if (references.length === 0) throw new Error(`Claim ${maybeClaim} needs at least one proof file reference.`)
  return { lane: targetLane.lane, claim: maybeClaim, value: true, references }
}

function resolveProofPath(reference, evidencePath) {
  if (path.isAbsolute(reference)) return path.normalize(reference)
  if (/^[a-z][a-z0-9+.-]*:/iu.test(reference)) return ''
  return path.resolve(path.dirname(evidencePath), reference)
}

async function verifyReferences(evidencePath, references) {
  const files = []
  const missing = []
  for (const reference of references) {
    const absolutePath = resolveProofPath(reference, evidencePath)
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
  return { ok: files.length > 0 && missing.length === 0, files, missing }
}

async function prepareDirectories(instancePath) {
  const directories = [
    path.join(instancePath, '.echo'),
    path.join(instancePath, '.echo', 'proofs'),
    path.join(instancePath, '.echo', 'proofs', 'logs'),
    path.join(instancePath, '.echo', 'proofs', 'notes'),
    path.join(instancePath, '.echo', 'proofs', 'saves'),
    path.join(instancePath, '.echo', 'proofs', 'screenshots'),
  ]
  for (const directory of directories) await fs.mkdir(directory, { recursive: true })
  return directories
}

async function prepareLane(args, lane, updates) {
  const instancePath = path.join(args.instanceRoot, lane.name)
  const evidencePath = path.join(instancePath, '.echo', EVIDENCE_FILE_NAME)
  const errors = []
  const appliedClaims = []
  const rejectedClaims = []

  if (!(await exists(instancePath))) {
    return {
      packId: lane.packId,
      lane: lane.lane,
      ok: false,
      instancePath,
      evidencePath,
      errors: [`Missing installed lane instance directory: ${instancePath}`],
      appliedClaims,
      rejectedClaims,
    }
  }

  const directories = await prepareDirectories(instancePath)
  const existing = await readJsonIfExists(evidencePath)
  const evidence = normalizeExisting(lane, existing, args)

  for (const update of updates.filter((entry) => entry.lane === lane.lane)) {
    if (!update.value) {
      evidence.claims[update.claim] = false
      evidence.proofs[update.claim] = []
      appliedClaims.push({ claim: update.claim, value: false })
      continue
    }
    const verification = await verifyReferences(evidencePath, update.references)
    if (!verification.ok) {
      rejectedClaims.push({ claim: update.claim, references: update.references, verification })
      errors.push(`Claim ${update.claim} was not marked true because proof files are missing or empty.`)
      evidence.claims[update.claim] = false
      evidence.proofs[update.claim] = update.references
      continue
    }
    evidence.claims[update.claim] = true
    evidence.proofs[update.claim] = update.references
    appliedClaims.push({ claim: update.claim, value: true, verification })
  }

  await writeJson(evidencePath, evidence)
  return {
    packId: lane.packId,
    lane: lane.lane,
    ok: errors.length === 0,
    instancePath,
    evidencePath,
    directories,
    appliedClaims,
    rejectedClaims,
    errors,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  const lanes = selectedLanes(args.lane)
  const updates = args.claims.map((claim) => parseClaimSpec(claim, lanes))
  const laneReports = []
  for (const lane of lanes) laneReports.push(await prepareLane(args, lane, updates))
  const errors = laneReports.flatMap((lane) => lane.errors.map((error) => `${lane.packId}: ${error}`))
  const report = {
    schemaVersion: 'echo.ashfall.lane-game-capture-assist.v1',
    generatedAt: new Date().toISOString(),
    ok: errors.length === 0,
    instanceRoot: args.instanceRoot,
    evidenceFileName: EVIDENCE_FILE_NAME,
    lanes: laneReports,
    errors,
    nextSteps: [
      'Fill proof files from a real playthrough.',
      'Use --claim only after proof files exist and are non-empty.',
      'Run npm run test:e2e:ashfall-lane-game-smoke with the same --instance-root.',
    ],
  }
  if (args.json || !report.ok) console.log(JSON.stringify(report, null, 2))
  else console.log(`Ashfall capture evidence prepared for ${laneReports.length} lane(s).`)
  if (args.strict && !report.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
