import type { LauncherProfile } from '../types/profiles'
import type { ReleaseEntry } from '../types/releases'

type HomeActionProfile = Pick<LauncherProfile, 'installPath' | 'status' | 'version'>
type HomeActionRelease = Pick<ReleaseEntry, 'version'> | null | undefined

export interface AshfallHomeActions {
  needsInstall: boolean
  needsUpdate: boolean
  primaryActionLabel: string
  primaryBusyLabel: string
  primaryUsesInstallFlow: boolean
  updateActionLabel: string | null
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

  return {
    needsInstall,
    needsUpdate,
    primaryActionLabel: needsInstall
      ? latestRelease?.version
        ? `Install Ashfall ${latestRelease.version}`
        : 'Install Ashfall'
      : 'Play Ashfall',
    primaryBusyLabel: needsInstall ? 'Installing...' : 'Launching...',
    primaryUsesInstallFlow: needsInstall,
    updateActionLabel: needsUpdate && latestRelease?.version ? `Update Ashfall ${latestRelease.version}` : null,
  }
}
