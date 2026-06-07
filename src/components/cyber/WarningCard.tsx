import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { GlassCard } from './GlassCard'

interface WarningCardProps {
  title: string
  text: string
  actions?: ReactNode
  tone?: 'amber' | 'danger'
}

export function WarningCard({ title, text, actions, tone = 'amber' }: WarningCardProps) {
  return (
    <GlassCard tone={tone} className="relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-transparent via-amber-echo to-transparent" />
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-echo/40 bg-amber-echo/10 text-amber-echo">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
          {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    </GlassCard>
  )
}
