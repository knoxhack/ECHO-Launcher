import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFile, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'

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
successful install report, hashes every installed manifest file, and verifies
the selected launch route can be prepared from the installed pack.

Options:
  --exe <path>             Packaged launcher executable.
                           Default: installer-artifacts/win-unpacked/ECHOLauncher.exe
  --work-root <path>       Temporary root for user-data/player-content/.minecraft.
                           Default: OS temp echo-all-modpacks-electron-install-smoke
  --out <path>             Smoke report path.
                           Default: ../ECHO-Release-Index/release-readiness/all-modpacks-electron-install-smoke.json
  --channel-url <url>      Release Index launcher channel URL.
                           Default: ${PUBLIC_CHANNEL_URL}
  --release-index-root <path>
                           Build a temporary local file-url channel from this
                           Release Index checkout instead of using --channel-url.
  --standalone-runtime-root <path>
                           Runtime workspace/image used to verify standalone
                           pack launch routes. Default: ../ECHO-Standalone-Runtime
  --pack <profileId>       Limit to one pack. May be provided multiple times.
  --repair-handoff-fixture Corrupt one installed pack file before Minecraft
                           handoff and require auto-repair evidence.
  --pack-timeout-ms <ms>   Timeout per pack. Default: 900000
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
    releaseIndexRoot: null,
    standaloneRuntimeRoot: process.env.ECHO_STANDALONE_RUNTIME_ROOT
      ? path.resolve(process.env.ECHO_STANDALONE_RUNTIME_ROOT)
      : path.resolve(root, '..', 'ECHO-Standalone-Runtime'),
    timeoutMs: 120_000,
    packTimeoutMs: 900_000,
    clean: false,
    keepOpen: false,
    repairHandoffFixture: false,
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
    else if (arg === '--release-index-root') args.releaseIndexRoot = path.resolve(next())
    else if (arg === '--standalone-runtime-root') args.standaloneRuntimeRoot = path.resolve(next())
    else if (arg === '--pack') args.packs.push(next())
    else if (arg === '--repair-handoff-fixture') args.repairHandoffFixture = true
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

async function jsonCatalogUrls(root, directory) {
  const dir = path.join(root, directory)
  const entries = await fs.readdir(dir).catch(() => [])
  return entries
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => pathToFileURL(path.join(dir, name)).href)
}

async function copyJsonDirectory(sourceRoot, targetRoot, directory) {
  const sourceDir = path.join(sourceRoot, directory)
  const targetDir = path.join(targetRoot, directory)
  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(sourceDir).catch(() => [])
  for (const name of entries.filter((entry) => entry.endsWith('.json')).sort()) {
    await fs.copyFile(path.join(sourceDir, name), path.join(targetDir, name))
  }
}

async function buildLocalReleaseIndexChannel(args, workRoot) {
  if (!args.releaseIndexRoot) return args.channelUrl
  const channelPath = path.join(workRoot, 'local-release-index-channel.json')
  const localRoot = path.join(workRoot, 'local-release-index')
  const localChannelsAlpha = path.join(localRoot, 'channels', 'alpha')
  await fs.rm(localRoot, { recursive: true, force: true })
  await fs.mkdir(localChannelsAlpha, { recursive: true })
  await fs.copyFile(
    path.join(args.releaseIndexRoot, 'channels', 'alpha', 'release-manifest.json'),
    path.join(localChannelsAlpha, 'release-manifest.json'),
  )
  await fs.copyFile(
    path.join(args.releaseIndexRoot, 'channels', 'alpha', 'repositories.json'),
    path.join(localChannelsAlpha, 'repositories.json'),
  )
  for (const directory of ['products', 'modpacks', 'modules', 'addons']) {
    await copyJsonDirectory(args.releaseIndexRoot, localRoot, directory)
  }
  const releaseManifestPath = path.join(localChannelsAlpha, 'release-manifest.json')
  const repositoryCatalogPath = path.join(localChannelsAlpha, 'repositories.json')
  await writeJson(channelPath, {
    schemaVersion: 1,
    channel: 'alpha',
    generatedAt: new Date().toISOString(),
    releaseManifestUrl: pathToFileURL(releaseManifestPath).href,
    repositoryCatalogUrl: pathToFileURL(repositoryCatalogPath).href,
    catalogUrls: {
      products: await jsonCatalogUrls(localRoot, 'products'),
      modpacks: await jsonCatalogUrls(localRoot, 'modpacks'),
      modules: await jsonCatalogUrls(localRoot, 'modules'),
      addons: await jsonCatalogUrls(localRoot, 'addons'),
    },
  })
  return pathToFileURL(channelPath).href
}

