import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  buildReleaseAssetLookup,
  findReleaseAssetForManifestFile,
  moduleArtifactName,
  moduleReleaseAssetsFromChecksumText,
  moduleReleaseAssetsFromMetadata,
  releaseAssetUrl,
  resolveManifestReleaseAssets,
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

  it('uses public GitHub browser download URLs for module artifacts', () => {
    const resolved = resolveModuleRequirements(
      {
        pack: 'openlands-native-edition',
        moduleRequirements: [
          {
            id: 'echocommonloot',
            version: '0.1.0',
          },
        ],
        modules: [],
        files: [],
      },
      [
        {
          name: 'echocommonloot-0.1.0.echo-addon',
          url: 'https://api.github.com/repos/knoxhack/ECHO-Modules/releases/assets/445555480',
          browser_download_url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-arcana-division-1.0.0-beta/echocommonloot-0.1.0.echo-addon',
          sha256: sha('f'),
          size: 6350,
        },
      ],
    )

    expect(resolved.files[0]).toMatchObject({
      path: 'addons/echocommonloot-0.1.0.echo-addon',
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-arcana-division-1.0.0-beta/echocommonloot-0.1.0.echo-addon',
      sha256: sha('f'),
    })
  })

  it('lets the canonical module asset override stale requirement metadata', () => {
    const resolved = resolveModuleRequirements(
      {
        pack: 'galactic-survey-native-edition',
        moduleRequirements: [
          {
            id: 'echoinputcore',
            version: '1.0.0',
            assetName: 'echoinputcore-1.0.0.echo-addon',
            sha256: sha('0'),
            size: 100,
          },
        ],
        modules: [],
        files: [],
      },
      [
        {
          name: 'echoinputcore-1.0.0.echo-addon',
          browser_download_url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-all-official-modpacks-runtime-fix-20260614/echoinputcore-1.0.0.echo-addon',
          sha256: sha('1'),
          size: 22678,
          buildMode: 'compiled-runtime',
        },
        {
          name: 'echoinputcore-1.0.0.echo-addon',
          browser_download_url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-source-packaged-0.1.0/echoinputcore-1.0.0.echo-addon',
          sha256: sha('0'),
          size: 100,
          buildMode: 'source-packaged',
        },
      ],
    )

    expect(resolved.files[0]).toMatchObject({
      path: 'addons/echoinputcore-1.0.0.echo-addon',
      assetName: 'echoinputcore-1.0.0.echo-addon',
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-all-official-modpacks-runtime-fix-20260614/echoinputcore-1.0.0.echo-addon',
      sha256: sha('1'),
      size: 22678,
    })
    expect(resolved.moduleRequirements[0]).toMatchObject({
      id: 'echoinputcore',
      sha256: sha('1'),
      size: 22678,
    })
  })

  it('builds public fallback URLs for unindexed hash-pinned module artifacts', () => {
    const resolved = resolveModuleRequirements(
      {
        pack: 'openlands-native-edition',
        moduleRequirements: [
          {
            id: 'echocommonloot',
            version: '0.1.0',
            assetName: 'echocommonloot-0.1.0.echo-addon',
            path: 'addons/echocommonloot-0.1.0.echo-addon',
            sha256: sha('f'),
            size: 6350,
          },
        ],
        modules: [],
        files: [],
      },
      [],
    )

    expect(resolved.files[0]).toMatchObject({
      path: 'addons/echocommonloot-0.1.0.echo-addon',
      assetName: 'echocommonloot-0.1.0.echo-addon',
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-arcana-division-1.0.0-beta/echocommonloot-0.1.0.echo-addon',
      sha256: sha('f'),
      size: 6350,
    })
    expect(resolved.files[0].urls).toContain(
      'https://github.com/knoxhack/ECHO-Modules/releases/download/galactic-survey-0.1.0-alpha/echocommonloot-0.1.0.echo-addon',
    )
  })

  it('normalizes existing manifest file API URLs to public browser download URLs', () => {
    const resolved = resolveManifestReleaseAssets(
      {
        artifactMode: 'zip',
        artifactName: 'openlands-native-edition-0.1.0.zip',
        artifactUrl: 'https://example.test/old.zip',
        loader: {
          installer: {
            assetName: 'echo-native-loader-1.0.1.jar',
            url: 'https://api.github.com/repos/knoxhack/ECHO-Native-Platform/releases/assets/111',
          },
        },
        files: [
          {
            path: 'addons/echocommonloot-0.1.0.echo-addon',
            assetName: 'echocommonloot-0.1.0.echo-addon',
            url: 'https://api.github.com/repos/knoxhack/ECHO-Modules/releases/assets/445555480',
            sha256: sha('f'),
            size: 0,
          },
        ],
      },
      [
        {
          name: 'openlands-native-edition-0.1.0.zip',
          browser_download_url: 'https://github.com/knoxhack/ECHO-Openlands-Native-Edition/releases/download/v0.1.0/openlands-native-edition-0.1.0.zip',
          size: 10,
        },
        {
          name: 'echo-native-loader-1.0.1.jar',
          browser_download_url: 'https://github.com/knoxhack/ECHO-Native-Platform/releases/download/v1.0.1/echo-native-loader-1.0.1.jar',
          size: 20,
        },
        {
          name: 'echocommonloot-0.1.0.echo-addon',
          url: 'https://api.github.com/repos/knoxhack/ECHO-Modules/releases/assets/445555480',
          browser_download_url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-arcana-division-1.0.0-beta/echocommonloot-0.1.0.echo-addon',
          sha256: sha('f'),
          size: 6350,
        },
      ],
    )

    expect(resolved.artifactUrl).toBe(
      'https://github.com/knoxhack/ECHO-Openlands-Native-Edition/releases/download/v0.1.0/openlands-native-edition-0.1.0.zip',
    )
    expect(resolved.loader.installer.url).toBe(
      'https://github.com/knoxhack/ECHO-Native-Platform/releases/download/v1.0.1/echo-native-loader-1.0.1.jar',
    )
    expect(resolved.files[0]).toMatchObject({
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-arcana-division-1.0.0-beta/echocommonloot-0.1.0.echo-addon',
      size: 6350,
    })
  })

  it('preserves standalone string loaders while resolving release assets', () => {
    const resolved = resolveManifestReleaseAssets(
      {
        pack: 'ashfall-standalone-edition',
        artifactMode: 'zip',
        artifactName: 'ashfall-standalone-edition-0.1.0.zip',
        loader: 'echo-standalone-runtime',
        files: [
          {
            path: 'mods/echocore-1.0.0-standalone.jar',
            assetName: 'echocore-1.0.0-standalone.jar',
            sha256: sha('a'),
            size: 0,
          },
        ],
      },
      [
        {
          name: 'ashfall-standalone-edition-0.1.0.zip',
          browser_download_url: 'https://github.com/knoxhack/ECHO-Ashfall-Standalone-Edition/releases/download/v0.1.0/ashfall-standalone-edition-0.1.0.zip',
          size: 100,
        },
        {
          name: 'echocore-1.0.0-standalone.jar',
          browser_download_url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-v1.0.0/echocore-1.0.0-standalone.jar',
          sha256: sha('a'),
          size: 10,
        },
      ],
    )

    expect(resolved.loader).toBe('echo-standalone-runtime')
    expect(resolved.files[0]).toMatchObject({
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-v1.0.0/echocore-1.0.0-standalone.jar',
      size: 10,
    })
  })

  it('normalizes module requirement metadata without fetching when files already cover requirements', () => {
    const resolved = resolveModuleRequirements(
      {
        pack: 'ashfall-native-edition',
        moduleRequirements: [
          {
            id: 'echocore',
            version: '1.0.0',
            artifactFamily: 'echo-addon',
            assetName: 'echocore-1.0.0.echo-addon',
            path: 'addons/echocore-1.0.0.echo-addon',
            sha256: sha('a'),
            size: 100,
          },
        ],
        modules: [],
        files: [
          {
            path: 'addons/echocore-1.0.0.echo-addon',
            assetName: 'echocore-1.0.0.echo-addon',
            sha256: sha('a'),
            size: 100,
            required: true,
            moduleId: 'echocore',
            side: 'both',
          },
        ],
      },
      [],
    )

    expect(resolved.files).toHaveLength(1)
    expect(resolved.modules).toEqual(['echocore'])
    expect(resolved.moduleRequirements[0]).toMatchObject({
      id: 'echocore',
      version: '1.0.0',
      artifactFamily: 'echo-addon',
      assetName: 'echocore-1.0.0.echo-addon',
      path: 'addons/echocore-1.0.0.echo-addon',
      sha256: sha('a'),
      size: 100,
    })
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

  it('builds module assets from public module release metadata', () => {
    const assets = moduleReleaseAssetsFromMetadata(
      {
        modules: [
          {
            moduleId: 'echoworldcore',
            artifacts: [
              {
                kind: 'neoforge',
                filename: 'echoworldcore-1.0.0-neoforge.jar',
                sha256: sha('4'),
                size: 80031,
              },
            ],
          },
        ],
      },
      'modules-source-packaged-0.1.0',
    )

    expect(assets[0]).toMatchObject({
      name: 'echoworldcore-1.0.0-neoforge.jar',
      url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-source-packaged-0.1.0/echoworldcore-1.0.0-neoforge.jar',
      sha256: sha('4'),
      moduleId: 'echoworldcore',
      family: 'neoforge',
    })
  })

  it('builds module assets from public checksums without GitHub API metadata', () => {
    const assets = moduleReleaseAssetsFromChecksumText(
      `${sha('5')}  echoworldcore/echoworldcore-1.0.0.echo-addon\n${sha('6')}  notes.txt\n`,
      'modules-source-packaged-0.1.0',
    )

    expect(assets).toEqual([
      {
        name: 'echoworldcore-1.0.0.echo-addon',
        url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-source-packaged-0.1.0/echoworldcore-1.0.0.echo-addon',
        browser_download_url: 'https://github.com/knoxhack/ECHO-Modules/releases/download/modules-source-packaged-0.1.0/echoworldcore-1.0.0.echo-addon',
        sha256: sha('5'),
        size: 0,
        moduleId: 'echoworldcore',
        family: 'echo-addon',
        releaseTag: 'modules-source-packaged-0.1.0',
      },
    ])
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
