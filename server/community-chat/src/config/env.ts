import 'dotenv/config'

export interface ChatServiceConfig {
  port: number
  host: string
  databaseUrl: string
  redisUrl: string
  corsOrigin: string
  bridgeTokens: Record<string, string>
  messageRateLimitWindowMs: number
  messageRateLimitMax: number
  defaultSlowModeSeconds: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ChatServiceConfig {
  return {
    port: readInt(env.PORT, 8787),
    host: env.HOST?.trim() || '127.0.0.1',
    databaseUrl: env.DATABASE_URL?.trim() ?? '',
    redisUrl: env.REDIS_URL?.trim() ?? '',
    corsOrigin: env.CORS_ORIGIN?.trim() || 'http://127.0.0.1:5173',
    bridgeTokens: parseBridgeTokens(env.COMMUNITY_BRIDGE_TOKENS),
    messageRateLimitWindowMs: readInt(env.MESSAGE_RATE_LIMIT_WINDOW_MS, 10_000),
    messageRateLimitMax: readInt(env.MESSAGE_RATE_LIMIT_MAX, 6),
    defaultSlowModeSeconds: readInt(env.DEFAULT_SLOW_MODE_SECONDS, 5),
  }
}

function parseBridgeTokens(value: string | undefined) {
  const tokens: Record<string, string> = {}
  for (const pair of (value ?? '').split(',')) {
    const separator = pair.indexOf(':')
    if (separator <= 0) continue
    const serverId = pair.slice(0, separator).trim()
    const token = pair.slice(separator + 1).trim()
    if (serverId && token) tokens[serverId] = token
  }
  return tokens
}

function readInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}
