import { describe, expect, it } from 'vitest'
import { officialModpacks } from './officialModpacks'

describe('official modpack catalog', () => {
  it('lists the official launcher products surfaced for public alpha readiness', () => {
    expect(officialModpacks.map((pack) => pack.id)).toEqual([
      'ashfall-native-edition',
      'ashfall-neoforge-edition',
      'ashfall-standalone-edition',
      'sky-relay-native-edition',
      'sky-relay-neoforge-edition',
      'sky-relay-standalone-edition',
    ])
    expect(officialModpacks.map((pack) => pack.catalogId)).toEqual([
      'ashfall-native-edition',
      'ashfall-neoforge-edition',
      'ashfall-standalone-edition',
      'sky-relay-native-edition',
      'sky-relay-neoforge-edition',
      'sky-relay-standalone-edition',
    ])
    expect(officialModpacks.map((pack) => pack.runtimeMode)).toEqual([
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
    ])
    expect(JSON.stringify(officialModpacks)).toMatch(/neoforge/i)
  })

  it('keeps Sky Relay gated as a visible preview until release evidence is promoted', () => {
    const skyRelayPacks = officialModpacks.filter((pack) => pack.id.startsWith('sky-relay-'))

    expect(skyRelayPacks).toHaveLength(3)
    expect(skyRelayPacks.map((pack) => pack.status)).toEqual(['preview', 'preview', 'preview'])
    expect(skyRelayPacks.map((pack) => pack.phase)).toEqual(['Planned Alpha', 'Planned Alpha', 'Runtime Prep'])
    expect(skyRelayPacks.map((pack) => pack.version)).toEqual(['Catalog planned', 'Catalog planned', 'Catalog planned'])
    expect(skyRelayPacks.map((pack) => pack.moduleCount)).toEqual([5, 5, 5])
    expect(skyRelayPacks.map((pack) => pack.name)).toEqual([
      'Sky Relay Native Edition',
      'Sky Relay NeoForge Edition',
      'Sky Relay Standalone Edition',
    ])
  })
})


