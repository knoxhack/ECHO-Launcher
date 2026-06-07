import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_SERVER_STALE_MS,
  formatOfficialServerUpdatedAt,
  getOfficialServerRuntimeState,
  parseOfficialServerStatus,
} from '../types/serverStatus'

const baseStatus = {
  schemaVersion: 1,
  serverId: 'official-ashfall',
  serverName: 'ECHO Ashfall Official',
  motd: 'Survive. Adapt. Endure.',
  online: true,
  playerCount: 7,
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
  recentEvents: [
    {
      type: 'chat',
      player: 'KnoxHack',
      message: 'hello',
      createdAt: '2026-05-24T12:00:00Z',
    },
  ],
  lastUpdated: '2026-05-24T12:00:00Z',
}

describe('official server status parser', () => {
  it('parses an online status payload', () => {
    const status = parseOfficialServerStatus(baseStatus)

    expect(status?.serverName).toBe('ECHO Ashfall Official')
    expect(status?.playerCount).toBe(7)
    expect(status?.maxPlayers).toBe(40)
    expect(status?.players).toEqual(['KnoxHack'])
    expect(status?.discord.linked).toBe(true)
  })

  it('parses offline status without dropping known capacity', () => {
    const status = parseOfficialServerStatus({ ...baseStatus, online: false, playerCount: 0 })

    expect(status?.online).toBe(false)
    expect(status?.playerCount).toBe(0)
    expect(status?.maxPlayers).toBe(40)
    expect(getOfficialServerRuntimeState(status, false, null, Date.parse(baseStatus.lastUpdated))).toBe('offline')
  })

  it('marks old payloads as stale', () => {
    const status = parseOfficialServerStatus(baseStatus)
    const now = Date.parse(baseStatus.lastUpdated) + OFFICIAL_SERVER_STALE_MS + 1000

    expect(getOfficialServerRuntimeState(status, false, null, now)).toBe('stale')
    expect(formatOfficialServerUpdatedAt(status, now)).toBe('2m ago')
  })

  it('rejects malformed JSON and supports the unavailable card state', () => {
    expect(parseOfficialServerStatus({ schemaVersion: 2 })).toBeNull()
    expect(parseOfficialServerStatus('bad')).toBeNull()
    expect(getOfficialServerRuntimeState(null, false, 'fetch failed')).toBe('unavailable')
  })

  it('fills launcher defaults when optional public fields are missing', () => {
    const status = parseOfficialServerStatus(
      {
        schemaVersion: 1,
        online: true,
        playerCount: 1,
        maxPlayers: 10,
        lastUpdated: baseStatus.lastUpdated,
      },
      { serverName: 'Ashfall Official', discordInviteUrl: 'https://discord.gg/fallback' },
    )

    expect(status?.serverName).toBe('Ashfall Official')
    expect(status?.discord.inviteUrl).toBe('https://discord.gg/fallback')
  })
})
