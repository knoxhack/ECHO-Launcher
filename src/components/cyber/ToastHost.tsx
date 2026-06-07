import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useEffect } from 'react'
import { useLauncherStore } from '../../stores/launcherStore'
import type { ToastTone } from '../../types/launcher'
import { cn } from '../../utils/cn'

const toneClasses: Record<ToastTone, string> = {
  success: 'border-success-echo/40 bg-emerald-950/80 text-success-echo',
  warning: 'border-amber-echo/40 bg-amber-950/80 text-amber-echo',
  danger: 'border-danger-echo/50 bg-red-950/80 text-red-100',
  info: 'border-cyan-echo/40 bg-slate-950/90 text-cyan-soft',
}

const icons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
}

export function ToastHost() {
  const toasts = useLauncherStore((state) => state.toasts)
  const removeToast = useLauncherStore((state) => state.removeToast)

  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) => window.setTimeout(() => removeToast(toast.id), 4200))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [removeToast, toasts])

  return (
    <div className="fixed right-5 top-5 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3">
      {toasts.map((toast) => {
        const Icon = icons[toast.tone]
        return (
          <div className={cn('toast-enter glass-surface rounded-xl border p-4 shadow-cyber', toneClasses[toast.tone])} key={toast.id}>
            <div className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{toast.title}</p>
                {toast.detail ? <p className="mt-1 text-sm leading-5 text-slate-300">{toast.detail}</p> : null}
              </div>
              <button aria-label="Dismiss notification" onClick={() => removeToast(toast.id)} type="button">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
