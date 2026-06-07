import type { DiagnosticCounters, DiagnosticSummary, HealthCheck, LogEntry, RepairAction } from '../types/diagnostics'
import type { DownloadItem, NewsItem } from '../types/launcher'

export const bundledNews: NewsItem[] = [
  {
    title: 'Ashfall 1.4.0 - Horizon',
    channel: 'Stable',
    summary: 'Worldgen updates, storm resource pass, and launcher repair metadata.',
    date: 'May 10, 2026',
  },
  {
    title: 'RelicTech v1.0.6 Released',
    channel: 'Module',
    summary: 'Dependency validation and safer relic progression initialization.',
    date: 'May 8, 2026',
  },
  {
    title: 'ECHO Core Patch Notes',
    channel: 'Core',
    summary: 'Manifest compare fixes and improved server compatibility records.',
    date: 'May 6, 2026',
  },
]

export const bundledDownloads: DownloadItem[] = [
  {
    id: 'download-echocore',
    fileName: 'echocore-1.4.0.jar',
    module: 'ECHO Core',
    version: '1.4.0',
    size: 3_612_480,
    progress: 100,
    status: 'completed',
    hashStatus: 'verified',
  },
  {
    id: 'download-weathercore',
    fileName: 'echoweathercore-1.3.2.jar',
    module: 'WeatherCore',
    version: '1.3.2',
    size: 8_912_640,
    progress: 63,
    status: 'downloading',
    hashStatus: 'pending',
  },
  {
    id: 'download-sound-assets',
    fileName: 'echosoundcore-assets.zip',
    module: 'SoundCore',
    version: '1.3.0',
    size: 210_763_776,
    progress: 18,
    status: 'queued',
    hashStatus: 'pending',
  },
  {
    id: 'download-configs',
    fileName: 'ashfall-configs.zip',
    module: 'Ashfall',
    version: '1.4.0',
    size: 2_892_800,
    progress: 100,
    status: 'failed',
    hashStatus: 'failed',
  },
]

export const bundledLogEntries: LogEntry[] = [
  {
    id: 'log-1',
    level: 'ERROR',
    source: 'RuntimeGuard',
    message: 'Missing dependency: echopowergrid required by echorelictech.',
    timestamp: '21:14:06',
  },
  {
    id: 'log-2',
    level: 'WARN',
    source: 'ManifestService',
    message: 'Version mismatch WeatherCore: installed 1.3.2, expected 1.3.4.',
    timestamp: '21:14:03',
  },
  {
    id: 'log-3',
    level: 'INFO',
    source: 'JavaRuntimeService',
    message: 'Java Runtime OK: Eclipse Temurin 25.0.1 detected.',
    timestamp: '21:13:58',
  },
  {
    id: 'log-4',
    level: 'ERROR',
    source: 'NeoForge',
    message: 'Game initialization aborted after dependency graph validation.',
    timestamp: '21:13:52',
  },
  {
    id: 'log-5',
    level: 'WARN',
    source: 'WorldCore',
    message: 'Worldgen data changed since profile Ashfall was created.',
    timestamp: '21:13:41',
  },
  {
    id: 'log-6',
    level: 'INFO',
    source: 'AssetValidator',
    message: 'SoundCore scan complete: 17 expected tracks found, 3 optional tracks missing.',
    timestamp: '21:13:19',
  },
]

export const diagnosticCounters: DiagnosticCounters = {
  healthy: 7,
  warningModules: 2,
  critical: 1,
  totalChecks: 142,
  passed: 118,
  warnings: 19,
  errors: 5,
}

export const healthChecks: HealthCheck[] = [
  { id: 'core', name: 'Core', status: 'healthy', detail: 'Manifest signatures current.' },
  { id: 'terminal', name: 'Terminal', status: 'healthy', detail: 'UI hooks responsive.' },
  { id: 'weather', name: 'WeatherCore', status: 'warning', detail: 'Version mismatch detected.' },
  { id: 'sound', name: 'SoundCore', status: 'healthy', detail: 'Required assets available.' },
  { id: 'relic', name: 'RelicTech', status: 'critical', detail: 'Dependency issue requires repair.' },
  { id: 'tutorial', name: 'TutorialCore', status: 'healthy', detail: 'Guidance graph loaded.' },
  { id: 'java', name: 'Java Runtime', status: 'warning', detail: 'Java 25 preferred for this manifest.' },
]

export const repairActions: RepairAction[] = [
  {
    id: 'repair-install',
    title: 'Repair Install',
    detail: 'Performs a full repair of the installation. Replaces corrupted or missing files, resets core configs, and validates dependencies.',
    recommended: true,
  },
  {
    id: 'quick-repair',
    title: 'Quick Repair',
    detail: 'Checks required files, manifest metadata, and launch-critical configs.',
  },
  {
    id: 'deep-repair',
    title: 'Deep Repair',
    detail: 'Rebuilds local indexes, rechecks all hashes, and stages rollback data.',
  },
  {
    id: 'verify-files',
    title: 'Verify Files',
    detail: 'Scans installed files against the selected Ashfall manifest.',
  },
  {
    id: 'reset-configs',
    title: 'Reset Configs',
    detail: 'Backs up and resets Ashfall, ECHO, WeatherCore, and SoundCore configs.',
  },
]

export const diagnosticSummary: DiagnosticSummary = {
  uptime: '03:42:18',
  lastRepair: 'May 12, 2026, 9:16 PM',
  installLocation: 'C:\\Games\\ECHO\\Instances\\Ashfall',
  profile: 'Ashfall',
}
