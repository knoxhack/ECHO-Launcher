import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const SMOKE_PACK = {
  packId: 'galactic-survey-native-edition',
  name: 'Galactic Survey Native Edition',
}
const SMOKE_MODULE_PATH = 'addons/echogalacticsurveyprotocol-0.1.0.echo-addon'
const DEFAULT_OUT = '../ECHO-Release-Index/release-readiness/galactic-survey-real-minecraft-handoff-smoke.json'

function usage() {
  return `Usage: node scripts/galactic-survey-real-minecraft-handoff-smoke.mjs [options]

Installs Galactic Survey Native Edition through the packaged ECHO Launcher,
then prepares an ECHO-managed Minecraft Launcher profile in a real or explicit
Minecraft root. This proves handoff mechanics only; it does not prove first
launch/open-play.

Options:
  --exe <path>        Packaged launcher executable.
                      Default: installer-artifacts/win-unpacked/ECHOLauncher.exe
  --work-root <path>  Temporary user-data/player-content root.
                      Default: tmp/galactic-survey-real-minecraft-handoff-smoke
  --download-root <path>
                      Root containing downloaded Galactic Survey edition assets.
                      Default: ../ECHO-Release-Index/tmp/galactic-survey-draft-download
  --minecraft-root <path>
                      Explicit Minecraft root. If omitted, pass --allow-real-minecraft-root.
  --allow-real-minecraft-root
                      Permit writing to the detected user .minecraft folder.
  --out <path>        Evidence output path.
                      Default: ${DEFAULT_OUT}
  --timeout-ms <ms>   Overall timeout. Default: 120000
  --clean             Remove work-root before running.
  --help              Print this help text.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    exe: path.resolve(root, 'installer-artifacts', 'win-unpacked', 'ECHOLauncher.exe'),
    workRoot: path.resolve(root, 'tmp', 'galactic-survey-real-minecraft-handoff-smoke'),
    downloadRoot: path.resolve(root, '..', 'ECHO-Release-Index', 'tmp', 'galactic-survey-draft-download'),
    minecraftRoot: '',
    allowRealMinecraftRoot: false,
    out: path.resolve(root, DEFAULT_OUT),
    timeoutMs: 120_000,
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
    if (arg === '--exe') args.exe = path.resolve(next())
    else if (arg === '--work-root') args.workRoot = path.resolve(next())
    else if (arg === '--download-root') args.downloadRoot = path.resolve(next())
    else if (arg === '--minecraft-root') args.minecraftRoot = path.resolve(next())
    else if (arg === '--allow-real-minecraft-root') args.allowRealMinecraftRoot = true
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--timeout-ms') args.timeoutMs = Number(next())
    else if (arg === '--clean') args.clean = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 5000) throw new Error('--timeout-ms must be at least 5000.')
  if (!args.help && !args.minecraftRoot && !args.allowRealMinecraftRoot) {
    throw new Error('Pass --minecraft-root for an isolated run, or --allow-real-minecraft-root to write to the detected user .minecraft folder.')
  }
  return args
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

async function sha256File(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

function contentTypeFor(filePath) {
  if (/\.json$/iu.test(filePath)) return 'application/json'
  if (/\.zip$/iu.test(filePath)) return 'application/zip'
  if (/\.txt$/iu.test(filePath)) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  assert(address && typeof address === 'object', 'Could not allocate a local port.')
  return address.port
}

async function buildSmokeCatalog(args, port) {
  const editionRoot = path.join(args.downloadRoot, 'ECHO-Galactic-Survey-Native-Edition')
  const manifestName = 'galactic-survey-native-edition-alpha-0.1.0.pack.json'
  const artifactName = 'galactic-survey-native-edition-0.1.0.zip'
  const releaseMetadata = await readJson(path.join(editionRoot, 'echo-release.json'))
  const manifestPath = path.join(editionRoot, manifestName)
  const artifactPath = path.join(editionRoot, artifactName)
  assert(await exists(manifestPath), `Smoke manifest missing: ${manifestPath}`)
  assert(await exists(artifactPath), `Smoke artifact missing: ${artifactPath}`)

  const manifestStat = await fs.stat(manifestPath)
  const artifactStat = await fs.stat(artifactPath)
  const baseUrl = `http://127.0.0.1:${port}`
  const files = new Map([
    ['/channel.json', Buffer.from(JSON.stringify({
      channel: 'alpha',
      catalogUrls: {
        modpacks: [`${baseUrl}/catalog/galactic-survey-native.json`],
      },
    }, null, 2))],
    ['/catalog/galactic-survey-native.json', Buffer.from(JSON.stringify({
      id: SMOKE_PACK.packId,
      kind: 'modpack',
      version: releaseMetadata.version,
      channel: releaseMetadata.channel,
      publisher: 'knoxhack',
      sourceRepo: 'knoxhack/ECHO-Galactic-Survey-Native-Edition',
      releaseTag: 'galactic-survey-native-0.1.0-alpha',
      commitSha: 'real-minecraft-handoff-smoke',
      artifacts: {
        manifest: {
          role: 'manifest',
          name: manifestName,
          url: `${baseUrl}/assets/native/${encodeURIComponent(manifestName)}`,
          size: manifestStat.size,
          sha256: releaseMetadata.manifestSha256,
        },
        artifact: {
          role: 'pack-artifact',
          name: artifactName,
          url: `${baseUrl}/assets/native/${encodeURIComponent(artifactName)}`,
          size: artifactStat.size,
          sha256: releaseMetadata.artifactSha256,
        },
      },
      dependencies: [
        { id: 'echogalacticsurveyprotocol', kind: 'addon', version: '0.1.0' },
      ],
      compatibility: ['native', 'galactic-survey'],
      trust: 'echo-workflow-built',
      validation: 'approved',
      publishedAt: releaseMetadata.releasedAt,
    }, null, 2))],
  ])

  return {
    channelUrl: `${baseUrl}/channel.json`,
    editionRoot,
    manifestName,
    artifactName,
    manifestPath,
    artifactPath,
    manifestSha256: releaseMetadata.manifestSha256,
    artifactSha256: releaseMetadata.artifactSha256,
    releaseVersion: releaseMetadata.version,
    files,
  }
}

