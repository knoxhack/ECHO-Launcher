import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const auditedRoots = ['app', 'components', 'data'].map((folder) => join(sourceRoot, folder))
const textExtensions = new Set(['.ts', '.tsx'])
const bannedCopy = [
  /GitHub release feed/i,
  /release feed/i,
  /GitHub latest/i,
  /Latest GitHub/i,
  /trusted GitHub release/i,
  /strict GitHub release/i,
]

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = join(root, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) return sourceFiles(fullPath)
    return textExtensions.has(extname(fullPath)) ? [fullPath] : []
  })
}

describe('player-facing copy audit', () => {
  it('does not mention legacy GitHub release feed wording', () => {
    const offenders = auditedRoots
      .flatMap(sourceFiles)
      .flatMap((filePath) => {
        const text = readFileSync(filePath, 'utf8')
        return bannedCopy
          .filter((pattern) => pattern.test(text))
          .map((pattern) => `${filePath}: ${pattern.source}`)
      })

    expect(offenders).toEqual([])
  })

  it('keeps Home focused on a selected pack and one primary action', () => {
    const homeSource = readFileSync(join(sourceRoot, 'components', 'dashboard', 'HomePage.tsx'), 'utf8')

    expect(homeSource).toContain('Can I play?')
    expect(homeSource).toContain('Select modpack')
    expect(homeSource).toContain('Primary action')
    expect(homeSource.match(/Primary action/g) ?? []).toHaveLength(1)
    expect(homeSource).not.toContain('How should Ashfall launch?')
    expect(homeSource).not.toContain('RuntimeChoiceCard')
    expect(homeSource).not.toMatch(/choose\s+(a\s+)?runtime/i)
  })
})
