import type { ChatBootstrap, ChatChannel, ChatEventEnvelope, ChatMessage, ChatSource, ChatUser, ModerationActionType, PublicChatSource } from '../types/chat.js'
import type { ChatRepository } from '../repositories/ChatRepository.js'
import type { RateLimiter } from './RateLimiter.js'
import { ChatError, assertFound } from '../utils/chatError.js'
import { DEFAULT_RULES, canModerate, requireNickname, sanitizePlainText } from '../utils/validation.js'

export interface ChatServiceOptions {
  repository: ChatRepository
  rateLimiter: RateLimiter
  messageRateLimitWindowMs: number
  messageRateLimitMax: number
  defaultSlowModeSeconds: number
  bridgeStatus?: (serverId: string) => boolean
}

export type BridgeEventType =
  | 'minecraft.chat'
  | 'minecraft.join'
  | 'minecraft.leave'
  | 'minecraft.advancement'
  | 'minecraft.server_start'
  | 'minecraft.server_stop'
  | 'discord.chat'

export interface BridgeEventInput {
  sourceId: unknown
  type: unknown
  player: unknown
  authorId?: unknown
  authorName?: unknown
  body: unknown
}

export class ChatService {
  constructor(private options: ChatServiceOptions) {}

  async bootstrap(identity: { clientId: string; nickname: string }): Promise<ChatBootstrap> {
    const self = await this.options.repository.getOrCreateUser(identity)
    const channels = await this.options.repository.listChannels()
    const pages = await this.options.repository.listLatestMessages(
      channels.map((channel) => channel.id),
      50,
    )
    const messages = Object.fromEntries(Object.entries(pages).map(([channelId, page]) => [channelId, page.messages]))
    const hasMore = Object.fromEntries(Object.entries(pages).map(([channelId, page]) => [channelId, page.hasMore]))
    return {
      groups: buildGroups(channels),
      channels,
      members: await this.options.repository.listMembers(200),
      self: {
        clientId: self.clientId,
        nickname: self.nickname,
        role: self.role,
      },
      messages,
      hasMore,
      bridge: channels
        .filter((channel) => channel.kind === 'minecraft_server')
        .map((channel) => ({
          serverId: channel.serverId ?? channel.id,
          channelId: channel.id,
          label: channel.name.replace(/-/g, ' '),
          connected: this.options.bridgeStatus?.(channel.serverId ?? channel.id) ?? false,
        })),
      moderation: {
        slowModeSeconds: this.options.defaultSlowModeSeconds,
        rules: DEFAULT_RULES,
      },
    }
  }

  async listMessages(channelId: string, options: { before?: string; after?: string; limit?: number }) {
    await this.requireChannel(channelId)
    return this.options.repository.listMessages(channelId, {
      before: options.before,
      after: options.after,
      limit: Math.max(1, Math.min(50, options.limit ?? 50)),
    })
  }

  async sendMessage(identity: { clientId: string; nickname: string; source?: PublicChatSource }, input: { channelId: string; body: unknown; nonce?: string }) {
    requireNickname(identity)
    const user = await this.options.repository.getOrCreateUser(identity)
    this.assertCanPost(user)
    const channel = await this.requireChannel(input.channelId)
    if (channel.readOnly) throw new ChatError('This channel is read-only.', 403)
    const body = sanitizePlainText(input.body)
    if (!body) throw new ChatError('Message is empty.', 400)

    const allowed = await this.options.rateLimiter.consume(`message:${user.id}`, {
      windowMs: this.options.messageRateLimitWindowMs,
      max: this.options.messageRateLimitMax,
    })
    if (!allowed) throw new ChatError('You are sending messages too quickly.', 429)

    const slowModeSeconds = channel.slowModeSeconds || this.options.defaultSlowModeSeconds
    if (slowModeSeconds > 0 && !canModerate(user.role)) {
      const last = await this.options.repository.findLastUserMessage(channel.id, user.id)
      if (last) {
        const delta = Date.now() - Date.parse(last.createdAt)
        if (Number.isFinite(delta) && delta < slowModeSeconds * 1000) {
          throw new ChatError(`Slow mode is active for ${slowModeSeconds}s.`, 429)
        }
      }
    }

    if (input.nonce) {
      const existing = await this.options.repository.findMessageByNonce(channel.id, input.nonce)
      if (existing) return existing
    }

    return this.options.repository.createMessage({
      channelId: channel.id,
      authorUserId: user.id,
      body,
      source: publicSource(identity.source),
      nonce: typeof input.nonce === 'string' ? input.nonce : undefined,
    })
  }

