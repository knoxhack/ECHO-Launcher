import { describe, expect, it } from 'vitest'
import type { ReleaseIndex } from '../types/releases'
import { officialModpacks, officialModpacksFromReleaseIndex } from './officialModpacks'

const officialPackIds = [
  'ashfall-native-edition',
  'ashfall-neoforge-edition',
  'ashfall-standalone-edition',
  'sky-relay-native-edition',
  'sky-relay-neoforge-edition',
  'sky-relay-standalone-edition',
  'galactic-survey-native-edition',
  'galactic-survey-neoforge-edition',
  'galactic-survey-standalone-edition',
  'openlands-native-edition',
  'openlands-neoforge-edition',
  'openlands-standalone-edition',
  'arcana-division-native-edition',
  'arcana-division-neoforge-edition',
  'arcana-division-standalone-edition',
] as const

function releaseIndexFixture(): ReleaseIndex {
  return {
    cacheVersion: 4,
    source: { provider: 'release-index', channelUrl: 'https://example.test/channels/alpha/launcher-channel.json' },
    fetchedAt: '2026-06-12T12:00:00Z',
    releases: [
      {
        id: 'release-index:sky-relay-native-edition:0.1.0',
        pack: 'sky-relay-native-edition',
        version: '0.1.0',
        channel: 'alpha',
        tagName: 'sky-relay-native-0.1.0-alpha',
        name: 'Sky Relay Native Edition 0.1.0',
        draft: false,
        prerelease: true,
        publishedAt: '2026-06-11T13:32:21Z',
        releasePageUrl: 'https://github.com/knoxhack/ECHO-Sky-Relay-Native-Edition/releases/tag/sky-relay-native-0.1.0-alpha',
        releaseNotes: ['Resolved through the approved Catalog entry sky-relay-native-edition.'],
        manifestAssetName: 'sky-relay-native-edition-alpha-0.1.0.pack.json',
        manifestUrl: 'https://example.test/sky-relay-native-edition-alpha-0.1.0.pack.json',
        manifestSha256: '3'.repeat(64),
        trust: 'verified-metadata',
        assets: [],
      },
    ],
    packs: [
      {
        id: 'sky-relay-native-edition',
        name: 'Sky Relay Native Edition',
        channel: 'alpha',
        loader: 'echo-native-loader',
        moduleArtifactFamily: 'echo-addon',
        catalogStatus: 'approved',
        catalogEntryUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/sky-relay-native.json',
      },
      {
        id: 'openlands-native-edition',
        name: 'Openlands Native Edition',
        channel: 'alpha',
        loader: 'echo-native-loader',
        moduleArtifactFamily: 'echo-addon',
        catalogStatus: 'unpublished',
        repoUrl: 'https://github.com/knoxhack/ECHO-Openlands-Native-Edition',
        diagnostic: 'Openlands Native Edition is official but has no public GitHub release assets yet.',
      },
    ],
    acceptedCount: 1,
    rejectedReleases: [],
    diagnostics: [],
    latestPlayableRelease: null,
    warnings: [],
  }
}

function ashfallWarningIndexFixture(): ReleaseIndex {
  return {
    cacheVersion: 4,
    source: { provider: 'release-index', channelUrl: 'https://example.test/channels/alpha/launcher-channel.json' },
    fetchedAt: '2026-06-12T12:00:00Z',
    releases: [],
    packs: [
      {
        id: 'ashfall-native-edition',
        name: 'Ashfall Native Edition',
        channel: 'alpha',
        loader: 'echo-native-loader',
        moduleArtifactFamily: 'echo-addon',
        catalogStatus: 'warning',
        catalogEntryUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/ashfall-native.json',
        diagnostic: 'Ashfall Native assets are checksum-exact, but Phase 7-10 release-readiness evidence is not green; launcher installs stay locked.',
      },
      {
        id: 'ashfall-neoforge-edition',
        name: 'Ashfall NeoForge Edition',
        channel: 'alpha',
        loader: 'neoforge',
        moduleArtifactFamily: 'neoforge',
        catalogStatus: 'warning',
        catalogEntryUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/ashfall-neoforge.json',
        diagnostic: 'Ashfall NeoForge live manifest is missing moduleRequirements and release-readiness evidence is not green; launcher installs stay locked.',
      },
      {
        id: 'ashfall-standalone-edition',
        name: 'Ashfall Standalone Edition',
        channel: 'experimental',
        loader: 'standalone',
        moduleArtifactFamily: 'standalone',
        catalogStatus: 'warning',
        catalogEntryUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/ashfall-standalone.json',
        diagnostic: 'Ashfall Standalone live manifest is missing moduleRequirements and release-readiness evidence is not green; launcher installs stay locked.',
      },
    ],
    acceptedCount: 0,
    rejectedReleases: [],
    diagnostics: [],
    latestPlayableRelease: null,
    warnings: ['Ashfall release-readiness gate is still red.'],
  }
}

