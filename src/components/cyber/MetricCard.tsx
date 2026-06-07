import type { LucideIcon } from 'lucide-react'
import { cn } from '../../utils/cn'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'cyan' | 'amber' | 'danger' | 'success'
}

const toneClasses = {
  cyan: 'text-cyan-soft border-cyan-echo/20 bg-cyan-echo/10',
  amber: 'text-amber-echo border-amber-echo/30 bg-amber-echo/10',
  danger: 'text-red-100 border-danger-echo/40 bg-danger-echo/10',
  success: 'text-success-echo border-success-echo/30 bg-success-echo/10',
}

export function MetricCard({ icon: Icon, label, value, tone = 'cyan' }: MetricCardProps) {
  return (
    <div className={cn('rounded-lg border px-3 py-3', toneClasses[tone])}>
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="text-[11px] uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-white">{value}</p>
    </div>
  )
}
