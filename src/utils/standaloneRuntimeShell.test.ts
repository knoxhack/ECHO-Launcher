import { describe, expect, it } from 'vitest'
import type { StandaloneRuntimeState } from '../types/standaloneRuntime'
import { buildRuntimeLaunchButtonState, buildRuntimeModeCards, buildRuntimeRepairButtonState, runtimeSummaryStatus } from './standaloneRuntimeShell'

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

const corruptEngineRuntime: StandaloneRuntimeState = {
  ...readyRuntime,
  ok: false,
  runtimeRoot: 'C:\\Echo\\Ashfall Standalone Engine Edition',
  executablePath: 'C:\\Echo\\Ashfall Standalone Engine Edition\\echo-standalone-engine-2.0.0-beta.2.jar',
  javaVersion: '21.0.8',
  manifestPath: 'C:\\Echo\\Ashfall Standalone Engine Edition\\.echo\\installed-manifest.json',
  contentGraphEvidencePath: 'C:\\Echo\\Ashfall Standalone Engine Edition\\content-graph-evidence.json',
  checks: [
    {
      id: 'java-21',
      label: 'Java 21+',
      status: 'healthy',
      detail: 'Java 21.0.8 at C:\\Java\\bin\\java.exe.',
      severity: 'required',
    },
    {
      id: 'file-verification',
      label: 'File verification',
      status: 'warning',
      detail: '17 valid, 0 missing, 1 corrupt required file(s).',
      severity: 'required',
    },
  ],
  repairPlan: [
    {
      id: 'repair-file-verification',
      title: 'Restore File verification',
      detail: 'Repair the Engine Edition install from the pack ZIP. Missing: none. Corrupt: mods/echoadaptercore-1.0.0-standalone.jar.',
      recommended: true,
      automated: true,
    },
  ],
  warnings: ['17 valid, 0 missing, 1 corrupt required file(s).'],
}

describe('standalone runtime shell', () => {
  it('summarizes a ready runtime as healthy', () => {
    expect(runtimeSummaryStatus(readyRuntime)).toBe('healthy')
    expect(buildRuntimeModeCards(readyRuntime).map((card) => card.id)).toEqual([
      'native-loader-minecraft',
      'standalone-engine',
      'neoforge-minecraft',
      'native-runtime',
    ])
    expect(buildRuntimeModeCards(readyRuntime).find((card) => card.id === 'standalone-engine')).toMatchObject({
      id: 'standalone-engine',
      label: 'Standalone Engine',
      status: 'healthy',
      disabledReason: undefined,
    })
    expect(buildRuntimeModeCards(readyRuntime).find((card) => card.id === 'native-runtime')).toMatchObject({
      id: 'native-runtime',
      label: 'Legacy Standalone Runtime',
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

  it('blocks standalone engine launch when verification is missing', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'standalone-engine',
      state: null,
      nativeAvailable: true,
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Repair Required')
    expect(state.detail).toContain('Standalone Engine verification')
  })

  it('explains the first failed standalone engine check in the launch blocker', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'standalone-engine',
      state: corruptEngineRuntime,
      nativeAvailable: true,
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Repair Required')
    expect(state.detail).toContain('File verification')
    expect(state.detail).toContain('1 corrupt')
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
    expect(state.label).toBe('Launch Runtime')
  })

  it('allows the standalone engine launch when verification passes', () => {
    const state = buildRuntimeLaunchButtonState({
      mode: 'standalone-engine',
      state: readyRuntime,
      nativeAvailable: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Launch Engine')
  })

  it('enables automated standalone engine repair when file verification is repairable', () => {
    const state = buildRuntimeRepairButtonState({
      mode: 'standalone-engine',
      state: corruptEngineRuntime,
      nativeAvailable: true,
    })

    expect(state.disabled).toBe(false)
    expect(state.label).toBe('Repair Install')
    expect(state.detail).toContain('pack ZIP')
  })

  it('reports no repair needed for a verified standalone engine', () => {
    const state = buildRuntimeRepairButtonState({
      mode: 'standalone-engine',
      state: readyRuntime,
      nativeAvailable: true,
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('No Repair Needed')
    expect(state.detail).toContain('content graph evidence')
  })

  it('keeps non-automated standalone engine failures in manual repair state', () => {
    const state = buildRuntimeRepairButtonState({
      mode: 'standalone-engine',
      state: { ...corruptEngineRuntime, repairPlan: corruptEngineRuntime.repairPlan.map((action) => ({ ...action, automated: false })) },
      nativeAvailable: true,
    })

    expect(state.disabled).toBe(true)
    expect(state.label).toBe('Manual Repair Needed')
    expect(state.detail).toContain('File verification')
  })
})
