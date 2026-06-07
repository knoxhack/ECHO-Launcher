export type ChatRole = 'owner' | 'admin' | 'moderator' | 'member' | 'guest'
export type ChatChannelKind = 'announcement' | 'community' | 'minecraft_server' | 'system'
export type ChatSource = 'launcher' | 'android' | 'minecraft' | 'discord' | 'system'
export type PublicChatSource = Extract<ChatSource, 'launcher' | 'android'>
export type ChatMemberStatus = 'online' | 'idle' | 'offline'
export type ModerationActionType = 'hide_message' | 'timeout_user' | 'ban_user'

export interface ChatUser {
  id: string
  clientId: string
  nickname: string
  role: ChatRole
  timedOutUntil?: string | null
  bannedUntil?: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatChannel {
  id: string
  groupId: string
  groupLabel: string
  name: string
  description: string
  kind: ChatChannelKind
  readOnly: boolean
  slowModeSeconds: number
  unreadCount: number
  onlineCount?: number
  serverId?: string
  position: number
}

export interface ChatAuthor {
  id: string
  displayName: string
  role: ChatRole
  source: ChatSource
}

export interface ChatMessage {
  id: string
  channelId: string
  author: ChatAuthor
  authorUserId: string
  body: string
  createdAt: string
  updatedAt?: string
  hidden?: boolean
  pinned?: boolean
  nonce?: string
  source: ChatSource
}

export interface ChatMember {
  id: string
  displayName: string
  role: ChatRole
  status: ChatMemberStatus
  source: ChatSource
  channelId?: string
}

export interface ChatBootstrap {
  groups: Array<{ id: string; label: string; channelIds: string[] }>
  channels: ChatChannel[]
  members: ChatMember[]
  self: {
    clientId: string
    nickname: string
    role: ChatRole
  }
  messages: Record<string, ChatMessage[]>
  hasMore: Record<string, boolean>
  bridge: Array<{
    serverId: string
    channelId: string
    label: string
    connected: boolean
  }>
  moderation: {
    slowModeSeconds: number
    rules: string[]
  }
}

export interface ChatEventEnvelope {
  type:
    | 'message.created'
    | 'message.updated'
    | 'message.deleted'
    | 'presence.updated'
    | 'typing.started'
    | 'typing.stopped'
    | 'channel.updated'
    | 'moderation.action'
  payload: unknown
  createdAt: string
}

export interface ChatIdentity {
  clientId: string
  nickname: string
  source?: PublicChatSource
}

export interface CreateMessageInput {
  channelId: string
  authorUserId: string
  body: string
  source: ChatSource
  nonce?: string
}

export interface ModerationAction {
  id: string
  moderatorUserId: string
  targetUserId?: string | null
  messageId?: string | null
  actionType: ModerationActionType
  reason: string
  durationSeconds?: number | null
  createdAt: string
}
