import {
  AlertTriangle,
  Boxes,
  DownloadCloud,
  FileInput,
  FolderSearch,
  Gamepad2,
  RadioTower,
  RefreshCcw,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { officialModpacksFromReleaseIndex, type OfficialModpack } from '../../data/officialModpacks'
import { installService } from '../../services/InstallService'
import { launchService } from '../../services/LaunchService'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { repairService } from '../../services/RepairService'
import { useLauncherStore } from '../../stores/launcherStore'
import { usePackStateStore } from '../../stores/packStateStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReadinessStore } from '../../stores/readinessStore'
import { useReleaseStore } from '../../stores/releaseStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useStandaloneRuntimeStore } from '../../stores/standaloneRuntimeStore'
import type { HealthStatus, PageId } from '../../types/launcher'
import type { NativeImportCandidate, NativePackPrimaryActionKind, NativePackState } from '../../types/native'
import { cn } from '../../utils/cn'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { MetricCard } from '../cyber/MetricCard'
import { StatusChip } from '../cyber/StatusChip'

const actionIcons: Record<NativePackPrimaryActionKind, LucideIcon> = {
  play: Gamepad2,
  'launch-standalone': Gamepad2,
  install: DownloadCloud,
  update: RefreshCcw,
  repair: Wrench,
  diagnostics: ShieldAlert,
  unavailable: AlertTriangle,
}

function cardTone(packState?: NativePackState): HealthStatus {
  if (!packState) return 'queued'
  if (packState.ok) return 'healthy'
  return packState.blockers[0]?.status ?? 'warning'
}

function cardLabel(packState?: NativePackState) {
  if (!packState) return 'Checking'
  if (packState.ok) return 'Playable'
  if (packState.localManifest.status === 'invalid') return 'Invalid Manifest'
  if (!packState.catalog.ok && !packState.install.installed) return 'Unavailable'
  return packState.blockers[0]?.title ?? 'Needs Attention'
}

export function ModpacksPage() {
  const addToast = useLauncherStore((state) => state.addToast)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const setActiveToolsTab = useLauncherStore((state) => state.setActiveToolsTab)
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const setSelectedProfileId = useLauncherStore((state) => state.setSelectedProfileId)
  const setProfiles = useProfileStore((state) => state.setProfiles)
  const releaseIndex = useReleaseStore((state) => state.releaseIndex)
  const loadingReleases = useReleaseStore((state) => state.loadingReleases)
  const loadReleases = useReleaseStore((state) => state.loadReleases)
  const ramGb = useSettingsStore((state) => state.ramGb)
  const refreshReadiness = useReadinessStore((state) => state.refreshReadiness)
  const launchStandaloneRuntime = useStandaloneRuntimeStore((state) => state.launchStandalone)
  const packStates = usePackStateStore((state) => state.states)
  const refreshPackState = usePackStateStore((state) => state.refreshPackState)
  const refreshManyPackStates = usePackStateStore((state) => state.refreshManyPackStates)
  const [importCandidates, setImportCandidates] = useState<NativeImportCandidate[]>([])
  const [scanningImports, setScanningImports] = useState(false)
  const [busyPackId, setBusyPackId] = useState<string | null>(null)
  const visibleModpacks = useMemo(() => officialModpacksFromReleaseIndex(releaseIndex), [releaseIndex])
  const playableCount = visibleModpacks.filter((pack) => packStates[pack.id]?.ok).length
  const unavailableCount = visibleModpacks.filter((pack) => packStates[pack.id]?.primaryAction.kind === 'unavailable').length

  const refreshProfilesAndPack = useCallback(
    async (profileId: string) => {
      const [profiles] = await Promise.all([
        invokeNative('profile:list').catch(() => null),
        refreshPackState(profileId),
        refreshReadiness(profileId),
      ])
      if (profiles) setProfiles(profiles)
    },
    [refreshPackState, refreshReadiness, setProfiles],
  )

  const refreshReleases = useCallback(async (refresh = false, announce = refresh) => {
    try {
      const index = await loadReleases(refresh)
      await refreshManyPackStates(visibleModpacks.map((pack) => pack.id))
      if (announce) {
        addToast('Catalog refreshed', `${index.acceptedCount ?? index.releases.length} approved release entries loaded.`, 'success')
      }
    } catch (error) {
      if (announce) addToast('Catalog unavailable', error instanceof Error ? error.message : 'Check the Release Index channel in Settings.', 'warning')
    }
  }, [addToast, loadReleases, refreshManyPackStates, visibleModpacks])

  useEffect(() => {
    if (!isNativeAvailable()) return
    const timer = window.setTimeout(() => {
      void refreshManyPackStates(visibleModpacks.map((pack) => pack.id))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshManyPackStates, visibleModpacks])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshReleases(false, false), 0)
    return () => window.clearTimeout(timer)
  }, [refreshReleases])

  const openDiagnostics = (profileId: string) => {
    setSelectedProfileId(profileId)
    setActiveToolsTab('diagnostics')
    setActivePage('tools')
  }

  const runPackAction = async (packState: NativePackState) => {
    const { profile, primaryAction } = packState
    setSelectedProfileId(profile.id)
    if (primaryAction.kind === 'diagnostics') {
      openDiagnostics(profile.id)
      return
    }
    if (primaryAction.kind === 'unavailable') {
      addToast('Pack unavailable', primaryAction.reason || packState.blockers[0]?.detail, 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Pack actions require the desktop app.', 'warning')
      return
    }

    setBusyPackId(profile.id)
    try {
      if (primaryAction.kind === 'install' || primaryAction.kind === 'update') {
        const operationId = launchService.createOperationId(primaryAction.kind)
        const result = await installService.runInstall({
          profileId: profile.id,
          installPath: profile.installPath,
          channel: profile.channel,
          version: packState.catalog.release?.version,
          operationId,
          refresh: true,
        })
        addToast(result.ok ? `${profile.name} ready` : `${profile.name} install needs attention`, result.ok ? `Verified ${result.after.valid.length} files.` : `${result.after.missing.length} missing and ${result.after.corrupt.length} corrupt files remain.`, result.ok ? 'success' : 'danger')
      } else if (primaryAction.kind === 'repair') {
        if (!packState.install.manifestPath) {
          addToast('Repair unavailable', 'This pack does not have a valid manifest to repair from.', 'warning')
          return
        }
        const result = await repairService.runRepair({
          profileId: profile.id,
          installPath: profile.installPath,
          manifestPath: packState.install.manifestPath,
          channel: profile.channel,
        })
        const next = await refreshPackState(profile.id)
        addToast(
          result.ok && next?.ok ? `${profile.name} repaired` : 'Files repaired, launch still needs attention',
          result.ok && next?.ok ? 'The pack is ready to play.' : next?.blockers[0]?.detail ?? `${result.after.missing.length} missing and ${result.after.corrupt.length} corrupt files remain.`,
          result.ok && next?.ok ? 'success' : 'warning',
        )
        await refreshProfilesAndPack(profile.id)
        return
      } else if (primaryAction.kind === 'launch-standalone') {
        const result = await launchStandaloneRuntime({ profileId: profile.id })
        addToast(result?.ok ? `${profile.name} launched` : 'Standalone launch failed', result?.message ?? 'Standalone launch did not return a result.', result?.ok ? 'success' : 'danger')
      } else {
        const operationId = launchService.createOperationId('handoff')
        const result = await launchService.prepareHandoff(
          profile.id,
          profile.installPath,
          ramGb,
          true,
          operationId,
          'skip',
          packState.route.mode === 'native-loader-minecraft' ? 'native-loader-minecraft' : 'neoforge-minecraft',
        )
        addToast(result.ok ? 'Minecraft Launcher ready' : `${profile.name} needs attention`, result.message, result.ok ? 'success' : 'danger')
      }
      await refreshProfilesAndPack(profile.id)
    } catch (error) {
      addToast(`${profile.name} action failed`, error instanceof Error ? error.message : 'The selected action failed.', 'danger')
    } finally {
      setBusyPackId(null)
    }
  }

  const scanImports = async (manual = false) => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Install import scanning requires the desktop backend.', 'warning')
      return
    }
    setScanningImports(true)
    try {
      let rootPath: string | undefined
      if (manual) {
        const folder = await invokeNative('dialog:select-directory', { title: 'Select an existing ECHO install' })
        if (folder.canceled || !folder.path) return
        rootPath = folder.path
      }
      const candidates = await invokeNative('instance:scan-imports', { rootPath })
      setImportCandidates(candidates)
      addToast('Import scan complete', `${candidates.length} candidate install${candidates.length === 1 ? '' : 's'} detected.`, candidates.length ? 'success' : 'warning')
    } catch (error) {
      addToast('Import scan failed', error instanceof Error ? error.message : 'Unable to scan for existing installs.', 'danger')
    } finally {
      setScanningImports(false)
    }
  }

  const importManifest = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Manifest import reads local files and requires the desktop app.', 'warning')
      return
    }
    const file = await invokeNative('dialog:select-file', {
      title: 'Import ECHO pack manifest',
      filters: [{ name: 'ECHO Pack Manifest', extensions: ['json'] }],
    })
    if (file.canceled || !file.path) return
    try {
      const imported = await invokeNative('manifest:import', { filePath: file.path, profileId: selectedProfileId })
      await refreshProfilesAndPack(selectedProfileId)
      addToast('Manifest imported', `${imported.manifest.version} saved to ${imported.manifestPath}`, 'success')
    } catch (error) {
      addToast('Manifest import failed', error instanceof Error ? error.message : 'Unable to import manifest.', 'danger')
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-echo">Library</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Official ECHO Packs</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard icon={Boxes} label="Packs" value={`${visibleModpacks.length}`} />
            <MetricCard icon={Gamepad2} label="Ready" value={`${playableCount}`} tone={playableCount ? 'success' : 'cyan'} />
            <MetricCard icon={AlertTriangle} label="Unavailable" value={`${unavailableCount}`} tone={unavailableCount ? 'amber' : 'cyan'} />
          </div>
          <div className="flex flex-wrap gap-2">
            <CyberButton disabled={loadingReleases} icon={RadioTower} onClick={() => void refreshReleases(true, true)} variant="secondary">
              {loadingReleases ? 'Refreshing...' : 'Refresh Catalog'}
            </CyberButton>
            <CyberButton disabled={scanningImports} icon={FolderSearch} onClick={() => void scanImports(false)} variant="secondary">
              {scanningImports ? 'Scanning...' : 'Scan Imports'}
            </CyberButton>
            <CyberButton icon={FileInput} onClick={() => void importManifest()} variant="secondary">
              Import Manifest
            </CyberButton>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleModpacks.map((pack) => (
          <OfficialPackCard
            busy={busyPackId === pack.id}
            key={pack.id}
            pack={pack}
            packState={packStates[pack.id]}
            selected={pack.id === selectedProfileId}
            onAction={runPackAction}
            onDiagnostics={openDiagnostics}
            setActivePage={setActivePage}
            setSelectedProfileId={setSelectedProfileId}
          />
        ))}
      </div>

      {importCandidates.length > 0 ? (
        <GlassCard className="space-y-3 p-4" tone="cyan">
          <h3 className="text-lg font-semibold text-white">Detected ECHO Installs</h3>
          {importCandidates.map((candidate) => (
            <div className="grid gap-3 rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 lg:grid-cols-[1fr_auto]" key={candidate.id}>
              <div>
                <p className="font-semibold text-white">{candidate.name}</p>
                <p className="mt-2 break-all font-mono text-xs text-slate-400">{candidate.path}</p>
              </div>
              <StatusChip label={candidate.alreadyManaged ? 'Managed' : 'Importable'} status={candidate.alreadyManaged ? 'healthy' : 'warning'} />
            </div>
          ))}
        </GlassCard>
      ) : null}
    </div>
  )
}

