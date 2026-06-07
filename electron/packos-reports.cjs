const fs = require('node:fs/promises')
const fssync = require('node:fs')
const path = require('node:path')

const PACKOS_REPORT_FILES = Object.freeze([
  'launcher-status.json',
  'pack-profile.json',
  'pack-readiness.json',
  'lockfile.json',
  'lockfile-status.json',
  'install-state.json',
  'repair-plan.json',
  'pack-doctor.json',
  'health.json',
  'runtime-health.json',
  'recovery-state.json',
  'recovery-plan.json',
])

const PACKOS_REPORT_FILE_SET = new Set(PACKOS_REPORT_FILES)
const BLOCKING_UI_STATES = new Set(['blocked', 'manual_review_required', 'needs_repair', 'repair_available', 'unsupported', 'not_installed'])
const CANONICAL_ASHFALL_PACK_ID = 'ashfall-native-edition'

function isoNow() {
  return new Date().toISOString()
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))].sort()
}

function normalizeText(value, fallback = 'unknown') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizePackId(value, fallback = CANONICAL_ASHFALL_PACK_ID) {
  const packId = normalizeText(value, fallback)
  return packId === 'ashfall' || packId === 'ashfall-stable' ? CANONICAL_ASHFALL_PACK_ID : packId
}

function reportPath(reportRoot, fileName) {
  if (!PACKOS_REPORT_FILE_SET.has(fileName)) {
    throw new Error(`Unsupported PackOS report file: ${fileName}`)
  }
  const root = path.resolve(String(reportRoot ?? ''))
  return path.join(root, fileName)
}

function createReportRef(reportRoot, fileName, patch = {}) {
  return {
    fileName,
    path: reportRoot ? reportPath(reportRoot, fileName) : undefined,
    status: patch.status ?? 'missing',
    schema: patch.schema,
    generatedAt: patch.generatedAt,
    warnings: patch.warnings ?? [],
  }
}

function blankPackState(packId = CANONICAL_ASHFALL_PACK_ID, patch = {}) {
  const normalizedPackId = normalizePackId(packId)
  const warnings = uniqueStrings(patch.warnings ?? [])
  return {
    packId: normalizedPackId,
    name: patch.name ?? (normalizedPackId === CANONICAL_ASHFALL_PACK_ID ? 'Ashfall Native Edition' : normalizedPackId),
    selected: patch.selected ?? true,
    launcherVisible: patch.launcherVisible ?? true,
    publicRelease: patch.publicRelease ?? false,
    storefrontReady: patch.storefrontReady ?? false,
    variant: patch.variant ?? 'unknown',
    channel: patch.channel ?? 'unknown',
    saveCompatibilityVersion: patch.saveCompatibilityVersion ?? 'unknown',
    readinessStatus: patch.readinessStatus ?? 'unknown',
    lockfileStatus: patch.lockfileStatus ?? 'unknown',
    installStateStatus: patch.installStateStatus ?? 'unknown',
    repairPlanStatus: patch.repairPlanStatus ?? 'unknown',
    healthStatus: patch.healthStatus ?? 'unknown',
    recoveryMode: patch.recoveryMode ?? 'unknown',
    safeForLauncher: Boolean(patch.safeForLauncher),
    launchAllowed: Boolean(patch.launchAllowed),
    uiState: patch.uiState ?? 'unknown',
    blockingReasons: uniqueStrings(patch.blockingReasons ?? []),
    warnings,
    reportPaths: patch.reportPaths ?? {},
    safeCommands: uniqueStrings(patch.safeCommands ?? []),
  }
}

