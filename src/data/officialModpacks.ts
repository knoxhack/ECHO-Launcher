import arcanaDivisionFamilyImage from '../assets/modpacks/families/arcana-division-family.png'
import ashfallFamilyImage from '../assets/modpacks/families/ashfall-family.png'
import galacticSurveyFamilyImage from '../assets/modpacks/families/galactic-survey-family.png'
import openlandsFamilyImage from '../assets/modpacks/families/openlands-family.png'
import orbitalCardImage from '../assets/modpacks/orbital-card.webp'
import skyRelayFamilyImage from '../assets/modpacks/families/sky-relay-family.png'
import type { OfficialPackId } from '../types/manifests'
import type { ReleaseEntry, ReleaseIndex, ReleaseIndexChannelPack } from '../types/releases'
import type { LauncherRuntimeModeId } from '../types/standaloneRuntime'
import { normalizeOfficialPackId } from '../../electron/release-index-resolver.mjs'

export type OfficialModpackStatus = 'playable' | 'preview'
export type OfficialModpackBetaGate = 'open' | 'metadata' | 'runtime'
export type OfficialModpackFamilyId = 'ashfall' | 'sky-relay' | 'openlands' | 'galactic-survey' | 'arcana-division'

export interface OfficialModpackFamily {
  id: OfficialModpackFamilyId
  name: string
  order: number
  artwork: string
  summary: string
}

