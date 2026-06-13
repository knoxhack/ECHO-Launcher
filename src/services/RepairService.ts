import type { NativeRepairResult } from '../types/native'
import type { Channel } from '../types/launcher'
import { invokeNative, requireNative } from './nativeBridge'

export interface RepairRunOptions {
  profileId: string
  installPath?: string
  manifestPath?: string
  backupConfigs?: boolean
  channel?: Channel
  version?: string
}

export class RepairService {
  async runRepair(options: RepairRunOptions): Promise<NativeRepairResult> {
    requireNative()
    return invokeNative('repair:run', options)
  }
}

export const repairService = new RepairService()
