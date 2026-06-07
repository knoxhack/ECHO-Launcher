import type {
  CommunityChatBootstrap,
  CommunityChatChannel,
  CommunityChatMessage,
  CommunityChatSettings,
  CommunityChatSource,
} from '../types/communityChat'
import {
  COMMUNITY_CHAT_MESSAGE_LIMIT,
  OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
  createCommunityMessage,
  parseCommunityChatBootstrap,
  sanitizeCommunityMessageBody,
} from '../utils/communityChat'

export interface CommunityBootstrapOptions extends Pick<CommunityChatSettings, 'communityApiUrl'> {
  clientId: string
  nickname: string
  officialServerName: string
  officialPlayers: string[]
  source?: Extract<CommunityChatSource, 'launcher' | 'android'>
}

export interface CommunitySendMessageOptions extends Pick<CommunityChatSettings, 'communityApiUrl'> {
  channelId: string
  body: string
  clientId: string
  nickname: string
  nonce: string
  source?: Extract<CommunityChatSource, 'launcher' | 'android'>
}

export interface CommunityFetchMessagesOptions extends Pick<CommunityChatSettings, 'communityApiUrl'> {
  channelId: string
  before?: string
}

export type CommunityChatServiceHealth = 'preview' | 'connected' | 'unavailable'

export interface CommunityChatHealthOptions extends Pick<CommunityChatSettings, 'communityApiUrl'> {
  clientId?: string
  nickname?: string
}

export interface CommunityChatHealthResult {
  status: CommunityChatServiceHealth
  detail: string
}

