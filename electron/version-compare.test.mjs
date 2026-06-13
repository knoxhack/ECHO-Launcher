import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { isNewerPackVersion, versionParts } = require('./version-compare.cjs')

describe('version-compare', () => {
  describe('versionParts', () => {
    it('parses simple semver strings', () => {
      expect(versionParts('1.2.3')).toEqual([1, 2, 3])
    })

    it('parses partial versions', () => {
      expect(versionParts('0.1')).toEqual([0, 1, 0])
      expect(versionParts('2')).toEqual([2, 0, 0])
    })

    it('strips a leading v', () => {
      expect(versionParts('v0.1.0')).toEqual([0, 1, 0])
    })

    it('returns null for non-numeric strings', () => {
      expect(versionParts('Catalog latest')).toBe(null)
      expect(versionParts('')).toBe(null)
      expect(versionParts(null)).toBe(null)
    })
  })

  describe('isNewerPackVersion', () => {
    it('returns true when candidate is newer', () => {
      expect(isNewerPackVersion('0.2.0', '0.1.0')).toBe(true)
      expect(isNewerPackVersion('0.1.1', '0.1.0')).toBe(true)
    })

    it('returns false when candidate is older or equal', () => {
      expect(isNewerPackVersion('0.1.0', '0.2.0')).toBe(false)
      expect(isNewerPackVersion('0.1.0', '0.1.0')).toBe(false)
    })

    it('returns false when either version is non-numeric', () => {
      expect(isNewerPackVersion('0.1.0', 'Catalog latest')).toBe(false)
      expect(isNewerPackVersion('Catalog latest', '0.1.0')).toBe(false)
    })
  })
})
