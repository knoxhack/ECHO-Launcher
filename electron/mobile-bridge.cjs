const crypto = require('node:crypto')
const os = require('node:os')

const DEFAULT_MOBILE_BRIDGE_PORT = 4177
const PAIRING_SESSION_MS = 10 * 60 * 1000
const DEVICE_ROLES = ['VIEWER', 'PLAYER', 'DEVELOPER', 'ADMIN']
const ROLE_RANK = {
  VIEWER: 0,
  PLAYER: 1,
  DEVELOPER: 2,
  ADMIN: 3,
}

function isoNow(now = Date.now()) {
  return new Date(now).toISOString()
}

function normalizeRole(role, fallback = 'PLAYER') {
  const normalized = String(role ?? fallback).trim().toUpperCase()
  return DEVICE_ROLES.includes(normalized) ? normalized : fallback
}

function sanitizeDeviceName(input) {
  const value = String(input ?? '').replace(/\s+/g, ' ').trim()
  return value.slice(0, 80) || 'ECHO Command Center Android'
}

function normalizePort(input) {
  const port = Number(input)
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_MOBILE_BRIDGE_PORT
}

function getLanAddress(networkInterfaces = os.networkInterfaces()) {
  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      if (entry && entry.family === 'IPv4' && !entry.internal) return entry.address
    }
  }
  return '127.0.0.1'
}

function buildBridgeApiUrl(host = getLanAddress(), port = DEFAULT_MOBILE_BRIDGE_PORT) {
  return `http://${host}:${normalizePort(port)}/api/`
}

function buildPairingPayload(code, bridgeUrl) {
  return `echo://pair?code=${encodeURIComponent(code)}&bridge=${encodeURIComponent(bridgeUrl)}`
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex')
}

function createDeviceToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function createPairingCode() {
  const left = crypto.randomInt(1000, 10000)
  const right = crypto.randomInt(1000, 10000)
  return `ECHO-${left}-${right}`
}

function normalizePendingDevice(input) {
  return {
    requestId: String(input?.requestId ?? crypto.randomUUID()),
    deviceName: sanitizeDeviceName(input?.deviceName),
    requestedRole: normalizeRole(input?.requestedRole),
    role: normalizeRole(input?.role ?? input?.requestedRole),
    requestedAt: String(input?.requestedAt ?? isoNow()),
    lastSeenAt: String(input?.lastSeenAt ?? input?.requestedAt ?? isoNow()),
    status: input?.status === 'approved' ? 'approved' : 'pending',
  }
}

function normalizePairedDevice(input) {
  return {
    deviceId: String(input?.deviceId ?? crypto.randomUUID()),
    deviceName: sanitizeDeviceName(input?.deviceName),
    role: normalizeRole(input?.role),
    approvedAt: String(input?.approvedAt ?? isoNow()),
    lastSeenAt: String(input?.lastSeenAt ?? input?.approvedAt ?? isoNow()),
    tokenHash: String(input?.tokenHash ?? ''),
  }
}

function normalizeActivePairing(input, port, host, now = Date.now()) {
  if (!input?.code || Date.parse(input.expiresAt ?? '') <= now) return null
  const bridgeUrl = String(input.bridgeUrl ?? buildBridgeApiUrl(host, port))
  return {
    code: String(input.code),
    bridgeUrl,
    pairingPayload: buildPairingPayload(String(input.code), bridgeUrl),
    createdAt: String(input.createdAt ?? isoNow(now)),
    expiresAt: String(input.expiresAt),
    pendingDevices: Array.isArray(input.pendingDevices) ? input.pendingDevices.map(normalizePendingDevice) : [],
  }
}

function normalizeMobileBridgeSettings(input = {}, options = {}) {
  const now = options.now ?? Date.now()
  const port = normalizePort(input.port)
  const host = options.host ?? getLanAddress()
  return {
    enabled: input.enabled !== false,
    port,
    pairedDevices: Array.isArray(input.pairedDevices)
      ? input.pairedDevices.map(normalizePairedDevice).filter((device) => device.tokenHash)
      : [],
    activePairing: normalizeActivePairing(input.activePairing, port, host, now),
  }
}