async function startSmokeCatalogServer(catalog) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (catalog.files.has(url.pathname)) {
        const bytes = catalog.files.get(url.pathname)
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': bytes.length,
          'cache-control': 'no-store',
        })
        response.end(bytes)
        return
      }
      if (url.pathname.startsWith('/assets/native/')) {
        const name = decodeURIComponent(url.pathname.replace('/assets/native/', ''))
        const filePath = path.join(catalog.editionRoot, name)
        if (!(await exists(filePath))) {
          response.writeHead(404)
          response.end('missing')
          return
        }
        const stat = await fs.stat(filePath)
        response.writeHead(200, {
          'content-type': contentTypeFor(filePath),
          'content-length': stat.size,
          'cache-control': 'no-store',
        })
        response.end(await fs.readFile(filePath))
        return
      }
      response.writeHead(404)
      response.end('not found')
    } catch (error) {
      response.writeHead(500)
      response.end(error instanceof Error ? error.message : String(error))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(new URL(catalog.channelUrl).port, '127.0.0.1', resolve)
  })
  return server
}

async function closeHttpServer(server) {
  if (!server) return
  await new Promise((resolve) => server.close(resolve))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(description, timeoutMs, probe) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await probe()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`${description} timed out.${lastError ? ` Last error: ${lastError.message}` : ''}`)
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.json()
}

