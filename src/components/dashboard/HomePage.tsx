import {
  AlertTriangle,
  DownloadCloud,
  Gamepad2,
  Monitor,
  RefreshCcw,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { officialModpacksFromReleaseIndex } from '../../data/officialModpacks'
import { installService } from '../../services/InstallService'
import { launchService } from '../../services/LaunchService'
import { isNativeAvailable, invokeNative } from '../../services/nativeBridge'
import { repairService } from '../../services/RepairService'
import { useLauncherStore } from '../../stores/launcherStore'
import { usePackOsStore } from '../../stores/packOsStore'
import { usePackStateStore } from '../../stores/packStateStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReadinessStore } from '../../stores/readinessStore'
import { useReleaseStore } from '../../stores/releaseStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useStandaloneRuntimeStore } from '../../stores/standaloneRuntimeStore'
import type { HealthStatus } from '../../types/launcher'
import type { NativePackPrimaryActionKind, NativePackState } from '../../types/native'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { ProgressBar } from '../cyber/ProgressBar'
import { StatusChip } from '../cyber/StatusChip'

const actionIcons: Record<NativePackPrimaryActionKind, LucideIcon> = {
  play: Gamepad2,
  'launch-standalone': Monitor,
  install: DownloadCloud,
  update: RefreshCcw,
  repair: Wrench,
  diagnostics: ShieldAlert,
  unavailable: AlertTriangle,
}

const routeIcons: Record<string, LucideIcon> = {
  'native-loader-minecraft': Terminal,
  'neoforge-minecraft': Gamepad2,
  'native-runtime': Monitor,
}

function packStatus(packState: NativePackState | null): { label: string; status: HealthStatus; detail: string } {
  if (!packState) return { label: 'Checking', status: 'queued', detail: 'Reading selected pack state.' }
  if (packState.ok) return { label: 'Ready', status: 'healthy', detail: 'Files, manifest, route, and launch policy are ready.' }
  const blocker = packState.blockers[0]
  if (!blocker) return { label: 'Needs attention', status: 'warning', detail: 'Pack state is incomplete.' }
  return { label: blocker.title, status: blocker.status, detail: blocker.detail }
}

export function HomePage() {
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const setSelectedProfileId = useLauncherStore((state) => state.setSelectedProfileId)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const setActiveToolsTab = useLauncherStore((state) => state.setActiveToolsTab)
  const addToast = useLauncherStore((state) => state.addToast)
  const profiles = useProfileStore((state) => state.profiles)
  const setProfiles = useProfileStore((state) => state.setProfiles)
  const releaseIndex = useReleaseStore((state) => state.releaseIndex)
  const loadReleases = useReleaseStore((state) => state.loadReleases)
  const refreshReadiness = useReadinessStore((state) => state.refreshReadiness)
  const refreshPackOs = usePackOsStore((state) => state.refreshPackOs)
  const ramGb = useSettingsStore((state) => state.ramGb)
  const packStates = usePackStateStore((state) => state.states)
  const packStateLoading = usePackStateStore((state) => state.loading[selectedProfileId])
  const packStateError = usePackStateStore((state) => state.error[selectedProfileId])
  const refreshPackState = usePackStateStore((state) => state.refreshPackState)
  const launchStandaloneRuntime = useStandaloneRuntimeStore((state) => state.launchStandalone)
  const standaloneLaunching = useStandaloneRuntimeStore((state) => state.launching)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('Ready')

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0]
  const packState = packStates[selectedProfileId] ?? null
  const modpacks = useMemo(() => officialModpacksFromReleaseIndex(releaseIndex), [releaseIndex])
  const selectedPack = modpacks.find((pack) => pack.id === selectedProfileId) ?? modpacks[0]
  const status = packStatus(packState)
  const RouteIcon = routeIcons[packState?.route.mode ?? selectedProfile?.runtimeMode ?? 'native-loader-minecraft'] ?? Gamepad2
  const action = packState?.primaryAction
  const ActionIcon = actionIcons[action?.kind ?? 'unavailable']
  const disabled = busy || standaloneLaunching || !action?.enabled || !isNativeAvailable()

  useEffect(() => {
    if (!selectedProfileId || !isNativeAvailable()) return
    void refreshPackState(selectedProfileId)
  }, [refreshPackState, selectedProfileId])

  const refreshSelectedState = async () => {
    const [nextProfiles, nextPackState] = await Promise.all([
      invokeNative('profile:list').catch(() => null),
      refreshPackState(selectedProfileId),
      refreshReadiness(selectedProfileId),
      refreshPackOs(),
    ])
    if (nextProfiles) setProfiles(nextProfiles)
    return nextPackState
  }

  const openDiagnostics = () => {
    setActiveToolsTab('diagnostics')
    setActivePage('tools')
  }

  const runPackAction = async () => {
    if (!selectedProfile || !action || !packState) return
    if (action.kind === 'diagnostics') {
      openDiagnostics()
      return
    }
    if (action.kind === 'unavailable') {
      addToast('Pack unavailable', action.reason || status.detail, 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Pack actions require the ECHO desktop app.', 'warning')
      return
    }

    setBusy(true)
    setProgress(8)
    setStage(action.label)
    try {
      if (action.kind === 'install' || action.kind === 'update') {
        const operationId = launchService.createOperationId(action.kind)
        setStage(action.kind === 'install' ? `Installing ${selectedProfile.name}` : `Updating ${selectedProfile.name}`)
        const result = await installService.runInstall({
          profileId: selectedProfile.id,
          installPath: selectedProfile.installPath,
          channel: selectedProfile.channel,
          version: packState.catalog.release?.version,
          operationId,
          refresh: true,
        })
        setProgress(result.ok ? 100 : 96)
        addToast(result.ok ? `${selectedProfile.name} ready` : `${selectedProfile.name} install needs attention`, result.ok ? `Verified ${result.after.valid.length} files.` : `${result.after.missing.length} missing and ${result.after.corrupt.length} corrupt files remain.`, result.ok ? 'success' : 'danger')
      } else if (action.kind === 'repair') {
        if (!packState.install.manifestPath) {
          addToast('Repair unavailable', 'This pack does not have a valid installed manifest to repair from.', 'warning')
          return
        }
        setStage(`Repairing ${selectedProfile.name}`)
        const result = await repairService.runRepair({
          profileId: selectedProfile.id,
          installPath: selectedProfile.installPath,
          manifestPath: packState.install.manifestPath,
          channel: selectedProfile.channel,
        })
        setProgress(result.ok ? 100 : 96)
        const next = await refreshSelectedState()
        addToast(
          result.ok && next?.ok ? `${selectedProfile.name} repaired` : 'Files repaired, launch still needs attention',
          result.ok && next?.ok ? 'The selected pack is ready to play.' : next?.blockers[0]?.detail ?? `${result.after.missing.length} missing and ${result.after.corrupt.length} corrupt files remain.`,
          result.ok && next?.ok ? 'success' : 'warning',
        )
        return
      } else if (action.kind === 'launch-standalone') {
        setStage(`Launching ${selectedProfile.name}`)
        const result = await launchStandaloneRuntime({ profileId: selectedProfile.id })
        setProgress(result?.ok ? 100 : 96)
        addToast(result?.ok ? `${selectedProfile.name} launched` : 'Standalone launch failed', result?.message ?? 'Standalone launch did not return a result.', result?.ok ? 'success' : 'danger')
      } else {
        const operationId = launchService.createOperationId('handoff')
        setStage(`Preparing ${selectedProfile.name}`)
        const result = await launchService.prepareHandoff(
          selectedProfile.id,
          selectedProfile.installPath,
          ramGb,
          true,
          operationId,
          'skip',
          packState.route.mode === 'native-loader-minecraft' ? 'native-loader-minecraft' : 'neoforge-minecraft',
        )
        setProgress(result.ok ? 100 : 96)
        addToast(result.ok ? 'Minecraft Launcher ready' : `${selectedProfile.name} needs attention`, result.message, result.ok ? 'success' : 'danger')
      }
      await refreshSelectedState()
    } catch (error) {
      setProgress(96)
      addToast(`${selectedProfile.name} action failed`, error instanceof Error ? error.message : 'The selected action failed.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const refreshCatalog = async () => {
    setBusy(true)
    setStage('Refreshing Catalog')
    try {
      await loadReleases(true)
      await refreshSelectedState()
      addToast('Catalog refreshed', 'Pack availability was refreshed from the Release Index.', 'success')
    } catch (error) {
      addToast('Catalog refresh failed', error instanceof Error ? error.message : 'Release Index refresh failed.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-3 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_360px] xl:overflow-hidden">
      <section className="min-h-0 xl:overflow-y-auto">
        <div className="relative min-h-[620px] overflow-hidden rounded-xl border border-cyan-echo/20 bg-black/35 shadow-cyber">
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-55"
            decoding="async"
            fetchPriority="high"
            src={selectedPack?.image}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/76 to-black/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
          <div className="relative z-10 flex min-h-[620px] flex-col justify-between p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Selected Pack</p>
                <h1 className="mt-2 max-w-4xl text-4xl font-black leading-tight text-white 2xl:text-5xl">
                  {selectedProfile?.name ?? 'ECHO Pack'}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                  {selectedPack?.summary ?? 'Official ECHO pack.'}
                </p>
              </div>
              <StatusChip label={status.label} status={status.status} />
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              <GlassCard className="space-y-4 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-cyan-echo/30 bg-black/45 text-cyan-soft">
                    <RouteIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Launch Route</p>
                    <h2 className="mt-1 text-2xl font-semibold text-white">{packState?.route.label ?? 'Checking route'}</h2>
                    <p className="mt-2 text-sm leading-5 text-slate-300">{packState?.route.detail ?? status.detail}</p>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <StatePill label="Manifest" value={packState?.localManifest.status ?? 'checking'} status={packState?.localManifest.status === 'valid' ? 'healthy' : packState?.localManifest.status === 'invalid' ? 'critical' : 'missing'} />
                  <StatePill label="Install" value={packState?.install.installed ? 'installed' : 'missing'} status={packState?.install.installed ? 'healthy' : 'missing'} />
                  <StatePill label="Catalog" value={packState?.catalog.ok ? 'approved' : packState?.catalog.status ?? 'checking'} status={packState?.catalog.ok ? 'healthy' : 'warning'} />
                </div>
              </GlassCard>

              <GlassCard className="space-y-4 p-4" tone={status.status === 'healthy' ? 'success' : status.status === 'critical' ? 'amber' : 'cyan'}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Primary Action</p>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-slate-300">{action?.reason || status.detail}</p>
                </div>
                <CyberButton
                  className="w-full"
                  disabled={disabled}
                  icon={ActionIcon}
                  onClick={() => void runPackAction()}
                  size="lg"
                  variant={action?.variant ?? 'ghost'}
                >
                  {busy || standaloneLaunching || packStateLoading ? 'Working...' : action?.label ?? 'Checking...'}
                </CyberButton>
                <div>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    <span>{stage}</span>
                    <span>{Math.round(busy ? progress : packStateLoading ? 35 : packState?.ok ? 100 : 62)}%</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar tone={status.status === 'healthy' ? 'success' : status.status === 'critical' ? 'danger' : 'amber'} value={busy ? progress : packStateLoading ? 35 : packState?.ok ? 100 : 62} />
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </section>

      <aside className="min-h-0 space-y-3 xl:overflow-y-auto">
        <GlassCard className="space-y-3 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Pack</p>
          <select
            className="h-11 w-full rounded-lg border border-cyan-echo/25 bg-black/40 px-3 text-sm font-semibold text-white outline-none transition focus:border-cyan-echo focus:ring-2 focus:ring-cyan-echo/20"
            id="home-pack-select"
            onChange={(event) => setSelectedProfileId(event.target.value)}
            value={selectedProfileId}
          >
            {profiles.map((profile) => (
              <option className="bg-slate-950 text-white" key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <CyberButton disabled={busy} icon={RefreshCcw} onClick={() => void refreshCatalog()} size="sm" variant="secondary">
              Catalog
            </CyberButton>
            <CyberButton icon={ShieldAlert} onClick={openDiagnostics} size="sm" variant="secondary">
              Diagnostics
            </CyberButton>
          </div>
        </GlassCard>

        <GlassCard className="space-y-3 p-4" tone={packState?.blockers.length ? 'amber' : 'success'}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">State</p>
              <h2 className="mt-1 text-lg font-semibold text-white">{packState?.ok ? 'Ready to play' : 'Why not playable?'}</h2>
            </div>
            <StatusChip compact status={status.status} />
          </div>
          {packStateError ? <BlockerRow title="Pack state failed" detail={packStateError} status="critical" /> : null}
          {packState?.blockers.length ? (
            <div className="space-y-2">
              {packState.blockers.map((blocker) => (
                <BlockerRow detail={blocker.detail} key={blocker.id} status={blocker.status} title={blocker.title} />
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-300">No blockers detected for the selected pack.</p>
          )}
        </GlassCard>
      </aside>
    </div>
  )
}

function StatePill({ label, value, status }: { label: string; value: string; status: HealthStatus }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <StatusChip compact status={status} />
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white" title={value}>
        {value}
      </p>
    </div>
  )
}

function BlockerRow({ title, detail, status }: { title: string; detail: string; status: HealthStatus }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">{title}</p>
        <StatusChip compact status={status} />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>
    </div>
  )
}
