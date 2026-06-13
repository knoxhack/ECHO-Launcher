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
  moduleArtifactFamilyForPack,
  moduleArtifactName,
  nativeLoaderMetadataStatus,
  normalizeOfficialPackId,
  officialPackIds,
  packManifestAssetName,
  productUpdateArtifact,
  productUpdateEntry,
  productUpdateSelection,
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

const canonicalNativePack: CanonicalReleaseIndexEntry = {
  ...canonicalPack,
  id: 'ashfall-native-edition',
  sourceRepo: 'knoxhack/ECHO-Ashfall-Native-Edition',
  artifacts: {
    manifest: {
      file: 'ashfall-native-edition-alpha-0.1.0.pack.json',
      sha256: '9'.repeat(64),
      url: 'https://github.com/knoxhack/ECHO-Ashfall-Native-Edition/releases/download/v0.1.0/ashfall-native-edition-alpha-0.1.0.pack.json',
      size: 10,
    },
  },
  dependencies: [{ id: 'echoarmory', kind: 'module', version: '*' }],
  compatibility: ['ashfall-native-edition'],
}

const canonicalStandalonePack: CanonicalReleaseIndexEntry = {
  ...canonicalPack,
  id: 'ashfall-standalone-edition',
  channel: 'experimental',
  sourceRepo: 'knoxhack/ECHO-Ashfall-Standalone-Edition',
  artifacts: {
    pack: { file: 'ashfall-standalone-edition-0.1.0.zip', sha256: '7'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Ashfall-Standalone-Edition/releases/download/v0.1.0/ashfall-standalone-edition-0.1.0.zip', size: 100 },
    manifest: {
      file: 'ashfall-standalone-edition-experimental-0.1.0.pack.json',
      sha256: '8'.repeat(64),
      url: 'https://github.com/knoxhack/ECHO-Ashfall-Standalone-Edition/releases/download/v0.1.0/ashfall-standalone-edition-experimental-0.1.0.pack.json',
      size: 10,
    },
  },
  dependencies: [],
  compatibility: ['ashfall-standalone-edition'],
}

const canonicalSkyRelayPack: CanonicalReleaseIndexEntry = {
  ...canonicalPack,
  id: 'sky-relay-native-edition',
  version: '0.1.0',
  sourceRepo: 'knoxhack/ECHO-Sky-Relay-Native-Edition',
  releaseTag: 'sky-relay-native-0.1.0-alpha',
  artifacts: {
    pack: {
      file: 'sky-relay-native-edition-0.1.0.zip',
      sha256: '1'.repeat(64),
      url: 'https://github.com/knoxhack/ECHO-Sky-Relay-Native-Edition/releases/download/sky-relay-native-0.1.0-alpha/sky-relay-native-edition-0.1.0.zip',
      size: 100,
    },
    manifest: {
      file: 'sky-relay-native-edition-alpha-0.1.0.pack.json',
      sha256: '2'.repeat(64),
      url: 'https://github.com/knoxhack/ECHO-Sky-Relay-Native-Edition/releases/download/sky-relay-native-0.1.0-alpha/sky-relay-native-edition-alpha-0.1.0.pack.json',
      size: 10,
    },
  },
  dependencies: [{ id: 'echoskyrelayprotocol', kind: 'addon', version: '0.1.0' }],
  compatibility: ['native', 'sky-relay'],
  trust: 'echo-workflow-built',
  validation: 'approved',
}

const canonicalOpenlandsWarningPack: CanonicalReleaseIndexEntry = {
  ...canonicalSkyRelayPack,
  id: 'openlands-native-edition',
  sourceRepo: 'knoxhack/ECHO-Openlands-Native-Edition',
  releaseTag: 'planned-openlands-native-0.1.0',
  artifacts: {},
  dependencies: [{ id: 'echoopenlandsprotocol', kind: 'addon', version: '0.1.0' }],
  compatibility: ['native', 'openlands'],
  trust: 'source-linked',
  validation: 'warning',
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

const canonicalStudioProduct: CanonicalReleaseIndexEntry = {
  ...canonicalLauncherProduct,
  id: 'echo-addons-studio',
  kind: 'studio',
  sourceRepo: 'knoxhack/ECHO-Addons-Studio',
  artifacts: {
    latestYml: { file: 'latest.yml', sha256: '2'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Addons-Studio/releases/download/v0.1.0/latest.yml' },
    windowsSetup: { file: 'ECHO.Addon.Studio-Setup-0.1.0.exe', sha256: '3'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Addons-Studio/releases/download/v0.1.0/ECHO.Addon.Studio-Setup-0.1.0.exe' },
  },
}

const canonicalNativeRuntimeProduct: CanonicalReleaseIndexEntry = {
  ...canonicalLauncherProduct,
  id: 'echo-native-platform',
  kind: 'runtime',
  sourceRepo: 'knoxhack/ECHO-Native-Platform',
  artifacts: {
    archive: { file: 'echo-native-product-1.0.0-existing-layout-rc.zip', sha256: '4'.repeat(64), url: 'https://github.com/knoxhack/ECHO-Native-Platform/releases/download/v0.1.0-native-platform-alpha/echo-native-product-1.0.0-existing-layout-rc.zip' },
  },
  compatibility: ['ashfall-native-edition'],
}

function releaseIndex(overrides: Partial<ReleaseIndex>): ReleaseIndex {
  return {
    cacheVersion: 4,
    source: {
      provider: 'release-index',
      channelUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/launcher-channel.json',
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

  it('uses the latest approved Catalog release instead of bundled fallback versions', () => {
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

  it('selects approved Arcana Division beta releases by official pack id', () => {
    const arcanaRelease: ReleaseEntry = {
      ...baseRelease,
      id: 'arcana-native',
      pack: 'arcana-division-native-edition',
      channel: 'beta',
      version: '1.0.0',
      tagName: 'arcana-division-native-1.0.0-beta',
      publishedAt: '2026-06-12T09:02:29Z',
    }

    expect(normalizeOfficialPackId('arcana-division')).toBe('arcana-division-native-edition')
    expect(normalizeOfficialPackId('arcane-division')).toBe('arcana-division-native-edition')
    expect(isPlayablePackRelease(arcanaRelease, 'arcana-division-native-loader')).toBe(true)
    expect(latestPlayableReleaseForPack(releaseIndex({ releases: [baseRelease, arcanaRelease] }), 'arcana-division')?.version).toBe('1.0.0')
  })

  it('normalizes Sky Relay and Openlands official pack aliases', () => {
    expect(officialPackIds).toEqual([
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
    expect(normalizeOfficialPackId('sky-relay')).toBe('sky-relay-native-edition')
    expect(normalizeOfficialPackId('sky-relay-neoforge')).toBe('sky-relay-neoforge-edition')
    expect(normalizeOfficialPackId('sky-relay-standalone-runtime')).toBe('sky-relay-standalone-edition')
    expect(normalizeOfficialPackId('openlands')).toBe('openlands-native-edition')
    expect(normalizeOfficialPackId('openlans')).toBe('openlands-native-edition')
    expect(normalizeOfficialPackId('openlans-neoforge')).toBe('openlands-neoforge-edition')
    expect(normalizeOfficialPackId('openlands-standalone-runtime')).toBe('openlands-standalone-edition')
    expect(isPlayablePackRelease({ ...baseRelease, pack: 'sky-relay-native-edition' }, 'sky-relay')).toBe(true)
  })

  it('builds expected pack manifest asset names', () => {
    expect(packManifestAssetName('alpha', '0.1.0', 'ashfall-native-edition')).toBe('ashfall-native-edition-alpha-0.1.0.pack.json')
    expect(packManifestAssetName('alpha', '0.1.0', 'sky-relay-native-edition')).toBe('sky-relay-native-edition-alpha-0.1.0.pack.json')
    expect(packManifestAssetName('alpha', '0.1.0', 'openlands-neoforge-edition')).toBe('openlands-neoforge-edition-alpha-0.1.0.pack.json')
    expect(packManifestAssetName('beta', '1.0.0', 'arcana-division-native-edition')).toBe('arcana-division-native-edition-beta-1.0.0.pack.json')
    expect(packManifestAssetName('experimental', '0.1.0', 'ashfall-standalone-edition')).toBe('ashfall-standalone-edition-experimental-0.1.0.pack.json')
  })

  it('builds expected module artifact names', () => {
    expect(moduleArtifactFamilyForPack('sky-relay-native-edition')).toBe('echo-addon')
    expect(moduleArtifactFamilyForPack('openlands-neoforge-edition')).toBe('neoforge')
    expect(moduleArtifactFamilyForPack('sky-relay-standalone-edition')).toBe('standalone')
    expect(moduleArtifactName('echocore', '1.0.0', 'neoforge')).toBe('echocore-1.0.0-neoforge.jar')
    expect(moduleArtifactName('echocore', '1.0.0', 'standalone')).toBe('echocore-1.0.0-standalone.jar')
    expect(moduleArtifactName('echocore', '1.0.0', 'echo-addon')).toBe('echocore-1.0.0.echo-addon')
  })

  it('maps approved Release Index modpacks into strict release entries', () => {
    const entry = releaseEntryFromCanonicalModpack(canonicalPack, '2026-06-09T00:00:00Z')
    const standaloneEntry = releaseEntryFromCanonicalModpack(canonicalStandalonePack, '2026-06-09T00:00:00Z')

    expect(entry).toMatchObject({
      pack: 'ashfall-neoforge-edition',
      version: '0.1.0',
      manifestAssetName: 'ashfall-neoforge-edition-alpha-0.1.0.pack.json',
      manifestSha256: 'f'.repeat(64),
      trust: 'verified-metadata',
    })
    expect(entry?.assets.map((asset) => asset.name)).toContain('ashfall-neoforge-edition-0.1.0.zip')
    expect(standaloneEntry).toMatchObject({
      pack: 'ashfall-standalone-edition',
      channel: 'experimental',
      version: '0.1.0',
      manifestAssetName: 'ashfall-standalone-edition-experimental-0.1.0.pack.json',
      trust: 'verified-metadata',
    })
  })

  it('maps approved Sky Relay entries and keeps warning Openlands entries non-playable', () => {
    const skyRelayEntry = releaseEntryFromCanonicalModpack(canonicalSkyRelayPack, '2026-06-12T00:00:00Z')
    const openlandsEntry = releaseEntryFromCanonicalModpack(canonicalOpenlandsWarningPack, '2026-06-12T00:00:00Z')

    expect(skyRelayEntry).toMatchObject({
      pack: 'sky-relay-native-edition',
      channel: 'alpha',
      version: '0.1.0',
      tagName: 'sky-relay-native-0.1.0-alpha',
      manifestAssetName: 'sky-relay-native-edition-alpha-0.1.0.pack.json',
      trust: 'verified-metadata',
    })
    expect(skyRelayEntry?.assets.map((asset) => asset.name)).toContain('sky-relay-native-edition-0.1.0.zip')
    expect(openlandsEntry).toBeNull()
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
    expect(resolveEchoProtocolEntry('echo://install/addon/echoarmory?pack=ashfall-native-edition', [canonicalModule])).toBeNull()
    expect(resolveEchoProtocolEntry('echo://install/addon/echoarmory?pack=ashfall-native-edition', [
      canonicalModule,
      { ...canonicalCore, validation: 'blocked' },
      canonicalNativePack,
    ])).toBeNull()
    expect(resolveEchoProtocolEntry('echo://install/addon/echoarmory?pack=ashfall-native-edition', [canonicalModule, canonicalCore])).toBeNull()
    const addonInstall = resolveEchoProtocolEntry('echo://install/addon/echoarmory?pack=ashfall-native-edition', [canonicalModule, canonicalCore, canonicalNativePack])
    expect(addonInstall?.entry.id).toBe('echoarmory')
    expect(addonInstall?.action).toBe('install-addon')
    if (addonInstall?.action !== 'install-addon') throw new Error('Expected addon install resolution.')
    expect(addonInstall.packEntry?.id).toBe('ashfall-native-edition')
    expect(addonInstall.artifact.name).toBe('echoarmory-1.0.0.echo-addon')
    expect(addonInstall.dependencies?.map((entry) => entry.id)).toEqual(['echocore'])
    expect(resolveEchoProtocolEntry('echo://update/pack/ashfall-neoforge-edition', [canonicalPack])?.entry.id).toBe('ashfall-neoforge-edition')
    expect(parseEchoProtocolUrl('echo://update/pack/sky-relay-native-edition')).toMatchObject({
      action: 'update-pack',
      id: 'sky-relay-native-edition',
    })
    expect(parseEchoProtocolUrl('echo://install/addon/echoskyrelayprotocol?pack=sky-relay-neoforge')).toMatchObject({
      action: 'install-addon',
      id: 'echoskyrelayprotocol',
      pack: 'sky-relay-neoforge-edition',
    })
    expect(parseEchoProtocolUrl('echo://update/pack/openlans')).toMatchObject({
      action: 'update-pack',
      id: 'openlands-native-edition',
    })
  })

  it('rejects addon install links when the requested pack has no indexed artifact', () => {
    expect(resolveEchoProtocolEntry('echo://install/addon/echocore?pack=ashfall-neoforge-edition', [canonicalCore])).toBeNull()
  })

  it('selects module artifacts by pack target', () => {
    expect(artifactForPackTarget(canonicalModule, 'ashfall-native-edition')?.name).toBe('echoarmory-1.0.0.echo-addon')
    expect(artifactForPackTarget(canonicalModule, 'ashfall-neoforge-edition')?.name).toBe('echoarmory-1.0.0-neoforge.jar')
    expect(artifactForPackTarget(canonicalModule, 'ashfall-standalone-edition')?.name).toBe('echoarmory-1.0.0-standalone.jar')
  })

  it('rejects development visibility source-packaged module artifacts', () => {
    const sourcePackagedModule: CanonicalReleaseIndexEntry = {
      ...canonicalModule,
      artifacts: {
        native: { ...(canonicalModule.artifacts as Record<string, Record<string, unknown>>).native, buildMode: 'source-packaged' },
        neoforge: { ...(canonicalModule.artifacts as Record<string, Record<string, unknown>>).neoforge, buildMode: 'source-packaged' },
        standalone: { ...(canonicalModule.artifacts as Record<string, Record<string, unknown>>).standalone, buildMode: 'source-packaged' },
      },
    }

    expect(artifactForPackTarget(sourcePackagedModule, 'ashfall-native-edition')).toBeNull()
    expect(artifactForPackTarget(sourcePackagedModule, 'ashfall-neoforge-edition')).toBeNull()
    expect(resolveEchoProtocolEntry('echo://install/addon/echoarmory?pack=ashfall-native-edition', [
      sourcePackagedModule,
      canonicalCore,
      canonicalNativePack,
    ])).toBeNull()
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

  it('selects studio and runtime updates through exact indexed product entries', () => {
    expect(productUpdateSelection([
      { ...canonicalStudioProduct, validation: 'warning' },
      canonicalStudioProduct,
    ], 'echo-addons-studio', 'windows-x64')).toMatchObject({
      entry: { id: 'echo-addons-studio', kind: 'studio' },
      artifact: { name: 'ECHO.Addon.Studio-Setup-0.1.0.exe', sha256: '3'.repeat(64) },
    })

    expect(productUpdateSelection([
      { ...canonicalNativeRuntimeProduct, validation: 'warning' },
      canonicalNativeRuntimeProduct,
    ], 'echo-native-platform', 'ashfall-native-edition')).toMatchObject({
      entry: { id: 'echo-native-platform', kind: 'runtime' },
      artifact: { name: 'echo-native-product-1.0.0-existing-layout-rc.zip', sha256: '4'.repeat(64) },
    })
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
      moduleRequirements: [{ id: 'echocore', version: '1.4.0' }],
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
      moduleRequirements: [{ id: 'echocore', version: '1.2.0' }],
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

  it('rejects official pack manifests without module requirements', () => {
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
        modules: ['echocore'],
        files: [
          {
            path: 'mods/echocore-1.0.0-neoforge.jar',
            assetName: 'echocore-1.0.0-neoforge.jar',
            sha256: 'c'.repeat(64),
            size: 100,
            required: true,
            moduleId: 'echocore',
            side: 'both',
          },
        ],
        changelog: ['NeoForge release'],
        worldgenWarning: true,
      }),
    ).toThrow(/must include moduleRequirements/)
  })

  it('accepts all three Arcana Division beta pack manifests', () => {
    const nativeManifest = validatePackManifest({
      ...baseManifest(),
      pack: 'arcana-division-native-edition',
      version: '1.0.0',
      channel: 'beta',
      moduleRequirements: Array.from({ length: 24 }, (_, index) => ({
        id: `echoarcana${index}`,
        version: '1.0.0',
      })),
    })
    const neoforgeManifest = validatePackManifest({
      pack: 'arcana-division-neoforge-edition',
      version: '1.0.0',
      channel: 'beta',
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
      moduleRequirements: [{ id: 'echocore', version: '1.0.0' }],
      modules: ['echocore'],
      files: [
        {
          path: 'mods/echocore-1.0.0-neoforge.jar',
          assetName: 'echocore-1.0.0-neoforge.jar',
          sha256: 'c'.repeat(64),
          size: 100,
          required: true,
          moduleId: 'echocore',
          side: 'both',
        },
      ],
      changelog: ['Arcana beta'],
      worldgenWarning: true,
    })
    const standaloneManifest = validatePackManifest({
      pack: 'arcana-division-standalone-edition',
      version: '1.0.0',
      channel: 'beta',
      minecraft: 'standalone',
      runtime: { requiredJava: 'none' },
      launch: { mainClass: 'com.echo.runtime.ArcanaDivisionStandaloneMain', gameArgs: [], jvmArgs: [] },
      moduleRequirements: [{ id: 'echocore', version: '1.0.0' }],
      modules: ['echocore'],
      files: [
        {
          path: 'mods/echocore-1.0.0-standalone.jar',
          assetName: 'echocore-1.0.0-standalone.jar',
          sha256: 'd'.repeat(64),
          size: 100,
          required: true,
          moduleId: 'echocore',
          side: 'both',
        },
      ],
      changelog: ['Arcana beta'],
      worldgenWarning: true,
    })

    expect(nativeManifest.pack).toBe('arcana-division-native-edition')
    expect(nativeManifest.moduleRequirements).toHaveLength(24)
    expect(neoforgeManifest.pack).toBe('arcana-division-neoforge-edition')
    expect(standaloneManifest.pack).toBe('arcana-division-standalone-edition')
  })

  it('accepts Sky Relay and Openlands official pack manifests', () => {
    const skyRelayNative = validatePackManifest({
      ...baseManifest(),
      pack: 'sky-relay-native-edition',
      moduleRequirements: [{ id: 'echoskyrelayprotocol', version: '0.1.0' }],
    })
    const skyRelayStandalone = validatePackManifest({
      pack: 'sky-relay-standalone-edition',
      version: '0.1.0',
      channel: 'alpha',
      minecraft: 'standalone',
      runtime: { requiredJava: 'none' },
      launch: { mainClass: 'com.echo.runtime.SkyRelayStandaloneMain', gameArgs: [], jvmArgs: [] },
      moduleRequirements: [{ id: 'echoskyrelayprotocol', version: '0.1.0' }],
      modules: ['echoskyrelayprotocol'],
      files: [
        {
          path: 'mods/echoskyrelayprotocol-0.1.0-standalone.jar',
          assetName: 'echoskyrelayprotocol-0.1.0-standalone.jar',
          sha256: 'd'.repeat(64),
          size: 100,
          required: true,
          moduleId: 'echoskyrelayprotocol',
          side: 'both',
        },
      ],
      changelog: ['Sky Relay alpha'],
      worldgenWarning: false,
    })
    const openlandsNeoForge = validatePackManifest({
      pack: 'openlans-neoforge',
      version: '0.1.0',
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
      moduleRequirements: [{ id: 'echoopenlandsprotocol', version: '0.1.0' }],
      modules: ['echoopenlandsprotocol'],
      files: [
        {
          path: 'mods/echoopenlandsprotocol-0.1.0-neoforge.jar',
          assetName: 'echoopenlandsprotocol-0.1.0-neoforge.jar',
          sha256: 'c'.repeat(64),
          size: 100,
          required: true,
          moduleId: 'echoopenlandsprotocol',
          side: 'both',
        },
      ],
      changelog: ['Openlands planned manifest'],
      worldgenWarning: true,
    })

    expect(skyRelayNative.pack).toBe('sky-relay-native-edition')
    expect(skyRelayStandalone.pack).toBe('sky-relay-standalone-edition')
    expect(openlandsNeoForge.pack).toBe('openlands-neoforge-edition')
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
      moduleRequirements: [{ id: 'echocore', version: '1.0.0' }],
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
        moduleRequirements: [{ id: 'echocore', version: '1.0.0' }],
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
        moduleRequirements: [{ id: 'echocore', version: '1.0.0' }],
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
    moduleRequirements: [{ id: 'echocore', version: '1.4.0' }],
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


