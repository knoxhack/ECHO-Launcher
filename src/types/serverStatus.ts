export type OfficialServerRuntimeState = 'loading' | 'online' | 'offline' | 'stale' | 'unavailable'

export interface OfficialServerStatusEvent {
  type: string
  player?: string
  message?: string
  createdAt: string
}

export interface OfficialServerStatus {
  schemaVersion: 1
  serverId: string
  serverName: string
  motd: string
  online: boolean
  playerCount: number
  maxPlayers: number
  players: string[]
  discord: {
    linked: boolean
    inviteUrl?: string
  }
  version: {
    minecraft: string
    neoforge: string
    echo: string
  }
  recentEvents: OfficialServerStatusEvent[]
  lastUpdated: string
}

export interface OfficialServerStatusFallback {
  serverName?: string
  discordInviteUrl?: string
}

export const OFFICIAL_SERVER_STALE_MS = 120_000

const DEFAULT_SERVER_NAME = 'Ashfall Official'

export function parseOfficialServerStatus(input: unknown, fallback: OfficialServerStatusFallback = {}): OfficialServerStatus | null {
  if (!isRecord(input)) return null
  const schemaVersion = Number(input.schemaVersion)
  if (schemaVersion !== 1) return null

  const playerCount = clampInt(input.playerCount, 0, 100_000)
  const maxPlayers = clampInt(input.maxPlayers, Math.max(playerCount, 0), 100_000)
  const discord = isRecord(input.discord) ? input.discord : {}
  const inviteUrl = asString(discord.inviteUrl) || fallback.discordInviteUrl || undefined

  return {
    schemaVersion: 1,
    serverId: asString(input.serverId) || 'official-ashfall',
    serverName: asString(input.serverName) || fallback.serverName || DEFAULT_SERVER_NAME,
    motd: asString(input.motd),
    online: Boolean(input.online),
    playerCount,
    maxPlayers,
    players: Array.isArray(input.players) ? input.players.map(asString).filter(Boolean).slice(0, 64) : [],
    discord: {
      linked: Boolean(discord.linked) || Boolean(inviteUrl),
      ...(inviteUrl ? { inviteUrl } : {}),
    },
    version: parseVersion(input.version),
    recentEvents: parseEvents(input.recentEvents),
    lastUpdated: asIsoString(input.lastUpdated) ?? new Date(0).toISOString(),
  }
}

export function getOfficialServerRuntimeState(
  status: OfficialServerStatus | null,
  loading: boolean,
  error: string | null,
  now = Date.now(),
): OfficialServerRuntimeState {
  if (!status) {
    if (loading) return 'loading'
    return error ? 'unavailable' : 'loading'
  }

  if (isStatusStale(status, now)) return 'stale'
  if (status.online) return 'online'
  return 'offline'
}

export function isStatusStale(status: Pick<OfficialServerStatus, 'lastUpdated'>, now = Date.now()) {
  const updatedAt = Date.parse(status.lastUpdated)
  return !Number.isFinite(updatedAt) || now - updatedAt > OFFICIAL_SERVER_STALE_MS
}

export function formatOfficialServerUpdatedAt(status: OfficialServerStatus | null, now = Date.now()) {
  if (!status) return 'Waiting'
  const updatedAt = Date.parse(status.lastUpdated)
  if (!Number.isFinite(updatedAt)) return 'Unknown'
  const deltaSeconds = Math.max(0, Math.floor((now - updatedAt) / 1000))
  if (deltaSeconds < 5) return 'Now'
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`
  const deltaMinutes = Math.floor(deltaSeconds / 60)
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`
  const deltaHours = Math.floor(deltaMinutes / 60)
  if (deltaHours < 24) return `${deltaHours}h ago`
  return `${Math.floor(deltaHours / 24)}d ago`
}

function parseVersion(value: unknown): OfficialServerStatus['version'] {
  const version = isRecord(value) ? value : {}
  return {
    minecraft: asString(version.minecraft),
    neoforge: asString(version.neoforge),
    echo: asString(version.echo),
  }
}

function parseEvents(value: unknown): OfficialServerStatusEvent[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isRecord(item)) return null
      const createdAt = asIsoString(item.createdAt)
      if (!createdAt) return null
      return {
        type: asString(item.type) || 'event',
        ...(asString(item.player) ? { player: asString(item.player) } : {}),
        ...(asString(item.message) ? { message: asString(item.message) } : {}),
        createdAt,
      }
    })
    .filter((item): item is OfficialServerStatusEvent => Boolean(item))
    .slice(0, 24)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asIsoString(value: unknown) {
  const text = asString(value)
  if (!text) return null
  const timestamp = Date.parse(text)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function clampInt(value: unknown, min: number, max: number) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, Math.floor(number)))
}
