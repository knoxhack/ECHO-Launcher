import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import AdmZip from 'adm-zip'

const require = createRequire(import.meta.url)
const {
  ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS,
  materializeNativeLoaderAddons,
  nativeBootstrapGameArguments,
  nativeBootstrapJvmArguments,
  nativeLauncherArgumentStatus,
} = require('./native-loader-handoff.cjs')

const tempRoots = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('native-loader handoff helpers', () => {
  it('materializes .echo-addon runtime jars and builds bootstrap args', async () => {
    const root = await tempRoot()
    const addonPath = path.join(root, 'addons', 'echoadaptercore-1.0.0.echo-addon')
    const bytes = await writeAddon(addonPath, {
      id: 'echoadaptercore',
      nativeEntrypoint: 'com.echo.AdapterCoreNativeModule',
      bootstrapProfile: 'com.echo.AdapterBootstrapProfile',
      jarName: 'echoadaptercore-1.0.0-runtime.jar',
    })
    const secondAddonPath = path.join(root, 'addons', 'echoworldcore-1.0.0.echo-addon')
    const secondBytes = await writeAddon(secondAddonPath, {
      id: 'echoworldcore',
      nativeEntrypoint: 'com.echo.WorldCoreNativeModule',
      jarName: 'echoworldcore-1.0.0-runtime.jar',
    })
    const manifest = manifestFor('ashfall-native-edition', [
      {
        path: 'addons/echoadaptercore-1.0.0.echo-addon',
        moduleId: 'echoadaptercore',
        sha256: sha256(bytes),
        size: bytes.length,
      },
      {
        path: 'addons/echoworldcore-1.0.0.echo-addon',
        moduleId: 'echoworldcore',
        sha256: sha256(secondBytes),
        size: secondBytes.length,
      },
    ])

    const runtime = await materializeNativeLoaderAddons(manifest, root, { writeReport: true })
    expect(runtime.modules).toEqual(['echoadaptercore', 'echoworldcore'])
    expect(runtime.nativeEntrypoints).toEqual({
      echoadaptercore: 'com.echo.AdapterCoreNativeModule',
      echoworldcore: 'com.echo.WorldCoreNativeModule',
    })
    expect(runtime.bootstrapProfileClass).toBe('com.echo.AdapterBootstrapProfile')
    expect(runtime.classpathEntries).toHaveLength(4)
    const adapterAddonJar = runtime.classpathEntries.find((entry) => entry.endsWith('echoadaptercore-1.0.0.echo-addon.jar'))
    const worldAddonJar = runtime.classpathEntries.find((entry) => entry.endsWith('echoworldcore-1.0.0.echo-addon.jar'))
    const adapterRuntimeJar = runtime.classpathEntries.find((entry) => entry.endsWith('echoadaptercore-1.0.0-runtime.jar'))
    const worldRuntimeJar = runtime.classpathEntries.find((entry) => entry.endsWith('echoworldcore-1.0.0-runtime.jar'))
    expect(adapterAddonJar).toBeTruthy()
    expect(worldAddonJar).toBeTruthy()
    expect(adapterRuntimeJar).toBeTruthy()
    expect(worldRuntimeJar).toBeTruthy()
    expect(await readFile(adapterRuntimeJar, 'utf8')).toBe('runtime jar bytes')
    expect(runtime.reportPath).toContain(path.join('.echo', 'native-loader', 'materialized-addons.json'))

    const jvm = nativeBootstrapJvmArguments(manifest, runtime)
    const game = nativeBootstrapGameArguments(manifest, runtime)
    expect(jvm).toContain(`-Decho.native.minecraftMainClass=${ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS}`)
    expect(jvm).toContain('-Decho.native.bootstrap.authorizedHandoff=startNativeClient')
    expect(jvm.some((arg) => arg.startsWith('-Decho.native.moduleClasspath='))).toBe(true)
    expect(game).toEqual(expect.arrayContaining([
      '--echo-marker',
      runtime.markerPath,
      '--echo-pack-id',
      'ashfall-native-edition',
      '--echo-real-main',
      'net.minecraft.client.main.Main',
      '--echo-handoff',
      '--echo-module',
      'echoadaptercore',
      'echoworldcore',
      '--echo-native-entrypoint',
      'echoadaptercore=com.echo.AdapterCoreNativeModule',
      'echoworldcore=com.echo.WorldCoreNativeModule',
    ]))
    expect(game.filter((arg) => arg === '--echo-module')).toHaveLength(2)
    expect(game.filter((arg) => arg === '--echo-native-entrypoint')).toHaveLength(2)

    const status = nativeLauncherArgumentStatus({ arguments: { jvm, game } }, manifest)
    expect(status).toEqual({ ok: true, errors: [] })
  })

  it('rejects addons without native entrypoints', async () => {
    const root = await tempRoot()
    const addonPath = path.join(root, 'addons', 'broken.echo-addon')
    const bytes = await writeAddon(addonPath, {
      id: 'broken',
      nativeEntrypoint: '',
      jarName: 'broken-runtime.jar',
    })
    await expect(materializeNativeLoaderAddons(manifestFor('broken-native-edition', [{
      path: 'addons/broken.echo-addon',
      moduleId: 'broken',
      sha256: sha256(bytes),
      size: bytes.length,
    }]), root)).rejects.toThrow('access.nativeEntrypoint')
  })

  it('marks old vanilla-only native metadata as stale', () => {
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: 'a'.repeat(64),
      size: 10,
    }])
    const status = nativeLauncherArgumentStatus({
      arguments: {
        game: [],
        jvm: [
          '-Decho.native.packId=ashfall-native-edition',
          '-Decho.native.packVersion=0.1.0',
          '-Decho.native.addonsClasspath=true',
        ],
      },
    }, manifest)
    expect(status.ok).toBe(false)
    expect(status.errors.join('\n')).toContain('EchoNativeBootstrapMain')
  })
})

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'echo-native-handoff-'))
  tempRoots.push(root)
  return root
}

async function writeAddon(filePath, options) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const zip = new AdmZip()
  zip.addFile('META-INF/echo.mod.json', Buffer.from(JSON.stringify({
    schema: 'echo.mod.v1',
    id: options.id,
    kind: 'pack_root',
    role: 'official_pack',
    access: {
      nativeEntrypoint: options.nativeEntrypoint,
      ...(options.bootstrapProfile ? { nativeBootstrapProfile: options.bootstrapProfile } : {}),
    },
  }, null, 2), 'utf8'))
  zip.addFile(`lib/${options.jarName}`, Buffer.from('runtime jar bytes', 'utf8'))
  await writeFile(filePath, zip.toBuffer())
  return readFile(filePath)
}

function manifestFor(pack, files) {
  return {
    pack,
    name: pack,
    version: '0.1.0',
    modules: files.map((file) => file.moduleId),
    files,
  }
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}
