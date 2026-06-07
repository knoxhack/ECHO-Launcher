import { describe, expect, it } from 'vitest'
import type { LauncherUpdateStatus, NativeLauncherUpdateState } from '../types/native'
import {
  launcherUpdateHealthStatus,
  launcherUpdatePrimaryDetail,
  launcherUpdateStatusLabels,
  launcherUpdateVisibleInTopBar,
  mergeLauncherUpdateState,
} from './launcherUpdateState'

function updateState(status: LauncherUpdateStatus, overrides: Partial<NativeLauncherUpdateState> = {}): NativeLauncherUpdateState {
  return {
    currentVersion: '1.0.0',
    status,
    feedOwner: 'knoxhack',
    feedRepo: 'ECHOLauncher',
    allowPrerelease: false,
    availableVersion: undefined,
    releaseName: undefined,
    releaseDate: undefined,
    releaseNotes: [],
    progress: 0,
    error: undefined,
    updateReady: status === 'downloaded',
    canCheck: !['checking', 'downloading'].includes(status),
    canDownload: status === 'available',
    canInstall: status === 'downloaded',
    ...overrides,
  }
}

describe('launcher update state helpers', () => {
  it.each<LauncherUpdateStatus>(['idle', 'checking', 'available', 'downloading', 'downloaded', 'unavailable', 'failed', 'unsupported'])(
    'formats %s status',
    (status) => {
      expect(launcherUpdateStatusLabels[status]).toBeTruthy()
      expect(launcherUpdateHealthStatus(status)).toBeTruthy()
    },
  )

  it('shows only actionable or failed states in the top bar', () => {
    expect(launcherUpdateVisibleInTopBar('idle')).toBe(false)
    expect(launcherUpdateVisibleInTopBar('unavailable')).toBe(false)
    expect(launcherUpdateVisibleInTopBar('available')).toBe(true)
    expect(launcherUpdateVisibleInTopBar('downloading')).toBe(true)
    expect(launcherUpdateVisibleInTopBar('downloaded')).toBe(true)
    expect(launcherUpdateVisibleInTopBar('failed')).toBe(true)
  })

  it('describes update availability and progress', () => {
    expect(launcherUpdatePrimaryDetail(updateState('available', { availableVersion: '1.0.1' }))).toBe('Version 1.0.1 is available.')
    expect(launcherUpdatePrimaryDetail(updateState('downloading', { progress: 42.4 }))).toBe('42% downloaded.')
    expect(launcherUpdatePrimaryDetail(updateState('downloaded', { availableVersion: '1.0.1' }))).toBe('Version 1.0.1 is ready to install.')
    expect(launcherUpdatePrimaryDetail(updateState('unavailable'))).toBe('Installed version 1.0.0.')
  })

  it('keeps previous release notes when merging sparse native updates', () => {
    const current = updateState('available', { releaseNotes: ['One', 'Two'] })
    const next = mergeLauncherUpdateState(current, updateState('downloading', { releaseNotes: undefined as unknown as string[], progress: 25 }))
    expect(next.releaseNotes).toEqual(['One', 'Two'])
    expect(next.progress).toBe(25)
  })

  it('surfaces failed and unsupported details', () => {
    expect(launcherUpdatePrimaryDetail(updateState('failed', { error: 'network unavailable' }))).toBe('network unavailable')
    expect(launcherUpdatePrimaryDetail(updateState('unsupported'))).toBe('Self-updates are available in packaged Windows and Linux AppImage builds.')
    expect(launcherUpdatePrimaryDetail(updateState('downloaded', { manualInstallRequired: true }))).toBe('Wine compatibility mode requires manual launcher update installation.')
  })
})
