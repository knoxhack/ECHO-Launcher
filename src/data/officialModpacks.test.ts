import { describe, expect, it } from 'vitest'
import { officialModpacks } from './officialModpacks'

describe('official modpack catalog', () => {
  it('lists the public alpha and Arcana beta launcher products', () => {
    expect(officialModpacks.map((pack) => pack.id)).toEqual([
      'ashfall-native-edition',
      'ashfall-neoforge-edition',
      'ashfall-standalone-edition',
      'arcana-division-native-edition',
      'arcana-division-neoforge-edition',
      'arcana-division-standalone-edition',
    ])
    expect(officialModpacks.map((pack) => pack.catalogId)).toEqual([
      'ashfall-native-edition',
      'ashfall-neoforge-edition',
      'ashfall-standalone-edition',
      'arcana-division-native-edition',
      'arcana-division-neoforge-edition',
      'arcana-division-standalone-edition',
    ])
    expect(officialModpacks.map((pack) => pack.runtimeMode)).toEqual([
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
      'native-loader-minecraft',
      'neoforge-minecraft',
      'native-runtime',
    ])
    expect(officialModpacks.filter((pack) => pack.channel === 'beta').map((pack) => pack.id)).toEqual([
      'arcana-division-native-edition',
      'arcana-division-neoforge-edition',
      'arcana-division-standalone-edition',
    ])
    expect(JSON.stringify(officialModpacks)).toMatch(/neoforge/i)
  })
})


