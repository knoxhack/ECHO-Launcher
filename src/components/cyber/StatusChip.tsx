import { AlertTriangle, CheckCircle2, CircleDot, DownloadCloud, Pause, XCircle } from 'lucide-react'
import type { HealthStatus } from '../../types/launcher'
import { cn } from '../../utils/cn'
import { statusLabel } from '../../utils/format'

interface StatusChipProps {
  status: HealthStatus
  label?: string
  compact?: boolean
}

const statusClasses: Record<HealthStatus, string> = {
  healthy: 'border-success-echo/40 bg-success-echo/10 text-success-echo',
  operational: 'border-success-echo/40 bg-success-echo/10 text-success-echo',
  warning: 'border-amber-echo/40 bg-amber-echo/10 text-amber-echo',
  critical: 'border-danger-echo/50 bg-danger-echo/10 text-red-100',
  missing: 'border-slate-500/50 bg-slate-500/10 text-slate-300',
  update_available: 'border-cyan-echo/40 bg-cyan-echo/10 text-cyan-soft',
  queued: 'border-slate-400/40 bg-slate-400/10 text-slate-200',
  downloading: 'border-cyan-echo/40 bg-cyan-echo/10 text-cyan-soft',
  paused: 'border-amber-echo/40 bg-amber-echo/10 text-amber-echo',
  completed: 'border-success-echo/40 bg-success-echo/10 text-success-echo',
  failed: 'border-danger-echo/50 bg-danger-echo/10 text-red-100',
}

const dotClasses: Record<HealthStatus, string> = {
  healthy: 'bg-success-echo',
  operational: 'bg-success-echo',
  warning: 'bg-amber-echo',
  critical: 'bg-danger-echo',
  missing: 'bg-slate-400',
  update_available: 'bg-cyan-echo',
  queued: 'bg-slate-400',
  downloading: 'bg-cyan-echo',
  paused: 'bg-amber-echo',
  completed: 'bg-success-echo',
  failed: 'bg-danger-echo',
}

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === 'healthy' || status === 'operational' || status === 'completed') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (status === 'warning' || status === 'paused') return <AlertTriangle className="h-3.5 w-3.5" />
  if (status === 'critical' || status === 'failed') return <XCircle className="h-3.5 w-3.5" />
  if (status === 'downloading') return <DownloadCloud className="h-3.5 w-3.5" />
  if (status === 'queued') return <Pause className="h-3.5 w-3.5" />
  return <CircleDot className="h-3.5 w-3.5" />
}

export function StatusChip({ status, label, compact }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold',
        statusClasses[status],
        compact && 'px-2 py-0.5',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full shadow-[0_0_12px_currentColor]', dotClasses[status])} />
      {!compact ? <StatusIcon status={status} /> : null}
      {label ?? statusLabel(status)}
    </span>
  )
}
