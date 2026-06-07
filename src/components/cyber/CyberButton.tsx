import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../utils/cn'

interface CyberButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  icon?: LucideIcon
  variant?: 'primary' | 'secondary' | 'ghost' | 'warning' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary:
    'bg-cyan-echo text-slate-950 border-cyan-echo shadow-[0_0_24px_rgba(37,232,255,0.22)] hover:bg-cyan-soft hover:shadow-[0_0_30px_rgba(37,232,255,0.28)] disabled:shadow-none',
  secondary:
    'bg-cyan-echo/10 text-cyan-soft border-cyan-echo/30 shadow-[inset_0_0_18px_rgba(37,232,255,0.06)] hover:bg-cyan-echo/20 hover:text-white',
  ghost: 'bg-white/[0.045] text-slate-200 border-cyan-echo/15 hover:bg-cyan-echo/10 hover:text-white',
  warning:
    'bg-amber-echo/10 text-amber-echo border-amber-echo/40 hover:bg-amber-echo/20',
  danger:
    'bg-danger-echo/10 text-red-100 border-danger-echo/50 hover:bg-danger-echo/20',
  success:
    'bg-success-echo/10 text-success-echo border-success-echo/40 hover:bg-success-echo/20',
}

const sizes = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-14 px-6 text-base',
}

export function CyberButton({
  children,
  icon: Icon,
  className,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: CyberButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition duration-150 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
        variants[variant],
        sizes[size],
        className,
      )}
      type={type}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
      <span>{children}</span>
    </button>
  )
}
