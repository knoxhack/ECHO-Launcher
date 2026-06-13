import { describe, expect, it } from 'vitest'
import { bundledProfiles } from '../data/bundledProfiles'
import type { LauncherProfile } from '../types/profiles'
import { normalizeAshfallProfiles, selectAshfallInstallPath } from './ashfallProfileMigration'

const fallback = bundledProfiles[0]

describe('ashfallProfileMigration', () => {
  it('returns bundled launcher profiles from seed data', () => {
    const normalized = normalizeAshfallProfiles(bundledProfiles, bundledProfiles)
    expect(normalized.map((profile) => profile.id)).toEqual([
      'ashfall-native-edition',
      'ashfall-neoforge-edition',
      'ashfall-standalone-edition',
      'sky-relay-native-edition',
      'sky-relay-neoforge-edition',
      'sky-relay-standalone-edition',
      'openlands-native-edition',
      'openlands-neoforge-edition',
      'openlands-standalone-edition',
      'arcana-division-native-edition',
      'arcana-division-neoforge-edition',
      'arcana-division-standalone-edition',
    ])
    expect(normalized.map((profile) => profile.runtimeMode)).toEqual([
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
    ])
  })

  it('migrates old beta, creator, and dev profiles into Ashfall Native Edition without deleting install paths', () => {
    const oldProfiles: LauncherProfile[] = [
      {
        ...fallback,
        id: 'creator',
        name: 'Ashfall Creator',
        channel: 'dev',
        channelLabel: 'Dev Snapshot',
        installPath: 'C:\\Games\\ECHO\\Creator',
      },
      {
        ...fallback,
        id: 'ashfall-stable',
        name: 'Ashfall Stable',
        channel: 'beta',
        channelLabel: 'Beta',
        ramGb: 9,
        installPath: 'C:\\Games\\ECHO\\Ashfall Stable',
        enabledAddons: ['echocore'],
      },
    ]

    const normalized = normalizeAshfallProfiles(oldProfiles, bundledProfiles)
    expect(normalized).toHaveLength(12)
    expect(normalized[0]).toMatchObject({
      id: 'ashfall-native-edition',
      name: 'Ashfall Native Edition',
      channel: 'alpha',
      channelLabel: 'Primary',
      ramGb: 9,
      installPath: 'C:\\Games\\ECHO\\Ashfall Stable',
      enabledAddons: ['echocore'],
    })
    expect(normalized[1]).toMatchObject({ id: 'ashfall-neoforge-edition', installPath: undefined })
    expect(normalized[2]).toMatchObject({ id: 'ashfall-standalone-edition', installPath: undefined })
    expect(normalized.slice(3).map((profile) => profile.id)).toEqual([
      'sky-relay-native-edition',
      'sky-relay-neoforge-edition',
      'sky-relay-standalone-edition',
      'openlands-native-edition',
      'openlands-neoforge-edition',
      'openlands-standalone-edition',
      'arcana-division-native-edition',
      'arcana-division-neoforge-edition',
      'arcana-division-standalone-edition',
    ])
    expect(normalized.slice(6, 9).map((profile) => profile.channel)).toEqual(['alpha', 'alpha', 'experimental'])
    expect(normalized.slice(9).map((profile) => profile.channel)).toEqual(['beta', 'beta', 'beta'])
  })

  it('uses the visible user folder for fresh Ashfall installs', () => {
    expect(
      selectAshfallInstallPath({
        profiles: [],
        defaultInstallPath: 'C:\\Users\\Player\\ECHOLauncher\\Instances\\Ashfall',
        legacyPrivateInstancesRoot: 'C:\\Users\\Player\\AppData\\Roaming\\echo-launcher\\ECHO\\instances',
        installedPaths: [],
      }),
    ).toBe('C:\\Users\\Player\\ECHOLauncher\\Instances\\Ashfall')
  })

  it('keeps an existing installed AppData Ashfall folder when a manifest is present', () => {
    expect(
      selectAshfallInstallPath({
        profiles: [
          {
            ...fallback,
            installPath: 'C:\\Users\\Player\\AppData\\Roaming\\echo-launcher\\ECHO\\instances\\Ashfall',
          },
        ],
        defaultInstallPath: 'C:\\Users\\Player\\ECHOLauncher\\Instances\\Ashfall',
        legacyPrivateInstancesRoot: 'C:\\Users\\Player\\AppData\\Roaming\\echo-launcher\\ECHO\\instances',
        installedPaths: ['C:\\Users\\Player\\AppData\\Roaming\\echo-launcher\\ECHO\\instances\\Ashfall'],
      }),
    ).toBe('C:\\Users\\Player\\AppData\\Roaming\\echo-launcher\\ECHO\\instances\\Ashfall')
  })

  it('moves an empty old AppData profile pointer to the visible user folder', () => {
    expect(
      selectAshfallInstallPath({
        profiles: [
          {
            ...fallback,
            installPath: 'C:\\Users\\Player\\AppData\\Roaming\\echo-launcher\\ECHO\\instances\\Ashfall',
          },
        ],
        defaultInstallPath: 'C:\\Users\\Player\\ECHOLauncher\\Instances\\Ashfall',
        legacyPrivateInstancesRoot: 'C:\\Users\\Player\\AppData\\Roaming\\echo-launcher\\ECHO\\instances',
        installedPaths: [],
      }),
    ).toBe('C:\\Users\\Player\\ECHOLauncher\\Instances\\Ashfall')
  })
})
