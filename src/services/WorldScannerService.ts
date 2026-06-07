import type { WorldCompatibilityReport } from '../types/diagnostics'
import { invokeNative, requireNative } from './nativeBridge'

export class WorldScannerService {
  async scanWorld(worldPath: string, profileId?: string): Promise<WorldCompatibilityReport> {
    requireNative()
    return invokeNative('world:scan', { worldPath, profileId })
  }
}

export const worldScannerService = new WorldScannerService()
