import { describe, expect, it } from 'vitest'
import type { LauncherProfile } from '../types/profiles'
import { profileService } from './ProfileService'

const baseProfile: LauncherProfile = {
  id: 'ashfall-native-edition',
  name: 'Ashfall Native Edition',
  channel: 'stable',
  channelLabel: 'Release',
  version: '0.1.0',
  minecraft: '26.1.2',
  neoforge: 'N/A',
  ramGb: 6,
  moduleCount: 0,
  lastPlayed: 'Never',
  playtime: '0h',
  status: 'missing',
  enabledAddons: [],
}

describe('ProfileService', () => {
  it('preserves Native alpha channel selection', () => {
    const profile = profileService.updateChannel(baseProfile, 'alpha')

    expect(profile.channel).toBe('alpha')
    expect(profile.channelLabel).toBe('Alpha')
  })

  it('preserves Standalone experimental channel selection', () => {
    const profile = profileService.updateChannel(
      { ...baseProfile, id: 'ashfall-standalone-edition', name: 'Ashfall Standalone Edition' },
      'experimental',
    )

    expect(profile.channel).toBe('experimental')
    expect(profile.channelLabel).toBe('Experimental')
  })
})
