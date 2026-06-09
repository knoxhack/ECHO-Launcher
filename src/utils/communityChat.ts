import type {
  CommunityChatBootstrap,
  CommunityChatChannel,
  CommunityChatChannelGroup,
  CommunityChatMember,
  CommunityChatMessage,
  CommunityChatRole,
  CommunityChatSettings,
  CommunityChatSource,
} from '../types/communityChat'
import { officialServerSettingsDefaults } from './officialServerSettings'

export const OFFICIAL_ASHFALL_CHAT_CHANNEL_ID = 'server-ashfall'
export const COMMUNITY_CHAT_MESSAGE_LIMIT = 50
export const COMMUNITY_CHAT_MAX_BODY_LENGTH = 2000
export const COMMUNITY_CHAT_MAX_CHANNEL_MESSAGES = 10_000
export const LOCAL_COMMUNITY_CHAT_API_URL = 'http://127.0.0.1:47870'
export const LOCAL_COMMUNITY_CHAT_WEBSOCKET_URL = 'ws://127.0.0.1:47870/v1/chat/socket'
export const OFFICIAL_COMMUNITY_API_URL = import.meta.env.VITE_ECHO_COMMUNITY_API_URL?.trim() || 'https://api.echoplatform.dev'
export const OFFICIAL_COMMUNITY_WEBSOCKET_URL =
  import.meta.env.VITE_ECHO_COMMUNITY_WEBSOCKET_URL?.trim() || 'wss://api.echoplatform.dev/v1/chat/socket'
export const OFFICIAL_COMMUNITY_CHAT_URLS = {
  communityApiUrl: OFFICIAL_COMMUNITY_API_URL,
  communityWebSocketUrl: OFFICIAL_COMMUNITY_WEBSOCKET_URL,
}
const LEGACY_LOCAL_API_URLS = new Set([
  'http://127.0.0.1:47870',
  'http://127.0.0.1:47870/',
  'http://10.0.2.2:47870',
  'http://10.0.2.2:47870/',
])
const LEGACY_LOCAL_SOCKET_URLS = new Set([
  'ws://127.0.0.1:47870/v1/chat/socket',
  'ws://10.0.2.2:47870/v1/chat/socket',
])
const LEGACY_OFFICIAL_API_URLS = new Set([
  'http://64.74.111.235:16363',
  'http://64.74.111.235:16363/',
])
const LEGACY_OFFICIAL_SOCKET_URLS = new Set([
  'ws://64.74.111.235:16363/v1/chat/socket',
])
const LEGACY_OFFICIAL_STATUS_URLS = new Set([
  'http://64.74.111.235:16363/status.json',
  'http://64.74.111.235:16363/status.json/',
])

export const communityChatSettingsDefaults = {
  communityApiUrl: OFFICIAL_COMMUNITY_CHAT_URLS.communityApiUrl,
  communityWebSocketUrl: OFFICIAL_COMMUNITY_CHAT_URLS.communityWebSocketUrl,
  chatNickname: 'Launcher Player',
  chatNotifications: true,
} satisfies CommunityChatSettings

export function communityChatUrlsFromStatusUrl(statusUrl: string): Pick<CommunityChatSettings, 'communityApiUrl' | 'communityWebSocketUrl'> {
  try {
    const parsed = new URL(statusUrl)
    const basePath = parsed.pathname.replace(/\/status\.json$/i, '').replace(/\/+$/, '')
    const apiProtocol = parsed.protocol === 'https:' ? 'https:' : 'http:'
    const socketProtocol = apiProtocol === 'https:' ? 'wss:' : 'ws:'
    return {
      communityApiUrl: `${apiProtocol}//${parsed.host}${basePath}`,
      communityWebSocketUrl: `${socketProtocol}//${parsed.host}${basePath}/v1/chat/socket`,
    }
  } catch {
    return {
      communityApiUrl: OFFICIAL_COMMUNITY_API_URL,
      communityWebSocketUrl: OFFICIAL_COMMUNITY_WEBSOCKET_URL,
    }
  }
}

