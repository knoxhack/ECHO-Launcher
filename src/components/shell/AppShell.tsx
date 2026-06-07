import type { ReactNode } from 'react'
import { Cpu, HardDrive, RadioTower } from 'lucide-react'
import { useLauncherStore } from '../../stores/launcherStore'
import { cn } from '../../utils/cn'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const activePage = useLauncherStore((state) => state.activePage)
  const homeLocked = activePage === 'home'

  return (
    <div className="cyber-radial scanline-overlay h-screen overflow-hidden text-slate-100">
      <div className="cyber-grid pointer-events-none fixed inset-0 opacity-35" />
      <div className="pointer-events-none fixed inset-0 border border-cyan-echo/25 shadow-[inset_0_0_48px_rgba(37,232,255,0.08)]" />
      <div className="relative z-10 flex h-full min-h-0 gap-0 p-3">
        <Sidebar />
        <main className="cyber-panel ml-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
          <TopBar />
          <div className={cn('min-h-0 flex-1', homeLocked ? 'overflow-hidden p-3' : 'overflow-y-auto p-4')}>
            {children}
          </div>
          <footer className="hidden h-8 shrink-0 items-center justify-between border-t border-cyan-echo/15 bg-black/20 px-4 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-soft/70 2xl:flex">
            <div className="flex min-w-0 items-center gap-5">
              <span>ECHO OS v2.5.0</span>
              <span className="h-3 w-px bg-cyan-echo/20" />
              <span>Node: ORION-7</span>
              <span className="h-3 w-px bg-cyan-echo/20" />
              <span>Region: NA-East</span>
            </div>
            <div className="flex items-center gap-5">
              <Telemetry icon={HardDrive} label="Memory" value="42%" />
              <Telemetry icon={Cpu} label="CPU" value="18%" />
              <Telemetry icon={RadioTower} label="Bridge" value="Online" />
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

function Telemetry({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{label}</span>
      <span className="text-success-echo">{value}</span>
    </span>
  )
}
