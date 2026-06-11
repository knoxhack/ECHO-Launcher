import { bundledReleaseManifest } from '../data/bundledManifests'
import type { Channel } from '../types/launcher'
import type { PackManifest } from '../types/manifests'
import { invokeNative, requireNative } from './nativeBridge'

export interface ManifestComparison {
  missingFiles: string[]
  corruptFiles: string[]
  updateAvailable: boolean
  worldgenWarning: boolean
}

export class ManifestService {
  async loadManifest(channel: Channel = 'alpha'): Promise<PackManifest> {
    requireNative()
    const manifest = await invokeNative('manifest:load')
    return { ...manifest, channel }
  }

  async compareLocalVsRemote(): Promise<ManifestComparison> {
    requireNative()
    const result = await invokeNative('manifest:verify', {})
    return {
      missingFiles: result.missing,
      corruptFiles: result.corrupt,
      updateAvailable: result.missing.length > 0 || result.corrupt.length > 0,
      worldgenWarning: true,
    }
  }

  getChangelog() {
    return bundledReleaseManifest.notes
  }

  getAvailableChannels(): Channel[] {
    return ['alpha', 'experimental']
  }
}

export const manifestService = new ManifestService()
