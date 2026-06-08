import type { Channel } from './launcher'

export type LoaderType = 'neoforge' | 'echo-native-loader'
export type FileSide = 'client' | 'server' | 'both'
export type NeoForgeInstallMode = 'client' | 'server'
export type PackArtifactMode = 'files' | 'zip'
export type AshfallRuntimePackId =
  | 'ashfall-native-edition'
  | 'ashfall-neoforge-edition'
  | 'ashfall-standalone-edition'
export type OfficialPackId = AshfallRuntimePackId

export interface LoaderInstaller {
  url?: string
  assetName?: string
  sha256: string
  installMode: NeoForgeInstallMode
}

export interface ManifestLoader {
  type: LoaderType
  version: string
  minecraftLauncherVersionId?: string
  installer?: LoaderInstaller
  versionJson?: unknown
  installProfileJson?: unknown
  libraries?: unknown[]
}

export interface NativeLoaderManifest {
  version: string
  minecraftLauncherVersionId?: string
  versionJson?: unknown
  libraries?: unknown[]
}

export interface ManifestFile {
  path: string
  url?: string
  assetName?: string
  sha256: string
  size: number
  required: boolean
  moduleId: string
  side: FileSide
}

export interface RuntimeManifest {
  requiredJava: string
  minecraftVersion?: string
  assetIndex?: string
}

export interface LaunchManifest {
  mainClass: string
  gameArgs: string[]
  jvmArgs: string[]
}

export interface PackManifest {
  pack: OfficialPackId
  name?: string
  version: string
  channel: Channel
  minecraft: string
  minecraftVersion?: string
  artifactMode?: PackArtifactMode
  artifactName?: string
  artifactSha256?: string
  artifactSize?: number
  loader?: ManifestLoader
  nativeLoader?: NativeLoaderManifest
  runtime?: RuntimeManifest
  launch?: LaunchManifest
  ramMb?: number
  modules: string[]
  files: ManifestFile[]
  changelog: string[]
  worldgenWarning: boolean
}

export interface AddonManifest {
  id: string
  name: string
  version: string
  category: string
  required: boolean
  dependencies: string[]
  optionalIntegrations: string[]
}

export interface DependencyManifest {
  moduleId: string
  requires: string[]
  recommends: string[]
  conflicts: string[]
}

export interface ConfigManifest {
  profileId: string
  configFiles: ManifestFile[]
  resettablePaths: string[]
}

export interface AssetManifest {
  moduleId: string
  sounds: string[]
  textures: string[]
  langFiles: string[]
  models: string[]
}

export interface ServerManifest {
  profileId: string
  neoforgeVersion: string
  javaVersion: string
  includeConfigs: boolean
  includeDatapacks: boolean
  clientCompatibilityManifest: boolean
}

export interface ReleaseManifest {
  version: string
  channel: Channel
  releasedAt: string
  manifestUrl: string
  sha256: string
  notes: string[]
}