function parseReleaseTagFromUrl(url) {
  const match = String(url ?? '').match(/\/ECHO-Modules\/releases\/download\/([^/?#]+)/u)
  return match ? decodeURIComponent(match[1]) : ''
}

function parseReleaseTagFromPageUrl(url) {
  const match = String(url ?? '').match(/\/ECHO-Modules\/releases\/tag\/([^/?#]+)/u)
  return match ? decodeURIComponent(match[1]) : ''
}

function releaseSourceStateForTag(releaseTag, primaryReleaseTag) {
  if (!releaseTag) return 'unknown'
  if (!primaryReleaseTag) return 'release-evidence'
  return releaseTag === primaryReleaseTag ? 'full-release-evidence' : 'partial-hotfix-evidence'
}

function moduleEvidenceSourceIndexFromRows(manifest, moduleRows) {
  const modulesRepo = (manifest.repositories ?? []).find((repository) => repository.repoName === 'ECHO-Modules') ?? {}
  const primaryReleaseTag = modulesRepo.releaseTag ?? modulesRepo.release?.tagName ?? parseReleaseTagFromPageUrl(modulesRepo.release?.htmlUrl)
  const releaseTagCounts = new Map()
  const artifactSourcesByUrl = new Map()
  for (const row of moduleRows) {
    if (row?.sourceRepo !== 'knoxhack/ECHO-Modules') continue
    const releaseTag = String(row.releaseTag ?? '')
    if (releaseTag) releaseTagCounts.set(releaseTag, (releaseTagCounts.get(releaseTag) ?? 0) + 1)
    const releaseSourceState = releaseSourceStateForTag(releaseTag, primaryReleaseTag)
    for (const artifact of Object.values(row.artifacts ?? {})) {
      if (!artifact?.url) continue
      artifactSourcesByUrl.set(artifact.url, {
        moduleId: row.id,
        releaseTag,
        releaseSourceState,
        artifactRole: artifact.artifactRole ?? null,
        file: artifact.file ?? null,
      })
    }
  }
  return {
    primaryReleaseTag,
    releaseTagDistribution: [...releaseTagCounts.entries()]
      .sort((left, right) => {
        if (left[0] === primaryReleaseTag) return -1
        if (right[0] === primaryReleaseTag) return 1
        return right[1] - left[1]
      })
      .map(([releaseTag, moduleRows]) => ({
        releaseTag,
        moduleRows,
        releaseSourceState: releaseSourceStateForTag(releaseTag, primaryReleaseTag),
      })),
    artifactSourcesByUrl,
  }
}

async function loadLocalModuleEvidenceSourceIndex(releaseIndexRoot) {
  const manifest = await readJson(path.join(releaseIndexRoot, 'channels', 'alpha', 'release-manifest.json')).catch(() => ({}))
  const modulesDir = path.join(releaseIndexRoot, 'modules')
  const moduleFiles = (await fs.readdir(modulesDir).catch(() => []))
    .filter((name) => name.endsWith('.json'))
    .sort()
  const moduleRows = []
  for (const name of moduleFiles) moduleRows.push(await readJson(path.join(modulesDir, name)))
  return moduleEvidenceSourceIndexFromRows(manifest, moduleRows)
}

async function loadPublicModuleEvidenceSourceIndex(channelUrl) {
  const channel = await fetchJson(channelUrl)
  const manifest = channel.releaseManifestUrl
    ? await fetchJson(channel.releaseManifestUrl)
    : {}
  const moduleRows = []
  for (const url of channel.catalogUrls?.modules ?? []) moduleRows.push(await fetchJson(url))
  return moduleEvidenceSourceIndexFromRows(manifest, moduleRows)
}

async function loadModuleEvidenceSourceIndex({ releaseIndexRoot, channelUrl }) {
  if (releaseIndexRoot) return loadLocalModuleEvidenceSourceIndex(releaseIndexRoot)
  if (channelUrl && /^https?:\/\//iu.test(channelUrl)) return loadPublicModuleEvidenceSourceIndex(channelUrl)
  return {
    primaryReleaseTag: '',
    releaseTagDistribution: [],
    artifactSourcesByUrl: new Map(),
  }
}

async function sha256File(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

async function sha1File(filePath) {
  return crypto.createHash('sha1').update(await fs.readFile(filePath)).digest('hex')
}

function dependencyBlocks(toml) {
  return String(toml).match(/\[\[dependencies\.[^\]]+\]\][\s\S]*?(?=\n\[\[dependencies\.|\n\[\[mods\]\]|\s*$)/gu) ?? []
}

function hasEchoMinecraftDependencyRange(toml) {
  return dependencyBlocks(toml).some((block) =>
    /modId\s*=\s*"minecraft"/u.test(block) && /versionRange\s*=\s*"\[26\.1\.2,26\.2\)"/u.test(block)
  )
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
      if (error?.fatal === true) throw error
      lastError = error
    }
    await sleep(500)
  }
  throw new Error(`${description} timed out.${lastError ? ` Last error: ${lastError.message}` : ''}`)
}

function fatalError(message) {
  const error = new Error(message)
  error.fatal = true
  return error
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
  let socket = null
  let opened = null
  let reconnecting = null
  let sequence = 0
  const pending = new Map()

  const openSocket = () => {
    socket = new WebSocket(webSocketUrl)
    opened = new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('CDP socket failed to open.')), { once: true })
    })
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (!payload.id || !pending.has(payload.id)) return
      const { resolve, reject, timeout } = pending.get(payload.id)
      clearTimeout(timeout)
      pending.delete(payload.id)
      if (payload.error) reject(new Error(payload.error.message ?? JSON.stringify(payload.error)))
      else resolve(payload.result ?? {})
    })
    socket.addEventListener('close', () => {
      for (const { reject, timeout } of pending.values()) {
        clearTimeout(timeout)
        reject(new Error('CDP socket closed.'))
      }
      pending.clear()
    })
  }

  const ensureOpen = async () => {
    if (socket?.readyState === WebSocket.OPEN) return
    if (socket?.readyState === WebSocket.CONNECTING) {
      await opened
      return
    }
    if (!reconnecting) {
      reconnecting = (async () => {
        openSocket()
        await opened
      })().finally(() => {
        reconnecting = null
      })
    }
    await reconnecting
  }

  openSocket()

  const sendRaw = async (method, params = {}) => {
    await ensureOpen()
    const id = ++sequence
    return new Promise((resolve, reject) => {
      const methodTimeoutMs = Number.isFinite(params?.timeout)
        ? Math.max(Number(params.timeout) + 5_000, 30_000)
        : 30_000
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP ${method} timed out.`))
      }, methodTimeoutMs)
      pending.set(id, { resolve, reject, timeout })
      try {
        socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        clearTimeout(timeout)
        pending.delete(id)
        reject(error)
      }
    })
  }

  const enableRuntimeDomains = async () => {
    await sendRaw('Runtime.enable')
    await sendRaw('Page.enable')
  }

  return {
    async open() {
      await opened
    },
    async enableRuntimeDomains() {
      await enableRuntimeDomains()
    },
    async send(method, params = {}) {
      try {
        return await sendRaw(method, params)
      } catch (error) {
        if (!/CDP socket closed|WebSocket is not open|not opened|CLOSED/iu.test(error instanceof Error ? error.message : String(error))) {
          throw error
        }
        await ensureOpen()
        await enableRuntimeDomains()
        return sendRaw(method, params)
      }
    },
    close() {
      for (const { reject, timeout } of pending.values()) {
        clearTimeout(timeout)
        reject(new Error('CDP socket closed.'))
      }
      pending.clear()
      socket?.close()
    },
  }
}

async function openPageCdp(debugPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    const target = await waitForPageTarget(debugPort, Math.max(5_000, Math.min(timeoutMs, deadline - Date.now())))
    const cdp = connectCdp(target.webSocketDebuggerUrl)
    try {
      await cdp.open()
      await cdp.enableRuntimeDomains()
      return cdp
    } catch (error) {
      lastError = error
      cdp.close()
      await sleep(500)
    }
  }
  throw lastError ?? new Error('Timed out opening CDP page connection.')
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
  const homeReady = async () => evaluate(cdp, `(() => {
    if (document.getElementById('home-pack-select')) return true
    const bodyText = document.body.innerText
    return /SELECTED\\s+PACK/i.test(bodyText) && /Install|Play|Repair|Update|Unavailable/i.test(bodyText)
  })()`)
  if (await homeReady()) return
  await waitFor('Home navigation button or Home page', 30_000, async () => {
    if (await homeReady()) return true
    await clickVisibleButton(cdp, 'Home')
    return true
  })
  await waitFor('Home page', 30_000, homeReady)
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
    if (!data.report.ok) throw fatalError(`${pack.name} install report failed: ${data.report.message ?? data.report.error ?? data.reportPath}`)
    return data
  })
}

function classifyInstalledModuleSource(file, moduleEvidenceSourceIndex) {
  const direct = moduleEvidenceSourceIndex.artifactSourcesByUrl.get(file.url)
  if (direct) return direct
  const releaseTag = parseReleaseTagFromUrl(file.url)
  if (!releaseTag) return null
  return {
    moduleId: file.moduleId ?? null,
    releaseTag,
    releaseSourceState: releaseSourceStateForTag(releaseTag, moduleEvidenceSourceIndex.primaryReleaseTag),
    artifactRole: null,
    file: path.basename(String(file.url ?? '')),
  }
}

function summarizeInstalledModuleSources(files) {
  const counts = new Map()
  for (const file of files) {
    const key = `${file.releaseSourceState ?? 'unknown'}\u0000${file.releaseTag ?? 'unknown'}`
    const current = counts.get(key) ?? {
      releaseSourceState: file.releaseSourceState ?? 'unknown',
      releaseTag: file.releaseTag ?? 'unknown',
      fileCount: 0,
      moduleIds: new Set(),
    }
    current.fileCount += 1
    if (file.moduleId) current.moduleIds.add(file.moduleId)
    counts.set(key, current)
  }
  return [...counts.values()].map((entry) => ({
    releaseSourceState: entry.releaseSourceState,
    releaseTag: entry.releaseTag,
    fileCount: entry.fileCount,
    moduleCount: entry.moduleIds.size,
  }))
}

function assertInstalledModuleSourceEvidence(selectedPack, installed, moduleEvidenceSourceIndex) {
  assert(installed.fileCount > 0, `${selectedPack} installed manifest did not include any required files.`)
  assert(installed.moduleReleaseSources.length > 0, `${selectedPack} did not record module release-source evidence.`)
  const summarizedFiles = installed.moduleReleaseSources.reduce((total, source) => total + Number(source.fileCount ?? 0), 0)
  assert(summarizedFiles === installed.fileCount, `${selectedPack} module release-source counts cover ${summarizedFiles}/${installed.fileCount} installed files.`)

  if (!moduleEvidenceSourceIndex.primaryReleaseTag) return

  for (const file of installed.files) {
    assert(file.releaseTag, `${selectedPack} installed file has no module release tag: ${file.path}`)
    assert(file.releaseSourceState && file.releaseSourceState !== 'unknown', `${selectedPack} installed file has unknown release-source state: ${file.path}`)
  }
  for (const source of installed.moduleReleaseSources) {
    const expectedState = releaseSourceStateForTag(source.releaseTag, moduleEvidenceSourceIndex.primaryReleaseTag)
    assert(
      source.releaseSourceState === expectedState,
      `${selectedPack} module source ${source.releaseTag} was labeled ${source.releaseSourceState}, expected ${expectedState}.`,
    )
  }

  if (selectedPack.startsWith('ashfall-')) {
    const partialSources = installed.moduleReleaseSources.filter((source) => source.releaseSourceState === 'partial-hotfix-evidence')
    const fullSources = installed.moduleReleaseSources.filter((source) => source.releaseSourceState === 'full-release-evidence')
    const partialHotfixReleaseExists = moduleEvidenceSourceIndex.releaseTagDistribution
      .some((source) => source.releaseSourceState === 'partial-hotfix-evidence')
    if (partialHotfixReleaseExists) {
      assert(partialSources.length > 0, `${selectedPack} did not expose the Ashfall partial hotfix module source.`)
      assert(fullSources.length > 0, `${selectedPack} did not preserve the canonical full release module source alongside the partial hotfix.`)
    } else {
      assert(fullSources.length > 0, `${selectedPack} did not expose the canonical full release module source.`)
      assert(partialSources.length === 0, `${selectedPack} unexpectedly exposed a partial hotfix module source.`)
    }
  }
}

async function hashInstalledManifest(installPath, selectedPack, moduleEvidenceSourceIndex) {
  const manifestPath = path.join(installPath, '.echo', 'installed-manifest.json')
  assert(await exists(manifestPath), `Installed manifest missing: ${manifestPath}`)
  const manifest = await readJson(manifestPath)
  assert(manifest.pack === selectedPack, `Installed manifest pack is ${manifest.pack}, expected ${selectedPack}.`)
  const expectedFolder = selectedPack.endsWith('-native-edition') ? 'addons/' : 'mods/'
  if (selectedPack.endsWith('-native-edition')) {
    const minecraftVersion = manifest.minecraftVersion ?? manifest.minecraft ?? manifest.runtime?.minecraftVersion ?? manifest.nativeLoader?.versionJson?.inheritsFrom
    assert(minecraftVersion === '26.1.2', `${selectedPack} Native manifest Minecraft identity is ${minecraftVersion ?? 'missing'}, expected 26.1.2.`)
    assert(manifest.nativeLoader?.versionJson?.inheritsFrom === '26.1.2', `${selectedPack} Native Loader inheritsFrom is ${manifest.nativeLoader?.versionJson?.inheritsFrom ?? 'missing'}, expected 26.1.2.`)
    const nativeLoaderUrl = manifest.nativeLoader?.versionJson?.libraries?.[0]?.downloads?.artifact?.url
    assert(String(nativeLoaderUrl ?? '').startsWith('https://'), `${selectedPack} Native Loader library is missing an HTTPS artifact URL.`)
  } else if (selectedPack.endsWith('-neoforge-edition')) {
    const minecraftVersion = manifest.minecraftVersion ?? manifest.minecraft ?? manifest.runtime?.minecraftVersion ?? manifest.loader?.versionJson?.inheritsFrom
    assert(minecraftVersion === '26.1.2', `${selectedPack} NeoForge manifest Minecraft identity is ${minecraftVersion ?? 'missing'}, expected 26.1.2.`)
    assert(manifest.loader?.versionJson?.inheritsFrom === '26.1.2', `${selectedPack} NeoForge inheritsFrom is ${manifest.loader?.versionJson?.inheritsFrom ?? 'missing'}, expected 26.1.2.`)
  } else if (selectedPack.endsWith('-standalone-edition')) {
    assert(!manifest.minecraftVersion, `${selectedPack} Standalone manifest must not carry Minecraft version ${manifest.minecraftVersion}.`)
    assert(manifest.loader === 'echo-standalone-runtime', `${selectedPack} Standalone manifest loader is ${JSON.stringify(manifest.loader)}, expected echo-standalone-runtime.`)
  }

  const files = []
  for (const file of manifest.files ?? []) {
    if (file.required === false) continue
    const relativePath = String(file.path ?? '').replace(/\\/g, '/')
    assert(relativePath.startsWith(expectedFolder), `${selectedPack} installed file is in the wrong lane folder: ${relativePath}`)
    assert(!String(file.url ?? '').startsWith('file:'), `${selectedPack} manifest file uses unsupported file:// URL: ${relativePath}`)
    const absolutePath = path.join(installPath, relativePath)
    assert(await exists(absolutePath), `Installed file missing: ${relativePath}`)
    const actualSha256 = await sha256File(absolutePath)
    assert(actualSha256 === String(file.sha256).toLowerCase(), `Installed file corrupt: ${relativePath}`)
    const stat = await fs.stat(absolutePath)
    const moduleSource = classifyInstalledModuleSource(file, moduleEvidenceSourceIndex)
    if (selectedPack.endsWith('-neoforge-edition') && relativePath.endsWith('.jar')) {
      const jar = new AdmZip(absolutePath)
      const tomlEntry = jar.getEntry('META-INF/neoforge.mods.toml')
      assert(tomlEntry, `${selectedPack} NeoForge jar is missing META-INF/neoforge.mods.toml: ${relativePath}`)
      const toml = tomlEntry.getData().toString('utf8')
      assert(!toml.includes('${'), `${selectedPack} NeoForge jar still contains an unresolved template placeholder: ${relativePath}`)
      assert(hasEchoMinecraftDependencyRange(toml), `${selectedPack} NeoForge jar does not declare the ECHO Minecraft 26.1.2 runtime range: ${relativePath}`)
    }
    files.push({
      path: relativePath,
      moduleId: file.moduleId ?? moduleSource?.moduleId ?? null,
      sha256: actualSha256,
      size: stat.size,
      releaseTag: moduleSource?.releaseTag ?? null,
      releaseSourceState: moduleSource?.releaseSourceState ?? null,
    })
  }
  return {
    manifestPath,
    manifestPack: manifest.pack,
    manifestVersion: manifest.version,
    fileCount: files.length,
    moduleReleaseSources: summarizeInstalledModuleSources(files),
    files,
  }
}

async function corruptInstalledFileForHandoffRepair(installPath, pack, installed) {
  if (runtimeModeForPack(pack) === 'native-runtime') {
    return {
      skipped: true,
      reason: 'Standalone runtime launch repair is not exercised by Minecraft handoff preparation.',
    }
  }
  const target = installed.files.find((file) => file.path && file.sha256)
  assert(target, `${pack.name} has no installed file available for handoff repair corruption.`)
  const absolutePath = path.join(installPath, target.path)
  const beforeSha256 = await sha256File(absolutePath)
  assert(beforeSha256 === target.sha256, `${pack.name} repair fixture target was not valid before corruption: ${target.path}`)
  await fs.writeFile(absolutePath, Buffer.from(`corrupted by all-modpacks handoff repair fixture for ${pack.profileId}\n`, 'utf8'))
  const corruptSha256 = await sha256File(absolutePath)
  assert(corruptSha256 !== target.sha256, `${pack.name} repair fixture did not alter ${target.path}`)
  return {
    skipped: false,
    path: target.path,
    expectedSha256: target.sha256,
    corruptSha256,
  }
}

function runtimeModeForPack(pack) {
  if (pack.profileId.endsWith('-standalone-edition')) return 'native-runtime'
  if (pack.profileId.endsWith('-native-edition')) return 'native-loader-minecraft'
  return 'neoforge-minecraft'
}

async function readLauncherProfile(minecraftRoot, profileId) {
  const launcherProfilesPath = path.join(minecraftRoot, 'launcher_profiles.json')
  const document = await readJson(launcherProfilesPath)
  return {
    launcherProfilesPath,
    profile: document.profiles?.[profileId] ?? null,
  }
}

async function seedStaleNeoForgeBootstrapMetadata(cdp, pack, installPath, minecraftRoot, timeoutMs) {
  const manifest = await readJson(path.join(installPath, '.echo', 'installed-manifest.json'))
  const versionId = String(manifest.loader?.minecraftLauncherVersionId ?? (manifest.loader?.version ? `neoforge-${manifest.loader.version}` : '')).trim()
  if (!versionId.startsWith('neoforge-')) return null
  const versionMetadataPath = path.join(minecraftRoot, 'versions', versionId, `${versionId}.json`)
  await writeJson(versionMetadataPath, {
    id: versionId,
    inheritsFrom: manifest.minecraftVersion ?? manifest.minecraft ?? manifest.loader?.versionJson?.inheritsFrom,
    echoLauncher: {
      managedBy: 'ECHO Launcher',
      bootstrap: true,
      pack: pack.profileId,
      seededBy: 'all-modpacks-electron-install-smoke',
    },
  })
  const packState = await evaluate(cdp, `window.echoNative.invoke('app:get-pack-state', { profileId: ${JSON.stringify(pack.profileId)} })`, { timeoutMs })
  assert(packState?.profile?.id === pack.profileId, `${pack.name} stale NeoForge metadata pack-state profile mismatch.`)
  assert(packState?.minecraftLauncher?.ok === true, `${pack.name} stale bootstrap-only NeoForge metadata was not treated as repairable: ${JSON.stringify(packState?.minecraftLauncher?.warnings ?? packState?.minecraftLauncher)}`)
  assert(packState?.primaryAction?.kind === 'play', `${pack.name} stale bootstrap-only NeoForge metadata changed primary action to ${packState?.primaryAction?.kind ?? 'missing'}.`)
  return {
    versionId,
    versionMetadataPath,
    primaryAction: packState.primaryAction,
    warnings: packState.minecraftLauncher?.warnings ?? [],
  }
}

async function verifyLaunchRoute(cdp, pack, installPath, minecraftRoot, timeoutMs, options = {}) {
  const runtimeMode = runtimeModeForPack(pack)
  if (runtimeMode === 'native-runtime') {
    const state = await evaluate(cdp, `window.echoNative.invoke('standalone-runtime:get-state', { profileId: ${JSON.stringify(pack.profileId)} })`, { timeoutMs })
    assert(state?.ok === true, `${pack.name} standalone runtime is not ready: ${(state?.warnings ?? []).join(' ') || state?.runtimeRoot || 'unknown reason'}`)
    assert(state?.runtimeRoot, `${pack.name} standalone runtime did not report runtimeRoot.`)
    assert(state?.executablePath, `${pack.name} standalone runtime did not report executablePath.`)
    assert(await exists(state.executablePath), `${pack.name} standalone runtime executable is missing: ${state.executablePath}`)
    return {
      kind: 'standalone-runtime',
      ok: true,
      runtimeRoot: state.runtimeRoot,
      executablePath: state.executablePath,
      version: state.version ?? null,
      warnings: state.warnings ?? [],
    }
  }

  const staleNeoForgeMetadata = runtimeMode === 'neoforge-minecraft' && options.expectRepair !== true
    ? await seedStaleNeoForgeBootstrapMetadata(cdp, pack, installPath, minecraftRoot, timeoutMs)
    : null
  const handoff = await evaluate(cdp, `window.echoNative.invoke('launch:prepare-handoff', {
    profileId: ${JSON.stringify(pack.profileId)},
    installPath: ${JSON.stringify(installPath)},
    updatePolicy: 'skip',
    runtimeMode: ${JSON.stringify(runtimeMode)},
    prepareOnly: true
  })`, { timeoutMs })
  assert(handoff?.ok === true, `${pack.name} Minecraft Launcher handoff failed: ${handoff?.message ?? JSON.stringify(handoff)}`)
  assert(handoff.profileId === pack.profileId, `${pack.name} handoff profile mismatch: ${handoff.profileId}`)
  assert(handoff.handoff?.ok === true, `${pack.name} nested handoff failed: ${handoff.handoff?.message ?? JSON.stringify(handoff.handoff)}`)
  assert(handoff.handoff?.profileCurrent === true, `${pack.name} Minecraft Launcher profile is not current.`)
  assert(handoff.handoff?.versionReady === true, `${pack.name} Minecraft Launcher version metadata is not ready.`)
  assert(handoff.handoff?.prepareOnly === true, `${pack.name} handoff did not preserve prepareOnly=true.`)
  assert(handoff.handoff?.openedLauncher === false, `${pack.name} prepare-only handoff unexpectedly opened Minecraft Launcher.`)
  assert((handoff.handoff?.validatedModsCount ?? 0) > 0, `${pack.name} handoff did not validate any installed module/addon files.`)
  assert(await exists(handoff.handoff.launcherProfilesPath), `${pack.name} launcher profile file was not written: ${handoff.handoff.launcherProfilesPath}`)
  assert(await exists(handoff.handoff.versionMetadataPath), `${pack.name} version metadata was not written: ${handoff.handoff.versionMetadataPath}`)

  const saved = await readLauncherProfile(minecraftRoot, handoff.handoff.profileId)
  assert(saved.profile?.echoManaged === true, `${pack.name} prepared Minecraft profile is not marked echoManaged.`)
  assert(saved.profile?.echoLauncher?.profileId === pack.profileId, `${pack.name} prepared Minecraft profile echo id mismatch: ${saved.profile?.echoLauncher?.profileId}`)
  assert(saved.profile?.echoLauncher?.runtimeMode === runtimeMode, `${pack.name} prepared Minecraft profile runtime mismatch: ${saved.profile?.echoLauncher?.runtimeMode}`)
  assert(saved.profile?.gameDir === installPath, `${pack.name} prepared Minecraft profile gameDir mismatch: ${saved.profile?.gameDir}`)
  assert(saved.profile?.lastVersionId === handoff.handoff.versionId, `${pack.name} prepared Minecraft profile version mismatch: ${saved.profile?.lastVersionId}`)
  const versionMetadata = await readJson(handoff.handoff.versionMetadataPath)
  assert(versionMetadata?.echoLauncher?.bootstrap !== true, `${pack.name} handoff left bootstrap-only version metadata in place.`)
  if (options.expectRepair === true) {
    const repairReport = handoff.repair ?? (
      ((handoff.install?.before?.missing?.length ?? 0) > 0 || (handoff.install?.before?.corrupt?.length ?? 0) > 0)
        ? handoff.install
        : null
    )
    assert(repairReport?.ok === true, `${pack.name} handoff did not return a successful repair report.`)
    assert((repairReport.before?.missing?.length ?? 0) > 0 || (repairReport.before?.corrupt?.length ?? 0) > 0, `${pack.name} handoff repair report did not capture the corrupt pre-repair state.`)
    assert((repairReport.after?.missing?.length ?? 1) === 0, `${pack.name} handoff repair still has missing files.`)
    assert((repairReport.after?.corrupt?.length ?? 1) === 0, `${pack.name} handoff repair still has corrupt files.`)
    assert((repairReport.installed?.length ?? 0) > 0 || (repairReport.updated?.length ?? 0) > 0 || (repairReport.verified?.length ?? 0) > 0, `${pack.name} handoff repair report did not record install/update/verify activity.`)
    assert((handoff.verification?.missing?.length ?? 1) === 0, `${pack.name} final handoff verification still has missing files.`)
    assert((handoff.verification?.corrupt?.length ?? 1) === 0, `${pack.name} final handoff verification still has corrupt files.`)
  }
  const nativeRuntime = runtimeMode === 'native-loader-minecraft'
    ? await verifyNativeLoaderRuntimeHandoff(pack, installPath, versionMetadata, handoff.handoff.minecraftRoot ?? minecraftRoot)
    : null

  return {
    kind: 'minecraft-launcher-handoff',
    ok: true,
    runtimeMode,
    profileId: handoff.handoff.profileId,
    profileName: handoff.handoff.profileName,
    versionId: handoff.handoff.versionId,
    versionSource: handoff.handoff.versionSource,
    versionMetadataPath: handoff.handoff.versionMetadataPath,
    launcherProfilesPath: handoff.handoff.launcherProfilesPath,
    gameDir: handoff.handoff.gameDir,
    validatedModsCount: handoff.handoff.validatedModsCount,
    repair: options.expectRepair === true
      ? {
          ok: (handoff.repair ?? handoff.install)?.ok === true,
          repaired: ((handoff.repair ?? handoff.install)?.installed?.length ?? 0) + ((handoff.repair ?? handoff.install)?.updated?.length ?? 0),
          verifiedAfterRepair: (handoff.repair ?? handoff.install)?.after?.valid?.length ?? null,
          reportPath: (handoff.repair ?? handoff.install)?.reportPath ?? null,
        }
      : null,
    nativeRuntime,
    staleNeoForgeMetadata,
    warnings: handoff.handoff.warnings ?? [],
  }
}

async function verifyNativeLoaderRuntimeHandoff(pack, installPath, versionMetadata, minecraftRoot) {
  const manifest = await readJson(path.join(installPath, '.echo', 'installed-manifest.json'))
  const jvm = Array.isArray(versionMetadata.arguments?.jvm) ? versionMetadata.arguments.jvm.map(String) : []
  const game = Array.isArray(versionMetadata.arguments?.game) ? versionMetadata.arguments.game.map(String) : []
  const expectedModules = new Set([
    ...(Array.isArray(manifest.modules) ? manifest.modules.map(String) : []),
    ...(manifest.files ?? [])
      .filter((file) => file?.required !== false)
      .filter((file) => /^addons\/.+\.echo-addon$/iu.test(String(file.path ?? '').replace(/\\/g, '/')))
      .map((file) => String(file.moduleId ?? '').trim())
      .filter(Boolean),
  ])
  const classpathArg = jvm.find((arg) => arg.startsWith('-Decho.native.moduleClasspath='))
  const classpathFileArg = jvm.find((arg) => arg.startsWith('-Decho.native.moduleClasspathFile='))
  const markerIndex = game.indexOf('--echo-marker')
  const handoffFileIndex = game.indexOf('--echo-handoff-file')
  const packIndex = game.indexOf('--echo-pack-id')
  const realMainIndex = game.indexOf('--echo-real-main')
  assert(versionMetadata.mainClass === 'com.echo.NativeLoaderClient', `${pack.name} Native Loader mainClass is ${versionMetadata.mainClass ?? 'missing'}, expected com.echo.NativeLoaderClient.`)
  const nativeLoaderLibrary = versionMetadata.libraries?.find((library) => /^com\.echo:native-loader:\d+\.\d+\.\d+$/u.test(String(library?.name ?? '')))
  assert(nativeLoaderLibrary, `${pack.name} Native Loader library is missing or has an invalid coordinate.`)
  const packAddonLibraries = (versionMetadata.libraries ?? []).filter((library) => library?.echoLauncher?.packAddon === true)
  assert(
    packAddonLibraries.length === 0,
    `${pack.name} Native Loader metadata still exposes ${packAddonLibraries.length} addon libraries to Minecraft Launcher; addon jars must be loaded through the ECHO handoff file.`,
  )
  assert(
    (versionMetadata.libraries ?? []).length <= 8,
    `${pack.name} Native Loader metadata exposes too many direct launcher libraries (${versionMetadata.libraries.length}); this can exceed Windows process launch limits.`,
  )
  const nativeLoaderArtifact = nativeLoaderLibrary.downloads?.artifact
  assert(nativeLoaderArtifact?.path, `${pack.name} Native Loader library is missing artifact path metadata.`)
  const nativeLoaderLibraryPath = path.join(minecraftRoot, 'libraries', String(nativeLoaderArtifact.path).replace(/\\/g, '/'))
  assert(await exists(nativeLoaderLibraryPath), `${pack.name} Native Loader library was not preinstalled into Minecraft libraries: ${nativeLoaderLibraryPath}`)
  const nativeLoaderStats = await fs.stat(nativeLoaderLibraryPath)
  assert(nativeLoaderStats.isFile() && nativeLoaderStats.size === Number(nativeLoaderArtifact.size), `${pack.name} Native Loader library size mismatch at ${nativeLoaderLibraryPath}`)
  const nativeLoaderSha1 = await sha1File(nativeLoaderLibraryPath)
  assert(nativeLoaderSha1.toLowerCase() === String(nativeLoaderArtifact.sha1).toLowerCase(), `${pack.name} Native Loader library SHA-1 mismatch at ${nativeLoaderLibraryPath}`)
  assert(
    jvm.includes('-Decho.native.minecraftMainClass=dev.echo.nativeplatform.bootstrap.EchoNativeBootstrapMain'),
    `${pack.name} Native Loader JVM args do not target EchoNativeBootstrapMain.`,
  )
  assert(
    jvm.includes('-Decho.native.bootstrap.authorizedHandoff=startNativeClient'),
    `${pack.name} Native Loader JVM args are missing authorized handoff.`,
  )
  assert(jvm.includes(`-Decho.native.gameDir=${installPath}`), `${pack.name} Native Loader JVM args are missing the install gameDir.`)
  assert(!classpathArg, `${pack.name} Native Loader JVM args still use the long inline echo.native.moduleClasspath.`)
  assert(classpathFileArg, `${pack.name} Native Loader JVM args are missing echo.native.moduleClasspathFile.`)
  const classpathFile = classpathFileArg.slice('-Decho.native.moduleClasspathFile='.length)
  assert(await exists(classpathFile), `${pack.name} Native Loader module classpath handoff file is missing: ${classpathFile}`)
  const handoffFile = handoffFileIndex >= 0 ? game[handoffFileIndex + 1] : ''
  assert(handoffFile && handoffFile === classpathFile, `${pack.name} Native Loader game args are missing the matching --echo-handoff-file.`)
  const handoff = await readJson(handoffFile)
  assert(handoff?.schema === 'echo.native.launcher_handoff.v1', `${pack.name} Native Loader handoff schema is missing or stale.`)
  assert(handoff.packId === pack.profileId, `${pack.name} Native Loader handoff pack id mismatch: ${handoff.packId}`)
  const classpathEntries = Array.isArray(handoff.classpathEntries) ? handoff.classpathEntries.map(String).filter(Boolean) : []
  assert(classpathEntries.length >= expectedModules.size, `${pack.name} Native Loader classpath has ${classpathEntries.length} entries for ${expectedModules.size} modules.`)
  for (const entryPath of classpathEntries) {
    assert(await exists(entryPath), `${pack.name} Native Loader classpath entry is missing: ${entryPath}`)
    const stat = await fs.stat(entryPath)
    assert(stat.isFile() && stat.size > 0, `${pack.name} Native Loader classpath entry is empty: ${entryPath}`)
  }
  assert(markerIndex >= 0 && game[markerIndex + 1]?.endsWith(path.join('.echo', 'native-loader', 'module-activation.json')), `${pack.name} Native Loader game args are missing the activation marker.`)
  assert(packIndex >= 0 && game[packIndex + 1] === pack.profileId, `${pack.name} Native Loader game args are missing --echo-pack-id ${pack.profileId}.`)
  assert(realMainIndex >= 0 && game[realMainIndex + 1] === 'net.minecraft.client.main.Main', `${pack.name} Native Loader game args are missing the real Minecraft main.`)
  assert(game.includes('--echo-handoff'), `${pack.name} Native Loader game args are missing --echo-handoff.`)
  assert(game.filter((arg) => arg === '--echo-module').length === 0, `${pack.name} Native Loader game args still use long per-module flags.`)
  assert(game.filter((arg) => arg === '--echo-native-entrypoint').length === 0, `${pack.name} Native Loader game args still use long per-entrypoint flags.`)
  assert(jvm.join(' ').length < 4096, `${pack.name} Native Loader JVM args are still too long for a safe Windows handoff: ${jvm.join(' ').length} chars.`)
  assert(game.join(' ').length < 2048, `${pack.name} Native Loader game args are still too long for a safe Windows handoff: ${game.join(' ').length} chars.`)
  const modules = new Set(Array.isArray(handoff.modules) ? handoff.modules.map(String) : [])
  const entrypoints = new Set(Object.keys(handoff.nativeEntrypoints ?? {}))
  for (const moduleId of expectedModules) {
    assert(modules.has(moduleId), `${pack.name} Native Loader handoff file is missing module ${moduleId}.`)
    assert(entrypoints.has(moduleId), `${pack.name} Native Loader handoff file is missing native entrypoint for ${moduleId}.`)
  }
  return {
    ok: true,
    moduleCount: expectedModules.size,
    classpathEntryCount: classpathEntries.length,
    launcherLibraryCount: versionMetadata.libraries?.length ?? 0,
    nativeLoaderLibraryPath,
    handoffFile,
    jvmArgCharCount: jvm.join(' ').length,
    gameArgCharCount: game.join(' ').length,
    markerPath: game[markerIndex + 1],
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

async function killWorkspaceLauncherProcesses(root) {
  if (process.platform !== 'win32') return
  await new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `
$root = [System.IO.Path]::GetFullPath($env:ECHO_SMOKE_LAUNCHER_ROOT)
Get-Process -Name ECHOLauncher -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and [System.IO.Path]::GetFullPath($_.Path).StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) } |
  Stop-Process -Force
`,
      ],
      {
        env: { ...process.env, ECHO_SMOKE_LAUNCHER_ROOT: path.resolve(root) },
        windowsHide: true,
      },
      () => resolve(),
    )
  })
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
  const channelUrl = await buildLocalReleaseIndexChannel(args, args.workRoot)

  const userDataDir = path.join(args.workRoot, 'user-data')
  const playerContentRoot = path.join(args.workRoot, 'player-content')
  const minecraftRoot = path.join(args.workRoot, 'minecraft-root')
  const logsDir = path.join(userDataDir, 'ECHO', 'launcher-logs')
  const settingsPath = path.join(userDataDir, 'ECHO', 'settings.json')
  await fs.mkdir(userDataDir, { recursive: true })
  await fs.mkdir(playerContentRoot, { recursive: true })
  await fs.mkdir(minecraftRoot, { recursive: true })
  const moduleEvidenceSourceIndex = await loadModuleEvidenceSourceIndex({
    releaseIndexRoot: args.releaseIndexRoot,
    channelUrl,
  })
  await writeJson(settingsPath, {
    releaseIndex: {
      enabled: true,
      channelUrl,
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
      ECHO_RELEASE_INDEX_ALLOW_LOCAL_URLS: '1',
      ECHO_STANDALONE_RUNTIME_ROOT: args.standaloneRuntimeRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
  })
  child.stdout.on('data', (chunk) => stdout.push(String(chunk)))
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)))
  let childExit = null
  const childExitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      childExit = { code, signal }
      resolve(childExit)
    })
  })
  const guardElectron = (description, promise) => Promise.race([
    promise,
    childExitPromise.then((exit) => {
      throw new Error(
        `Packaged launcher exited during ${description} (code ${exit.code ?? 'null'}, signal ${exit.signal ?? 'null'}).`,
      )
    }),
  ])

  const report = {
    ok: false,
    phase: 'created',
    generatedAt: new Date().toISOString(),
    channelUrl,
    releaseIndexRoot: args.releaseIndexRoot,
    standaloneRuntimeRoot: args.standaloneRuntimeRoot,
    executable: args.exe,
    workRoot: args.workRoot,
    userDataDir,
    playerContentRoot,
    minecraftRoot,
    moduleEvidenceSources: {
      primaryReleaseTag: moduleEvidenceSourceIndex.primaryReleaseTag || null,
      releaseTagDistribution: moduleEvidenceSourceIndex.releaseTagDistribution,
    },
    expectedPackCount: selected.length,
    expectedPacks: selected.map((pack) => pack.profileId),
    packs: [],
    failures: [],
    stdout: [],
    stderr: [],
  }
  await writeJson(args.out, report)

  let cdp = null
  try {
    report.phase = 'waiting-debug-target'
    await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
    await guardElectron('debug target bootstrap', waitForPageTarget(debugPort, args.timeoutMs))
    report.phase = 'opening-cdp'
    await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
    cdp = await guardElectron('CDP open', openPageCdp(debugPort, args.timeoutMs))

    report.phase = 'waiting-renderer'
    await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
    await guardElectron('renderer mount', waitFor('Renderer mount', args.timeoutMs, async () => evaluate(cdp, `(() => {
      const root = document.getElementById('root')
      return Boolean(root && root.childElementCount > 0 && !document.querySelector('[data-echo-startup-recovery]'))
    })()`)))
    report.phase = 'waiting-native-bridge'
    await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
    await guardElectron('native bridge bootstrap', waitFor('Native bridge bootstrap', args.timeoutMs, async () => evaluate(cdp, `Boolean(window.echoNative?.invoke)`)))
    report.phase = 'waiting-release-index'
    await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
    await guardElectron('release index bootstrap', waitFor('Release Index bootstrap', args.timeoutMs, async () => evaluate(cdp, `window.echoNative.invoke('app:get-bootstrap-state').then((state) => (state.releaseIndex?.acceptedCount ?? state.releaseIndex?.releases?.length ?? 0) >= 15)`)))

    for (const pack of selected) {
      report.phase = `pack:${pack.profileId}`
      await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
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
        const packState = await guardElectron(`${pack.name} pack state`, waitFor(`${pack.name} pack state`, args.packTimeoutMs, async () => {
          const state = await evaluate(cdp, `window.echoNative.invoke('app:get-pack-state', { profileId: ${JSON.stringify(pack.profileId)} })`)
          return state?.profile?.id === pack.profileId && state?.primaryAction ? state : null
        }))
        packResult.packStateBefore = {
          catalog: packState.catalog,
          route: packState.route,
          primaryAction: packState.primaryAction,
          blockers: packState.blockers,
        }

        const action = await guardElectron(`${pack.name} visible install action`, waitFor(`${pack.name} visible install action`, args.packTimeoutMs, async () => {
          const candidate = await visiblePrimaryInstallAction(cdp, pack)
          if (candidate.unavailable) {
            throw new Error(`${pack.name} is unavailable in UI: ${JSON.stringify(candidate.unavailable)}`)
          }
          if (!candidate.ok) return null
          return candidate
        }))
        packResult.visibleInstallAction = action.install

        const installStartedAt = Date.now() - 1000
        const click = await clickVisibleButton(cdp, `Install ${pack.name}`)
        packResult.click = click
        cdp.close()
        cdp = null
        const installData = await guardElectron(`${pack.name} install report`, waitForInstallReport(logsDir, installStartedAt, pack, args.packTimeoutMs))
        const installPath = installData.report.installPath
        assert(installPath, `${pack.name} install report did not include installPath.`)
        const installed = await hashInstalledManifest(installPath, pack.profileId, moduleEvidenceSourceIndex)
        assertInstalledModuleSourceEvidence(pack.profileId, installed, moduleEvidenceSourceIndex)
        const repairFixture = args.repairHandoffFixture
          ? await corruptInstalledFileForHandoffRepair(installPath, pack, installed)
          : null
        const launchRoute = await guardElectron(
          `${pack.name} launch route`,
          (async () => {
            cdp = await openPageCdp(debugPort, args.timeoutMs)
            return verifyLaunchRoute(cdp, pack, installPath, minecraftRoot, args.packTimeoutMs, {
              expectRepair: Boolean(repairFixture && repairFixture.skipped !== true),
            })
          })(),
        )
        if (repairFixture && repairFixture.skipped !== true) {
          const repairedSha256 = await sha256File(path.join(installPath, repairFixture.path))
          assert(repairedSha256 === repairFixture.expectedSha256, `${pack.name} handoff repair did not restore ${repairFixture.path}`)
          repairFixture.repairedSha256 = repairedSha256
        }
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
          moduleReleaseSources: installed.moduleReleaseSources,
          repairFixture,
          launchRoute,
        })
        console.log(`${pack.name}: installed ${installed.fileCount} file(s); module sources ${installed.moduleReleaseSources.map((source) => `${source.fileCount} ${source.releaseSourceState} from ${source.releaseTag}`).join(', ')}`)
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

    report.ok = report.failures.length === 0 && report.packs.length === selected.length && report.packs.every((pack) => pack.ok)
    report.phase = 'completed'
    report.completedAt = new Date().toISOString()
    await writeJson(args.out, { ...report, stdout: trimLines(stdout), stderr: trimLines(stderr) })
    assert(report.packs.length === selected.length, `Real Electron install smoke completed ${report.packs.length}/${selected.length} selected pack(s).`)
    assert(report.ok, 'One or more official packs failed the real Electron install smoke.')
    assert(!childExit, `Packaged launcher exited before smoke completion (code ${childExit?.code ?? 'null'}, signal ${childExit?.signal ?? 'null'}).`)
    console.log(`All modpacks Electron install smoke passed: ${args.out}`)
  } finally {
    if (cdp) cdp.close()
    if (!args.keepOpen) await killProcessTree(child)
    if (!args.keepOpen) await killWorkspaceLauncherProcesses(process.cwd())
  }
}

run().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
