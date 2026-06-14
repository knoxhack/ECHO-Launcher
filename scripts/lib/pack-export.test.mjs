import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import {
  createAshfallPackArtifacts,
  createEchoPackExport,
  discoverPackFiles,
  fileAssetName,
  nativeLoaderManifestFromInstance,
  readCurseForgeInstance,
  sha256Buffer,
  shouldIncludeRelativePath,
  validateZipMatchesManifest,
} from './pack-export.mjs'

async function makeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-export-'))
  await fs.mkdir(path.join(root, 'mods'), { recursive: true })
  await fs.mkdir(path.join(root, 'config', 'echo'), { recursive: true })
  await fs.mkdir(path.join(root, 'saves', 'world'), { recursive: true })
  await fs.mkdir(path.join(root, 'logs'), { recursive: true })
  await fs.writeFile(path.join(root, 'mods', 'echocore-1.2.0.jar'), 'core')
  await fs.writeFile(path.join(root, 'mods', 'echoweathercore-1.2.0.jar'), 'weather')
  await fs.writeFile(path.join(root, 'config', 'echo', 'weather.toml'), 'storm=true')
  await fs.writeFile(path.join(root, 'servers.dat'), 'official server list')
  await fs.writeFile(path.join(root, 'saves', 'world', 'level.dat'), 'private save')
  await fs.writeFile(path.join(root, 'logs', 'latest.log'), 'do not ship')
  await fs.writeFile(
    path.join(root, 'minecraftinstance.json'),
    JSON.stringify({
      name: 'Ashfall Protocol',
      allocatedMemory: 6912,
      baseModLoader: {
        name: 'neoforge-26.1.2.43-beta',
        forgeVersion: '26.1.2.43-beta',
        minecraftVersion: '26.1.2',
        versionJson: JSON.stringify({
          id: 'neoforge-26.1.2.43-beta',
          inheritsFrom: '26.1.2',
          mainClass: 'net.neoforged.fml.startup.Client',
          assetIndex: { id: '26.1.2' },
          arguments: {
            game: ['--fml.mcVersion', '26.1.2'],
            jvm: ['-DlibraryDirectory=${library_directory}'],
          },
          libraries: [
            {
              name: 'net.neoforged:neoforge:26.1.2.43-beta',
              downloads: { artifact: { path: 'net/neoforged/neoforge/26.1.2.43-beta/neoforge.jar' } },
            },
          ],
        }),
        installProfileJson: JSON.stringify({
          spec: 1,
          profile: 'NeoForge',
          minecraft: '26.1.2',
          data: {
            MCP_VERSION: { client: "'26.1.2-1'" },
          },
          processors: [
            {
              jar: 'net.neoforged.installertools:installertools:4.0.12:fatjar',
              args: ['--task', 'PROCESS_MINECRAFT_JAR'],
            },
          ],
        }),
      },
    }),
  )
  return root
}

