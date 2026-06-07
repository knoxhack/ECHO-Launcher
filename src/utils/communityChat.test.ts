import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_CHAT_MAX_BODY_LENGTH,
  communityChatUrlsFromStatusUrl,
  normalizeCommunityChatSettings,
  parseCommunityChatBootstrap,
  sanitizeCommunityMessageBody,
} from './communityChat'

describe('community chat helpers', () => {
  it('normalizes settings and nicknames', () => {
    expect(
      normalizeCommunityChatSettings({
        communityApiUrl: ' https://community.example/api ',
        communityWebSocketUrl: ' wss://community.example/v1/chat/socket ',
        chatNickname: '  Ashfall   Runner  ',
        chatNotifications: false,
      }),
    ).toEqual({
      communityApiUrl: 'https://community.example/api',
      communityWebSocketUrl: 'wss://community.example/v1/chat/socket',
      chatNickname: 'Ashfall Runner',
      chatNotifications: false,
    })
  })

  it('derives official chat URLs from the status URL port', () => {
    expect(communityChatUrlsFromStatusUrl('http://64.74.111.235:16363/status.json')).toEqual({
      communityApiUrl: 'http://64.74.111.235:16363',
      communityWebSocketUrl: 'ws://64.74.111.235:16363/v1/chat/socket',
    })
    expect(normalizeCommunityChatSettings({}, 'http://64.74.111.235:16363/status.json')).toMatchObject({
      communityApiUrl: 'http://64.74.111.235:16363',
      communityWebSocketUrl: 'ws://64.74.111.235:16363/v1/chat/socket',
    })
  })

  it('migrates old local chat defaults only when explicitly requested', () => {
    const input = {
      communityApiUrl: 'http://127.0.0.1:47870',
      communityWebSocketUrl: 'ws://127.0.0.1:47870/v1/chat/socket',
    }

    expect(normalizeCommunityChatSettings(input, 'http://64.74.111.235:16363/status.json')).toMatchObject(input)
    expect(
      normalizeCommunityChatSettings(input, 'http://64.74.111.235:16363/status.json', {
        migrateLegacyLocalDefaults: true,
      }),
    ).toMatchObject({
      communityApiUrl: 'http://64.74.111.235:16363',
      communityWebSocketUrl: 'ws://64.74.111.235:16363/v1/chat/socket',
    })
  })

  it('sanitizes message bodies for plain text chat', () => {
    const body = sanitizeCommunityMessageBody(` hello\u0000\n${'x'.repeat(COMMUNITY_CHAT_MAX_BODY_LENGTH + 10)} `)

    expect(body).not.toContain('\u0000')
    expect(body.length).toBe(COMMUNITY_CHAT_MAX_BODY_LENGTH)
  })

  it('parses a contract bootstrap payload and caps initial messages', () => {
    const payload = {
      groups: [{ id: 'community', label: 'Community', channelIds: ['general'] }],
      channels: [{ id: 'general', groupId: 'community', name: 'general', slowModeSeconds: 5 }],
      self: { clientId: 'client-1', nickname: 'Knox', role: 'owner' },
      messages: {
        general: Array.from({ length: 60 }, (_, index) => ({
          id: `message-${index}`,
          channelId: 'general',
          author: { id: 'u1', displayName: 'User', role: 'member', source: 'launcher' },
          body: `message ${index}`,
          createdAt: new Date(1_000 + index).toISOString(),
          source: 'launcher',
        })),
      },
      hasMore: { general: true },
    }

    const parsed = parseCommunityChatBootstrap(payload)

    expect(parsed?.self.role).toBe('owner')
    expect(parsed?.messages.general).toHaveLength(50)
    expect(parsed?.hasMore.general).toBe(true)
  })

  it('preserves supported source types and nonces', () => {
    const payload = {
      groups: [{ id: 'servers', label: 'Servers', channelIds: ['server-ashfall'] }],
      channels: [{ id: 'server-ashfall', groupId: 'servers', name: 'ashfall-official' }],
      messages: {
        'server-ashfall': ['launcher', 'android', 'minecraft', 'discord', 'system', 'bad-source'].map((source, index) => ({
          id: `message-${source}`,
          channelId: 'server-ashfall',
          author: { id: `u${index}`, displayName: source, source },
          body: source,
          createdAt: new Date(1_000 + index).toISOString(),
          nonce: `nonce-${source}`,
          source,
        })),
      },
    }

    const parsed = parseCommunityChatBootstrap(payload)
    const messages = parsed?.messages['server-ashfall'] ?? []

    expect(messages.map((message) => message.source)).toEqual(['launcher', 'android', 'minecraft', 'discord', 'system', 'launcher'])
    expect(messages.map((message) => message.nonce)).toEqual([
      'nonce-launcher',
      'nonce-android',
      'nonce-minecraft',
      'nonce-discord',
      'nonce-system',
      'nonce-bad-source',
    ])
  })
})
