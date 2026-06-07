import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import { WebSocket } from 'ws'
import type { ChatServiceConfig } from '../config/env.js'
import type { ChatRepository } from '../repositories/ChatRepository.js'
import { LocalEventBus, RedisEventBus, type EventBus } from '../realtime/EventBus.js'
import { RealtimeHub } from '../realtime/RealtimeHub.js'
import { BridgeState } from '../services/BridgeState.js'
import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from '../services/RateLimiter.js'
import { ChatService } from '../services/ChatService.js'
import { ChatError } from '../utils/chatError.js'
import { readIdentity, readOptionalIdentity, readPublicSource, sanitizePlainText } from '../utils/validation.js'

export interface CreateChatAppOptions {
  config: ChatServiceConfig
  repository: ChatRepository
  eventBus?: EventBus
  rateLimiter?: RateLimiter
  logger?: boolean
}

export interface ChatApp {
  app: FastifyInstance
  service: ChatService
  hub: RealtimeHub
  close: () => Promise<void>
}

export async function createChatApp(options: CreateChatAppOptions): Promise<ChatApp> {
  const app = Fastify({ logger: options.logger ?? false })
  const eventBus = options.eventBus ?? createEventBus(options.config.redisUrl)
  if (eventBus instanceof RedisEventBus) await eventBus.start()
  const bridgeState = new BridgeState()
  const rateLimiter = options.rateLimiter ?? createRateLimiter(options.config.redisUrl)
  const service = new ChatService({
    repository: options.repository,
    rateLimiter,
    messageRateLimitWindowMs: options.config.messageRateLimitWindowMs,
    messageRateLimitMax: options.config.messageRateLimitMax,
    defaultSlowModeSeconds: options.config.defaultSlowModeSeconds,
    bridgeStatus: (serverId) => bridgeState.isConnected(serverId),
  })
  const hub = new RealtimeHub(eventBus)
  hub.start()

  await options.repository.initialize()
  await options.repository.ensureDefaultChannels()
  await app.register(cors, {
    origin: options.config.corsOrigin === '*' ? true : options.config.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-ECHO-Chat-Client', 'X-ECHO-Chat-Nickname', 'X-ECHO-Chat-Source'],
  })
  await app.register(websocket)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ChatError) {
      void reply.status(error.statusCode).send({ error: error.message })
      return
    }
    void reply.status(500).send({ error: error instanceof Error ? error.message : 'Internal chat service error.' })
  })

  app.get('/health', async () => ({ ok: true, service: 'echo-community-chat' }))

  app.get('/v1/community/bootstrap', async (request) => {
    return service.bootstrap(readOptionalIdentity(request.headers))
  })

  app.get('/v1/channels/:channelId/messages', async (request) => {
    const params = request.params as { channelId: string }
    const query = request.query as { before?: string; after?: string; limit?: string }
    return service.listMessages(params.channelId, {
      before: query.before,
      after: query.after,
      limit: query.limit ? Number(query.limit) : 50,
    })
  })

  app.post('/v1/channels/:channelId/messages', async (request, reply) => {
    const params = request.params as { channelId: string }
    const body = asRecord(request.body)
    const message = await service.sendMessage(readIdentity(request.headers), {
      channelId: params.channelId,
      body: body.body,
      nonce: typeof body.nonce === 'string' ? body.nonce : undefined,
    })
    await hub.publish('message.created', message)
    return reply.status(201).send(message)
  })

  app.patch('/v1/messages/:messageId', async (request) => {
    const params = request.params as { messageId: string }
    const body = asRecord(request.body)
    const message = await service.editMessage(readIdentity(request.headers), params.messageId, body.body)
    await hub.publish('message.updated', message)
    return message
  })

  app.delete('/v1/messages/:messageId', async (request) => {
    const params = request.params as { messageId: string }
    const message = await service.hideMessage(readIdentity(request.headers), params.messageId)
    await hub.publish('message.deleted', { messageId: message.id, channelId: message.channelId })
    return { ok: true, messageId: message.id }
  })

  app.post('/v1/messages/:messageId/report', async (request, reply) => {
    const params = request.params as { messageId: string }
    const body = asRecord(request.body)
    const report = await service.reportMessage(readIdentity(request.headers), params.messageId, body.reason)
    return reply.status(201).send(report)
  })

  app.post('/v1/moderation/actions', async (request, reply) => {
    const body = asRecord(request.body)
    const action = await service.moderate(readIdentity(request.headers), {
      actionType: parseModerationActionType(body.actionType),
      targetUserId: typeof body.targetUserId === 'string' ? body.targetUserId : undefined,
      messageId: typeof body.messageId === 'string' ? body.messageId : undefined,
      reason: sanitizePlainText(body.reason),
      durationSeconds: Number.isFinite(Number(body.durationSeconds)) ? Number(body.durationSeconds) : undefined,
    })
    await hub.publish('moderation.action', action)
    return reply.status(201).send(action)
  })

  app.put('/v1/channels/:channelId/read', async (request) => {
    const params = request.params as { channelId: string }
    const body = asRecord(request.body)
    await service.markRead(readIdentity(request.headers), {
      channelId: params.channelId,
      lastReadMessageId: typeof body.lastReadMessageId === 'string' ? body.lastReadMessageId : undefined,
    })
    return { ok: true }
  })

  app.post('/v1/bridge/servers/:serverId/events', async (request, reply) => {
    const params = request.params as { serverId: string }
    requireBridgeAuth(options.config, params.serverId, request.headers)
    const body = asRecord(request.body)
    const sourceId = sanitizeBridgeSourceId(body.sourceId)
    if (!sourceId) throw new ChatError('Bridge event sourceId is required.', 400)
    bridgeState.rememberSourceId(params.serverId, sourceId)
    const result = await service.receiveBridgeEvent(params.serverId, {
      sourceId,
      type: body.type,
      player: body.player,
      authorId: body.authorId,
      authorName: body.authorName,
      body: body.body,
    })
    if (!result.duplicate) await hub.publish('message.created', result.message)
    return reply.status(result.duplicate ? 200 : 201).send({ ok: true, duplicate: result.duplicate, message: result.message })
  })

  app.get('/v1/bridge/servers/:serverId/socket', { websocket: true }, (socket, request) => {
    const params = request.params as { serverId: string }
    try {
      requireBridgeAuth(options.config, params.serverId, request.headers)
    } catch (error) {
      socket.close(1008, error instanceof Error ? error.message : 'Bridge authorization failed.')
      return
    }

    void service.bridgeChannelForServer(params.serverId)
      .then(async (channel) => {
        if (bridgeState.connect(params.serverId)) {
          await publishBridgeStatus(hub, params.serverId, channel.id, true)
        }
        const unsubscribe = eventBus.subscribe((event) => {
          if (socket.readyState !== WebSocket.OPEN || event.type !== 'message.created') return
          const payload = asRecord(event.payload)
          if (payload.channelId !== channel.id || (payload.source !== 'launcher' && payload.source !== 'android')) return
          socket.send(JSON.stringify(event))
        })
        socket.on('close', () => {
          unsubscribe()
          if (bridgeState.disconnect(params.serverId)) {
            void publishBridgeStatus(hub, params.serverId, channel.id, false)
          }
        })
      })
      .catch((error: unknown) => {
        socket.close(1011, error instanceof Error ? error.message : 'Bridge socket failed.')
      })
  })

  app.get('/v1/chat/socket', { websocket: true }, (socket, request) => {
    let source: ReturnType<typeof readPublicSource>
    try {
      source = readPublicSource((request.query as { source?: string }).source)
    } catch (error) {
      socket.close(1008, error instanceof Error ? error.message : 'Unsupported chat source.')
      return
    }
    hub.add(socket)
    const clientId = String((request.query as { clientId?: string }).clientId ?? 'anonymous-preview')
    void hub.publish('presence.updated', {
      id: clientId,
      displayName: clientId,
      role: 'member',
      status: 'online',
      source,
    })
  })

  return {
    app,
    service,
    hub,
    close: async () => {
      await app.close()
      await hub.close()
      await eventBus.close()
      await rateLimiter.close()
      await options.repository.close()
      bridgeState.clear()
    },
  }
}

