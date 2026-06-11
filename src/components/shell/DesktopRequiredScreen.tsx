import { DownloadCloud, MonitorCog, ShieldCheck } from 'lucide-react'
import echoBanner from '../../assets/brand/echo-banner.webp'
import echoLogo from '../../assets/brand/echo-logo.webp'
import { useLauncherStore } from '../../stores/launcherStore'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'

const desktopCommand = 'npm run desktop'

export function DesktopRequiredScreen() {
  const addToast = useLauncherStore((state) => state.addToast)

  const copyDesktopCommand = () => {
    const detail = `Run ${desktopCommand} from the project folder to open the desktop launcher.`
    addToast('Desktop command ready', `${detail} Copied to clipboard when browser permissions allow it.`, 'info')
    void navigator.clipboard?.writeText(desktopCommand).catch(() => undefined)
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020711] px-6 py-8 text-white">
      <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" src={echoBanner} />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-slate-950/85 to-slate-950/45" />
      <div className="cyber-grid absolute inset-0 opacity-15" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <GlassCard className="w-full" tone="cyan">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="mb-5 flex items-center gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-xl border border-cyan-echo/50 bg-black shadow-cyber">
                  <img alt="" className="h-full w-full object-cover" src={echoLogo} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-amber-echo">ECHO Launcher V3</p>
                  <h1 className="text-3xl font-semibold tracking-wide text-white">Desktop Backend Required</h1>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-slate-300">
                Version 3 is a strict desktop launcher. Minecraft Launcher handoff, install, repair, Catalog
                releases, verified downloads, NeoForge handling, imports, backups, diagnostics, and server exports
                require the Electron native bridge.
              </p>
              <div className="mt-6 rounded-lg border border-amber-echo/40 bg-amber-echo/10 p-4 text-sm leading-6 text-amber-100">
                Browser preview remains useful for visual development, but it cannot write files or inspect your
                machine. Start the desktop shell to enter the official Ashfall beta flow.
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <CyberButton icon={MonitorCog} onClick={copyDesktopCommand} variant="primary">
                  Copy npm run desktop
                </CyberButton>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { icon: DownloadCloud, label: 'Catalog install packages', value: 'blocked in browser' },
                { icon: ShieldCheck, label: 'SHA-256 install repair', value: 'desktop only' },
                { icon: MonitorCog, label: 'NeoForge installer path', value: 'allowlisted native flow' },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4" key={item.label}>
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-cyan-soft" />
                      <div>
                        <p className="font-semibold text-white">{item.label}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">{item.value}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </GlassCard>
      </div>
    </main>
  )
}
