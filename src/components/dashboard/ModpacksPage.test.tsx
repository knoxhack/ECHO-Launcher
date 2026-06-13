import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModpacksPage } from './ModpacksPage'

describe('ModpacksPage Sky Relay cards', () => {
  it('renders Sky Relay as visible preview cards with inspection actions instead of fake installs', () => {
    const markup = renderToStaticMarkup(<ModpacksPage />)
    const skyRelayPackNames = [
      'Sky Relay Native Edition',
      'Sky Relay NeoForge Edition',
      'Sky Relay Standalone Edition',
    ]
    const previewAffordance = 'Inspect Gate'

    expect(markup).toContain('Official Packs')
    expect(markup).toContain('12')
    skyRelayPackNames.forEach((name, index) => {
      const cardStart = markup.indexOf(name)
      const nextCardStart = skyRelayPackNames[index + 1] ? markup.indexOf(skyRelayPackNames[index + 1]) : -1
      const affordanceStart = markup.indexOf(previewAffordance, cardStart)

      expect(cardStart).toBeGreaterThan(-1)
      expect(affordanceStart).toBeGreaterThan(cardStart)
      if (nextCardStart > -1) expect(affordanceStart).toBeLessThan(nextCardStart)
    })
    expect(markup).not.toContain('Install Sky Relay')
    expect(markup).not.toContain('Play Sky Relay')
    expect(markup).toContain('Verify')
  })
})
