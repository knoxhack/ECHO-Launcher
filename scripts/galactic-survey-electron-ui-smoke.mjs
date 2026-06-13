import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFile, spawn } from 'node:child_process'

const GALACTIC_SURVEY_PACKS = [
  {
    packId: 'galactic-survey-native-edition',
    name: 'Galactic Survey Native Edition',
  },
  {
    packId: 'galactic-survey-neoforge-edition',
    name: 'Galactic Survey NeoForge Edition',
  },
  {
    packId: 'galactic-survey-standalone-edition',
    name: 'Galactic Survey Standalone Edition',
  },
]
const SMOKE_PACK = GALACTIC_SURVEY_PACKS[0]
const SMOKE_MODULE_PATH = 'addons/echogalacticsurveyprotocol-0.1.0.echo-addon'

function usage() {
  return `Usage: node scripts/galactic-survey-electron-ui-smoke.mjs [options]

Launches the packaged Electron app through a remote debugging port, verifies
that the Galactic Survey Library cards render through the real native bridge, then
clicks through install, update reconciliation, and repair against a local
approved Galactic Survey catalog.

Options:
  --exe <path>        Packaged launcher executable.
                      Default: installer-artifacts/win-unpacked/ECHOLauncher.exe
  --work-root <path>  Temporary user-data and logs root.
                      Default: tmp/galactic-survey-electron-ui-smoke
  --download-root <path>
                      Root containing downloaded Galactic Survey edition assets.
                      Default: ../ECHO-Release-Index/tmp/galactic-survey-draft-download
  --out <path>        Evidence output path.
                      Default: ../ECHO-Release-Index/release-readiness/galactic-survey-electron-ui-smoke.json
  --timeout-ms <ms>   Overall wait timeout for renderer and lifecycle checks.
                      Default: 120000
  --clean             Remove work-root before running.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    exe: path.resolve(root, 'installer-artifacts', 'win-unpacked', 'ECHOLauncher.exe'),
    workRoot: path.resolve(root, 'tmp', 'galactic-survey-electron-ui-smoke'),
    downloadRoot: path.resolve(root, '..', 'ECHO-Release-Index', 'tmp', 'galactic-survey-draft-download'),
    out: path.resolve(root, '..', 'ECHO-Release-Index', 'release-readiness', 'galactic-survey-electron-ui-smoke.json'),
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
    else if (arg === '--out') args.out = path.resolve(next())
    else if (arg === '--timeout-ms') args.timeoutMs = Number(next())
    else if (arg === '--clean') args.clean = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 5_000) throw new Error('--timeout-ms must be at least 5000.')
  return args
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function sha256File(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  assert(address && typeof address === 'object', 'Could not allocate a local debug port.')
  return address.port
}

function contentTypeFor(filePath) {
  if (/\.json$/i.test(filePath)) return 'application/json'
  if (/\.zip$/i.test(filePath)) return 'application/zip'
  if (/\.txt$/i.test(filePath)) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
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
      commitSha: 'local-electron-smoke',
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

async function clickButtonContaining(cdp, text) {
  const result = await evaluate(cdp, `(() => {
    const needle = ${JSON.stringify(text)}
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.includes(needle) && !element.disabled && isVisible(element))
    if (!button) return { clicked: false, reason: \`Enabled button containing '\${needle}' was not found.\` }
    button.click()
    return { clicked: true, text: button.textContent?.trim() ?? '' }
  })()`)
  assert(result.clicked, result.reason)
  return result
}

async function clickCardButtonContaining(cdp, cardHeading, buttonText) {
  const result = await evaluate(cdp, `(() => {
    const headingNeedle = ${JSON.stringify(cardHeading)}
    const buttonNeedle = ${JSON.stringify(buttonText)}
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const heading = Array.from(document.querySelectorAll('h3')).find((element) => element.textContent?.trim() === headingNeedle)
    if (!heading) return { clicked: false, reason: \`Card heading '\${headingNeedle}' was not found.\` }
    const card = heading.closest('.cyber-panel') ?? heading.parentElement
    const button = Array.from(card?.querySelectorAll('button') ?? []).find((element) => element.textContent?.includes(buttonNeedle) && !element.disabled && isVisible(element))
    if (!button) return { clicked: false, reason: \`Enabled button '\${buttonNeedle}' was not found inside '\${headingNeedle}'.\` }
    button.click()
    return { clicked: true, text: button.textContent?.trim() ?? '' }
  })()`)
  assert(result.clicked, result.reason)
  return result
}

async function clickTabContaining(cdp, text) {
  const result = await evaluate(cdp, `(() => {
    const needle = ${JSON.stringify(text)}
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'))
      .filter((element) => element.textContent?.includes(needle) && isVisible(element))
    const target = tabs.find((element) => element.getAttribute('aria-selected') !== 'true' && !element.disabled) ?? tabs.find((element) => !element.disabled)
    if (!target) {
      return {
        clicked: false,
        reason: \`Visible tab containing '\${needle}' was not found.\`,
        availableTabs: Array.from(document.querySelectorAll('[role="tab"]')).map((element) => element.textContent?.trim() ?? '')
      }
    }
    target.scrollIntoView({ block: 'center', inline: 'center' })
    const rect = target.getBoundingClientRect()
    return {
      clicked: true,
      text: target.textContent?.trim() ?? '',
      role: target.getAttribute('role'),
      selected: target.getAttribute('aria-selected'),
      point: {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      }
    }
  })()`)
  assert(result.clicked, `${result.reason} Available tabs: ${(result.availableTabs ?? []).join(', ')}`)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: result.point.x,
    y: result.point.y,
    button: 'left',
    clickCount: 1,
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: result.point.x,
    y: result.point.y,
    button: 'left',
    clickCount: 1,
  })
  return result
}

