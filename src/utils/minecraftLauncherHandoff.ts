export interface EchoMinecraftLauncherProfileMarker {
  managedBy?: string
  profileId?: string
  pack?: string
  channel?: string
  version?: string
  runtimeMode?: string
  runtimeLabel?: string
  updatedAt?: string
}

export interface MinecraftLauncherProfileShape {
  name?: string
  type?: string
  created?: string
  lastUsed?: string
  lastVersionId?: string
  gameDir?: string
  javaArgs?: string
  echoManaged?: boolean
  echoLauncher?: EchoMinecraftLauncherProfileMarker
}

export interface MinecraftLauncherProfilesDocument {
  profiles?: Record<string, MinecraftLauncherProfileShape>
  settings?: Record<string, unknown>
  version?: number
  [key: string]: unknown
}

export interface MinecraftLauncherVersionValidationExpected {
  versionId: string
  inheritsFrom: string
  mainClass: string
}

export interface MinecraftLauncherVersionValidationResult {
  valid: boolean
  source: 'installed' | 'echo-managed' | 'invalid'
  reason?: string
}

export interface UpsertEchoMinecraftProfileInput {
  profileKey: string
  profileName: string
  echoProfileId: string
  runtimeMode?: 'neoforge-minecraft' | 'native-loader-minecraft'
  runtimeLabel?: string
  pack: string
  channel: string
  packVersion: string
  minecraftVersionId: string
  gameDir: string
  ramGb: number
  timestamp: string
}

export interface CleanupConflictingNeoForgeProfilesInput {
  profileKey: string
  minecraftVersionId: string
  gameDir: string
}

export interface CleanupConflictingNeoForgeProfilesResult {
  document: MinecraftLauncherProfilesDocument
  removedProfiles: string[]
  warnings: string[]
}

export interface MinecraftLauncherProfileReadinessInput {
  profileKey: string
  minecraftVersionId: string
  gameDir: string
}

export interface EchoBootstrapVersionInput {
  versionId: string
  minecraftVersion: string
  loaderVersion: string
  pack: string
  packVersion: string
  channel: string
  timestamp: string
}

export function echoMinecraftLauncherProfileId(profileId: string, runtimeMode: 'neoforge-minecraft' | 'native-loader-minecraft' = 'neoforge-minecraft') {
  const safeId = profileId.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const baseId = `echo-${safeId || 'profile'}`
  return runtimeMode === 'native-loader-minecraft' && !baseId.endsWith('-native-loader') ? `${baseId}-native-loader` : baseId
}

export function isReservedEchoMinecraftProfileKey(profileKey?: string) {
  return profileKey === echoMinecraftLauncherProfileId('ashfall-neoforge') || profileKey === echoMinecraftLauncherProfileId('ashfall')
}

export function deriveMinecraftLauncherVersionId(loaderVersion: string, explicitVersionId?: string) {
  return explicitVersionId?.trim() || `neoforge-${loaderVersion}`
}

export function buildEchoBootstrapVersionManifest(input: EchoBootstrapVersionInput) {
  return {
    id: input.versionId,
    inheritsFrom: input.minecraftVersion,
    type: 'release',
    time: input.timestamp,
    releaseTime: input.timestamp,
    mainClass: 'cpw.mods.bootstraplauncher.BootstrapLauncher',
    arguments: {
      game: [],
      jvm: [],
    },
    libraries: [],
    echoLauncher: {
      managedBy: 'ECHO Launcher',
      bootstrap: true,
      pack: input.pack,
      channel: input.channel,
      version: input.packVersion,
      loader: 'neoforge',
      loaderVersion: input.loaderVersion,
      note: 'Bootstrap metadata created so the official Minecraft Launcher can see the ECHO-managed profile. Production releases should provide a verified NeoForge installer artifact.',
    },
  }
}

export function isEchoManagedMinecraftProfile(profile?: MinecraftLauncherProfileShape, profileKey?: string) {
  return profile?.echoManaged === true || profile?.echoLauncher?.managedBy === 'ECHO Launcher' || isReservedEchoMinecraftProfileKey(profileKey)
}

