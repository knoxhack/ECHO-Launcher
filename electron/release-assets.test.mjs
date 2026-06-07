import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  buildReleaseAssetLookup,
  findReleaseAssetForManifestFile,
  releaseAssetUrl,
  validateZipManifestReleaseAssets,
} = require('./release-assets.cjs')

const sha = (char) => char.repeat(64)

describe('release asset resolution', () => {
  it('accepts a strict full-zip release when some per-file update assets are missing', () => {
    const manifest = {
      artifactMode: 'zip',
      artifactName: 'Ashfall-1.0.0.echo-pack.zip',
      artifactSha256: sha('a'),
      files: [
        {
          path: 'mods/echocore-1.0.0.jar',
          assetName: `file-${sha('b').slice(0, 12)}-mods-echocore-1.0.0.jar`,
          sha256: sha('b'),
          size: 10,
        },
        {
          path: 'config/echo/weather.toml',
          assetName: `file-${sha('c').slice(0, 12)}-config-echo-weather.toml`,
          sha256: sha('c'),
          size: 20,
        },
      ],
    }
    const assets = [
      {
        name: 'Ashfall-1.0.0.echo-pack.zip',
        sha256: sha('a'),
        url: 'https://example.test/Ashfall-1.0.0.echo-pack.zip',
      },
      {
        name: 'echocore-1.0.0.jar',
        digest: `sha256:${sha('b')}`,
        browser_download_url: 'https://example.test/echocore-1.0.0.jar',
      },
    ]

    const validation = validateZipManifestReleaseAssets(manifest, assets)

    expect(validation.reasons).toEqual([])
    expect(validation.missingFileAssets).toEqual([
      {
        path: 'config/echo/weather.toml',
        assetName: `file-${sha('c').slice(0, 12)}-config-echo-weather.toml`,
      },
    ])
    expect(validation.warnings[0]).toContain('Fresh installs can still use the verified full pack archive')
  })

  it('resolves update assets by exact assetName before basename plus SHA-256', () => {
    const exact = {
      name: `file-${sha('d').slice(0, 12)}-mods-echoindex-1.0.0.jar`,
      url: 'https://example.test/exact.jar',
      sha256: sha('d'),
    }
    const basenameMatch = {
      name: 'echoindex-1.0.0.jar',
      browser_download_url: 'https://example.test/basename.jar',
      digest: `sha256:${sha('d')}`,
    }
    const lookup = buildReleaseAssetLookup([basenameMatch, exact])

    expect(
      releaseAssetUrl(
        findReleaseAssetForManifestFile(
          {
            path: 'mods/echoindex-1.0.0.jar',
            assetName: exact.name,
            sha256: sha('d'),
          },
          lookup,
        ),
      ),
    ).toBe('https://example.test/exact.jar')

    expect(
      releaseAssetUrl(
        findReleaseAssetForManifestFile(
          {
            path: 'mods/echoindex-1.0.0.jar',
            assetName: 'file-missing-mods-echoindex-1.0.0.jar',
            sha256: sha('d'),
          },
          lookup,
        ),
      ),
    ).toBe('https://example.test/basename.jar')
  })

  it('keeps the full archive asset strict', () => {
    const validation = validateZipManifestReleaseAssets(
      {
        artifactMode: 'zip',
        artifactName: 'Ashfall-1.0.0.echo-pack.zip',
        artifactSha256: sha('a'),
        files: [],
      },
      [
        {
          name: 'Ashfall-1.0.0.echo-pack.zip',
          sha256: sha('b'),
          url: 'https://example.test/Ashfall-1.0.0.echo-pack.zip',
        },
      ],
    )

    expect(validation.reasons).toEqual([
      `Pack artifact SHA-256 mismatch for 'Ashfall-1.0.0.echo-pack.zip': manifest has ${sha('a')}, metadata has ${sha('b')}.`,
    ])
  })
})
