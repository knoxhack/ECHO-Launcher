import type { LauncherProfile } from '../types/profiles'

const CANONICAL_PROFILE_ID = 'ashfall-native-edition'
const LEGACY_PROFILE_IDS = new Set(['ashfall', 'ashfall-stable'])
const ASHFALL_PROFILE_IDS = [
  'ashfall-native-edition',
  'ashfall-neoforge-edition',
  'ashfall-standalone-edition',
  'ashfall-native-loader',
  'ashfall-neoforge',
  'standalone-runtime-showcase',
  'ashfall-standalone-runtime',
]

export interface AshfallInstallPathMigrationInput {
  profiles: LauncherProfile[]
  defaultInstallPath: string
  legacyPrivateInstancesRoot: string
  installedPaths?: string[]
}

function normalizePathForCompare(input?: string) {
  return String(input ?? '').replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

function isInsideOrEqual(root: string, candidate?: string) {
  const normalizedRoot = normalizePathForCompare(root)
  const normalizedCandidate = normalizePathForCompare(candidate)
  return Boolean(normalizedCandidate && (normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)))
}

export function selectAshfallInstallPath(input: AshfallInstallPathMigrationInput) {
  const source =
    input.profiles.find((profile) => profile.id === CANONICAL_PROFILE_ID) ??
    input.profiles.find((profile) => LEGACY_PROFILE_IDS.has(profile.id)) ??
    input.profiles.find((profile) => /ashfall/i.test(profile.name) && !ASHFALL_PROFILE_IDS.includes(profile.id)) ??
    input.profiles[0]

  const installed = new Set((input.installedPaths ?? []).map(normalizePathForCompare))
  const candidates = [
    source?.installPath,
    input.defaultInstallPath,
    `${input.legacyPrivateInstancesRoot}\\Ashfall`,
    `${input.legacyPrivateInstancesRoot}\\Ashfall Protocol Beta`,
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (installed.has(normalizePathForCompare(candidate))) return candidate
  }

  if (source?.installPath && !isInsideOrEqual(input.legacyPrivateInstancesRoot, source.installPath)) {
    return source.installPath
  }

  return input.defaultInstallPath
}

export function normalizeAshfallProfiles(profiles: LauncherProfile[], fallbackProfiles: LauncherProfile[] | LauncherProfile): LauncherProfile[] {
  const fallbacks = Array.isArray(fallbackProfiles) ? fallbackProfiles : [fallbackProfiles]
  const legacySource =
    profiles.find((profile) => profile.id === CANONICAL_PROFILE_ID) ??
    profiles.find((profile) => LEGACY_PROFILE_IDS.has(profile.id)) ??
    profiles.find((profile) => /ashfall/i.test(profile.name) && !ASHFALL_PROFILE_IDS.includes(profile.id)) ??
    profiles[0]

  return fallbacks.map((fallbackProfile) => {
    const source = profiles.find((profile) => profile.id === fallbackProfile.id) ?? (fallbackProfile.id === CANONICAL_PROFILE_ID ? legacySource : undefined)
    return {
      ...fallbackProfile,
      ramGb: source?.ramGb ?? fallbackProfile.ramGb,
      lastPlayed: source?.lastPlayed ?? fallbackProfile.lastPlayed,
      playtime: source?.playtime ?? fallbackProfile.playtime,
      status: source?.status ?? fallbackProfile.status,
      installPath: source?.installPath ?? fallbackProfile.installPath,
      manifestPath: source?.manifestPath ?? fallbackProfile.manifestPath,
      version: source?.version ?? fallbackProfile.version,
      minecraft: source?.minecraft ?? fallbackProfile.minecraft,
      neoforge: source?.neoforge ?? fallbackProfile.neoforge,
      moduleCount: source?.moduleCount ?? fallbackProfile.moduleCount,
      enabledAddons: source?.enabledAddons?.length ? source.enabledAddons : fallbackProfile.enabledAddons,
      id: fallbackProfile.id,
      name: fallbackProfile.name,
      runtimeMode: fallbackProfile.runtimeMode,
      channel: fallbackProfile.channel,
      channelLabel: fallbackProfile.channelLabel,
    }
  })
}