function normalizePackState(raw, selectedPackId) {
  const packId = normalizePackId(raw?.packId, selectedPackId)
  const selected = Boolean(raw?.selected ?? packId === selectedPackId)
  const launchAllowed = typeof raw?.launchAllowed === 'boolean' ? raw.launchAllowed : Boolean(raw?.safeForLauncher)
  const uiState = normalizeText(raw?.uiState)
  return blankPackState(packId, {
    name: normalizeText(raw?.name, packId === CANONICAL_ASHFALL_PACK_ID ? 'Ashfall Native Edition' : packId),
    selected,
    launcherVisible: Boolean(raw?.launcherVisible),
    publicRelease: Boolean(raw?.publicRelease),
    storefrontReady: Boolean(raw?.storefrontReady),
    variant: normalizeText(raw?.variant),
    channel: normalizeText(raw?.channel),
    saveCompatibilityVersion: normalizeText(raw?.saveCompatibilityVersion),
    readinessStatus: normalizeText(raw?.readinessStatus),
    lockfileStatus: normalizeText(raw?.lockfileStatus),
    installStateStatus: normalizeText(raw?.installStateStatus),
    repairPlanStatus: normalizeText(raw?.repairPlanStatus),
    healthStatus: normalizeText(raw?.healthStatus),
    recoveryMode: normalizeText(raw?.recoveryMode),
    safeForLauncher: Boolean(raw?.safeForLauncher),
    launchAllowed,
    uiState,
    blockingReasons: Array.isArray(raw?.blockingReasons) ? raw.blockingReasons : [],
    warnings: Array.isArray(raw?.warnings) ? raw.warnings : [],
    reportPaths: raw?.reportPaths && typeof raw.reportPaths === 'object' ? raw.reportPaths : {},
    safeCommands: Array.isArray(raw?.safeCommands) ? raw.safeCommands : [],
  })
}

function reportPayloadData(payload) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload
}

function uiStateFromPackDoctor(status, launchAllowed) {
  if (launchAllowed) {
    return status === 'ready' ? 'ready' : 'playable_with_warnings'
  }
  if (status === 'manual_review_required') return 'manual_review_required'
  if (status === 'repair_available') return 'repair_available'
  if (status === 'drift_detected') return 'degraded'
  if (status === 'blocked' || status === 'failed') return 'blocked'
  if (status === 'unsupported') return 'unsupported'
  return 'unknown'
}

function fallbackPackStateFromReports(reports, selectedPackId) {
  const doctor = reportPayloadData(reports['pack-doctor.json']?.payload)?.packDoctor
  if (!doctor || typeof doctor !== 'object') return null
  const status = normalizeText(doctor.status)
  const launchAllowed = Boolean(doctor.safeForLauncher)
  const launchSafety = doctor.launchSafety && typeof doctor.launchSafety === 'object' ? doctor.launchSafety : {}
  return blankPackState(selectedPackId, {
    name: selectedPackId === CANONICAL_ASHFALL_PACK_ID ? 'Ashfall Native Edition' : selectedPackId,
    selected: true,
    launcherVisible: true,
    publicRelease: true,
    readinessStatus: normalizeText(doctor.packReadinessStatus),
    lockfileStatus: normalizeText(doctor.lockfileStatus),
    installStateStatus: normalizeText(doctor.installStateStatus),
    repairPlanStatus: normalizeText(doctor.repairPlanStatus),
    healthStatus: 'unknown',
    recoveryMode: 'unknown',
    safeForLauncher: launchAllowed,
    launchAllowed,
    uiState: uiStateFromPackDoctor(status, launchAllowed),
    blockingReasons: launchSafety.reason ? [String(launchSafety.reason)] : [],
    warnings: Array.isArray(doctor.launchSafety?.warnings) ? doctor.launchSafety.warnings : [],
    safeCommands: Array.isArray(doctor.nextRecommendedSafeCommands) ? doctor.nextRecommendedSafeCommands : [],
  })
}

