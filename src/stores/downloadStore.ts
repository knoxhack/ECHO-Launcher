import { create } from 'zustand'
import type { DownloadItem } from '../types/launcher'

interface DownloadStore {
  downloads: DownloadItem[]
  pauseDownload: (downloadId: string) => void
  resumeDownload: (downloadId: string) => void
  cancelDownload: (downloadId: string) => void
  tickDownloads: () => void
}

export const useDownloadStore = create<DownloadStore>()((set) => ({
  downloads: [],
  pauseDownload: (downloadId) =>
    set((state) => ({
      downloads: state.downloads.map((download) =>
        download.id === downloadId && download.status === 'downloading'
          ? { ...download, status: 'paused' }
          : download,
      ),
    })),
  resumeDownload: (downloadId) =>
    set((state) => ({
      downloads: state.downloads.map((download) =>
        download.id === downloadId && download.status === 'paused'
          ? { ...download, status: 'downloading' }
          : download,
      ),
    })),
  cancelDownload: (downloadId) =>
    set((state) => ({
      downloads: state.downloads.map((download) =>
        download.id === downloadId ? { ...download, status: 'failed', hashStatus: 'failed' } : download,
      ),
    })),
  tickDownloads: () =>
    set((state) => ({
      downloads: state.downloads.map((download) => {
        if (download.status !== 'downloading') return download
        const progress = Math.min(download.progress + 4, 100)
        return {
          ...download,
          progress,
          status: progress >= 100 ? 'completed' : 'downloading',
          hashStatus: progress >= 100 ? 'verified' : download.hashStatus,
        }
      }),
    })),
}))
