import ashfallCardImage from '../assets/modpacks/ashfall-card.webp'
import orbitalCardImage from '../assets/modpacks/orbital-card.webp'
import type { OfficialPackId } from '../types/manifests'
import type { ReleaseEntry, ReleaseIndex, ReleaseIndexChannelPack } from '../types/releases'
import type { LauncherRuntimeModeId } from '../types/standaloneRuntime'

export type OfficialModpackStatus = 'playable' | 'preview'
export type OfficialModpackBetaGate = 'open' | 'metadata' | 'runtime'

export interface OfficialModpack {
  id: OfficialPackId
  name: string
  runtimeMode?: LauncherRuntimeModeId
  betaGate?: OfficialModpackBetaGate
  catalogId: OfficialPackId
  status: OfficialModpackStatus
  phase: string
  version: string
  minecraft: string
  channel: string
  summary: string
  detail: string
  image: string
  moduleCount: number | null
  catalogStatus?: string
  diagnostic?: string
  sourceRepo?: string
}

const packFallbacks: OfficialModpack[] = [
  {
    id: 'ashfall-native-edition',
    name: 'Ashfall Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'open',
    catalogId: 'ashfall-native-edition',
    status: 'playable',
    phase: 'Public Alpha',
    version: 'Catalog latest',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'The main playable Ashfall experience through ECHO Native Loader.',
    detail: 'Primary public alpha entrypoint. Uses the Release Index manifest, verifies SHA-256 hashes, and launches through ECHO Native Loader.',
    image: ashfallCardImage,
    moduleCount: 33,
  },
  {
    id: 'ashfall-neoforge-edition',
    name: 'Ashfall NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    betaGate: 'metadata',
    catalogId: 'ashfall-neoforge-edition',
    status: 'preview',
    phase: 'Release Prep',
    version: 'Catalog latest',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Minecraft/NeoForge Ashfall distribution built from approved Catalog install packages.',
    detail: 'Uses Catalog-selected NeoForge package artifacts and NeoForge-specific pack configuration.',
    image: ashfallCardImage,
    moduleCount: 33,
  },
  {
    id: 'ashfall-standalone-edition',
    name: 'Ashfall Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'runtime',
    catalogId: 'ashfall-standalone-edition',
    status: 'playable',
    phase: 'Experimental Alpha',
    version: 'Catalog latest',
    minecraft: 'Standalone',
    channel: 'experimental',
    summary: 'Standalone Ashfall runtime distribution built from approved runtime install packages.',
    detail: 'Downloads Ashfall Standalone Edition packages and provides the non-Minecraft runtime path for Ashfall modules.',
    image: orbitalCardImage,
    moduleCount: 33,
  },
  {
    id: 'sky-relay-native-edition',
    name: 'Sky Relay Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'open',
    catalogId: 'sky-relay-native-edition',
    status: 'preview',
    phase: 'Release Index Required',
    version: 'Catalog pending',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Floating-island relay recovery built for the ECHO Native Loader path.',
    detail: 'Installs from the approved Sky Relay Release Index entry when strict assets are available.',
    image: orbitalCardImage,
    moduleCount: 12,
  },
  {
    id: 'sky-relay-neoforge-edition',
    name: 'Sky Relay NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    betaGate: 'open',
    catalogId: 'sky-relay-neoforge-edition',
    status: 'preview',
    phase: 'Release Index Required',
    version: 'Catalog pending',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Minecraft/NeoForge Sky Relay distribution for modded-client validation.',
    detail: 'Installs from the approved Sky Relay NeoForge Release Index entry when strict assets are available.',
    image: orbitalCardImage,
    moduleCount: 12,
  },
  {
    id: 'sky-relay-standalone-edition',
    name: 'Sky Relay Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'open',
    catalogId: 'sky-relay-standalone-edition',
    status: 'preview',
    phase: 'Release Index Required',
    version: 'Catalog pending',
    minecraft: 'Standalone',
    channel: 'alpha',
    summary: 'Standalone runtime track for Sky Relay progression, fragments, and system contracts.',
    detail: 'Installs from the approved Sky Relay Standalone Release Index entry when strict assets are available.',
    image: orbitalCardImage,
    moduleCount: 12,
  },
  {
    id: 'openlands-native-edition',
    name: 'Openlands Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'metadata',
    catalogId: 'openlands-native-edition',
    status: 'preview',
    phase: 'Unpublished',
    version: 'No release yet',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Official planned Openlands native-loader family.',
    detail: 'Visible as an official planned pack. It unlocks after the source repository publishes strict Release Index assets.',
    image: orbitalCardImage,
    moduleCount: 1,
    catalogStatus: 'unpublished',
  },
  {
    id: 'openlands-neoforge-edition',
    name: 'Openlands NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    betaGate: 'metadata',
    catalogId: 'openlands-neoforge-edition',
    status: 'preview',
    phase: 'Unpublished',
    version: 'No release yet',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Official planned Openlands NeoForge family.',
    detail: 'Visible as an official planned pack. It unlocks after the source repository publishes strict Release Index assets.',
    image: orbitalCardImage,
    moduleCount: 1,
    catalogStatus: 'unpublished',
  },
  {
    id: 'openlands-standalone-edition',
    name: 'Openlands Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'runtime',
    catalogId: 'openlands-standalone-edition',
    status: 'preview',
    phase: 'Unpublished',
    version: 'No release yet',
    minecraft: 'Standalone',
    channel: 'experimental',
    summary: 'Official planned Openlands standalone runtime family.',
    detail: 'Visible as an official planned pack. It unlocks after the source repository publishes strict Release Index assets.',
    image: orbitalCardImage,
    moduleCount: 1,
    catalogStatus: 'unpublished',
  },
  {
    id: 'arcana-division-native-edition',
    name: 'Arcana Division Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'open',
    catalogId: 'arcana-division-native-edition',
    status: 'playable',
    phase: 'Beta',
    version: '1.0.0',
    minecraft: '26.1.2',
    channel: 'beta',
    summary: 'Official magical research, ritual, familiar, curse, and rift beta for ECHO Native Loader.',
    detail: 'Checksum-backed beta release with pinned runtime module requirements and the Arcana Division protocol pack root.',
    image: orbitalCardImage,
    moduleCount: 25,
  },
  {
    id: 'arcana-division-neoforge-edition',
    name: 'Arcana Division NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    betaGate: 'open',
    catalogId: 'arcana-division-neoforge-edition',
    status: 'playable',
    phase: 'Beta',
    version: '1.0.0',
    minecraft: '26.1.2',
    channel: 'beta',
    summary: 'NeoForge beta distribution for Arcana Division content, contracts, and gameplay modules.',
    detail: 'Installs the published NeoForge pack archive and validates the beta `.pack.json` manifest from the Release Index.',
    image: orbitalCardImage,
    moduleCount: 25,
  },
  {
    id: 'arcana-division-standalone-edition',
    name: 'Arcana Division Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'open',
    catalogId: 'arcana-division-standalone-edition',
    status: 'playable',
    phase: 'Beta',
    version: '1.0.0',
    minecraft: 'Standalone',
    channel: 'beta',
    summary: 'Standalone runtime beta path for Arcana Division modules and protocol contracts.',
    detail: 'Uses the standalone artifact family and the ECHO standalone runtime lane for non-Minecraft Arcana validation.',
    image: orbitalCardImage,
    moduleCount: 25,
  },
]

