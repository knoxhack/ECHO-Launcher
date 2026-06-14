import echoLogo from '../../assets/brand/echo-logo.webp'
import { useLauncherStore } from '../../stores/launcherStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { NavItem } from '../../types/launcher'
import { cn } from '../../utils/cn'
import { getVisibleNavItems } from './navigation'

export function Sidebar() {
  const activePage = useLauncherStore((state) => state.activePage)
  const launcherVersion = useLauncherStore((state) => state.launcherVersion)
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
        <div className="rounded-lg border border-cyan-echo/15 bg-black/25 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Launcher</p>
          <p className="mt-1 text-sm font-semibold text-white">{launcherVersion ? `v${launcherVersion}` : 'Desktop build'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Pack state, installs, repair, and diagnostics are selected-pack scoped.</p>
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