export interface OfficialModpack {
  id: OfficialPackId
  name: string
  familyId: OfficialModpackFamilyId
  familyName: string
  familyOrder: number
  familyArtwork: string
  runtimeLaneLabel: string
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

type OfficialModpackSeed = Omit<OfficialModpack, 'familyId' | 'familyName' | 'familyOrder' | 'familyArtwork' | 'runtimeLaneLabel'>

export const officialModpackFamilies: OfficialModpackFamily[] = [
  {
    id: 'ashfall',
    name: 'Ashfall',
    order: 10,
    artwork: ashfallFamilyImage,
    summary: 'Survival paths through ash storms, native loader validation, and isolated runtime profiles.',
  },
  {
    id: 'sky-relay',
    name: 'Sky Relay',
    order: 20,
    artwork: skyRelayFamilyImage,
    summary: 'Floating-island relay recovery across native, NeoForge, and standalone lanes.',
  },
  {
    id: 'openlands',
    name: 'Openlands',
    order: 30,
    artwork: openlandsFamilyImage,
    summary: 'Open frontier exploration lanes with checksum-backed public alpha assets.',
  },
  {
    id: 'galactic-survey',
    name: 'Galactic Survey',
    order: 40,
    artwork: galacticSurveyFamilyImage,
    summary: 'Probe routes, survey arrays, salvage logistics, and atlas restoration.',
  },
  {
    id: 'arcana-division',
    name: 'Arcana Division',
    order: 50,
    artwork: arcanaDivisionFamilyImage,
    summary: 'Arcane research, ritual containment, familiars, curses, and rift contracts.',
  },
]

const familyById = new Map(officialModpackFamilies.map((family) => [family.id, family]))

const packFallbackSeeds: OfficialModpackSeed[] = [
  {
    id: 'ashfall-native-edition',
    name: 'Ashfall Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'open',
    catalogId: 'ashfall-native-edition',
    status: 'playable',
    phase: 'Beta',
    version: '0.1.0',
    minecraft: '26.1.2',
    channel: 'beta',
    summary: 'Ashfall Native beta assets are checksum-backed and launcher-installable.',
    detail: 'Installs the approved Native pack archive and validates the beta `.pack.json` manifest from the Release Index.',
    image: ashfallFamilyImage,
    moduleCount: 33,
    catalogStatus: 'approved',
  },
  {
    id: 'ashfall-neoforge-edition',
    name: 'Ashfall NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    betaGate: 'open',
    catalogId: 'ashfall-neoforge-edition',
    status: 'playable',
    phase: 'Beta',
    version: '0.1.0',
    minecraft: '26.1.2',
    channel: 'beta',
    summary: 'Minecraft/NeoForge Ashfall distribution is checksum-backed and launcher-installable.',
    detail: 'Legacy Ashfall file-backed manifests are normalized by the launcher before install.',
    image: ashfallFamilyImage,
    moduleCount: 33,
    catalogStatus: 'approved',
  },
  {
    id: 'ashfall-standalone-edition',
    name: 'Ashfall Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'open',
    catalogId: 'ashfall-standalone-edition',
    status: 'playable',
    phase: 'Beta',
    version: '0.1.0',
    minecraft: 'Standalone',
    channel: 'beta',
    summary: 'Standalone Ashfall runtime distribution is checksum-backed and launcher-installable.',
    detail: 'Legacy Ashfall file-backed manifests are normalized by the launcher before install.',
    image: ashfallFamilyImage,
    moduleCount: 33,
    catalogStatus: 'approved',
  },
  {
    id: 'ashfall-standalone-engine-edition',
    name: 'Ashfall Standalone Engine Edition',
    runtimeMode: 'standalone-engine',
    betaGate: 'runtime',
    catalogId: 'ashfall-standalone-engine-edition',
    status: 'preview',
    phase: 'Warning Gated',
    version: '2.0.0-beta.2',
    minecraft: 'Standalone',
    channel: 'beta',
    summary: 'Ashfall verification lane for the rewritten ECHO Standalone Engine.',
    detail: 'Installs the warning-gated engine ZIP and validates Java 21, content graph evidence, and strict module files.',
    image: ashfallFamilyImage,
    moduleCount: 18,
    catalogStatus: 'warning',
  },
  {
    id: 'sky-relay-native-edition',
    name: 'Sky Relay Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'open',
    catalogId: 'sky-relay-native-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Floating-island relay recovery built for the ECHO Native Loader path.',
    detail: 'Installs from the approved Sky Relay Release Index entry.',
    image: skyRelayFamilyImage,
    moduleCount: 12,
    catalogStatus: 'approved',
  },
  {
    id: 'sky-relay-neoforge-edition',
    name: 'Sky Relay NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    betaGate: 'open',
    catalogId: 'sky-relay-neoforge-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Minecraft/NeoForge Sky Relay distribution for modded-client validation.',
    detail: 'Installs from the approved Sky Relay NeoForge Release Index entry.',
    image: skyRelayFamilyImage,
    moduleCount: 12,
    catalogStatus: 'approved',
  },
  {
    id: 'sky-relay-standalone-edition',
    name: 'Sky Relay Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'open',
    catalogId: 'sky-relay-standalone-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: 'Standalone',
    channel: 'alpha',
    summary: 'Standalone runtime track for Sky Relay progression, fragments, and system contracts.',
    detail: 'Installs from the approved Sky Relay Standalone Release Index entry.',
    image: skyRelayFamilyImage,
    moduleCount: 12,
    catalogStatus: 'approved',
  },
  {
    id: 'galactic-survey-native-edition',
    name: 'Galactic Survey Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'open',
    catalogId: 'galactic-survey-native-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Long-range survey, probe, route, salvage, and atlas restoration pack for ECHO Native Loader.',
    detail: 'Public alpha GitHub assets are published and indexed for launcher install.',
    image: galacticSurveyFamilyImage,
    moduleCount: 18,
    catalogStatus: 'approved',
  },
  {
    id: 'galactic-survey-neoforge-edition',
    name: 'Galactic Survey NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    betaGate: 'open',
    catalogId: 'galactic-survey-neoforge-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Minecraft/NeoForge lane for Galactic Survey probes, HoloMap routing, orbital salvage, and catalog progression.',
    detail: 'Public alpha GitHub assets are published and indexed for launcher install.',
    image: galacticSurveyFamilyImage,
    moduleCount: 18,
    catalogStatus: 'approved',
  },
  {
    id: 'galactic-survey-standalone-edition',
    name: 'Galactic Survey Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'open',
    catalogId: 'galactic-survey-standalone-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: 'Standalone',
    channel: 'alpha',
    summary: 'Standalone runtime lane for Galactic Survey sector maps, depot logistics, and Survey Array restoration.',
    detail: 'Public alpha GitHub assets are published and indexed for launcher install.',
    image: galacticSurveyFamilyImage,
    moduleCount: 18,
    catalogStatus: 'approved',
  },
  {
    id: 'openlands-native-edition',
    name: 'Openlands Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'open',
    catalogId: 'openlands-native-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Official Openlands native-loader family with checksum-backed alpha assets.',
    detail: 'Installs from the approved Openlands Native Release Index entry.',
    image: openlandsFamilyImage,
    moduleCount: 42,
    catalogStatus: 'approved',
  },
  {
    id: 'openlands-neoforge-edition',
    name: 'Openlands NeoForge Edition',
    runtimeMode: 'neoforge-minecraft',
    betaGate: 'open',
    catalogId: 'openlands-neoforge-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Official Openlands NeoForge family with checksum-backed alpha assets.',
    detail: 'Installs from the approved Openlands NeoForge Release Index entry.',
    image: openlandsFamilyImage,
    moduleCount: 42,
    catalogStatus: 'approved',
  },
  {
    id: 'openlands-standalone-edition',
    name: 'Openlands Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'open',
    catalogId: 'openlands-standalone-edition',
    status: 'playable',
    phase: 'Alpha',
    version: '0.1.0',
    minecraft: 'Standalone',
    channel: 'experimental',
    summary: 'Official Openlands standalone runtime family with checksum-backed alpha assets.',
    detail: 'Installs from the approved Openlands Standalone Release Index entry.',
    image: openlandsFamilyImage,
    moduleCount: 42,
    catalogStatus: 'approved',
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
    image: arcanaDivisionFamilyImage,
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
    image: arcanaDivisionFamilyImage,
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
    image: arcanaDivisionFamilyImage,
    moduleCount: 25,
  },
]

function familyIdForPack(id: OfficialPackId): OfficialModpackFamilyId {
  if (id.startsWith('sky-relay-')) return 'sky-relay'
  if (id.startsWith('openlands-')) return 'openlands'
  if (id.startsWith('galactic-survey-')) return 'galactic-survey'
  if (id.startsWith('arcana-division-')) return 'arcana-division'
  return 'ashfall'
}

function familyForPack(id: OfficialPackId, fallback?: OfficialModpack): OfficialModpackFamily {
  if (fallback) {
    return {
      id: fallback.familyId,
      name: fallback.familyName,
      order: fallback.familyOrder,
      artwork: fallback.familyArtwork,
      summary: familyById.get(fallback.familyId)?.summary ?? fallback.summary,
    }
  }
  return familyById.get(familyIdForPack(id)) ?? officialModpackFamilies[0]
}

export function runtimeLaneLabelFor(mode?: LauncherRuntimeModeId): string {
  if (mode === 'neoforge-minecraft') return 'NeoForge'
  if (mode === 'standalone-engine') return 'Standalone Engine'
  if (mode === 'native-runtime') return 'Standalone'
  return 'Native Loader'
}

function withFamilyMetadata(pack: OfficialModpackSeed): OfficialModpack {
  const family = familyForPack(pack.id)
  return {
    ...pack,
    familyId: family.id,
    familyName: family.name,
    familyOrder: family.order,
    familyArtwork: family.artwork,
    runtimeLaneLabel: runtimeLaneLabelFor(pack.runtimeMode),
  }
}

const packFallbacks: OfficialModpack[] = packFallbackSeeds.map(withFamilyMetadata)

export const officialModpacks: OfficialModpack[] = packFallbacks

const fallbackById = new Map<OfficialPackId, OfficialModpack>(packFallbacks.map((pack) => [pack.id, pack]))

function latestReleaseForPack(index: ReleaseIndex, packId: OfficialPackId): ReleaseEntry | null {
  return [...index.releases]
    .filter((release) => release.pack === packId && release.trust === 'verified-metadata' && release.manifestSha256)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0] ?? null
}