export const officialModpacks: OfficialModpack[] = packFallbacks

const fallbackById = new Map<OfficialPackId, OfficialModpack>(packFallbacks.map((pack) => [pack.id, pack]))

function latestReleaseForPack(index: ReleaseIndex, packId: OfficialPackId): ReleaseEntry | null {
  return [...index.releases]
    .filter((release) => release.pack === packId && release.trust === 'verified-metadata' && release.manifestSha256)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null
}

function runtimeModeFor(id: OfficialPackId): LauncherRuntimeModeId {
  if (id.endsWith('-neoforge-edition')) return 'neoforge-minecraft'
  if (id.endsWith('-standalone-edition')) return 'native-runtime'
  return 'native-loader-minecraft'
}

function titleCase(value: string) {
  return value
    .split(/[\s-]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
}

function fallbackName(id: OfficialPackId) {
  return titleCase(id.replace(/-edition$/u, '').replace(/-/gu, ' ')) + ' Edition'
}

function modpackFromChannelPack(pack: ReleaseIndexChannelPack, index: ReleaseIndex): OfficialModpack {
  const fallback = fallbackById.get(pack.id)
  const release = latestReleaseForPack(index, pack.id)
  const catalogStatus = String(pack.catalogStatus ?? (release ? 'approved' : '')).toLowerCase()
  const locked = ['unpublished', 'warning', 'rejected', 'blocked'].includes(catalogStatus)
  const status: OfficialModpackStatus = !locked && release ? 'playable' : 'preview'
  const diagnostic = pack.diagnostic ?? (locked ? fallback?.diagnostic : undefined)

  return {
    id: pack.id,
    name: pack.name || fallback?.name || fallbackName(pack.id),
    runtimeMode: fallback?.runtimeMode ?? runtimeModeFor(pack.id),
    betaGate: status === 'playable' ? 'open' : fallback?.betaGate ?? 'metadata',
    catalogId: pack.id,
    status,
    phase: locked ? 'Unpublished' : release ? `Approved ${titleCase(release.channel)}` : fallback?.phase ?? 'Awaiting Release',
    version: release?.version ?? (locked ? 'No release yet' : fallback?.version ?? 'Catalog pending'),
    minecraft: fallback?.minecraft ?? (pack.id.endsWith('-standalone-edition') ? 'Standalone' : '26.1.2'),
    channel: release?.channel ?? pack.channel ?? fallback?.channel ?? 'alpha',
    summary: fallback?.summary ?? `${pack.name || fallbackName(pack.id)} from the official Release Index catalog.`,
    detail: diagnostic ?? fallback?.detail ?? 'This pack appears in channel metadata and unlocks after approved strict release assets are available.',
    image: fallback?.image ?? orbitalCardImage,
    moduleCount: fallback?.moduleCount ?? null,
    catalogStatus: pack.catalogStatus,
    diagnostic,
    sourceRepo: pack.repoUrl,
  }
}

export function officialModpacksFromReleaseIndex(index: ReleaseIndex | null | undefined): OfficialModpack[] {
  if (!index?.packs?.length) return officialModpacks
  return index.packs.map((pack) => modpackFromChannelPack(pack, index))
}