async function newestJsonReport(logsDir, prefix, afterMs = 0) {
  const entries = await fs.readdir(logsDir).catch(() => [])
  const reports = []
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith('.json')) continue
    const filePath = path.join(logsDir, name)
    const stat = await fs.stat(filePath)
    if (stat.mtimeMs < afterMs) continue
    reports.push({ filePath, stat })
  }
  reports.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  return reports[0]?.filePath ?? null
}

async function newestReportData(logsDir, prefix, afterMs = 0) {
  const reportPath = await newestJsonReport(logsDir, prefix, afterMs)
  if (!reportPath) return null
  return { reportPath, report: await readJson(reportPath) }
}

async function waitForInstallReport(logsDir, afterMs, predicate, timeoutMs) {
  return waitFor('Install report', timeoutMs, async () => {
    const data = await newestReportData(logsDir, 'install-', afterMs)
    if (!data?.report?.ok) return null
    return predicate(data.report) ? data : null
  })
}

async function waitForRepairReport(logsDir, afterMs, predicate, timeoutMs) {
  return waitFor('Repair report', timeoutMs, async () => {
    const data = await newestReportData(logsDir, 'repair-', afterMs)
    if (!data?.report?.ok) return null
    return predicate(data.report) ? data : null
  })
}

async function waitForSmokeModuleHash(installPath, expectedSha256, timeoutMs, description) {
  const modulePath = path.join(installPath, SMOKE_MODULE_PATH)
  return waitFor(description, timeoutMs, async () => {
    if (!(await exists(modulePath))) return null
    const sha256 = await sha256File(modulePath)
    return sha256 === expectedSha256 ? {
      relativePath: SMOKE_MODULE_PATH,
      path: modulePath,
      sha256,
      expectedSha256,
    } : null
  })
}

async function assertZipFile(filePath, description) {
  assert(await exists(filePath), `${description} was not written: ${filePath}`)
  const bytes = await fs.readFile(filePath)
  assert(bytes.length > 4, `${description} is empty: ${filePath}`)
  assert(bytes[0] === 0x50 && bytes[1] === 0x4b, `${description} is not a zip file: ${filePath}`)
  return {
    path: filePath,
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  }
}

async function closeHttpServer(server) {
  if (!server) return
  await new Promise((resolve) => server.close(() => resolve()))
}

async function killProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      execFile('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve())
    })
    return
  }
  child.kill('SIGTERM')
}

