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

    expect(actions.primaryActionLabel).toBe('Install Ashfall 1.0.1')
    expect(actions.primaryActionKind).toBe('install')
    expect(actions.primaryBusyLabel).toBe('Installing...')
    expect(actions.primaryUsesInstallFlow).toBe(true)
    expect(actions.updateActionLabel).toBeNull()
  })

  it('shows play primary and no update action when Ashfall is current', () => {
    const actions = getAshfallHomeActions(healthyProfile, { version: '1.0.0' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
    expect(actions.primaryActionKind).toBe('play')
    expect(actions.primaryBusyLabel).toBe('Launching...')
    expect(actions.primaryUsesInstallFlow).toBe(false)
    expect(actions.updateActionLabel).toBeNull()
  })

  it('shows update primary when Ashfall is outdated', () => {
    const actions = getAshfallHomeActions(healthyProfile, { version: '1.0.1' })

    expect(actions.primaryActionLabel).toBe('Update Ashfall 1.0.1')
    expect(actions.primaryActionKind).toBe('update')
    expect(actions.primaryBusyLabel).toBe('Updating...')
    expect(actions.primaryUsesInstallFlow).toBe(false)
    expect(actions.updateActionLabel).toBeNull()
  })

  it('shows launch standalone primary for a current standalone pack', () => {
    const actions = getAshfallHomeActions({ ...healthyProfile, runtimeMode: 'native-runtime' }, { version: '1.0.0' })

    expect(actions.primaryActionLabel).toBe('Launch Standalone')
    expect(actions.primaryActionKind).toBe('launch-standalone')
  })

  it('does not show update action when the installed version is newer than the Catalog release', () => {
    const actions = getAshfallHomeActions({ ...healthyProfile, version: '1.0.2' }, { version: '1.0.1' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
    expect(actions.primaryActionKind).toBe('play')
    expect(actions.updateActionLabel).toBeNull()
  })

  it('does not show update action when versions only differ by v prefix', () => {
    const actions = getAshfallHomeActions({ ...healthyProfile, version: 'v1.0.0' }, { version: '1.0.0' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
    expect(actions.primaryActionKind).toBe('play')
    expect(actions.updateActionLabel).toBeNull()
  })

  it('does not show update action when latest release metadata is missing', () => {
    const actions = getAshfallHomeActions(healthyProfile, null)

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
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

  it('derives ECHO Standalone Engine from the Standalone profile', () => {
    expect(getAshfallHomeRoute({ runtimeMode: 'native-runtime' }).label).toBe('ECHO Standalone Engine')
  })
})