async function waitForPageTarget(port, timeoutMs) {
  return waitFor('Electron debug target', timeoutMs, async () => {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`)
    return targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) ?? null
  })
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  let sequence = 0
  const pending = new Map()

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data))
    if (!payload.id || !pending.has(payload.id)) return
    const { resolve, reject } = pending.get(payload.id)
    pending.delete(payload.id)
    if (payload.error) reject(new Error(payload.error.message ?? JSON.stringify(payload.error)))
    else resolve(payload.result ?? {})
  })

  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('CDP socket closed.'))
    pending.clear()
  })

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP socket failed to open.')), { once: true })
  })

  return {
    async open() {
      await opened
    },
    send(method, params = {}) {
      const id = ++sequence
      const message = JSON.stringify({ id, method, params })
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(message)
      })
    },
    close() {
      socket.close()
    },
  }
}

async function evaluate(cdp, expression, options = {}) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: options.awaitPromise ?? true,
    returnByValue: true,
    userGesture: true,
    timeout: options.timeoutMs ?? 10_000,
  })
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? JSON.stringify(result.exceptionDetails)
    throw new Error(text)
  }
  return result.result?.value
}

async function killProcessTree(child) {
  if (!child?.pid || child.killed) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
      killer.once('exit', resolve)
      killer.once('error', resolve)
    })
    return
  }
  child.kill('SIGTERM')
}

function trimLines(lines, max = 80) {
  return lines.slice(Math.max(0, lines.length - max))
}

async function readLauncherProfile(minecraftRoot, profileId) {
  const launcherProfilesPath = path.join(minecraftRoot, 'launcher_profiles.json')
  const profiles = await readJson(launcherProfilesPath)
  return {
    launcherProfilesPath,
    profile: profiles.profiles?.[profileId] ?? null,
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  assert(await exists(args.exe), `Packaged launcher executable not found: ${args.exe}`)
  if (args.clean) await fs.rm(args.workRoot, { recursive: true, force: true })
  await fs.mkdir(args.workRoot, { recursive: true })

  const debugPort = await freePort()
  const catalogPort = await freePort()
  const catalog = await buildSmokeCatalog(args, catalogPort)
  const catalogServer = await startSmokeCatalogServer(catalog)
  const smokeManifest = await readJson(catalog.manifestPath)
  const smokeModule = smokeManifest.files?.find((file) => String(file.path).replace(/\\/g, '/') === SMOKE_MODULE_PATH)
  assert(smokeModule?.sha256, `${SMOKE_MODULE_PATH} is missing from ${catalog.manifestPath}`)

  const userDataDir = path.join(args.workRoot, 'user-data')
  const playerContentRoot = path.join(args.workRoot, 'player-content')
  const settingsPath = path.join(userDataDir, 'ECHO', 'settings.json')
  await fs.mkdir(userDataDir, { recursive: true })
  await fs.mkdir(playerContentRoot, { recursive: true })
  await writeJson(settingsPath, {
    releaseIndex: {
      enabled: true,
      channelUrl: catalog.channelUrl,
    },
    mobileBridge: {
      enabled: false,
      port: 4177,
      pairedDevices: [],
      activePairing: null,
    },
    advancedMode: true,
    creatorMode: false,
  })

  const stdout = []
  const stderr = []
  const env = {
    ...process.env,
    ECHO_LAUNCHER_USER_DATA_DIR: userDataDir,
    ECHO_LAUNCHER_PLAYER_CONTENT_ROOT: playerContentRoot,
    ECHO_LAUNCHER_SMOKE: 'galactic-survey-real-minecraft-handoff',
    ECHO_RELEASE_INDEX_ALLOW_LOCAL_URLS: '1',
  }
  if (args.minecraftRoot) env.ECHO_LAUNCHER_MINECRAFT_ROOT = args.minecraftRoot
  let child = spawn(args.exe, [`--remote-debugging-port=${debugPort}`], {
    cwd: path.dirname(args.exe),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  })
  child.stdout.on('data', (chunk) => stdout.push(String(chunk)))
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)))

  let cdp = null
  try {
    const target = await waitForPageTarget(debugPort, args.timeoutMs)
    cdp = connectCdp(target.webSocketDebuggerUrl)
    await cdp.open()
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')

    await waitFor('Renderer mount', args.timeoutMs, async () => evaluate(cdp, `Boolean(document.getElementById('root')?.childElementCount && window.echoNative?.invoke)`))
    const bootstrap = await evaluate(cdp, `window.echoNative.invoke('app:get-bootstrap-state').then((state) => ({
      protocolVersion: state.protocolVersion,
      profileIds: state.profiles.map((profile) => profile.id),
      releaseIndexAccepted: state.releaseIndex?.acceptedCount ?? state.releaseIndex?.releases?.length ?? 0,
      releaseIndexWarnings: (state.releaseIndex?.warnings ?? []).slice(0, 5),
      userData: state.paths?.userData ?? null
    }))`)
    assert(bootstrap.profileIds.includes(SMOKE_PACK.packId), `Bootstrap profiles missing ${SMOKE_PACK.packId}.`)

    const install = await evaluate(cdp, `window.echoNative.invoke('install:run', {
      profileId: ${JSON.stringify(SMOKE_PACK.packId)},
      channel: 'alpha',
      refresh: true
    })`, { timeoutMs: args.timeoutMs })
    assert(install?.ok === true, `Install/update failed: ${JSON.stringify(install?.failed ?? install?.skipped ?? install)}`)
    assert(install.profileId === SMOKE_PACK.packId, `Install profile mismatch: ${install.profileId}`)
    assert(install.after?.missing?.length === 0, 'Install verification has missing files.')
    assert(install.after?.corrupt?.length === 0, 'Install verification has corrupt files.')
    const installPath = install.installPath
    assert(installPath, 'Install did not return installPath.')

    const modulePath = path.join(installPath, SMOKE_MODULE_PATH)
    assert(await exists(modulePath), `Installed Galactic module missing: ${modulePath}`)
    const moduleSha256 = await sha256File(modulePath)
    assert(moduleSha256 === smokeModule.sha256, `Installed Galactic module hash mismatch: ${moduleSha256}`)

    const handoff = await evaluate(cdp, `window.echoNative.invoke('launch:prepare-handoff', {
      profileId: ${JSON.stringify(SMOKE_PACK.packId)},
      installPath: ${JSON.stringify(installPath)},
      updatePolicy: 'skip',
      runtimeMode: 'native-loader-minecraft',
      prepareOnly: true
    })`, { timeoutMs: args.timeoutMs })
    assert(handoff?.ok === true, `Minecraft Launcher handoff did not report ok=true: ${handoff?.message}`)
    assert(handoff.profileId === SMOKE_PACK.packId, `Handoff profile mismatch: ${handoff.profileId}`)
    assert(handoff.handoff?.ok === true, `Nested handoff did not report ok=true: ${handoff.handoff?.message}`)
    assert(handoff.handoff?.profileCurrent === true, 'Handoff profile is not current.')
    assert(handoff.handoff?.versionReady === true, 'Handoff version metadata is not ready.')
    assert(handoff.handoff?.updatedProfile === true, 'Handoff did not update the profile.')
    assert(handoff.handoff?.prepareOnly === true, 'Handoff did not preserve prepareOnly=true.')
    assert(handoff.handoff?.openedLauncher === false, 'Prepare-only handoff unexpectedly opened the Minecraft Launcher.')
    assert((handoff.handoff?.validatedModsCount ?? 0) > 0, 'Handoff did not validate installed Native addon files.')
    assert(await exists(handoff.handoff.launcherProfilesPath), `Launcher profile was not written: ${handoff.handoff.launcherProfilesPath}`)
    assert(await exists(handoff.handoff.versionMetadataPath), `Version metadata was not written: ${handoff.handoff.versionMetadataPath}`)

    const saved = await readLauncherProfile(handoff.handoff.minecraftRoot, handoff.handoff.profileId)
    assert(saved.profile?.echoManaged === true, 'Prepared launcher profile is not marked echoManaged.')
    assert(saved.profile?.echoLauncher?.profileId === SMOKE_PACK.packId, `Prepared launcher profile echo id mismatch: ${saved.profile?.echoLauncher?.profileId}`)
    assert(saved.profile?.echoLauncher?.runtimeMode === 'native-loader-minecraft', `Prepared launcher profile runtime mismatch: ${saved.profile?.echoLauncher?.runtimeMode}`)
    assert(saved.profile?.gameDir === installPath, `Prepared launcher profile gameDir mismatch: ${saved.profile?.gameDir}`)
    assert(saved.profile?.lastVersionId === handoff.handoff.versionId, `Prepared launcher profile version mismatch: ${saved.profile?.lastVersionId}`)

    const report = {
      schemaVersion: 'echo.galactic_survey.real-minecraft-handoff-smoke.v1',
      ok: true,
      generatedAt: new Date().toISOString(),
      scope: 'packaged-launcher-real-minecraft-profile-handoff',
      limitation: 'This proves packaged ECHO Launcher installed Galactic Survey Native Edition and prepared an ECHO-managed Minecraft Launcher profile in the selected Minecraft root. It does not prove official launcher open/play or gameplay.',
      executable: args.exe,
      workRoot: args.workRoot,
      userDataDir,
      playerContentRoot,
      minecraftRootMode: args.minecraftRoot ? 'explicit' : 'detected-user-root',
      minecraftRoot: handoff.handoff.minecraftRoot,
      debugPort,
      catalogPort,
      platform: {
        os: process.platform,
        release: os.release(),
        arch: process.arch,
      },
      catalog: {
        channelUrl: catalog.channelUrl,
        servedPack: SMOKE_PACK.packId,
        releaseVersion: catalog.releaseVersion,
        manifestName: catalog.manifestName,
        artifactName: catalog.artifactName,
        manifestSha256: catalog.manifestSha256,
        artifactSha256: catalog.artifactSha256,
      },
      nativeBridge: bootstrap,
      install: {
        ok: install.ok,
        operation: install.operation,
        reportPath: install.reportPath,
        installPath,
        installed: install.installed?.length ?? 0,
        updated: install.updated?.length ?? 0,
        verified: install.verified?.length ?? 0,
        downloaded: install.downloaded?.length ?? 0,
        verification: {
          missing: install.after?.missing?.length ?? null,
          corrupt: install.after?.corrupt?.length ?? null,
          valid: install.after?.valid?.length ?? null,
        },
        verifiedModule: {
          relativePath: SMOKE_MODULE_PATH,
          path: modulePath,
          sha256: moduleSha256,
          expectedSha256: smokeModule.sha256,
        },
      },
      handoff: {
        ok: handoff.ok,
        operationId: handoff.operationId,
        runtimeMode: handoff.runtimeMode,
        runtimeLabel: handoff.runtimeLabel,
        phases: handoff.phases,
        verification: {
          missing: handoff.verification?.missing?.length ?? null,
          corrupt: handoff.verification?.corrupt?.length ?? null,
          valid: handoff.verification?.valid?.length ?? null,
        },
        result: {
          profileId: handoff.handoff?.profileId,
          profileName: handoff.handoff?.profileName,
          profileCurrent: handoff.handoff?.profileCurrent,
          versionId: handoff.handoff?.versionId,
          versionReady: handoff.handoff?.versionReady,
          minecraftRoot: handoff.handoff?.minecraftRoot,
          launcherProfilesPath: handoff.handoff?.launcherProfilesPath,
          versionMetadataPath: handoff.handoff?.versionMetadataPath,
          gameDir: handoff.handoff?.gameDir,
          validatedGameDir: handoff.handoff?.validatedGameDir,
          validatedModsCount: handoff.handoff?.validatedModsCount,
          backupPath: handoff.handoff?.backupPath,
          preparedVersionMetadata: handoff.handoff?.preparedVersionMetadata,
          updatedProfile: handoff.handoff?.updatedProfile,
          openedLauncher: handoff.handoff?.openedLauncher,
          prepareOnly: handoff.handoff?.prepareOnly,
          openSkipped: handoff.handoff?.openSkipped,
          warnings: handoff.handoff?.warnings ?? [],
          message: handoff.handoff?.message,
        },
        writtenProfile: {
          launcherProfilesPath: saved.launcherProfilesPath,
          echoManaged: saved.profile?.echoManaged === true,
          profileId: saved.profile?.echoLauncher?.profileId,
          runtimeMode: saved.profile?.echoLauncher?.runtimeMode,
          gameDir: saved.profile?.gameDir,
          lastVersionId: saved.profile?.lastVersionId,
        },
      },
      gates: {
        packagedLauncherInstall: 'passed',
        realMinecraftRootSelected: args.minecraftRoot ? 'passed_explicit_root' : 'passed_detected_user_root',
        realMinecraftProfileWritten: 'passed',
        nativeLoaderVersionMetadataWritten: 'passed',
        installedFilesVerified: 'passed',
        officialMinecraftLauncherOpened: 'not_run_prepare_only',
        firstLaunchOpenPlay: 'blocked_not_proven',
      },
      process: {
        pid: child.pid,
        stdout: trimLines(stdout.join('').split(/\r?\n/u).filter(Boolean)),
        stderr: trimLines(stderr.join('').split(/\r?\n/u).filter(Boolean)),
      },
    }
    await writeJson(args.out, report)
    console.log(JSON.stringify(report, null, 2))
  } finally {
    if (cdp) {
      try {
        await Promise.race([cdp.send('Browser.close'), sleep(1000)])
      } catch {
        cdp.close()
      }
    }
    await sleep(500)
    await killProcessTree(child)
    await closeHttpServer(catalogServer)
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
