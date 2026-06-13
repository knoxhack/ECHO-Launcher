import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  buildReleaseAssetLookup,
  findReleaseAssetForManifestFile,
  moduleArtifactName,
  releaseAssetUrl,
  resolveModuleRequirements,
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

  it('derives module artifact names by pack family', () => {
    expect(moduleArtifactName('echocore', '1.2.3', 'neoforge')).toBe('echocore-1.2.3-neoforge.jar')
    expect(moduleArtifactName('echocore', '1.2.3', 'standalone')).toBe('echocore-1.2.3-standalone.jar')
    expect(moduleArtifactName('echocore', '1.2.3', 'echo-addon')).toBe('echocore-1.2.3.echo-addon')
  })

  it('expands module requirements into individually downloadable manifest files', () => {
    const manifest = {
      pack: 'ashfall-neoforge-edition',
      moduleRequirements: [
        {
          id: 'echocore',
          version: '1.2.3',
        },
      ],
      modules: [],
      files: [],
    }
    const resolved = resolveModuleRequirements(manifest, [
      {
        name: 'echocore-1.2.3-neoforge.jar',
        browser_download_url: 'https://example.test/echocore-1.2.3-neoforge.jar',
        sha256: sha('e'),
        size: 1234,
      },
    ])

    expect(resolved.modules).toEqual(['echocore'])
    expect(resolved.files).toEqual([
      {
        path: 'mods/echocore-1.2.3-neoforge.jar',
        assetName: 'echocore-1.2.3-neoforge.jar',
        url: 'https://example.test/echocore-1.2.3-neoforge.jar',
        sha256: sha('e'),
        size: 1234,
        required: true,
        moduleId: 'echocore',
        side: 'both',
      },
    ])
  })

  it('adds missing module requirement files without duplicating existing zip files', () => {
    const resolved = resolveModuleRequirements(
      {
        pack: 'openlands-neoforge-edition',
        moduleRequirements: [
          { id: 'echoopenlandsprotocol', version: '0.1.0' },
          { id: 'echocore', version: '1.0.0' },
        ],
        modules: ['echoopenlandsprotocol'],
        files: [
          {
            path: 'mods/echoopenlandsprotocol-0.1.0-neoforge.jar',
            assetName: 'echoopenlandsprotocol-0.1.0-neoforge.jar',
            sha256: sha('1'),
            size: 10,
            required: true,
            moduleId: 'echoopenlandsprotocol',
            side: 'both',
          },
        ],
      },
      [
        {
          name: 'echocore-1.0.0-neoforge.jar',
          browser_download_url: 'https://example.test/echocore-1.0.0-neoforge.jar',
          sha256: sha('2'),
          size: 20,
        },
      ],
    )

    expect(resolved.files).toHaveLength(2)
    expect(resolved.files[1]).toMatchObject({
      path: 'mods/echocore-1.0.0-neoforge.jar',
      assetName: 'echocore-1.0.0-neoforge.jar',
      url: 'https://example.test/echocore-1.0.0-neoforge.jar',
      sha256: sha('2'),
    })
  })

  it('resolves ranged module requirements to matching published artifacts', () => {
    const resolved = resolveModuleRequirements(
      {
        pack: 'openlands-native-edition',
        moduleRequirements: [
          { id: 'echocore', version: '>=1.0.0' },
        ],
        modules: [],
        files: [],
      },
      [
        {
          name: 'echocore-1.0.0.echo-addon',
          browser_download_url: 'https://example.test/echocore-1.0.0.echo-addon',
          sha256: sha('3'),
          size: 30,
        },
      ],
    )

    expect(resolved.files[0]).toMatchObject({
      path: 'addons/echocore-1.0.0.echo-addon',
      assetName: 'echocore-1.0.0.echo-addon',
      url: 'https://example.test/echocore-1.0.0.echo-addon',
      sha256: sha('3'),
    })
    expect(resolved.moduleRequirements[0]).toMatchObject({
      id: 'echocore',
      version: '>=1.0.0',
      artifactFamily: 'echo-addon',
      path: 'addons/echocore-1.0.0.echo-addon',
      assetName: 'echocore-1.0.0.echo-addon',
      sha256: sha('3'),
    })
  })

  it('lets module requirements override asset names and install paths', () => {
    const resolved = resolveModuleRequirements(
      {
        pack: 'ashfall-standalone-edition',
        moduleRequirements: [
          {
            moduleId: 'echoai',
            version: '2.0.0',
            assetName: 'echoai-runtime.jar',
            path: 'runtime/modules/echoai.jar',
            required: false,
            side: 'client',
          },
        ],
        modules: [],
        files: [],
      },
      [
        {
          name: 'echoai-runtime.jar',
          url: 'https://example.test/echoai-runtime.jar',
          digest: `sha256:${sha('f')}`,
          size: 222,
        },
      ],
    )

    expect(resolved.files[0]).toMatchObject({
      path: 'runtime/modules/echoai.jar',
      assetName: 'echoai-runtime.jar',
      url: 'https://example.test/echoai-runtime.jar',
      sha256: sha('f'),
      required: false,
      moduleId: 'echoai',
      side: 'client',
    })
  })
})
