import type {
  ChatChannel,
  ChatMember,
  ChatMessage,
  ChatUser,
  CreateMessageInput,
  ModerationAction,
  ModerationActionType,
} from '../types/chat.js'

export interface MessagePageOptions {
  before?: string
  after?: string
  limit: number
}

export interface MessagePage {
  messages: ChatMessage[]
  hasMore: boolean
}

export interface CreateReportInput {
  messageId: string
  reporterUserId: string
  reason: string
}

export interface CreateModerationActionInput {
  moderatorUserId: string
  targetUserId?: string | null
  messageId?: string | null
  actionType: ModerationActionType
  reason: string
  durationSeconds?: number | null
}

export interface ChatRepository {
  initialize(): Promise<void>
  close(): Promise<void>
  ensureDefaultChannels(): Promise<void>
  getOrCreateUser(identity: { clientId: string; nickname: string }): Promise<ChatUser>
  findUserByClientId(clientId: string): Promise<ChatUser | null>
  findUserById(userId: string): Promise<ChatUser | null>
  listChannels(): Promise<ChatChannel[]>
  findChannel(channelId: string): Promise<ChatChannel | null>
  listMembers(limit: number): Promise<ChatMember[]>
  listMessages(channelId: string, options: MessagePageOptions): Promise<MessagePage>
  listLatestMessages(channelIds: string[], limit: number): Promise<Record<string, MessagePage>>
  createMessage(input: CreateMessageInput): Promise<ChatMessage>
  updateMessage(messageId: string, patch: { body?: string; hidden?: boolean }): Promise<ChatMessage | null>
  findMessage(messageId: string): Promise<ChatMessage | null>
  findMessageByNonce(channelId: string, nonce: string): Promise<ChatMessage | null>
  findLastUserMessage(channelId: string, authorUserId: string): Promise<ChatMessage | null>
  createReport(input: CreateReportInput): Promise<{ id: string; createdAt: string }>
  createModerationAction(input: CreateModerationActionInput): Promise<ModerationAction>
  setReadState(input: { userId: string; channelId: string; lastReadMessageId?: string }): Promise<void>
  applyUserRestriction(input: { userId: string; actionType: 'timeout_user' | 'ban_user'; durationSeconds?: number | null }): Promise<ChatUser | null>
}

export const defaultChannels: Omit<ChatChannel, 'unreadCount' | 'onlineCount'>[] = [
  {
    id: 'announcements',
    groupId: 'official',
    groupLabel: 'Official',
    name: 'announcements',
    description: 'Official ECHO launcher and Ashfall updates.',
    kind: 'announcement',
    readOnly: true,
    slowModeSeconds: 0,
    position: 10,
  },
  {
    id: 'status',
    groupId: 'official',
    groupLabel: 'Official',
    name: 'status',
    description: 'Live status, maintenance, and release readiness notes.',
    kind: 'system',
    readOnly: true,
    slowModeSeconds: 0,
    position: 20,
  },
  {
    id: 'rules',
    groupId: 'official',
    groupLabel: 'Official',
    name: 'rules',
    description: 'Community rules and moderation expectations.',
    kind: 'announcement',
    readOnly: true,
    slowModeSeconds: 0,
    position: 30,
  },
  {
    id: 'general',
    groupId: 'community',
    groupLabel: 'Community',
    name: 'general',
    description: 'General ECHO community chat.',
    kind: 'community',
    readOnly: false,
    slowModeSeconds: 5,
    position: 40,
  },
  {
    id: 'support',
    groupId: 'community',
    groupLabel: 'Community',
    name: 'support',
    description: 'Install, handoff, and crash help.',
    kind: 'community',
    readOnly: false,
    slowModeSeconds: 10,
    position: 50,
  },
  {
    id: 'modpacks',
    groupId: 'community',
    groupLabel: 'Community',
    name: 'modpacks',
    description: 'Pack feedback, builds, and module discussion.',
    kind: 'community',
    readOnly: false,
    slowModeSeconds: 5,
    position: 60,
  },
  {
    id: 'server-ashfall',
    groupId: 'servers',
    groupLabel: 'Official Servers',
    name: 'ashfall-official',
    description: 'Bidirectional launcher and in-game chat for the official server.',
    kind: 'minecraft_server',
    readOnly: false,
    slowModeSeconds: 5,
    serverId: 'official-ashfall',
    position: 70,
  },
]
