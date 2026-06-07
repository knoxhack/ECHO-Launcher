import type { HealthStatus } from '../types/launcher'
import type { PackOsLauncherPackState, PackOsLauncherState, PackOsUiState } from '../types/packos'

const blockingStates = new Set<PackOsUiState>(['blocked', 'manual_review_required', 'needs_repair', 'repair_available', 'unsupported', 'not_installed'])

const uiStateLabels: Record<PackOsUiState, string> = {
  ready: 'Ready',
  playable_with_warnings: 'Playable With Warnings',
  degraded: 'Degraded',
  needs_repair: 'Needs Repair',
  repair_available: 'Repair Available',
  manual_review_required: 'Manual Review Required',
  blocked: 'Blocked',
  unsupported: 'Unsupported',
  not_installed: 'Not Installed',
  unknown: 'Unknown',
}

export function packOsUiStateLabel(state: PackOsUiState | string | undefined): string {
  return uiStateLabels[(state as PackOsUiState) ?? 'unknown'] ?? 'Unknown'
}

export function selectedPackOsPack(state: PackOsLauncherState | null | undefined, packId = 'ashfall-native-edition'): PackOsLauncherPackState | null {
  if (!state) return null
  return state.packs.find((pack) => pack.packId === packId) ?? state.selectedPack ?? null
}

export function packOsHealthStatus(pack: PackOsLauncherPackState | null | undefined): HealthStatus {
  switch (pack?.uiState) {
    case 'ready':
      return 'healthy'
    case 'playable_with_warnings':
      return 'warning'
    case 'degraded':
    case 'needs_repair':
    case 'repair_available':
    case 'manual_review_required':
      return 'warning'
    case 'blocked':
    case 'unsupported':
      return 'critical'
    case 'not_installed':
      return 'missing'
    default:
      return 'missing'
  }
}

export function isPackOsLaunchBlocked(state: PackOsLauncherState | null | undefined, packId = 'ashfall-native-edition'): boolean {
  const pack = selectedPackOsPack(state, packId)
  return Boolean(pack && pack.launchAllowed === false && blockingStates.has(pack.uiState))
}

export function packOsPrimaryReason(state: PackOsLauncherState | null | undefined, packId = 'ashfall-native-edition'): string {
  const pack = selectedPackOsPack(state, packId)
  if (!pack) return 'PackOS reports have not been loaded yet.'
  return pack.blockingReasons[0] ?? pack.warnings[0] ?? `${pack.name} is ${packOsUiStateLabel(pack.uiState)}.`
}

export function packOsSummaryLine(pack: PackOsLauncherPackState | null | undefined): string {
  if (!pack) return 'PackOS report state is unknown.'
  return `${packOsUiStateLabel(pack.uiState)} - ${pack.variant} - ${pack.channel}`
}

export function packOsSafeCommands(state: PackOsLauncherState | null | undefined, pack: PackOsLauncherPackState | null | undefined): string[] {
  return [...new Set([...(state?.safeCommands ?? []), ...(pack?.safeCommands ?? [])])].sort()
}
