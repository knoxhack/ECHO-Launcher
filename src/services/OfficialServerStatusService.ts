import { parseOfficialServerStatus, type OfficialServerStatus, type OfficialServerStatusFallback } from '../types/serverStatus'

export interface OfficialServerStatusFetchOptions {
  timeoutMs?: number
  fallback?: OfficialServerStatusFallback
}

export async function fetchOfficialServerStatus(url: string, options: OfficialServerStatusFetchOptions = {}): Promise<OfficialServerStatus> {
  const statusUrl = String(url ?? '').trim()
  if (!statusUrl) {
    throw new Error('Official server status URL is not configured.')
  }

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 5000)
  try {
    const response = await fetch(statusUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Official server status returned HTTP ${response.status}.`)
    }
    const parsed = parseOfficialServerStatus(await response.json(), options.fallback)
    if (!parsed) {
      throw new Error('Official server status JSON did not match schemaVersion 1.')
    }
    return parsed
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
