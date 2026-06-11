import type { LauncherProfile } from '../types/profiles'
import type { ReleaseEntry } from '../types/releases'
import type { LauncherRuntimeModeId } from '../types/standaloneRuntime'

type HomeActionProfile = Pick<LauncherProfile, 'installPath' | 'name' | 'runtimeMode' | 'status' | 'version'>
type HomeActionRelease = Pick<ReleaseEntry, 'version'> | null | undefined
export type AshfallHomeActionKind = 'install' | 'update' | 'play' | 'launch-standalone'

export interface AshfallHomeActions {
  needsInstall: boolean
  needsUpdate: boolean
  primaryActionKind: AshfallHomeActionKind
  primaryActionLabel: string
  primaryBusyLabel: string
  primaryUsesInstallFlow: boolean
  updateActionLabel: string | null
}

export interface AshfallHomeRoute {
  mode: LauncherRuntimeModeId
  label: string
  shortLabel: string
  detail: string
  steps: string[]
}

const homeRoutes: Record<LauncherRuntimeModeId, AshfallHomeRoute> = {
  'neoforge-minecraft': {
    mode: 'neoforge-minecraft',
    label: 'Minecraft + NeoForge',
    shortLabel: 'NeoForge',
    detail: 'Uses the official Minecraft Launcher with the selected Ashfall NeoForge profile.',
    steps: ['Approved install package', 'NeoForge profile', 'Minecraft Launcher'],
  },
  'native-loader-minecraft': {
    mode: 'native-loader-minecraft',
    label: 'Minecraft + Native Loader',
    shortLabel: 'Native Loader',
    detail: 'Uses the official Minecraft Launcher with ECHO Native Loader metadata for the selected pack.',
    steps: ['Approved install package', 'Native Loader metadata', 'Minecraft Launcher'],
  },
  'native-runtime': {
    mode: 'native-runtime',
    label: 'ECHO Standalone Engine',
    shortLabel: 'Standalone',
    detail: 'Runs the ECHO standalone engine for packs that do not use Minecraft, NeoForge, or Native Loader.',
    steps: ['Runtime package', 'Standalone checks', 'ECHO engine'],
  },
}

export function getAshfallHomeRoute(profile: Pick<LauncherProfile, 'runtimeMode'>): AshfallHomeRoute {
  return homeRoutes[profile.runtimeMode ?? 'neoforge-minecraft']
}

function versionParts(version: string) {
  const normalized = version.trim().replace(/^v/i, '')
  const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return null

  return [
    Number(match[1] ?? 0),
    Number(match[2] ?? 0),
    Number(match[3] ?? 0),
  ]
}

function isNewerVersion(candidate: string, current: string) {
  const candidateParts = versionParts(candidate)
  const currentParts = versionParts(current)
  if (!candidateParts || !currentParts) return false

  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] > currentParts[index]) return true
    if (candidateParts[index] < currentParts[index]) return false
  }

  return false
}

export function getAshfallHomeActions(profile: HomeActionProfile, latestRelease: HomeActionRelease): AshfallHomeActions {
  const needsInstall = profile.status !== 'healthy' || !profile.installPath
  const needsUpdate = !needsInstall && Boolean(latestRelease?.version && isNewerVersion(latestRelease.version, profile.version))
  const route = getAshfallHomeRoute(profile)
  const primaryActionKind: AshfallHomeActionKind = needsInstall
    ? 'install'
    : needsUpdate
      ? 'update'
      : route.mode === 'native-runtime'
        ? 'launch-standalone'
        : 'play'

  return {
    needsInstall,
    needsUpdate,
    primaryActionKind,
    primaryActionLabel:
      primaryActionKind === 'install'
        ? latestRelease?.version
          ? `Install Ashfall ${latestRelease.version}`
          : 'Install Ashfall'
        : primaryActionKind === 'update'
          ? latestRelease?.version
            ? `Update Ashfall ${latestRelease.version}`
            : 'Update Ashfall'
          : primaryActionKind === 'launch-standalone'
            ? 'Launch Standalone'
            : 'Play Ashfall',
    primaryBusyLabel: primaryActionKind === 'install' ? 'Installing...' : primaryActionKind === 'update' ? 'Updating...' : 'Launching...',
    primaryUsesInstallFlow: primaryActionKind === 'install',
    updateActionLabel: null,
  }
}
