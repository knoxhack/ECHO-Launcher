import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bundledProfiles } from '../data/bundledProfiles'
import type { AppReadinessState } from '../types/native'
import { officialPackIds } from '../utils/releaseValidation'
import { useReadinessStore } from './readinessStore'

const readiness = {
  ok: true,
  generatedAt: '2026-05-24T12:00:00.000Z',
  profile: bundledProfiles[0],
  install: {
    installed: true,
    status: 'healthy',
    installPath: 'C:\\Games\\Ashfall',
  },
  catalog: {
    configured: true,
    ok: true,
    source: 'https://raw.githubusercontent.com/knoxhack/ECHO-Release-Index/main/channels/alpha/launcher-channel.json',
    releases: 1,
    latestVersion: '1.0.0',
    fetchedAt: '2026-05-24T12:00:00.000Z',
    warnings: [],
  },
  minecraftLauncher: {
    ok: true,
    warnings: [],
  },
  logs: {
    available: true,
    count: 1,
    latestName: 'latest.log',
  },
  settings: {
    advancedMode: false,
    creatorMode: false,
    launchMode: 'minecraft_launcher',
  },
  platform: {
    kind: 'windows',
    launcherSupport: 'native',
    updatesSupported: true,
    os: 'win32',
    release: '10.0.26100',
    arch: 'x64',
    cpus: 12,
    totalMemory: 32_000_000_000,
  },
  warnings: [],
} satisfies AppReadinessState

describe('readiness store', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useReadinessStore.setState({ readiness: null, loading: false, error: null })
  })

  it('returns null when native services are unavailable', async () => {
    await expect(useReadinessStore.getState().refreshReadiness()).resolves.toBeNull()
  })

  it('reuses an in-flight readiness request', async () => {
    let resolveReadiness: (state: AppReadinessState) => void = () => undefined
    const invoke = vi.fn(
      () =>
        new Promise<AppReadinessState>((resolve) => {
          resolveReadiness = resolve
        }),
    )
    vi.stubGlobal('window', { echoNative: { invoke } })

    const first = useReadinessStore.getState().refreshReadiness()
    const second = useReadinessStore.getState().refreshReadiness()

    expect(useReadinessStore.getState().loading).toBe(true)
    resolveReadiness(readiness)
    await Promise.all([first, second])

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(useReadinessStore.getState().readiness).toBe(readiness)
    expect(useReadinessStore.getState().loading).toBe(false)
  })

  it('keeps in-flight readiness requests separated by profile id', async () => {
    const invoke = vi.fn((_, payload?: { profileId?: string }) =>
      Promise.resolve({
        ...readiness,
        profile: {
          ...readiness.profile,
          id: payload?.profileId ?? readiness.profile.id,
        },
      }),
    )
    vi.stubGlobal('window', { echoNative: { invoke } })

    await Promise.all([
      useReadinessStore.getState().refreshReadiness('ashfall-native-edition'),
      useReadinessStore.getState().refreshReadiness('ashfall-standalone-edition'),
    ])

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenCalledWith('app:get-readiness', { profileId: 'ashfall-native-edition' })
    expect(invoke).toHaveBeenCalledWith('app:get-readiness', { profileId: 'ashfall-standalone-edition' })
  })

  it('requests selected-pack readiness for every official pack id', async () => {
    const invoke = vi.fn((_, payload?: { profileId?: string }) =>
      Promise.resolve({
        ...readiness,
        profile: {
          ...readiness.profile,
          id: payload?.profileId ?? readiness.profile.id,
        },
      }),
    )
    vi.stubGlobal('window', { echoNative: { invoke } })

    for (const profileId of officialPackIds) {
      const result = await useReadinessStore.getState().refreshReadiness(profileId)
      expect(result?.profile.id).toBe(profileId)
    }

    expect(invoke).toHaveBeenCalledTimes(officialPackIds.length)
  })
})