function createPairingSession(settings = {}, options = {}) {
  const now = options.now ?? Date.now()
  const host = options.host ?? getLanAddress()
  const normalized = normalizeMobileBridgeSettings(settings, { host, now })
  const code = options.code ?? createPairingCode()
  const bridgeUrl = buildBridgeApiUrl(host, normalized.port)
  const activePairing = {
    code,
    bridgeUrl,
    pairingPayload: buildPairingPayload(code, bridgeUrl),
    createdAt: isoNow(now),
    expiresAt: isoNow(now + PAIRING_SESSION_MS),
    pendingDevices: [],
  }
  return {
    ...normalized,
    activePairing,
  }
}

function pairingExpired(activePairing, now = Date.now()) {
  return !activePairing?.code || Date.parse(activePairing.expiresAt ?? '') <= now
}

function samePairingDevice(device, body) {
  return device.deviceName.toLowerCase() === sanitizeDeviceName(body.deviceName).toLowerCase()
}

function requestPairing(settings, body = {}, options = {}) {
  const now = options.now ?? Date.now()
  const normalized = normalizeMobileBridgeSettings(settings, options)
  if (pairingExpired(normalized.activePairing, now)) {
    return { settings: normalized, status: 'expired', message: 'Pairing code expired. Generate a new QR in ECHO Launcher.' }
  }
  if (String(body.pairingCode ?? '').trim() !== normalized.activePairing.code) {
    return { settings: normalized, status: 'invalid', message: 'Pairing code is not valid.' }
  }

  const requested = {
    deviceName: sanitizeDeviceName(body.deviceName),
    requestedRole: normalizeRole(body.requestedRole),
  }
  const pendingDevices = [...normalized.activePairing.pendingDevices]
  const existingIndex = pendingDevices.findIndex((device) => samePairingDevice(device, requested))
  const existing = existingIndex >= 0 ? pendingDevices[existingIndex] : null

  if (existing?.status === 'approved') {
    const token = createDeviceToken()
    const pairedDevice = normalizePairedDevice({
      deviceName: existing.deviceName,
      role: existing.role,
      approvedAt: isoNow(now),
      lastSeenAt: isoNow(now),
      tokenHash: hashToken(token),
    })
    pendingDevices.splice(existingIndex, 1)
    return {
      settings: {
        ...normalized,
        pairedDevices: [...normalized.pairedDevices, pairedDevice],
        activePairing: {
          ...normalized.activePairing,
          pendingDevices,
        },
      },
      status: 'paired',
      message: 'Connected',
      token,
      device: publicPairedDevice(pairedDevice),
    }
  }

  const pendingDevice = normalizePendingDevice({
    ...(existing ?? {}),
    deviceName: requested.deviceName,
    requestedRole: requested.requestedRole,
    role: requested.requestedRole,
    requestedAt: existing?.requestedAt ?? isoNow(now),
    lastSeenAt: isoNow(now),
    status: 'pending',
  })
  if (existingIndex >= 0) pendingDevices[existingIndex] = pendingDevice
  else pendingDevices.push(pendingDevice)

  return {
    settings: {
      ...normalized,
      activePairing: {
        ...normalized.activePairing,
        pendingDevices,
      },
    },
    status: 'pending',
    message: 'Approve this device in ECHO Launcher',
    pendingDevice,
  }
}

function approvePendingDevice(settings, requestId, role, options = {}) {
  const normalized = normalizeMobileBridgeSettings(settings, options)
  if (!normalized.activePairing) return normalized
  return {
    ...normalized,
    activePairing: {
      ...normalized.activePairing,
      pendingDevices: normalized.activePairing.pendingDevices.map((device) =>
        device.requestId === requestId
          ? { ...device, role: normalizeRole(role ?? device.role), status: 'approved' }
          : device,
      ),
    },
  }
}

function denyPendingDevice(settings, requestId, options = {}) {
  const normalized = normalizeMobileBridgeSettings(settings, options)
  if (!normalized.activePairing) return normalized
  return {
    ...normalized,
    activePairing: {
      ...normalized.activePairing,
      pendingDevices: normalized.activePairing.pendingDevices.filter((device) => device.requestId !== requestId),
    },
  }
}

