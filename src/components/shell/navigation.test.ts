import { describe, expect, it } from 'vitest'
import { getVisibleNavItems } from './navigation'

describe('navigation visibility', () => {
  it('hides creator tooling in default tester mode', () => {
    const ids = getVisibleNavItems({ advancedMode: false, creatorMode: false }).map((item) => item.id)
    expect(ids).toContain('home')
    expect(ids).toContain('runtime')
    expect(ids).toContain('chat')
    expect(ids).toContain('modpacks')
    expect(ids).not.toContain('publisher')
  })

  it('shows publisher tooling only in creator mode', () => {
    expect(getVisibleNavItems({ advancedMode: true, creatorMode: false }).map((item) => item.id)).not.toContain('publisher')
    expect(getVisibleNavItems({ advancedMode: true, creatorMode: true }).map((item) => item.id)).toContain('publisher')
  })
})
