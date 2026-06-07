import type {
  ChatChannel,
  ChatMember,
  ChatMessage,
  ChatUser,
  CreateMessageInput,
  ModerationAction,
} from '../types/chat.js'
import {
  type ChatRepository,
  type CreateModerationActionInput,
  type CreateReportInput,
  type MessagePage,
  type MessagePageOptions,
  defaultChannels,
} from './ChatRepository.js'
import { createId } from '../utils/validation.js'

export class MemoryChatRepository implements ChatRepository {
  private users = new Map<string, ChatUser>()
  private channels = new Map<string, ChatChannel>()
  private messages = new Map<string, ChatMessage>()
  private reports = new Map<string, { id: string; createdAt: string }>()
  private moderationActions = new Map<string, ModerationAction>()
  private readStates = new Map<string, { userId: string; channelId: string; lastReadMessageId?: string; readAt: string }>()

  async initialize() {
    await this.ensureDefaultChannels()
  }

  async close() {
    return undefined
  }

  async ensureDefaultChannels() {
    for (const channel of defaultChannels) {
      this.channels.set(channel.id, {
        unreadCount: 0,
        onlineCount: 0,
        ...channel,
      })
    }
  }

  async getOrCreateUser(identity: { clientId: string; nickname: string }) {
    const existing = [...this.users.values()].find((user) => user.clientId === identity.clientId)
    const now = new Date().toISOString()
    if (existing) {
      if (identity.nickname && existing.nickname !== identity.nickname) {
        const updated = { ...existing, nickname: identity.nickname, updatedAt: now }
        this.users.set(updated.id, updated)
        return updated
      }
      return existing
    }
    const user: ChatUser = {
      id: createId('user'),
      clientId: identity.clientId,
      nickname: identity.nickname || 'Guest',
      role: 'member',
      createdAt: now,
      updatedAt: now,
    }
    this.users.set(user.id, user)
    return user
  }

  async findUserByClientId(clientId: string) {
    return [...this.users.values()].find((user) => user.clientId === clientId) ?? null
  }

  async findUserById(userId: string) {
    return this.users.get(userId) ?? null
  }

  async listChannels() {
    return [...this.channels.values()].sort((first, second) => first.position - second.position)
  }

  async findChannel(channelId: string) {
    return this.channels.get(channelId) ?? null
  }

  async listMembers(limit: number): Promise<ChatMember[]> {
    return [...this.users.values()].slice(0, limit).map((user) => ({
      id: user.id,
      displayName: user.nickname,
      role: user.role,
      status: 'online',
      source: 'launcher',
    }))
  }

  async listMessages(channelId: string, options: MessagePageOptions): Promise<MessagePage> {
    const sorted = this.messagesForChannel(channelId)
    let filtered = sorted
    if (options.before) filtered = filtered.filter((message) => message.createdAt < options.before!)
    if (options.after) filtered = filtered.filter((message) => message.createdAt > options.after!)
    const selected = filtered.slice(-options.limit)
    return {
      messages: selected,
      hasMore: selected.length > 0 && sorted.some((message) => message.createdAt < selected[0]!.createdAt),
    }
  }

  async listLatestMessages(channelIds: string[], limit: number) {
    const result: Record<string, MessagePage> = {}
    for (const channelId of channelIds) {
      result[channelId] = await this.listMessages(channelId, { limit })
    }
    return result
  }

  async createMessage(input: CreateMessageInput) {
    const user = await this.findUserById(input.authorUserId)
    if (!user) throw new Error(`Unknown author ${input.authorUserId}`)
    const now = new Date().toISOString()
    const message: ChatMessage = {
      id: createId('message'),
      channelId: input.channelId,
      authorUserId: input.authorUserId,
      author: {
        id: user.id,
        displayName: user.nickname,
        role: user.role,
        source: input.source,
      },
      body: input.body,
      createdAt: now,
      hidden: false,
      pinned: false,
      nonce: input.nonce,
      source: input.source,
    }
    this.messages.set(message.id, message)
    return message
  }

  async updateMessage(messageId: string, patch: { body?: string; hidden?: boolean }) {
    const current = this.messages.get(messageId)
    if (!current) return null
    const next: ChatMessage = {
      ...current,
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
      updatedAt: new Date().toISOString(),
    }
    this.messages.set(messageId, next)
    return next
  }

  async findMessage(messageId: string) {
    return this.messages.get(messageId) ?? null
  }

  async findMessageByNonce(channelId: string, nonce: string) {
    return this.messagesForChannel(channelId).find((message) => message.nonce === nonce) ?? null
  }

  async findLastUserMessage(channelId: string, authorUserId: string) {
    return this.messagesForChannel(channelId).filter((message) => message.authorUserId === authorUserId).at(-1) ?? null
  }

  async createReport(input: CreateReportInput) {
    const report = { id: createId('report'), createdAt: new Date().toISOString() }
    this.reports.set(report.id, report)
    void input
    return report
  }

  async createModerationAction(input: CreateModerationActionInput) {
    const action: ModerationAction = {
      id: createId('mod'),
      moderatorUserId: input.moderatorUserId,
      targetUserId: input.targetUserId,
      messageId: input.messageId,
      actionType: input.actionType,
      reason: input.reason,
      durationSeconds: input.durationSeconds,
      createdAt: new Date().toISOString(),
    }
    this.moderationActions.set(action.id, action)
    return action
  }

  async setReadState(input: { userId: string; channelId: string; lastReadMessageId?: string }) {
    this.readStates.set(`${input.userId}:${input.channelId}`, { ...input, readAt: new Date().toISOString() })
  }

  async applyUserRestriction(input: { userId: string; actionType: 'timeout_user' | 'ban_user'; durationSeconds?: number | null }) {
    const user = this.users.get(input.userId)
    if (!user) return null
    const until = input.durationSeconds ? new Date(Date.now() + input.durationSeconds * 1000).toISOString() : null
    const next: ChatUser = {
      ...user,
      ...(input.actionType === 'timeout_user' ? { timedOutUntil: until } : { bannedUntil: until }),
      updatedAt: new Date().toISOString(),
    }
    this.users.set(next.id, next)
    return next
  }

  setUserRole(clientId: string, role: ChatUser['role']) {
    const user = [...this.users.values()].find((item) => item.clientId === clientId)
    if (!user) return
    this.users.set(user.id, { ...user, role, updatedAt: new Date().toISOString() })
  }

  private messagesForChannel(channelId: string) {
    return [...this.messages.values()]
      .filter((message) => message.channelId === channelId)
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id))
  }
}