function approvedLookingWithoutReleaseFixture(): ReleaseIndex {
  return {
    cacheVersion: 4,
    source: { provider: 'release-index', channelUrl: 'https://example.test/channels/alpha/launcher-channel.json' },
    fetchedAt: '2026-06-12T12:00:00Z',
    releases: [],
    packs: [
      {
        id: 'sky-relay-native-edition',
        name: 'Sky Relay Native Edition',
        channel: 'alpha',
        loader: 'echo-native-loader',
        moduleArtifactFamily: 'echo-addon',
        catalogStatus: 'approved',
        catalogEntryUrl: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/modpacks/sky-relay-native.json',
      },
    ],
    acceptedCount: 0,
    rejectedReleases: [],
    diagnostics: [],
    latestPlayableRelease: null,
    warnings: ['Sky Relay modpack entry is warning-gated.'],
  }
}

describe('official modpack catalog', () => {
  it('keeps visual fallback data for every official launcher pack family', () => {
    expect(officialModpacks.map((pack) => pack.id)).toEqual([...officialPackIds])
    expect(officialModpacks.map((pack) => pack.catalogId)).toEqual([...officialPackIds])
    expect(officialModpacks.map((pack) => pack.runtimeMode)).toEqual([
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
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
    ])
    expect(JSON.stringify(officialModpacks)).toMatch(/openlands/i)
    expect(JSON.stringify(officialModpacks)).toMatch(/sky relay/i)
    expect(JSON.stringify(officialModpacks)).toMatch(/galactic survey/i)
  })

  it('keeps fallback Ashfall packs view-only while readiness is blocked', () => {
    const ashfall = officialModpacks.filter((pack) => pack.id.startsWith('ashfall-'))

    expect(ashfall.map((pack) => pack.status)).toEqual(['preview', 'preview', 'preview'])
    expect(ashfall.map((pack) => pack.version)).toEqual(['Catalog gated', 'Catalog gated', 'Catalog gated'])
    expect(ashfall.map((pack) => pack.catalogStatus)).toEqual(['warning', 'warning', 'warning'])
  })

  it('builds visible cards from Release Index channel pack metadata', () => {
    const cards = officialModpacksFromReleaseIndex(releaseIndexFixture())

    expect(cards.map((pack) => pack.id)).toEqual(['sky-relay-native-edition', 'openlands-native-edition'])
  })

  it('makes approved Sky Relay releases playable from the Release Index', () => {
    const skyRelay = officialModpacksFromReleaseIndex(releaseIndexFixture()).find((pack) => pack.id === 'sky-relay-native-edition')

    expect(skyRelay).toMatchObject({
      status: 'playable',
      phase: 'Approved Alpha',
      version: '0.1.0',
      moduleCount: 12,
      catalogStatus: 'approved',
    })
  })

  it('shows Openlands as official but unpublished until real release assets exist', () => {
    const openlands = officialModpacksFromReleaseIndex(releaseIndexFixture()).find((pack) => pack.id === 'openlands-native-edition')

    expect(openlands).toMatchObject({
      status: 'preview',
      phase: 'Unpublished',
      version: 'No release yet',
      catalogStatus: 'unpublished',
      sourceRepo: 'https://github.com/knoxhack/ECHO-Openlands-Native-Edition',
    })
    expect(openlands?.detail).toMatch(/no public GitHub release assets/i)
  })

  it('keeps warning-gated Ashfall channel packs locked with diagnostics', () => {
    const cards = officialModpacksFromReleaseIndex(ashfallWarningIndexFixture())

    expect(cards).toHaveLength(3)
    expect(cards.map((pack) => pack.status)).toEqual(['preview', 'preview', 'preview'])
    expect(cards.map((pack) => pack.phase)).toEqual(['Warning Gated', 'Warning Gated', 'Warning Gated'])
    expect(cards.map((pack) => pack.version)).toEqual(['Catalog gated', 'Catalog gated', 'Catalog gated'])
    expect(cards[0]?.detail).toMatch(/Phase 7-10/)
    expect(cards[1]?.detail).toMatch(/missing moduleRequirements/)
    expect(cards[2]?.detail).toMatch(/missing moduleRequirements/)
  })

  it('does not treat approved-looking channel rows as playable without an approved release', () => {
    const skyRelay = officialModpacksFromReleaseIndex(approvedLookingWithoutReleaseFixture()).find((pack) => pack.id === 'sky-relay-native-edition')

    expect(skyRelay).toMatchObject({
      status: 'preview',
      phase: 'Catalog Mismatch',
      version: 'Catalog pending',
      catalogStatus: 'catalog-mismatch',
    })
    expect(skyRelay?.detail).toMatch(/approved-looking/)
  })
})
