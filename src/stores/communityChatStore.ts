import { create } from 'zustand'
import type {
  CommunityChatBootstrap,
  CommunityChatChannel,
  CommunityChatConnectionState,
  CommunityChatEventEnvelope,
  CommunityChatMember,
  CommunityChatMessage,
  CommunityChatRole,
  CommunityChatSettings,
} from '../types/communityChat'
import { communityChatService } from '../services/CommunityChatService'
import {
  COMMUNITY_CHAT_MAX_CHANNEL_MESSAGES,
  OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
  canModerateCommunityChat,
  createCommunityMessage,
  sanitizeCommunityMessageBody,
} from '../utils/communityChat'

interface CommunityChatBootstrapRequest extends Pick<CommunityChatSettings, 'communityApiUrl' | 'communityWebSocketUrl'> {
  nickname: string
  officialServerName: string
  officialPlayers: string[]
}

interface CommunityChatStore {
  activeChannelId: string
  groups: CommunityChatBootstrap['groups']
  channels: CommunityChatChannel[]
  members: CommunityChatMember[]
  messagesByChannel: Record<string, CommunityChatMessage[]>
  hasMoreByChannel: Record<string, boolean>
  loading: boolean
  loadingOlder: boolean
  sending: boolean
  connection: CommunityChatConnectionState
  error: string | null
  clientId: string
  nickname: string
  role: CommunityChatRole
  rules: string[]
  bridge: CommunityChatBootstrap['bridge']
  bootstrap: (request: CommunityChatBootstrapRequest) => Promise<void>
  startOfficialChat: (request: CommunityChatBootstrapRequest) => Promise<void>
  refreshOfficialChat: (reportErrors?: boolean) => Promise<void>
  setActiveChannel: (channelId: string) => void
  loadOlderMessages: (communityApiUrl: string) => Promise<void>
  sendMessage: (communityApiUrl: string, body: string) => Promise<void>
  hideMessage: (messageId: string) => void
  reportMessage: (messageId: string) => void
  applyEvents: (events: CommunityChatEventEnvelope[]) => void
  reset: () => void
}

const STORAGE_KEY = 'echo-community-chat-client-id'
const OFFICIAL_CHAT_POLL_INTERVAL_MS = 8_000
const RECONNECT_FAST_MS = 3_000
const RECONNECT_SLOW_MS = 10_000
let socket: WebSocket | null = null
let queuedEvents: CommunityChatEventEnvelope[] = []
let flushTimer: number | null = null
let reconnectTimer: number | null = null
let pollTimer: number | null = null
let reconnectAttempts = 0
let reconnectEnabled = false
let activeOfficialChatRequest: CommunityChatBootstrapRequest | null = null

const initialState = {
  activeChannelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
  groups: [],
  channels: [],
  members: [],
  messagesByChannel: {},
  hasMoreByChannel: {},
  loading: false,
  loadingOlder: false,
  sending: false,
  connection: 'idle' as CommunityChatConnectionState,
  error: null,
  clientId: getOrCreateClientId(),
  nickname: '',
  role: 'guest' as CommunityChatRole,
  rules: [],
  bridge: [],
}

