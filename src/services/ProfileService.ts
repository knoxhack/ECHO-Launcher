import type { Channel } from '../types/launcher'
import type { LauncherProfile } from '../types/profiles'

export class ProfileService {
  updateRam(profile: LauncherProfile, ramGb: number): LauncherProfile {
    return { ...profile, ramGb }
  }

  updateJavaPath(profile: LauncherProfile, javaPath: string): LauncherProfile {
    return { ...profile, neoforge: `${profile.neoforge} (${javaPath})` }
  }

  updateChannel(profile: LauncherProfile, channel: Channel): LauncherProfile {
    const labels: Partial<Record<Channel, string>> = {
      alpha: 'Alpha',
      experimental: 'Experimental',
      stable: 'Release',
      beta: 'Beta',
      nightly: 'Nightly',
      'dev-local': 'Dev Local',
      dev: 'Dev',
    }
    return { ...profile, channel, channelLabel: labels[channel] ?? profile.channelLabel }
  }

  updateEnabledAddons(profile: LauncherProfile, enabledAddons: string[]): LauncherProfile {
    return { ...profile, enabledAddons, moduleCount: enabledAddons.length }
  }
}

export const profileService = new ProfileService()
