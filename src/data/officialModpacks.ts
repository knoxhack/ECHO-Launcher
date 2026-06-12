import ashfallCardImage from '../assets/modpacks/ashfall-card.webp'
import orbitalCardImage from '../assets/modpacks/orbital-card.webp'
import type { OfficialPackId } from '../types/manifests'
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
}

export const officialModpacks: OfficialModpack[] = [
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
    detail: 'Primary public alpha entrypoint. Uses the new release manifest, verifies SHA-256 hashes, and launches through the ECHO Native Loader.',
    image: ashfallCardImage,
    moduleCount: 99,
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
    moduleCount: 99,
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
    moduleCount: 99,
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
    detail: 'Checksum-backed beta release with 24 pinned runtime module requirements and the Arcana Division protocol pack root.',
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
    detail: 'Installs the published NeoForge pack archive and validates the beta .pack.json manifest from the Release Index.',
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