export const useCommunityChatStore = create<CommunityChatStore>((set, get) => ({
  ...initialState,
  bootstrap: async (request) => get().startOfficialChat(request),
  startOfficialChat: async (request) => {
    activeOfficialChatRequest = request
    const clientId = get().clientId
    clearReconnectTimer()
    startPolling(get)
    set({ loading: true, error: null, connection: request.communityApiUrl ? 'connecting' : 'offline' })
    try {
      const bootstrap = await communityChatService.bootstrap({
        communityApiUrl: request.communityApiUrl,
        clientId,
        nickname: request.nickname,
        officialServerName: request.officialServerName,
        officialPlayers: request.officialPlayers,
      })
      set((state) => applyBootstrapSnapshot(state, bootstrap, request))
      connectSocket(request.communityWebSocketUrl, clientId, 'launcher', get().applyEvents, set, () => scheduleReconnect(get, set))
    } catch (error) {
      set({
        loading: false,
        connection: 'error',
        error: error instanceof Error ? error.message : 'Community chat unavailable.',
      })
    }
  },
  refreshOfficialChat: async (reportErrors = true) => {
    const request = activeOfficialChatRequest
    if (!request?.communityApiUrl) return
    try {
      const result = await communityChatService.fetchMessages({
        communityApiUrl: request.communityApiUrl,
        channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
      })
      set((state) => mergePolledMessages(state, OFFICIAL_ASHFALL_CHAT_CHANNEL_ID, result.messages, result.hasMore))
    } catch (error) {
      if (!reportErrors) return
      set({ error: error instanceof Error ? error.message : 'Unable to refresh official chat.' })
    }
  },
  setActiveChannel: (channelId) => {
    set((state) => ({
      activeChannelId: channelId,
      channels: state.channels.map((channel) => channel.id === channelId ? { ...channel, unreadCount: 0 } : channel),
    }))
  },
  loadOlderMessages: async (communityApiUrl) => {
    const state = get()
    const channelId = state.activeChannelId
    if (state.loadingOlder || !state.hasMoreByChannel[channelId]) return
    const before = state.messagesByChannel[channelId]?.[0]?.createdAt
    set({ loadingOlder: true })
    try {
      const result = await communityChatService.fetchMessages({ communityApiUrl, channelId, before })
      set((current) => ({
        loadingOlder: false,
        hasMoreByChannel: { ...current.hasMoreByChannel, [channelId]: result.hasMore },
        messagesByChannel: {
          ...current.messagesByChannel,
          [channelId]: boundMessages([...(result.messages ?? []), ...(current.messagesByChannel[channelId] ?? [])]),
        },
      }))
    } catch (error) {
      set({
        loadingOlder: false,
        error: error instanceof Error ? error.message : 'Unable to load older chat messages.',
      })
    }
  },
  sendMessage: async (communityApiUrl, body) => {
    const state = get()
    const channel = state.channels.find((item) => item.id === state.activeChannelId)
    const cleanBody = sanitizeCommunityMessageBody(body)
    if (!cleanBody || !channel || channel.readOnly) return
    if (!state.nickname) {
      set({ error: 'Choose a chat nickname before posting.' })
      return
    }
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const optimistic = createCommunityMessage({
      id: `pending-${nonce}`,
      channelId: channel.id,
      author: { id: state.clientId, displayName: state.nickname, role: state.role === 'guest' ? 'member' : state.role },
      body: cleanBody,
      pending: true,
      nonce,
    })
    set((current) => ({
      sending: true,
      messagesByChannel: {
        ...current.messagesByChannel,
        [channel.id]: boundMessages([...(current.messagesByChannel[channel.id] ?? []), optimistic]),
      },
    }))
    try {
      const confirmed = await communityChatService.sendMessage({
        communityApiUrl,
        channelId: channel.id,
        body: cleanBody,
        clientId: state.clientId,
        nickname: state.nickname,
        nonce,
      })
      set((current) => ({
        sending: false,
        messagesByChannel: {
          ...current.messagesByChannel,
          [channel.id]: boundMessages(
            (current.messagesByChannel[channel.id] ?? []).map((message) => message.nonce === nonce ? confirmed : message),
          ),
        },
      }))
    } catch (error) {
      set((current) => ({
        sending: false,
        error: error instanceof Error ? error.message : 'Unable to send chat message.',
        messagesByChannel: {
          ...current.messagesByChannel,
          [channel.id]: (current.messagesByChannel[channel.id] ?? []).map((message) =>
            message.nonce === nonce ? { ...message, pending: false, failed: true } : message,
          ),
        },
      }))
    }
  },
  hideMessage: (messageId) => {
    const state = get()
    if (!canModerateCommunityChat(state.role)) return
    set((current) => ({
      messagesByChannel: updateMessage(current.messagesByChannel, messageId, (message) => ({ ...message, hidden: true })),
    }))
  },
  reportMessage: (messageId) => {
    set((current) => ({
      messagesByChannel: updateMessage(current.messagesByChannel, messageId, (message) => ({
        ...message,
        updatedAt: new Date().toISOString(),
      })),
    }))
  },
  applyEvents: (events) => {
    set((state) => {
      let messagesByChannel = state.messagesByChannel
      let channels = state.channels
      let members = state.members
      let bridge = state.bridge
      for (const event of events) {
        if (event.type === 'message.created') {
          const message = parseIncomingMessage(event.payload)
          if (!message) continue
          const upserted = upsertMessages(messagesByChannel[message.channelId] ?? [], [message])
          messagesByChannel = {
            ...messagesByChannel,
            [message.channelId]: boundMessages(upserted.messages),
          }
          if (upserted.inserted.length && message.channelId !== state.activeChannelId && message.author.id !== state.clientId) {
            channels = channels.map((channel) =>
              channel.id === message.channelId ? { ...channel, unreadCount: Math.min(999, channel.unreadCount + 1) } : channel,
            )
          }
        }
        if (event.type === 'message.deleted') {
          const messageId = isRecord(event.payload) ? String(event.payload.messageId ?? '') : ''
          messagesByChannel = updateMessage(messagesByChannel, messageId, (message) => ({ ...message, hidden: true }))
        }
        if (event.type === 'presence.updated') {
          const member = parseIncomingMember(event.payload)
          if (!member) continue
          members = [...members.filter((item) => item.id !== member.id), member]
        }
        if (event.type === 'channel.updated') {
          const update = parseIncomingChannelUpdate(event.payload)
          if (!update) continue
          channels = channels.map((channel) => channel.id === update.channelId ? { ...channel, ...update.channelPatch } : channel)
          if (update.bridgeConnected !== undefined) {
            bridge = bridge.map((item) =>
              item.channelId === update.channelId ? { ...item, connected: update.bridgeConnected ?? item.connected } : item,
            )
          }
        }
      }
      return { messagesByChannel, channels, members, bridge }
    })
  },
  reset: () => {
    activeOfficialChatRequest = null
    closeSocket()
    clearPollTimer()
    set({ ...initialState, clientId: getOrCreateClientId() })
  },
}))

