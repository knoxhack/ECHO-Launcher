import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFile, spawn } from 'node:child_process'

const OFFICIAL_PACKS = [
  ['ashfall-native-edition', 'Ashfall Native Edition'],
  ['ashfall-neoforge-edition', 'Ashfall NeoForge Edition'],
  ['ashfall-standalone-edition', 'Ashfall Standalone Edition'],
  ['sky-relay-native-edition', 'Sky Relay Native Edition'],
  ['sky-relay-neoforge-edition', 'Sky Relay NeoForge Edition'],
  ['sky-relay-standalone-edition', 'Sky Relay Standalone Edition'],
  ['galactic-survey-native-edition', 'Galactic Survey Native Edition'],
  ['galactic-survey-neoforge-edition', 'Galactic Survey NeoForge Edition'],
  ['galactic-survey-standalone-edition', 'Galactic Survey Standalone Edition'],
  ['openlands-native-edition', 'Openlands Native Edition'],
  ['openlands-neoforge-edition', 'Openlands NeoForge Edition'],
  ['openlands-standalone-edition', 'Openlands Standalone Edition'],
  ['arcana-division-native-edition', 'Arcana Division Native Edition'],
  ['arcana-division-neoforge-edition', 'Arcana Division NeoForge Edition'],
  ['arcana-division-standalone-edition', 'Arcana Division Standalone Edition'],
].map(([profileId, name]) => ({ profileId, name }))

const PUBLIC_CHANNEL_URL = 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/launcher-channel.json'

function usage() {
  return `Usage: node scripts/all-modpacks-electron-install-smoke.mjs [options]

Launches the packaged Electron app with an isolated user-data/player-content/
Minecraft root, uses the real public Release Index channel, selects every
official pack in the Home UI, clicks the visible Install action, waits for a
successful install report, and hashes every installed manifest file.

Options:
  --exe <path>             Packaged launcher executable.
                           Default: installer-artifacts/win-unpacked/ECHOLauncher.exe
  --work-root <path>       Temporary root for user-data/player-content/.minecraft.
                           Default: OS temp echo-all-modpacks-electron-install-smoke
  --out <path>             Smoke report path.
                           Default: ../ECHO-Release-Index/release-readiness/all-modpacks-electron-install-smoke.json
  --channel-url <url>      Release Index launcher channel URL.
                           Default: ${PUBLIC_CHANNEL_URL}
  --pack <profileId>       Limit to one pack. May be provided multiple times.
  --pack-timeout-ms <ms>   Timeout per pack. Default: 300000
  --timeout-ms <ms>        Renderer startup timeout. Default: 120000
  --clean                  Remove work-root before launching.
  --keep-open              Leave Electron running after the smoke.
`
}

