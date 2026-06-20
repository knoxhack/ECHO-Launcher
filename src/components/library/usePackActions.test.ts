import { describe, expect, it } from 'vitest'
import type { NativePackState } from '../../types/native'
import {
  ashfallDevDirectQuickPlaySingleplayer,
  shouldUseAshfallNativeDevDirectLaunch,
  shouldUseAshfallNeoForgeDevDirectLaunch,
} from './usePackActions'

function packState(overrides: Partial<NativePackState> = {}): NativePackState {
  return {
    ok: true,
    generatedAt: '2026-06-17T00:00:00.000Z',
    profile: {
      id: 'ashfall-native-edition',
      name: 'Ashfall Native Edition',
      installPath: 'C:\\ECHOLauncher\\Instances\\Ashfall Native Edition',
      channel: 'alpha',
      runtimeMode: 'native-loader-minecraft',
      status: 'healthy',
    },
    route: {
      mode: 'native-loader-minecraft',
      label: 'Minecraft + Native Loader',
      shortLabel: 'Native Loader',
      detail: 'Native modules are activated before Minecraft starts.',
    },
    install: {
      installed: true,
      status: 'healthy',
      installPath: 'C:\\ECHOLauncher\\Instances\\Ashfall Native Edition',
      manifestPath: 'C:\\ECHOLauncher\\Instances\\Ashfall Native Edition\\.echo\\pack-manifest.json',
      version: '0.1.0',
    },
    localManifest: {
      status: 'valid',
      valid: true,
      code: 'ok',
      message: 'Manifest valid',
    },
    catalog: {
      configured: true,
      ok: true,
      source: 'release-index',
      releases: 1,
      status: 'ok',
      warnings: [],
    },
    minecraftLauncher: {
      ok: true,
      warnings: [],
    },
    primaryAction: {
      kind: 'play',
      label: 'Play Ashfall Native Edition',
      enabled: true,
      variant: 'primary',
      reason: 'Ready',
    },
    blockers: [],
    warnings: [],
    ...overrides,
  } as NativePackState
}

describe('shouldUseAshfallNativeDevDirectLaunch', () => {
  it('uses direct native loader launch for Ashfall Native in dev mode', () => {
    expect(shouldUseAshfallNativeDevDirectLaunch(packState(), true)).toBe(true)
  })

  it('keeps production builds on the standard handoff path', () => {
    expect(shouldUseAshfallNativeDevDirectLaunch(packState(), false)).toBe(false)
  })

  it('does not route other packs through the Ashfall direct launch bridge', () => {
    expect(
      shouldUseAshfallNativeDevDirectLaunch(
        packState({
          profile: {
            ...packState().profile,
            id: 'sky-relay-native-edition',
            name: 'Sky Relay Native Edition',
            installPath: 'C:\\ECHOLauncher\\Instances\\Sky Relay Native Edition',
            channel: 'alpha',
            runtimeMode: 'native-loader-minecraft',
            status: 'healthy',
          },
        }),
        true,
      ),
    ).toBe(false)
  })

  it('does not bypass Minecraft Launcher for NeoForge routes', () => {
    expect(
      shouldUseAshfallNativeDevDirectLaunch(
        packState({
          route: {
            mode: 'neoforge-minecraft',
            label: 'Minecraft + NeoForge',
            shortLabel: 'NeoForge',
            detail: 'Uses the standard NeoForge Minecraft route.',
          },
        }),
        true,
      ),
    ).toBe(false)
  })
})

describe('shouldUseAshfallNeoForgeDevDirectLaunch', () => {
  it('uses direct NeoForge launch for Ashfall NeoForge in dev mode', () => {
    expect(
      shouldUseAshfallNeoForgeDevDirectLaunch(
        packState({
          profile: {
            ...packState().profile,
            id: 'ashfall-neoforge-edition',
            name: 'Ashfall NeoForge Edition',
            installPath: 'C:\\ECHOLauncher\\Instances\\Ashfall NeoForge Edition',
            channel: 'alpha',
            runtimeMode: 'neoforge-minecraft',
            status: 'healthy',
          },
          route: {
            mode: 'neoforge-minecraft',
            label: 'Minecraft + NeoForge',
            shortLabel: 'NeoForge',
            detail: 'Uses the standard NeoForge Minecraft route.',
          },
        }),
        true,
      ),
    ).toBe(true)
  })

  it('keeps production Ashfall NeoForge on the standard handoff path', () => {
    expect(
      shouldUseAshfallNeoForgeDevDirectLaunch(
        packState({
          profile: {
            ...packState().profile,
            id: 'ashfall-neoforge-edition',
            name: 'Ashfall NeoForge Edition',
            installPath: 'C:\\ECHOLauncher\\Instances\\Ashfall NeoForge Edition',
            channel: 'alpha',
            runtimeMode: 'neoforge-minecraft',
            status: 'healthy',
          },
          route: {
            mode: 'neoforge-minecraft',
            label: 'Minecraft + NeoForge',
            shortLabel: 'NeoForge',
            detail: 'Uses the standard NeoForge Minecraft route.',
          },
        }),
        false,
      ),
    ).toBe(false)
  })

  it('does not route Ashfall Native through the NeoForge direct launch bridge', () => {
    expect(shouldUseAshfallNeoForgeDevDirectLaunch(packState(), true)).toBe(false)
  })
})

describe('ashfallDevDirectQuickPlaySingleplayer', () => {
  it('lets Native product-world auto-open create the Ashfall save instead of quick-playing the latest save', () => {
    expect(ashfallDevDirectQuickPlaySingleplayer(packState(), true)).toBe(false)
  })

  it('keeps NeoForge comparison launches on the latest existing save', () => {
    expect(
      ashfallDevDirectQuickPlaySingleplayer(
        packState({
          profile: {
            ...packState().profile,
            id: 'ashfall-neoforge-edition',
            name: 'Ashfall NeoForge Edition',
            installPath: 'C:\\ECHOLauncher\\Instances\\Ashfall NeoForge Edition',
            channel: 'alpha',
            runtimeMode: 'neoforge-minecraft',
            status: 'healthy',
          },
          route: {
            mode: 'neoforge-minecraft',
            label: 'Minecraft + NeoForge',
            shortLabel: 'NeoForge',
            detail: 'Uses the standard NeoForge Minecraft route.',
          },
        }),
        true,
      ),
    ).toBe('latest-if-present')
  })
})