function createEventBus(redisUrl: string): EventBus {
  return redisUrl ? new RedisEventBus(redisUrl) : new LocalEventBus()
}

function createRateLimiter(redisUrl: string): RateLimiter {
  return redisUrl ? new RedisRateLimiter(redisUrl) : new MemoryRateLimiter()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function requireBridgeAuth(config: ChatServiceConfig, serverId: string, headers: Record<string, unknown>) {
  const expected = config.bridgeTokens[serverId]
  if (!expected) throw new ChatError('Bridge is not configured for this server.', 401)
  const actual = readBearerToken(headers.authorization)
  if (!actual || actual !== expected) throw new ChatError('Bridge authorization failed.', 401)
}

function readBearerToken(value: unknown) {
  const text = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
  const match = /^Bearer\s+(.+)$/i.exec(text.trim())
  return match?.[1]?.trim() ?? ''
}

function sanitizeBridgeSourceId(value: unknown) {
  return sanitizePlainText(value).replace(/\s+/g, '-').slice(0, 160)
}

async function publishBridgeStatus(hub: RealtimeHub, serverId: string, channelId: string, connected: boolean) {
  await hub.publish('channel.updated', {
    channelId,
    serverId,
    bridge: { connected },
  })
}

function parseModerationActionType(value: unknown) {
  if (value === 'timeout_user' || value === 'ban_user') return value
  return 'hide_message'
}
