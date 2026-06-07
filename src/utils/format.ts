import type { HealthStatus } from '../types/launcher'

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function statusLabel(status: HealthStatus) {
  const labels: Record<HealthStatus, string> = {
    healthy: 'Healthy',
    warning: 'Warning',
    critical: 'Critical',
    missing: 'Missing',
    update_available: 'Update Available',
    operational: 'Operational',
    queued: 'Queued',
    downloading: 'Downloading',
    paused: 'Paused',
    completed: 'Completed',
    failed: 'Failed',
  }
  return labels[status]
}

export function minutesAgo(minutes: number) {
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
