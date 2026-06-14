import { describe, expect, it } from 'vitest'
import { officialModpacks } from '../../data/officialModpacks'
import type { NativePackState } from '../../types/native'
import { filterLibraryPacks, groupLibraryPacks } from './libraryUtils'

describe('libraryUtils', () => {
  it('groups official packs by family and orders runtime lanes consistently', () => {
    const groups = groupLibraryPacks(officialModpacks)

    expect(groups.map((group) => group.family.name)).toEqual([
      'Ashfall',
      'Sky Relay',
      'Openlands',
      'Galactic Survey',
      'Arcana Division',
    ])
    expect(groups.find((group) => group.family.id === 'sky-relay')?.packs.map((pack) => pack.runtimeLaneLabel)).toEqual([
      'Native Loader',
      'NeoForge',
      'Standalone',
    ])
  })

  it('filters by family, runtime, search, and state without changing pack metadata', () => {
    const skyRelay = filterLibraryPacks(officialModpacks, {}, {
      query: 'floating',
      family: 'sky-relay',
      runtime: 'all',
      state: 'all',
    })
    const standalone = filterLibraryPacks(officialModpacks, {}, {
      query: '',
      family: 'all',
      runtime: 'native-runtime',
      state: 'all',
    })
    const readyStates = {
      'sky-relay-native-edition': {
        ok: true,
        primaryAction: { kind: 'play' },
      },
      'sky-relay-neoforge-edition': {
        ok: false,
        primaryAction: { kind: 'repair' },
      },
      'sky-relay-standalone-edition': {
        ok: false,
        primaryAction: { kind: 'unavailable' },
      },
    } as unknown as Record<string, NativePackState>

    expect(skyRelay.map((pack) => pack.id)).toEqual(['sky-relay-native-edition'])
    expect(standalone.every((pack) => pack.runtimeLaneLabel === 'Standalone')).toBe(true)
    expect(filterLibraryPacks(officialModpacks, readyStates, { query: '', family: 'sky-relay', runtime: 'all', state: 'ready' }).map((pack) => pack.id)).toEqual(['sky-relay-native-edition'])
    expect(filterLibraryPacks(officialModpacks, readyStates, { query: '', family: 'sky-relay', runtime: 'all', state: 'needs-attention' }).map((pack) => pack.id)).toEqual(['sky-relay-neoforge-edition'])
  })
})
