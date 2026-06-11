import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFile, spawn } from 'node:child_process'

const SKY_RELAY_PACKS = [
  {
    packId: 'sky-relay-native-edition',
    name: 'Sky Relay Native Edition',
  },
  {
    packId: 'sky-relay-neoforge-edition',
    name: 'Sky Relay NeoForge Edition',
  },
  {
    packId: 'sky-relay-standalone-edition',
    name: 'Sky Relay Standalone Edition',
  },
]

function usage() {
  return `Usage: node scripts/sky-relay-electron-ui-smoke.mjs [options]

Launches the packaged Electron app through a remote debugging port and verifies
that the Sky Relay Library cards render through the real native bridge.

Options:
  --exe <path>        Packaged launcher executable.
                      Default: installer-artifacts/win-unpacked/ECHOLauncher.exe
  --work-root <path>  Temporary user-data and logs root.
                      Default: tmp/sky-relay-electron-ui-smoke
  --out <path>        Evidence output path.
                      Default: ../ECHO-Release-Index/release-readiness/sky-relay-electron-ui-smoke.json
  --timeout-ms <ms>   Overall wait timeout for renderer checks. Default: 45000
  --clean             Remove work-root before running.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    exe: path.resolve(root, 'installer-artifacts', 'win-unpacked', 'ECHOLauncher.exe'),
    workRoot: path.resolve(root, 'tmp', 'sky-relay-electron-ui-smoke'),
    out: path.resolve(root, '..', 'ECHO-Release-Index', 'release-readiness', 'sky-relay-electron-ui-smoke.json'),
    timeoutMs: 45_000,
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
  const userDataDir = path.join(args.workRoot, 'user-data')
  await fs.mkdir(userDataDir, { recursive: true })

  const stdout = []
  const stderr = []
  const child = spawn(args.exe, [`--remote-debugging-port=${debugPort}`], {
    cwd: path.dirname(args.exe),
    env: {
      ...process.env,
      ECHO_LAUNCHER_USER_DATA_DIR: userDataDir,
      ECHO_LAUNCHER_SMOKE: 'sky-relay-electron-ui',
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

    await waitFor('Sky Relay Library cards', args.timeoutMs, async () => evaluate(cdp, `(() => {
      const names = ${JSON.stringify(SKY_RELAY_PACKS.map((pack) => pack.name))}
      const headingTexts = Array.from(document.querySelectorAll('h3')).map((heading) => heading.textContent?.trim())
      return document.querySelector('h1')?.textContent?.trim() === 'Library' && names.every((name) => headingTexts.includes(name))
    })()`))

    const ui = await evaluate(cdp, `(() => {
      const names = ${JSON.stringify(SKY_RELAY_PACKS.map((pack) => pack.name))}
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
          statusPreview: cardText.includes('Preview'),
          modeViewOnly: cardText.includes('View-only'),
          playLocked: cardText.includes('Locked'),
          noInstallProfile: cardText.includes('View-only preview. No install profile is created.')
        }
      })
      return {
        title: document.title,
        href: location.href,
        activeHeading: document.querySelector('h1')?.textContent?.trim() ?? '',
        rootMounted: Boolean(document.getElementById('root')?.childElementCount),
        startupRecovery: Boolean(document.querySelector('[data-echo-startup-recovery]')),
        nativeBridgeAvailable: Boolean(window.echoNative?.invoke),
        officialPacksLabelVisible: /official packs/i.test(bodyText),
        cards,
        hasInstallSkyRelay: bodyText.includes('Install Sky Relay'),
        hasPlaySkyRelay: bodyText.includes('Play Sky Relay')
      }
    })()`)

    assert(ui.title === 'ECHO Launcher', `Unexpected title: ${ui.title}`)
    assert(ui.rootMounted, 'Renderer root did not mount.')
    assert(!ui.startupRecovery, 'Startup recovery page was shown.')
    assert(ui.nativeBridgeAvailable, 'Native bridge is not available in Electron.')
    assert(ui.activeHeading === 'Library', `Expected Library page, got ${ui.activeHeading}`)
    assert(ui.officialPacksLabelVisible, 'Official Packs label was not visible.')
    assert(!ui.hasInstallSkyRelay, 'Sky Relay install affordance appeared before promotion.')
    assert(!ui.hasPlaySkyRelay, 'Sky Relay play affordance appeared before promotion.')
    for (const card of ui.cards) {
      assert(card.found, `${card.name} card was not found.`)
      assert(!card.heading.overflow, `${card.name} heading overflowed in packaged Electron.`)
      assert(card.statusPreview, `${card.name} is missing Preview status.`)
      assert(card.modeViewOnly, `${card.name} is missing View-only mode.`)
      assert(card.playLocked, `${card.name} is missing Locked play state.`)
      assert(card.noInstallProfile, `${card.name} is missing no-install profile messaging.`)
    }
    for (const pack of SKY_RELAY_PACKS) {
      assert(bootstrap.profileIds.includes(pack.packId), `Bootstrap profiles missing ${pack.packId}.`)
    }

    const report = {
      schemaVersion: 'echo.skyrelay.electron-ui-smoke.v1',
      ok: true,
      generatedAt: new Date().toISOString(),
      scope: 'packaged-electron-ui-smoke',
      executable: args.exe,
      workRoot: args.workRoot,
      debugPort,
      platform: {
        os: process.platform,
        release: os.release(),
        arch: process.arch,
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
      gates: {
        packagedElectronRendererMounted: 'passed',
        nativeBridgeBootstrap: 'passed',
        skyRelayLibraryCardsVisible: 'passed',
        skyRelayPreviewGating: 'passed',
        skyRelayHeadingOverflow: 'passed',
        installUpdateRepairRollbackClickThrough: 'not_started',
        realVersionToVersionUpdate: 'blocked',
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
        await cdp.send('Browser.close')
      } catch {
        cdp.close()
      }
    }
    await sleep(500)
    await killProcessTree(child)
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
