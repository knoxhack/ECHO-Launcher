import ashfallCardImage from '../assets/modpacks/ashfall-card.webp'
import orbitalCardImage from '../assets/modpacks/orbital-card.webp'
import type { OfficialPackId } from '../types/manifests'
import type { ReleaseFeedConfig } from '../types/releases'
import type { LauncherRuntimeModeId } from '../types/standaloneRuntime'

export type OfficialModpackStatus = 'playable' | 'preview'
export type OfficialModpackBetaGate = 'open' | 'metadata' | 'runtime'

export interface OfficialModpack {
  id: OfficialPackId
  name: string
  runtimeMode?: LauncherRuntimeModeId
  betaGate?: OfficialModpackBetaGate
  repo: string
  releaseFeed: ReleaseFeedConfig
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

function githubFeed(repo: string): ReleaseFeedConfig {
  return {
    provider: 'github',
    owner: 'knoxhack',
    repo,
    includePrereleases: true,
  }
}

export const officialModpacks: OfficialModpack[] = [
  {
    id: 'ashfall-native-edition',
    name: 'Ashfall Native Edition',
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'open',
    repo: 'knoxhack/ECHO-Ashfall-Native-Edition',
    releaseFeed: githubFeed('ECHO-Ashfall-Native-Edition'),
    status: 'playable',
    phase: 'Public Alpha',
    version: 'GitHub latest',
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
    runtimeMode: 'native-loader-minecraft',
    betaGate: 'metadata',
    repo: 'knoxhack/ECHO-Ashfall-NeoForge-Edition',
    releaseFeed: githubFeed('ECHO-Ashfall-NeoForge-Edition'),
    status: 'preview',
    phase: 'Release Prep',
    version: 'GitHub latest',
    minecraft: '26.1.2',
    channel: 'alpha',
    summary: 'Minecraft/NeoForge Ashfall distribution built from ECHO module NeoForge jars.',
    detail: 'Uses per-module -neoforge.jar artifacts from ECHO-Modules and NeoForge-specific pack configuration.',
    image: ashfallCardImage,
    moduleCount: 99,
  },
  {
    id: 'ashfall-standalone-edition',
    name: 'Ashfall Standalone Edition',
    runtimeMode: 'native-runtime',
    betaGate: 'runtime',
    repo: 'knoxhack/ECHO-Ashfall-Standalone-Edition',
    releaseFeed: githubFeed('ECHO-Ashfall-Standalone-Edition'),
    status: 'playable',
    phase: 'Experimental Alpha',
    version: 'GitHub latest',
    minecraft: 'Standalone',
    channel: 'experimental',
    summary: 'Standalone Ashfall runtime distribution built from ECHO module standalone jars.',
    detail: 'Downloads Ashfall Standalone Edition packages and provides the non-Minecraft runtime path for Ashfall modules.',
    image: orbitalCardImage,
    moduleCount: 99,
  },
]


