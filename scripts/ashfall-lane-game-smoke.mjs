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
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
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
  const logText = newestLog ? await readTextIfExists(newestLog.path) : ''
  if (!newestLog) blockers.push('No runtime log file found under the instance logs directory.')

  const crashFiles = await listFiles(path.join(instancePath, 'crash-reports'), (filePath, name) => /\.txt$/iu.test(name))
  const newestCrash = await newestFile(crashFiles)
  const crashText = newestCrash ? await readTextIfExists(newestCrash.path) : ''
  const hasCrashAfterInstall = Boolean(newestCrash && (!manifest || newestCrash.mtimeMs >= (await fs.stat(manifestPath).catch(() => ({ mtimeMs: 0 }))).mtimeMs))
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
  for (const proof of lane.runtimeProofs) {
    claims[proof] = claimValue(evidence, proof) || derivedClaims[proof] === true
    if (!claims[proof]) blockers.push(`Missing gameplay proof: ${proof}`)
  }

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
