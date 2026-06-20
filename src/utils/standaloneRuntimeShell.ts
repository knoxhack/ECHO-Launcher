import type {
  LauncherRuntimeModeId,
  StandaloneRuntimeLaunchButtonState,
  StandaloneRuntimeModeCard,
  StandaloneRuntimeRepairButtonState,
  StandaloneRuntimeState,
} from '../types/standaloneRuntime'
import type { HealthStatus } from '../types/launcher'

export interface RuntimeModeCardOptions {
  minecraftReady?: boolean
  nativeLoaderReady?: boolean
  nativeLoaderDisabledReason?: string
}

const modeCopy: Record<LauncherRuntimeModeId, Omit<StandaloneRuntimeModeCard, 'id' | 'status' | 'disabledReason'>> = {
  'native-loader-minecraft': {
    label: 'Native Loader Pack',
    eyebrow: 'Native Loader alpha',
    detail: 'Uses the selected pack profile only when verified Native Loader release metadata is present.',
    actionLabel: 'Play Pack',
  },
  'native-runtime': {
    label: 'Legacy Standalone Runtime',
    eyebrow: 'Compatibility',
    detail: 'Checks legacy standalone runtime readiness for old standalone profiles.',
    actionLabel: 'Launch Runtime',
  },
  'standalone-engine': {
    label: 'Standalone Engine',
    eyebrow: 'Engine beta',
    detail: 'Verifies Java 21, the engine JAR, pack manifest, content graph evidence, and installed files.',
    actionLabel: 'Launch Engine',
  },
  'neoforge-minecraft': {
    label: 'NeoForge + Minecraft',
    eyebrow: 'Hidden legacy mode',
    detail: 'Legacy internal mode kept only for old persisted state migration.',
    actionLabel: 'Play with NeoForge',
  },
}

const modeOrder: LauncherRuntimeModeId[] = ['native-loader-minecraft', 'standalone-engine', 'neoforge-minecraft', 'native-runtime']

export function runtimeSummaryStatus(state: StandaloneRuntimeState | null): HealthStatus {
  if (!state) return 'missing'
  if (state.ok) return 'healthy'
  if (state.checks.some((check) => check.status === 'critical' || check.status === 'failed')) return 'critical'
  if (state.checks.some((check) => check.status === 'missing')) return 'missing'
  if (state.checks.some((check) => check.status === 'warning')) return 'warning'
  return 'operational'
}

function buildRuntimeModeCard(
  id: LauncherRuntimeModeId,
  state: StandaloneRuntimeState | null,
  options: RuntimeModeCardOptions = {},
): StandaloneRuntimeModeCard {
  const standaloneStatus = runtimeSummaryStatus(state)
  const minecraftReady = options.minecraftReady ?? true
  const nativeLoaderReady = options.nativeLoaderReady ?? false

  if (id === 'native-runtime' || id === 'standalone-engine') {
    return {
      id,
      ...modeCopy[id],
      status: standaloneStatus,
      disabledReason: state?.ok ? undefined : id === 'standalone-engine'
        ? 'Standalone Engine verification must pass before launch.'
        : 'Standalone runtime verification must pass before launch.',
    }
  }
  if (id === 'neoforge-minecraft') {
    return {
      id,
      ...modeCopy[id],
      status: minecraftReady ? 'operational' : 'warning',
      disabledReason: minecraftReady ? undefined : 'Minecraft Launcher readiness is degraded.',
    }
  }
  return {
    id,
    ...modeCopy[id],
    status: nativeLoaderReady && minecraftReady ? 'operational' : 'warning',
    disabledReason: nativeLoaderReady
      ? minecraftReady
        ? undefined
        : 'Minecraft Launcher readiness is degraded.'
      : options.nativeLoaderDisabledReason ?? 'Native Loader release metadata is required before launch.',
  }
}

export function buildRuntimeModeCards(
  state: StandaloneRuntimeState | null,
  options: RuntimeModeCardOptions = {},
): StandaloneRuntimeModeCard[] {
  return modeOrder.map((id) => buildRuntimeModeCard(id, state, options))
}

