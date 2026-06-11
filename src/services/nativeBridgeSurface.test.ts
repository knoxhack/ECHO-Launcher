import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)))

describe('native bridge surface', () => {
  it('does not expose launcher publisher commands to the renderer', () => {
    const rendererBridgeFiles = [
      join(sourceRoot, 'services', 'nativeBridge.ts'),
      join(sourceRoot, 'types', 'native.ts'),
    ]

    const offenders = rendererBridgeFiles.filter((filePath) => /['"`]publisher:/u.test(readFileSync(filePath, 'utf8')))
    expect(offenders).toEqual([])
  })
})