export function normalizeCommunityChatSettings(
  input: Partial<CommunityChatSettings> = {},
  officialServerStatusUrl = officialServerSettingsDefaults.officialServerStatusUrl,
  options: { migrateLegacyLocalDefaults?: boolean } = {},
): CommunityChatSettings {
  const shouldMigrateOfficialStatus = options.migrateLegacyLocalDefaults && LEGACY_OFFICIAL_STATUS_URLS.has(officialServerStatusUrl.trim())
  const derivedDefaults = shouldMigrateOfficialStatus ? OFFICIAL_COMMUNITY_CHAT_URLS : communityChatUrlsFromStatusUrl(officialServerStatusUrl)
  const rawApiUrl = String(input.communityApiUrl ?? derivedDefaults.communityApiUrl).trim()
  const rawSocketUrl = String(input.communityWebSocketUrl ?? derivedDefaults.communityWebSocketUrl).trim()
  const shouldMigrateApi =
    options.migrateLegacyLocalDefaults && (LEGACY_LOCAL_API_URLS.has(rawApiUrl) || LEGACY_OFFICIAL_API_URLS.has(rawApiUrl))
  const shouldMigrateSocket =
    options.migrateLegacyLocalDefaults && (LEGACY_LOCAL_SOCKET_URLS.has(rawSocketUrl) || LEGACY_OFFICIAL_SOCKET_URLS.has(rawSocketUrl))
  return {
    communityApiUrl: shouldMigrateApi ? derivedDefaults.communityApiUrl : rawApiUrl,
    communityWebSocketUrl: shouldMigrateSocket ? derivedDefaults.communityWebSocketUrl : rawSocketUrl,
    chatNickname: normalizeNickname(input.chatNickname ?? communityChatSettingsDefaults.chatNickname),
    chatNotifications: input.chatNotifications ?? true,
  }
}

export function shouldFollowOfficialChatUrl(currentUrl: string, previousOfficialStatusUrl: string) {
  const previous = communityChatUrlsFromStatusUrl(previousOfficialStatusUrl)
  const normalized = currentUrl.trim()
  return (
    normalized === previous.communityApiUrl ||
    normalized === previous.communityWebSocketUrl ||
    LEGACY_LOCAL_API_URLS.has(normalized) ||
    LEGACY_LOCAL_SOCKET_URLS.has(normalized) ||
    LEGACY_OFFICIAL_API_URLS.has(normalized) ||
    LEGACY_OFFICIAL_SOCKET_URLS.has(normalized)
  )
}

export function normalizeNickname(input: unknown) {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)
}

export function sanitizeCommunityMessageBody(input: unknown) {
  return stripUnsafeControlCharacters(String(input ?? ''))
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, COMMUNITY_CHAT_MAX_BODY_LENGTH)
}

export function canModerateCommunityChat(role: CommunityChatRole) {
  return role === 'owner' || role === 'admin' || role === 'moderator'
}

export function parseCommunityChatBootstrap(input: unknown): CommunityChatBootstrap | null {
  if (!isRecord(input)) return null
  const groups = parseGroups(input.groups)
  const channels = parseChannels(input.channels)
  if (!groups.length || !channels.length) return null

  const channelIds = new Set(channels.map((channel) => channel.id))
  const messagesInput = isRecord(input.messages) ? input.messages : {}
  const messages = Object.fromEntries(
    channels.map((channel) => [
      channel.id,
      parseMessages(messagesInput[channel.id], channelIds).slice(-COMMUNITY_CHAT_MESSAGE_LIMIT),
    ]),
  )
  const hasMoreInput = isRecord(input.hasMore) ? input.hasMore : {}
  const hasMore = Object.fromEntries(channels.map((channel) => [channel.id, Boolean(hasMoreInput[channel.id])]))
  const selfInput = isRecord(input.self) ? input.self : {}
  const moderationInput = isRecord(input.moderation) ? input.moderation : {}

  return {
    groups,
    channels,
    members: parseMembers(input.members, channelIds),
    self: {
      clientId: asString(selfInput.clientId) || 'local-client',
      nickname: normalizeNickname(selfInput.nickname),
      role: parseRole(selfInput.role),
    },
    messages,
    hasMore,
    bridge: Array.isArray(input.bridge)
      ? input.bridge
          .map((item) => {
            if (!isRecord(item)) return null
            const channelId = asString(item.channelId)
            if (!channelIds.has(channelId)) return null
            return {
              serverId: asString(item.serverId) || 'official-ashfall',
              channelId,
              label: asString(item.label) || 'Ashfall Official',
              connected: Boolean(item.connected),
            }
          })
          .filter((item): item is CommunityChatBootstrap['bridge'][number] => Boolean(item))
      : [],
    moderation: {
      slowModeSeconds: clampInt(moderationInput.slowModeSeconds, 0, 300) || 5,
      rules: Array.isArray(moderationInput.rules)
        ? moderationInput.rules.map(asString).filter(Boolean).slice(0, 8)
        : ['Keep it helpful.', 'No harassment or hate speech.', 'Do not paste tokens, secrets, or private logs.'],
    },
  }
}

