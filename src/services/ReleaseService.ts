import type { Channel } from '../types/launcher'
import type { OfficialPackId, PackManifest } from '../types/manifests'
import type { LauncherDesktopSettings, ReleaseFetchResult, ReleaseIndex } from '../types/releases'
import { invokeNative, requireNative } from './nativeBridge'

export class ReleaseService {
  async getSettings(): Promise<LauncherDesktopSettings> {
    requireNative()
    return invokeNative('settings:get')
  }

  async saveSettings(settings: Partial<LauncherDesktopSettings>): Promise<LauncherDesktopSettings> {
    requireNative()
    return invokeNative('settings:save', settings)
  }

  async listReleases(refresh = false): Promise<ReleaseIndex> {
    requireNative()
    return invokeNative('release:list', { refresh })
  }

  async fetchManifest(channel: Channel, version?: string, refresh = false, pack?: string): Promise<ReleaseFetchResult & { manifest: PackManifest }> {
    requireNative()
    return invokeNative('release:fetch-manifest', { channel, version, refresh, pack: pack as OfficialPackId | undefined })
  }

  async clearCache() {
    requireNative()
    return invokeNative('release:cache-clear')
  }
}

export const releaseService = new ReleaseService()
