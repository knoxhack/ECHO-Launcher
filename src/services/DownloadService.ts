import { bundledDownloads } from '../data/bundledLauncherData'
import type { DownloadItem } from '../types/launcher'
import { invokeNative, requireNative } from './nativeBridge'

export class DownloadService {
  listDownloads() {
    return bundledDownloads
  }

  queueDownload(item: DownloadItem) {
    return { ...item, status: 'queued' as const, progress: 0, hashStatus: 'pending' as const }
  }

  pause(downloadId: string) {
    return { ok: true, downloadId, status: 'paused' as const }
  }

  resume(downloadId: string) {
    return { ok: true, downloadId, status: 'downloading' as const }
  }

  cancel(downloadId: string) {
    return { ok: true, downloadId, status: 'failed' as const }
  }

  async verifyHash(downloadId: string) {
    return { downloadId, verified: downloadId !== 'download-configs' }
  }

  async downloadFile(url: string, destination?: string, sha256?: string) {
    requireNative()
    return invokeNative('download:file', { url, destination, sha256 })
  }
}

export const downloadService = new DownloadService()