export function normalizeMinecraftLauncherGameDir(input?: string) {
  const value = String(input ?? '').trim()
  if (!value) return ''
  return value.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

export function sameMinecraftLauncherGameDir(left?: string, right?: string) {
  return normalizeMinecraftLauncherGameDir(left) === normalizeMinecraftLauncherGameDir(right)
}

export function isGenericNeoForgeLauncherProfile(profileKey: string, profile: MinecraftLauncherProfileShape | undefined, minecraftVersionId: string) {
  const key = profileKey.toLowerCase()
  const name = String(profile?.name ?? '').trim().toLowerCase()
  const versionId = minecraftVersionId.toLowerCase()
  const loaderVersion = versionId.replace(/^neoforge-/u, '')
  const genericNames = new Set(['neoforge', versionId, loaderVersion, `neoforge ${loaderVersion}`, `neoforge-${loaderVersion}`])

  return (
    key === versionId ||
    key === loaderVersion ||
    key.startsWith('neoforge-') ||
    genericNames.has(name) ||
    name.startsWith('neoforge ') ||
    name.startsWith('neoforge-') ||
    (!name && profile?.type === 'custom')
  )
}

export function cleanupConflictingNeoForgeLauncherProfiles(
  document: MinecraftLauncherProfilesDocument | undefined,
  input: CleanupConflictingNeoForgeProfilesInput,
): CleanupConflictingNeoForgeProfilesResult {
  const normalized = normalizeMinecraftLauncherProfiles(document)
  const profiles = { ...normalized.profiles }
  const removedProfiles: string[] = []
  const warnings: string[] = []

  for (const [profileKey, profile] of Object.entries(normalized.profiles)) {
    if (profileKey === input.profileKey) continue
    if (profile?.lastVersionId !== input.minecraftVersionId) continue
    if (sameMinecraftLauncherGameDir(profile.gameDir, input.gameDir)) continue

    const label = profile.name?.trim() || profileKey
    if (isEchoManagedMinecraftProfile(profile, profileKey)) {
      warnings.push(`Another ECHO-managed Minecraft Launcher profile '${label}' uses ${input.minecraftVersionId} with a different game directory.`)
      continue
    }

    if (isGenericNeoForgeLauncherProfile(profileKey, profile, input.minecraftVersionId)) {
      delete profiles[profileKey]
      removedProfiles.push(label)
      continue
    }

    warnings.push(`Another Minecraft Launcher profile '${label}' uses ${input.minecraftVersionId} without the Ashfall game directory. ECHO left it untouched.`)
  }

  return {
    document: {
      ...normalized,
      profiles,
    },
    removedProfiles,
    warnings,
  }
}

export function validateEchoMinecraftProfileReadiness(document: MinecraftLauncherProfilesDocument | undefined, input: MinecraftLauncherProfileReadinessInput) {
  const normalized = normalizeMinecraftLauncherProfiles(document)
  const profile = normalized.profiles[input.profileKey]
  const warnings: string[] = []

  if (!profile) {
    warnings.push(`Minecraft Launcher profile '${input.profileKey}' was not written.`)
  } else {
    if (profile.lastVersionId !== input.minecraftVersionId) {
      warnings.push(`Minecraft Launcher profile '${input.profileKey}' uses '${profile.lastVersionId ?? 'missing'}' instead of '${input.minecraftVersionId}'.`)
    }
    if (!sameMinecraftLauncherGameDir(profile.gameDir, input.gameDir)) {
      warnings.push(`Minecraft Launcher profile '${input.profileKey}' game directory is '${profile.gameDir ?? 'missing'}' instead of '${input.gameDir}'.`)
    }
  }

  return {
    ok: warnings.length === 0,
    warnings,
  }
}

export function manifestModJarPaths(manifest: { files?: Array<{ path?: string; required?: boolean }> }) {
  return (manifest.files ?? [])
    .filter((file) => file.required !== false)
    .map((file) => String(file.path ?? '').replace(/\\/g, '/'))
    .filter((filePath) => /^mods\/.+\.jar$/iu.test(filePath))
}

export function validateMinecraftLauncherVersionMetadata(document: unknown, expected: MinecraftLauncherVersionValidationExpected): MinecraftLauncherVersionValidationResult {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { valid: false, source: 'invalid', reason: 'version metadata is not an object' }
  }
  const version = document as {
    id?: unknown
    inheritsFrom?: unknown
    mainClass?: unknown
    arguments?: unknown
    libraries?: unknown
    assetIndex?: unknown
    assets?: unknown
    downloads?: unknown
    jar?: unknown
    logging?: unknown
    minecraftArguments?: unknown
    echoLauncher?: { managedBy?: unknown; bootstrap?: unknown }
  }
  if (version.echoLauncher?.bootstrap === true) {
    return { valid: false, source: 'invalid', reason: 'metadata is bootstrap-only' }
  }
  for (const key of ['assetIndex', 'assets', 'downloads', 'jar', 'logging', 'minecraftArguments'] as const) {
    if (Object.prototype.hasOwnProperty.call(version, key) && version[key] == null) {
      return { valid: false, source: 'invalid', reason: `${key} is null` }
    }
  }
  if (version.id !== expected.versionId) {
    return { valid: false, source: 'invalid', reason: `id is '${String(version.id ?? 'missing')}'` }
  }
  if (version.inheritsFrom !== expected.inheritsFrom) {
    return { valid: false, source: 'invalid', reason: `inheritsFrom is '${String(version.inheritsFrom ?? 'missing')}'` }
  }
  if (version.mainClass !== expected.mainClass) {
    return { valid: false, source: 'invalid', reason: `mainClass is '${String(version.mainClass ?? 'missing')}'` }
  }
  if (!version.arguments || typeof version.arguments !== 'object' || Array.isArray(version.arguments)) {
    return { valid: false, source: 'invalid', reason: 'arguments are missing' }
  }
  if (!Array.isArray(version.libraries) || version.libraries.length === 0) {
    return { valid: false, source: 'invalid', reason: 'libraries are missing' }
  }
  return {
    valid: true,
    source: version.echoLauncher?.managedBy === 'ECHO Launcher' ? 'echo-managed' : 'installed',
  }
}

