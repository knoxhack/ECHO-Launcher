import echoLogo from '../../assets/brand/echo-logo.webp'
import { useLauncherStore } from '../../stores/launcherStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { NavItem } from '../../types/launcher'
import { cn } from '../../utils/cn'
import { getVisibleNavItems } from './navigation'

export function Sidebar() {
  const activePage = useLauncherStore((state) => state.activePage)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const advancedMode = useSettingsStore((state) => state.advancedMode)
  const creatorMode = useSettingsStore((state) => state.creatorMode)
  const visibleNavItems = getVisibleNavItems({ advancedMode, creatorMode })

  return (
    <aside className="cyber-panel flex h-full min-h-0 w-64 shrink-0 flex-col overflow-hidden rounded-2xl">
      <div className="shrink-0 border-b border-cyan-echo/15 p-4">
        <button className="flex w-full items-center gap-3 text-left" onClick={() => setActivePage('home')} type="button">
          <div className="h-14 w-14 overflow-hidden rounded-xl border border-cyan-echo/35 bg-black shadow-[0_0_28px_rgba(37,232,255,0.18)]">
            <img alt="" className="h-full w-full object-cover" src={echoLogo} />
          </div>
          <div>
            <p className="text-lg font-black tracking-wide text-white">ECHO</p>
            <p className="text-sm font-semibold text-slate-200">Launcher</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-soft/70">Official Hub</p>
          </div>
        </button>
      </div>

      <nav className="cyber-grid min-h-0 flex-1 space-y-1 overflow-y-auto border-b border-cyan-echo/10 p-3 [background-size:28px_28px]" aria-label="Primary navigation">
        {visibleNavItems.map((item) => (
          <SidebarItem active={activePage === item.id} item={item} key={item.id} onClick={() => setActivePage(item.id)} />
        ))}
      </nav>

      <div className="space-y-3 p-3">
        <div className="rounded-lg border border-cyan-echo/20 bg-cyan-echo/[0.045] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Ecosystem Status</p>
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-white">
            <span className="h-2 w-2 rounded-full bg-success-echo shadow-[0_0_12px_#5dffb3]" />
            All Systems Operational
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-wide text-slate-400">
            <div>
              <p>API Uptime</p>
              <p className="mt-1 font-mono text-success-echo">99.98%</p>
            </div>
            <div className="border-l border-cyan-echo/15 pl-2">
              <p>ECHO Network</p>
              <p className="mt-1 font-mono text-success-echo">Online</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-cyan-echo/15 bg-black/25 p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Next Community Event</p>
          <p className="mt-1 text-sm font-semibold text-white">ECHO Devstream</p>
          <p className="mt-1 text-xs text-slate-400">May 24, 2026 / 3:00 PM UTC</p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-cyan-echo/10 bg-black/20 p-2 font-mono text-[9px] uppercase tracking-wide text-slate-500">
          <div>
            <p>Node</p>
            <p className="mt-1 text-cyan-soft">O7</p>
          </div>
          <div>
            <p>Ping</p>
            <p className="mt-1 text-success-echo">12ms</p>
          </div>
          <div>
            <p>Mode</p>
            <p className="mt-1 text-amber-echo">Beta</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-1 text-cyan-soft/60">
          <div className="flex gap-2">
            <span className="h-8 w-8 rounded-lg border border-cyan-echo/15 bg-white/[0.04]" />
            <span className="h-8 w-8 rounded-lg border border-cyan-echo/15 bg-white/[0.04]" />
            <span className="h-8 w-8 rounded-lg border border-cyan-echo/15 bg-white/[0.04]" />
          </div>
          <span className="font-mono text-lg">&laquo;</span>
        </div>
      </div>
    </aside>
  )
}

function SidebarItem({ active, item, onClick }: { active: boolean; item: NavItem; onClick: () => void }) {
  const Icon = item.icon
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-11 w-full items-center gap-3 overflow-hidden rounded-lg border px-3 text-sm font-semibold transition',
        active
          ? 'border-cyan-echo/50 bg-cyan-echo/12 text-white shadow-[0_0_28px_rgba(37,232,255,0.16)]'
          : 'border-transparent text-slate-400 hover:border-cyan-echo/20 hover:bg-cyan-echo/[0.055] hover:text-white',
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{item.label}</span>
      {active ? (
        <>
          <span className="absolute inset-y-0 left-0 w-1 bg-cyan-echo shadow-[0_0_18px_rgba(37,232,255,0.8)]" />
          <span className="absolute right-3 h-2 w-2 rounded-full bg-amber-echo shadow-[0_0_12px_rgba(255,181,71,0.65)]" />
        </>
      ) : null}
    </button>
  )
}