function connectSocket(
  url: string,
  clientId: string,
  source: 'launcher' | 'android',
  applyEvents: (events: CommunityChatEventEnvelope[]) => void,
  set: (partial: Partial<CommunityChatStore>) => void,
  scheduleReconnect: () => void,
) {
  reconnectEnabled = false
  closeSocketOnly()
  clearReconnectTimer()
  if (!url || typeof WebSocket === 'undefined') {
    set({ connection: url ? 'error' : 'offline' })
    return
  }
  try {
    const socketUrl = new URL(url)
    socketUrl.searchParams.set('clientId', clientId)
    socketUrl.searchParams.set('source', source)
    const nextSocket = new WebSocket(socketUrl)
    socket = nextSocket
    reconnectEnabled = true
    nextSocket.addEventListener('open', () => {
      reconnectAttempts = 0
      set({ connection: 'connected' })
    })
    nextSocket.addEventListener('close', () => {
      if (socket !== nextSocket) return
      set({ connection: 'offline' })
      if (reconnectEnabled) scheduleReconnect()
    })
    nextSocket.addEventListener('error', () => {
      if (socket !== nextSocket) return
      set({ connection: 'error' })
      if (reconnectEnabled) scheduleReconnect()
    })
    nextSocket.addEventListener('message', (event) => {
      const envelope = parseEventEnvelope(event.data)
      if (!envelope) return
      queuedEvents.push(envelope)
      if (flushTimer !== null) return
      flushTimer = globalThis.setTimeout(() => {
        const nextEvents = queuedEvents
        queuedEvents = []
        flushTimer = null
        applyEvents(nextEvents)
      }, 50) as unknown as number
    })
  } catch {
    set({ connection: 'error' })
    if (reconnectEnabled) scheduleReconnect()
  }
}

function closeSocket() {
  reconnectEnabled = false
  reconnectAttempts = 0
  closeSocketOnly()
  clearReconnectTimer()
}

