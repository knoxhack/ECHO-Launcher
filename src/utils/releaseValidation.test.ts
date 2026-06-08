import { describe, expect, it } from 'vitest'
import type { ReleaseEntry, ReleaseIndex } from '../types/releases'
import {
  isSafeRelativePath,
  isPlayableAshfallRelease,
  isPlayablePackRelease,
  isUsableReleaseCache,
  latestPlayableRelease,
  latestPlayableReleaseForPack,
  moduleArtifactName,
  nativeLoaderMetadataStatus,
  normalizeGitHubAssetDigest,
  normalizeOfficialPackId,
  normalizeReleaseFeedConfig,
  packManifestAssetName,
  releaseFeedConfigured,
  selectReleaseEntry,
  validatePackManifest,
} from './releaseValidation'

const baseRelease: ReleaseEntry = {
  id: '1',
  pack: 'ashfall-native-edition',
  version: '0.1.0-native-public-alpha',
  channel: 'alpha',
  tagName: 'v0.1.0-native-public-alpha',
  name: 'Ashfall Native Edition Public Alpha',
  draft: false,
  prerelease: true,
  publishedAt: '2026-05-10T12:00:00Z',
  releasePageUrl: 'https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/tag/v0.1.0-native-public-alpha',
  releaseNotes: ['Public alpha release'],
  manifestAssetName: 'ashfall-native-edition-alpha-0.1.0-native-public-alpha.pack.json',
  manifestUrl: 'https://example.com/manifest.json',
  manifestSha256: 'a'.repeat(64),
  trust: 'verified-metadata',
  assets: [],
}

function releaseIndex(overrides: Partial<ReleaseIndex>): ReleaseIndex {
  return {
    cacheVersion: 4,
    source: {
      provider: 'github',
      owner: 'knoxhack',
      repo: 'ECHO-Ashfall-Native-Edition',
      includePrereleases: true,
    },
    fetchedAt: '2026-05-10T12:00:00Z',
    releases: [baseRelease],
    rejectedReleases: [],
    diagnostics: [],
    warnings: [],
    ...overrides,
  }
}

