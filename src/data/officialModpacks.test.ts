import { describe, expect, it } from 'vitest'
import { officialModpacks } from './officialModpacks'

describe('official modpack catalog', () => {
  it('lists only the public alpha launcher products', () => {
    expect(officialModpacks.map((pack) => pack.id)).toEqual([
      'ashfall-native-edition',
      'ashfall-neoforge-edition',
      'ashfall-standalone-edition',
    ])
    expect(officialModpacks.map((pack) => pack.repo)).toEqual([
      'knoxhack/ECHO-Ashfall-Native-Edition',
      'knoxhack/ECHO-Ashfall-NeoForge-Edition',
      'knoxhack/ECHO-Ashfall-Standalone-Edition',
    ])
    expect(officialModpacks.map((pack) => pack.runtimeMode)).toEqual([
      'native-loader-minecraft',
      'native-loader-minecraft',
      'native-runtime',
    ])
    expect(JSON.stringify(officialModpacks)).toMatch(/neoforge/i)
  })
})


