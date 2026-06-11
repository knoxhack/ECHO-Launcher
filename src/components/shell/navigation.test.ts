import { describe, expect, it } from 'vitest'
import { getVisibleNavItems, normalizePageId } from './navigation'

describe('navigation visibility', () => {
  it('shows the catalog-first player flow', () => {
    const ids = getVisibleNavItems({ advancedMode: false, creatorMode: false }).map((item) => item.id)
    expect(ids).toEqual(['home', 'library', 'community', 'tools', 'settings'])
  })

  it('maps legacy pages into the new top-level pages', () => {
    expect(normalizePageId('runtime')).toBe('library')
    expect(normalizePageId('modpacks')).toBe('library')
    expect(normalizePageId('downloads')).toBe('library')
    expect(normalizePageId('profiles')).toBe('library')
    expect(normalizePageId('logs')).toBe('tools')
    expect(normalizePageId('ecosystem')).toBe('tools')
    expect(normalizePageId('servers')).toBe('community')
    expect(normalizePageId('chat')).toBe('community')
    expect(normalizePageId('publisher')).toBe('home')
    expect(normalizePageId('unknown')).toBe('home')
  })
})
