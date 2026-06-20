import { describe, expect, it } from 'vitest'
import type { LauncherProfile } from '../types/profiles'
import { getAshfallHomeActions, getAshfallHomeRoute } from './ashfallHomeActions'

const healthyProfile: Pick<LauncherProfile, 'installPath' | 'name' | 'runtimeMode' | 'status' | 'version'> = {
  installPath: 'C:\\Users\\Player\\ECHOLauncher\\Instances\\Ashfall',
  name: 'Ashfall Native Edition',
  runtimeMode: 'native-loader-minecraft',
  status: 'healthy',
  version: '1.0.0',
}

describe('getAshfallHomeActions', () => {
  it('shows install primary and no update action when Ashfall is missing', () => {
    const actions = getAshfallHomeActions(
      { ...healthyProfile, installPath: undefined, status: 'warning' },
      { version: '1.0.1' },
    )

    expect(actions.primaryActionLabel).toBe('Install Ashfall Native Edition 1.0.1')
    expect(actions.primaryActionKind).toBe('install')
    expect(actions.primaryBusyLabel).toBe('Installing...')
    expect(actions.primaryUsesInstallFlow).toBe(true)
    expect(actions.updateActionLabel).toBeNull()
  })

  it('shows play primary and no update action when Ashfall is current', () => {
    const actions = getAshfallHomeActions(healthyProfile, { version: '1.0.0' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall Native Edition')
    expect(actions.primaryActionKind).toBe('play')
    expect(actions.primaryBusyLabel).toBe('Launching...')
    expect(actions.primaryUsesInstallFlow).toBe(false)
    expect(actions.updateActionLabel).toBeNull()
  })

  it('shows update primary when Ashfall is outdated', () => {
    const actions = getAshfallHomeActions(healthyProfile, { version: '1.0.1' })

    expect(actions.primaryActionLabel).toBe('Update Ashfall Native Edition 1.0.1')
    expect(actions.primaryActionKind).toBe('update')
    expect(actions.primaryBusyLabel).toBe('Updating...')
    expect(actions.primaryUsesInstallFlow).toBe(false)
    expect(actions.updateActionLabel).toBeNull()
  })

  it('shows launch standalone primary for a current standalone pack', () => {
    const actions = getAshfallHomeActions({ ...healthyProfile, runtimeMode: 'native-runtime' }, { version: '1.0.0' })

    expect(actions.primaryActionLabel).toBe('Launch Ashfall Native Edition')
    expect(actions.primaryActionKind).toBe('launch-standalone')
  })

  it('shows launch standalone primary for a current standalone engine pack', () => {
    const actions = getAshfallHomeActions(
      {
        ...healthyProfile,
        id: 'ashfall-standalone-engine-edition',
        name: 'Ashfall Standalone Engine Edition',
        runtimeMode: 'standalone-engine',
        version: '2.0.0-beta.2',
      },
      { version: '2.0.0-beta.2' },
    )

    expect(actions.primaryActionLabel).toBe('Launch Ashfall Standalone Engine Edition')
    expect(actions.primaryActionKind).toBe('launch-standalone')
  })

  it('keeps play primary when clean installed files have a blocked launch route', () => {
    const actions = getAshfallHomeActions(healthyProfile, { version: '1.0.0' })
    const recoveryActions = getAshfallHomeActions(
      healthyProfile,
      { version: '1.0.0' },
      { canRepair: true, launchBlocked: true },
    )

    expect(actions.primaryActionKind).toBe('play')
    expect(recoveryActions.primaryActionLabel).toBe('Play Ashfall Native Edition')
    expect(recoveryActions.primaryActionKind).toBe('play')
    expect(recoveryActions.primaryBusyLabel).toBe('Launching...')
  })

  it('shows repair primary only when the selected installed profile is already warning', () => {
    const actions = getAshfallHomeActions(
      { ...healthyProfile, status: 'warning' },
      { version: '1.0.0' },
      { canRepair: true },
    )

    expect(actions.primaryActionLabel).toBe('Repair Ashfall Native Edition')
    expect(actions.primaryActionKind).toBe('repair')
    expect(actions.primaryBusyLabel).toBe('Repairing...')
  })

  it('does not loop Sky Relay Native back to repair after clean files verify', () => {
    const actions = getAshfallHomeActions(
      {
        ...healthyProfile,
        id: 'sky-relay-native-edition',
        name: 'Sky Relay Native Edition',
        runtimeMode: 'native-loader-minecraft',
      },
      { version: '1.0.0' },
      { canRepair: true, launchBlocked: true },
    )

    expect(actions.primaryActionLabel).toBe('Play Sky Relay Native Edition')
    expect(actions.primaryActionKind).toBe('play')
  })

  it('does not show update action when the installed version is newer than the Catalog release', () => {
    const actions = getAshfallHomeActions({ ...healthyProfile, version: '1.0.2' }, { version: '1.0.1' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall Native Edition')
    expect(actions.primaryActionKind).toBe('play')
    expect(actions.updateActionLabel).toBeNull()
  })

  it('does not show update action when versions only differ by v prefix', () => {
    const actions = getAshfallHomeActions({ ...healthyProfile, version: 'v1.0.0' }, { version: '1.0.0' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall Native Edition')
    expect(actions.primaryActionKind).toBe('play')
    expect(actions.updateActionLabel).toBeNull()
  })

  it('does not show update action when latest release metadata is missing', () => {
    const actions = getAshfallHomeActions(healthyProfile, null)

    expect(actions.primaryActionLabel).toBe('Play Ashfall Native Edition')
    expect(actions.primaryActionKind).toBe('play')
    expect(actions.updateActionLabel).toBeNull()
  })
})

describe('getAshfallHomeRoute', () => {
  it('derives Minecraft + NeoForge from the NeoForge profile', () => {
    expect(getAshfallHomeRoute({ runtimeMode: 'neoforge-minecraft' }).label).toBe('Minecraft + NeoForge')
  })

  it('derives Minecraft + Native Loader from the Native profile', () => {
    expect(getAshfallHomeRoute({ runtimeMode: 'native-loader-minecraft' }).label).toBe('Minecraft + Native Loader')
  })

  it('derives Legacy Standalone Runtime from the old Standalone profile', () => {
    expect(getAshfallHomeRoute({ runtimeMode: 'native-runtime' }).label).toBe('Legacy Standalone Runtime')
  })

  it('derives Standalone Engine from the Engine Edition profile', () => {
    expect(getAshfallHomeRoute({ id: 'ashfall-standalone-engine-edition' }).label).toBe('Standalone Engine')
    expect(getAshfallHomeRoute({ id: 'ashfall-standalone-engine' }).label).toBe('Standalone Engine')
  })
})
