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

  it('migrates the legacy raw-IP default when requested', () => {
    expect(
      normalizeOfficialServerSettings(
        {
          officialServerName: 'Ashfall Official',
          officialServerStatusUrl: 'http://64.74.111.235:16363/status.json',
          officialDiscordInviteUrl: '',
          officialStatusPollSeconds: 30,
        },
        { migrateLegacyDefaults: true },
      ).officialServerStatusUrl,
    ).toBe('https://api.echoplatform.dev/status.json')

    expect(
      normalizeOfficialServerSettings(
        {
          officialServerName: 'Ashfall Official',
          officialServerStatusUrl: 'http://64.74.111.235:17000/status.json',
          officialDiscordInviteUrl: '',
          officialStatusPollSeconds: 30,
        },
        { migrateLegacyDefaults: true },
      ).officialServerStatusUrl,
    ).toBe('http://64.74.111.235:17000/status.json')
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
