import { describe, expect, it } from 'vitest'
import {
  buildEchoBootstrapVersionManifest,
  cleanupConflictingNeoForgeLauncherProfiles,
  deriveMinecraftLauncherVersionId,
  echoMinecraftLauncherProfileId,
  manifestModJarPaths,
  isEchoManagedMinecraftProfile,
  isReservedEchoMinecraftProfileKey,
  validateEchoMinecraftProfileReadiness,
  upsertEchoMinecraftProfile,
  validateMinecraftLauncherVersionMetadata,
} from './minecraftLauncherHandoff'

describe('minecraftLauncherHandoff', () => {
  it('creates deterministic ECHO profile ids', () => {
    expect(echoMinecraftLauncherProfileId('Ashfall')).toBe('echo-ashfall')
    expect(echoMinecraftLauncherProfileId('ECHO Custom Test')).toBe('echo-echo-custom-test')
    expect(echoMinecraftLauncherProfileId('!!!')).toBe('echo-profile')
    expect(echoMinecraftLauncherProfileId('Ashfall', 'native-loader-minecraft')).toBe('echo-ashfall-native-loader')
  })

  it('derives launcher version metadata ids from NeoForge unless a fixed id is supplied', () => {
    expect(deriveMinecraftLauncherVersionId('26.1.2.29-beta')).toBe('neoforge-26.1.2.29-beta')
    expect(deriveMinecraftLauncherVersionId('26.1.2.29-beta', 'echo-neoforge-ashfall-1.4.0')).toBe('echo-neoforge-ashfall-1.4.0')
  })

  it('builds ECHO bootstrap metadata for the official Minecraft Launcher', () => {
    const metadata = buildEchoBootstrapVersionManifest({
      versionId: 'neoforge-26.1.2.29-beta',
      minecraftVersion: '26.1.2',
      loaderVersion: '26.1.2.29-beta',
      pack: 'ashfall',
      packVersion: '1.4.0',
      channel: 'stable',
      timestamp: '2026-05-14T12:00:00.000Z',
    })

    expect(metadata).toMatchObject({
      id: 'neoforge-26.1.2.29-beta',
      inheritsFrom: '26.1.2',
      mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
      echoLauncher: {
        managedBy: 'ECHO Launcher',
        bootstrap: true,
        loader: 'neoforge',
        loaderVersion: '26.1.2.29-beta',
      },
    })
    expect(validateMinecraftLauncherVersionMetadata(metadata, expectedVersionMetadata()).valid).toBe(false)
  })

  it('detects only profiles marked as ECHO-managed', () => {
    expect(isEchoManagedMinecraftProfile({ echoManaged: true })).toBe(true)
    expect(isEchoManagedMinecraftProfile({ echoLauncher: { managedBy: 'ECHO Launcher' } })).toBe(true)
    expect(isEchoManagedMinecraftProfile({ name: 'Vanilla' })).toBe(false)
    expect(isReservedEchoMinecraftProfileKey('echo-ashfall')).toBe(true)
    expect(isEchoManagedMinecraftProfile({ name: 'Ashfall' }, 'echo-ashfall')).toBe(true)
  })

  it('refuses to overwrite non-ECHO Minecraft Launcher profiles', () => {
    expect(() =>
      upsertEchoMinecraftProfile(
        {
          profiles: {
            'echo-custom': { name: 'Player Vanilla', type: 'custom' },
          },
        },
        {
          ...baseInput(),
          profileKey: 'echo-custom',
          echoProfileId: 'custom',
        },
      ),
    ).toThrow('not ECHO-managed')
  })

  it('updates the reserved Ashfall profile even if Minecraft stripped ECHO marker fields', () => {
    const updated = upsertEchoMinecraftProfile(
      {
        profiles: {
          'echo-ashfall': { name: 'Ashfall', type: 'custom', created: '2026-01-01T00:00:00.000Z' },
        },
      },
      baseInput(),
    )

    expect(updated.profiles['echo-ashfall']).toMatchObject({
      name: 'Ashfall',
      lastVersionId: 'neoforge-26.1.2.29-beta',
      echoManaged: true,
      echoLauncher: {
        managedBy: 'ECHO Launcher',
        profileId: 'ashfall',
      },
    })
    expect(updated.profiles['echo-ashfall'].created).toBe('2026-01-01T00:00:00.000Z')
  })

  it('updates only the ECHO-managed profile while preserving the launcher document', () => {
    const updated = upsertEchoMinecraftProfile(
      {
        version: 3,
        settings: { keepLauncherSetting: true },
        profiles: {
          vanilla: { name: 'Vanilla', type: 'latest-release' },
          'echo-ashfall': {
            name: 'Old Ashfall',
            type: 'custom',
            created: '2026-01-01T00:00:00.000Z',
            echoLauncher: { managedBy: 'ECHO Launcher', profileId: 'ashfall' },
          },
        },
      },
      baseInput(),
    )

    expect(updated.settings?.keepLauncherSetting).toBe(true)
    expect(updated.profiles.vanilla.name).toBe('Vanilla')
    expect(updated.profiles['echo-ashfall']).toMatchObject({
      name: 'Ashfall',
      lastVersionId: 'neoforge-26.1.2.29-beta',
      gameDir: 'C:\\Games\\ECHO\\Ashfall',
      javaArgs: '-Xmx8G',
      echoManaged: true,
      echoLauncher: {
        managedBy: 'ECHO Launcher',
        profileId: 'ashfall',
        pack: 'ashfall',
        channel: 'stable',
        version: '1.4.0',
      },
    })
    expect(updated.profiles['echo-ashfall'].created).toBe('2026-01-01T00:00:00.000Z')
  })

  it('writes Native Loader Minecraft handoff into a separate ECHO-managed profile', () => {
    const updated = upsertEchoMinecraftProfile(
      {
        profiles: {
          'echo-ashfall': {
            name: 'Ashfall',
            type: 'custom',
            lastVersionId: 'neoforge-26.1.2.29-beta',
            echoLauncher: { managedBy: 'ECHO Launcher', profileId: 'ashfall' },
          },
        },
      },
      {
        ...baseInput(),
        profileKey: 'echo-ashfall-native-loader',
        profileName: 'Ashfall - Native Loader',
        runtimeMode: 'native-loader-minecraft',
        runtimeLabel: 'Native Loader + Minecraft',
        minecraftVersionId: 'echo-native-loader-1.0.0',
      },
    )

    expect(updated.profiles['echo-ashfall']).toMatchObject({
      lastVersionId: 'neoforge-26.1.2.29-beta',
    })
    expect(updated.profiles['echo-ashfall-native-loader']).toMatchObject({
      name: 'Ashfall - Native Loader',
      lastVersionId: 'echo-native-loader-1.0.0',
      echoLauncher: {
        managedBy: 'ECHO Launcher',
        profileId: 'ashfall',
        runtimeMode: 'native-loader-minecraft',
        runtimeLabel: 'Native Loader + Minecraft',
      },
    })
  })

  it('removes generic NeoForge profiles that would launch without the Ashfall game directory', () => {
    const cleaned = cleanupConflictingNeoForgeLauncherProfiles(
      {
        profiles: {
          'neoforge-26.1.2.29-beta': {
            name: 'NeoForge',
            type: 'custom',
            lastVersionId: 'neoforge-26.1.2.29-beta',
          },
          'my-test-profile': {
            name: 'My NeoForge Test',
            type: 'custom',
            lastVersionId: 'neoforge-26.1.2.29-beta',
            gameDir: 'D:\\Minecraft\\Testing',
          },
          vanilla: { name: 'Vanilla', type: 'latest-release', lastVersionId: 'latest-release' },
        },
      },
      {
        profileKey: 'echo-ashfall',
        minecraftVersionId: 'neoforge-26.1.2.29-beta',
        gameDir: 'C:\\Games\\ECHO\\Ashfall',
      },
    )

    expect(cleaned.document.profiles?.['neoforge-26.1.2.29-beta']).toBeUndefined()
    expect(cleaned.document.profiles?.['my-test-profile']).toBeDefined()
    expect(cleaned.document.profiles?.vanilla).toBeDefined()
    expect(cleaned.removedProfiles).toEqual(['NeoForge'])
    expect(cleaned.warnings[0]).toContain('left it untouched')
  })

  it('validates the Ashfall launcher profile game directory and version', () => {
    expect(
      validateEchoMinecraftProfileReadiness(
        {
          profiles: {
            'echo-ashfall': {
              name: 'Ashfall',
              type: 'custom',
              lastVersionId: 'neoforge-26.1.2.29-beta',
              gameDir: 'C:/Games/ECHO/Ashfall/',
            },
          },
        },
        {
          profileKey: 'echo-ashfall',
          minecraftVersionId: 'neoforge-26.1.2.29-beta',
          gameDir: 'c:\\games\\echo\\ashfall',
        },
      ),
    ).toMatchObject({ ok: true })

    expect(
      validateEchoMinecraftProfileReadiness(
        {
          profiles: {
            'echo-ashfall': {
              name: 'Ashfall',
              type: 'custom',
              lastVersionId: 'latest-release',
              gameDir: 'C:\\Users\\Player\\AppData\\Roaming\\.minecraft',
            },
          },
        },
        {
          profileKey: 'echo-ashfall',
          minecraftVersionId: 'neoforge-26.1.2.29-beta',
          gameDir: 'C:\\Games\\ECHO\\Ashfall',
        },
      ).warnings,
    ).toHaveLength(2)
  })

  it('extracts manifest mod jar paths for final Ashfall gameDir validation', () => {
    expect(
      manifestModJarPaths({
        files: [
          { path: 'mods/echocore-1.5.0.jar', required: true },
          { path: 'mods/optional-dev-helper.jar', required: false },
          { path: 'config/ashfall.toml', required: true },
          { path: 'mods/readme.txt', required: true },
          { path: 'mods\\echoashfallprotocol-1.5.0.jar', required: true },
        ],
      }),
    ).toEqual(['mods/echocore-1.5.0.jar', 'mods/echoashfallprotocol-1.5.0.jar'])
  })

  it('rejects poisoned NeoForge launcher metadata with no libraries', () => {
    expect(
      validateMinecraftLauncherVersionMetadata(
        {
          id: 'neoforge-26.1.2.29-beta',
          inheritsFrom: '26.1.2',
          mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
          arguments: { game: [], jvm: [] },
          libraries: [],
        },
        expectedVersionMetadata(),
      ),
    ).toMatchObject({
      valid: false,
      source: 'invalid',
    })
  })

  it('rejects NeoForge metadata with null asset fields that break inheritance', () => {
    expect(
      validateMinecraftLauncherVersionMetadata(
        {
          ...validVersionMetadata(),
          assetIndex: null,
          assets: null,
        },
        expectedVersionMetadata(),
      ),
    ).toMatchObject({
      valid: false,
      source: 'invalid',
      reason: 'assetIndex is null',
    })
  })

  it('accepts complete NeoForge metadata and identifies ECHO-written metadata', () => {
    expect(validateMinecraftLauncherVersionMetadata(validVersionMetadata(), expectedVersionMetadata())).toMatchObject({
      valid: true,
      source: 'installed',
    })
    expect(
      validateMinecraftLauncherVersionMetadata(
        {
          ...validVersionMetadata(),
          echoLauncher: { managedBy: 'ECHO Launcher' },
        },
        expectedVersionMetadata(),
      ),
    ).toMatchObject({
      valid: true,
      source: 'echo-managed',
    })
  })
})

