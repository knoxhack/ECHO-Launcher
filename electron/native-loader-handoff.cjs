const crypto = require('node:crypto')
const fssync = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const AdmZip = require('adm-zip')

const ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS = 'dev.echo.nativeplatform.bootstrap.EchoNativeBootstrapMain'
const ECHO_NATIVE_REAL_MINECRAFT_MAIN_CLASS = 'net.minecraft.client.main.Main'
const ECHO_NATIVE_AUTHORIZED_HANDOFF = 'startNativeClient'
const ECHO_NATIVE_LOADER_ACTIVE_JVM_ARGUMENT = '-Decho.native.loader=true'
const ECHO_NATIVE_WINDOWED_CLIENT_JVM_ARGUMENT = '-Decho.native.windowedClient=true'
const ECHO_NATIVE_RUNTIME_MODE_JVM_ARGUMENT = '-Decho.native.runtime.mode=windowed-native-client'
const ECHO_NATIVE_DEV_DIRECT_AUTO_CONFIRM_EXPERIMENTAL_WORLD_JVM_ARGUMENT = '-Decho.native.devDirectAutoConfirmExperimentalWorld=true'
const ECHO_NATIVE_DEV_DIRECT_QUICKPLAY_SINGLEPLAYER_PROPERTY = 'echo.native.devDirectQuickPlaySingleplayer'
const ECHO_NATIVE_PRODUCT_WORLD_AUTO_OPEN_JVM_ARGUMENT = '-Decho.native.productWorldAutoOpen=true'
const ECHO_NATIVE_PRODUCT_WORLD_FOLDER_PROPERTY = 'echo.native.productWorldFolder'
const ECHO_NATIVE_PRODUCT_WORLD_NAME_PROPERTY = 'echo.native.productWorldName'
const ECHO_NATIVE_PRODUCT_WORLD_DATAPACK_PROPERTY = 'echo.native.productWorldDatapack'
const ECHO_NATIVE_PRODUCT_WORLD_FOLDER = 'echo_native_ashfall_wasteland'
const ECHO_NATIVE_PRODUCT_WORLD_NAME = 'ECHO Native Ashfall'
const ECHO_NATIVE_PRODUCT_WORLD_DATAPACK = 'echo-native-ashfall-datapack.zip'
const ECHO_NATIVE_PLAYABLE_RUNTIME_ACTIONS_JVM_ARGUMENT = '-Decho.native.playableRuntimeActions=true'
const ECHO_NATIVE_LIVE_INTERACTION_PROBE_ACTIONS_JVM_ARGUMENT = '-Decho.native.liveInteractionProbeActions=true'

function safeFileName(input) {
  return String(input ?? 'item')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'item'
}

