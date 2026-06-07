import { describe, expect, it } from 'vitest'
import { officialModpacks } from './officialModpacks'

describe('official modpack catalog', () => {
  it('lists only the public alpha launcher products', () => {
    expect(officialModpacks.map((pack) => pack.id)).toEqual([
      'ashfall-native-edition',
      'standalone-runtime-showcase',
    ])
    expect(officialModpacks.map((pack) => pack.repo)).toEqual([
      'knoxhack/ECHO-Native-Platform-Public-Alpha',
      'knoxhack/ECHO-Native-Platform-Public-Alpha',
    ])
    expect(officialModpacks.map((pack) => pack.runtimeMode)).toEqual([
      'native-loader-minecraft',
      'native-runtime',
    ])
    expect(JSON.stringify(officialModpacks)).not.toMatch(/neoforge/i)
  })
})