describe('default Ashfall pack export', () => {
  it('excludes user and runtime state while including pack content', async () => {
    expect(shouldIncludeRelativePath('mods/echocore-1.2.0.jar')).toBe(true)
    expect(shouldIncludeRelativePath('config/echo/weather.toml')).toBe(true)
    expect(shouldIncludeRelativePath('servers.dat')).toBe(false)
    expect(shouldIncludeRelativePath('saves/world/level.dat')).toBe(false)
    expect(shouldIncludeRelativePath('logs/latest.log')).toBe(false)

    const source = await makeFixture()
    const files = await discoverPackFiles(source)
    expect(files.map((file) => file.relativePath)).toEqual([
      'config/echo/weather.toml',
      'mods/echocore-1.2.0.jar',
      'mods/echoweathercore-1.2.0.jar',
    ])
  })

  it('parses CurseForge NeoForge launch metadata', async () => {
    const source = await makeFixture()
    const instance = await readCurseForgeInstance(source)
    expect(instance.minecraftVersion).toBe('26.1.2')
    expect(instance.loaderVersion).toBe('26.1.2.43-beta')
    expect(instance.minecraftLauncherVersionId).toBe('neoforge-26.1.2.43-beta')
    expect(instance.allocatedMemoryMb).toBe(6912)
    expect(instance.mainClass).toBe('net.neoforged.fml.startup.Client')
    expect(instance.gameArgs).toContain('--fml.mcVersion')
    expect(instance.jvmArgs).toContain('-DlibraryDirectory=${library_directory}')
    expect(instance.installProfileJson.data.MCP_VERSION.client).toBe("'26.1.2-1'")
  })

  it('generates strict upload-ready release artifacts', async () => {
    const source = await makeFixture()
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-output-'))
    const report = await createAshfallPackArtifacts({
      sourcePath: source,
      outputDir,
      version: '1.2.0-beta.1',
      channel: 'alpha',
    })

    expect(report.counts).toEqual({ totalFiles: 3, modJars: 2, configFiles: 1 })
    expect(report.neededJarsCount).toBe(2)
    expect(report.neededJarsPath).toBe(path.join(outputDir, 'needed-jars'))
    await expect(fs.readFile(path.join(report.neededJarsPath, 'echocore-1.2.0.jar'), 'utf8')).resolves.toBe('core')
    await expect(fs.readFile(path.join(report.neededJarsPath, 'echoweathercore-1.2.0.jar'), 'utf8')).resolves.toBe('weather')
    await expect(fs.stat(path.join(report.neededJarsPath, 'weather.toml'))).rejects.toThrow()
    expect(report.manifest.name).toBe('ashfall-neoforge-edition-alpha-1.2.0-beta.1.pack.json')
    expect(report.artifact.name).toBe('ashfall-neoforge-edition-alpha-1.2.0-beta.1-pack.zip')
    expect(report.manifest.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(report.artifact.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(report.uploadPrep.recommendedTag).toBe('v1.2.0-beta.1')
    expect(report.uploadPrep.releaseTitle).toBe('Ashfall 1.2.0-beta.1')
    expect(report.uploadPrep.manualUploadOrder.slice(0, 3)).toEqual([
      'echo-release.json',
      'ashfall-neoforge-edition-alpha-1.2.0-beta.1.pack.json',
      'ashfall-neoforge-edition-alpha-1.2.0-beta.1-pack.zip',
    ])
    expect(report.uploadPrep.manualUploadOrder).toContain(fileAssetName('mods/echocore-1.2.0.jar', sha256Buffer(Buffer.from('core'))))

    const zip = new AdmZip(report.artifact.path)
    expect(zip.getEntry('mods/echocore-1.2.0.jar')).toBeTruthy()
    expect(zip.getEntry('saves/world/level.dat')).toBeNull()

    const release = JSON.parse(await fs.readFile(report.release.path, 'utf8'))
    expect(release.pack).toBe('ashfall-neoforge-edition')
    expect(release.packs).toMatchObject([{ pack: 'ashfall-neoforge-edition', manifestAsset: report.manifest.name }])
    expect(release.manifestSha256).toBe(report.manifest.sha256)
    expect(release.artifactSha256).toBe(report.artifact.sha256)
    expect(release.assets.find((asset) => asset.name === report.manifest.name)).toMatchObject({
      role: 'pack-manifest',
      sha256: report.manifest.sha256,
      size: report.manifest.size,
    })
    expect(release.assets.find((asset) => asset.name === report.artifact.name)).toMatchObject({
      role: 'pack-artifact',
      sha256: report.artifact.sha256,
      size: report.artifact.size,
    })
    expect(release.assets.filter((asset) => asset.role === 'pack-file')).toHaveLength(3)

    const manifest = JSON.parse(await fs.readFile(report.manifest.path, 'utf8'))
    expect(validateZipMatchesManifest(report.artifact.path, manifest)).toEqual({ checkedFiles: 3 })
    expect(manifest.artifactMode).toBe('zip')
    expect(manifest.artifactName).toBe(report.artifact.name)
    expect(manifest.artifactSha256).toBe(report.artifact.sha256)
    expect(manifest.loader.installProfileJson.data.MCP_VERSION.client).toBe("'26.1.2-1'")
    expect(manifest.files.every((file) => file.sha256 && file.size >= 0)).toBe(true)
    for (const file of manifest.files) {
      expect(file.assetName).toBe(fileAssetName(file.path, file.sha256))
      const entry = zip.getEntry(file.path)
      expect(entry).toBeTruthy()
      const data = entry.getData()
      expect(sha256Buffer(data)).toBe(file.sha256)
      expect(data.length).toBe(file.size)
      expect(await fs.readFile(path.join(outputDir, 'ashfall-neoforge-edition-alpha-1.2.0-beta.1-file-assets', file.assetName), 'utf8')).toBe(data.toString('utf8'))
    }

    const uploadFiles = new Map(report.uploadPrep.files.map((file) => [file.name, file]))
    expect(uploadFiles.get('echo-release.json')).toMatchObject({
      role: 'release-metadata',
      path: report.release.path,
    })
    expect(uploadFiles.get(report.manifest.name)).toMatchObject({
      role: 'pack-manifest',
      sha256: report.manifest.sha256,
      size: report.manifest.size,
    })
    expect(uploadFiles.get(report.artifact.name)).toMatchObject({
      role: 'pack-artifact',
      sha256: report.artifact.sha256,
      size: report.artifact.size,
    })
    expect(uploadFiles.get(fileAssetName('config/echo/weather.toml', sha256Buffer(Buffer.from('storm=true'))))).toMatchObject({
      role: 'pack-file',
      packPath: 'config/echo/weather.toml',
    })
  })

  it('exports one self-contained .echo-pack.zip with embedded ECHO metadata', async () => {
    const source = await makeFixture()
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-output-'))
    const outputPath = path.join(outputDir, 'Ashfall-1.2.0-beta.1.echo-pack.zip')
    const report = await createEchoPackExport({
      sourcePath: source,
      outputPath,
      version: '1.2.0-beta.1',
      channel: 'alpha',
      emitReleaseSidecars: true,
    })

    expect(report.zipPath).toBe(outputPath)
    expect(report.zipName).toBe('Ashfall-1.2.0-beta.1.echo-pack.zip')
    expect(report.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(report.counts).toEqual({ totalFiles: 3, modJars: 2, configFiles: 1 })
    expect(report.neededJarsCount).toBe(2)
    expect(report.neededJarsPath).toBe(path.join(outputDir, 'needed-jars'))
    await expect(fs.readFile(path.join(report.neededJarsPath, 'echocore-1.2.0.jar'), 'utf8')).resolves.toBe('core')
    await expect(fs.readFile(path.join(report.neededJarsPath, 'echoweathercore-1.2.0.jar'), 'utf8')).resolves.toBe('weather')
    expect(report.includedFolders).toEqual(['mods', 'config'])
    expect(report.excludedTopLevel).toEqual(expect.arrayContaining(['logs', 'saves']))

    const zip = new AdmZip(report.zipPath)
    expect(zip.getEntry('mods/echocore-1.2.0.jar')).toBeTruthy()
    expect(zip.getEntry('config/echo/weather.toml')).toBeTruthy()
    expect(zip.getEntry('saves/world/level.dat')).toBeNull()
    expect(zip.getEntry('logs/latest.log')).toBeNull()
    expect(zip.getEntry('.echo/pack-manifest.json')).toBeTruthy()
    expect(zip.getEntry('.echo/export-report.json')).toBeTruthy()
    expect(zip.getEntry('.echo/checksums.sha256')).toBeTruthy()

    const embeddedManifest = JSON.parse(zip.getEntry('.echo/pack-manifest.json').getData().toString('utf8'))
    expect(embeddedManifest.pack).toBe('ashfall-neoforge-edition')
    expect(embeddedManifest.name).toBe('Ashfall NeoForge Edition')
    expect(embeddedManifest.files.map((file) => file.path)).toEqual([
      'config/echo/weather.toml',
      'mods/echocore-1.2.0.jar',
      'mods/echoweathercore-1.2.0.jar',
    ])

    const checksumText = zip.getEntry('.echo/checksums.sha256').getData().toString('utf8')
    for (const file of embeddedManifest.files) {
      expect(checksumText).toContain(`${file.sha256}  ${file.path}`)
      const entry = zip.getEntry(file.path)
      expect(sha256Buffer(entry.getData())).toBe(file.sha256)
      expect(entry.getData().length).toBe(file.size)
    }

    const release = JSON.parse(await fs.readFile(report.releaseMetadataPath, 'utf8'))
    expect(release.name).toBe('Ashfall NeoForge Edition')
    expect(release.packs).toMatchObject([{ pack: 'ashfall-neoforge-edition' }])
    expect(release.artifactAsset).toBe(report.zipName)
    expect(release.artifactSha256).toBe(report.sha256)
    expect(await fs.readFile(report.manifestPath, 'utf8')).toContain('"name": "Ashfall NeoForge Edition"')
  })

  it('allows explicitly selected top-level servers.dat without default discovery', async () => {
    const source = await makeFixture()
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-output-'))
    const report = await createEchoPackExport({
      sourcePath: source,
      outputPath: path.join(outputDir, 'Ashfall-with-servers.echo-pack.zip'),
      version: '1.2.0-servers',
      channel: 'alpha',
      emitReleaseSidecars: true,
      extraIncludePaths: [path.join(source, 'servers.dat')],
    })

    expect(report.warnings).not.toContain('Skipped excluded extra file: servers.dat')
    expect(report.files.map((file) => file.path)).toContain('servers.dat')

    const zip = new AdmZip(report.zipPath)
    expect(zip.getEntry('servers.dat')?.getData().toString('utf8')).toBe('official server list')

    const embeddedManifest = JSON.parse(zip.getEntry('.echo/pack-manifest.json').getData().toString('utf8'))
    expect(embeddedManifest.files.map((file) => file.path)).toContain('servers.dat')

    const checksumText = zip.getEntry('.echo/checksums.sha256').getData().toString('utf8')
    const serversEntry = embeddedManifest.files.find((file) => file.path === 'servers.dat')
    expect(checksumText).toContain(`${serversEntry.sha256}  servers.dat`)

    const sidecarManifest = JSON.parse(await fs.readFile(report.manifestPath, 'utf8'))
    expect(sidecarManifest.files.map((file) => file.path)).toContain('servers.dat')
  })

  it('adds selected safe files and folders while keeping default content', async () => {
    const source = await makeFixture()
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-output-'))
    const outputPath = path.join(outputDir, 'Ashfall-custom.echo-pack.zip')
    await fs.mkdir(path.join(source, 'extras', 'lore'), { recursive: true })
    await fs.writeFile(path.join(source, 'extras', 'single.json'), '{"enabled":true}')
    await fs.writeFile(path.join(source, 'extras', 'lore', 'intro.txt'), 'custom lore')

    const report = await createEchoPackExport({
      sourcePath: source,
      outputPath,
      version: '1.2.0-custom',
      channel: 'alpha',
      emitReleaseSidecars: true,
      extraIncludePaths: [
        path.join(source, 'extras', 'single.json'),
        path.join(source, 'extras', 'lore'),
        path.join(source, 'extras', 'single.json'),
      ],
      changelog: ['Custom export changelog'],
      releaseNotes: ['Custom release metadata note'],
    })

    expect(report.counts).toEqual({ totalFiles: 5, modJars: 2, configFiles: 1 })
    expect(report.includedFolders).toEqual(['mods', 'config', 'extras'])
    expect(report.files.map((file) => file.path)).toEqual([
      'config/echo/weather.toml',
      'extras/lore/intro.txt',
      'extras/single.json',
      'mods/echocore-1.2.0.jar',
      'mods/echoweathercore-1.2.0.jar',
    ])

    const zip = new AdmZip(report.zipPath)
    expect(zip.getEntry('mods/echocore-1.2.0.jar')).toBeTruthy()
    expect(zip.getEntry('extras/single.json')).toBeTruthy()
    expect(zip.getEntry('extras/lore/intro.txt')).toBeTruthy()
    expect(zip.getEntries().filter((entry) => entry.entryName === 'extras/single.json')).toHaveLength(1)

    const embeddedManifest = JSON.parse(zip.getEntry('.echo/pack-manifest.json').getData().toString('utf8'))
    expect(embeddedManifest.changelog).toEqual(['Custom export changelog'])
    expect(embeddedManifest.files.map((file) => file.path)).toContain('extras/single.json')

    const sidecarManifest = JSON.parse(await fs.readFile(report.manifestPath, 'utf8'))
    expect(sidecarManifest.changelog).toEqual(['Custom export changelog'])
    const release = JSON.parse(await fs.readFile(report.releaseMetadataPath, 'utf8'))
    expect(release.notes).toEqual(['Custom release metadata note'])
  })

  it('rejects selected extra paths outside the source instance', async () => {
    const source = await makeFixture()
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-output-'))
    const outside = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-outside-')), 'outside.txt')
    await fs.writeFile(outside, 'outside')

    await expect(createEchoPackExport({
      sourcePath: source,
      outputPath: path.join(outputDir, 'Ashfall-outside.echo-pack.zip'),
      extraIncludePaths: [outside],
    })).rejects.toThrow(/inside the Ashfall instance/u)
  })

  it('skips explicitly selected private or runtime folders', async () => {
    const source = await makeFixture()
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-output-'))
    const report = await createEchoPackExport({
      sourcePath: source,
      outputPath: path.join(outputDir, 'Ashfall-safe.echo-pack.zip'),
      version: '1.2.0-safe',
      channel: 'alpha',
      emitReleaseSidecars: true,
      extraIncludePaths: [
        path.join(source, 'saves'),
        path.join(source, 'logs', 'latest.log'),
        path.join(source, 'minecraftinstance.json'),
      ],
    })

    expect(report.counts.totalFiles).toBe(3)
    expect(report.warnings).toEqual(expect.arrayContaining([
      'Skipped excluded extra folder: saves',
      'Skipped excluded extra file: logs/latest.log',
      'Skipped excluded extra file: minecraftinstance.json',
    ]))
    const zip = new AdmZip(report.zipPath)
    expect(zip.getEntry('saves/world/level.dat')).toBeNull()
    expect(zip.getEntry('logs/latest.log')).toBeNull()
    expect(zip.getEntry('minecraftinstance.json')).toBeNull()
  })

  it('emits native-loader version JSON with a pinned download artifact', () => {
    const manifest = nativeLoaderManifestFromInstance({
      minecraftVersion: '26.1.2',
      mainClass: 'com.echo.NativeLoaderClient',
      gameArgs: [],
      jvmArgs: [],
    })

    expect(manifest.version).toBe('1.0.3')
    expect(manifest.minecraftLauncherVersionId).toBe('echo-native-loader-1.0.3')
    expect(manifest.versionJson).toMatchObject({
      id: 'echo-native-loader-1.0.3',
      inheritsFrom: '26.1.2',
      mainClass: 'com.echo.NativeLoaderClient',
    })
    expect(manifest.versionJson.libraries).toHaveLength(1)
    expect(manifest.versionJson.libraries[0]).toMatchObject({
      name: 'com.echo:native-loader:1.0.3',
      downloads: {
        artifact: {
          path: 'com/echo/native-loader/1.0.3/native-loader-1.0.3.jar',
          url: expect.stringContaining('echo-native-loader-1.0.3.jar'),
          sha1: expect.stringMatching(/^[a-f0-9]{40}$/u),
          size: expect.any(Number),
        },
      },
    })
  })

  it('rejects malformed CurseForge metadata before generating artifacts', async () => {
    const source = await makeFixture()
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-output-'))
    await fs.writeFile(path.join(source, 'minecraftinstance.json'), JSON.stringify({ name: 'Broken Ashfall' }))

    await expect(createAshfallPackArtifacts({ sourcePath: source, outputDir })).rejects.toThrow(/minecraftinstance\.json parsed incomplete/u)
  })

  it('rejects empty pack exports', async () => {
    const source = await makeFixture()
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-pack-output-'))
    await fs.rm(path.join(source, 'mods'), { recursive: true, force: true })
    await fs.rm(path.join(source, 'config'), { recursive: true, force: true })

    await expect(createAshfallPackArtifacts({ sourcePath: source, outputDir })).rejects.toThrow(/did not discover any pack files/u)
  })
})
