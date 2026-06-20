import { describe, expect, it } from 'vitest'
import type { StandaloneRuntimeState } from '../types/standaloneRuntime'
import { buildRuntimeLaunchButtonState, buildRuntimeModeCards, buildRuntimeRepairButtonState, buildStandaloneEngineEvidenceFacts, runtimeSummaryStatus } from './standaloneRuntimeShell'

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

const readyEngineRuntime: StandaloneRuntimeState = {
  ...corruptEngineRuntime,
  ok: true,
  lastLaunchLogPath: 'C:\\Echo\\Ashfall Standalone Engine Edition\\logs\\echo-standalone-engine.log',
  checks: [
    {
      id: 'install-root',
      label: 'Install root',
      status: 'healthy',
      detail: 'Resolved C:\\Echo\\Ashfall Standalone Engine Edition.',
      severity: 'required',
    },
    {
      id: 'engine-jar',
      label: 'Engine JAR',
      status: 'healthy',
      detail: 'Engine JAR is ready.',
      severity: 'required',
    },
    {
      id: 'java-21',
      label: 'Java 21+',
      status: 'healthy',
      detail: 'Java 21.0.8 at C:\\Java\\bin\\java.exe.',
      severity: 'required',
    },
    {
      id: 'pack-manifest',
      label: 'Pack manifest',
      status: 'healthy',
      detail: 'Manifest found.',
      severity: 'required',
    },
    {
      id: 'content-graph-evidence',
      label: 'Content graph evidence',
      status: 'healthy',
      detail: 'Content graph evidence reports PASS for 18 module(s).',
      path: 'C:\\Echo\\Ashfall Standalone Engine Edition\\content-graph-evidence.json',
      severity: 'required',
    },
    {
      id: 'file-verification',
      label: 'File verification',
      status: 'healthy',
      detail: '24 valid, 0 missing, 0 corrupt required file(s).',
      severity: 'required',
    },
  ],
  repairPlan: [],
  supportBundle: { available: true, entries: 3 },
  warnings: [],
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

  it('builds complete ready Standalone Engine evidence facts', () => {
    const repairButton = buildRuntimeRepairButtonState({
      mode: 'standalone-engine',
      state: readyEngineRuntime,
      nativeAvailable: true,
    })
    const facts = buildStandaloneEngineEvidenceFacts(readyEngineRuntime, repairButton)

    expect(facts.map((fact) => fact.label)).toEqual([
      'Install root',
      'Engine JAR',
      'Java',
      'Pack manifest',
      'Content graph status',
      'Content graph evidence',
      'File verification',
      'Last launch log',
      'Repair button',
      'Support bundle',
    ])
    expect(facts.find((fact) => fact.label === 'Content graph status')).toMatchObject({
      status: 'healthy',
      value: 'Content graph evidence reports PASS for 18 module(s).',
    })
    expect(facts.find((fact) => fact.label === 'Last launch log')).toMatchObject({
      status: 'healthy',
      value: 'C:\\Echo\\Ashfall Standalone Engine Edition\\logs\\echo-standalone-engine.log',
    })
    expect(facts.find((fact) => fact.label === 'Repair button')).toMatchObject({
      status: 'healthy',
      value: 'No Repair Needed: Java, engine JAR, manifest, content graph evidence, and required files are ready.',
    })
  })

  it('keeps missing Standalone Engine evidence visible when launch is blocked', () => {
    const blockedRuntime: StandaloneRuntimeState = {
      ...corruptEngineRuntime,
      manifestPath: undefined,
      contentGraphEvidencePath: undefined,
      lastLaunchLogPath: undefined,
      supportBundle: { available: false, entries: 0 },
      checks: [
        ...corruptEngineRuntime.checks,
        {
          id: 'pack-manifest',
          label: 'Pack manifest',
          status: 'missing',
          detail: 'pack.json or .echo/installed-manifest.json is missing.',
          severity: 'required',
        },
        {
          id: 'content-graph-evidence',
          label: 'Content graph evidence',
          status: 'missing',
          detail: 'content-graph-evidence.json is missing.',
          severity: 'required',
        },
      ],
    }
    const repairButton = buildRuntimeRepairButtonState({
      mode: 'standalone-engine',
      state: blockedRuntime,
      nativeAvailable: true,
    })
    const facts = buildStandaloneEngineEvidenceFacts(blockedRuntime, repairButton)

    expect(facts.find((fact) => fact.label === 'Pack manifest')).toMatchObject({
      status: 'missing',
      value: 'pack.json or .echo/installed-manifest.json is missing.',
    })
    expect(facts.find((fact) => fact.label === 'Content graph evidence')).toMatchObject({
      status: 'missing',
      value: 'content-graph-evidence.json has not been located.',
    })
    expect(facts.find((fact) => fact.label === 'Last launch log')).toMatchObject({
      status: 'operational',
      value: 'No Standalone Engine launch log recorded yet.',
    })
    expect(facts.find((fact) => fact.label === 'Repair button')?.value).toContain('Repair Install')
  })
})
