import { describe, expect, it } from 'vitest'
import {
  normalizeOfficialServerSettings,
  officialServerFallbackFromSettings,
  officialServerSettingsDefaults,
} from './officialServerSettings'

describe('official server settings helpers', () => {
  it('normalizes blank settings to defaults', () => {
    expect(
      normalizeOfficialServerSettings({
        officialServerName: '   ',
        officialServerStatusUrl: '',
        officialDiscordInviteUrl: '   ',
        officialStatusPollSeconds: Number.NaN,
      }),
    ).toEqual(officialServerSettingsDefaults)
  })

  it('trims fields and clamps poll interval', () => {
    expect(
      normalizeOfficialServerSettings({
        officialServerName: '  Long Name  ',
        officialServerStatusUrl: '  https://status.example/status.json  ',
        officialDiscordInviteUrl: '  https://discord.gg/echo  ',
        officialStatusPollSeconds: 2,
      }),
    ).toEqual({
      officialServerName: 'Long Name',
      officialServerStatusUrl: 'https://status.example/status.json',
      officialDiscordInviteUrl: 'https://discord.gg/echo',
      officialStatusPollSeconds: 10,
    })
  })

  it('builds the status parser fallback from normalized settings', () => {
    expect(
      officialServerFallbackFromSettings({
        officialServerName: '  Ashfall Live  ',
        officialDiscordInviteUrl: ' https://discord.gg/live ',
      }),
    ).toEqual({
      serverName: 'Ashfall Live',
      discordInviteUrl: 'https://discord.gg/live',
    })
  })
})