function safeJoin(root, relativePath) {
  const normalizedRoot = path.resolve(root)
  const target = path.resolve(normalizedRoot, String(relativePath ?? ''))
  const relative = path.relative(normalizedRoot, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path outside install root: ${relativePath}`)
  }
  return target
}

function sha256Bytes(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function sha256File(filePath) {
  return sha256Bytes(await fs.readFile(filePath))
}

function requiredNativeAddonFiles(manifest) {
  return (manifest?.files ?? [])
    .filter((file) => file?.required !== false)
    .filter((file) => /^addons\/.+\.echo-addon$/iu.test(String(file.path ?? '').replace(/\\/g, '/')))
}

function readAddonDescriptor(zip, sourcePath) {
  const entry = zip.getEntry('META-INF/echo.mod.json')
  if (!entry || entry.isDirectory) {
    throw new Error(`Native addon '${sourcePath}' is missing META-INF/echo.mod.json.`)
  }
  try {
    return JSON.parse(entry.getData().toString('utf8'))
  } catch (error) {
    throw new Error(`Native addon '${sourcePath}' descriptor is invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function safeRuntimeJarEntries(zip, sourcePath) {
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .filter((entry) => /^lib\/[^/\\]+\.jar$/iu.test(entry.entryName))
    .sort((left, right) => left.entryName.localeCompare(right.entryName))
  if (entries.length === 0) {
    throw new Error(`Native addon '${sourcePath}' does not contain any lib/*.jar runtime artifacts.`)
  }
  return entries
}

function descriptorEntrypoint(descriptor, sourcePath) {
  const entrypoint = String(descriptor?.access?.nativeEntrypoint ?? '').trim()
  if (!entrypoint) {
    throw new Error(`Native addon '${sourcePath}' descriptor is missing access.nativeEntrypoint.`)
  }
  return entrypoint
}

function descriptorModuleId(descriptor, file, sourcePath) {
  const moduleId = String(descriptor?.id ?? file?.moduleId ?? '').trim()
  if (!moduleId) {
    throw new Error(`Native addon '${sourcePath}' descriptor is missing id.`)
  }
  return moduleId
}

function descriptorBootstrapProfile(descriptor) {
  const value = String(descriptor?.access?.nativeBootstrapProfile ?? '').trim()
  return value || ''
}

function expectedNativeModules(manifest) {
  const modules = new Set([
    ...(Array.isArray(manifest?.modules) ? manifest.modules.map((item) => String(item).trim()).filter(Boolean) : []),
    ...requiredNativeAddonFiles(manifest)
      .map((file) => String(file.moduleId ?? path.posix.basename(String(file.path ?? ''), path.posix.extname(String(file.path ?? '')))).trim())
      .filter(Boolean),
  ])
  return [...modules].sort((left, right) => left.localeCompare(right))
}

const CONTENT_GRAPH_PREFIX = '.echo/content-graph/'

function contentGraphEntries(zip) {
  return zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName.startsWith(CONTENT_GRAPH_PREFIX))
}

async function readJsonSafe(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function extractModuleContentGraph(zip, moduleId, installPath) {
  const entries = contentGraphEntries(zip)
  if (entries.length === 0) {
    return null
  }
  const moduleGraphRoot = safeJoin(installPath, path.join('.echo', 'content-graph', 'modules', safeFileName(moduleId).toLowerCase()))
  await fs.mkdir(moduleGraphRoot, { recursive: true })
  const written = []
  for (const entry of entries) {
    const relative = entry.entryName.slice(CONTENT_GRAPH_PREFIX.length)
    const destination = safeJoin(moduleGraphRoot, relative)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    const data = entry.getData()
    await fs.writeFile(destination, data)
    written.push({ sourceEntry: entry.entryName, path: destination, size: data.length })
  }
  return { moduleGraphRoot, written }
}

function hytaleBlockerSummaries(hytale) {
  if (!hytale || typeof hytale !== 'object') {
    return []
  }
  const blockedNodes = Array.isArray(hytale.nodes)
    ? hytale.nodes.filter((node) => node?.status === 'blocked')
    : []
  if (blockedNodes.length > 0) {
    return blockedNodes.map((node) => {
      const nodeId = String(node?.nodeId ?? node?.id ?? 'unknown node')
      const reason = String(node?.rationale ?? node?.reason ?? node?.message ?? 'blocked')
      return `${nodeId}: ${reason}`
    })
  }
  if (Array.isArray(hytale.blockers)) {
    return hytale.blockers.map((blocker) => String(blocker?.message ?? blocker))
  }
  const blockedCount = Number(hytale?.summary?.blocked ?? 0)
  if (blockedCount > 0) {
    return [`${blockedCount} blocked Hytale node${blockedCount === 1 ? '' : 's'}`]
  }
  return []
}

async function summarizeModuleContentGraph(moduleGraphRoot, moduleId) {
  const graph = await readJsonSafe(path.join(moduleGraphRoot, 'content-graph.json'))
  const features = await readJsonSafe(path.join(moduleGraphRoot, 'features.json'))
  const hytale = await readJsonSafe(path.join(moduleGraphRoot, 'export-plans', 'hytale.json'))
  const nodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0
  const edgeCount = Array.isArray(graph?.edges) ? graph.edges.length : 0
  const featureList = Array.isArray(features?.features)
    ? features.features
    : Array.isArray(features)
      ? features
      : []
  const blockers = hytaleBlockerSummaries(hytale)
  return {
    evidenceSchemaVersion: 'echo.content_graph.evidence.v1',
    source: 'launcher-native-loader-handoff',
    moduleId,
    schemaVersion: graph?.schemaVersion ?? 'unknown',
    nodeCount,
    edgeCount,
    featureCount: featureList.length,
    exportPlanCount: await countExportPlanFiles(path.join(moduleGraphRoot, 'export-plans')),
    hytaleBlockerCount: blockers.length,
    hytaleBlockers: blockers.slice(0, 10),
  }
}

async function countExportPlanFiles(exportPlansRoot) {
  try {
    const entries = await fs.readdir(exportPlansRoot, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).length
  } catch {
    return 0
  }
}

async function materializeNativeLoaderAddons(manifest, installPath, options = {}) {
  const addonFiles = requiredNativeAddonFiles(manifest)
  if (addonFiles.length === 0) {
    throw new Error(`${manifest?.name ?? manifest?.pack ?? 'Native pack'} manifest does not list any required addons/*.echo-addon files.`)
  }

  const materialized = []
  const contentGraphSummaries = []
  const cacheRoot = safeJoin(installPath, path.join('.echo', 'native-loader', 'addons'))
  const contentGraphRoot = safeJoin(installPath, path.join('.echo', 'content-graph'))
  await fs.mkdir(cacheRoot, { recursive: true })
  await fs.mkdir(contentGraphRoot, { recursive: true })

  for (const file of addonFiles) {
    const sourcePath = String(file.path ?? '').replace(/\\/g, '/')
    const sourceAbsolutePath = safeJoin(installPath, sourcePath)
    const expectedSha256 = String(file.sha256 ?? '').toLowerCase()
    const actualSha256 = await sha256File(sourceAbsolutePath)
    if (expectedSha256 && actualSha256 !== expectedSha256) {
      throw new Error(`Native addon '${sourcePath}' SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}.`)
    }

    const zip = new AdmZip(sourceAbsolutePath)
    const descriptor = readAddonDescriptor(zip, sourcePath)
    const moduleId = descriptorModuleId(descriptor, file, sourcePath)
    const nativeEntrypoint = descriptorEntrypoint(descriptor, sourcePath)
    const runtimeJarEntries = safeRuntimeJarEntries(zip, sourcePath)
    const moduleCacheRoot = safeJoin(cacheRoot, path.join(safeFileName(moduleId).toLowerCase(), actualSha256))
    await fs.mkdir(moduleCacheRoot, { recursive: true })
    const runtimeJars = []

    const addonFileName = path.posix.basename(sourcePath)
    const addonJarDestination = safeJoin(moduleCacheRoot, `${addonFileName}.jar`)
    await fs.copyFile(sourceAbsolutePath, addonJarDestination)
    runtimeJars.push({
      path: addonJarDestination,
      sourceEntry: addonFileName,
      sha256: actualSha256,
      size: (await fs.stat(addonJarDestination)).size,
    })

    for (const entry of runtimeJarEntries) {
      const fileName = path.posix.basename(entry.entryName)
      const destination = safeJoin(moduleCacheRoot, fileName)
      const data = entry.getData()
      await fs.writeFile(destination, data)
      runtimeJars.push({
        path: destination,
        sourceEntry: entry.entryName,
        sha256: sha256Bytes(data),
        size: data.length,
      })
    }

    const contentGraphExtraction = await extractModuleContentGraph(zip, moduleId, installPath)
    if (contentGraphExtraction) {
      const summary = await summarizeModuleContentGraph(contentGraphExtraction.moduleGraphRoot, moduleId)
      contentGraphSummaries.push(summary)
    }

    materialized.push({
      moduleId,
      sourcePath,
      sourceSha256: actualSha256,
      nativeEntrypoint,
      bootstrapProfile: descriptorBootstrapProfile(descriptor),
      packRoot: descriptor?.kind === 'pack_root' || descriptor?.role === 'official_pack',
      runtimeJars,
      contentGraph: contentGraphExtraction
        ? { root: contentGraphExtraction.moduleGraphRoot, summary: contentGraphSummaries[contentGraphSummaries.length - 1] }
        : null,
    })
  }

  materialized.sort((left, right) => left.moduleId.localeCompare(right.moduleId))
  contentGraphSummaries.sort((left, right) => left.moduleId.localeCompare(right.moduleId))
  const classpathEntries = materialized.flatMap((addon) => addon.runtimeJars.map((jar) => jar.path))
  const rootDescriptor = materialized.find((addon) => addon.packRoot && addon.bootstrapProfile) ?? materialized.find((addon) => addon.bootstrapProfile)
  const handoffPath = safeJoin(installPath, path.join('.echo', 'native-loader', 'module-activation-handoff.json'))
  const aggregatePath = safeJoin(installPath, path.join('.echo', 'content-graph.json'))
  const contentGraph = {
    source: 'installed-scan',
    root: contentGraphRoot,
    aggregatePath,
    moduleCount: contentGraphSummaries.length,
    nodeCount: contentGraphSummaries.reduce((sum, summary) => sum + summary.nodeCount, 0),
    edgeCount: contentGraphSummaries.reduce((sum, summary) => sum + summary.edgeCount, 0),
    featureCount: contentGraphSummaries.reduce((sum, summary) => sum + summary.featureCount, 0),
    exportPlanCount: contentGraphSummaries.reduce((sum, summary) => sum + summary.exportPlanCount, 0),
    hytaleBlockerCount: contentGraphSummaries.reduce((sum, summary) => sum + summary.hytaleBlockerCount, 0),
    modules: contentGraphSummaries,
  }
  if (contentGraphSummaries.length > 0) {
    await fs.writeFile(
      aggregatePath,
      `${JSON.stringify({
        schema: 'echo.launcher.content_graph.v1',
        evidenceSchemaVersion: 'echo.content_graph.evidence.v1',
        generatedAt: new Date().toISOString(),
        ...contentGraph,
      }, null, 2)}\n`,
      'utf8',
    )
  }
  const runtime = {
    schema: 'echo.native.launcher_handoff.v1',
    packId: String(manifest?.pack ?? ''),
    packVersion: String(manifest?.version ?? ''),
    gameDir: path.resolve(installPath),
    markerPath: safeJoin(installPath, path.join('.echo', 'native-loader', 'module-activation.json')),
    handoffPath,
    moduleClasspath: classpathEntries.join(path.delimiter),
    moduleClasspathFile: handoffPath,
    classpathEntries,
    modules: materialized.map((addon) => addon.moduleId),
    nativeEntrypoints: Object.fromEntries(materialized.map((addon) => [addon.moduleId, addon.nativeEntrypoint])),
    bootstrapProfileClass: rootDescriptor?.bootstrapProfile ?? '',
    addons: materialized,
    contentGraph,
  }
  await fs.mkdir(path.dirname(handoffPath), { recursive: true })
  await fs.writeFile(handoffPath, `${JSON.stringify({ ...runtime, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  if (options.writeReport) {
    const reportPath = safeJoin(installPath, path.join('.echo', 'native-loader', 'materialized-addons.json'))
    await fs.mkdir(path.dirname(reportPath), { recursive: true })
    await fs.writeFile(reportPath, `${JSON.stringify({ ...runtime, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
    runtime.reportPath = reportPath
  }
  return runtime
}

function nativeBootstrapJvmArguments(manifest, runtime = null) {
  const args = [
    `-Decho.native.packId=${String(manifest?.pack ?? '')}`,
    `-Decho.native.packVersion=${String(manifest?.version ?? '')}`,
    '-Decho.native.addonsClasspath=true',
    ECHO_NATIVE_LOADER_ACTIVE_JVM_ARGUMENT,
    ECHO_NATIVE_WINDOWED_CLIENT_JVM_ARGUMENT,
    ECHO_NATIVE_RUNTIME_MODE_JVM_ARGUMENT,
  ]
  if (runtime) {
    args.push(
      `-Decho.native.minecraftMainClass=${ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS}`,
      `-Decho.native.bootstrap.authorizedHandoff=${ECHO_NATIVE_AUTHORIZED_HANDOFF}`,
      `-Decho.native.gameDir=${runtime.gameDir}`,
      `-Decho.native.moduleClasspathFile=${runtime.moduleClasspathFile}`,
    )
    const moduleIds = Array.isArray(runtime.modules) ? runtime.modules.map((moduleId) => String(moduleId)).filter(Boolean) : []
    if (moduleIds.length > 0) {
      args.push(`-Decho.native.moduleIds=${moduleIds.join(',')}`)
    }
    if (runtime.bootstrapProfileClass) {
      args.push(`-Decho.native.bootstrap.profileClass=${runtime.bootstrapProfileClass}`)
    }
  }
  return args.filter(Boolean)
}

function nativeBootstrapGameArguments(manifest, runtime = null) {
  if (!runtime) return []
  const args = [
    '--echo-marker',
    runtime.markerPath,
    '--echo-handoff-file',
    runtime.handoffPath,
    '--echo-pack-id',
    String(manifest?.pack ?? ''),
    '--echo-real-main',
    ECHO_NATIVE_REAL_MINECRAFT_MAIN_CLASS,
    '--echo-handoff',
  ]
  return args
}

function nativeDevDirectQuickPlayJvmArguments(runtimeMode, quickPlay = null) {
  const mode = String(runtimeMode ?? '').trim().toLowerCase()
  const type = String(quickPlay?.type ?? '').trim().toLowerCase()
  const singleplayer = String(quickPlay?.singleplayer ?? '').trim()
  const supportsDevDirectWorldOpen = mode === 'native-loader-minecraft' || mode === 'neoforge-minecraft'
  if (!supportsDevDirectWorldOpen || type !== 'singleplayer' || !singleplayer) {
    return []
  }
  return [
    ECHO_NATIVE_DEV_DIRECT_AUTO_CONFIRM_EXPERIMENTAL_WORLD_JVM_ARGUMENT,
    `-D${ECHO_NATIVE_DEV_DIRECT_QUICKPLAY_SINGLEPLAYER_PROPERTY}=${singleplayer}`,
  ]
}

function nativeDevDirectProductWorldJvmArguments(runtimeMode) {
  const mode = String(runtimeMode ?? '').trim().toLowerCase()
  if (mode !== 'native-loader-minecraft') {
    return []
  }
  return [
    ECHO_NATIVE_PRODUCT_WORLD_AUTO_OPEN_JVM_ARGUMENT,
    `-D${ECHO_NATIVE_PRODUCT_WORLD_FOLDER_PROPERTY}=${ECHO_NATIVE_PRODUCT_WORLD_FOLDER}`,
    `-D${ECHO_NATIVE_PRODUCT_WORLD_NAME_PROPERTY}=${ECHO_NATIVE_PRODUCT_WORLD_NAME}`,
    `-D${ECHO_NATIVE_PRODUCT_WORLD_DATAPACK_PROPERTY}=${ECHO_NATIVE_PRODUCT_WORLD_DATAPACK}`,
  ]
}

function nativeDevDirectAuditJvmArguments(runtimeMode, options = {}) {
  const mode = String(runtimeMode ?? '').trim().toLowerCase()
  if (mode !== 'native-loader-minecraft') {
    return []
  }
  const runtimeActions = options?.nativeAuditRuntimeActions === true ||
    options?.enableNativeAuditMutations === true ||
    options?.nativeAuditLiveInteractions === true
  if (!runtimeActions) {
    return []
  }
  const args = [ECHO_NATIVE_PLAYABLE_RUNTIME_ACTIONS_JVM_ARGUMENT]
  if (options?.nativeAuditLiveInteractions === true) {
    args.push(ECHO_NATIVE_LIVE_INTERACTION_PROBE_ACTIONS_JVM_ARGUMENT)
  }
  return args
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function nativeLauncherArgumentStatus(document, manifest) {
  const jvm = stringArray(document?.arguments?.jvm)
  const game = stringArray(document?.arguments?.game)
  const errors = []
  const expectedModules = new Set(expectedNativeModules(manifest))
  const jvmHas = (prefix) => jvm.some((arg) => arg === prefix || arg.startsWith(`${prefix}=`))
  const gameHas = (flag) => game.includes(flag)
  if (!jvm.includes(`-Decho.native.minecraftMainClass=${ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS}`)) {
    errors.push('Native Loader JVM args do not target EchoNativeBootstrapMain.')
  }
  if (!jvm.includes(`-Decho.native.bootstrap.authorizedHandoff=${ECHO_NATIVE_AUTHORIZED_HANDOFF}`)) {
    errors.push('Native Loader JVM args are missing authorized bootstrap handoff.')
  }
  for (const flag of [
    ECHO_NATIVE_LOADER_ACTIVE_JVM_ARGUMENT,
    ECHO_NATIVE_WINDOWED_CLIENT_JVM_ARGUMENT,
    ECHO_NATIVE_RUNTIME_MODE_JVM_ARGUMENT,
  ]) {
    if (!jvm.includes(flag)) errors.push(`Native Loader JVM args are missing ${flag}.`)
  }
  for (const prefix of ['-Decho.native.gameDir', '-Decho.native.packId', '-Decho.native.packVersion']) {
    if (!jvmHas(prefix)) errors.push(`Native Loader JVM args are missing ${prefix}.`)
  }
  if (!jvmHas('-Decho.native.moduleClasspath') && !jvmHas('-Decho.native.moduleClasspathFile')) {
    errors.push('Native Loader JVM args are missing -Decho.native.moduleClasspath or -Decho.native.moduleClasspathFile.')
  }
  for (const flag of ['--echo-marker', '--echo-handoff-file', '--echo-pack-id', '--echo-real-main', '--echo-handoff']) {
    if (!gameHas(flag)) errors.push(`Native Loader game args are missing ${flag}.`)
  }
  const handoffFile = gameValue(game, '--echo-handoff-file')
  const jvmHandoffFile = nativeModuleClasspathFile(document)
  if (handoffFile) {
    if (!jvmHandoffFile) {
      errors.push('Native Loader JVM args are missing -Decho.native.moduleClasspathFile for the handoff file.')
    } else if (path.resolve(handoffFile) !== path.resolve(jvmHandoffFile)) {
      errors.push('Native Loader game handoff file does not match -Decho.native.moduleClasspathFile.')
    }
    errors.push(...nativeHandoffPayloadErrors(handoffFile, manifest))
    return {
      ok: errors.length === 0,
      errors,
    }
  }
  const modules = new Set()
  const entrypoints = new Set()
  for (let index = 0; index < game.length; index += 1) {
    if (game[index] === '--echo-module' && game[index + 1]) modules.add(game[index + 1])
    if (game[index] === '--echo-native-entrypoint' && game[index + 1]) entrypoints.add(game[index + 1].split('=')[0])
  }
  for (const moduleId of expectedModules) {
    if (!modules.has(moduleId)) errors.push(`Native Loader game args are missing module ${moduleId}.`)
    if (!entrypoints.has(moduleId)) errors.push(`Native Loader game args are missing native entrypoint for ${moduleId}.`)
  }
  return {
    ok: errors.length === 0,
    errors,
  }
}

function nativeModuleClasspathFile(document) {
  const jvm = stringArray(document?.arguments?.jvm)
  return jvm.find((arg) => arg.startsWith('-Decho.native.moduleClasspathFile='))?.slice('-Decho.native.moduleClasspathFile='.length).trim() ?? ''
}

function nativeHandoffPayloadErrors(handoffFile, manifest) {
  const errors = []
  if (!handoffFile) {
    errors.push('Native Loader handoff file path is missing.')
    return errors
  }
  if (!fssync.existsSync(handoffFile)) {
    errors.push(`Native Loader handoff file is missing: ${handoffFile}.`)
    return errors
  }
  let payload
  try {
    payload = JSON.parse(fssync.readFileSync(handoffFile, 'utf8'))
  } catch (error) {
    errors.push(`Native Loader handoff file is invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return errors
  }
  if (payload?.schema !== 'echo.native.launcher_handoff.v1') {
    errors.push(`Native Loader handoff schema is '${payload?.schema ?? 'missing'}', expected echo.native.launcher_handoff.v1.`)
  }
  const expectedPack = String(manifest?.pack ?? '').trim()
  if (expectedPack && String(payload?.packId ?? '').trim() !== expectedPack) {
    errors.push(`Native Loader handoff pack is '${payload?.packId ?? 'missing'}', expected '${expectedPack}'.`)
  }
  const classpathEntries = Array.isArray(payload?.classpathEntries)
    ? payload.classpathEntries.map((item) => String(item).trim()).filter(Boolean)
    : typeof payload?.moduleClasspath === 'string'
      ? payload.moduleClasspath.split(path.delimiter).map((item) => item.trim()).filter(Boolean)
      : []
  if (classpathEntries.length === 0) {
    errors.push('Native Loader handoff file does not list any module classpath entries.')
  }
  for (const entryPath of classpathEntries) {
    if (!fssync.existsSync(entryPath)) errors.push(`Native Loader module classpath entry is missing: ${entryPath}.`)
  }
  const modules = new Set(Array.isArray(payload?.modules) ? payload.modules.map((item) => String(item).trim()).filter(Boolean) : [])
  const entrypoints = payload?.nativeEntrypoints && typeof payload.nativeEntrypoints === 'object' && !Array.isArray(payload.nativeEntrypoints)
    ? payload.nativeEntrypoints
    : {}
  for (const moduleId of expectedNativeModules(manifest)) {
    if (!modules.has(moduleId)) errors.push(`Native Loader handoff file is missing module ${moduleId}.`)
    if (!String(entrypoints[moduleId] ?? '').trim()) errors.push(`Native Loader handoff file is missing native entrypoint for ${moduleId}.`)
  }
  return errors
}

function nativeModuleClasspathEntries(document) {
  const file = nativeModuleClasspathFile(document)
  if (file && fssync.existsSync(file)) {
    try {
      const data = JSON.parse(fssync.readFileSync(file, 'utf8'))
      if (Array.isArray(data.classpathEntries)) {
        return data.classpathEntries.map((item) => String(item).trim()).filter(Boolean)
      }
      if (typeof data.moduleClasspath === 'string') {
        return data.moduleClasspath.split(path.delimiter).map((item) => item.trim()).filter(Boolean)
      }
    } catch {
      const text = fssync.readFileSync(file, 'utf8')
      return text.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean)
    }
  }
  const jvm = stringArray(document?.arguments?.jvm)
  const value = jvm.find((arg) => arg.startsWith('-Decho.native.moduleClasspath='))?.slice('-Decho.native.moduleClasspath='.length) ?? ''
  return value.split(path.delimiter).map((item) => item.trim()).filter(Boolean)
}

async function validateNativeLoaderLocalRuntime(manifest, installPath) {
  const issues = []
  const addonFiles = requiredNativeAddonFiles(manifest)
  if (addonFiles.length === 0) {
    issues.push({
      id: 'nativeAddonsMissing',
      title: 'Native addons are not listed',
      detail: `${manifest?.name ?? manifest?.pack ?? 'Native pack'} manifest does not list required addons/*.echo-addon files.`,
      status: 'critical',
      action: 'repair',
    })
  }

  const missingAddons = []
  const corruptAddons = []
  for (const file of addonFiles) {
    const sourcePath = String(file.path ?? '').replace(/\\/g, '/')
    const absolutePath = safeJoin(installPath, sourcePath)
    if (!fssync.existsSync(absolutePath)) {
      missingAddons.push(sourcePath)
      continue
    }
    const expectedSha256 = String(file.sha256 ?? '').toLowerCase()
    if (expectedSha256) {
      const actualSha256 = await sha256File(absolutePath)
      if (actualSha256.toLowerCase() !== expectedSha256) {
        corruptAddons.push({ path: sourcePath, expected: expectedSha256, actual: actualSha256.toLowerCase() })
      }
    }
  }
  if (missingAddons.length > 0) {
    issues.push({
      id: 'nativeAddonsMissing',
      title: 'Native addons are missing',
      detail: `${missingAddons.length} required Native addon file${missingAddons.length === 1 ? '' : 's'} missing. First missing: ${missingAddons.slice(0, 5).join(', ')}.`,
      status: 'warning',
      action: 'repair',
    })
  }
  if (corruptAddons.length > 0) {
    issues.push({
      id: 'nativeAddonHashMismatch',
      title: 'Native addon hash mismatch',
      detail: `${corruptAddons.length} Native addon file${corruptAddons.length === 1 ? '' : 's'} failed SHA-256 verification. First corrupt: ${corruptAddons[0].path}.`,
      status: 'critical',
      action: 'repair',
    })
  }

  const handoffPath = safeJoin(installPath, path.join('.echo', 'native-loader', 'module-activation-handoff.json'))
  const markerPath = safeJoin(installPath, path.join('.echo', 'native-loader', 'module-activation.json'))
  if (!fssync.existsSync(handoffPath)) {
    issues.push({
      id: 'nativeHandoffMissing',
      title: 'Native handoff is missing',
      detail: `Native Loader handoff file is missing: ${handoffPath}. Repair will rebuild the module classpath before Play.`,
      status: 'warning',
      action: 'repair',
    })
  } else {
    const handoffErrors = nativeHandoffPayloadErrors(handoffPath, manifest)
    if (handoffErrors.length > 0) {
      issues.push({
        id: 'nativeModuleActivationFailed',
        title: 'Native module handoff is invalid',
        detail: handoffErrors[0],
        status: 'critical',
        action: 'repair',
      })
    }
  }

  let activationReport = null
  let activationReportError = ''
  if (fssync.existsSync(markerPath)) {
    try {
      activationReport = JSON.parse(await fs.readFile(markerPath, 'utf8'))
    } catch (error) {
      activationReportError = error instanceof Error ? error.message : String(error)
    }
  }
  const activationErrors = Array.isArray(activationReport?.errors) ? activationReport.errors.filter(Boolean) : []
  const activationFailed = activationReport?.ok === false && activationErrors.length === 0
  if (activationReportError || activationErrors.length > 0 || activationFailed) {
    issues.push({
      id: 'nativeModuleActivationFailed',
      title: 'Native module activation failed',
      detail: activationReportError
        ? `Native Loader activation marker is invalid JSON: ${activationReportError}`
        : String(activationErrors[0] ?? activationReport?.message ?? 'Native Loader activation marker reported failure.'),
      status: 'critical',
      action: 'repair',
    })
  }

  return {
    ok: issues.length === 0,
    handoffPath,
    markerPath,
    addonCount: addonFiles.length,
    missingAddons,
    corruptAddons,
    activationReport,
    issues,
  }
}

function gameValue(game, flag) {
  const index = game.indexOf(flag)
  return index >= 0 ? String(game[index + 1] ?? '').trim() : ''
}

module.exports = {
  ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS,
  ECHO_NATIVE_REAL_MINECRAFT_MAIN_CLASS,
  ECHO_NATIVE_AUTHORIZED_HANDOFF,
  ECHO_NATIVE_DEV_DIRECT_AUTO_CONFIRM_EXPERIMENTAL_WORLD_JVM_ARGUMENT,
  ECHO_NATIVE_DEV_DIRECT_QUICKPLAY_SINGLEPLAYER_PROPERTY,
  ECHO_NATIVE_PRODUCT_WORLD_AUTO_OPEN_JVM_ARGUMENT,
  ECHO_NATIVE_PRODUCT_WORLD_FOLDER,
  ECHO_NATIVE_PLAYABLE_RUNTIME_ACTIONS_JVM_ARGUMENT,
  ECHO_NATIVE_LIVE_INTERACTION_PROBE_ACTIONS_JVM_ARGUMENT,
  materializeNativeLoaderAddons,
  nativeBootstrapGameArguments,
  nativeBootstrapJvmArguments,
  nativeDevDirectAuditJvmArguments,
  nativeDevDirectProductWorldJvmArguments,
  nativeDevDirectQuickPlayJvmArguments,
  nativeHandoffPayloadErrors,
  nativeLauncherArgumentStatus,
  nativeModuleClasspathFile,
  nativeModuleClasspathEntries,
  requiredNativeAddonFiles,
  validateNativeLoaderLocalRuntime,
}
