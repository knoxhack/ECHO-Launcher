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
  nativeHandoffPayloadErrors,
  nativeBootstrapGameArguments,
  nativeBootstrapJvmArguments,
  nativeDevDirectAuditJvmArguments,
  nativeDevDirectProductWorldJvmArguments,
  nativeDevDirectQuickPlayJvmArguments,
  ECHO_NATIVE_DEV_DIRECT_AUTO_CONFIRM_EXPERIMENTAL_WORLD_JVM_ARGUMENT,
  ECHO_NATIVE_DEV_DIRECT_QUICKPLAY_SINGLEPLAYER_PROPERTY,
  ECHO_NATIVE_PRODUCT_WORLD_AUTO_OPEN_JVM_ARGUMENT,
  ECHO_NATIVE_PRODUCT_WORLD_FOLDER,
  ECHO_NATIVE_PLAYABLE_RUNTIME_ACTIONS_JVM_ARGUMENT,
  ECHO_NATIVE_LIVE_INTERACTION_PROBE_ACTIONS_JVM_ARGUMENT,
  nativeLauncherArgumentStatus,
  nativeModuleClasspathEntries,
  validateNativeLoaderLocalRuntime,
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
    expect(runtime.handoffPath).toContain(path.join('.echo', 'native-loader', 'module-activation-handoff.json'))
    const handoff = JSON.parse(await readFile(runtime.handoffPath, 'utf8'))
    expect(handoff.modules).toEqual(['echoadaptercore', 'echoworldcore'])
    expect(handoff.nativeEntrypoints).toEqual(runtime.nativeEntrypoints)

    const jvm = nativeBootstrapJvmArguments(manifest, runtime)
    const game = nativeBootstrapGameArguments(manifest, runtime)
    expect(jvm).toContain(`-Decho.native.minecraftMainClass=${ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS}`)
    expect(jvm).toContain('-Decho.native.bootstrap.authorizedHandoff=startNativeClient')
    expect(jvm).toContain('-Decho.native.loader=true')
    expect(jvm).toContain('-Decho.native.windowedClient=true')
    expect(jvm).toContain('-Decho.native.runtime.mode=windowed-native-client')
    expect(jvm.some((arg) => arg.startsWith('-Decho.native.moduleClasspath='))).toBe(false)
    expect(jvm).toContain(`-Decho.native.moduleClasspathFile=${runtime.handoffPath}`)
    expect(jvm).toContain('-Decho.native.moduleIds=echoadaptercore,echoworldcore')
    expect(game).toEqual(expect.arrayContaining([
      '--echo-marker',
      runtime.markerPath,
      '--echo-handoff-file',
      runtime.handoffPath,
      '--echo-pack-id',
      'ashfall-native-edition',
      '--echo-real-main',
      'net.minecraft.client.main.Main',
      '--echo-handoff',
    ]))
    expect(game.filter((arg) => arg === '--echo-module')).toHaveLength(0)
    expect(game.filter((arg) => arg === '--echo-native-entrypoint')).toHaveLength(0)
    expect(nativeModuleClasspathEntries({ arguments: { jvm, game } })).toEqual(runtime.classpathEntries)

    const status = nativeLauncherArgumentStatus({ arguments: { jvm, game } }, manifest)
    expect(status).toEqual({ ok: true, errors: [] })
  })

  it('adds experimental world auto-confirm for native and NeoForge dev-direct singleplayer quick play', () => {
    const quickPlay = { type: 'singleplayer', singleplayer: 'New World (4)' }
    const expected = [
      ECHO_NATIVE_DEV_DIRECT_AUTO_CONFIRM_EXPERIMENTAL_WORLD_JVM_ARGUMENT,
      `-D${ECHO_NATIVE_DEV_DIRECT_QUICKPLAY_SINGLEPLAYER_PROPERTY}=New World (4)`,
    ]
    expect(nativeDevDirectQuickPlayJvmArguments('native-loader-minecraft', quickPlay)).toEqual(expected)
    expect(nativeDevDirectQuickPlayJvmArguments('neoforge-minecraft', quickPlay)).toEqual(expected)
    expect(nativeDevDirectQuickPlayJvmArguments('native-loader-minecraft', { type: 'multiplayer', singleplayer: '' })).toEqual([])
    expect(nativeDevDirectQuickPlayJvmArguments('native-loader-minecraft', null)).toEqual([])
  })

  it('adds Ashfall product-world auto-open only for native dev-direct launches', () => {
    expect(nativeDevDirectProductWorldJvmArguments('native-loader-minecraft')).toEqual([
      ECHO_NATIVE_PRODUCT_WORLD_AUTO_OPEN_JVM_ARGUMENT,
      `-Decho.native.productWorldFolder=${ECHO_NATIVE_PRODUCT_WORLD_FOLDER}`,
      '-Decho.native.productWorldName=ECHO Native Ashfall',
      '-Decho.native.productWorldDatapack=echo-native-ashfall-datapack.zip',
    ])
    expect(nativeDevDirectProductWorldJvmArguments('neoforge-minecraft')).toEqual([])
  })

  it('adds native audit mutation flags only for native dev-direct audit launches', () => {
    expect(nativeDevDirectAuditJvmArguments('native-loader-minecraft', {
      nativeAuditRuntimeActions: true,
    })).toEqual([
      ECHO_NATIVE_PLAYABLE_RUNTIME_ACTIONS_JVM_ARGUMENT,
    ])
    expect(nativeDevDirectAuditJvmArguments('native-loader-minecraft', {
      enableNativeAuditMutations: true,
      nativeAuditLiveInteractions: true,
    })).toEqual([
      ECHO_NATIVE_PLAYABLE_RUNTIME_ACTIONS_JVM_ARGUMENT,
      ECHO_NATIVE_LIVE_INTERACTION_PROBE_ACTIONS_JVM_ARGUMENT,
    ])
    expect(nativeDevDirectAuditJvmArguments('native-loader-minecraft', {
      nativeAuditLiveInteractions: true,
    })).toEqual([
      ECHO_NATIVE_PLAYABLE_RUNTIME_ACTIONS_JVM_ARGUMENT,
      ECHO_NATIVE_LIVE_INTERACTION_PROBE_ACTIONS_JVM_ARGUMENT,
    ])
    expect(nativeDevDirectAuditJvmArguments('neoforge-minecraft', {
      nativeAuditRuntimeActions: true,
      nativeAuditLiveInteractions: true,
    })).toEqual([])
    expect(nativeDevDirectAuditJvmArguments('native-loader-minecraft', {})).toEqual([])
  })

  it('extracts embedded .echo/content-graph artifacts and writes an install aggregate', async () => {
    const root = await tempRoot()
    const addonPath = path.join(root, 'addons', 'echocontent-1.0.0.echo-addon')
    const bytes = await writeAddon(addonPath, {
      id: 'echocontent',
      nativeEntrypoint: 'com.echo.ContentModule',
      jarName: 'echocontent-1.0.0-runtime.jar',
      contentGraph: [
        {
          entryName: '.echo/content-graph/content-graph.json',
          content: JSON.stringify({ schemaVersion: 'echo.content_graph.v1', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }] }),
        },
        { entryName: '.echo/content-graph/features.json', content: JSON.stringify({ features: [{ id: 'f1' }] }) },
        {
          entryName: '.echo/content-graph/export-plans/hytale.json',
          content: JSON.stringify({
            schemaVersion: 'echo.content_graph.export_plan.v1',
            target: 'hytale',
            nodes: [
              { nodeId: 'a', status: 'direct', rationale: 'Maps directly.' },
              { nodeId: 'b', status: 'blocked', rationale: 'needs runtime hint' },
            ],
            summary: { direct: 1, adapter_required: 0, blocked: 1, not_applicable: 0 },
          }),
        },
      ],
    })
    const manifest = manifestFor('content-native-edition', [{
      path: 'addons/echocontent-1.0.0.echo-addon',
      moduleId: 'echocontent',
      sha256: sha256(bytes),
      size: bytes.length,
    }])

    const runtime = await materializeNativeLoaderAddons(manifest, root)
    expect(runtime.contentGraph).toBeDefined()
    expect(runtime.contentGraph.moduleCount).toBe(1)
    expect(runtime.contentGraph.nodeCount).toBe(2)
    expect(runtime.contentGraph.edgeCount).toBe(1)
    expect(runtime.contentGraph.featureCount).toBe(1)
    expect(runtime.contentGraph.hytaleBlockerCount).toBe(1)
    const aggregatePath = path.join(root, '.echo', 'content-graph.json')
    expect(runtime.contentGraph.aggregatePath).toBe(aggregatePath)
    const aggregate = JSON.parse(await readFile(aggregatePath, 'utf8'))
    expect(aggregate.schema).toBe('echo.launcher.content_graph.v1')
    expect(aggregate.modules[0].moduleId).toBe('echocontent')
    expect(aggregate.modules[0].hytaleBlockers).toEqual(['b: needs runtime hint'])
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

  it('marks native metadata with a missing handoff file as stale', async () => {
    const root = await tempRoot()
    const missingHandoff = path.join(root, '.echo', 'native-loader', 'module-activation-handoff.json')
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: 'a'.repeat(64),
      size: 10,
    }])
    const jvm = [
      '-Decho.native.packId=ashfall-native-edition',
      '-Decho.native.packVersion=0.1.0',
      '-Decho.native.addonsClasspath=true',
      `-Decho.native.minecraftMainClass=${ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS}`,
      '-Decho.native.bootstrap.authorizedHandoff=startNativeClient',
      `-Decho.native.gameDir=${root}`,
      `-Decho.native.moduleClasspathFile=${missingHandoff}`,
    ]
    const game = [
      '--echo-marker',
      path.join(root, '.echo', 'native-loader', 'module-activation.json'),
      '--echo-handoff-file',
      missingHandoff,
      '--echo-pack-id',
      'ashfall-native-edition',
      '--echo-real-main',
      'net.minecraft.client.main.Main',
      '--echo-handoff',
    ]

    const status = nativeLauncherArgumentStatus({ arguments: { jvm, game } }, manifest)
    expect(status.ok).toBe(false)
    expect(status.errors.join('\n')).toContain('Native Loader handoff file is missing')
  })

  it('validates local Native Loader runtime state after addon materialization', async () => {
    const root = await tempRoot()
    const addonPath = path.join(root, 'addons', 'echoadaptercore-1.0.0.echo-addon')
    const bytes = await writeAddon(addonPath, {
      id: 'echoadaptercore',
      nativeEntrypoint: 'com.echo.AdapterCoreNativeModule',
      jarName: 'echoadaptercore-1.0.0-runtime.jar',
    })
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: sha256(bytes),
      size: bytes.length,
    }])

    const before = await validateNativeLoaderLocalRuntime(manifest, root)
    expect(before.ok).toBe(false)
    expect(before.issues.map((issue) => issue.id)).toContain('nativeHandoffMissing')

    await materializeNativeLoaderAddons(manifest, root)
    const after = await validateNativeLoaderLocalRuntime(manifest, root)
    expect(after.ok).toBe(true)
    expect(after.missingAddons).toEqual([])
  })

  it('rejects malformed Native Loader handoff payloads', async () => {
    const root = await tempRoot()
    const classpathEntry = path.join(root, '.echo', 'native-loader', 'runtime', 'echoadaptercore.jar')
    const missingClasspathEntry = path.join(root, '.echo', 'native-loader', 'runtime', 'missing.jar')
    const handoffPath = path.join(root, '.echo', 'native-loader', 'module-activation-handoff.json')
    await mkdir(path.dirname(classpathEntry), { recursive: true })
    await mkdir(path.dirname(handoffPath), { recursive: true })
    await writeFile(classpathEntry, 'runtime jar bytes')
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: 'a'.repeat(64),
      size: 10,
    }])

    await writeFile(handoffPath, JSON.stringify({
      schema: 'echo.native.launcher_handoff.v0',
      packId: 'wrong-pack',
      classpathEntries: [classpathEntry, missingClasspathEntry],
      modules: [],
      nativeEntrypoints: {},
    }, null, 2))
    const errors = nativeHandoffPayloadErrors(handoffPath, manifest)

    expect(errors.join('\n')).toContain('expected echo.native.launcher_handoff.v1')
    expect(errors.join('\n')).toContain("expected 'ashfall-native-edition'")
    expect(errors.join('\n')).toContain(`module classpath entry is missing: ${missingClasspathEntry}`)
    expect(errors.join('\n')).toContain('missing module echoadaptercore')
    expect(errors.join('\n')).toContain('missing native entrypoint for echoadaptercore')
  })

  it('propagates handoff payload mismatches through launcher argument validation', async () => {
    const root = await tempRoot()
    const missingClasspathEntry = path.join(root, '.echo', 'native-loader', 'runtime', 'missing.jar')
    const handoffPath = path.join(root, '.echo', 'native-loader', 'module-activation-handoff.json')
    await mkdir(path.dirname(handoffPath), { recursive: true })
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: 'a'.repeat(64),
      size: 10,
    }])
    await writeFile(handoffPath, JSON.stringify({
      schema: 'echo.native.launcher_handoff.v0',
      packId: 'wrong-pack',
      classpathEntries: [missingClasspathEntry],
      modules: [],
      nativeEntrypoints: {},
    }, null, 2))

    const status = nativeLauncherArgumentStatus({
      arguments: {
        jvm: [
          `-Decho.native.minecraftMainClass=${ECHO_NATIVE_BOOTSTRAP_MAIN_CLASS}`,
          '-Decho.native.bootstrap.authorizedHandoff=startNativeClient',
          `-Decho.native.gameDir=${root}`,
          '-Decho.native.packId=ashfall-native-edition',
          '-Decho.native.packVersion=0.1.0',
          `-Decho.native.moduleClasspathFile=${handoffPath}`,
        ],
        game: [
          '--echo-marker',
          path.join(root, '.echo', 'native-loader', 'module-activation.json'),
          '--echo-handoff-file',
          handoffPath,
          '--echo-pack-id',
          'ashfall-native-edition',
          '--echo-real-main',
          'net.minecraft.client.main.Main',
          '--echo-handoff',
        ],
      },
    }, manifest)

    expect(status.ok).toBe(false)
    expect(status.errors.join('\n')).toContain('expected echo.native.launcher_handoff.v1')
    expect(status.errors.join('\n')).toContain("expected 'ashfall-native-edition'")
    expect(status.errors.join('\n')).toContain(`module classpath entry is missing: ${missingClasspathEntry}`)
    expect(status.errors.join('\n')).toContain('missing module echoadaptercore')
    expect(status.errors.join('\n')).toContain('missing native entrypoint for echoadaptercore')
  })

  it('rejects local Native Loader runtime state when addon hashes drift', async () => {
    const root = await tempRoot()
    const addonPath = path.join(root, 'addons', 'echoadaptercore-1.0.0.echo-addon')
    const bytes = await writeAddon(addonPath, {
      id: 'echoadaptercore',
      nativeEntrypoint: 'com.echo.AdapterCoreNativeModule',
      jarName: 'echoadaptercore-1.0.0-runtime.jar',
    })
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: sha256(bytes),
      size: bytes.length,
    }])

    await materializeNativeLoaderAddons(manifest, root)
    await writeFile(addonPath, 'corrupted addon bytes')
    const state = await validateNativeLoaderLocalRuntime(manifest, root)

    expect(state.ok).toBe(false)
    expect(state.issues.map((issue) => issue.id)).toContain('nativeAddonHashMismatch')
    expect(state.corruptAddons[0].path).toBe('addons/echoadaptercore-1.0.0.echo-addon')
  })

  it('rejects local Native Loader runtime state when required addons are missing', async () => {
    const root = await tempRoot()
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: 'a'.repeat(64),
      size: 10,
    }])

    const state = await validateNativeLoaderLocalRuntime(manifest, root)
    expect(state.ok).toBe(false)
    expect(state.issues.map((issue) => issue.id)).toEqual(expect.arrayContaining(['nativeAddonsMissing', 'nativeHandoffMissing']))
  })

  it('rejects local Native Loader runtime state when activation marker reports errors', async () => {
    const root = await tempRoot()
    const addonPath = path.join(root, 'addons', 'echoadaptercore-1.0.0.echo-addon')
    const bytes = await writeAddon(addonPath, {
      id: 'echoadaptercore',
      nativeEntrypoint: 'com.echo.AdapterCoreNativeModule',
      jarName: 'echoadaptercore-1.0.0-runtime.jar',
    })
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: sha256(bytes),
      size: bytes.length,
    }])

    const runtime = await materializeNativeLoaderAddons(manifest, root)
    await writeFile(runtime.markerPath, JSON.stringify({
      ok: false,
      errors: ['Native entrypoint echoadaptercore failed to activate.'],
    }, null, 2))
    const state = await validateNativeLoaderLocalRuntime(manifest, root)

    expect(state.ok).toBe(false)
    expect(state.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'nativeModuleActivationFailed',
        action: 'repair',
        detail: 'Native entrypoint echoadaptercore failed to activate.',
      }),
    ]))
  })

  it('rejects corrupt Native Loader activation marker reports as repair blockers', async () => {
    const root = await tempRoot()
    const addonPath = path.join(root, 'addons', 'echoadaptercore-1.0.0.echo-addon')
    const bytes = await writeAddon(addonPath, {
      id: 'echoadaptercore',
      nativeEntrypoint: 'com.echo.AdapterCoreNativeModule',
      jarName: 'echoadaptercore-1.0.0-runtime.jar',
    })
    const manifest = manifestFor('ashfall-native-edition', [{
      path: 'addons/echoadaptercore-1.0.0.echo-addon',
      moduleId: 'echoadaptercore',
      sha256: sha256(bytes),
      size: bytes.length,
    }])

    const runtime = await materializeNativeLoaderAddons(manifest, root)
    await writeFile(runtime.markerPath, '{not json')
    const state = await validateNativeLoaderLocalRuntime(manifest, root)

    expect(state.ok).toBe(false)
    expect(state.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'nativeModuleActivationFailed',
        action: 'repair',
      }),
    ]))
    expect(state.issues.map((issue) => issue.detail).join('\n')).toContain('activation marker is invalid JSON')
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
  if (Array.isArray(options.contentGraph)) {
    for (const { entryName, content } of options.contentGraph) {
      zip.addFile(entryName, Buffer.from(content, 'utf8'))
    }
  }
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
