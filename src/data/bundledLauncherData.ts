import type { DiagnosticCounters, DiagnosticSummary, HealthCheck, LogEntry, RepairAction } from '../types/diagnostics'
import type { DownloadItem, NewsItem } from '../types/launcher'

export const bundledNews: NewsItem[] = [
  {
    title: 'Catalog Loading',
    channel: 'Catalog',
    summary: 'Approved releases appear after the ECHO Catalog loads from the Release Index channel.',
    date: 'Pending',
  },
  {
    title: 'No Install Yet',
    channel: 'Library',
    summary: 'Installed loadout details appear after Ashfall is installed or verified.',
    date: 'Pending',
  },
  {
    title: 'Verified Checksums Required',
    channel: 'Install',
    summary: 'Install packages remain blocked until metadata includes SHA-256 URL records.',
    date: 'Pending',
  },
]

export const bundledDownloads: DownloadItem[] = []

export const bundledLogEntries: LogEntry[] = []

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