export class CommunityChatService {
  async checkHealth(options: CommunityChatHealthOptions): Promise<CommunityChatHealthResult> {
    if (!options.communityApiUrl.trim()) {
      return { status: 'preview', detail: 'Using local chat preview fallback.' }
    }

    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), 3_500)
    const baseUrl = trimUrl(options.communityApiUrl)
    const headers = {
      Accept: 'application/json',
      'X-ECHO-Chat-Client': options.clientId ?? 'settings-health-check',
      ...(options.nickname ? { 'X-ECHO-Chat-Nickname': options.nickname } : {}),
    }

    try {
      const healthResponse = await fetch(`${baseUrl}/health`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!healthResponse.ok) {
        return { status: 'unavailable', detail: `/health returned HTTP ${healthResponse.status}.` }
      }

      const bootstrapResponse = await fetch(`${baseUrl}/v1/community/bootstrap`, {
        headers,
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!bootstrapResponse.ok) {
        return { status: 'unavailable', detail: `Bootstrap returned HTTP ${bootstrapResponse.status}.` }
      }

      const parsed = parseCommunityChatBootstrap(await bootstrapResponse.json())
      if (!parsed) {
        return { status: 'unavailable', detail: 'Bootstrap JSON did not match the ECHO chat contract.' }
      }

      return { status: 'connected', detail: `${parsed.channels.length} channels ready from the server mod.` }
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError'
      return {
        status: 'unavailable',
        detail: timedOut ? 'Server mod chat health check timed out.' : error instanceof Error ? error.message : 'Server mod chat health check failed.',
      }
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }

  async bootstrap(options: CommunityBootstrapOptions): Promise<CommunityChatBootstrap> {
    if (!options.communityApiUrl) return createMockBootstrap(options)
    const response = await fetch(`${trimUrl(options.communityApiUrl)}/v1/community/bootstrap`, {
      headers: {
        Accept: 'application/json',
        'X-ECHO-Chat-Client': options.clientId,
        'X-ECHO-Chat-Source': options.source ?? 'launcher',
        ...(options.nickname ? { 'X-ECHO-Chat-Nickname': options.nickname } : {}),
      },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Community bootstrap returned HTTP ${response.status}.`)
    const parsed = parseCommunityChatBootstrap(await response.json())
    if (!parsed) throw new Error('Community bootstrap JSON did not match the ECHO chat contract.')
    return parsed
  }

  async fetchMessages(options: CommunityFetchMessagesOptions): Promise<{ messages: CommunityChatMessage[]; hasMore: boolean }> {
    if (!options.communityApiUrl) {
      return createMockOlderMessages(options.channelId, options.before)
    }
    const search = new URLSearchParams({ limit: String(COMMUNITY_CHAT_MESSAGE_LIMIT) })
    if (options.before) search.set('before', options.before)
    const response = await fetch(`${trimUrl(options.communityApiUrl)}/v1/channels/${encodeURIComponent(options.channelId)}/messages?${search}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Community messages returned HTTP ${response.status}.`)
    const json = await response.json()
    const parsed = parseCommunityChatBootstrap({
      groups: [{ id: 'temporary', label: 'Temporary', channelIds: [options.channelId] }],
      channels: [{ id: options.channelId, groupId: 'temporary', name: options.channelId }],
      messages: { [options.channelId]: Array.isArray(json.messages) ? json.messages : [] },
      hasMore: { [options.channelId]: Boolean(json.hasMore) },
    })
    return {
      messages: parsed?.messages[options.channelId] ?? [],
      hasMore: Boolean(parsed?.hasMore[options.channelId]),
    }
  }

  async sendMessage(options: CommunitySendMessageOptions): Promise<CommunityChatMessage> {
    const body = sanitizeCommunityMessageBody(options.body)
    if (!body) throw new Error('Message is empty.')
    if (!options.nickname) throw new Error('Choose a chat nickname before posting.')

    if (!options.communityApiUrl) {
      await delay(90)
      return createCommunityMessage({
        id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        channelId: options.channelId,
        author: {
          id: options.clientId,
          displayName: options.nickname,
          role: 'member',
          source: options.source ?? 'launcher',
        },
        body,
        nonce: options.nonce,
        source: options.source ?? 'launcher',
      })
    }

    const response = await fetch(`${trimUrl(options.communityApiUrl)}/v1/channels/${encodeURIComponent(options.channelId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-ECHO-Chat-Client': options.clientId,
        'X-ECHO-Chat-Nickname': options.nickname,
        'X-ECHO-Chat-Source': options.source ?? 'launcher',
      },
      body: JSON.stringify({ body, nonce: options.nonce }),
    })
    if (!response.ok) throw new Error(`Community message send returned HTTP ${response.status}.`)
    const parsed = parseCommunityChatBootstrap({
      groups: [{ id: 'temporary', label: 'Temporary', channelIds: [options.channelId] }],
      channels: [{ id: options.channelId, groupId: 'temporary', name: options.channelId }],
      messages: { [options.channelId]: [await response.json()] },
    })
    const [message] = parsed?.messages[options.channelId] ?? []
    if (!message) throw new Error('Community message response did not match the ECHO chat contract.')
    return message
  }
}

export const communityChatService = new CommunityChatService()

function createMockBootstrap(options: CommunityBootstrapOptions): CommunityChatBootstrap {
  const serverName = options.officialServerName || 'Ashfall Official'
  const channels: CommunityChatChannel[] = [
    {
      id: 'announcements',
      groupId: 'official',
      name: 'announcements',
      description: 'Official ECHO launcher and Ashfall updates.',
      kind: 'announcement',
      readOnly: true,
      slowModeSeconds: 0,
      unreadCount: 1,
    },
    {
      id: 'status',
      groupId: 'official',
      name: 'status',
      description: 'Live status, maintenance, and release readiness notes.',
      kind: 'system',
      readOnly: true,
      slowModeSeconds: 0,
      unreadCount: 0,
    },
    {
      id: 'rules',
      groupId: 'official',
      name: 'rules',
      description: 'Community rules and moderation expectations.',
      kind: 'announcement',
      readOnly: true,
      slowModeSeconds: 0,
      unreadCount: 0,
    },
    {
      id: 'general',
      groupId: 'community',
      name: 'general',
      description: 'General ECHO community chat.',
      kind: 'community',
      readOnly: false,
      slowModeSeconds: 5,
      unreadCount: 3,
      onlineCount: 18,
    },
    {
      id: 'support',
      groupId: 'community',
      name: 'support',
      description: 'Install, handoff, and crash help.',
      kind: 'community',
      readOnly: false,
      slowModeSeconds: 10,
      unreadCount: 0,
      onlineCount: 8,
    },
    {
      id: 'modpacks',
      groupId: 'community',
      name: 'modpacks',
      description: 'Pack feedback, builds, and module discussion.',
      kind: 'community',
      readOnly: false,
      slowModeSeconds: 5,
      unreadCount: 0,
      onlineCount: 12,
    },
    {
      id: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
      groupId: 'servers',
      name: serverName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ashfall-official',
      description: 'Bidirectional launcher and in-game chat for the official server.',
      kind: 'minecraft_server',
      readOnly: false,
      slowModeSeconds: 5,
      unreadCount: 2,
      onlineCount: options.officialPlayers.length,
      serverId: 'official-ashfall',
    },
  ]
  const groups = [
    { id: 'official', label: 'Official', channelIds: ['announcements', 'status', 'rules'] },
    { id: 'community', label: 'Community', channelIds: ['general', 'support', 'modpacks'] },
    { id: 'servers', label: 'Official Servers', channelIds: [OFFICIAL_ASHFALL_CHAT_CHANNEL_ID] },
  ]
  const selfNickname = options.nickname
  const system = { id: 'system', displayName: 'ECHO System', role: 'moderator' as const, source: 'system' as const }
  const guide = { id: 'warden', displayName: 'Ashfall Warden', role: 'moderator' as const, source: 'launcher' as const }
  const messages = Object.fromEntries(
    channels.map((channel) => [
      channel.id,
      createMockMessages(channel.id, channel.name, system, guide, options.officialPlayers),
    ]),
  )

  return {
    groups,
    channels,
    members: [
      { id: 'warden', displayName: 'Ashfall Warden', role: 'moderator', status: 'online', source: 'launcher', channelId: 'general' },
      { id: 'android-scout', displayName: 'Android Scout', role: 'member', status: 'online', source: 'android', channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID },
      { id: 'discord-guide', displayName: 'Discord Relay', role: 'member', status: 'online', source: 'discord', channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID },
      { id: 'packsmith', displayName: 'PackSmith', role: 'admin', status: 'online', source: 'launcher', channelId: 'modpacks' },
      { id: 'support-bot', displayName: 'Support Relay', role: 'moderator', status: 'idle', source: 'system', channelId: 'support' },
      ...options.officialPlayers.slice(0, 24).map((player) => ({
        id: `mc-${player.toLowerCase()}`,
        displayName: player,
        role: 'member' as const,
        status: 'online' as const,
        source: 'minecraft' as const,
        channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
      })),
    ],
    self: {
      clientId: options.clientId,
      nickname: selfNickname,
      role: 'member',
    },
    messages,
    hasMore: Object.fromEntries(channels.map((channel) => [channel.id, true])),
    bridge: [{ serverId: 'official-ashfall', channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID, label: serverName, connected: true }],
    moderation: {
      slowModeSeconds: 5,
      rules: ['Keep it helpful.', 'No harassment or hate speech.', 'Do not paste tokens, secrets, or private logs.'],
    },
  }
}

function createMockMessages(
  channelId: string,
  channelName: string,
  system: { id: string; displayName: string; role: 'moderator'; source: 'system' },
  guide: { id: string; displayName: string; role: 'moderator'; source: 'launcher' },
  officialPlayers: string[],
) {
  const now = Date.now()
  const channelLabel = channelName.replace(/-/g, ' ')
  const base = [
    createCommunityMessage({
      id: `${channelId}-welcome`,
      channelId,
      author: system,
      body: `Welcome to ${channelLabel}. ECHO chat is running in low-latency preview mode until the hosted service is connected.`,
      createdAt: new Date(now - 38 * 60_000).toISOString(),
      source: 'system',
    }),
    createCommunityMessage({
      id: `${channelId}-rules`,
      channelId,
      author: guide,
      body: 'Core moderation is active: slow mode, reports, hidden messages, and timeouts are part of the v1 contract.',
      createdAt: new Date(now - 27 * 60_000).toISOString(),
    }),
  ]
  if (channelId === OFFICIAL_ASHFALL_CHAT_CHANNEL_ID) {
    base.push(
      createCommunityMessage({
        id: `${channelId}-bridge`,
        channelId,
        author: system,
        body: `${officialPlayers.length || 0} player${officialPlayers.length === 1 ? '' : 's'} online. Server chat bridge is ready for bidirectional relay.`,
        createdAt: new Date(now - 12 * 60_000).toISOString(),
        source: 'system',
      }),
    )
    const [firstPlayer] = officialPlayers
    if (firstPlayer) {
      base.push(
        createCommunityMessage({
          id: `${channelId}-player-${firstPlayer}`,
          channelId,
          author: { id: `mc-${firstPlayer.toLowerCase()}`, displayName: firstPlayer, role: 'member', source: 'minecraft' },
          body: 'Launcher bridge check is green on the official server.',
          createdAt: new Date(now - 8 * 60_000).toISOString(),
          source: 'minecraft',
        }),
      )
    }
    base.push(
      createCommunityMessage({
        id: `${channelId}-discord-preview`,
        channelId,
        author: { id: 'discord-guide', displayName: 'Discord Relay', role: 'member', source: 'discord' },
        body: 'Discord relay is linked to the same official server channel.',
        createdAt: new Date(now - 6 * 60_000).toISOString(),
        source: 'discord',
      }),
      createCommunityMessage({
        id: `${channelId}-android-preview`,
        channelId,
        author: { id: 'android-scout', displayName: 'Android Scout', role: 'member', source: 'android' },
        body: 'Android can post here directly without the desktop launcher bridge.',
        createdAt: new Date(now - 4 * 60_000).toISOString(),
        source: 'android',
      }),
    )
  }
  return base
}

function createMockOlderMessages(channelId: string, before?: string) {
  const beforeTime = before ? Date.parse(before) : Date.now()
  const safeTime = Number.isFinite(beforeTime) ? beforeTime : Date.now()
  const messages = Array.from({ length: COMMUNITY_CHAT_MESSAGE_LIMIT }, (_, index) => {
    const minutesAgo = (index + 1) * 6
    return createCommunityMessage({
      id: `${channelId}-history-${safeTime}-${index}`,
      channelId,
      author: {
        id: index % 3 === 0 ? 'system' : 'historian',
        displayName: index % 3 === 0 ? 'ECHO System' : 'Archive Runner',
        role: index % 3 === 0 ? 'moderator' : 'member',
        source: index % 3 === 0 ? 'system' : 'launcher',
      },
      body: `Archived ${channelId} message ${index + 1}. Cursor pagination keeps this history smooth.`,
      createdAt: new Date(safeTime - minutesAgo * 60_000).toISOString(),
      source: index % 3 === 0 ? 'system' : 'launcher',
    })
  }).reverse()
  return { messages, hasMore: safeTime > Date.now() - 7 * 24 * 60 * 60_000 }
}

function trimUrl(url: string) {
  return url.replace(/\/+$/, '')
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}