  async editMessage(identity: { clientId: string; nickname: string }, messageId: string, body: unknown) {
    const user = await this.options.repository.getOrCreateUser(identity)
    const message = assertFound(await this.options.repository.findMessage(messageId), 'Message not found.')
    if (message.authorUserId !== user.id && !canModerate(user.role)) {
      throw new ChatError('Only the author or a moderator can edit this message.', 403)
    }
    if (message.authorUserId === user.id && !canModerate(user.role)) {
      const ageMs = Date.now() - Date.parse(message.createdAt)
      if (Number.isFinite(ageMs) && ageMs > 10 * 60_000) throw new ChatError('Message edit window has expired.', 403)
    }
    const cleanBody = sanitizePlainText(body)
    if (!cleanBody) throw new ChatError('Message is empty.', 400)
    return assertFound(await this.options.repository.updateMessage(message.id, { body: cleanBody }), 'Message not found.')
  }

  async hideMessage(identity: { clientId: string; nickname: string }, messageId: string) {
    const moderator = await this.requireModerator(identity)
    const message = assertFound(await this.options.repository.findMessage(messageId), 'Message not found.')
    await this.options.repository.createModerationAction({
      moderatorUserId: moderator.id,
      messageId: message.id,
      actionType: 'hide_message',
      reason: 'Message hidden by moderator.',
    })
    return assertFound(await this.options.repository.updateMessage(message.id, { hidden: true }), 'Message not found.')
  }

  async reportMessage(identity: { clientId: string; nickname: string }, messageId: string, reason: unknown) {
    requireNickname(identity)
    const user = await this.options.repository.getOrCreateUser(identity)
    await this.requireMessage(messageId)
    return this.options.repository.createReport({
      messageId,
      reporterUserId: user.id,
      reason: sanitizePlainText(reason) || 'Reported from launcher.',
    })
  }

  async moderate(identity: { clientId: string; nickname: string }, input: {
    actionType: ModerationActionType
    targetUserId?: string
    messageId?: string
    reason?: string
    durationSeconds?: number
  }) {
    const moderator = await this.requireModerator(identity)
    if (input.messageId && input.actionType === 'hide_message') {
      await this.options.repository.updateMessage(input.messageId, { hidden: true })
    }
    if ((input.actionType === 'timeout_user' || input.actionType === 'ban_user') && input.targetUserId) {
      await this.options.repository.applyUserRestriction({
        userId: input.targetUserId,
        actionType: input.actionType,
        durationSeconds: input.durationSeconds,
      })
    }
    return this.options.repository.createModerationAction({
      moderatorUserId: moderator.id,
      targetUserId: input.targetUserId,
      messageId: input.messageId,
      actionType: input.actionType,
      reason: sanitizePlainText(input.reason) || 'Moderator action.',
      durationSeconds: input.durationSeconds,
    })
  }

  async markRead(identity: { clientId: string; nickname: string }, input: { channelId: string; lastReadMessageId?: string }) {
    const user = await this.options.repository.getOrCreateUser(identity)
    await this.requireChannel(input.channelId)
    await this.options.repository.setReadState({
      userId: user.id,
      channelId: input.channelId,
      lastReadMessageId: input.lastReadMessageId,
    })
  }

  async bridgeChannelForServer(serverId: string): Promise<ChatChannel> {
    const channels = await this.options.repository.listChannels()
    return assertFound(
      channels.find((channel) => channel.kind === 'minecraft_server' && (channel.serverId ?? channel.id) === serverId) ?? null,
      'Bridge server channel not found.',
    )
  }

  async receiveBridgeEvent(serverId: string, input: BridgeEventInput): Promise<{ message: ChatMessage; duplicate: boolean }> {
    const channel = await this.bridgeChannelForServer(serverId)
    const type = parseBridgeEventType(input.type)
    const player = sanitizePlayerName(input.player)
    const authorName = sanitizeBridgeDisplayName(input.authorName)
    const body = bridgeBody(type, player || authorName, input.body)
    if (!body) throw new ChatError('Bridge event body is empty.', 400)
    const sourceId = sanitizeBridgeSourceId(input.sourceId)
    if (!sourceId) throw new ChatError('Bridge event sourceId is required.', 400)
    const nonce = bridgeNonce(type, sourceId)
    const existing = await this.options.repository.findMessageByNonce(channel.id, nonce)
    if (existing) return { message: existing, duplicate: true }

    const source: ChatSource = type === 'discord.chat' ? 'discord' : type === 'minecraft.chat' ? 'minecraft' : 'system'
    const author = bridgeAuthor(serverId, source, {
      player,
      authorId: sanitizeBridgeIdentity(input.authorId),
      authorName,
    })
    const user = await this.options.repository.getOrCreateUser({
      clientId: author.clientId,
      nickname: author.nickname,
    })
    const message = await this.options.repository.createMessage({
      channelId: channel.id,
      authorUserId: user.id,
      body,
      source,
      nonce,
    })
    return { message, duplicate: false }
  }

