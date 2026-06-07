import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  tone?: 'default' | 'cyan' | 'amber' | 'danger' | 'success'
}

const toneClasses = {
  default: 'border-cyan-soft/20',
  cyan: 'border-cyan-echo/40 shadow-cyber',
  amber: 'border-amber-echo/50 shadow-amber',
  danger: 'border-danger-echo/50 shadow-danger',
  success: 'border-success-echo/40',
}

export function GlassCard({ children, className, tone = 'default', ...props }: GlassCardProps) {
  return (
    <div className={cn('cyber-panel overflow-hidden rounded-xl p-4', toneClasses[tone], className)} {...props}>
      {children}
    </div>
  )
}
