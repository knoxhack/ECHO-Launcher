import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  buildPlatformInfo,
  commonImportRootsForPlatform,
  detectWine,
  javaSearchConfigForPlatform,
  launcherUpdatesSupportedForPlatform,
  minecraftLauncherExecutableCandidatesForPlatform,
  minecraftLauncherOpenPriority,
  minecraftLauncherRootsForPlatform,
  platformKindFromNodePlatform,
} = require('./platform-support.cjs')

describe('platform support helpers', () => {
  it('maps Node platforms to launcher platform kinds', () => {
    expect(platformKindFromNodePlatform('win32')).toBe('windows')
    expect(platformKindFromNodePlatform('linux')).toBe('linux')
    expect(platformKindFromNodePlatform('darwin')).toBe('macos')
    expect(platformKindFromNodePlatform('freebsd')).toBe('unsupported')
  })

  it('detects Wine from Windows process environment hints', () => {
    expect(detectWine({ WINEPREFIX: '/home/user/.wine' }, 'win32')).toBe(true)
    expect(detectWine({ WINEPREFIX: '/home/user/.wine' }, 'linux')).toBe(false)
    expect(detectWine({}, 'win32')).toBe(false)
  })

  it('reports native Linux AppImage update support', () => {
    const info = buildPlatformInfo({ platform: 'linux', env: { APPIMAGE: '/opt/ECHO.AppImage' }, packaged: true })
    expect(info).toMatchObject({ kind: 'linux', launcherSupport: 'native', updatesSupported: true })
    expect(launcherUpdatesSupportedForPlatform(info, true, true, { APPIMAGE: '/opt/ECHO.AppImage' })).toBe(true)
  })

  it('reports native Windows update support', () => {
    const info = buildPlatformInfo({ platform: 'win32', env: {}, packaged: true })
    expect(info).toMatchObject({ kind: 'windows', launcherSupport: 'native', updatesSupported: true })
    expect(launcherUpdatesSupportedForPlatform(info, true, true, {})).toBe(true)
  })

  it('keeps Linux dev builds out of updater support', () => {
    const info = buildPlatformInfo({ platform: 'linux', env: {}, packaged: false })
    expect(info.updatesSupported).toBe(false)
    expect(launcherUpdatesSupportedForPlatform(info, false, true, {})).toBe(false)
  })

  it('keeps unsupported platforms out of updater support', () => {
    const info = buildPlatformInfo({ platform: 'darwin', env: {}, packaged: true })
    expect(info).toMatchObject({ kind: 'macos', launcherSupport: 'unsupported', updatesSupported: false })
    expect(launcherUpdatesSupportedForPlatform(info, true, true, {})).toBe(false)
  })

  it('reports Wine compatibility mode while preserving Windows updater eligibility', () => {
    const info = buildPlatformInfo({ platform: 'win32', env: { WINEPREFIX: '/home/user/.wine' }, packaged: true })
    expect(info).toMatchObject({ kind: 'windows', compat: 'wine', launcherSupport: 'wine-compatible', updatesSupported: true })
  })

  it('builds Linux Minecraft and Java search paths', () => {
    expect(minecraftLauncherRootsForPlatform({ platform: 'linux', home: '/home/player' })).toContain('/home/player/.minecraft')
    expect(commonImportRootsForPlatform({ platform: 'linux', home: '/home/player' })).toContain('/home/player/.local/share/PrismLauncher/instances')
    expect(javaSearchConfigForPlatform({ platform: 'linux', home: '/home/player' })).toMatchObject({
      pathCommand: ['which', ['java']],
      executableName: 'java',
    })
  })

  it('builds Windows and Wine Minecraft and Java search paths', () => {
    const env = { APPDATA: 'C:\\Users\\Player\\AppData\\Roaming', ProgramFiles: 'C:\\Program Files' }
    expect(minecraftLauncherRootsForPlatform({ platform: 'win32', env, home: 'C:\\Users\\Player' })).toContain('C:\\Users\\Player\\AppData\\Roaming\\.minecraft')
    expect(javaSearchConfigForPlatform({ platform: 'win32', env, home: 'C:\\Users\\Player' })).toMatchObject({
      pathCommand: ['where.exe', ['java']],
      executableName: 'java.exe',
    })
  })

  it('builds launcher executable candidates for Windows, Linux, and Wine prefixes', () => {
    expect(minecraftLauncherExecutableCandidatesForPlatform({ platform: 'linux', home: '/home/player' })).toContain('/usr/bin/minecraft-launcher')
    expect(
      minecraftLauncherExecutableCandidatesForPlatform({
        platform: 'win32',
        env: { ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\Player\\AppData\\Local' },
      }),
    ).toContain('C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe')
  })

  it('prioritizes direct executable opening before platform commands and protocol fallback', () => {
    expect(minecraftLauncherOpenPriority({ platform: 'linux', executablePath: '/usr/bin/minecraft-launcher', protocolHandlerVerified: true })).toEqual([
      { kind: 'executable', target: '/usr/bin/minecraft-launcher' },
      { kind: 'command', target: 'minecraft-launcher' },
      { kind: 'protocol', target: 'minecraft://' },
    ])
    expect(minecraftLauncherOpenPriority({ platform: 'linux', protocolHandlerVerified: false }).some((item) => item.kind === 'protocol')).toBe(false)
    expect(minecraftLauncherOpenPriority({ platform: 'win32', executablePath: 'C:\\MC\\MinecraftLauncher.exe' })[0]).toEqual({
      kind: 'executable',
      target: 'C:\\MC\\MinecraftLauncher.exe',
    })
  })
})
