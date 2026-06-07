import { describe, expect, it } from 'vitest'
import type { LauncherProfile } from '../types/profiles'
import { getAshfallHomeActions } from './ashfallHomeActions'

const healthyProfile: Pick<LauncherProfile, 'installPath' | 'status' | 'version'> = {
  installPath: 'C:\\Users\\Player\\ECHOLauncher\\Instances\\Ashfall',
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
    expect(actions.primaryBusyLabel).toBe('Installing...')
    expect(actions.primaryUsesInstallFlow).toBe(true)
    expect(actions.updateActionLabel).toBeNull()
  })

  it('shows play primary and no update action when Ashfall is current', () => {
    const actions = getAshfallHomeActions(healthyProfile, { version: '1.0.0' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
    expect(actions.primaryBusyLabel).toBe('Launching...')
    expect(actions.primaryUsesInstallFlow).toBe(false)
    expect(actions.updateActionLabel).toBeNull()
  })

  it('shows play primary plus a separate update action when Ashfall is outdated', () => {
    const actions = getAshfallHomeActions(healthyProfile, { version: '1.0.1' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
    expect(actions.primaryUsesInstallFlow).toBe(false)
    expect(actions.updateActionLabel).toBe('Update Ashfall 1.0.1')
  })

  it('does not show update action when the installed version is newer than GitHub', () => {
    const actions = getAshfallHomeActions({ ...healthyProfile, version: '1.0.2' }, { version: '1.0.1' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
    expect(actions.updateActionLabel).toBeNull()
  })

  it('does not show update action when versions only differ by v prefix', () => {
    const actions = getAshfallHomeActions({ ...healthyProfile, version: 'v1.0.0' }, { version: '1.0.0' })

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
    expect(actions.updateActionLabel).toBeNull()
  })

  it('does not show update action when latest release metadata is missing', () => {
    const actions = getAshfallHomeActions(healthyProfile, null)

    expect(actions.primaryActionLabel).toBe('Play Ashfall')
    expect(actions.updateActionLabel).toBeNull()
  })
})
