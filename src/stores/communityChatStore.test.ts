import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommunityChatStore } from './communityChatStore'
import { communityChatService } from '../services/CommunityChatService'
import type { CommunityChatBootstrap, CommunityChatMessage } from '../types/communityChat'
import { OFFICIAL_ASHFALL_CHAT_CHANNEL_ID, createCommunityMessage } from '../utils/communityChat'

const bootstrapRequest = {
  communityApiUrl: '',
  communityWebSocketUrl: '',
  nickname: 'Knox',
  officialServerName: 'Ashfall Official',
  officialPlayers: ['PlayerOne', 'PlayerTwo'],
}

describe('community chat store', () => {
  beforeEach(() => {
    useCommunityChatStore.getState().reset()
  })

  afterEach(() => {
    useCommunityChatStore.getState().reset()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('bootstraps local preview channels without a remote API', async () => {
    await useCommunityChatStore.getState().bootstrap(bootstrapRequest)

    const state = useCommunityChatStore.getState()
    expect(state.connection).toBe('offline')
    expect(state.channels.map((channel) => channel.id)).toContain(OFFICIAL_ASHFALL_CHAT_CHANNEL_ID)
    expect(state.members.some((member) => member.source === 'minecraft')).toBe(true)
  })

  it('clears unread counts when switching channels', async () => {
    await useCommunityChatStore.getState().bootstrap(bootstrapRequest)

    useCommunityChatStore.getState().setActiveChannel('general')

    const general = useCommunityChatStore.getState().channels.find((channel) => channel.id === 'general')
    expect(general?.unreadCount).toBe(0)
  })

  it('adds optimistic messages and replaces them with confirmed messages', async () => {
    await useCommunityChatStore.getState().bootstrap(bootstrapRequest)
    useCommunityChatStore.getState().setActiveChannel('general')

    await useCommunityChatStore.getState().sendMessage('', 'hello community')

    const messages = useCommunityChatStore.getState().messagesByChannel.general
    expect(messages.at(-1)?.body).toBe('hello community')
    expect(messages.at(-1)?.pending).toBeFalsy()
  })

  it('upserts websocket confirmations by nonce instead of duplicating optimistic messages', async () => {
    await useCommunityChatStore.getState().bootstrap(bootstrapRequest)
    useCommunityChatStore.getState().setActiveChannel('general')
    const state = useCommunityChatStore.getState()
    const nonce = 'confirm-nonce'
    const pending = createCommunityMessage({
      id: `pending-${nonce}`,
      channelId: 'general',
      author: { id: state.clientId, displayName: state.nickname, role: 'member' },
      body: 'dedupe me',
      pending: true,
      nonce,
    })
    useCommunityChatStore.setState((current) => ({
      messagesByChannel: {
        ...current.messagesByChannel,
        general: [...current.messagesByChannel.general, pending],
      },
    }))

    useCommunityChatStore.getState().applyEvents([
      messageCreated({
        id: 'server-confirmed-message',
        channelId: 'general',
        authorId: state.clientId,
        body: 'dedupe me',
        nonce,
      }),
      messageCreated({
        id: 'server-confirmed-message',
        channelId: 'general',
        authorId: state.clientId,
        body: 'dedupe me',
        nonce,
      }),
    ])

    const matches = useCommunityChatStore.getState().messagesByChannel.general.filter((message) => message.nonce === nonce)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ id: 'server-confirmed-message', pending: undefined, nonce })
    expect(useCommunityChatStore.getState().channels.find((channel) => channel.id === 'general')?.unreadCount).toBe(0)
  })

  it('increments unread once for remote inactive-channel websocket messages', async () => {
    await useCommunityChatStore.getState().bootstrap(bootstrapRequest)
    const ownClientId = useCommunityChatStore.getState().clientId

    useCommunityChatStore.getState().applyEvents([
      messageCreated({ id: 'support-remote', channelId: 'support', authorId: 'remote-client', body: 'support ping', nonce: 'support-1' }),
      messageCreated({ id: 'support-remote', channelId: 'support', authorId: 'remote-client', body: 'support ping', nonce: 'support-1' }),
      messageCreated({ id: 'modpacks-own', channelId: 'modpacks', authorId: ownClientId, body: 'own inactive ping', nonce: 'own-1' }),
    ])

    const state = useCommunityChatStore.getState()
    expect(state.channels.find((channel) => channel.id === 'support')?.unreadCount).toBe(1)
    expect(state.channels.find((channel) => channel.id === 'modpacks')?.unreadCount).toBe(0)
    expect(state.messagesByChannel.support.filter((message) => message.id === 'support-remote')).toHaveLength(1)
  })

  it('updates bridge connection state from channel update events', async () => {
    await useCommunityChatStore.getState().bootstrap(bootstrapRequest)

    useCommunityChatStore.getState().applyEvents([
      {
        type: 'channel.updated',
        createdAt: new Date().toISOString(),
        payload: {
          channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
          serverId: 'official-ashfall',
          bridge: { connected: false },
        },
      },
    ])

    expect(useCommunityChatStore.getState().bridge.find((item) => item.channelId === OFFICIAL_ASHFALL_CHAT_CHANNEL_ID)?.connected).toBe(false)
  })

  it('keeps Android and Discord websocket message sources', async () => {
    await useCommunityChatStore.getState().bootstrap(bootstrapRequest)

    useCommunityChatStore.getState().applyEvents([
      messageCreated({ id: 'android-message', channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID, authorId: 'android-user', body: 'from android', nonce: 'android-event', source: 'android' }),
      messageCreated({ id: 'discord-message', channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID, authorId: 'discord-user', body: 'from discord', nonce: 'discord-event', source: 'discord' }),
    ])

    const messages = useCommunityChatStore.getState().messagesByChannel[OFFICIAL_ASHFALL_CHAT_CHANNEL_ID]
    expect(messages.find((message) => message.id === 'android-message')?.source).toBe('android')
    expect(messages.find((message) => message.id === 'discord-message')?.source).toBe('discord')
  })

  it('app-wide startup bootstraps Discord history from the official channel', async () => {
    vi.spyOn(communityChatService, 'bootstrap').mockResolvedValue(remoteBootstrap([
      createCommunityMessage({
        id: 'discord-history',
        channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
        author: { id: 'discord:1', displayName: 'Discord User', source: 'discord' },
        body: 'from discord history',
        createdAt: '2026-05-31T12:00:00Z',
        nonce: 'discord:history',
        source: 'discord',
      }),
    ]))

    await useCommunityChatStore.getState().startOfficialChat({
      ...bootstrapRequest,
      communityApiUrl: 'http://chat.example.test',
      communityWebSocketUrl: '',
    })

    const messages = useCommunityChatStore.getState().messagesByChannel[OFFICIAL_ASHFALL_CHAT_CHANNEL_ID]
    expect(messages.find((message) => message.id === 'discord-history')).toMatchObject({
      source: 'discord',
      body: 'from discord history',
    })
  })

  it('poll fallback upserts Discord messages without duplicating by nonce', async () => {
    const discordMessage = createCommunityMessage({
      id: 'discord-polled',
      channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
      author: { id: 'discord:2', displayName: 'Discord User', source: 'discord' },
      body: 'from discord poll',
      createdAt: '2026-05-31T12:00:00Z',
      nonce: 'discord:polled',
      source: 'discord',
    })
    vi.spyOn(communityChatService, 'bootstrap').mockResolvedValue(remoteBootstrap([]))
    vi.spyOn(communityChatService, 'fetchMessages').mockResolvedValue({
      messages: [discordMessage],
      hasMore: false,
    })

    await useCommunityChatStore.getState().startOfficialChat({
      ...bootstrapRequest,
      communityApiUrl: 'http://chat.example.test',
      communityWebSocketUrl: '',
    })
    await useCommunityChatStore.getState().refreshOfficialChat(false)
    await useCommunityChatStore.getState().refreshOfficialChat(false)

    const messages = useCommunityChatStore.getState().messagesByChannel[OFFICIAL_ASHFALL_CHAT_CHANNEL_ID]
    expect(messages.filter((message) => message.nonce === 'discord:polled')).toHaveLength(1)
    expect(messages.find((message) => message.id === 'discord-polled')?.source).toBe('discord')
  })

  it('reconnects the official chat websocket after close', async () => {
    vi.useFakeTimers()
    class FakeWebSocket {
      static instances: FakeWebSocket[] = []
      readonly url: string | URL
      readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>()

      constructor(url: string | URL) {
        this.url = url
        FakeWebSocket.instances.push(this)
      }

      addEventListener(type: string, listener: (event: { data?: string }) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
      }

      close() {
        this.dispatch('close')
      }

      dispatch(type: string, event: { data?: string } = {}) {
        for (const listener of this.listeners.get(type) ?? []) listener(event)
      }
    }
    vi.stubGlobal('WebSocket', FakeWebSocket)

    await useCommunityChatStore.getState().startOfficialChat({
      ...bootstrapRequest,
      communityApiUrl: '',
      communityWebSocketUrl: 'ws://chat.example.test/v1/chat/socket',
    })
    expect(FakeWebSocket.instances).toHaveLength(1)

    FakeWebSocket.instances[0].dispatch('close')
    expect(useCommunityChatStore.getState().connection).toBe('offline')
    await vi.advanceTimersByTimeAsync(2_999)
    expect(FakeWebSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })
})

function messageCreated(input: {
  id: string
  channelId: string
  authorId: string
  body: string
  nonce: string
  source?: 'launcher' | 'android' | 'discord'
}) {
  const source = input.source ?? 'launcher'
  return {
    type: 'message.created' as const,
    createdAt: new Date().toISOString(),
    payload: {
      id: input.id,
      channelId: input.channelId,
      author: { id: input.authorId, displayName: input.authorId, role: 'member', source },
      body: input.body,
      createdAt: new Date().toISOString(),
      nonce: input.nonce,
      source,
    },
  }
}

function remoteBootstrap(messages: CommunityChatMessage[]): CommunityChatBootstrap {
  return {
    groups: [{ id: 'servers', label: 'Official Servers', channelIds: [OFFICIAL_ASHFALL_CHAT_CHANNEL_ID] }],
    channels: [
      {
        id: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID,
        groupId: 'servers',
        name: 'ashfall-official',
        description: 'Official chat',
        kind: 'minecraft_server',
        readOnly: false,
        slowModeSeconds: 0,
        unreadCount: 0,
      },
    ],
    members: [],
    self: { clientId: 'test-client', nickname: 'Knox', role: 'member' },
    messages: { [OFFICIAL_ASHFALL_CHAT_CHANNEL_ID]: messages },
    hasMore: { [OFFICIAL_ASHFALL_CHAT_CHANNEL_ID]: false },
    bridge: [{ serverId: 'official-ashfall', channelId: OFFICIAL_ASHFALL_CHAT_CHANNEL_ID, label: 'Ashfall Official', connected: true }],
    moderation: { slowModeSeconds: 0, rules: [] },
  }
}
