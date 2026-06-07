import type { LucideIcon } from 'lucide-react'
import { StatusChip } from './StatusChip'
import type { HealthStatus } from '../../types/launcher'

interface ModuleCardProps {
  icon: LucideIcon
  name: string
  version: string
  status: HealthStatus
  onClick?: () => void
}

export function ModuleCard({ icon: Icon, name, version, status, onClick }: ModuleCardProps) {
  return (
    <button
      className="glass-surface flex min-h-32 flex-col items-start justify-between rounded-xl p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-echo/40 hover:shadow-cyber"
      onClick={onClick}
      type="button"
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-echo/30 bg-cyan-echo/10 text-cyan-soft">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <StatusChip compact status={status} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-slate-400">v{version}</p>
      </div>
    </button>
  )
}
