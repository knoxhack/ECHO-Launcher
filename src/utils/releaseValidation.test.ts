import { describe, expect, it } from 'vitest'
import type { CanonicalReleaseIndexEntry, ReleaseEntry, ReleaseIndex } from '../types/releases'
import {
  artifactChecksumStatus,
  artifactForPackTarget,
  dependencyClosure,
  parseEchoProtocolUrl,
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
  productUpdateArtifact,
  productUpdateEntry,
  productUpdateSelection,
  releaseFeedConfigured,
  releaseEntryFromCanonicalModpack,
  resolveEchoProtocolEntry,
  rollbackPlanSnapshot,
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

const canonicalModule: CanonicalReleaseIndexEntry = {
  id: 'echoarmory',
  kind: 'module',
  version: '1.0.0',
  channel: 'alpha',
  publisher: 'knoxhack',
  sourceRepo: 'knoxhack/ECHO-Modules',
  releaseTag: 'modules-v1.0.0',
  commitSha: 'abc1234',
  artifacts: {
    native: { file: 'echoarmory-1.0.0.echo-addon', sha256: 'a'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-v1.0.0/echoarmory-1.0.0.echo-addon' },
    neoforge: { file: 'echoarmory-1.0.0-neoforge.jar', sha256: 'b'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-v1.0.0/echoarmory-1.0.0-neoforge.jar' },
    standalone: { file: 'echoarmory-1.0.0-standalone.jar', sha256: 'c'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-v1.0.0/echoarmory-1.0.0-standalone.jar' },
  },
  dependencies: [{ id: 'echocore', kind: 'module', version: '*' }],
  compatibility: ['ashfall-native-edition', 'ashfall-neoforge-edition', 'ashfall-standalone-edition'],
  trust: 'provenance-attested',
  validation: 'approved',
}

const canonicalCore: CanonicalReleaseIndexEntry = {
  ...canonicalModule,
  id: 'echocore',
  artifacts: {
    native: { file: 'echocore-1.0.0.echo-addon', sha256: 'd'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-v1.0.0/echocore-1.0.0.echo-addon' },
  },
  dependencies: [],
}

const canonicalPack: CanonicalReleaseIndexEntry = {
  id: 'ashfall-neoforge-edition',
  kind: 'modpack',
  version: '0.1.0',
  channel: 'alpha',
  publisher: 'knoxhack',
  sourceRepo: 'knoxhack/ECHO-Ashfall-NeoForge-Edition',
  releaseTag: 'v0.1.0',
  commitSha: 'abc1234',
  artifacts: {
    pack: { file: 'ashfall-neoforge-edition-0.1.0.zip', sha256: 'e'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Ashfall-NeoForge-Edition/releases/download/v0.1.0/ashfall-neoforge-edition-0.1.0.zip', size: 100 },
    manifest: { file: 'ashfall-neoforge-edition-alpha-0.1.0.pack.json', sha256: 'f'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Ashfall-NeoForge-Edition/releases/download/v0.1.0/ashfall-neoforge-edition-alpha-0.1.0.pack.json', size: 10 },
  },
  dependencies: [],
  compatibility: ['neoforge'],
  trust: 'official',
  validation: 'approved',
}

const canonicalLauncherProduct: CanonicalReleaseIndexEntry = {
  id: 'echo-launcher',
  kind: 'product',
  version: '1.0.1',
  channel: 'alpha',
  publisher: 'knoxhack',
  sourceRepo: 'knoxhack/ECHO-Launcher',
  releaseTag: 'v1.0.1',
  commitSha: 'abc1234',
  artifacts: {
    windowsSetup: { file: 'ECHO-Launcher-1.0.1-Setup.exe', sha256: '1'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Launcher/releases/download/v1.0.1/ECHO-Launcher-1.0.1-Setup.exe' },
  },
  dependencies: [],
  compatibility: ['windows-x64'],
  trust: 'official',
  validation: 'approved',
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

  it('maps approved Release Index modpacks into strict release entries', () => {
    const entry = releaseEntryFromCanonicalModpack(canonicalPack, '2026-06-09T00:00:00Z')

    expect(entry).toMatchObject({
      pack: 'ashfall-neoforge-edition',
      version: '0.1.0',
      manifestAssetName: 'ashfall-neoforge-edition-alpha-0.1.0.pack.json',
      manifestSha256: 'f'.repeat(64),
      trust: 'verified-metadata',
    })
    expect(entry?.assets.map((asset) => asset.name)).toContain('ashfall-neoforge-edition-0.1.0.zip')
  })

  it('parses and resolves echo protocol links only through approved index entries', () => {
    expect(parseEchoProtocolUrl('echo://install/addon/echoarmory?pack=ashfall-neoforge-edition')).toEqual({
      rawUrl: 'echo://install/addon/echoarmory?pack=ashfall-neoforge-edition',
      action: 'install-addon',
      id: 'echoarmory',
      pack: 'ashfall-neoforge-edition',
    })
    expect(parseEchoProtocolUrl('echo://update/pack/ashfall-neoforge-edition')).toMatchObject({
      action: 'update-pack',
      id: 'ashfall-neoforge-edition',
    })
    expect(resolveEchoProtocolEntry('echo://install/addon/echoarmory?pack=ashfall-native-edition', [
      { ...canonicalModule, validation: 'warning' },
    ])).toBeNull()
    const addonInstall = resolveEchoProtocolEntry('echo://install/addon/echoarmory?pack=ashfall-native-edition', [canonicalModule])
    expect(addonInstall?.entry.id).toBe('echoarmory')
    expect(addonInstall?.action).toBe('install-addon')
    if (addonInstall?.action !== 'install-addon') throw new Error('Expected addon install resolution.')
    expect(addonInstall.artifact.name).toBe('echoarmory-1.0.0.echo-addon')
    expect(resolveEchoProtocolEntry('echo://update/pack/ashfall-neoforge-edition', [canonicalPack])?.entry.id).toBe('ashfall-neoforge-edition')
  })

  it('rejects addon install links when the requested pack has no indexed artifact', () => {
    expect(resolveEchoProtocolEntry('echo://install/addon/echocore?pack=ashfall-neoforge-edition', [canonicalCore])).toBeNull()
  })

  it('selects module artifacts by pack target', () => {
    expect(artifactForPackTarget(canonicalModule, 'ashfall-native-edition')?.name).toBe('echoarmory-1.0.0.echo-addon')
    expect(artifactForPackTarget(canonicalModule, 'ashfall-neoforge-edition')?.name).toBe('echoarmory-1.0.0-neoforge.jar')
    expect(artifactForPackTarget(canonicalModule, 'ashfall-standalone-edition')?.name).toBe('echoarmory-1.0.0-standalone.jar')
  })

  it('builds approved dependency closures and enforces blocks', () => {
    expect(dependencyClosure([canonicalModule, canonicalCore], ['echoarmory']).map((entry) => entry.id)).toEqual(['echocore', 'echoarmory'])
    expect(() => dependencyClosure([canonicalModule], ['echoarmory'])).toThrow(/Missing Release Index dependency echocore/)
    expect(() => dependencyClosure([canonicalModule, { ...canonicalCore, validation: 'blocked' }], ['echoarmory'])).toThrow(/Blocked Release Index dependency echocore/)
    expect(() => dependencyClosure([canonicalModule, { ...canonicalCore, validation: 'warning' }], ['echoarmory'])).toThrow(/Unapproved Release Index dependency echocore/)
  })

  it('detects artifact checksum mismatches before install acceptance', () => {
    expect(artifactChecksumStatus('a'.repeat(64), 'a'.repeat(64))).toMatchObject({ ok: true })
    expect(artifactChecksumStatus('a'.repeat(64), 'b'.repeat(64))).toMatchObject({
      ok: false,
      reason: `SHA-256 mismatch: expected ${'a'.repeat(64)}, got ${'b'.repeat(64)}.`,
    })
    expect(artifactChecksumStatus('', 'b'.repeat(64))).toMatchObject({
      ok: false,
      reason: 'Expected SHA-256 is missing or invalid.',
    })
  })

  it('generates deterministic rollback plan snapshots', () => {
    expect(rollbackPlanSnapshot({
      installId: 'install-20260609',
      operation: 'update',
      installPath: 'C:\\Games\\Ashfall',
      backedUp: [
        { path: 'mods\\echocore.jar', backupPath: 'C:\\Backups\\mods\\echocore.jar' },
      ],
      removed: ['config\\old.toml', 'mods\\old.jar'],
      createdAt: '2026-06-09T00:00:00Z',
    })).toEqual({
      installId: 'install-20260609',
      operation: 'update',
      installPath: 'C:\\Games\\Ashfall',
      backedUp: [
        { path: 'mods/echocore.jar', backupPath: 'C:\\Backups\\mods\\echocore.jar' },
      ],
      removed: ['config/old.toml', 'mods/old.jar'],
      createdAt: '2026-06-09T00:00:00Z',
    })
  })

  it('selects approved product updates through Release Index entries', () => {
    expect(productUpdateEntry([
      { ...canonicalLauncherProduct, version: '1.0.0', artifacts: {} },
      canonicalLauncherProduct,
      { ...canonicalLauncherProduct, version: '1.0.2', validation: 'warning' },
    ], 'echo-launcher', 'windows-x64')?.version).toBe('1.0.1')
    expect(productUpdateEntry([
      { ...canonicalLauncherProduct, validation: 'blocked' },
    ], 'echo-launcher', 'windows-x64')).toBeNull()
    expect(productUpdateEntry([canonicalLauncherProduct], 'echo-launcher', 'linux-x64')).toBeNull()
  })

  it('selects product updates only when an exact indexed updater artifact is available', () => {
    const staleWithArtifact = { ...canonicalLauncherProduct, version: '1.0.0' }
    const latestWithoutArtifact = { ...canonicalLauncherProduct, version: '1.0.2', artifacts: {} }
    const selection = productUpdateSelection([
      staleWithArtifact,
      latestWithoutArtifact,
      { ...canonicalLauncherProduct, version: '1.0.3', validation: 'warning' },
    ], 'echo-launcher', 'windows-x64')

    expect(selection.entry?.version).toBe('1.0.0')
    expect(selection.artifact?.name).toBe('ECHO-Launcher-1.0.1-Setup.exe')
    expect(selection.warnings).toEqual([
      'Release Index product echo-launcher 1.0.2 has no indexed updater artifact for windows-x64.',
    ])
    expect(productUpdateArtifact(canonicalLauncherProduct, 'windows-x64')?.sha256).toBe('1'.repeat(64))
    expect(productUpdateSelection([latestWithoutArtifact], 'echo-launcher', 'windows-x64').entry).toBeNull()
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


