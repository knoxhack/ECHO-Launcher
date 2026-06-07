import type { NativeInstallResult } from '../types/native'
import type { Channel } from '../types/launcher'
import type { OfficialPackId } from '../types/manifests'
import { invokeNative, requireNative } from './nativeBridge'

export interface InstallRunOptions {
  profileId: string
  installPath?: string
  manifestPath?: string
  channel?: Channel
  pack?: string
  version?: string
  operationId?: string
  refresh?: boolean
}

export class InstallService {
  async runInstall(options: InstallRunOptions): Promise<NativeInstallResult> {
    requireNative()
    return invokeNative('install:run', { ...options, pack: options.pack as OfficialPackId | undefined })
  }
}

export const installService = new InstallService()