function closeSocketOnly() {
  if (socket) socket.close()
  socket = null
  queuedEvents = []
  if (flushTimer !== null) globalThis.clearTimeout(flushTimer)
  flushTimer = null
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) globalThis.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function clearPollTimer() {
  if (pollTimer !== null) globalThis.clearInterval(pollTimer)
  pollTimer = null
}

function startPolling(get: () => CommunityChatStore) {
  clearPollTimer()
  if (!activeOfficialChatRequest?.communityApiUrl) return
  pollTimer = globalThis.setInterval(() => {
    void get().refreshOfficialChat(false)
  }, OFFICIAL_CHAT_POLL_INTERVAL_MS) as unknown as number
}

function scheduleReconnect(get: () => CommunityChatStore, set: (partial: Partial<CommunityChatStore>) => void) {
  if (reconnectTimer !== null || !activeOfficialChatRequest?.communityWebSocketUrl) return
  reconnectAttempts += 1
  const delayMs = reconnectAttempts === 1 ? RECONNECT_FAST_MS : RECONNECT_SLOW_MS
  reconnectTimer = globalThis.setTimeout(() => {
    reconnectTimer = null
    const request = activeOfficialChatRequest
    if (!request) return
    connectSocket(request.communityWebSocketUrl, get().clientId, 'launcher', get().applyEvents, set, () => scheduleReconnect(get, set))
  }, delayMs) as unknown as number
}

function getOrCreateClientId() {
  if (typeof window === 'undefined') return 'test-client'
  const existing = window.localStorage.getItem(STORAGE_KEY)
  if (existing) return existing
  const next = `client-${cryptoSafeId()}`
  window.localStorage.setItem(STORAGE_KEY, next)
  return next
}

function cryptoSafeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function applyBootstrapSnapshot(
  state: CommunityChatStore,
  bootstrap: CommunityChatBootstrap,
  request: CommunityChatBootstrapRequest,
): Partial<CommunityChatStore> {
  const availableChannelIds = new Set(bootstrap.channels.map((channel) => channel.id))
  const activeChannelId = availableChannelIds.has(state.activeChannelId)
    ? state.activeChannelId
    : bootstrap.channels[0]?.id ?? OFFICIAL_ASHFALL_CHAT_CHANNEL_ID
  return {
    activeChannelId,
    groups: bootstrap.groups,
    channels: bootstrap.channels.map((channel) => channel.id === activeChannelId ? { ...channel, unreadCount: 0 } : channel),
    members: bootstrap.members,
    messagesByChannel: mapBoundedMessages(bootstrap.messages),
    hasMoreByChannel: bootstrap.hasMore,
    loading: false,
    connection: request.communityWebSocketUrl ? 'connecting' : request.communityApiUrl ? 'connected' : 'offline',
    nickname: bootstrap.self.nickname || request.nickname,
    role: bootstrap.self.role,
    rules: bootstrap.moderation.rules,
    bridge: bootstrap.bridge,
  }
}

function mergePolledMessages(
  state: CommunityChatStore,
  channelId: string,
  incomingMessages: CommunityChatMessage[],
  hasMore: boolean,
): Partial<CommunityChatStore> {
  const upserted = upsertMessages(state.messagesByChannel[channelId] ?? [], incomingMessages)
  const remoteInserted = upserted.inserted.filter((message) => message.author.id !== state.clientId)
  return {
    error: null,
    hasMoreByChannel: { ...state.hasMoreByChannel, [channelId]: hasMore },
    messagesByChannel: {
      ...state.messagesByChannel,
      [channelId]: boundMessages(upserted.messages),
    },
    channels:
      remoteInserted.length && channelId !== state.activeChannelId
        ? state.channels.map((channel) =>
            channel.id === channelId
              ? { ...channel, unreadCount: Math.min(999, channel.unreadCount + remoteInserted.length) }
              : channel,
          )
        : state.channels,
  }
}

function mapBoundedMessages(messages: Record<string, CommunityChatMessage[]>) {
  return Object.fromEntries(Object.entries(messages).map(([channelId, channelMessages]) => [channelId, boundMessages(channelMessages)]))
}

function boundMessages(messages: CommunityChatMessage[]) {
  return messages
    .filter((message) => message.body)
    .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt))
    .slice(-COMMUNITY_CHAT_MAX_CHANNEL_MESSAGES)
}

