import type { PackManifest } from '../types/manifests'
import { invokeNative, requireNative } from './nativeBridge'

export class NeoForgeInstallerService {
  async validateNeoForgeVersion(version: string) {
    return {
      version,
      valid: version.startsWith('26.1.2'),
      message: version.startsWith('26.1.2') ? 'NeoForge version aligned.' : 'NeoForge version mismatch.',
    }
  }

  async installOrRepair(version: string, manifest?: PackManifest, installPath?: string) {
    requireNative()
    const result = await invokeNative('neoforge:ensure', { manifest, installPath })
    return {
      version,
      staged: Boolean(result.installerPath),
      repaired: result.ok,
      message: result.message,
    }
  }
}

export const neoForgeInstallerService = new NeoForgeInstallerService()