export function buildRuntimeLaunchButtonState(input: {
  mode: LauncherRuntimeModeId
  state: StandaloneRuntimeState | null
  nativeAvailable: boolean
  minecraftReady?: boolean
  nativeLoaderReady?: boolean
  nativeLoaderDisabledReason?: string
  launching?: boolean
}): StandaloneRuntimeLaunchButtonState {
  const card = buildRuntimeModeCard(input.mode, input.state, {
    minecraftReady: input.minecraftReady ?? true,
    nativeLoaderReady: input.nativeLoaderReady,
    nativeLoaderDisabledReason: input.nativeLoaderDisabledReason,
  })
  if (!input.nativeAvailable) {
    return {
      disabled: true,
      label: 'Desktop Required',
      status: 'missing',
      detail: 'Runtime launch is only available in the Electron desktop shell.',
    }
  }
  if (input.launching) {
    return {
      disabled: true,
      label: 'Launching...',
      status: 'queued',
      detail: 'The launcher is handing off control.',
    }
  }
  if ((input.mode === 'native-runtime' || input.mode === 'standalone-engine') && !input.state?.ok) {
    const blocking = firstBlockingRequiredCheck(input.state)
    return {
      disabled: true,
      label: 'Repair Required',
      status: runtimeSummaryStatus(input.state),
      detail: blocking ? `${blocking.label}: ${blocking.detail}` : card.disabledReason,
    }
  }
  if (input.mode === 'native-loader-minecraft' && !input.nativeLoaderReady) {
    return {
      disabled: true,
      label: 'Native Loader Required',
      status: 'warning',
      detail: card.disabledReason,
    }
  }
  return {
    disabled: false,
    label: card.actionLabel,
    status: card.status,
    detail: card.detail,
  }
}

function firstBlockingRequiredCheck(state: StandaloneRuntimeState | null) {
  return (state?.checks ?? []).find(
    (check) =>
      check.severity === 'required' &&
      (check.status === 'missing' || check.status === 'critical' || check.status === 'failed' || check.status === 'warning'),
  )
}

export function buildRuntimeRepairButtonState(input: {
  mode: LauncherRuntimeModeId
  state: StandaloneRuntimeState | null
  nativeAvailable: boolean
  repairing?: boolean
}): StandaloneRuntimeRepairButtonState {
  if (!input.nativeAvailable) {
    return {
      disabled: true,
      label: 'Desktop Required',
      status: 'missing',
      detail: 'Repair is only available in the Electron desktop shell.',
    }
  }
  if (input.repairing) {
    return {
      disabled: true,
      label: 'Repairing...',
      status: 'queued',
      detail: 'The launcher is repairing the selected install from its manifest or pack archive.',
    }
  }
  if (input.mode !== 'standalone-engine') {
    return {
      disabled: true,
      label: 'Use Tools Repair',
      status: 'operational',
      detail: 'This runtime mode uses the shared repair flow outside the Standalone Engine card.',
    }
  }
  if (!input.state) {
    return {
      disabled: true,
      label: 'Verify First',
      status: 'missing',
      detail: 'Run verification before repairing the Standalone Engine install.',
    }
  }
  if (input.state.ok) {
    return {
      disabled: true,
      label: 'No Repair Needed',
      status: 'healthy',
      detail: 'Java, engine JAR, manifest, content graph evidence, and required files are ready.',
    }
  }
  const automatedRepair = input.state.repairPlan.find((action) => action.automated)
  if (automatedRepair) {
    return {
      disabled: false,
      label: 'Repair Install',
      status: runtimeSummaryStatus(input.state),
      detail: automatedRepair.detail,
    }
  }
  const blocking = firstBlockingRequiredCheck(input.state)
  return {
    disabled: true,
    label: 'Manual Repair Needed',
    status: runtimeSummaryStatus(input.state),
    detail: blocking ? `${blocking.label}: ${blocking.detail}` : input.state.warnings[0] ?? 'Repair requires manual action before launch.',
  }
}