function runtimeModeFor(id: OfficialPackId): LauncherRuntimeModeId {
  if (id.endsWith('-neoforge-edition')) return 'neoforge-minecraft'
  if (id.endsWith('-standalone-engine-edition')) return 'standalone-engine'
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

function phaseForCatalogStatus(status: string, fallback?: OfficialModpack) {
  if (status === 'catalog-mismatch') return 'Catalog Mismatch'
  if (status === 'warning') return 'Warning Gated'
  if (status === 'blocked') return 'Blocked'
  if (status === 'rejected') return 'Rejected'
  if (status === 'unpublished') return 'Unpublished'
  return fallback?.phase ?? 'Awaiting Release'
}

function modpackFromChannelPack(pack: ReleaseIndexChannelPack, index: ReleaseIndex): OfficialModpack {
  const normalizedPackId = (normalizeOfficialPackId(pack.id) ?? pack.id) as OfficialPackId
  const fallback = fallbackById.get(normalizedPackId)
  const release = latestReleaseForPack(index, normalizedPackId)
  const rawCatalogStatus = String(pack.catalogStatus ?? (release ? 'approved' : '')).toLowerCase()
  const approvedWithoutRelease = rawCatalogStatus === 'approved' && !release
  const catalogStatus = approvedWithoutRelease ? 'catalog-mismatch' : rawCatalogStatus
  const locked = ['unpublished', 'rejected', 'blocked', 'catalog-mismatch'].includes(catalogStatus)
    || (catalogStatus === 'warning' && !release)
  const status: OfficialModpackStatus = !locked && release ? 'playable' : 'preview'
  const runtimeMode = fallback?.runtimeMode ?? runtimeModeFor(normalizedPackId)
  const family = familyForPack(normalizedPackId, fallback)
  const diagnostic = approvedWithoutRelease
    ? 'Catalog entry is approved-looking, but no approved release is installable yet.'
    : pack.diagnostic ?? (locked ? fallback?.diagnostic : undefined)
  const releasePhasePrefix = catalogStatus === 'warning' ? 'Warning' : 'Approved'

  return {
    id: normalizedPackId,
    name: pack.name || fallback?.name || fallbackName(normalizedPackId),
    familyId: family.id,
    familyName: family.name,
    familyOrder: family.order,
    familyArtwork: family.artwork,
    runtimeLaneLabel: fallback?.runtimeLaneLabel ?? runtimeLaneLabelFor(runtimeMode),
    runtimeMode,
    betaGate: status === 'playable' ? 'open' : fallback?.betaGate ?? 'metadata',
    catalogId: pack.id,
    status,
    phase: locked ? phaseForCatalogStatus(catalogStatus, fallback) : release ? `${releasePhasePrefix} ${titleCase(release.channel)}` : fallback?.phase ?? 'Awaiting Release',
    version: release?.version ?? (locked ? fallback?.version ?? 'Catalog gated' : fallback?.version ?? 'Catalog pending'),
    minecraft: fallback?.minecraft ?? (normalizedPackId.endsWith('-standalone-edition') || normalizedPackId.endsWith('-standalone-engine-edition') ? 'Standalone' : '26.1.2'),
    channel: release?.channel ?? pack.channel ?? fallback?.channel ?? 'alpha',
    summary: fallback?.summary ?? `${pack.name || fallbackName(normalizedPackId)} from the official Release Index catalog.`,
    detail: diagnostic ?? fallback?.detail ?? 'This pack appears in channel metadata and unlocks after approved strict release assets are available.',
    image: fallback?.image ?? family.artwork ?? orbitalCardImage,
    moduleCount: fallback?.moduleCount ?? null,
    catalogStatus: catalogStatus || pack.catalogStatus,
    diagnostic,
    sourceRepo: pack.repoUrl,
  }
}

export function officialModpacksFromReleaseIndex(index: ReleaseIndex | null | undefined): OfficialModpack[] {
  if (!index?.packs?.length) return officialModpacks
  return index.packs.map((pack) => modpackFromChannelPack(pack, index))
}
