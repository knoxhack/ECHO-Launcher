import type { HealthStatus } from './launcher'

export type LogLevel = 'INFO' | 'WARN' | 'ERROR'

export interface LogEntry {
  id: string
  level: LogLevel
  source: string
  message: string
  timestamp: string
}

export interface DiagnosticCounters {
  healthy: number
  warningModules: number
  warnings: number
  critical: number
  totalChecks: number
  passed: number
  errors: number
}

export interface HealthCheck {
  id: string
  name: string
  status: HealthStatus
  detail: string
}

export interface RepairAction {
  id: string
  title: string
  detail: string
  recommended?: boolean
}

export interface CrashAnalysis {
  title: string
  severity: 'Critical' | 'Warning'
  likelyCause: string
  suggestedFix: string
  signatures?: CrashSignature[]
}

export interface DiagnosticSummary {
  uptime: string
  lastRepair: string
  installLocation: string
  profile: string
}

export interface CrashSignature {
  id: string
  label: string
  severity: 'warning' | 'critical'
  confidence: number
  evidence: string[]
  suggestedFix: string
}

export interface WorldCompatibilityReport {
  ok: boolean
  worldPath: string
  scannedAt: string
  currentWorldgenVersion: string
  profileWorldgenVersion: string
  warnings: string[]
  recommendations: string[]
  markerFiles: string[]
}

export interface AssetValidationReport {
  moduleId: string
  installPath: string
  scannedAt: string
  expected: number
  present: string[]
  missing: string[]
  warnings: string[]
}
