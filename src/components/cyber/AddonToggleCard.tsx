import { LockKeyhole, Power } from 'lucide-react'
import type { AddonModule } from '../../types/addons'
import { StatusChip } from './StatusChip'
import { ToggleRow } from './ToggleRow'

interface AddonToggleCardProps {
  addon: AddonModule
  enabled: boolean
  affectedModules: string[]
  onToggle: () => void
}

export function AddonToggleCard({ addon, enabled, affectedModules, onToggle }: AddonToggleCardProps) {
  const badgeTone =
    addon.requirement === 'required'
      ? 'border-danger-echo/40 bg-danger-echo/10 text-red-100'
      : addon.requirement === 'recommended'
        ? 'border-cyan-echo/30 bg-cyan-echo/10 text-cyan-soft'
        : 'border-slate-500/30 bg-slate-500/10 text-slate-300'

  return (
    <div className="rounded-xl border border-cyan-soft/20 bg-slate-950/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{addon.name}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeTone}`}>{addon.requirement}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">v{addon.version}</p>
        </div>
        <StatusChip compact status={addon.status} />
      </div>
      <p className="mb-3 text-sm leading-6 text-slate-300">{addon.notes}</p>
      <ToggleRow
        action={addon.locked ? <LockKeyhole className="h-4 w-4 text-amber-echo" /> : <Power className="h-4 w-4 text-cyan-soft" />}
        checked={enabled}
        disabled={addon.locked}
        label={addon.locked ? 'Required module locked' : 'Enabled'}
        onCheckedChange={onToggle}
      />
      {affectedModules.length > 0 ? (
        <p className="mt-3 text-xs leading-5 text-amber-echo">
          Disabling this affects: {affectedModules.join(', ')}
        </p>
      ) : null}
    </div>
  )
}