function parseArgs(argv) {
  const root = process.cwd()
  const args = {
    exe: path.resolve(root, 'installer-artifacts', 'win-unpacked', 'ECHOLauncher.exe'),
    workRoot: path.join(os.tmpdir(), 'echo-all-modpacks-electron-install-smoke'),
    out: path.resolve(root, '..', 'ECHO-Release-Index', 'release-readiness', 'all-modpacks-electron-install-smoke.json'),
    channelUrl: PUBLIC_CHANNEL_URL,
    timeoutMs: 120_000,
    packTimeoutMs: 300_000,
    clean: false,
    keepOpen: false,
    help: false,
    packs: [],
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
    else if (arg === '--channel-url') args.channelUrl = next()
    else if (arg === '--pack') args.packs.push(next())
    else if (arg === '--timeout-ms') args.timeoutMs = Number(next())
    else if (arg === '--pack-timeout-ms') args.packTimeoutMs = Number(next())
    else if (arg === '--clean') args.clean = true
    else if (arg === '--keep-open') args.keepOpen = true
    else if (arg === '--help') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 5_000) throw new Error('--timeout-ms must be at least 5000.')
  if (!Number.isFinite(args.packTimeoutMs) || args.packTimeoutMs < 30_000) throw new Error('--pack-timeout-ms must be at least 30000.')
  return args
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
    await sleep(500)
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
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
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

async function clickVisibleButton(cdp, text) {
  const result = await evaluate(cdp, `(() => {
    const needle = ${JSON.stringify(text)}
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const button = Array.from(document.querySelectorAll('button')).find((element) => {
      const label = element.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
      return label.includes(needle) && isVisible(element)
    })
    if (!button) return { clicked: false, reason: \`Button containing '\${needle}' was not found.\` }
    if (button.disabled) return { clicked: false, reason: \`Button containing '\${needle}' is disabled: '\${button.textContent?.trim() ?? ''}'.\` }
    button.scrollIntoView({ block: 'center', inline: 'center' })
    button.click()
    return { clicked: true, label: button.textContent?.replace(/\\s+/g, ' ').trim() ?? '' }
  })()`)
  assert(result.clicked, result.reason)
  return result
}

async function navigateHome(cdp) {
  await waitFor('Home navigation button', 30_000, async () => clickVisibleButton(cdp, 'Home'))
  await waitFor('Home page', 30_000, async () => evaluate(cdp, `(() => {
    const bodyText = document.body.innerText
    return /SELECTED\\s+PACK/i.test(bodyText) && /PRIMARY\\s+ACTION/i.test(bodyText)
  })()`))
}

async function selectHomePack(cdp, pack) {
  const result = await evaluate(cdp, `(() => {
    const profileId = ${JSON.stringify(pack.profileId)}
    const select = document.getElementById('home-pack-select') ?? Array.from(document.querySelectorAll('select')).find((element) =>
      Array.from(element.options).some((option) => option.value === profileId)
    )
    if (!select) return { selected: false, reason: 'Home pack select was not found.' }
    const option = Array.from(select.options).find((item) => item.value === profileId)
    if (!option) return { selected: false, reason: \`Pack option '\${profileId}' was not found.\` }
    select.value = profileId
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return { selected: true, value: select.value, label: option.textContent?.trim() ?? '' }
  })()`)
  assert(result.selected, result.reason)
  await waitFor(`${pack.name} selected`, 30_000, async () => evaluate(cdp, `(() => {
    const select = document.getElementById('home-pack-select') ?? Array.from(document.querySelectorAll('select')).find((element) =>
      Array.from(element.options).some((option) => option.value === ${JSON.stringify(pack.profileId)})
    )
    return select?.value === ${JSON.stringify(pack.profileId)} && document.body.innerText.includes(${JSON.stringify(pack.name)})
  })()`))
}

async function visiblePrimaryInstallAction(cdp, pack) {
  return evaluate(cdp, `(() => {
    const expected = ${JSON.stringify(`Install ${pack.name}`)}
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter(isVisible)
      .map((button) => ({
        label: button.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        disabled: button.disabled,
      }))
    const install = buttons.find((button) => button.label.includes(expected))
    const unavailable = buttons.find((button) => /Unavailable/i.test(button.label))
    return {
      ok: Boolean(install && !install.disabled),
      expected,
      install,
      unavailable,
      visibleButtons: buttons.slice(0, 40),
      bodyPreview: document.body.innerText.split(/\\n/u).map((line) => line.trim()).filter(Boolean).slice(0, 80),
    }
  })()`)
}

async function newestReportData(logsDir, prefix, afterMs = 0) {
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
  if (!reports[0]) return null
  return { reportPath: reports[0].filePath, report: await readJson(reports[0].filePath) }
}

async function waitForInstallReport(logsDir, afterMs, pack, timeoutMs) {
  return waitFor(`${pack.name} install report`, timeoutMs, async () => {
    const data = await newestReportData(logsDir, 'install-', afterMs)
    if (!data?.report) return null
    if (data.report.profileId !== pack.profileId) return null
    if (!data.report.ok) throw new Error(`${pack.name} install report failed: ${data.report.message ?? data.report.error ?? data.reportPath}`)
    return data
  })
}

async function hashInstalledManifest(installPath, selectedPack) {
  const manifestPath = path.join(installPath, '.echo', 'installed-manifest.json')
  assert(await exists(manifestPath), `Installed manifest missing: ${manifestPath}`)
  const manifest = await readJson(manifestPath)
  assert(manifest.pack === selectedPack, `Installed manifest pack is ${manifest.pack}, expected ${selectedPack}.`)
  const files = []
  for (const file of manifest.files ?? []) {
    if (file.required === false) continue
    const relativePath = String(file.path ?? '').replace(/\\/g, '/')
    const absolutePath = path.join(installPath, relativePath)
    assert(await exists(absolutePath), `Installed file missing: ${relativePath}`)
    const actualSha256 = await sha256File(absolutePath)
    assert(actualSha256 === String(file.sha256).toLowerCase(), `Installed file corrupt: ${relativePath}`)
    const stat = await fs.stat(absolutePath)
    files.push({
      path: relativePath,
      sha256: actualSha256,
      size: stat.size,
    })
  }
  return {
    manifestPath,
    manifestPack: manifest.pack,
    manifestVersion: manifest.version,
    fileCount: files.length,
    files,
  }
}

async function killProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      execFile('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve())
    })
    return
  }
  child.kill('SIGTERM')
}

