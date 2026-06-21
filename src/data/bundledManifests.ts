import type {
  AddonManifest,
  AssetManifest,
  ConfigManifest,
  DependencyManifest,
  PackManifest,
  ReleaseManifest,
  ServerManifest,
} from '../types/manifests'

export const bundledPackManifest: PackManifest = {
  pack: 'ashfall-native-edition',
  name: 'Ashfall Native Edition',
  version: 'Catalog latest',
  channel: 'beta',
  minecraft: '26.1.2',
  minecraftVersion: '26.1.2',
  artifactMode: 'zip',
  artifactName: '',
  artifactSha256: '',
  loader: {
    type: 'neoforge',
    version: '26.1.2.43-beta',
    minecraftLauncherVersionId: 'neoforge-26.1.2.43-beta',
  },
  runtime: {
    requiredJava: '25+',
    minecraftVersion: '26.1.2',
    assetIndex: '26.1.2',
  },
  launch: {
    mainClass: 'net.neoforged.fml.startup.Client',
    gameArgs: [],
    jvmArgs: [],
  },
  modules: [],
  files: [],
  changelog: [
    'Ashfall Native Edition installs only from approved Catalog metadata.',
    'NeoForge packs are intentionally excluded from the public launcher alpha.',
  ],
  worldgenWarning: true,
  ramMb: 6912,
}

export const bundledAddonManifest: AddonManifest = {
  id: 'ashfall-addons',
  name: 'Ashfall Addons',
  version: 'Catalog latest',
  category: 'pack',
  required: true,
  dependencies: [],
  optionalIntegrations: [],
}

export const bundledDependencyManifest: DependencyManifest = {
  moduleId: 'ashfall',
  requires: [],
  recommends: [],
  conflicts: [],
}

export const bundledConfigManifest: ConfigManifest = {
  profileId: 'ashfall-native-edition',
  configFiles: [],
  resettablePaths: ['config/echo'],
}

export const bundledAssetManifest: AssetManifest = {
  moduleId: 'ashfall',
  sounds: [],
  textures: [],
  langFiles: [],
  models: [],
}

export const bundledServerManifest: ServerManifest = {
  profileId: 'ashfall-native-edition',
  neoforgeVersion: 'N/A',
  javaVersion: 'Java 25+',
  includeConfigs: true,
  includeDatapacks: true,
  clientCompatibilityManifest: true,
}

export const bundledReleaseManifest: ReleaseManifest = {
  version: 'Catalog latest',
  channel: 'beta',
  releasedAt: '',
  manifestUrl: '',
  sha256: '',
  notes: bundledPackManifest.changelog,
}