describe('releaseValidation', () => {
  it('rejects unsafe manifest paths', () => {
    expect(isSafeRelativePath('mods/echocore.jar')).toBe(true)
    expect(isSafeRelativePath('../mods/escape.jar')).toBe(false)
    expect(isSafeRelativePath('C:\\Users\\player\\escape.jar')).toBe(false)
    expect(isSafeRelativePath('/tmp/escape.jar')).toBe(false)
  })

  it('normalizes and validates release feed configuration', () => {
    const config = normalizeReleaseFeedConfig({
      owner: '  AshfallOrg ',
      repo: ' echo-releases ',
    })
    expect(config).toEqual({
      provider: 'github',
      owner: 'AshfallOrg',
      repo: 'echo-releases',
      includePrereleases: true,
    })
    expect(releaseFeedConfigured(config)).toBe(true)
    expect(releaseFeedConfigured({ ...config, repo: '' })).toBe(false)
  })

  it('normalizes GitHub asset SHA-256 digests', () => {
    expect(normalizeGitHubAssetDigest(`sha256:${'a'.repeat(64)}`)).toBe('a'.repeat(64))
    expect(normalizeGitHubAssetDigest('md5:abc')).toBeUndefined()
    expect(normalizeGitHubAssetDigest(undefined)).toBeUndefined()
  })

  it('selects the latest release for a channel', () => {
    const selected = selectReleaseEntry(
      [
        baseRelease,
        { ...baseRelease, id: '2', version: '0.1.1', publishedAt: '2026-05-11T12:00:00Z' },
        { ...baseRelease, id: '3', channel: 'experimental', version: '0.2.0-runtime-alpha', publishedAt: '2026-05-12T12:00:00Z' },
      ],
      'alpha',
    )
    expect(selected?.version).toBe('0.1.1')
  })

  it('uses the latest accepted GitHub release instead of bundled fallback versions', () => {
    const bundledFallback = { ...baseRelease, id: 'fallback', version: '0.1.0-alpha.0', publishedAt: '2026-05-01T12:00:00Z' }
    const liveRelease = { ...baseRelease, id: 'live', version: '0.1.0-alpha.1', tagName: '0.1.0-alpha.1', publishedAt: '2026-05-23T16:35:13Z' }
    const selected = latestPlayableRelease(
      releaseIndex({
        releases: [bundledFallback, liveRelease],
        acceptedCount: 2,
        latestPlayableRelease: liveRelease,
      }),
    )

    expect(selected?.version).toBe('0.1.0-alpha.1')
  })

  it('treats only strict public alpha metadata releases as playable', () => {
    expect(isPlayableAshfallRelease({ ...baseRelease, pack: 'ashfall-native-edition' })).toBe(true)
    expect(isPlayableAshfallRelease({ ...baseRelease, trust: 'derived' })).toBe(false)
    expect(isPlayableAshfallRelease({ ...baseRelease, channel: 'dev' })).toBe(false)
    expect(isPlayableAshfallRelease({ ...baseRelease, manifestSha256: undefined })).toBe(false)
  })

  it('rejects stale or non-strict release caches', () => {
    expect(isUsableReleaseCache(releaseIndex({ releases: [baseRelease] }))).toBe(true)
    expect(isUsableReleaseCache(releaseIndex({ releases: [] }))).toBe(false)
    expect(isUsableReleaseCache(releaseIndex({ cacheVersion: 1, releases: [baseRelease] }))).toBe(false)
    expect(isUsableReleaseCache(releaseIndex({ diagnostics: undefined }))).toBe(false)
    expect(isUsableReleaseCache(releaseIndex({ releases: [{ ...baseRelease, trust: 'derived' }] }))).toBe(false)
  })

  it('normalizes legacy Ashfall pack ids to the Native Edition runtime pack', () => {
    expect(normalizeOfficialPackId('ashfall')).toBe('ashfall-native-edition')
    expect(isPlayablePackRelease({ ...baseRelease, pack: 'ashfall-native-edition' }, 'ashfall-native-edition')).toBe(true)
    expect(latestPlayableReleaseForPack(releaseIndex({
      releases: [
        { ...baseRelease, id: 'native', pack: 'ashfall-native-edition', version: '0.1.1', publishedAt: '2026-05-11T12:00:00Z' },
        { ...baseRelease, id: 'standalone', pack: 'ashfall-standalone-edition', channel: 'experimental', version: '0.1.0', publishedAt: '2026-05-10T12:00:00Z' },
      ],
    }), 'ashfall-native-loader')?.version).toBe('0.1.1')
  })

  it('builds expected pack manifest asset names', () => {
    expect(packManifestAssetName('alpha', '0.1.0', 'ashfall-native-edition')).toBe('ashfall-native-edition-alpha-0.1.0.pack.json')
    expect(packManifestAssetName('experimental', '0.1.0', 'ashfall-standalone-edition')).toBe('ashfall-standalone-edition-experimental-0.1.0.pack.json')
  })

  it('builds expected module artifact names', () => {
    expect(moduleArtifactName('echocore', '1.0.0', 'neoforge')).toBe('echocore-1.0.0-neoforge.jar')
    expect(moduleArtifactName('echocore', '1.0.0', 'standalone')).toBe('echocore-1.0.0-standalone.jar')
    expect(moduleArtifactName('echocore', '1.0.0', 'echo-addon')).toBe('echocore-1.0.0.echo-addon')
  })

  it('validates trusted pack manifests', () => {
    const manifest = validatePackManifest({
      pack: 'ashfall',
      version: '0.1.0',
      channel: 'alpha',
      minecraft: '26.1.2',
      nativeLoader: {
        version: '1.0.0',
        minecraftLauncherVersionId: 'echo-native-loader-1.0.0',
        versionJson: {
          id: 'echo-native-loader-1.0.0',
          inheritsFrom: '26.1.2',
          mainClass: 'com.echo.NativeLoaderClient',
          arguments: { game: [], jvm: [] },
          libraries: [{ name: 'com.echo:native-loader:1.0.0' }],
        },
      },
      modules: ['echocore'],
      files: [
        {
          path: 'mods/echocore-1.4.0.jar',
          assetName: 'echocore-1.4.0.jar',
          url: '',
          sha256: 'c'.repeat(64),
          size: 100,
          required: true,
          moduleId: 'echocore',
          side: 'both',
        },
      ],
      changelog: ['Initial release'],
      worldgenWarning: true,
    })
    expect(manifest.version).toBe('0.1.0')
  })

  it('validates strict zip artifact manifests without per-file URLs', () => {
    const manifest = validatePackManifest({
      pack: 'ashfall',
      version: '1.2.0-beta.1',
      channel: 'alpha',
      minecraft: '26.1.2',
      minecraftVersion: '26.1.2',
      artifactMode: 'zip',
      artifactName: 'Ashfall-1.0.0.echo-pack.zip',
      artifactSha256: 'd'.repeat(64),
      nativeLoader: baseNativeLoader(),
      launch: { mainClass: 'net.neoforged.fml.startup.Client', gameArgs: [], jvmArgs: [] },
      modules: ['echocore'],
      files: [
        {
          path: 'mods/echocore-1.2.0.jar',
          sha256: 'c'.repeat(64),
          size: 100,
          required: true,
          moduleId: 'echocore',
          side: 'both',
        },
      ],
      changelog: ['Beta release'],
      worldgenWarning: true,
    })
    expect(manifest.artifactMode).toBe('zip')
    expect(manifest.artifactName).toBe('Ashfall-1.0.0.echo-pack.zip')
  })

  it('accepts Ashfall NeoForge Edition manifests with NeoForge loader metadata', () => {
    const manifest = validatePackManifest({
      pack: 'ashfall-neoforge-edition',
      version: '1.0.0',
      channel: 'alpha',
      minecraft: '26.1.2',
      loader: {
        type: 'neoforge',
        version: '26.1.2',
        installer: {
          assetName: 'neoforge-26.1.2-installer.jar',
          sha256: 'f'.repeat(64),
          installMode: 'client',
        },
      },
      moduleRequirements: [
        {
          id: 'echocore',
          version: '1.0.0',
        },
      ],
      modules: ['echocore'],
      files: [
        {
          path: 'mods/echocore-1.0.0-neoforge.jar',
          url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-v1.0.0/echocore-1.0.0-neoforge.jar',
          sha256: 'c'.repeat(64),
          size: 100,
          required: true,
          moduleId: 'echocore',
          side: 'both',
        },
      ],
      changelog: ['NeoForge release'],
      worldgenWarning: true,
    })

    expect(manifest.pack).toBe('ashfall-neoforge-edition')
    expect(manifest.loader?.type).toBe('neoforge')
    expect(manifest.moduleRequirements?.[0]?.id).toBe('echocore')
  })

  it('rejects unsafe module requirement paths', () => {
    expect(() =>
      validatePackManifest({
        pack: 'ashfall-neoforge-edition',
        version: '1.0.0',
        channel: 'alpha',
        minecraft: '26.1.2',
        loader: {
          type: 'neoforge',
          version: '26.1.2',
        },
        moduleRequirements: [
          {
            id: 'echocore',
            version: '1.0.0',
            path: '../escape.jar',
          },
        ],
        modules: [],
        files: [],
        changelog: [],
        worldgenWarning: false,
      }),
    ).toThrow(/Unsafe module artifact path/)
  })

  it('accepts valid Native Loader release metadata', () => {
    const manifest = validatePackManifest({
      ...baseManifest(),
      nativeLoader: {
        version: '1.0.0',
        minecraftLauncherVersionId: 'echo-native-loader-1.0.0',
        versionJson: {
          id: 'echo-native-loader-1.0.0',
          inheritsFrom: '26.1.2',
          mainClass: 'com.echo.NativeLoaderClient',
          arguments: { game: [], jvm: [] },
          libraries: [{ name: 'com.echo:native-loader:1.0.0' }],
        },
      },
    })

    expect(nativeLoaderMetadataStatus(manifest)).toMatchObject({
      ok: true,
      versionId: 'echo-native-loader-1.0.0',
    })
  })

  it('blocks Native Loader mode when launcher version metadata is missing', () => {
    const missingNativeLoader = { ...baseManifest(), nativeLoader: undefined }
    expect(nativeLoaderMetadataStatus(missingNativeLoader)).toMatchObject({
      ok: false,
      reason: 'Native Loader metadata is not included in this Ashfall release.',
    })
    expect(() =>
      validatePackManifest({
        ...baseManifest(),
        nativeLoader: {
          version: '1.0.0',
        },
      }),
    ).toThrow(/missing versionJson/)
  })

  it('accepts standalone runtime manifests with runtime and launch metadata', () => {
    const manifest = validatePackManifest({
      pack: 'ashfall-standalone-runtime',
      version: '0.1.0',
      channel: 'experimental',
      minecraft: 'standalone',
      runtime: { requiredJava: 'none' },
      launch: { mainClass: 'com.echo.runtime.AshfallStandaloneMain', gameArgs: [], jvmArgs: [] },
      modules: ['echocore'],
      files: [
        {
          path: 'runtime/ashfall-runtime.bin',
          assetName: 'ashfall-runtime.bin',
          sha256: 'e'.repeat(64),
          size: 100,
          required: true,
          moduleId: 'echocore',
          side: 'client',
        },
      ],
      changelog: ['Standalone beta'],
      worldgenWarning: false,
    })
    expect(manifest.pack).toBe('ashfall-standalone-edition')
  })

  it('blocks manifests without verified artifact sources', () => {
    expect(() =>
      validatePackManifest({
        pack: 'ashfall',
        version: '0.1.0',
        channel: 'alpha',
        minecraft: '26.1.2',
        nativeLoader: baseNativeLoader(),
        modules: [],
        files: [
          {
            path: 'mods/echocore.jar',
            url: '',
            sha256: '',
            size: 0,
            required: true,
            moduleId: 'echocore',
            side: 'both',
          },
        ],
        changelog: [],
        worldgenWarning: false,
      }),
    ).toThrow(/SHA-256/)
  })

  it('rejects duplicate manifest paths', () => {
    expect(() =>
      validatePackManifest({
        pack: 'ashfall',
        version: '0.1.0',
        channel: 'alpha',
        minecraft: '26.1.2',
        nativeLoader: baseNativeLoader(),
        modules: ['echocore'],
        files: [
          {
            path: 'mods/echocore.jar',
            assetName: 'file-a-mods-echocore.jar',
            sha256: 'a'.repeat(64),
            size: 10,
            required: true,
            moduleId: 'echocore',
            side: 'both',
          },
          {
            path: 'mods\\echocore.jar',
            assetName: 'file-b-mods-echocore.jar',
            sha256: 'b'.repeat(64),
            size: 10,
            required: true,
            moduleId: 'echocore',
            side: 'both',
          },
        ],
        changelog: [],
        worldgenWarning: false,
      }),
    ).toThrow(/Duplicate manifest path/)
  })
})

function baseManifest() {
  return {
    pack: 'ashfall',
    version: '0.1.0',
    channel: 'alpha',
    minecraft: '26.1.2',
    nativeLoader: baseNativeLoader(),
    modules: ['echocore'],
    files: [
      {
        path: 'mods/echocore-1.4.0.jar',
        assetName: 'echocore-1.4.0.jar',
        sha256: 'c'.repeat(64),
        size: 100,
        required: true,
        moduleId: 'echocore',
        side: 'both',
      },
    ],
    changelog: ['Initial release'],
    worldgenWarning: true,
  } as const
}

function baseNativeLoader() {
  return {
    version: '1.0.0',
    minecraftLauncherVersionId: 'echo-native-loader-1.0.0',
    versionJson: {
      id: 'echo-native-loader-1.0.0',
      inheritsFrom: '26.1.2',
      mainClass: 'com.echo.NativeLoaderClient',
      arguments: { game: [], jvm: [] },
      libraries: [{ name: 'com.echo:native-loader:1.0.0' }],
    },
  } as const
}