function trimLines(lines, max = 100) {
  return lines.slice(Math.max(0, lines.length - max))
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  assert(await exists(args.exe), `Packaged launcher executable not found: ${args.exe}`)

  const selected = args.packs.length
    ? OFFICIAL_PACKS.filter((pack) => args.packs.includes(pack.profileId))
    : OFFICIAL_PACKS
  assert(selected.length > 0, `No known official packs matched: ${args.packs.join(', ')}`)

  if (args.clean) await fs.rm(args.workRoot, { recursive: true, force: true })
  await fs.mkdir(args.workRoot, { recursive: true })

  const userDataDir = path.join(args.workRoot, 'user-data')
  const playerContentRoot = path.join(args.workRoot, 'player-content')
  const minecraftRoot = path.join(args.workRoot, 'minecraft-root')
  const logsDir = path.join(userDataDir, 'ECHO', 'launcher-logs')
  const settingsPath = path.join(userDataDir, 'ECHO', 'settings.json')
  await fs.mkdir(userDataDir, { recursive: true })
  await fs.mkdir(playerContentRoot, { recursive: true })
  await fs.mkdir(minecraftRoot, { recursive: true })
  await writeJson(settingsPath, {
    releaseIndex: {
      enabled: true,
      channelUrl: args.channelUrl,
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

  const debugPort = await freePort()
  const stdout = []
  const stderr = []
  const child = spawn(args.exe, [`--remote-debugging-port=${debugPort}`], {
    cwd: path.dirname(args.exe),
    env: {
      ...process.env,
      ECHO_LAUNCHER_USER_DATA_DIR: userDataDir,
      ECHO_LAUNCHER_PLAYER_CONTENT_ROOT: playerContentRoot,
      ECHO_LAUNCHER_MINECRAFT_ROOT: minecraftRoot,
      ECHO_LAUNCHER_SMOKE: 'all-modpacks-electron-install',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  })
  child.stdout.on('data', (chunk) => stdout.push(String(chunk)))
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)))

  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    channelUrl: args.channelUrl,
    executable: args.exe,
    workRoot: args.workRoot,
    userDataDir,
    playerContentRoot,
    minecraftRoot,
    packs: [],
    failures: [],
    stdout: [],
    stderr: [],
  }

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
    await waitFor('Release Index bootstrap', args.timeoutMs, async () => evaluate(cdp, `window.echoNative.invoke('app:get-bootstrap-state').then((state) => (state.releaseIndex?.acceptedCount ?? state.releaseIndex?.releases?.length ?? 0) >= 15)`))

    for (const pack of selected) {
      const startedAt = Date.now()
      const packResult = {
        profileId: pack.profileId,
        name: pack.name,
        startedAt: new Date(startedAt).toISOString(),
        ok: false,
      }
      report.packs.push(packResult)
      try {
        await navigateHome(cdp)
        await selectHomePack(cdp, pack)
        const packState = await waitFor(`${pack.name} pack state`, args.packTimeoutMs, async () => {
          const state = await evaluate(cdp, `window.echoNative.invoke('app:get-pack-state', { profileId: ${JSON.stringify(pack.profileId)} })`)
          return state?.selectedProfile?.id === pack.profileId && state?.primaryAction ? state : null
        })
        packResult.packStateBefore = {
          catalog: packState.catalog,
          route: packState.route,
          primaryAction: packState.primaryAction,
          blockers: packState.blockers,
        }

        const action = await waitFor(`${pack.name} visible install action`, args.packTimeoutMs, async () => {
          const candidate = await visiblePrimaryInstallAction(cdp, pack)
          if (candidate.unavailable) {
            throw new Error(`${pack.name} is unavailable in UI: ${JSON.stringify(candidate.unavailable)}`)
          }
          if (!candidate.ok) return null
          return candidate
        })
        packResult.visibleInstallAction = action.install

        const installStartedAt = Date.now() - 1000
        const click = await clickVisibleButton(cdp, `Install ${pack.name}`)
        packResult.click = click
        const installData = await waitForInstallReport(logsDir, installStartedAt, pack, args.packTimeoutMs)
        const installPath = installData.report.installPath
        assert(installPath, `${pack.name} install report did not include installPath.`)
        const installed = await hashInstalledManifest(installPath, pack.profileId)
        const durationMs = Date.now() - startedAt
        Object.assign(packResult, {
          ok: true,
          completedAt: new Date().toISOString(),
          durationMs,
          installReportPath: installData.reportPath,
          installPath,
          manifestPath: installed.manifestPath,
          manifestPack: installed.manifestPack,
          manifestVersion: installed.manifestVersion,
          fileCount: installed.fileCount,
        })
        await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
      } catch (error) {
        const failure = {
          profileId: pack.profileId,
          name: pack.name,
          message: error instanceof Error ? error.message : String(error),
        }
        packResult.failure = failure
        report.failures.push(failure)
        await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
        throw error
      }
    }

    report.ok = report.failures.length === 0 && report.packs.every((pack) => pack.ok)
    report.completedAt = new Date().toISOString()
    await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
    assert(report.ok, 'One or more official packs failed the real Electron install smoke.')
    console.log(`All modpacks Electron install smoke passed: ${args.out}`)
  } finally {
    if (cdp) cdp.close()
    if (!args.keepOpen) await killProcessTree(child)
  }
}

run().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
