import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { ChatServiceConfig } from '../src/config/env.js'
import { createChatApp, type ChatApp } from '../src/http/app.js'
import { MemoryChatRepository } from '../src/repositories/MemoryChatRepository.js'

const config: ChatServiceConfig = {
  port: 0,
  host: '127.0.0.1',
  databaseUrl: '',
  redisUrl: '',
  corsOrigin: '*',
  bridgeTokens: { 'official-ashfall': 'dev-token' },
  messageRateLimitWindowMs: 10_000,
  messageRateLimitMax: 100,
  defaultSlowModeSeconds: 5,
}

let chatApp: ChatApp
let repository: MemoryChatRepository

const headers = {
  'x-echo-chat-client': 'client-knox',
  'x-echo-chat-nickname': 'Knox',
}

describe('community chat app', () => {
  beforeEach(async () => {
    repository = new MemoryChatRepository()
    chatApp = await createChatApp({ config, repository })
  })

  afterEach(async () => {
    await chatApp.close()
  })

  it('bootstraps launcher contract channels', async () => {
    const response = await chatApp.app.inject({
      method: 'GET',
      url: '/v1/community/bootstrap',
      headers,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.channels.map((channel: { id: string }) => channel.id)).toContain('server-ashfall')
    expect(body.groups.map((group: { id: string }) => group.id)).toEqual(['official', 'community', 'servers'])
    expect(body.self.nickname).toBe('Knox')
  })

  it('validates and stores plain text messages', async () => {
    const response = await chatApp.app.inject({
      method: 'POST',
      url: '/v1/channels/general/messages',
      headers,
      payload: {
        body: ` hello\u0000<script>alert(1)</script> `,
        nonce: 'abc',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().body).toBe('hello<script>alert(1)</script>')
    expect(response.json().nonce).toBe('abc')

    const page = await chatApp.app.inject({
      method: 'GET',
      url: '/v1/channels/general/messages?limit=50',
    })
    expect(page.json().messages).toHaveLength(1)
  })

  it('stores Android-origin public messages with explicit source', async () => {
    const response = await sendToChannel('server-ashfall', 'hello from android', 'android-nonce', {
      ...headers,
      'x-echo-chat-client': 'android-pixel',
      'x-echo-chat-nickname': 'Pixel Tester',
      'x-echo-chat-source': 'android',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      body: 'hello from android',
      nonce: 'android-nonce',
      source: 'android',
      author: expect.objectContaining({ source: 'android' }),
    })
  })

  it('rejects unsupported public chat sources', async () => {
    const response = await sendToChannel('general', 'bad source', 'bad-source-nonce', {
      ...headers,
      'x-echo-chat-source': 'discord',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toContain('Unsupported chat source')
  })

  it('enforces slow mode for normal members', async () => {
    await send('first slow mode message')
    const second = await send('second slow mode message')

    expect(second.statusCode).toBe(429)
    expect(second.json().error).toContain('Slow mode')
  })

  it('supports cursor pagination', async () => {
    await chatApp.app.inject({ method: 'GET', url: '/v1/community/bootstrap', headers })
    repository.setUserRole('client-knox', 'owner')
    for (let index = 0; index < 55; index += 1) {
      await send(`message ${index}`)
    }

    const page = await chatApp.app.inject({
      method: 'GET',
      url: '/v1/channels/general/messages?limit=50',
    })

    expect(page.statusCode).toBe(200)
    expect(page.json().messages).toHaveLength(50)
    expect(page.json().hasMore).toBe(true)
  })

  it('requires moderator role for delete', async () => {
    const message = await send('moderate me')

    const denied = await chatApp.app.inject({
      method: 'DELETE',
      url: `/v1/messages/${message.json().id}`,
      headers,
    })
    expect(denied.statusCode).toBe(403)

    repository.setUserRole('client-knox', 'moderator')
    const hidden = await chatApp.app.inject({
      method: 'DELETE',
      url: `/v1/messages/${message.json().id}`,
      headers,
    })
    expect(hidden.statusCode).toBe(200)
  })

  it('broadcasts message deltas over websocket', async () => {
    await chatApp.app.listen({ port: 0, host: '127.0.0.1' })
    const address = chatApp.app.server.address()
    if (!address || typeof address === 'string') throw new Error('missing listen address')
    const firstSocket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/chat/socket?clientId=listener-one`)
    const secondSocket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/chat/socket?clientId=listener-two`)
    await Promise.all([waitForOpen(firstSocket), waitForOpen(secondSocket)])

    const nextMessages = Promise.all([
      waitForEvent(firstSocket, 'message.created'),
      waitForEvent(secondSocket, 'message.created'),
    ])
    await send('socket hello', 'socket-nonce')

    const events = await nextMessages
    expect(events).toHaveLength(2)
    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({ body: 'socket hello', channelId: 'general', nonce: 'socket-nonce' }),
      expect.objectContaining({ body: 'socket hello', channelId: 'general', nonce: 'socket-nonce' }),
    ])
    firstSocket.close()
    secondSocket.close()
  })

  it('accepts authenticated bridge events and rejects missing tokens', async () => {
    const denied = await chatApp.app.inject({
      method: 'POST',
      url: '/v1/bridge/servers/official-ashfall/events',
      payload: bridgeEvent('bridge-chat-unauthorized'),
    })
    expect(denied.statusCode).toBe(401)

    const accepted = await bridgePost(bridgeEvent('bridge-chat-1', {
      type: 'minecraft.chat',
      player: 'Player_One',
      body: 'hello from minecraft',
    }))
    expect(accepted.statusCode).toBe(201)
    expect(accepted.json().message).toMatchObject({
      channelId: 'server-ashfall',
      body: 'hello from minecraft',
      nonce: 'minecraft:bridge-chat-1',
      source: 'minecraft',
    })

    const duplicate = await bridgePost(bridgeEvent('bridge-chat-1', {
      type: 'minecraft.chat',
      player: 'Player_One',
      body: 'hello from minecraft again',
    }))
    expect(duplicate.statusCode).toBe(200)
    expect(duplicate.json()).toMatchObject({ duplicate: true })

    const page = await chatApp.app.inject({
      method: 'GET',
      url: '/v1/channels/server-ashfall/messages?limit=50',
    })
    expect(page.json().messages.filter((message: { nonce?: string }) => message.nonce === 'minecraft:bridge-chat-1')).toHaveLength(1)
  })

  it('accepts Discord bridge chat as a distinct source', async () => {
    const accepted = await bridgePost(bridgeEvent('discord-chat-1', {
      type: 'discord.chat',
      authorId: '1411441469449044180:1234',
      authorName: 'Discord Tester',
      body: 'hello from discord',
    }))

    expect(accepted.statusCode).toBe(201)
    expect(accepted.json().message).toMatchObject({
      channelId: 'server-ashfall',
      body: 'hello from discord',
      nonce: 'discord:discord-chat-1',
      source: 'discord',
      author: expect.objectContaining({ displayName: 'Discord Tester', source: 'discord' }),
    })

    const duplicate = await bridgePost(bridgeEvent('discord-chat-1', {
      type: 'discord.chat',
      authorId: '1411441469449044180:1234',
      authorName: 'Discord Tester',
      body: 'hello from discord again',
    }))
    expect(duplicate.statusCode).toBe(200)
    expect(duplicate.json()).toMatchObject({ duplicate: true })
    expect(duplicate.json().message.body).toBe('hello from discord')
  })

  it('sends launcher and Android server channel messages to bridge sockets only', async () => {
    await chatApp.app.listen({ port: 0, host: '127.0.0.1' })
    const address = chatApp.app.server.address()
    if (!address || typeof address === 'string') throw new Error('missing listen address')
    const launcherSocket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/chat/socket?clientId=launcher-listener`)
    await waitForOpen(launcherSocket)
    const channelUpdate = waitForEvent(launcherSocket, 'channel.updated')
    const bridgeSocket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/bridge/servers/official-ashfall/socket`, {
      headers: { Authorization: 'Bearer dev-token' },
    })
    await waitForOpen(bridgeSocket)

    expect((await channelUpdate).payload).toMatchObject({
      channelId: 'server-ashfall',
      serverId: 'official-ashfall',
      bridge: { connected: true },
    })

    const bridgeMessage = waitForEvent(bridgeSocket, 'message.created')
    await sendToChannel('server-ashfall', 'launcher to minecraft', 'launcher-bridge-nonce')
    expect((await bridgeMessage).payload).toMatchObject({
      channelId: 'server-ashfall',
      body: 'launcher to minecraft',
      nonce: 'launcher-bridge-nonce',
      source: 'launcher',
    })

    const androidBridgeMessage = waitForEvent(bridgeSocket, 'message.created')
    await sendToChannel('server-ashfall', 'android to minecraft', 'android-bridge-nonce', {
      ...headers,
      'x-echo-chat-client': 'android-pixel',
      'x-echo-chat-nickname': 'Pixel Tester',
      'x-echo-chat-source': 'android',
    })
    expect((await androidBridgeMessage).payload).toMatchObject({
      channelId: 'server-ashfall',
      body: 'android to minecraft',
      nonce: 'android-bridge-nonce',
      source: 'android',
    })

    const unexpected = waitForEvent(bridgeSocket, 'message.created', 500)
    await bridgePost(bridgeEvent('bridge-system-1', {
      type: 'minecraft.join',
      player: 'Player_Two',
      body: 'joined',
    }))
    await bridgePost(bridgeEvent('bridge-discord-echo-1', {
      type: 'discord.chat',
      authorId: 'discord-user',
      authorName: 'Discord User',
      body: 'discord should not echo',
    }))
    await expect(unexpected).rejects.toThrow('timed out')
    bridgeSocket.close()
    launcherSocket.close()
  })
})

function send(body: string, nonce?: string) {
  return sendToChannel('general', body, nonce)
}

function sendToChannel(channelId: string, body: string, nonce?: string, requestHeaders: Record<string, string> = headers) {
  return chatApp.app.inject({
    method: 'POST',
    url: `/v1/channels/${channelId}/messages`,
    headers: requestHeaders,
    payload: { body, nonce },
  })
}

function bridgePost(payload: unknown) {
  return chatApp.app.inject({
    method: 'POST',
    url: '/v1/bridge/servers/official-ashfall/events',
    headers: { Authorization: 'Bearer dev-token' },
    payload,
  })
}

function bridgeEvent(sourceId: string, patch: Partial<{ type: string; player: string; authorId: string; authorName: string; body: string }> = {}) {
  return {
    sourceId,
    type: patch.type ?? 'minecraft.chat',
    player: patch.player ?? 'Player_One',
    authorId: patch.authorId,
    authorName: patch.authorName,
    body: patch.body ?? 'hello from minecraft',
  }
}

function waitForOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
}

function waitForEvent(socket: WebSocket, type: string, timeoutMs = 3000) {
  return new Promise<{ type: string; payload: unknown }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs)
    socket.on('message', (data) => {
      const event = JSON.parse(String(data)) as { type: string; payload: unknown }
      if (event.type === type) {
        clearTimeout(timer)
        resolve(event)
      }
    })
    socket.once('error', reject)
  })
}
