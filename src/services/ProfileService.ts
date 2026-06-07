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
    return { ...profile, channel: channel === 'stable' ? channel : 'stable', channelLabel: 'Release' }
  }

  updateEnabledAddons(profile: LauncherProfile, enabledAddons: string[]): LauncherProfile {
    return { ...profile, enabledAddons, moduleCount: enabledAddons.length }
  }
}

export const profileService = new ProfileService()
