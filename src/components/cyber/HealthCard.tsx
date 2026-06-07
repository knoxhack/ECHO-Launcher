import type { LucideIcon } from 'lucide-react'
import type { HealthStatus } from '../../types/launcher'
import { StatusChip } from './StatusChip'

interface HealthCardProps {
  icon: LucideIcon
  title: string
  detail: string
  status: HealthStatus
}

export function HealthCard({ icon: Icon, title, detail, status }: HealthCardProps) {
  return (
    <div className="rounded-xl border border-cyan-soft/20 bg-slate-950/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-echo/20 bg-cyan-echo/10 text-cyan-soft">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <StatusChip compact status={status} />
      </div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
    </div>
  )
}
