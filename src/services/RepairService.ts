import type { NativeRepairResult, NativeRollbackRestoreResult } from '../types/native'
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

export interface RestoreLastKnownGoodOptions {
  profileId: string
  installPath?: string
  manifestPath?: string
}

export class RepairService {
  async runRepair(options: RepairRunOptions): Promise<NativeRepairResult> {
    requireNative()
    return invokeNative('repair:run', options)
  }

  async restoreLastKnownGood(options: RestoreLastKnownGoodOptions): Promise<NativeRollbackRestoreResult> {
    requireNative()
    return invokeNative('rollback:restore-latest', options)
  }
}

export const repairService = new RepairService()
