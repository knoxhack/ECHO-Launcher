import type { ChatIdentity, ChatRole, PublicChatSource } from '../types/chat.js'
import { ChatError } from './chatError.js'
import { randomUUID } from 'node:crypto'

export const MAX_MESSAGE_LENGTH = 2000
export const DEFAULT_RULES = [
  'Keep it helpful.',
  'No harassment or hate speech.',
  'Do not paste tokens, secrets, or private logs.',
]

export function sanitizePlainText(input: unknown) {
  return stripUnsafeControlCharacters(String(input ?? ''))
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH)
}

export function normalizeNickname(input: unknown) {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)
}

export function readIdentity(headers: Record<string, unknown>): ChatIdentity {
  const clientId = readHeader(headers['x-echo-chat-client'])
  const nickname = normalizeNickname(readHeader(headers['x-echo-chat-nickname']))
  if (!clientId) throw new ChatError('Missing X-ECHO-Chat-Client header.', 401)
  return { clientId, nickname, source: readPublicSource(headers['x-echo-chat-source']) }
}

export function readOptionalIdentity(headers: Record<string, unknown>): ChatIdentity {
  const clientId = readHeader(headers['x-echo-chat-client']) || 'anonymous-preview'
  const nickname = normalizeNickname(readHeader(headers['x-echo-chat-nickname']))
  return { clientId, nickname, source: readPublicSource(headers['x-echo-chat-source']) }
}

export function requireNickname(identity: ChatIdentity) {
  if (!identity.nickname) throw new ChatError('Choose a chat nickname before posting.', 400)
}

export function canModerate(role: ChatRole) {
  return role === 'owner' || role === 'admin' || role === 'moderator'
}

export function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`
}

function readHeader(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? '').trim()
  return String(value ?? '').trim()
}

export function readPublicSource(value: unknown): PublicChatSource {
  const source = readHeader(value).toLowerCase()
  if (!source) return 'launcher'
  if (source === 'launcher' || source === 'android') return source
  throw new ChatError('Unsupported chat source.', 400)
}

function stripUnsafeControlCharacters(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
    })
    .join('')
}