function revokePairedDevice(settings, deviceId, options = {}) {
  const normalized = normalizeMobileBridgeSettings(settings, options)
  return {
    ...normalized,
    pairedDevices: normalized.pairedDevices.filter((device) => device.deviceId !== deviceId),
  }
}

function publicPairedDevice(device) {
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    role: device.role,
    approvedAt: device.approvedAt,
    lastSeenAt: device.lastSeenAt,
  }
}

function publicMobileBridgeState(settings, options = {}) {
  const host = options.host ?? getLanAddress()
  const normalized = normalizeMobileBridgeSettings(settings, { ...options, host })
  const status = options.error ? 'error' : (options.running === false ? 'stopped' : 'running')
  return {
    enabled: normalized.enabled,
    port: normalized.port,
    status,
    lanAddress: host,
    bridgeUrl: buildBridgeApiUrl(host, normalized.port),
    error: options.error ? String(options.error) : null,
    activePairing: normalized.activePairing,
    pairedDevices: normalized.pairedDevices.map(publicPairedDevice),
  }
}

function buildMobileBridgeHealth(settings, options = {}) {
  const state = publicMobileBridgeState(settings, options)
  return {
    ok: state.enabled && state.status === 'running',
    status: state.status,
    bridgeUrl: state.bridgeUrl,
    lanAddress: state.lanAddress,
    port: state.port,
    pairingActive: Boolean(state.activePairing),
    pairedDeviceCount: state.pairedDevices.length,
    serverTime: isoNow(options.now ?? Date.now()),
    version: String(options.version ?? 'dev'),
  }
}

function authenticateDevice(settings, token, options = {}) {
  const normalized = normalizeMobileBridgeSettings(settings, options)
  const tokenHash = hashToken(token)
  const device = normalized.pairedDevices.find((item) => item.tokenHash === tokenHash)
  if (!device) return { settings: normalized, device: null }
  const updated = { ...device, lastSeenAt: isoNow(options.now ?? Date.now()) }
  return {
    settings: {
      ...normalized,
      pairedDevices: normalized.pairedDevices.map((item) => (item.deviceId === updated.deviceId ? updated : item)),
    },
    device: publicPairedDevice(updated),
  }
}

function canRunMobileAction(role, action) {
  const normalizedRole = normalizeRole(role, 'VIEWER')
  const mapped = mapMobileAction(action)
  if (!mapped) return false
  return ROLE_RANK[normalizedRole] >= mapped.requiredRank
}

function isRunningMobileOperation(operation, actionType) {
  return Boolean(
    operation &&
      (operation.phaseId === actionType || operation.mobileActionType === actionType) &&
      ['queued', 'running'].includes(String(operation.status ?? '')),
  )
}

function mapMobileAction(action) {
  const value = String(action ?? '').trim().toLowerCase()
  if (!value) return null
  if (value === 'launch ashfall' || value.startsWith('join ')) return { type: 'launch', requiredRank: ROLE_RANK.PLAYER }
  if (value === 'open minecraft launcher') return { type: 'open-minecraft-launcher', requiredRank: ROLE_RANK.PLAYER }
  if (value === 'update pack' || value === 'update ashfall' || value === 'update') return { type: 'update', requiredRank: ROLE_RANK.PLAYER }
  if (value === 'repair install' || value === 'repair ashfall' || value === 'repair') return { type: 'repair', requiredRank: ROLE_RANK.PLAYER }
  if (value === 'run packos check') return { type: 'packos-check', requiredRank: ROLE_RANK.PLAYER }
  if (value === 'verify install' || value === 'verify files' || value === 'scan install') return { type: 'verify', requiredRank: ROLE_RANK.PLAYER }
  if (value === 'view launcher logs' || value === 'view crash logs') return { type: 'logs', requiredRank: ROLE_RANK.DEVELOPER }
  if (value === 'export support bundle' || value === 'send logs to ai') return { type: 'support-bundle', requiredRank: ROLE_RANK.DEVELOPER }
  if (
    value === 'generate changelog' ||
    value === 'create release checklist' ||
    value === 'submit bug report' ||
    value === 'create bug report' ||
    value === 'generate next phase prompt' ||
    value === 'check module status' ||
    value === 'view build errors' ||
    value === 'open asset forge'
  ) return { type: 'dev-note', requiredRank: ROLE_RANK.DEVELOPER }
  if (
    value === 'open chat' ||
    value === 'send android chat message' ||
    value.startsWith('share ') ||
    value.startsWith('pin ') ||
    value.startsWith('ask community about ')
  ) return { type: 'refresh', requiredRank: ROLE_RANK.VIEWER }
  if (value === 'view latest news') return { type: 'news', requiredRank: ROLE_RANK.VIEWER }
  return null
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clampInt(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, Math.floor(number)))
}

