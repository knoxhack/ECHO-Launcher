import { Pool, type PoolClient, type QueryResultRow } from 'pg'
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

export class PostgresChatRepository implements ChatRepository {
  private pool: Pool

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl })
  }

  async initialize() {
    await this.pool.query('SELECT 1')
  }

  async close() {
    await this.pool.end()
  }

  async ensureDefaultChannels() {
    for (const channel of defaultChannels) {
      await this.pool.query(
        `
        INSERT INTO chat_channels (id, group_id, group_label, name, description, kind, read_only, slow_mode_seconds, server_id, position)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE SET
          group_id = EXCLUDED.group_id,
          group_label = EXCLUDED.group_label,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          kind = EXCLUDED.kind,
          read_only = EXCLUDED.read_only,
          slow_mode_seconds = EXCLUDED.slow_mode_seconds,
          server_id = EXCLUDED.server_id,
          position = EXCLUDED.position
        `,
        [
          channel.id,
          channel.groupId,
          channel.groupLabel,
          channel.name,
          channel.description,
          channel.kind,
          channel.readOnly,
          channel.slowModeSeconds,
          channel.serverId ?? null,
          channel.position,
        ],
      )
    }
  }

  async getOrCreateUser(identity: { clientId: string; nickname: string }) {
    const now = new Date().toISOString()
    const existing = await this.findUserByClientId(identity.clientId)
    if (existing) {
      if (identity.nickname && existing.nickname !== identity.nickname) {
        const result = await this.pool.query(
          'UPDATE chat_users SET nickname = $1, updated_at = $2 WHERE id = $3 RETURNING *',
          [identity.nickname, now, existing.id],
        )
        return mapUser(result.rows[0])
      }
      return existing
    }
    const result = await this.pool.query(
      `
      INSERT INTO chat_users (id, client_id, nickname, role, created_at, updated_at)
      VALUES ($1,$2,$3,'member',$4,$4)
      RETURNING *
      `,
      [createId('user'), identity.clientId, identity.nickname || 'Guest', now],
    )
    return mapUser(result.rows[0])
  }

  async findUserByClientId(clientId: string) {
    const result = await this.pool.query('SELECT * FROM chat_users WHERE client_id = $1', [clientId])
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  async findUserById(userId: string) {
    const result = await this.pool.query('SELECT * FROM chat_users WHERE id = $1', [userId])
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  async listChannels() {
    const result = await this.pool.query('SELECT * FROM chat_channels ORDER BY position ASC')
    return result.rows.map(mapChannel)
  }

  async findChannel(channelId: string) {
    const result = await this.pool.query('SELECT * FROM chat_channels WHERE id = $1', [channelId])
    return result.rows[0] ? mapChannel(result.rows[0]) : null
  }

  async listMembers(limit: number): Promise<ChatMember[]> {
    const result = await this.pool.query('SELECT * FROM chat_users ORDER BY updated_at DESC LIMIT $1', [limit])
    return result.rows.map((row) => {
      const user = mapUser(row)
      return {
        id: user.id,
        displayName: user.nickname,
        role: user.role,
        status: 'online',
        source: 'launcher',
      }
    })
  }

  async listMessages(channelId: string, options: MessagePageOptions): Promise<MessagePage> {
    const values: unknown[] = [channelId]
    let cursorWhere = ''
    if (options.before) {
      values.push(options.before)
      cursorWhere = `AND m.created_at < $${values.length}`
    } else if (options.after) {
      values.push(options.after)
      cursorWhere = `AND m.created_at > $${values.length}`
    }
    values.push(options.limit + 1)
    const result = await this.pool.query(
      `
      SELECT m.*, u.nickname, u.role
      FROM chat_messages m
      JOIN chat_users u ON u.id = m.author_user_id
      WHERE m.channel_id = $1 ${cursorWhere}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${values.length}
      `,
      values,
    )
    const rows = result.rows.slice(0, options.limit).reverse()
    return {
      messages: rows.map(mapMessage),
      hasMore: result.rows.length > options.limit,
    }
  }

  async listLatestMessages(channelIds: string[], limit: number) {
    const output: Record<string, MessagePage> = {}
    for (const channelId of channelIds) {
      output[channelId] = await this.listMessages(channelId, { limit })
    }
    return output
  }

  async createMessage(input: CreateMessageInput) {
    const id = createId('message')
    const now = new Date().toISOString()
    const result = await this.pool.query(
      `
      INSERT INTO chat_messages (id, channel_id, author_user_id, body, source, nonce, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (channel_id, nonce) WHERE nonce IS NOT NULL DO UPDATE SET nonce = EXCLUDED.nonce
      RETURNING *
      `,
      [id, input.channelId, input.authorUserId, input.body, input.source, input.nonce ?? null, now],
    )
    return this.hydrateMessage(result.rows[0])
  }

  async updateMessage(messageId: string, patch: { body?: string; hidden?: boolean }) {
    const current = await this.findMessage(messageId)
    if (!current) return null
    const result = await this.pool.query(
      `
      UPDATE chat_messages
      SET body = $1, hidden = $2, updated_at = $3
      WHERE id = $4
      RETURNING *
      `,
      [
        patch.body ?? current.body,
        patch.hidden ?? Boolean(current.hidden),
        new Date().toISOString(),
        messageId,
      ],
    )
    return this.hydrateMessage(result.rows[0])
  }

  async findMessage(messageId: string) {
    const result = await this.pool.query(
      `
      SELECT m.*, u.nickname, u.role
      FROM chat_messages m
      JOIN chat_users u ON u.id = m.author_user_id
      WHERE m.id = $1
      `,
      [messageId],
    )
    return result.rows[0] ? mapMessage(result.rows[0]) : null
  }

  async findMessageByNonce(channelId: string, nonce: string) {
    const result = await this.pool.query(
      `
      SELECT m.*, u.nickname, u.role
      FROM chat_messages m
      JOIN chat_users u ON u.id = m.author_user_id
      WHERE m.channel_id = $1 AND m.nonce = $2
      LIMIT 1
      `,
      [channelId, nonce],
    )
    return result.rows[0] ? mapMessage(result.rows[0]) : null
  }

  async findLastUserMessage(channelId: string, authorUserId: string) {
    const result = await this.pool.query(
      `
      SELECT m.*, u.nickname, u.role
      FROM chat_messages m
      JOIN chat_users u ON u.id = m.author_user_id
      WHERE m.channel_id = $1 AND m.author_user_id = $2
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
      `,
      [channelId, authorUserId],
    )
    return result.rows[0] ? mapMessage(result.rows[0]) : null
  }

  async createReport(input: CreateReportInput) {
    const id = createId('report')
    const createdAt = new Date().toISOString()
    await this.pool.query(
      'INSERT INTO chat_reports (id, message_id, reporter_user_id, reason, created_at) VALUES ($1,$2,$3,$4,$5)',
      [id, input.messageId, input.reporterUserId, input.reason, createdAt],
    )
    return { id, createdAt }
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
    await this.pool.query(
      `
      INSERT INTO chat_moderation_actions
        (id, moderator_user_id, target_user_id, message_id, action_type, reason, duration_seconds, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        action.id,
        action.moderatorUserId,
        action.targetUserId ?? null,
        action.messageId ?? null,
        action.actionType,
        action.reason,
        action.durationSeconds ?? null,
        action.createdAt,
      ],
    )
    return action
  }

  async setReadState(input: { userId: string; channelId: string; lastReadMessageId?: string }) {
    await this.pool.query(
      `
      INSERT INTO chat_read_states (user_id, channel_id, last_read_message_id, read_at)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id, channel_id) DO UPDATE SET
        last_read_message_id = EXCLUDED.last_read_message_id,
        read_at = EXCLUDED.read_at
      `,
      [input.userId, input.channelId, input.lastReadMessageId ?? null, new Date().toISOString()],
    )
  }

  async applyUserRestriction(input: { userId: string; actionType: 'timeout_user' | 'ban_user'; durationSeconds?: number | null }) {
    const until = input.durationSeconds ? new Date(Date.now() + input.durationSeconds * 1000).toISOString() : null
    const column = input.actionType === 'timeout_user' ? 'timed_out_until' : 'banned_until'
    const result = await this.pool.query(
      `UPDATE chat_users SET ${column} = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
      [until, new Date().toISOString(), input.userId],
    )
    return result.rows[0] ? mapUser(result.rows[0]) : null
  }

  private async hydrateMessage(row: QueryResultRow) {
    const client = await this.pool.connect()
    try {
      return await hydrateMessage(client, row)
    } finally {
      client.release()
    }
  }
}

