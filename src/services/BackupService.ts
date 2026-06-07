import type { BackupRestoreResult, NativeBackupResult } from '../types/native'
import { invokeNative, requireNative } from './nativeBridge'

export class BackupService {
  async createBackup(profileId: string, sourcePath?: string): Promise<NativeBackupResult> {
    requireNative()
    return invokeNative('backup:create', { profileId, sourcePath })
  }

  async restoreBackup(backupPath: string, destinationPath: string): Promise<BackupRestoreResult> {
    requireNative()
    return invokeNative('backup:restore', { backupPath, destinationPath })
  }
}

export const backupService = new BackupService()
