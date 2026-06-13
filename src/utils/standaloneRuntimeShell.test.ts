import { describe, expect, it } from 'vitest'
import type { StandaloneRuntimeState } from '../types/standaloneRuntime'
import { buildRuntimeLaunchButtonState, buildRuntimeModeCards, runtimeSummaryStatus } from './standaloneRuntimeShell'

const readyRuntime: StandaloneRuntimeState = {
  ok: true,
  generatedAt: '2026-05-31T00:00:00.000Z',
  runtimeRoot: 'C:\\Echo\\echo-standalone-runtime',
  executablePath: 'C:\\Echo\\echo-standalone-runtime\\build\\jpackage\\EchoStandaloneRuntime\\EchoStandaloneRuntime.exe',
  version: '0.1.0-phase14.20-alpha-readiness',
  checks: [
    {
      id: 'runtime-exe',
      label: 'Runtime executable',
      status: 'healthy',
      detail: 'Executable is present.',
      severity: 'required',
    },
  ],
  repairPlan: [],
  supportBundle: { available: true, entries: 4 },
  logs: [],
  warnings: [],
}

describe('standalone runtime shell', () => {
  it('summarizes a ready runtime as healthy', () => {
    expect(runtimeSummaryStatus(readyRuntime)).toBe('healthy')
    expect(buildRuntimeModeCards(readyRuntime).map((card) => card.id)).toEqual([
      'native-loader-minecraft',
      'native-runtime',
    ])
    expect(buildRuntimeModeCards(readyRuntime)[1]).toMatchObject({
      id: 'native-runtime',
      status: 'healthy',
      disabledReason: undefined,
    })
  })

  it('allows Ashfall Native Edition handoff without standalone runtime verification', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'native-loader-minecraft',
      state: null,
      nativeAvailable: true,
      nativeLoaderReady: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Play Pack')
  })

  it('allows NeoForge handoff without Native Loader metadata', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'neoforge-minecraft',
      state: null,
      nativeAvailable: true,
      nativeLoaderReady: false,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Play with NeoForge')
  })

  it('blocks native runtime launch when verification is missing', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'native-runtime',
      state: null,
      nativeAvailable: true,
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Repair Required')
  })

  it('keeps native loader gated until release metadata is available', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'native-loader-minecraft',
      state: readyRuntime,
      nativeAvailable: true,
      nativeLoaderDisabledReason: 'Native Loader release metadata is missing.',
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Native Loader Required')
    expect(state.detail).toContain('metadata')
  })

  it('allows native loader handoff when release metadata is available', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'native-loader-minecraft',
      state: readyRuntime,
      nativeAvailable: true,
      nativeLoaderReady: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Play Pack')
  })

  it('allows the desktop standalone launch when verification passes', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'native-runtime',
      state: readyRuntime,
      nativeAvailable: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Launch Showcase')
  })
})
