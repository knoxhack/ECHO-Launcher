import { create } from 'zustand'
import { fetchOfficialServerStatus } from '../services/OfficialServerStatusService'
import type { OfficialServerStatus, OfficialServerStatusFallback } from '../types/serverStatus'

interface ServerStatusStore {
  status: OfficialServerStatus | null
  loading: boolean
  error: string | null
  lastFetchedAt: string | null
  refreshStatus: (url: string, fallback?: OfficialServerStatusFallback) => Promise<void>
  clearStatus: () => void
}

const SERVER_STATUS_FRESH_MS = 10_000
let requestSequence = 0
let inFlightRequest: { key: string; promise: Promise<void> } | null = null
let lastSuccessfulRequestKey: string | null = null
let lastSuccessfulRequestAt = 0

function statusRequestKey(url: string, fallback?: OfficialServerStatusFallback) {
  return [url, fallback?.serverName ?? '', fallback?.discordInviteUrl ?? ''].join('\n')
}

export const useServerStatusStore = create<ServerStatusStore>((set, get) => ({
  status: null,
  loading: false,
  error: null,
  lastFetchedAt: null,
  refreshStatus: async (url, fallback) => {
    const key = statusRequestKey(url, fallback)
    if (inFlightRequest?.key === key) return inFlightRequest.promise
    const state = get()
    if (
      state.status &&
      !state.error &&
      lastSuccessfulRequestKey === key &&
      Date.now() - lastSuccessfulRequestAt < SERVER_STATUS_FRESH_MS
    ) {
      return
    }
    const requestId = ++requestSequence
    set({ loading: true, error: null })
    const request = fetchOfficialServerStatus(url, { fallback })
      .then((status) => {
        if (requestId !== requestSequence) return
        lastSuccessfulRequestKey = key
        lastSuccessfulRequestAt = Date.now()
        set({
          status,
          loading: false,
          error: null,
          lastFetchedAt: new Date().toISOString(),
        })
      })
      .catch((error: unknown) => {
        if (requestId !== requestSequence) return
        set({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          lastFetchedAt: new Date().toISOString(),
        })
      })
      .finally(() => {
        if (inFlightRequest?.promise === request) inFlightRequest = null
      })
    inFlightRequest = { key, promise: request }
    return request
  },
  clearStatus: () => {
    requestSequence += 1
    inFlightRequest = null
    lastSuccessfulRequestKey = null
    lastSuccessfulRequestAt = 0
    set({ status: null, loading: false, error: null, lastFetchedAt: null })
  },
}))