const OfficialPackCard = memo(function OfficialPackCard({
  pack,
  packState,
  selected,
  busy,
  onAction,
  onDiagnostics,
  setActivePage,
  setSelectedProfileId,
}: {
  pack: OfficialModpack
  packState?: NativePackState
  selected: boolean
  busy: boolean
  onAction: (packState: NativePackState) => Promise<void>
  onDiagnostics: (profileId: string) => void
  setActivePage: (page: PageId) => void
  setSelectedProfileId: (profileId: string) => void
}) {
  const action = packState?.primaryAction
  const ActionIcon = actionIcons[action?.kind ?? 'unavailable']
  const disabled = busy || !packState || !action?.enabled
  const status = cardTone(packState)
  const label = cardLabel(packState)
  const detail = packState
    ? packState.blockers[0]?.detail ?? packState.primaryAction.reason ?? pack.detail
    : 'Reading exact pack state from the desktop backend.'

  useEffect(() => {
    if (!selected) return
    const image = new Image()
    image.decoding = 'async'
    image.src = pack.image
  }, [pack.image, selected])

  return (
    <GlassCard className={cn('overflow-hidden p-0 transition duration-150', selected && 'ring-2 ring-cyan-echo/70')} tone={status === 'healthy' ? 'success' : status === 'critical' ? 'amber' : 'default'}>
      <div className="relative aspect-[16/9] min-h-64 overflow-hidden">
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-200 hover:opacity-95"
          decoding="async"
          fetchPriority={selected ? 'high' : 'auto'}
          loading={selected ? 'eager' : 'lazy'}
          src={pack.image}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
        <div className="absolute left-5 top-5 flex flex-wrap gap-2">
          {selected ? <StatusChip compact label="Selected" status="update_available" /> : null}
          <StatusChip compact label={label} status={status} />
          <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-semibold uppercase text-slate-200 backdrop-blur">
            {packState?.route.shortLabel ?? 'Checking'}
          </span>
        </div>
        <div className="absolute bottom-5 left-5 right-5">
          <p className="text-xs font-semibold uppercase text-amber-echo">{pack.channel}</p>
          <h3 className="mt-1 text-2xl font-black leading-tight text-white">{pack.name}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-200">{pack.summary}</p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="min-h-12 text-sm leading-6 text-slate-300">{detail}</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <PackStat icon={Boxes} label="Manifest" value={packState?.localManifest.status ?? 'checking'} />
          <PackStat icon={RadioTower} label="Catalog" value={packState ? (packState.catalog.ok ? 'approved' : packState.catalog.status) : 'checking'} />
          <PackStat icon={Wrench} label="Install" value={packState?.install.installed ? 'installed' : 'missing'} />
          <PackStat icon={ShieldAlert} label="Action" value={action?.kind ?? 'checking'} />
        </div>
        <div className="flex flex-wrap gap-2">
          <CyberButton disabled={disabled} icon={ActionIcon} onClick={() => packState && void onAction(packState)} variant={action?.variant ?? 'ghost'}>
            {busy ? 'Working...' : action?.label ?? 'Checking...'}
          </CyberButton>
          <CyberButton icon={ShieldAlert} onClick={() => onDiagnostics(pack.id)} variant="ghost">
            Diagnostics
          </CyberButton>
          <CyberButton
            icon={Gamepad2}
            onClick={() => {
              setSelectedProfileId(pack.id)
              setActivePage('home')
            }}
            variant="secondary"
          >
            Home
          </CyberButton>
        </div>
      </div>
    </GlassCard>
  )
})

function PackStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs uppercase text-slate-500">{label}</p>
        <p className="truncate font-semibold text-white" title={value}>{value}</p>
      </div>
    </div>
  )
}
