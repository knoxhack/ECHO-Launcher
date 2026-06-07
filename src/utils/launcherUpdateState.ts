import type { HealthStatus } from '../types/launcher'
import type { LauncherUpdateStatus, NativeLauncherUpdateState } from '../types/native'

export const launcherUpdateStatusLabels: Record<LauncherUpdateStatus, string> = {
  idle: 'Launcher Current',
  checking: 'Checking',
  available: 'Update Available',
  downloading: 'Downloading',
  downloaded: 'Ready to Install',
  unavailable: 'Launcher Current',
  failed: 'Update Failed',
  unsupported: 'Packaged App Required',
}

export function launcherUpdateHealthStatus(status: LauncherUpdateStatus): HealthStatus {
  if (status === 'available') return 'update_available'
  if (status === 'checking') return 'queued'
  if (status === 'downloading') return 'downloading'
  if (status === 'downloaded') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'unsupported') return 'warning'
  return 'healthy'
}

export function launcherUpdateVisibleInTopBar(status: LauncherUpdateStatus) {
  return ['available', 'downloading', 'downloaded', 'failed'].includes(status)
}

export function launcherUpdatePrimaryDetail(state: NativeLauncherUpdateState | null) {
  if (!state) return 'Launcher update status is not loaded.'
  if (state.status === 'available' && state.availableVersion) return `Version ${state.availableVersion} is available.`
  if (state.status === 'downloading') return `${Math.round(state.progress)}% downloaded.`
  if (state.status === 'downloaded' && state.availableVersion) return `Version ${state.availableVersion} is ready to install.`
  if (state.status === 'failed') return state.error ?? 'The launcher update check failed.'
  if (state.manualInstallRequired && state.status === 'downloaded') return state.error ?? 'Wine compatibility mode requires manual launcher update installation.'
  if (state.status === 'unsupported') return state.error ?? 'Self-updates are available in packaged Windows and Linux AppImage builds.'
  return `Installed version ${state.currentVersion}.`
}

export function mergeLauncherUpdateState(
  current: NativeLauncherUpdateState | null,
  next: NativeLauncherUpdateState,
): NativeLauncherUpdateState {
  return {
    ...(current ?? next),
    ...next,
    releaseNotes: next.releaseNotes ?? current?.releaseNotes ?? [],
  }
}
