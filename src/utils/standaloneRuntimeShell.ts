import type {
  LauncherRuntimeModeId,
  StandaloneRuntimeLaunchButtonState,
  StandaloneRuntimeModeCard,
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
    label: 'Ashfall Native Edition',
    eyebrow: 'Native Loader alpha',
    detail: 'Uses the Ashfall Native Edition profile only when verified Native Loader release metadata is present.',
    actionLabel: 'Play Ashfall',
  },
  'native-runtime': {
    label: 'Standalone Runtime Showcase',
    eyebrow: 'Experimental alpha',
    detail: 'Checks standalone runtime readiness and launches the experimental runtime showcase.',
    actionLabel: 'Launch Showcase',
  },
  'neoforge-minecraft': {
    label: 'NeoForge + Minecraft',
    eyebrow: 'Hidden legacy mode',
    detail: 'Legacy internal mode kept only for old persisted state migration.',
    actionLabel: 'Play with NeoForge',
  },
}

const modeOrder: LauncherRuntimeModeId[] = ['native-loader-minecraft', 'native-runtime']

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

  if (id === 'native-runtime') {
    return {
      id,
      ...modeCopy[id],
      status: standaloneStatus,
      disabledReason: state?.ok ? undefined : 'Standalone runtime verification must pass before launch.',
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
  if (input.mode === 'native-runtime' && !input.state?.ok) {
    return {
      disabled: true,
      label: 'Repair Required',
      status: runtimeSummaryStatus(input.state),
      detail: card.disabledReason,
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