function baseInput() {
  return {
    profileKey: 'echo-ashfall',
    profileName: 'Ashfall',
    echoProfileId: 'ashfall',
    pack: 'ashfall',
    channel: 'stable',
    packVersion: '1.4.0',
    minecraftVersionId: 'neoforge-26.1.2.29-beta',
    gameDir: 'C:\\Games\\ECHO\\Ashfall',
    ramGb: 8,
    timestamp: '2026-05-14T12:00:00.000Z',
  }
}

function expectedVersionMetadata() {
  return {
    versionId: 'neoforge-26.1.2.29-beta',
    inheritsFrom: '26.1.2',
    mainClass: 'net.neoforged.fml.startup.Client',
  }
}

function validVersionMetadata() {
  return {
    id: 'neoforge-26.1.2.29-beta',
    inheritsFrom: '26.1.2',
    mainClass: 'net.neoforged.fml.startup.Client',
    arguments: {
      game: ['--fml.neoForgeVersion', '26.1.2.29-beta'],
      jvm: ['-DlibraryDirectory=${library_directory}'],
    },
    libraries: [
      {
        name: 'net.neoforged:fancymodloader:11.0.13',
        downloads: {
          artifact: {
            path: 'net/neoforged/fancymodloader/11.0.13/fancymodloader-11.0.13.jar',
          },
        },
      },
    ],
  }
}
