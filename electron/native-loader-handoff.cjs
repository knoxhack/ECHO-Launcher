const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const AdmZip = require('adm-zip')

const ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS = 'dev.echo.nativeplatform.bootstrap.EchoNativeBootstrapMain'
const ECHO_NATIVE_REAL_MINECRAFT_MAIN_CLASS = 'net.minecraft.client.main.Main'
const ECHO_NATIVE_AUTHORIZED_HANDOFF = 'startNativeClient'

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

async function materializeNativeLoaderAddons(manifest, installPath, options = {}) {
  const addonFiles = requiredNativeAddonFiles(manifest)
  if (addonFiles.length === 0) {
    throw new Error(`${manifest?.name ?? manifest?.pack ?? 'Native pack'} manifest does not list any required addons/*.echo-addon files.`)
  }

  const materialized = []
  const cacheRoot = safeJoin(installPath, path.join('.echo', 'native-loader', 'addons'))
  await fs.mkdir(cacheRoot, { recursive: true })

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

    materialized.push({
      moduleId,
      sourcePath,
      sourceSha256: actualSha256,
      nativeEntrypoint,
      bootstrapProfile: descriptorBootstrapProfile(descriptor),
      packRoot: descriptor?.kind === 'pack_root' || descriptor?.role === 'official_pack',
      runtimeJars,
    })
  }

  materialized.sort((left, right) => left.moduleId.localeCompare(right.moduleId))
  const classpathEntries = materialized.flatMap((addon) => addon.runtimeJars.map((jar) => jar.path))
  const rootDescriptor = materialized.find((addon) => addon.packRoot && addon.bootstrapProfile) ?? materialized.find((addon) => addon.bootstrapProfile)
  const runtime = {
    gameDir: path.resolve(installPath),
    markerPath: safeJoin(installPath, path.join('.echo', 'native-loader', 'module-activation.json')),
    moduleClasspath: classpathEntries.join(path.delimiter),
    classpathEntries,
    modules: materialized.map((addon) => addon.moduleId),
    nativeEntrypoints: Object.fromEntries(materialized.map((addon) => [addon.moduleId, addon.nativeEntrypoint])),
    bootstrapProfileClass: rootDescriptor?.bootstrapProfile ?? '',
    addons: materialized,
  }
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
  ]
  if (runtime) {
    args.push(
      `-Decho.native.minecraftMainClass=${ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS}`,
      `-Decho.native.bootstrap.authorizedHandoff=${ECHO_NATIVE_AUTHORIZED_HANDOFF}`,
      `-Decho.native.gameDir=${runtime.gameDir}`,
      `-Decho.native.moduleClasspath=${runtime.moduleClasspath}`,
    )
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
    '--echo-pack-id',
    String(manifest?.pack ?? ''),
    '--echo-real-main',
    ECHO_NATIVE_REAL_MINECRAFT_MAIN_CLASS,
    '--echo-handoff',
  ]
  for (const moduleId of runtime.modules) {
    args.push('--echo-module', moduleId)
  }
  for (const [moduleId, entrypoint] of Object.entries(runtime.nativeEntrypoints)) {
    args.push('--echo-native-entrypoint', `${moduleId}=${entrypoint}`)
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
  const expectedModules = new Set([
    ...(Array.isArray(manifest?.modules) ? manifest.modules.map((item) => String(item)) : []),
    ...requiredNativeAddonFiles(manifest).map((file) => String(file.moduleId ?? '').trim()).filter(Boolean),
  ])
  const jvmHas = (prefix) => jvm.some((arg) => arg === prefix || arg.startsWith(`${prefix}=`))
  const gameHas = (flag) => game.includes(flag)
  if (!jvm.includes(`-Decho.native.minecraftMainClass=${ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS}`)) {
    errors.push('Native Loader JVM args do not target EchoNativeBootstrapMain.')
  }
  if (!jvm.includes(`-Decho.native.bootstrap.authorizedHandoff=${ECHO_NATIVE_AUTHORIZED_HANDOFF}`)) {
    errors.push('Native Loader JVM args are missing authorized bootstrap handoff.')
  }
  for (const prefix of ['-Decho.native.gameDir', '-Decho.native.moduleClasspath', '-Decho.native.packId', '-Decho.native.packVersion']) {
    if (!jvmHas(prefix)) errors.push(`Native Loader JVM args are missing ${prefix}.`)
  }
  for (const flag of ['--echo-marker', '--echo-pack-id', '--echo-real-main', '--echo-handoff']) {
    if (!gameHas(flag)) errors.push(`Native Loader game args are missing ${flag}.`)
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

function nativeModuleClasspathEntries(document) {
  const jvm = stringArray(document?.arguments?.jvm)
  const value = jvm.find((arg) => arg.startsWith('-Decho.native.moduleClasspath='))?.slice('-Decho.native.moduleClasspath='.length) ?? ''
  return value.split(path.delimiter).map((item) => item.trim()).filter(Boolean)
}

module.exports = {
  ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS,
  ECHO_NATIVE_REAL_MINECRAFT_MAIN_CLASS,
  ECHO_NATIVE_AUTHORIZED_HANDOFF,
  materializeNativeLoaderAddons,
  nativeBootstrapGameArguments,
  nativeBootstrapJvmArguments,
  nativeLauncherArgumentStatus,
  nativeModuleClasspathEntries,
  requiredNativeAddonFiles,
}
