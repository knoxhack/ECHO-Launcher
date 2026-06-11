import type { LucideIcon } from 'lucide-react'

export type PageId =
  | 'home'
  | 'library'
  | 'community'
  | 'tools'
  | 'settings'

export type LegacyPageId =
  | PageId
  | 'runtime'
  | 'modpacks'
  | 'profiles'
  | 'servers'
  | 'chat'
  | 'ecosystem'
  | 'downloads'
  | 'logs'
  | 'publisher'

export type ToolsTabId = 'repair' | 'export' | 'diagnostics' | 'crash' | 'logs' | 'ecosystem'

export type Channel = 'stable' | 'beta' | 'alpha' | 'nightly' | 'dev-local' | 'experimental' | 'dev'

export type HealthStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'missing'
  | 'update_available'
  | 'operational'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'

export type ToastTone = 'success' | 'warning' | 'danger' | 'info'

export interface NavItem {
  id: PageId
  label: string
  icon: LucideIcon
  requiresAdvanced?: boolean
  requiresCreator?: boolean
}

export interface ToastMessage {
  id: string
  title: string
  detail?: string
  tone: ToastTone
}

export interface NewsItem {
  title: string
  channel: string
  summary: string
  date: string
}

export interface DownloadItem {
  id: string
  fileName: string
  module: string
  version: string
  size: number
  progress: number
  status: Extract<HealthStatus, 'queued' | 'downloading' | 'paused' | 'completed' | 'failed'>
  hashStatus: 'pending' | 'verified' | 'failed'
}

export interface EcosystemModuleRow {
  id: string
  name: string
  installedVersion: string
  latestVersion: string
  status: HealthStatus
  requiredDependencies: string[]
  optionalIntegrations: string[]
  notes: string
}

export interface LauncherSettings {
  theme: 'cyberglass'
  ramGb: number
  selectedProfileId: string
  updateChannel: Channel
  guideMode: boolean
  performancePreset: 'low' | 'balanced' | 'high' | 'cinematic'
}
