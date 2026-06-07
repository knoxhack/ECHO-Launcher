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
    repo: 'knoxhack/ECHO-Native-Platform-Public-Alpha',
    releaseFeed: githubFeed('ECHO-Native-Platform-Public-Alpha'),
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
    id: 'standalone-runtime-showcase',
    name: 'ECHO Standalone Runtime Showcase',
    runtimeMode: 'native-runtime',
    betaGate: 'runtime',
    repo: 'knoxhack/ECHO-Native-Platform-Public-Alpha',
    releaseFeed: githubFeed('ECHO-Native-Platform-Public-Alpha'),
    status: 'playable',
    phase: 'Experimental Alpha',
    version: 'GitHub latest',
    minecraft: 'Standalone',
    channel: 'experimental',
    summary: 'Experimental Standalone Runtime demo and addon testing harness.',
    detail: 'Clearly marked alpha/experimental. Downloads the Standalone Runtime package and provides a sandbox for testing addons outside the Minecraft-hosted environment.',
    image: orbitalCardImage,
    moduleCount: null,
  },
]