export function normalizeMinecraftLauncherProfiles(document?: MinecraftLauncherProfilesDocument): Required<Pick<MinecraftLauncherProfilesDocument, 'profiles' | 'settings' | 'version'>> & MinecraftLauncherProfilesDocument {
  return {
    ...document,
    profiles: document?.profiles ?? {},
    settings: document?.settings ?? {},
    version: document?.version ?? 3,
  }
}

export function upsertEchoMinecraftProfile(document: MinecraftLauncherProfilesDocument | undefined, input: UpsertEchoMinecraftProfileInput) {
  const normalized = normalizeMinecraftLauncherProfiles(document)
  const existing = normalized.profiles[input.profileKey]

  if (existing && !isEchoManagedMinecraftProfile(existing, input.profileKey)) {
    throw new Error(`Minecraft Launcher profile ${input.profileKey} exists but is not ECHO-managed.`)
  }

  return {
    ...normalized,
    profiles: {
      ...normalized.profiles,
      [input.profileKey]: {
        ...existing,
        name: input.profileName,
        type: 'custom',
        created: existing?.created ?? input.timestamp,
        lastUsed: input.timestamp,
        lastVersionId: input.minecraftVersionId,
        gameDir: input.gameDir,
        javaArgs: `-Xmx${input.ramGb}G`,
        echoManaged: true,
        echoLauncher: {
          managedBy: 'ECHO Launcher',
          profileId: input.echoProfileId,
          pack: input.pack,
          channel: input.channel,
          version: input.packVersion,
          runtimeMode: input.runtimeMode ?? 'neoforge-minecraft',
          runtimeLabel: input.runtimeLabel ?? 'NeoForge + Minecraft',
          updatedAt: input.timestamp,
        },
      },
    },
  }
}
