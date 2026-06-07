import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useServerStatusStore } from './serverStatusStore'
import { getOfficialServerRuntimeState, OFFICIAL_SERVER_STALE_MS } from '../types/serverStatus'

const updatedAt = '2026-05-24T12:00:00.000Z'

const baseStatus = {
  schemaVersion: 1,
  serverId: 'official-ashfall',
  serverName: 'ECHO Ashfall Official',
  motd: 'Survive. Adapt. Endure.',
  online: true,
  playerCount: 4,
  maxPlayers: 40,
  players: ['KnoxHack'],
  discord: {
    linked: true,
    inviteUrl: 'https://discord.gg/example',
  },
  version: {
    minecraft: '26.1.2',
    neoforge: '26.1.2.29-beta',
    echo: '1.7.0',
  },
  recentEvents: [],
  lastUpdated: updatedAt,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('server status store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useServerStatusStore.getState().clearStatus()
  })

  it('loads status and applies fallback settings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ...baseStatus, serverName: '', discord: { linked: false } })))

    await useServerStatusStore.getState().refreshStatus('https://status.example/status.json', {
      serverName: 'Ashfall Official',
      discordInviteUrl: 'https://discord.gg/fallback',
    })

    const state = useServerStatusStore.getState()
    expect(state.error).toBeNull()
    expect(state.status?.serverName).toBe('Ashfall Official')
    expect(state.status?.discord.inviteUrl).toBe('https://discord.gg/fallback')
  })

  it('keeps last known status after a failed refresh and lets stale state win later', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(baseStatus))
      .mockRejectedValueOnce(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    await useServerStatusStore.getState().refreshStatus('https://status.example/status.json')
    await useServerStatusStore.getState().refreshStatus('https://status.example/status-fail.json')

    const state = useServerStatusStore.getState()
    expect(state.error).toBe('network down')
    expect(state.status?.playerCount).toBe(4)
    expect(getOfficialServerRuntimeState(state.status, state.loading, state.error, Date.parse(updatedAt) + OFFICIAL_SERVER_STALE_MS + 1000)).toBe('stale')
  })

  it('skips duplicate refreshes while status is fresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(baseStatus))
    vi.stubGlobal('fetch', fetchMock)

    await useServerStatusStore.getState().refreshStatus('https://status.example/status.json')
    await useServerStatusStore.getState().refreshStatus('https://status.example/status.json')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reuses an in-flight request for the same status source', async () => {
    let resolveResponse: (response: Response) => void = () => undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = useServerStatusStore.getState().refreshStatus('https://status.example/status.json')
    const second = useServerStatusStore.getState().refreshStatus('https://status.example/status.json')

    resolveResponse(jsonResponse(baseStatus))
    await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('turns malformed status into an unavailable state without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ schemaVersion: 2 })))

    await useServerStatusStore.getState().refreshStatus('https://status.example/status.json')

    const state = useServerStatusStore.getState()
    expect(state.status).toBeNull()
    expect(state.error).toContain('schemaVersion 1')
    expect(getOfficialServerRuntimeState(state.status, state.loading, state.error)).toBe('unavailable')
  })
})