export function createCommunityMessage(input: {
  id: string
  channelId: string
  author: {
    id: string
    displayName: string
    role?: CommunityChatRole
    source?: CommunityChatSource
  }
  body: string
  createdAt?: string
  pending?: boolean
  source?: CommunityChatSource
  nonce?: string
}): CommunityChatMessage {
  const source = input.source ?? input.author.source ?? 'launcher'
  return {
    id: input.id,
    channelId: input.channelId,
    author: {
      id: input.author.id,
      displayName: input.author.displayName,
      role: input.author.role ?? 'member',
      source,
    },
    body: sanitizeCommunityMessageBody(input.body),
    createdAt: input.createdAt ?? new Date().toISOString(),
    pending: input.pending,
    source,
    nonce: input.nonce,
  }
}

function parseGroups(value: unknown): CommunityChatChannelGroup[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!isRecord(item)) return null
      const id = asString(item.id)
      const channelIds = Array.isArray(item.channelIds) ? item.channelIds.map(asString).filter(Boolean) : []
      if (!id || !channelIds.length) return null
      return {
        id,
        label: asString(item.label) || id,
        channelIds,
      }
    })
    .filter((item): item is CommunityChatChannelGroup => Boolean(item))
}

function parseChannels(value: unknown): CommunityChatChannel[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): CommunityChatChannel | null => {
      if (!isRecord(item)) return null
      const id = asString(item.id)
      const groupId = asString(item.groupId)
      if (!id || !groupId) return null
      return {
        id,
        groupId,
        name: asString(item.name) || id,
        description: asString(item.description),
        kind: parseChannelKind(item.kind),
        readOnly: Boolean(item.readOnly),
        slowModeSeconds: clampInt(item.slowModeSeconds, 0, 300),
        unreadCount: clampInt(item.unreadCount, 0, 999),
        onlineCount: clampInt(item.onlineCount, 0, 100_000),
        ...(asString(item.serverId) ? { serverId: asString(item.serverId) } : {}),
      }
    })
    .filter((item): item is CommunityChatChannel => Boolean(item))
}

function parseMessages(value: unknown, channelIds: Set<string>): CommunityChatMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): CommunityChatMessage | null => {
      if (!isRecord(item)) return null
      const channelId = asString(item.channelId)
      const authorInput = isRecord(item.author) ? item.author : {}
      const createdAt = asIsoString(item.createdAt)
      if (!asString(item.id) || !channelIds.has(channelId) || !createdAt) return null
      return {
        id: asString(item.id),
        channelId,
        author: {
          id: asString(authorInput.id) || 'unknown',
          displayName: asString(authorInput.displayName) || 'Unknown',
          role: parseRole(authorInput.role),
          source: parseSource(authorInput.source),
        },
        body: sanitizeCommunityMessageBody(item.body),
        createdAt,
        ...(asIsoString(item.updatedAt) ? { updatedAt: asIsoString(item.updatedAt) ?? undefined } : {}),
        hidden: Boolean(item.hidden),
        pinned: Boolean(item.pinned),
        ...(asString(item.nonce) ? { nonce: asString(item.nonce) } : {}),
        source: parseSource(item.source),
      }
    })
    .filter((item): item is CommunityChatMessage => Boolean(item))
}

function parseMembers(value: unknown, channelIds: Set<string>): CommunityChatMember[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): CommunityChatMember | null => {
      if (!isRecord(item)) return null
      const id = asString(item.id)
      if (!id) return null
      const channelId = asString(item.channelId)
      return {
        id,
        displayName: asString(item.displayName) || id,
        role: parseRole(item.role),
        status: parseStatus(item.status),
        source: parseSource(item.source),
        ...(channelIds.has(channelId) ? { channelId } : {}),
      }
    })
    .filter((item): item is CommunityChatMember => Boolean(item))
}

function parseChannelKind(value: unknown): CommunityChatChannel['kind'] {
  return value === 'announcement' || value === 'minecraft_server' || value === 'system' ? value : 'community'
}

function parseRole(value: unknown): CommunityChatRole {
  return value === 'owner' || value === 'admin' || value === 'moderator' || value === 'guest' ? value : 'member'
}

function parseSource(value: unknown): CommunityChatSource {
  return value === 'android' || value === 'minecraft' || value === 'discord' || value === 'system' ? value : 'launcher'
}

function parseStatus(value: unknown): CommunityChatMember['status'] {
  return value === 'idle' || value === 'offline' ? value : 'online'
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

function stripUnsafeControlCharacters(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
    })
    .join('')
}
