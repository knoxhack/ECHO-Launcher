import { invokeNative, requireNative } from './nativeBridge'

export class ConfigPatchService {
  async resetConfigs(profileId: string) {
    return {
      profileId,
      backedUp: true,
      resetPaths: ['config/ashfall', 'config/echo', 'config/weathercore'],
    }
  }

  async diffConfig(profileId: string) {
    return {
      profileId,
      changedFiles: ['config/ashfall/worldgen.toml', 'config/echosoundcore/audio.toml'],
    }
  }

  async backupConfig(profileId: string) {
    requireNative()
    return invokeNative('backup:create', { profileId, sourcePath: `config/${profileId}` })
  }
}

export const configPatchService = new ConfigPatchService()