function stringValue(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function titleCaseState(value, fallback = 'Unknown') {
  const text = stringValue(value, fallback)
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function humanModuleTitle(value) {
  const text = stringValue(value, 'Module')
    .replace(/^echo(?=[a-z])/i, 'echo-')
    .replace(/core$/i, '-core')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
  return titleCaseState(text)
    .replace(/\bEcho\b/g, 'ECHO')
    .replace(/\bOs\b/g, 'OS')
}

function formatByteSize(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
}

function moduleCategory(files) {
  const paths = files.map((file) => String(file?.path ?? '').replace(/\\/g, '/').toLowerCase())
  if (paths.some((item) => item.startsWith('mods/'))) return 'Mod'
  if (paths.some((item) => item.startsWith('config/'))) return 'Config'
  if (paths.some((item) => item.startsWith('resourcepacks/') || item.startsWith('shaderpacks/'))) return 'Resource'
  if (paths.some((item) => item.startsWith('datapacks/'))) return 'Datapack'
  return 'Module'
}

function buildMobileIndexEntries(manifest, installed = false) {
  if (!isRecord(manifest)) return []
  const moduleIds = Array.isArray(manifest.modules) ? manifest.modules.map((item) => stringValue(item)).filter(Boolean) : []
  const files = Array.isArray(manifest.files) ? manifest.files.filter(isRecord) : []
  const fileModuleIds = files.map((file) => stringValue(file.moduleId)).filter(Boolean)
  const ids = [...new Set([...moduleIds, ...fileModuleIds])].slice(0, 10)
  const loaderLabel = manifest.runtime?.requiredJava
    ? `Standalone Runtime ${manifest.runtime.requiredJava}`
    : manifest.loader?.type
      ? `${titleCaseState(manifest.loader.type)} ${stringValue(manifest.loader.version)}`
      : 'Pack metadata'
  return ids.map((id) => {
    const moduleFiles = files.filter((file) => stringValue(file.moduleId).toLowerCase() === id.toLowerCase())
    const required = moduleFiles.filter((file) => file.required !== false).length
    const optional = moduleFiles.filter((file) => file.required === false).length
    const sides = [...new Set(moduleFiles.map((file) => stringValue(file.side)).filter(Boolean))]
    const totalBytes = moduleFiles.reduce((sum, file) => sum + Math.max(0, Number(file.size ?? 0)), 0)
    const sizeLabel = formatByteSize(totalBytes)
    const fileLabel = moduleFiles.length
      ? `${moduleFiles.length} file${moduleFiles.length === 1 ? '' : 's'}${sizeLabel ? `, ${sizeLabel}` : ''}`
      : 'Manifest module'
    const requirementLabel = moduleFiles.length
      ? `${required} required${optional ? `, ${optional} optional` : ''}`
      : 'Listed module'
    return {
      id: `module-${id.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`,
      title: humanModuleTitle(id),
      category: moduleCategory(moduleFiles),
      addedBy: stringValue(manifest.name, 'Ashfall Manifest'),
      recipe: fileLabel,
      requiredMachine: loaderLabel,
      unlock: `${stringValue(manifest.version, 'Installed pack')} / Minecraft ${stringValue(manifest.minecraftVersion ?? manifest.minecraft, 'unknown')}`,
      status: installed ? `Available in installed pack (${requirementLabel})` : `Listed in latest manifest (${requirementLabel})`,
      installedInPack: Boolean(installed),
      tags: ['manifest', stringValue(manifest.pack, 'ashfall'), stringValue(manifest.channel, 'stable'), ...sides].filter(Boolean),
    }
  })
}

function buildMobileChatMessages(input, operation, serverStatus) {
  const now = new Date().toISOString()
  const messages = [
    {
      id: 'launcher-status',
      channelId: 'global',
      source: 'LAUNCHER',
      author: 'ECHO Launcher',
      body: operation.message || 'Mobile bridge is connected.',
      createdAt: now,
    },
  ]
  if (serverStatus) {
    const stale = Boolean(serverStatus.stale)
    const playersOnline = clampInt(serverStatus.playerCount, 0, 100000)
    const maxPlayers = clampInt(serverStatus.maxPlayers, 0, 100000)
    const playerPreview = Array.isArray(serverStatus.players) && serverStatus.players.length
      ? ` Players: ${serverStatus.players.slice(0, 5).join(', ')}${serverStatus.players.length > 5 ? ', ...' : ''}.`
      : ''
    messages.push({
      id: 'official-server-status',
      channelId: 'server-ashfall',
      source: 'SYSTEM',
      author: stringValue(serverStatus.serverName, input.officialServerName ?? 'Ashfall Official'),
      body: stale
        ? `Official server status is stale. Last known: ${serverStatus.online ? `${playersOnline}/${maxPlayers} players online.` : 'offline.'}${playerPreview}`
        : serverStatus.online
          ? `${playersOnline}/${maxPlayers} players online. ${stringValue(serverStatus.motd, 'Server is online.')}${playerPreview}`
          : 'Official server is currently offline.',
      createdAt: stringValue(serverStatus.lastUpdated, now),
    })
    for (const [index, event] of (Array.isArray(serverStatus.recentEvents) ? serverStatus.recentEvents : []).slice(0, 3).entries()) {
      messages.push({
        id: `official-server-event-${index}`,
        channelId: 'server-ashfall',
        source: 'SYSTEM',
        author: stringValue(event.player, 'Ashfall Server'),
        body: stringValue(event.message, titleCaseState(event.type, 'Server event')),
        createdAt: stringValue(event.createdAt, now),
      })
    }
  }
  if (input.logsSummary?.latestName) {
    const logCount = clampInt(input.logsSummary.fileCount, 0, 100000)
    const latestLogSize = formatByteSize(input.logsSummary.latestSize)
    messages.push({
      id: 'launcher-log-summary',
      channelId: 'support',
      source: 'SYSTEM',
      author: 'Launcher Logs',
      body: `Latest log: ${input.logsSummary.latestName}${latestLogSize ? ` (${latestLogSize})` : ''}. ${logCount} log file${logCount === 1 ? '' : 's'} available.`,
      createdAt: stringValue(input.logsSummary.latestModifiedAt, now),
    })
  }
  if (input.supportBundle?.available) {
    const latestBundle = stringValue(input.supportBundle.latestName)
    const bundleCount = clampInt(input.supportBundle.bundleCount, 0, 100000)
    const bundleSize = formatByteSize(input.supportBundle.latestSize)
    const logFileCount = clampInt(input.supportBundle.fileCount, 0, 100000)
    messages.push({
      id: 'support-bundle-summary',
      channelId: 'support',
      source: 'SYSTEM',
      author: 'Support Bundle',
      body: latestBundle
        ? `Latest support bundle: ${latestBundle}${bundleSize ? ` (${bundleSize})` : ''}. ${bundleCount} bundle${bundleCount === 1 ? '' : 's'}, ${logFileCount} log files available.`
        : `Support bundle ready with ${logFileCount} files.`,
      createdAt: stringValue(input.supportBundle.generatedAt, now),
    })
  }
  return messages
}

function buildAndroidCommandCenterSnapshot(input = {}) {
  const role = normalizeRole(input.role)
  const bridgeUrl = String(input.bridgeUrl ?? buildBridgeApiUrl())
  const profile = input.profile ?? {}
  const operation = input.operation ?? {}
  const serverStatus = isRecord(input.serverStatus) ? input.serverStatus : null
  const unreadChatMessages = Number(input.unreadChatMessages ?? 0)
  const installed = Boolean(input.installed ?? profile.status === 'healthy')
  const installStatus = stringValue(input.installStatus, profile.status)
  const ashfallStatusLabel = installed
    ? ['healthy', 'installed', 'ready'].includes(installStatus.toLowerCase())
      ? 'Installed'
      : `Installed (${titleCaseState(installStatus)})`
    : 'Not installed'
  const hasExplicitServerOnline = typeof input.serverOnline === 'boolean'
  const serverOnline = serverStatus ? Boolean(serverStatus.online) : hasExplicitServerOnline ? input.serverOnline : false
  const serverStateLabel = serverStatus?.stale ? 'Stale' : serverStatus || hasExplicitServerOnline ? (serverOnline ? 'Online' : 'Offline') : 'Unknown'
  const packVersion = String(input.packVersion ?? input.manifest?.version ?? profile.version ?? 'GitHub latest')
  const serverName = stringValue(serverStatus?.serverName, input.officialServerName ?? 'Ashfall Official')
  const requiredPackVersion = stringValue(serverStatus?.version?.echo, packVersion)
  const rawOperationStatus = stringValue(operation.status, 'idle').toLowerCase()
  const hasOperation = rawOperationStatus !== 'idle'
  const progress = rawOperationStatus === 'completed' ? 1 : Math.max(0, Math.min(1, Number(operation.progress ?? 0) / 100))
  const operationTitle = hasOperation ? stringValue(operation.label, 'Launcher operation') : 'Launcher ready'
  const operationSpeed = rawOperationStatus === 'running'
    ? 'Working'
    : rawOperationStatus === 'queued'
      ? 'Queued'
      : rawOperationStatus === 'completed'
        ? 'Complete'
        : rawOperationStatus === 'failed'
          ? 'Needs attention'
          : 'Idle'
  const operationMessage = operation.message || (hasOperation ? titleCaseState(rawOperationStatus, 'Operation in progress') : 'Ready for mobile commands')
  const indexEntries = input.indexEntries ?? buildMobileIndexEntries(input.manifest, installed)
  const packOsRuntime = stringValue(input.packOsRuntime, 'Unknown')
  const packOsReason = stringValue(input.packOsReason)
  const activeProfileName = stringValue(profile.name, 'Ashfall')
  return {
    launcherConnection: {
      connected: true,
      statusLabel: 'Connected over Wi-Fi',
      transportLabel: 'Wi-Fi Bridge',
      deviceName: 'ECHO Launcher Desktop',
      bridgeUrl,
      role,
      pairingCode: input.pairingCode ?? '',
      permissions: DEVICE_ROLES,
    },
    homeStatus: {
      launcher: 'Connected over Wi-Fi',
      ashfall: ashfallStatusLabel,
      packVersion,
      server: serverStateLabel,
      unreadChatMessages,
      minecraftChatBridge: input.minecraftChatBridge ?? (serverStatus ? (serverStatus.stale ? 'Server status stale' : 'Live server status') : 'Ready'),
      currentPhase: input.currentPhase ?? 'Phase 14',
    },
    homeQuickActions: [
      { label: 'Launch Ashfall', description: 'Ask the connected desktop launcher to start Ashfall.' },
      { label: 'Update Pack', description: 'Run the launcher update flow for the installed Ashfall pack.' },
      { label: 'Repair Install', description: 'Verify and repair damaged or missing pack files.' },
      { label: 'Open Chat', description: 'Jump to synced Android, launcher, and Minecraft chat.' },
      { label: 'Scan Install', description: 'Read PackOS and launcher install-state diagnostics.' },
      { label: 'View Latest News', description: 'Open the latest launcher and Ashfall release notes.' },
    ],
    chatChannels: [
      { id: 'global', name: 'Global', description: 'Community-wide launcher and mobile chat.', unreadCount: unreadChatMessages, sources: ['ANDROID', 'LAUNCHER'] },
      { id: 'server-ashfall', name: 'Ashfall Official', description: 'Official server chat bridged from Minecraft and Discord.', unreadCount: 0, sources: ['MINECRAFT', 'DISCORD', 'SYSTEM'] },
      { id: 'support', name: 'Support', description: 'Bug reports, install support, and launcher help.', unreadCount: 0, sources: ['ANDROID', 'SYSTEM'] },
    ],
    chatMessages: input.chatMessages ?? buildMobileChatMessages(input, operation, serverStatus),
    launcherTaskProgress: {
      title: operationTitle,
      progress,
      downloading: operation.phaseId ?? 'idle',
      speed: operationSpeed,
      status: operationMessage,
    },
    servers: [
      {
        id: 'official-ashfall',
        name: serverName,
        online: serverOnline,
        players: clampInt(serverStatus?.playerCount ?? input.serverPlayers, 0, 100000),
        maxPlayers: clampInt(serverStatus?.maxPlayers ?? input.serverMaxPlayers ?? 40, 0, 100000),
        requiredPackVersion,
        pingMs: Number(serverStatus?.pingMs ?? input.serverPingMs ?? 0),
      },
    ],
    secondScreen: {
      mission: input.mission ?? 'Restore Relay P-3',
      hazard: input.hazard ?? (packOsReason || 'No active hazard'),
      server: serverOnline ? `${serverName} - online` : 'No server connection',
      activeTools: ['Live Chat', 'Mission Tracker', 'HoloMap', 'Index Search', 'Terminal Alerts'],
    },
    indexEntries: indexEntries.length ? indexEntries : [
      {
        id: 'phase-anchor',
        title: 'Phase Anchor',
        category: 'Machine',
        addedBy: 'ECHO: Nexus Protocol',
        recipe: installed ? 'Available' : 'Install Ashfall to inspect recipe',
        requiredMachine: 'Relay Fabricator',
        unlock: 'Restore Relay P-3',
        status: installed ? 'Not unlocked yet' : 'Pack data unavailable',
        installedInPack: installed,
        tags: ['mission', 'relay', 'machine'],
      },
    ],
    devStatus: {
      phase: input.currentPhase ?? `Phase 14 - ${activeProfileName}`,
      packOsRuntime,
      neoForgeAdapter: 'Active',
      nativeAdapter: input.nativeAdapter ?? 'In progress',
      launcherBridge: 'Active',
      androidApp: 'Connected',
    },
    devActions: [
      { label: 'Run PackOS Check', description: 'Validate current pack readiness from launcher reports.' },
      {
        label: 'View Launcher Logs',
        description: input.logsSummary?.latestName
          ? `Latest log: ${input.logsSummary.latestName}; ${clampInt(input.logsSummary.fileCount, 0, 100000)} files available.`
          : 'Open launcher logs from the connected desktop.',
      },
      { label: 'View Crash Logs', description: 'Inspect recent Minecraft and launcher crash output.' },
      {
        label: 'Export Support Bundle',
        description: input.supportBundle?.latestName
          ? `Latest bundle: ${input.supportBundle.latestName}; ${clampInt(input.supportBundle.bundleCount, 0, 100000)} bundles available.`
          : input.supportBundle?.available
            ? `Bundle available with ${clampInt(input.supportBundle.fileCount, 0, 100000)} files.`
            : 'Collect sanitized diagnostics for support.',
      },
      { label: 'Generate Changelog', description: 'Draft release notes from modules, packs, and launcher state.' },
      { label: 'Create Release Checklist', description: 'Build a release gate checklist for modules, packs, and launcher.' },
      { label: 'Send Logs to AI', description: 'Package selected diagnostics into an AI-ready support prompt.' },
    ],
  }
}

module.exports = {
  DEFAULT_MOBILE_BRIDGE_PORT,
  PAIRING_SESSION_MS,
  DEVICE_ROLES,
  buildAndroidCommandCenterSnapshot,
  buildBridgeApiUrl,
  buildMobileBridgeHealth,
  buildPairingPayload,
  canRunMobileAction,
  createPairingSession,
  denyPendingDevice,
  approvePendingDevice,
  authenticateDevice,
  getLanAddress,
  hashToken,
  isRunningMobileOperation,
  mapMobileAction,
  normalizeMobileBridgeSettings,
  normalizeRole,
  publicMobileBridgeState,
  requestPairing,
  revokePairedDevice,
}
