import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModpacksPage } from './ModpacksPage'

describe('ModpacksPage Sky Relay cards', () => {
  it('renders Sky Relay cards with state-driven actions instead of fake installs', () => {
    const markup = renderToStaticMarkup(<ModpacksPage />)
    const skyRelayPackNames = [
      'Sky Relay Native Edition',
      'Sky Relay NeoForge Edition',
      'Sky Relay Standalone Edition',
    ]

    expect(markup).toContain('Official ECHO Packs')
    expect(markup).toContain('15')
    expect(markup).toContain('Pack Family')
    skyRelayPackNames.forEach((name, index) => {
      const cardStart = markup.indexOf(name)
      const nextCardStart = skyRelayPackNames[index + 1] ? markup.indexOf(skyRelayPackNames[index + 1]) : -1
      const diagnosticsStart = markup.indexOf('Diagnostics', cardStart)
      const homeStart = markup.indexOf('Home', cardStart)
      const manifestStart = markup.indexOf('Manifest', cardStart)
      const catalogStart = markup.indexOf('Catalog', cardStart)
      const installStart = markup.indexOf('Install', cardStart)
      const actionStart = markup.indexOf('Action', cardStart)

      expect(cardStart).toBeGreaterThan(-1)
      expect(diagnosticsStart).toBeGreaterThan(cardStart)
      expect(homeStart).toBeGreaterThan(cardStart)
      expect(manifestStart).toBeGreaterThan(cardStart)
      expect(catalogStart).toBeGreaterThan(cardStart)
      expect(installStart).toBeGreaterThan(cardStart)
      expect(actionStart).toBeGreaterThan(cardStart)
      if (nextCardStart > -1) {
        expect(diagnosticsStart).toBeLessThan(nextCardStart)
        expect(homeStart).toBeLessThan(nextCardStart)
        expect(actionStart).toBeLessThan(nextCardStart)
      }
    })
    expect(markup).not.toContain('Install Sky Relay')
    expect(markup).not.toContain('Play Sky Relay')
    expect(markup).not.toMatch(/install\s*\/\s*update|install all|update all/i)
    expect(markup).toContain('Checking...')
  })
})