async function readReport(reportRoot, fileName) {
  const target = reportPath(reportRoot, fileName)
  try {
    const text = await fs.readFile(target, 'utf8')
    try {
      const payload = JSON.parse(text.replace(/^\uFEFF/, ''))
      return {
        fileName,
        payload,
        ref: createReportRef(reportRoot, fileName, {
          status: 'loaded',
          schema: typeof payload?.schema === 'string' ? payload.schema : undefined,
          generatedAt: typeof payload?.generatedAt === 'string' ? payload.generatedAt : undefined,
        }),
      }
    } catch (error) {
      return {
        fileName,
        payload: null,
        ref: createReportRef(reportRoot, fileName, {
          status: 'invalid',
          warnings: [`${fileName} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
        }),
      }
    }
  } catch (error) {
    const status = error && error.code === 'ENOENT' ? 'missing' : 'unreadable'
    const detail = status === 'missing' ? `${fileName} is missing.` : `${fileName} could not be read.`
    return {
      fileName,
      payload: null,
      ref: createReportRef(reportRoot, fileName, {
        status,
        warnings: [detail],
      }),
    }
  }
}

function unknownPackOsState({ generatedAt = isoNow(), reportRoot = '', selectedPackId = CANONICAL_ASHFALL_PACK_ID, warnings = [], reports = [] } = {}) {
  selectedPackId = normalizePackId(selectedPackId)
  const selectedPack = blankPackState(selectedPackId, {
    uiState: 'unknown',
    warnings,
    blockingReasons: [],
    launchAllowed: false,
    safeForLauncher: false,
  })
  return {
    ok: false,
    generatedAt,
    status: 'unknown',
    source: 'missing',
    reportRoot: reportRoot || undefined,
    selectedPackId,
    selectedPack,
    packs: [selectedPack],
    reports,
    warnings: uniqueStrings(warnings),
    safeCommands: [
      `.\\gradlew generateEchoLauncherStatus -PechoPack=${selectedPackId} -PechoAddonSet=beta`,
      `.\\gradlew echoPackDoctor -PechoPack=${selectedPackId} -PechoAddonSet=beta`,
    ],
  }
}

async function readPackOsStateFromRoot(reportRoot, options = {}) {
  const generatedAt = options.generatedAt ?? isoNow()
  const selectedPackId = normalizePackId(options.selectedPackId)
  const normalizedRoot = reportRoot ? path.resolve(String(reportRoot)) : ''
  if (!normalizedRoot) {
    return unknownPackOsState({
      generatedAt,
      selectedPackId,
      warnings: ['PackOS report root is not configured.'],
      reports: PACKOS_REPORT_FILES.map((fileName) => createReportRef('', fileName)),
    })
  }
  let rootExists = false
  try {
    rootExists = fssync.existsSync(normalizedRoot) && fssync.statSync(normalizedRoot).isDirectory()
  } catch {
    rootExists = false
  }
  if (!rootExists) {
    return unknownPackOsState({
      generatedAt,
      reportRoot: normalizedRoot,
      selectedPackId,
      warnings: [`PackOS report root does not exist: ${normalizedRoot}`],
      reports: PACKOS_REPORT_FILES.map((fileName) => createReportRef(normalizedRoot, fileName)),
    })
  }

  const loaded = await Promise.all(PACKOS_REPORT_FILES.map((fileName) => readReport(normalizedRoot, fileName)))
  const reportMap = Object.fromEntries(loaded.map((entry) => [entry.fileName, entry]))
  const refs = loaded.map((entry) => entry.ref)
  const launcherStatus = reportPayloadData(reportMap['launcher-status.json']?.payload)?.launcherStatus
  const packStates = Array.isArray(launcherStatus?.packStates) ? launcherStatus.packStates : []
  const normalizedPacks = packStates.map((entry) => normalizePackState(entry, selectedPackId)).sort((a, b) => a.packId.localeCompare(b.packId))
  const fallbackSelected = fallbackPackStateFromReports(reportMap, selectedPackId)
  const packs = normalizedPacks.length ? normalizedPacks : fallbackSelected ? [fallbackSelected] : []
  const launcherSelectedPackId = normalizePackId(launcherStatus?.selectedPackId, selectedPackId)
  const selectedPack = packs.find((pack) => pack.packId === launcherSelectedPackId) ?? packs.find((pack) => pack.selected) ?? packs[0]
  const warnings = uniqueStrings([
    ...refs.flatMap((ref) => ref.warnings ?? []),
    ...(Array.isArray(selectedPack?.warnings) ? selectedPack.warnings : []),
    ...(selectedPack ? [] : ['No PackOS pack state was found in launcher-status.json or pack-doctor.json.']),
  ])
  if (!selectedPack) {
    return unknownPackOsState({
      generatedAt,
      reportRoot: normalizedRoot,
      selectedPackId,
      warnings,
      reports: refs,
    })
  }

  const blocksLaunch = selectedPack.launchAllowed === false && BLOCKING_UI_STATES.has(selectedPack.uiState)
  return {
    ok: !blocksLaunch,
    generatedAt,
    status: selectedPack.uiState,
    source: normalizedPacks.length ? 'launcher-status' : 'pack-doctor-fallback',
    reportRoot: normalizedRoot,
    selectedPackId: selectedPack.packId,
    selectedPack,
    packs,
    reports: refs,
    warnings,
    safeCommands: uniqueStrings([
      ...(Array.isArray(launcherStatus?.safeCommands) ? launcherStatus.safeCommands : []),
      ...(Array.isArray(selectedPack.safeCommands) ? selectedPack.safeCommands : []),
    ]),
  }
}

module.exports = {
  BLOCKING_UI_STATES,
  PACKOS_REPORT_FILES,
  readPackOsStateFromRoot,
  unknownPackOsState,
}
