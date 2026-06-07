import { Play, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import echoBanner from '../../assets/brand/echo-banner.webp'
import { CyberButton } from '../cyber/CyberButton'

interface HeroBannerProps {
  launching: boolean
  launchModeLabel?: string
  onPlay: () => void
  playIcon?: LucideIcon
  playLabel?: string
  playDisabled?: boolean
  busyLabel?: string
  secondaryAction?: {
    busy?: boolean
    busyLabel?: string
    disabled?: boolean
    icon?: LucideIcon
    label: string
    onClick: () => void
  } | null
}

export function HeroBanner({
  busyLabel = 'Launching...',
  launchModeLabel = 'Minecraft Launcher Handoff',
  launching,
  onPlay,
  playDisabled = false,
  playIcon: PlayIcon = Play,
  playLabel = 'Play',
  secondaryAction = null,
}: HeroBannerProps) {
  return (
    <section className="cyber-panel relative flex h-full min-h-0 overflow-hidden rounded-xl bg-black p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
      <img alt="" className="absolute inset-0 h-full w-full object-cover" src={echoBanner} />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-slate-950/72 to-slate-950/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />
      <div className="cyber-corner-grid pointer-events-none absolute right-0 top-0 h-56 w-56 opacity-50" />
      <div className="relative z-10 flex h-full max-w-3xl flex-col gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-success-echo/25 bg-black/35 px-3 py-1 text-xs font-semibold text-slate-200 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-success-echo shadow-[0_0_12px_#5dffb3]" />
            Ashfall / {launchModeLabel}
          </div>
          <h2 className="text-4xl font-black text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.2)] 2xl:text-5xl">Ashfall</h2>
          <p className="mt-1 text-base font-semibold text-amber-echo">Survive. Adapt. Endure.</p>
          <p className="mt-2 max-w-xl text-sm leading-5 text-slate-200">One beta pack, one clean path: ECHO installs and verifies Ashfall, then opens Minecraft Launcher for account login and play.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CyberButton disabled={playDisabled} icon={PlayIcon} onClick={onPlay} size="md" variant="primary">
            {launching ? busyLabel : playLabel}
          </CyberButton>
          {secondaryAction ? (
            <CyberButton
              disabled={secondaryAction.disabled || secondaryAction.busy}
              icon={secondaryAction.icon}
              onClick={secondaryAction.onClick}
              size="md"
              variant="secondary"
            >
              {secondaryAction.busy ? secondaryAction.busyLabel ?? secondaryAction.label : secondaryAction.label}
            </CyberButton>
          ) : null}
          <div className="flex items-center gap-2 rounded-lg border border-amber-echo/40 bg-amber-echo/10 px-3 py-2 text-sm text-amber-echo">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Worldgen safety active
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-8 right-10 hidden w-80 border-t border-cyan-echo/15 xl:block" />
      <div className="pointer-events-none absolute bottom-16 right-20 hidden w-56 border-t border-amber-echo/25 xl:block" />
    </section>
  )
}
