import { cn } from '../../utils/cn'

interface ProgressBarProps {
  value: number
  tone?: 'cyan' | 'amber' | 'danger' | 'success'
  label?: string
}

const fills = {
  cyan: 'from-cyan-dim via-cyan-echo to-cyan-soft',
  amber: 'from-orange-700 via-amber-echo to-yellow-200',
  danger: 'from-red-900 via-danger-echo to-red-200',
  success: 'from-emerald-900 via-success-echo to-emerald-100',
}

export function ProgressBar({ value, tone = 'cyan', label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>{label}</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      ) : null}
      <div className="relative h-2.5 overflow-hidden rounded-full border border-cyan-soft/20 bg-slate-950/70">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', fills[tone])}
          style={{ width: `${clamped}%` }}
        />
        <div className="absolute inset-y-0 w-1/2 animate-scan-progress bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>
    </div>
  )
}
