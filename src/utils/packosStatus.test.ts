import { describe, expect, it } from 'vitest'
import type { PackOsLauncherPackState, PackOsLauncherState } from '../types/packos'
import { isPackOsLaunchBlocked, packOsHealthStatus, packOsPrimaryReason, packOsUiStateLabel } from './packosStatus'

function pack(patch: Partial<PackOsLauncherPackState>): PackOsLauncherPackState {
  return {
    packId: 'ashfall-native-edition',
    name: 'Ashfall Native Edition',
    selected: true,
    launcherVisible: true,
    publicRelease: true,
    storefrontReady: true,
    variant: 'standard',
    channel: 'alpha',
    saveCompatibilityVersion: '1',
    readinessStatus: 'ready',
    lockfileStatus: 'valid',
    installStateStatus: 'clean',
    repairPlanStatus: 'no_repair_needed',
    healthStatus: 'healthy',
    recoveryMode: 'normal',
    safeForLauncher: true,
    launchAllowed: true,
    uiState: 'ready',
    blockingReasons: [],
    warnings: [],
    reportPaths: {},
    safeCommands: [],
    ...patch,
  }
}

function state(selectedPack: PackOsLauncherPackState): PackOsLauncherState {
  return {
    ok: selectedPack.launchAllowed,
    generatedAt: '2026-05-29T00:00:00.000Z',
    status: selectedPack.uiState,
    source: 'launcher-status',
    selectedPackId: selectedPack.packId,
    selectedPack,
    packs: [selectedPack],
    reports: [],
    warnings: [],
    safeCommands: [],
  }
}

describe('PackOS status helpers', () => {
  it('maps Launcher UI labels', () => {
    expect(packOsUiStateLabel('playable_with_warnings')).toBe('Playable With Warnings')
    expect(packOsUiStateLabel('manual_review_required')).toBe('Manual Review Required')
  })

  it('does not block ready or warning states', () => {
    expect(isPackOsLaunchBlocked(state(pack({ uiState: 'playable_with_warnings', launchAllowed: true })))).toBe(false)
  })

  it('blocks only explicit unsafe PackOS states', () => {
    expect(isPackOsLaunchBlocked(state(pack({ uiState: 'unknown', launchAllowed: false })))).toBe(false)
    expect(isPackOsLaunchBlocked(state(pack({ uiState: 'blocked', launchAllowed: false })))).toBe(true)
    expect(isPackOsLaunchBlocked(state(pack({ uiState: 'repair_available', launchAllowed: false })))).toBe(true)
  })

  it('maps PackOS UI state to existing launcher health status', () => {
    expect(packOsHealthStatus(pack({ uiState: 'ready' }))).toBe('healthy')
    expect(packOsHealthStatus(pack({ uiState: 'degraded' }))).toBe('warning')
    expect(packOsHealthStatus(pack({ uiState: 'blocked' }))).toBe('critical')
    expect(packOsHealthStatus(pack({ uiState: 'not_installed' }))).toBe('missing')
  })

  it('prefers PackOS blocking reasons over generic status text', () => {
    const selected = pack({ uiState: 'blocked', launchAllowed: false, blockingReasons: ['Required module is missing.'] })
    expect(packOsPrimaryReason(state(selected))).toBe('Required module is missing.')
  })
})
