import * as Switch from '@radix-ui/react-switch'
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  action?: ReactNode
}

export function ToggleRow({ label, description, checked, disabled, onCheckedChange, action }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {action}
        <Switch.Root
          aria-label={label}
          checked={checked}
          className={cn(
            'relative h-6 w-11 rounded-full border transition',
            checked ? 'border-cyan-echo/50 bg-cyan-echo/30' : 'border-slate-500/30 bg-slate-900',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        >
          <Switch.Thumb
            className={cn(
              'block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition',
              checked && 'translate-x-5 bg-cyan-soft',
            )}
          />
        </Switch.Root>
      </div>
    </div>
  )
}