function upsertMessage(messages: CommunityChatMessage[], incoming: CommunityChatMessage) {
  const existingIndex = messages.findIndex(
    (message) => message.id === incoming.id || Boolean(incoming.nonce && message.nonce === incoming.nonce),
  )
  if (existingIndex === -1) return { messages: [...messages, incoming], inserted: true }
  return {
    messages: messages.map((message, index) => index === existingIndex ? incoming : message),
    inserted: false,
  }
}

function upsertMessages(messages: CommunityChatMessage[], incoming: CommunityChatMessage[]) {
  return incoming.reduce(
    (result, message) => {
      const upserted = upsertMessage(result.messages, message)
      return {
        messages: upserted.messages,
        inserted: upserted.inserted ? [...result.inserted, message] : result.inserted,
      }
    },
    { messages, inserted: [] as CommunityChatMessage[] },
  )
}

function updateMessage(
  messagesByChannel: Record<string, CommunityChatMessage[]>,
  messageId: string,
  update: (message: CommunityChatMessage) => CommunityChatMessage,
) {
  return Object.fromEntries(
    Object.entries(messagesByChannel).map(([channelId, messages]) => [
      channelId,
      messages.map((message) => message.id === messageId ? update(message) : message),
    ]),
  )
}

function parseIncomingMessage(payload: unknown): CommunityChatMessage | null {
  if (!isRecord(payload)) return null
  const body = sanitizeCommunityMessageBody(payload.body)
  const channelId = typeof payload.channelId === 'string' ? payload.channelId : ''
  const id = typeof payload.id === 'string' ? payload.id : ''
  if (!body || !channelId || !id) return null
  const author = isRecord(payload.author) ? payload.author : {}
  return createCommunityMessage({
    id,
    channelId,
      author: {
        id: typeof author.id === 'string' ? author.id : 'unknown',
        displayName: typeof author.displayName === 'string' ? author.displayName : 'Unknown',
        role: parseRole(author.role),
        source: parseSource(author.source),
      },
    body,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
    nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
    source: parseSource(payload.source),
  })
}

function parseIncomingMember(payload: unknown): CommunityChatMember | null {
  if (!isRecord(payload) || typeof payload.id !== 'string') return null
  return {
    id: payload.id,
    displayName: typeof payload.displayName === 'string' ? payload.displayName : payload.id,
    role: parseRole(payload.role),
    status: payload.status === 'idle' || payload.status === 'offline' ? payload.status : 'online',
    source: parseSource(payload.source),
    ...(typeof payload.channelId === 'string' ? { channelId: payload.channelId } : {}),
  }
}

function parseIncomingChannelUpdate(payload: unknown): {
  channelId: string
  channelPatch: Partial<CommunityChatChannel>
  bridgeConnected?: boolean
} | null {
  if (!isRecord(payload) || typeof payload.channelId !== 'string') return null
  const patch: Partial<CommunityChatChannel> = {}
  if (typeof payload.unreadCount === 'number') patch.unreadCount = Math.max(0, Math.min(999, Math.floor(payload.unreadCount)))
  if (typeof payload.onlineCount === 'number') patch.onlineCount = Math.max(0, Math.floor(payload.onlineCount))
  const bridge = isRecord(payload.bridge) ? payload.bridge : null
  return {
    channelId: payload.channelId,
    channelPatch: patch,
    ...(typeof bridge?.connected === 'boolean' ? { bridgeConnected: bridge.connected } : {}),
  }
}

function parseRole(value: unknown): CommunityChatRole {
  return value === 'owner' || value === 'admin' || value === 'moderator' || value === 'guest' ? value : 'member'
}

function parseSource(value: unknown) {
  return value === 'android' || value === 'minecraft' || value === 'discord' || value === 'system' ? value : 'launcher'
}

function parseEventEnvelope(value: unknown): CommunityChatEventEnvelope | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!isRecord(parsed) || typeof parsed.type !== 'string') return null
    return {
      type: parsed.type as CommunityChatEventEnvelope['type'],
      payload: parsed.payload,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
