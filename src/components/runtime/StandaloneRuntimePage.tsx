import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Gamepad2,
  Monitor,
  Play,
  RefreshCcw,
  ShieldCheck,
  Terminal,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { launchService } from '../../services/LaunchService'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useLauncherStore } from '../../stores/launcherStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReadinessStore } from '../../stores/readinessStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useStandaloneRuntimeStore } from '../../stores/standaloneRuntimeStore'
import type { StandaloneRuntimeModeId } from '../../types/standaloneRuntime'
import { buildRuntimeLaunchButtonState, buildRuntimeModeCards, runtimeSummaryStatus } from '../../utils/standaloneRuntimeShell'
import { cn } from '../../utils/cn'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { LogViewer } from '../cyber/LogViewer'
import { StatusChip } from '../cyber/StatusChip'

const modeIcons: Record<StandaloneRuntimeModeId, LucideIcon> = {
  'native-runtime': Monitor,
  'native-loader-minecraft': Terminal,
  'neoforge-minecraft': Gamepad2,
}

export function StandaloneRuntimePage() {
  const state = useStandaloneRuntimeStore((store) => store.state)
  const selectedMode = useStandaloneRuntimeStore((store) => store.selectedMode)
  const setSelectedMode = useStandaloneRuntimeStore((store) => store.setSelectedMode)
  const refresh = useStandaloneRuntimeStore((store) => store.refresh)
  const launchStandalone = useStandaloneRuntimeStore((store) => store.launchStandalone)
  const loading = useStandaloneRuntimeStore((store) => store.loading)
  const launching = useStandaloneRuntimeStore((store) => store.launching)
  const error = useStandaloneRuntimeStore((store) => store.error)
  const lastLaunch = useStandaloneRuntimeStore((store) => store.lastLaunch)
  const profiles = useProfileStore((store) => store.profiles)
  const selectedProfileId = useLauncherStore((store) => store.selectedProfileId)
  const addToast = useLauncherStore((store) => store.addToast)
  const ramGb = useSettingsStore((store) => store.ramGb)
  const readiness = useReadinessStore((store) => store.readiness)
  const refreshReadiness = useReadinessStore((store) => store.refreshReadiness)
  const [minecraftLaunching, setMinecraftLaunching] = useState(false)
  const nativeAvailable = isNativeAvailable()
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0]
  const runtimeProfile = profiles.find((profile) => profile.runtimeMode === selectedMode) ?? selectedProfile
  const minecraftReady = readiness?.minecraftLauncher?.ok ?? true
  const modeCards = useMemo(
    () =>
      buildRuntimeModeCards(state, {
        minecraftReady,
        nativeLoaderReady: false,
        nativeLoaderDisabledReason: 'Open Home to verify Native Loader release metadata before handoff.',
      }),
    [minecraftReady, state],
  )
  const launchButton = useMemo(
    () =>
      buildRuntimeLaunchButtonState({
        mode: selectedMode,
        state,
        nativeAvailable,
        minecraftReady,
        nativeLoaderReady: false,
        nativeLoaderDisabledReason: 'Open Home to verify Native Loader release metadata before handoff.',
        launching: launching || minecraftLaunching,
      }),
    [launching, minecraftLaunching, minecraftReady, nativeAvailable, selectedMode, state],
  )
  const overallStatus = runtimeSummaryStatus(state)

  useEffect(() => {
    void refresh()
    void refreshReadiness(runtimeProfile?.id ?? selectedProfile?.id)
  }, [refresh, refreshReadiness, runtimeProfile?.id, selectedProfile?.id])

  const handleLaunch = async () => {
    if (selectedMode === 'native-runtime') {
      const result = await launchStandalone({ profileId: runtimeProfile?.id ?? 'ashfall-standalone-edition' })
      if (!result) return
      addToast(result.ok ? 'Standalone runtime launched' : 'Standalone runtime blocked', result.message, result.ok ? 'success' : 'danger')
      return
    }
    if (selectedMode === 'neoforge-minecraft' || selectedMode === 'native-loader-minecraft') {
      setMinecraftLaunching(true)
      const profileId = runtimeProfile?.id ?? 'ashfall-native-edition'
      const installPath = runtimeProfile?.installPath
      const operationId = launchService.createOperationId('runtime-handoff')
      try {
        const result = await launchService.prepareHandoff(profileId, installPath, ramGb, true, operationId, 'skip', selectedMode)
        addToast(
          result.ok ? 'Minecraft Launcher handoff ready' : 'Minecraft Launcher handoff blocked',
          result.message,
          result.ok ? 'success' : 'warning',
        )
      } catch (launchError) {
        const message = launchError instanceof Error ? launchError.message : 'Minecraft Launcher handoff failed.'
        addToast('Minecraft Launcher handoff failed', message, 'danger')
      } finally {
        setMinecraftLaunching(false)
      }
    }
  }

  const openRuntimeRoot = () => {
    if (!state?.runtimeRoot || !nativeAvailable) return
    void invokeNative('shell:open-path', { path: state.runtimeRoot }).catch((openError: unknown) => {
      const message = openError instanceof Error ? openError.message : 'Could not open runtime folder.'
      addToast('Runtime folder unavailable', message, 'warning')
    })
  }

  const handleLogAction = (action: string) => {
    if (action === 'Open folder') {
      openRuntimeRoot()
      return
    }
    const summary = [
      `Runtime root: ${state?.runtimeRoot ?? 'unresolved'}`,
      `Executable: ${state?.executablePath ?? 'missing'}`,
      `Status: ${overallStatus}`,
      `Warnings: ${state?.warnings.join('; ') || 'none'}`,
    ].join('\n')
    void navigator.clipboard?.writeText(summary)
    addToast('Runtime summary copied', action, 'success')
  }

  return (
    <div className="h-full min-h-0 overflow-auto p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold text-white">Runtime</h1>
              <StatusChip status={overallStatus} />
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Desktop launch control for the Phase 14.20 standalone foundation and Ashfall handoff modes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CyberButton icon={RefreshCcw} onClick={() => void refresh()} size="sm" variant="ghost">
              Verify
            </CyberButton>
            <CyberButton disabled={!state?.runtimeRoot} icon={FolderOpen} onClick={openRuntimeRoot} size="sm" variant="ghost">
              Folder
            </CyberButton>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <GlassCard className="space-y-4" tone={overallStatus === 'healthy' ? 'success' : overallStatus === 'warning' ? 'amber' : 'cyan'}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-soft/80">Launch Mode</p>
                <p className="mt-1 text-sm text-slate-300">{state?.version ?? 'Runtime version unresolved'}</p>
              </div>
              <CyberButton disabled={launchButton.disabled} icon={Play} onClick={handleLaunch} size="lg" variant={launchButton.disabled ? 'ghost' : 'primary'}>
                {launchButton.label}
              </CyberButton>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {modeCards.map((card) => {
                const Icon = modeIcons[card.id]
                const selected = selectedMode === card.id
                return (
                  <button
                    className={cn(
                      'rounded-lg border p-4 text-left transition',
                      selected
                        ? 'border-cyan-echo/60 bg-cyan-echo/15 shadow-[0_0_28px_rgba(37,232,255,0.15)]'
                        : 'border-white/10 bg-white/[0.035] hover:border-cyan-echo/35 hover:bg-white/[0.06]',
                    )}
                    key={card.id}
                    onClick={() => setSelectedMode(card.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-echo/20 bg-slate-950/60 text-cyan-soft">
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{card.eyebrow}</p>
                          <p className="text-base font-semibold text-white">{card.label}</p>
                        </div>
                      </div>
                      <StatusChip compact status={card.status} />
                    </div>
                    <p className="mt-4 min-h-12 text-sm leading-6 text-slate-300">{card.disabledReason ?? card.detail}</p>
                  </button>
                )
              })}
            </div>

            {launchButton.detail ? (
              <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-sm text-slate-300">
                {launchButton.disabled ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-echo" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-echo" />}
                <span>{launchButton.detail}</span>
              </div>
            ) : null}
          </GlassCard>

          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-soft/80">Evidence</p>
                <p className="mt-1 text-sm text-slate-300">{loading ? 'Refreshing runtime checks...' : state?.generatedAt ?? 'Not verified yet'}</p>
              </div>
              <ShieldCheck className="h-6 w-6 text-cyan-soft" />
            </div>
            <div className="space-y-3 text-sm">
              <RuntimeFact label="Runtime root" value={state?.runtimeRoot ?? 'Unresolved'} />
              <RuntimeFact label="Executable" value={state?.executablePath ?? 'Missing'} />
              <RuntimeFact label="Support bundle" value={state?.supportBundle.available ? `${state.supportBundle.entries} report entries` : 'Unavailable'} />
              {lastLaunch ? <RuntimeFact label="Last launch" value={lastLaunch.message} /> : null}
              {error ? (
                <div className="rounded-lg border border-danger-echo/40 bg-danger-echo/10 p-3 text-red-100">
                  {error}
                </div>
              ) : null}
            </div>
          </GlassCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-soft/80">Verification</p>
                <p className="mt-1 text-sm text-slate-300">{state?.checks.length ?? 0} runtime checks tracked</p>
              </div>
              <Activity className="h-6 w-6 text-cyan-soft" />
            </div>
            <div className="space-y-2">
              {(state?.checks ?? []).map((check) => (
                <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 md:grid-cols-[180px_120px_1fr]" key={check.id}>
                  <span className="font-semibold text-white">{check.label}</span>
                  <StatusChip compact status={check.status} />
                  <span className="min-w-0 break-words text-sm leading-6 text-slate-300">{check.detail}</span>
                </div>
              ))}
              {!state?.checks.length ? <p className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">Run verification to populate runtime checks.</p> : null}
            </div>
          </GlassCard>

          <GlassCard className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-soft/80">Repair Plan</p>
                <p className="mt-1 text-sm text-slate-300">Planning-only actions; no automatic repair runs from this page.</p>
              </div>
              <Wrench className="h-6 w-6 text-cyan-soft" />
            </div>
            <div className="space-y-2">
              {(state?.repairPlan ?? []).map((action) => (
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3" key={action.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-white">{action.title}</p>
                    {action.recommended ? <StatusChip compact label="Recommended" status="warning" /> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{action.detail}</p>
                  {action.command ? <code className="mt-3 block break-words rounded border border-cyan-echo/15 bg-slate-950/60 p-2 text-xs text-cyan-soft">{action.command}</code> : null}
                </div>
              ))}
              {!state?.repairPlan.length ? (
                <div className="flex items-center gap-3 rounded-lg border border-success-echo/30 bg-success-echo/10 p-4 text-sm text-success-echo">
                  <CheckCircle2 className="h-4 w-4" />
                  Runtime verification does not require repair.
                </div>
              ) : null}
            </div>
          </GlassCard>
        </div>

        <GlassCard className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-soft/80">Runtime Logs</p>
            <p className="mt-1 text-sm text-slate-300">{state?.warnings.length ? state.warnings.join(' ') : 'No runtime warnings reported.'}</p>
          </div>
          <LogViewer entries={state?.logs ?? []} onAction={handleLogAction} />
        </GlassCard>
      </div>
    </div>
  )
}

function RuntimeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm leading-6 text-slate-200">{value}</p>
    </div>
  )
}