function trimLines(lines, max = 80) {
  return lines.slice(Math.max(0, lines.length - max))
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
  const isolatedMinecraftRoot = path.join(args.workRoot, 'isolated-minecraft-root')
  const logsDir = path.join(userDataDir, 'ECHO', 'launcher-logs')
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
  let child = spawn(args.exe, [`--remote-debugging-port=${debugPort}`], {
    cwd: path.dirname(args.exe),
    env: {
      ...process.env,
      ECHO_LAUNCHER_USER_DATA_DIR: userDataDir,
      ECHO_LAUNCHER_PLAYER_CONTENT_ROOT: playerContentRoot,
      ECHO_LAUNCHER_MINECRAFT_ROOT: isolatedMinecraftRoot,
      ECHO_LAUNCHER_SMOKE: 'galactic-survey-electron-ui',
      ECHO_RELEASE_INDEX_ALLOW_LOCAL_URLS: '1',
    },
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

    await waitFor('Renderer mount', args.timeoutMs, async () => evaluate(cdp, `(() => {
      const root = document.getElementById('root')
      return Boolean(root && root.childElementCount > 0 && !document.querySelector('[data-echo-startup-recovery]'))
    })()`))

    await waitFor('Native bridge bootstrap', args.timeoutMs, async () => evaluate(cdp, `Boolean(window.echoNative?.invoke)`))
    const bootstrap = await evaluate(cdp, `window.echoNative.invoke('app:get-bootstrap-state').then((state) => ({
      protocolVersion: state.protocolVersion,
      profileIds: state.profiles.map((profile) => profile.id),
      releaseIndexAccepted: state.releaseIndex?.acceptedCount ?? state.releaseIndex?.releases?.length ?? 0,
      releaseIndexWarnings: (state.releaseIndex?.warnings ?? []).slice(0, 5),
      launcherUpdateStatus: state.launcherUpdate?.status ?? null,
      userData: state.paths?.userData ?? null
    }))`)

    const clickResult = await evaluate(cdp, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim().includes('Library'))
      if (!button) return { clicked: false, reason: 'Library button not found' }
      button.click()
      return { clicked: true, label: button.textContent?.trim() ?? '' }
    })()`)
    assert(clickResult.clicked, clickResult.reason ?? 'Library navigation failed.')

    await waitFor('Galactic Survey Library cards', args.timeoutMs, async () => evaluate(cdp, `(() => {
      const names = ${JSON.stringify(GALACTIC_SURVEY_PACKS.map((pack) => pack.name))}
      const headingTexts = Array.from(document.querySelectorAll('h3')).map((heading) => heading.textContent?.trim())
      return document.querySelector('h1')?.textContent?.trim() === 'Library' && names.every((name) => headingTexts.includes(name))
    })()`))

    const ui = await evaluate(cdp, `(() => {
      const names = ${JSON.stringify(GALACTIC_SURVEY_PACKS.map((pack) => pack.name))}
      const bodyText = document.body.innerText
      const cards = names.map((name) => {
        const heading = Array.from(document.querySelectorAll('h3')).find((element) => element.textContent?.trim() === name)
        if (!heading) return { name, found: false }
        const rect = heading.getBoundingClientRect()
        const card = heading.closest('.cyber-panel') ?? heading.parentElement
        const cardText = card?.innerText ?? ''
        return {
          name,
          found: true,
          heading: {
            clientWidth: heading.clientWidth,
            scrollWidth: heading.scrollWidth,
            overflow: heading.scrollWidth > heading.clientWidth + 1,
            rect: {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          },
          hasManifestState: /manifest/i.test(cardText),
          hasCatalogState: /catalog/i.test(cardText),
          hasInstallState: /install/i.test(cardText),
          hasActionState: /action/i.test(cardText),
          hasDiagnosticsAction: cardText.includes('Diagnostics'),
          hasHomeAction: cardText.includes('Home'),
          hasScopedAction: /(Install|Update|Repair|Play|Unavailable|Checking)/u.test(cardText),
          actionPreview: cardText
            .split(/\\n/u)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(-12)
        }
      })
      return {
        title: document.title,
        href: location.href,
        activeHeading: document.querySelector('h1')?.textContent?.trim() ?? '',
        rootMounted: Boolean(document.getElementById('root')?.childElementCount),
        startupRecovery: Boolean(document.querySelector('[data-echo-startup-recovery]')),
        nativeBridgeAvailable: Boolean(window.echoNative?.invoke),
        officialPacksLabelVisible: /official\\s+(echo\\s+)?packs/i.test(bodyText),
        cards,
        hasGlobalInstallUpdate: Array.from(document.querySelectorAll('button')).some((button) => /install\\s*\\/\\s*update|install all|update all/i.test(button.textContent ?? '')),
        hasScopedGalacticSurveyAction: Boolean(cards.find((card) => card.name === ${JSON.stringify(SMOKE_PACK.name)})?.hasScopedAction)
      }
    })()`)

    assert(ui.title === 'ECHO Launcher', `Unexpected title: ${ui.title}`)
    assert(ui.rootMounted, 'Renderer root did not mount.')
    assert(!ui.startupRecovery, 'Startup recovery page was shown.')
    assert(ui.nativeBridgeAvailable, 'Native bridge is not available in Electron.')
    assert(ui.activeHeading === 'Library', `Expected Library page, got ${ui.activeHeading}`)
    assert(ui.officialPacksLabelVisible, 'Official ECHO Packs label was not visible.')
    assert(!ui.hasGlobalInstallUpdate, 'A global install/update affordance appeared in the Library.')
    assert(ui.hasScopedGalacticSurveyAction, 'Galactic Survey Native Edition did not expose a scoped pack action.')
    for (const card of ui.cards) {
      const cardDebug = JSON.stringify(card.actionPreview ?? [])
      assert(card.found, `${card.name} card was not found.`)
      assert(!card.heading.overflow, `${card.name} heading overflowed in packaged Electron.`)
      assert(card.hasManifestState, `${card.name} is missing manifest state. Card text: ${cardDebug}`)
      assert(card.hasCatalogState, `${card.name} is missing catalog state. Card text: ${cardDebug}`)
      assert(card.hasInstallState, `${card.name} is missing install state. Card text: ${cardDebug}`)
      assert(card.hasActionState, `${card.name} is missing primary action state. Card text: ${cardDebug}`)
      assert(card.hasDiagnosticsAction, `${card.name} is missing Diagnostics action. Card text: ${cardDebug}`)
      assert(card.hasHomeAction, `${card.name} is missing Home action. Card text: ${cardDebug}`)
      assert(card.hasScopedAction, `${card.name} is missing a scoped pack action. Card text: ${cardDebug}`)
    }
    for (const pack of GALACTIC_SURVEY_PACKS) {
      assert(bootstrap.profileIds.includes(pack.packId), `Bootstrap profiles missing ${pack.packId}.`)
    }

    await waitFor('Galactic Survey Home navigation', args.timeoutMs, async () => clickCardButtonContaining(cdp, SMOKE_PACK.name, 'Home'))
    await waitFor('Galactic Survey Native selection', args.timeoutMs, async () => evaluate(cdp, `(() => {
      const select = document.getElementById('home-pack-select') ?? Array.from(document.querySelectorAll('select')).find((element) =>
        Array.from(element.options).some((option) => option.value === ${JSON.stringify(SMOKE_PACK.packId)}),
      )
      const bodyText = document.body.innerText
      return select?.value === ${JSON.stringify(SMOKE_PACK.packId)} && bodyText.includes(${JSON.stringify(SMOKE_PACK.name)})
    })()`))

    const installStartedAt = Date.now() - 1000
    const installClick = await waitFor('Galactic Survey install button', args.timeoutMs, async () => clickButtonContaining(cdp, `Install ${SMOKE_PACK.name}`))
    const installData = await waitForInstallReport(logsDir, installStartedAt, (report) =>
      report.profileId === SMOKE_PACK.packId &&
      report.operation === 'install' &&
      report.after?.missing?.length === 0 &&
      report.after?.corrupt?.length === 0,
    args.timeoutMs)
    const installPath = installData.report.installPath
    assert(installPath, 'Install report did not include an installPath.')
    const verifiedAfterInstall = await waitForSmokeModuleHash(installPath, smokeModule.sha256, args.timeoutMs, 'Galactic Survey module hash after install')
    const installedProfile = await waitFor('Installed Galactic Survey profile', args.timeoutMs, async () => evaluate(cdp, `window.echoNative.invoke('profile:list').then((profiles) => {
      const profile = profiles.find((item) => item.id === ${JSON.stringify(SMOKE_PACK.packId)})
      return profile && profile.status === 'healthy' && profile.manifestPath ? {
        id: profile.id,
        name: profile.name,
        version: profile.version,
        status: profile.status,
        installPath: profile.installPath,
        manifestPath: profile.manifestPath
      } : null
    })`))

    await waitFor('Library navigation', args.timeoutMs, async () => clickButtonContaining(cdp, 'Library'))
    await waitFor('Library page after install', args.timeoutMs, async () => evaluate(cdp, `document.querySelector('h1')?.textContent?.trim() === 'Library'`))
    await waitFor('Updates tab', args.timeoutMs, async () => clickTabContaining(cdp, 'Updates'))
    await waitFor('Downloads page', args.timeoutMs, async () => evaluate(cdp, `document.body.innerText.includes('Install & Update Pipeline')`))
      .catch(async (error) => {
        const snapshot = await evaluate(cdp, `(() => ({
          heading: document.querySelector('h1')?.textContent?.trim() ?? '',
          subheadings: Array.from(document.querySelectorAll('h2')).map((element) => element.textContent?.trim() ?? '').slice(0, 8),
          tabs: Array.from(document.querySelectorAll('[role="tab"]')).map((element) => ({
            text: element.textContent?.trim() ?? '',
            selected: element.getAttribute('aria-selected'),
            state: element.getAttribute('data-state')
          })),
          buttons: Array.from(document.querySelectorAll('button')).map((element) => element.textContent?.trim() ?? '').filter(Boolean).slice(0, 24),
          bodyStart: document.body.innerText.slice(0, 1200)
        }))()`)
        throw new Error(`${error.message} Snapshot: ${JSON.stringify(snapshot)}`)
      })

    const updateStartedAt = Date.now() - 1000
    const updateClick = await waitFor('Galactic Survey update reconciliation button', args.timeoutMs, async () => clickButtonContaining(cdp, `Install ${SMOKE_PACK.name}`))
    const updateData = await waitForInstallReport(logsDir, updateStartedAt, (report) =>
      report.profileId === SMOKE_PACK.packId &&
      report.operation === 'update' &&
      report.ok === true &&
      report.after?.missing?.length === 0 &&
      report.after?.corrupt?.length === 0,
    args.timeoutMs)
    const verifiedAfterUpdate = await waitForSmokeModuleHash(installPath, smokeModule.sha256, args.timeoutMs, 'Galactic Survey module hash after update reconciliation')

    await fs.writeFile(verifiedAfterUpdate.path, `corrupt galactic survey packaged electron repair smoke ${new Date().toISOString()}\n`, 'utf8')
    const corruptSha256 = await sha256File(verifiedAfterUpdate.path)
    assert(corruptSha256 !== smokeModule.sha256, 'Repair smoke failed to corrupt the Galactic Survey module fixture.')

    await waitFor('Tools navigation', args.timeoutMs, async () => clickButtonContaining(cdp, 'Tools'))
    await waitFor('Repair page', args.timeoutMs, async () => evaluate(cdp, `document.body.innerText.includes('Installation Recovery')`))
    const repairStartedAt = Date.now() - 1000
    const repairClick = await waitFor('Repair Now button', args.timeoutMs, async () => clickButtonContaining(cdp, 'Repair Now'))
    const repairData = await waitForRepairReport(logsDir, repairStartedAt, (report) =>
      report.profileId === SMOKE_PACK.packId &&
      report.ok === true &&
      report.repaired?.includes(SMOKE_MODULE_PATH) &&
      report.after?.missing?.length === 0 &&
      report.after?.corrupt?.length === 0,
    args.timeoutMs)
    const verifiedAfterRepair = await waitForSmokeModuleHash(installPath, smokeModule.sha256, args.timeoutMs, 'Galactic Survey module hash after repair')
    const diagnosticExport = await evaluate(cdp, `window.echoNative.invoke('diagnostic:export', {
      profileId: ${JSON.stringify(SMOKE_PACK.packId)},
      installPath: ${JSON.stringify(installPath)}
    })`)
    assert(diagnosticExport?.ok === true, 'Diagnostic export did not report ok=true.')
    assert(diagnosticExport.summary?.missing === 0, `Diagnostic export reported ${diagnosticExport.summary?.missing ?? 'unknown'} missing files.`)
    assert(diagnosticExport.summary?.corrupt === 0, `Diagnostic export reported ${diagnosticExport.summary?.corrupt ?? 'unknown'} corrupt files.`)
    assert(await exists(diagnosticExport.reportPath), `Diagnostic report was not written: ${diagnosticExport.reportPath}`)
    const diagnosticReport = await readJson(diagnosticExport.reportPath)
    assert(diagnosticReport.profile?.id === SMOKE_PACK.packId, `Diagnostic report profile mismatch: ${diagnosticReport.profile?.id}`)
    assert(diagnosticReport.manifest?.pack === SMOKE_PACK.packId, `Diagnostic report manifest mismatch: ${diagnosticReport.manifest?.pack}`)
    assert(diagnosticReport.installPath === installPath, `Diagnostic report installPath mismatch: ${diagnosticReport.installPath}`)
    assert(diagnosticReport.verification?.missing?.length === 0, 'Diagnostic report verification has missing files.')
    assert(diagnosticReport.verification?.corrupt?.length === 0, 'Diagnostic report verification has corrupt files.')

    const logExport = await evaluate(cdp, `window.echoNative.invoke('logs:export', {
      profileId: ${JSON.stringify(SMOKE_PACK.packId)},
      installPath: ${JSON.stringify(installPath)}
    })`)
    assert(logExport?.ok === true, 'Log export did not report ok=true.')
    assert(Array.isArray(logExport.files) && logExport.files.length > 0, 'Log export did not include any source files.')
    const logZip = await assertZipFile(logExport.zipPath, 'Log export bundle')

    const launchPreflight = await evaluate(cdp, `window.echoNative.invoke('launch:preflight', {
      profileId: ${JSON.stringify(SMOKE_PACK.packId)},
      installPath: ${JSON.stringify(installPath)}
    })`)
    assert(launchPreflight?.ok === false, 'Legacy native launch preflight unexpectedly reported ok=true.')
    assert(launchPreflight.profileId === SMOKE_PACK.packId, `Launch preflight profile mismatch: ${launchPreflight.profileId}`)
    assert(launchPreflight.verification?.missing?.length === 0, 'Launch preflight verification has missing files.')
    assert(launchPreflight.verification?.corrupt?.length === 0, 'Launch preflight verification has corrupt files.')
    assert((launchPreflight.blockers ?? []).some((blocker) => blocker.id === 'minecraft-launcher-handoff'), 'Launch preflight did not expose the Minecraft Launcher handoff blocker.')
    const launchStart = await evaluate(cdp, `window.echoNative.invoke('launch:start', {
      profileId: ${JSON.stringify(SMOKE_PACK.packId)},
      installPath: ${JSON.stringify(installPath)}
    })`)
    assert(launchStart?.status === 'preflight_failed', `Legacy launch start returned unexpected status: ${launchStart?.status}`)
    assert(/Minecraft Launcher Handoff/u.test(launchStart.message ?? ''), `Legacy launch start did not name Minecraft Launcher Handoff: ${launchStart.message}`)

    const handoffPreparation = await evaluate(cdp, `window.echoNative.invoke('launch:prepare-handoff', {
      profileId: ${JSON.stringify(SMOKE_PACK.packId)},
      installPath: ${JSON.stringify(installPath)},
      updatePolicy: 'skip',
      runtimeMode: 'native-loader-minecraft',
      prepareOnly: true
    })`)
    assert(handoffPreparation?.ok === true, `Prepare-only Minecraft Launcher handoff did not report ok=true: ${handoffPreparation?.message}`)
    assert(handoffPreparation.profileId === SMOKE_PACK.packId, `Prepare-only handoff profile mismatch: ${handoffPreparation.profileId}`)
    assert(handoffPreparation.runtimeMode === 'native-loader-minecraft', `Prepare-only handoff runtime mismatch: ${handoffPreparation.runtimeMode}`)
    assert(handoffPreparation.verification?.missing?.length === 0, 'Prepare-only handoff verification has missing files.')
    assert(handoffPreparation.verification?.corrupt?.length === 0, 'Prepare-only handoff verification has corrupt files.')
    assert(handoffPreparation.handoff?.ok === true, `Prepare-only handoff result did not report ok=true: ${handoffPreparation.handoff?.message}`)
    assert(handoffPreparation.handoff?.profileCurrent === true, 'Prepare-only handoff profile is not current.')
    assert(handoffPreparation.handoff?.versionReady === true, 'Prepare-only handoff version metadata is not ready.')
    assert(handoffPreparation.handoff?.openedLauncher === false, 'Prepare-only handoff unexpectedly opened the Minecraft Launcher.')
    assert(handoffPreparation.handoff?.prepareOnly === true, 'Prepare-only handoff did not preserve prepareOnly=true.')
    assert(handoffPreparation.handoff?.openSkipped === true, 'Prepare-only handoff did not report openSkipped=true.')
    assert(handoffPreparation.handoff?.updatedProfile === true, 'Prepare-only handoff did not update the launcher profile.')
    assert(handoffPreparation.handoff?.validatedGameDir === installPath, `Prepare-only handoff gameDir mismatch: ${handoffPreparation.handoff?.validatedGameDir}`)
    assert((handoffPreparation.handoff?.validatedModsCount ?? 0) > 0, 'Prepare-only handoff did not validate installed Native addon files.')
    assert(handoffPreparation.handoff?.minecraftRoot === isolatedMinecraftRoot, `Prepare-only handoff used the wrong Minecraft root: ${handoffPreparation.handoff?.minecraftRoot}`)
    assert(String(handoffPreparation.handoff?.launcherProfilesPath ?? '').startsWith(isolatedMinecraftRoot), 'Prepare-only launcher_profiles path is not inside the isolated Minecraft root.')
    assert(String(handoffPreparation.handoff?.versionMetadataPath ?? '').startsWith(isolatedMinecraftRoot), 'Prepare-only version metadata path is not inside the isolated Minecraft root.')
    assert(await exists(handoffPreparation.handoff.launcherProfilesPath), `Prepare-only launcher profile was not written: ${handoffPreparation.handoff.launcherProfilesPath}`)
    assert(await exists(handoffPreparation.handoff.versionMetadataPath), `Prepare-only version metadata was not written: ${handoffPreparation.handoff.versionMetadataPath}`)
    const handoffProfiles = await readJson(handoffPreparation.handoff.launcherProfilesPath)
    const handoffProfile = handoffProfiles.profiles?.[handoffPreparation.handoff.profileId]
    assert(handoffProfile?.echoManaged === true, 'Prepared launcher profile is not marked echoManaged.')
    assert(handoffProfile?.echoLauncher?.profileId === SMOKE_PACK.packId, `Prepared launcher profile echo id mismatch: ${handoffProfile?.echoLauncher?.profileId}`)
    assert(handoffProfile?.echoLauncher?.runtimeMode === 'native-loader-minecraft', `Prepared launcher profile runtime mismatch: ${handoffProfile?.echoLauncher?.runtimeMode}`)
    assert(handoffProfile?.gameDir === installPath, `Prepared launcher profile gameDir mismatch: ${handoffProfile?.gameDir}`)
    assert(handoffProfile?.lastVersionId === handoffPreparation.handoff.versionId, `Prepared launcher profile version mismatch: ${handoffProfile?.lastVersionId}`)
    const handoffVersionMetadata = await readJson(handoffPreparation.handoff.versionMetadataPath)
    assert(handoffVersionMetadata?.id === handoffPreparation.handoff.versionId, `Prepared version metadata id mismatch: ${handoffVersionMetadata?.id}`)
    assert(handoffVersionMetadata?.echoLauncher?.loader === 'native-loader', `Prepared version metadata loader mismatch: ${handoffVersionMetadata?.echoLauncher?.loader}`)

    const report = {
      schemaVersion: 'echo.galactic_survey.electron-ui-smoke.v1',
      ok: true,
      generatedAt: new Date().toISOString(),
      scope: 'packaged-electron-ui-and-lifecycle-smoke',
      executable: args.exe,
      workRoot: args.workRoot,
      userDataDir,
      playerContentRoot,
      isolatedMinecraftRoot,
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
      nativeBridge: {
        available: ui.nativeBridgeAvailable,
        protocolVersion: bootstrap.protocolVersion,
        profileIds: bootstrap.profileIds,
        releaseIndexAccepted: bootstrap.releaseIndexAccepted,
        releaseIndexWarnings: bootstrap.releaseIndexWarnings,
        launcherUpdateStatus: bootstrap.launcherUpdateStatus,
        userData: bootstrap.userData,
      },
      ui,
      clickThrough: {
        selectedPack: {
          packId: SMOKE_PACK.packId,
          name: SMOKE_PACK.name,
          profile: installedProfile,
        },
        install: {
          ok: installData.report.ok,
          operation: installData.report.operation,
          click: installClick,
          reportPath: installData.reportPath,
          installed: installData.report.installed?.length ?? 0,
          updated: installData.report.updated?.length ?? 0,
          verified: installData.report.verified?.length ?? 0,
          downloaded: installData.report.downloaded?.length ?? 0,
          installPath,
          verifiedModule: verifiedAfterInstall,
        },
        update: {
          ok: updateData.report.ok,
          operation: updateData.report.operation,
          click: updateClick,
          reportPath: updateData.reportPath,
          installed: updateData.report.installed?.length ?? 0,
          updated: updateData.report.updated?.length ?? 0,
          verified: updateData.report.verified?.length ?? 0,
          downloaded: updateData.report.downloaded?.length ?? 0,
          verifiedModule: verifiedAfterUpdate,
        },
        repair: {
          ok: repairData.report.ok,
          click: repairClick,
          reportPath: repairData.reportPath,
          repaired: repairData.report.repaired ?? [],
          skipped: repairData.report.skipped ?? [],
          warnings: repairData.report.warnings ?? [],
          corruptSha256,
          verifiedModule: verifiedAfterRepair,
        },
        diagnostics: {
          ok: diagnosticExport.ok,
          reportPath: diagnosticExport.reportPath,
          summary: diagnosticExport.summary,
          report: {
            profileId: diagnosticReport.profile?.id,
            manifestPack: diagnosticReport.manifest?.pack,
            installPath: diagnosticReport.installPath,
            verification: {
              missing: diagnosticReport.verification?.missing?.length ?? null,
              corrupt: diagnosticReport.verification?.corrupt?.length ?? null,
              valid: diagnosticReport.verification?.valid?.length ?? null,
            },
            javaRuntimes: diagnosticReport.java?.runtimes?.length ?? null,
            logFiles: diagnosticReport.logs?.files?.length ?? null,
          },
        },
        logs: {
          ok: logExport.ok,
          zipPath: logExport.zipPath,
          size: logExport.size,
          generatedAt: logExport.generatedAt,
          sourceFiles: logExport.files,
          zip: logZip,
        },
        firstLaunch: {
          state: 'fail_closed_legacy_native_launch_removed',
          preflight: {
            ok: launchPreflight.ok,
            profileId: launchPreflight.profileId,
            installPath: launchPreflight.installPath,
            verification: {
              missing: launchPreflight.verification?.missing?.length ?? null,
              corrupt: launchPreflight.verification?.corrupt?.length ?? null,
              valid: launchPreflight.verification?.valid?.length ?? null,
            },
            blockers: launchPreflight.blockers ?? [],
          },
          start: launchStart,
          requiredPath: 'Minecraft Launcher Handoff or a real Native runtime launch command must pass before this can become first-launch proof.',
        },
        minecraftLauncherHandoff: {
          state: 'prepared_profile_in_isolated_minecraft_root',
          ok: handoffPreparation.ok,
          operationId: handoffPreparation.operationId,
          runtimeMode: handoffPreparation.runtimeMode,
          runtimeLabel: handoffPreparation.runtimeLabel,
          phases: handoffPreparation.phases,
          verification: {
            missing: handoffPreparation.verification?.missing?.length ?? null,
            corrupt: handoffPreparation.verification?.corrupt?.length ?? null,
            valid: handoffPreparation.verification?.valid?.length ?? null,
          },
          handoff: {
            ok: handoffPreparation.handoff?.ok,
            profileId: handoffPreparation.handoff?.profileId,
            profileName: handoffPreparation.handoff?.profileName,
            profileExists: handoffPreparation.handoff?.profileExists,
            profileCurrent: handoffPreparation.handoff?.profileCurrent,
            versionId: handoffPreparation.handoff?.versionId,
            versionReady: handoffPreparation.handoff?.versionReady,
            versionSource: handoffPreparation.handoff?.versionSource,
            minecraftRoot: handoffPreparation.handoff?.minecraftRoot,
            launcherProfilesPath: handoffPreparation.handoff?.launcherProfilesPath,
            versionMetadataPath: handoffPreparation.handoff?.versionMetadataPath,
            gameDir: handoffPreparation.handoff?.gameDir,
            validatedGameDir: handoffPreparation.handoff?.validatedGameDir,
            validatedModsCount: handoffPreparation.handoff?.validatedModsCount,
            preparedVersionMetadata: handoffPreparation.handoff?.preparedVersionMetadata,
            updatedProfile: handoffPreparation.handoff?.updatedProfile,
            openedLauncher: handoffPreparation.handoff?.openedLauncher,
            prepareOnly: handoffPreparation.handoff?.prepareOnly,
            openSkipped: handoffPreparation.handoff?.openSkipped,
            warnings: handoffPreparation.handoff?.warnings ?? [],
            message: handoffPreparation.handoff?.message,
          },
          writtenProfile: {
            echoManaged: handoffProfile?.echoManaged === true,
            profileId: handoffProfile?.echoLauncher?.profileId,
            runtimeMode: handoffProfile?.echoLauncher?.runtimeMode,
            gameDir: handoffProfile?.gameDir,
            lastVersionId: handoffProfile?.lastVersionId,
          },
          writtenVersionMetadata: {
            id: handoffVersionMetadata?.id,
            loader: handoffVersionMetadata?.echoLauncher?.loader,
            inheritsFrom: handoffVersionMetadata?.inheritsFrom,
          },
          limitation: 'Prepare-only evidence proves packaged launcher metadata handoff in an isolated Minecraft root. It is not gameplay or official Minecraft Launcher open/play evidence.',
        },
        rollback: {
          state: 'covered_by_node_lifecycle_smoke_no_visible_packaged_ui_command',
        },
      },
      gates: {
        packagedElectronRendererMounted: 'passed',
        nativeBridgeBootstrap: 'passed',
        galacticSurveyLibraryCardsVisible: 'passed',
        galacticSurveyScopedCardActions: 'passed',
        galacticSurveyHeadingOverflow: 'passed',
        packagedElectronInstallClickThrough: 'passed',
        packagedElectronUpdateReconciliationClickThrough: 'passed',
        packagedElectronRepairClickThrough: 'passed',
        packagedElectronDiagnosticExport: 'passed',
        packagedElectronLogExport: 'passed',
        packagedElectronMinecraftLauncherHandoffPreparation: 'passed_isolated_prepare_only',
        packagedElectronFirstLaunch: 'blocked_legacy_native_launch_removed',
        packagedElectronRollbackClickThrough: 'not_available_no_visible_ui_command',
        realVersionToVersionUpdate: 'covered_by_release-readiness/galactic-survey-launcher-lifecycle-smoke.json',
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
