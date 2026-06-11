import { describe, expect, it } from 'vitest'
import { migrateSettingsStoreState } from './settingsStore'

describe('settings store migration', () => {
  it('drops legacy release feed and publisher settings', () => {
    const migrated = migrateSettingsStoreState({
      releaseFeed: {
        provider: 'github',
        owner: 'knoxhack',
        repo: 'ECHO-Ashfall-Native-Edition',
        includePrereleases: true,
      },
      publisher: { owner: 'knoxhack' },
      publisherToken: 'secret',
      releaseIndex: {
        enabled: true,
        channelUrl: 'https://example.invalid/channel.json',
      },
      supportGuideUrl: 'https://example.invalid/support',
    })

    expect(migrated).toEqual({
      releaseIndex: {
        enabled: true,
        channelUrl: 'https://example.invalid/channel.json',
      },
      supportGuideUrl: 'https://example.invalid/support',
    })
  })
})
