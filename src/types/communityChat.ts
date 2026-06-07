export type CommunityChatRole = 'owner' | 'admin' | 'moderator' | 'member' | 'guest'

export type CommunityChatChannelKind = 'announcement' | 'community' | 'minecraft_server' | 'system'

export type CommunityChatSource = 'launcher' | 'android' | 'minecraft' | 'discord' | 'system'

export type CommunityChatConnectionState = 'idle' | 'connecting' | 'connected' | 'offline' | 'error'

export interface CommunityChatAuthor {
  id: string
  displayName: string
  role: CommunityChatRole
  source: CommunityChatSource
}

export interface CommunityChatMessage {
  id: string
  channelId: string
  author: CommunityChatAuthor
  body: string
  createdAt: string
  updatedAt?: string
  hidden?: boolean
  pinned?: boolean
  pending?: boolean
  failed?: boolean
  nonce?: string
  source: CommunityChatSource
}

export interface CommunityChatChannel {
  id: string
  groupId: string
  name: string
  description: string
  kind: CommunityChatChannelKind
  readOnly: boolean
  slowModeSeconds: number
  unreadCount: number
  onlineCount?: number
  serverId?: string
}

export interface CommunityChatChannelGroup {
  id: string
  label: string
  channelIds: string[]
}

export interface CommunityChatMember {
  id: string
  displayName: string
  role: CommunityChatRole
  status: 'online' | 'idle' | 'offline'
  source: CommunityChatSource
  channelId?: string
}

export interface CommunityChatSelf {
  clientId: string
  nickname: string
  role: CommunityChatRole
}

export interface CommunityChatBootstrap {
  groups: CommunityChatChannelGroup[]
  channels: CommunityChatChannel[]
  members: CommunityChatMember[]
  self: CommunityChatSelf
  messages: Record<string, CommunityChatMessage[]>
  hasMore: Record<string, boolean>
  bridge: {
    serverId: string
    channelId: string
    label: string
    connected: boolean
  }[]
  moderation: {
    slowModeSeconds: number
    rules: string[]
  }
}

export interface CommunityChatEventEnvelope {
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

export interface CommunityChatSettings {
  communityApiUrl: string
  communityWebSocketUrl: string
  chatNickname: string
  chatNotifications: boolean
}
