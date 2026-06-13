import type { ReactNode } from 'react'
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
        </main>
      </div>
    </div>
  )
}