  event(type: ChatEventEnvelope['type'], payload: unknown): ChatEventEnvelope {
    return { type, payload, createdAt: new Date().toISOString() }
  }

  private async requireChannel(channelId: string) {
    return assertFound(await this.options.repository.findChannel(channelId), 'Channel not found.')
  }

  private async requireMessage(messageId: string) {
    return assertFound(await this.options.repository.findMessage(messageId), 'Message not found.')
  }

  private async requireModerator(identity: { clientId: string; nickname: string }) {
    const user = await this.options.repository.getOrCreateUser(identity)
    if (!canModerate(user.role)) throw new ChatError('Moderator role required.', 403)
    return user
  }

  private assertCanPost(user: ChatUser) {
    const now = Date.now()
    if (user.bannedUntil && Date.parse(user.bannedUntil) > now) throw new ChatError('This chat identity is banned.', 403)
    if (user.timedOutUntil && Date.parse(user.timedOutUntil) > now) throw new ChatError('This chat identity is timed out.', 403)
  }
}

export function sanitizeBridgeSourceId(value: unknown) {
  return sanitizePlainText(value).replace(/\s+/g, '-').slice(0, 160)
}

function parseBridgeEventType(value: unknown): BridgeEventType {
  if (
    value === 'minecraft.chat'
    || value === 'minecraft.join'
    || value === 'minecraft.leave'
    || value === 'minecraft.advancement'
    || value === 'minecraft.server_start'
    || value === 'minecraft.server_stop'
    || value === 'discord.chat'
  ) {
    return value
  }
  throw new ChatError('Unsupported bridge event type.', 400)
}

function bridgeBody(type: BridgeEventType, playerInput: string, bodyInput: unknown) {
  const body = sanitizePlainText(bodyInput)
  const player = playerInput || 'A player'
  if (type === 'minecraft.chat' || type === 'discord.chat') return body
  if (type === 'minecraft.join') return `${player} joined the server.`
  if (type === 'minecraft.leave') return `${player} left the server.`
  if (type === 'minecraft.advancement') return body || `${player} earned an advancement.`
  if (type === 'minecraft.server_start') return body || 'Server online.'
  return body || 'Server stopping.'
}

function publicSource(source: PublicChatSource | undefined): PublicChatSource {
  return source === 'android' ? 'android' : 'launcher'
}

function bridgeNonce(type: BridgeEventType, sourceId: string) {
  return `${type.startsWith('discord.') ? 'discord' : 'minecraft'}:${sourceId}`
}

function bridgeAuthor(
  serverId: string,
  source: ChatSource,
  input: { player: string; authorId: string; authorName: string },
) {
  if (source === 'discord') {
    const key = (input.authorId || input.authorName || 'unknown').toLowerCase()
    return {
      clientId: `discord:${serverId}:${key}`,
      nickname: input.authorName || 'Discord User',
    }
  }
  if (source === 'minecraft') {
    return {
      clientId: `minecraft:${serverId}:${(input.player || 'unknown').toLowerCase()}`,
      nickname: input.player || 'Minecraft Player',
    }
  }
  return {
    clientId: `system:${serverId}`,
    nickname: 'ECHO Server',
  }
}

function sanitizePlayerName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .slice(0, 32)
}

function sanitizeBridgeIdentity(value: unknown) {
  return sanitizePlainText(value).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 96)
}

function sanitizeBridgeDisplayName(value: unknown) {
  return sanitizePlainText(value).replace(/\s+/g, ' ').slice(0, 32)
}

function buildGroups(channels: Array<{ groupId: string; groupLabel: string; id: string; position: number }>) {
  const groups = new Map<string, { id: string; label: string; channelIds: string[]; position: number }>()
  for (const channel of channels) {
    const current = groups.get(channel.groupId) ?? {
      id: channel.groupId,
      label: channel.groupLabel,
      channelIds: [],
      position: channel.position,
    }
    current.channelIds.push(channel.id)
    current.position = Math.min(current.position, channel.position)
    groups.set(channel.groupId, current)
  }
  return [...groups.values()]
    .sort((first, second) => first.position - second.position)
    .map((group) => ({
      id: group.id,
      label: group.label,
      channelIds: group.channelIds,
    }))
}
