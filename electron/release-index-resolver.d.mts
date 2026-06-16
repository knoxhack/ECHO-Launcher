import type { OfficialPackId } from '../src/types/manifests'
import type {
  CanonicalProductUpdate,
  CanonicalReleaseIndexEntry,
  ReleaseAsset,
  ReleaseEntry,
} from '../src/types/releases'

export type CanonicalArtifactRecord = {
  role: string
  name: string
  url?: string
  size?: number
  sha256?: string
  buildMode?: string
  artifactRole?: string
  manualInstall?: boolean
  developerDirectDownload?: boolean
  launcherFacing?: boolean
  moduleArtifact?: boolean
  packContent?: boolean
}

export type EchoProtocolRequest =
  | { rawUrl: string; action: 'install-addon'; id: string; pack?: OfficialPackId }
  | { rawUrl: string; action: 'update-pack'; id: string }

export type ResolvedEchoProtocolEntry = EchoProtocolRequest & {
  entry: CanonicalReleaseIndexEntry
  packEntry?: CanonicalReleaseIndexEntry
  dependencies: CanonicalReleaseIndexEntry[]
  artifact: ReleaseAsset
}

export declare const officialPackIds: OfficialPackId[]

export declare function normalizeOfficialPackId(pack?: string | null): OfficialPackId | undefined

export declare function assertSelectedManifestPack<T>(
  manifest: T,
  selectedPack?: string | null,
  options?: { displayName?: (pack: string) => string },
): T

export declare function canonicalArtifactRecords(artifacts: unknown): CanonicalArtifactRecord[]

export declare function installableArtifactRecords(artifacts: unknown): CanonicalArtifactRecord[]

export declare function artifactForPackTarget(entry: CanonicalReleaseIndexEntry, pack: string): CanonicalArtifactRecord | null

export declare function dependencyClosure(entries: CanonicalReleaseIndexEntry[], rootIds: string[]): CanonicalReleaseIndexEntry[]

export declare function parseEchoProtocolUrl(rawUrl: string): EchoProtocolRequest | null

export declare function packManifestArtifact(entry: CanonicalReleaseIndexEntry): CanonicalArtifactRecord | null

export declare function packArchiveArtifact(entry: CanonicalReleaseIndexEntry): CanonicalArtifactRecord | null

export declare function isInstallableModpackEntry(entry: CanonicalReleaseIndexEntry): boolean

export declare function resolveEchoProtocolEntry(rawUrl: string, entries: CanonicalReleaseIndexEntry[]): ResolvedEchoProtocolEntry | null

export declare function releaseEntryFromCanonicalModpack(entry: CanonicalReleaseIndexEntry, fetchedAt: string): ReleaseEntry | null

export declare function productUpdateArtifact(entry: CanonicalReleaseIndexEntry, compatibility?: string): ReleaseAsset | null

export declare function productUpdateEntry(entries: CanonicalReleaseIndexEntry[], id: string, compatibility?: string): CanonicalReleaseIndexEntry | null

export declare function productUpdateSelection(entries: CanonicalReleaseIndexEntry[], id: string, compatibility?: string): CanonicalProductUpdate