async function hydrateMessage(client: PoolClient, row: QueryResultRow): Promise<ChatMessage> {
  const userResult = await client.query('SELECT * FROM chat_users WHERE id = $1', [row.author_user_id])
  return mapMessage({ ...row, nickname: userResult.rows[0]?.nickname, role: userResult.rows[0]?.role })
}

function mapUser(row: QueryResultRow): ChatUser {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    nickname: String(row.nickname),
    role: parseRole(row.role),
    timedOutUntil: iso(row.timed_out_until),
    bannedUntil: iso(row.banned_until),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  }
}

function mapChannel(row: QueryResultRow): ChatChannel {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    groupLabel: String(row.group_label),
    name: String(row.name),
    description: String(row.description),
    kind: parseChannelKind(row.kind),
    readOnly: Boolean(row.read_only),
    slowModeSeconds: Number(row.slow_mode_seconds) || 0,
    unreadCount: 0,
    onlineCount: 0,
    serverId: row.server_id ? String(row.server_id) : undefined,
    position: Number(row.position) || 0,
  }
}

function mapMessage(row: QueryResultRow): ChatMessage {
  const source = parseSource(row.source)
  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    authorUserId: String(row.author_user_id),
    author: {
      id: String(row.author_user_id),
      displayName: String(row.nickname ?? 'Unknown'),
      role: parseRole(row.role),
      source,
    },
    body: String(row.body),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? undefined,
    hidden: Boolean(row.hidden),
    pinned: Boolean(row.pinned),
    nonce: row.nonce ? String(row.nonce) : undefined,
    source,
  }
}

function parseRole(value: unknown): ChatUser['role'] {
  return value === 'owner' || value === 'admin' || value === 'moderator' || value === 'guest' ? value : 'member'
}

function parseChannelKind(value: unknown): ChatChannel['kind'] {
  return value === 'announcement' || value === 'minecraft_server' || value === 'system' ? value : 'community'
}

function parseSource(value: unknown): ChatMessage['source'] {
  return value === 'android' || value === 'minecraft' || value === 'discord' || value === 'system' ? value : 'launcher'
}

function iso(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const date = new Date(String(value))
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
