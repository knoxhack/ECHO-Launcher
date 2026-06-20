import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  FileInput,
  Filter,
  FolderOpen,
  FolderSearch,
  Gamepad2,
  Home,
  Monitor,
  Network,
  RadioTower,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  officialModpackFamilies,
  officialModpacksFromReleaseIndex,
  runtimeLaneLabelFor,
  type OfficialModpack,
} from '../../data/officialModpacks'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useContentGraphStore } from '../../stores/contentGraphStore'
import { useLauncherStore } from '../../stores/launcherStore'
import { usePackStateStore } from '../../stores/packStateStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReleaseStore } from '../../stores/releaseStore'
import type { HealthStatus } from '../../types/launcher'
import type { InstalledContentGraphSummary, NativeImportCandidate, NativePackState } from '../../types/native'
import type { LauncherRuntimeModeId } from '../../types/standaloneRuntime'
import { cn } from '../../utils/cn'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { MetricCard } from '../cyber/MetricCard'
import { ProgressBar } from '../cyber/ProgressBar'
import { StatusChip } from '../cyber/StatusChip'
import { WarningCard } from '../cyber/WarningCard'
import {
  filterLibraryPacks,
  groupLibraryPacks,
  libraryPackStatus,
  type LibraryFilters,
  type LibraryStateFilter,
} from './libraryUtils'
import { packActionIcons, usePackActions } from './usePackActions'

const runtimeOptions: Array<{ id: 'all' | LauncherRuntimeModeId; label: string; icon: LucideIcon }> = [
  { id: 'all', label: 'All Runtimes', icon: Boxes },
  { id: 'native-loader-minecraft', label: runtimeLaneLabelFor('native-loader-minecraft'), icon: Terminal },
  { id: 'neoforge-minecraft', label: runtimeLaneLabelFor('neoforge-minecraft'), icon: Gamepad2 },
  { id: 'standalone-engine', label: runtimeLaneLabelFor('standalone-engine'), icon: Monitor },
  { id: 'native-runtime', label: runtimeLaneLabelFor('native-runtime'), icon: Monitor },
]

const stateOptions: Array<{ id: LibraryStateFilter; label: string }> = [
  { id: 'all', label: 'All States' },
  { id: 'ready', label: 'Ready' },
  { id: 'needs-attention', label: 'Needs Attention' },
  { id: 'available', label: 'Available' },
]

function stateTone(packState?: NativePackState): HealthStatus {
  return libraryPackStatus(packState).status
}

function stateLabel(packState?: NativePackState) {
  return libraryPackStatus(packState).label
}

function packDetail(pack: OfficialModpack, packState?: NativePackState) {
  return packState ? libraryPackStatus(packState).detail || pack.detail : 'Reading exact pack state from the desktop backend.'
}

export function LibraryCatalog() {
  const addToast = useLauncherStore((state) => state.addToast)
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const setSelectedProfileId = useLauncherStore((state) => state.setSelectedProfileId)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const releaseIndex = useReleaseStore((state) => state.releaseIndex)
  const loadingReleases = useReleaseStore((state) => state.loadingReleases)
  const loadReleases = useReleaseStore((state) => state.loadReleases)
  const packStates = usePackStateStore((state) => state.states)
  const refreshManyPackStates = usePackStateStore((state) => state.refreshManyPackStates)
  const profiles = useProfileStore((state) => state.profiles)
  const setProfiles = useProfileStore((state) => state.setProfiles)
  const updateProfile = useProfileStore((state) => state.updateProfile)
  const { busyPackId, openDiagnostics, runPackAction } = usePackActions()
  const [filters, setFilters] = useState<LibraryFilters>({ query: '', family: 'all', runtime: 'all', state: 'all' })
  const [selectedPackId, setSelectedPackId] = useState<string>(selectedProfileId)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [importCandidates, setImportCandidates] = useState<NativeImportCandidate[]>([])
  const [scanningImports, setScanningImports] = useState(false)
  const [stage, setStage] = useState('Ready')
  const [progress, setProgress] = useState(0)

  const visibleModpacks = useMemo(() => officialModpacksFromReleaseIndex(releaseIndex), [releaseIndex])
  const filteredPacks = useMemo(() => filterLibraryPacks(visibleModpacks, packStates, filters), [filters, packStates, visibleModpacks])
  const familyGroups = useMemo(() => groupLibraryPacks(filteredPacks), [filteredPacks])
  const selectedPack = visibleModpacks.find((pack) => pack.id === selectedPackId) ?? visibleModpacks.find((pack) => pack.id === selectedProfileId) ?? visibleModpacks[0]
  const selectedPackState = selectedPack ? packStates[selectedPack.id] : undefined
  const selectedProfile = profiles.find((profile) => profile.id === selectedPack?.id)
  const contentGraph = useContentGraphStore((state) =>
    selectedPackState?.install?.installPath ? state.graphs[selectedPackState.install.installPath] : null,
  )
  const contentGraphLoading = useContentGraphStore((state) =>
    selectedPackState?.install?.installPath ? Boolean(state.loading[selectedPackState.install.installPath]) : false,
  )
  const loadContentGraph = useContentGraphStore((state) => state.loadInstalledContentGraph)
  const readyCount = visibleModpacks.filter((pack) => packStates[pack.id]?.ok).length
  const attentionCount = visibleModpacks.filter((pack) => {
    const packState = packStates[pack.id]
    return Boolean(packState && !packState.ok && packState.primaryAction.kind !== 'unavailable')
  }).length
  const unavailableCount = visibleModpacks.filter((pack) => packStates[pack.id]?.primaryAction.kind === 'unavailable').length

  const refreshCatalog = useCallback(
    async (refresh = false, announce = refresh) => {
      try {
        const index = await loadReleases(refresh)
        await refreshManyPackStates(visibleModpacks.map((pack) => pack.id), { force: refresh })
        if (announce) {
          addToast('Catalog refreshed', `${index.acceptedCount ?? index.releases.length} approved release entries loaded.`, 'success')
        }
      } catch (error) {
        if (announce) {
          addToast('Catalog unavailable', error instanceof Error ? error.message : 'Check the Release Index channel in Settings.', 'warning')
        }
      }
    },
    [addToast, loadReleases, refreshManyPackStates, visibleModpacks],
  )

  useEffect(() => {
    if (!isNativeAvailable()) return
    const timer = window.setTimeout(() => {
      void refreshManyPackStates(visibleModpacks.map((pack) => pack.id))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshManyPackStates, visibleModpacks])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshCatalog(false, false), 0)
    return () => window.clearTimeout(timer)
  }, [refreshCatalog])

  useEffect(() => {
    if (!isNativeAvailable()) return
    const installPath = selectedPackState?.install?.installPath ?? selectedProfile?.installPath
    if (!installPath || !selectedPack) return
    void loadContentGraph(installPath)
  }, [selectedPack, selectedPackState?.install?.installPath, selectedProfile?.installPath, loadContentGraph])

  const selectPack = (pack: OfficialModpack, openDrawer = false) => {
    setSelectedPackId(pack.id)
    setSelectedProfileId(pack.id)
    if (openDrawer) setDrawerOpen(true)
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
    if (!selectedPack) return
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Manifest import reads local files and requires the desktop app.', 'warning')
      return
    }
    const file = await invokeNative('dialog:select-file', {
      title: `Import ${selectedPack.name} pack manifest`,
      filters: [{ name: 'ECHO Pack Manifest', extensions: ['json'] }],
    })
    if (file.canceled || !file.path) return
    try {
      const imported = await invokeNative('manifest:import', { filePath: file.path, profileId: selectedPack.id })
      await refreshManyPackStates([selectedPack.id])
      addToast('Manifest imported', `${imported.manifest.version} saved to ${imported.manifestPath}`, 'success')
    } catch (error) {
      addToast('Manifest import failed', error instanceof Error ? error.message : 'Unable to import manifest.', 'danger')
    }
  }

  const selectInstallFolder = async () => {
    if (!selectedProfile || !selectedPack) return
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Selecting local folders requires the desktop app.', 'warning')
      return
    }
    const result = await invokeNative('dialog:select-directory', {
      title: `Select install folder for ${selectedPack.name}`,
      defaultPath: selectedProfile.installPath,
    })
    if (result.canceled || !result.path) return
    const updated = { ...selectedProfile, installPath: result.path }
    updateProfile(updated)
    await invokeNative('profile:save', updated)
    const nextProfiles = await invokeNative('profile:list').catch(() => null)
    if (nextProfiles) setProfiles(nextProfiles)
    addToast('Install folder saved', result.path, 'success')
  }

  const openInstallFolder = async () => {
    if (!selectedProfile?.installPath) {
      addToast('Install folder not set', 'Select an install folder for this pack first.', 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Opening local folders requires the desktop app.', 'warning')
      return
    }
    await invokeNative('shell:open-path', { path: selectedProfile.installPath })
  }

  return (
    <div className="space-y-5">
      <GlassCard className="overflow-hidden p-0" tone="cyan">
        <div className="relative min-h-72 overflow-hidden">
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-65"
            decoding="async"
            fetchPriority="high"
            src={selectedPack?.familyArtwork ?? visibleModpacks[0]?.familyArtwork}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/25" />
          <div className="relative z-10 grid min-h-72 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="flex min-w-0 flex-col justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-echo">Library</p>
                  <StatusChip compact label={selectedPack?.familyName ?? 'Official'} status="update_available" />
                </div>
                <h2 className="mt-3 max-w-4xl text-4xl font-black leading-tight text-white 2xl:text-5xl">Official ECHO Packs</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
                  Browse every official pack family, compare runtime lanes, and open the exact action each pack is ready for.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard icon={Boxes} label="Packs" value={`${visibleModpacks.length}`} />
                <MetricCard icon={CheckCircle2} label="Ready" tone={readyCount ? 'success' : 'cyan'} value={`${readyCount}`} />
                <MetricCard icon={AlertTriangle} label="Needs Care" tone={attentionCount || unavailableCount ? 'amber' : 'cyan'} value={`${attentionCount + unavailableCount}`} />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-cyan-echo/20 bg-black/45 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-cyan-soft">
                <Filter className="h-4 w-4" aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">Catalog Filters</p>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input
                  aria-label="Search official packs"
                  className="h-11 w-full rounded-lg border border-cyan-echo/20 bg-slate-950/75 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-echo focus:ring-2 focus:ring-cyan-echo/20"
                  onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                  placeholder="Search packs, families, routes"
                  value={filters.query}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                <select
                  aria-label="Filter by pack family"
                  className="h-10 rounded-lg border border-cyan-echo/20 bg-slate-950/75 px-3 text-sm text-white"
                  onChange={(event) => setFilters((current) => ({ ...current, family: event.target.value as LibraryFilters['family'] }))}
                  value={filters.family}
                >
                  <option value="all">All Families</option>
                  {officialModpackFamilies.map((family) => (
                    <option key={family.id} value={family.id}>
                      {family.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by runtime lane"
                  className="h-10 rounded-lg border border-cyan-echo/20 bg-slate-950/75 px-3 text-sm text-white"
                  onChange={(event) => setFilters((current) => ({ ...current, runtime: event.target.value as LibraryFilters['runtime'] }))}
                  value={filters.runtime}
                >
                  {runtimeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by pack state"
                  className="h-10 rounded-lg border border-cyan-echo/20 bg-slate-950/75 px-3 text-sm text-white"
                  onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value as LibraryStateFilter }))}
                  value={filters.state}
                >
                  {stateOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <CyberButton disabled={loadingReleases} icon={RadioTower} onClick={() => void refreshCatalog(true, true)} size="sm" variant="secondary">
                  {loadingReleases ? 'Refreshing...' : 'Refresh Catalog'}
                </CyberButton>
                <CyberButton disabled={scanningImports} icon={FolderSearch} onClick={() => void scanImports(false)} size="sm" variant="ghost">
                  {scanningImports ? 'Scanning...' : 'Scan Folders'}
                </CyberButton>
                <CyberButton icon={FileInput} onClick={() => void importManifest()} size="sm" variant="ghost">
                  Import Manifest
                </CyberButton>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {familyGroups.length > 0 ? (
        <div className="space-y-8">
          {familyGroups.map((group) => (
            <section className="space-y-4" key={group.family.id}>
              <div className="relative overflow-hidden rounded-xl border border-cyan-echo/20 bg-black/35 p-4">
                <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" src={group.family.artwork} />
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/35" />
                <div className="relative z-10 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-soft">Pack Family</p>
                    <h2 className="mt-1 text-2xl font-black text-white">{group.family.name}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{group.family.summary}</p>
                  </div>
                  <StatusChip label={`${group.packs.length} runtime lanes`} status="operational" />
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                {group.packs.map((pack) => (
                  <OfficialPackCatalogCard
                    busy={busyPackId === pack.id}
                    key={pack.id}
                    pack={pack}
                    packState={packStates[pack.id]}
                    selected={pack.id === selectedPack?.id}
                    onAction={(packState) => void runPackAction(packState, { onProgress: setProgress, onStage: setStage })}
                    onDetails={() => selectPack(pack, true)}
                    onDiagnostics={() => openDiagnostics(pack.id)}
                    onHome={() => {
                      selectPack(pack)
                      setActivePage('home')
                    }}
                    onSelect={() => selectPack(pack)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <GlassCard tone="amber">
          <div className="flex items-start gap-3">
            <Search className="mt-1 h-5 w-5 text-amber-echo" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold text-white">No packs match these filters</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Clear search or broaden the family, runtime, or state filters.</p>
            </div>
          </div>
        </GlassCard>
      )}

      {importCandidates.length > 0 ? (
        <GlassCard className="space-y-3 p-4" tone="cyan">
          <h2 className="text-lg font-semibold text-white">Detected ECHO Installs</h2>
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

      <PackDetailDrawer
        busy={Boolean(selectedPack && busyPackId === selectedPack.id)}
        onAction={(packState) => void runPackAction(packState, { onProgress: setProgress, onStage: setStage })}
        onDiagnostics={(profileId) => openDiagnostics(profileId)}
        onImportManifest={() => void importManifest()}
        onOpenFolder={() => void openInstallFolder()}
        onOpenHome={() => {
          if (selectedPack) selectPack(selectedPack)
          setActivePage('home')
        }}
        onSelectFolder={() => void selectInstallFolder()}
        open={drawerOpen}
        pack={selectedPack}
        packState={selectedPackState}
        progress={progress}
        profileInstallPath={selectedProfile?.installPath}
        setOpen={setDrawerOpen}
        stage={stage}
        contentGraph={contentGraph}
        contentGraphLoading={contentGraphLoading}
      />
    </div>
  )
}

const OfficialPackCatalogCard = memo(function OfficialPackCatalogCard({
  pack,
  packState,
  selected,
  busy,
  onAction,
  onDetails,
  onDiagnostics,
  onHome,
  onSelect,
}: {
  pack: OfficialModpack
  packState?: NativePackState
  selected: boolean
  busy: boolean
  onAction: (packState: NativePackState) => void
  onDetails: () => void
  onDiagnostics: () => void
  onHome: () => void
  onSelect: () => void
}) {
  const action = packState?.primaryAction
  const ActionIcon = packActionIcons[action?.kind ?? 'unavailable']
  const disabled = busy || !packState || !action?.enabled
  const status = stateTone(packState)
  const detail = packDetail(pack, packState)

  useEffect(() => {
    if (!selected) return
    const image = new Image()
    image.decoding = 'async'
    image.src = pack.image
  }, [pack.image, selected])

  return (
    <GlassCard
      className={cn('overflow-hidden p-0 transition duration-150', selected && 'ring-2 ring-cyan-echo/70')}
      data-testid={`library-pack-card-${pack.id}`}
      tone={status === 'healthy' ? 'success' : status === 'critical' ? 'amber' : 'default'}
    >
      <button className="group block w-full text-left" onClick={onSelect} type="button">
        <div className="relative aspect-[16/9] min-h-52 overflow-hidden">
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
            decoding="async"
            fetchPriority={selected ? 'high' : 'auto'}
            loading={selected ? 'eager' : 'lazy'}
            src={pack.image}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/58 to-black/10" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            {selected ? <StatusChip compact label="Selected" status="update_available" /> : null}
            <StatusChip compact label={stateLabel(packState)} status={status} />
            <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-semibold uppercase text-slate-200 backdrop-blur">
              {pack.runtimeLaneLabel}
            </span>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-xs font-semibold uppercase text-amber-echo">{pack.familyName}</p>
            <h3 className="mt-1 text-2xl font-black leading-tight text-white">{pack.name}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-200">{pack.summary}</p>
          </div>
        </div>
      </button>

      <div className="space-y-4 p-4">
        <p className="min-h-12 text-sm leading-6 text-slate-300">{detail}</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <PackStat icon={Boxes} label="Manifest" value={packState?.localManifest.status ?? 'checking'} />
          <PackStat icon={RadioTower} label="Catalog" value={packState ? (packState.catalog.ok ? 'approved' : packState.catalog.status) : 'checking'} />
          <PackStat icon={Wrench} label="Install" value={packState?.install.installed ? 'installed' : 'missing'} />
          <PackStat icon={ShieldAlert} label="Action" value={action?.kind ?? 'checking'} />
        </div>
        <div className="flex flex-wrap gap-2">
          <CyberButton disabled={disabled} icon={ActionIcon} onClick={() => packState && onAction(packState)} variant={action?.variant ?? 'ghost'}>
            {busy ? 'Working...' : action?.label ?? 'Checking...'}
          </CyberButton>
          <CyberButton data-testid={`library-pack-details-${pack.id}`} icon={Sparkles} onClick={onDetails} variant="secondary">
            Details
          </CyberButton>
          <CyberButton icon={ShieldAlert} onClick={onDiagnostics} variant="ghost">
            Diagnostics
          </CyberButton>
          <CyberButton icon={Home} onClick={onHome} variant="ghost">
            Home
          </CyberButton>
        </div>
      </div>
    </GlassCard>
  )
})

function PackDetailDrawer({
  busy,
  onAction,
  onDiagnostics,
  onImportManifest,
  onOpenFolder,
  onOpenHome,
  onSelectFolder,
  open,
  pack,
  packState,
  progress,
  profileInstallPath,
  setOpen,
  stage,
  contentGraph,
  contentGraphLoading,
}: {
  busy: boolean
  onAction: (packState: NativePackState) => void
  onDiagnostics: (profileId: string) => void
  onImportManifest: () => void
  onOpenFolder: () => void
  onOpenHome: () => void
  onSelectFolder: () => void
  open: boolean
  pack?: OfficialModpack
  packState?: NativePackState
  progress: number
  profileInstallPath?: string
  setOpen: (open: boolean) => void
  stage: string
  contentGraph: InstalledContentGraphSummary | null
  contentGraphLoading: boolean
}) {
  if (!pack) return null
  const action = packState?.primaryAction
  const ActionIcon = packActionIcons[action?.kind ?? 'unavailable']
  const disabled = busy || !packState || !action?.enabled
  const status = libraryPackStatus(packState)

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-3 right-3 top-3 z-50 flex w-[min(760px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-cyan-echo/35 bg-slate-950 text-slate-100 shadow-[0_0_60px_rgba(37,232,255,0.2)]">
          <div className="relative min-h-60 overflow-hidden">
            <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-65" src={pack.image} />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-black/15" />
            <div className="relative z-10 flex h-full min-h-60 flex-col justify-between p-5">
              <div className="flex items-start justify-between gap-3">
                <StatusChip label={status.label} status={status.status} />
                <Dialog.Close className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-echo/20 bg-black/45 text-slate-200 hover:bg-cyan-echo/10" type="button">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Dialog.Close>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-echo">{pack.familyName} / {pack.runtimeLaneLabel}</p>
                <Dialog.Title className="mt-2 text-3xl font-black text-white">{pack.name}</Dialog.Title>
                <Dialog.Description className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">{pack.summary}</Dialog.Description>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <section className="grid gap-3 md:grid-cols-4">
              <StatePanel label="Manifest" status={packState?.localManifest.status === 'valid' ? 'healthy' : packState?.localManifest.status === 'invalid' ? 'critical' : 'missing'} value={packState?.localManifest.status ?? 'checking'} />
              <StatePanel label="Catalog" status={packState?.catalog.ok ? 'healthy' : 'warning'} value={packState ? (packState.catalog.ok ? 'approved' : packState.catalog.status) : 'checking'} />
              <StatePanel label="Install" status={packState?.install.installed ? 'healthy' : 'missing'} value={packState?.install.installed ? 'installed' : 'missing'} />
              <StatePanel label="Action" status={status.status} value={action?.kind ?? 'checking'} />
            </section>

            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-soft">Overview</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">Pack readiness</h3>
                </div>
                <StatusChip compact label={pack.phase} status={pack.status === 'playable' ? 'operational' : 'warning'} />
              </div>
              <p className="text-sm leading-6 text-slate-300">{packDetail(pack, packState)}</p>
              {packState?.blockers.length ? (
                <div className="space-y-2">
                  {packState.blockers.map((blocker) => (
                    <div className="rounded-lg border border-amber-echo/30 bg-amber-echo/10 p-3" key={blocker.id}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-amber-100">{blocker.title}</p>
                        <StatusChip compact status={blocker.status} />
                      </div>
                      <p className="mt-2 text-sm leading-5 text-amber-100/85">{blocker.detail}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-soft">Install</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Scoped pack action</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <DetailFact label="Catalog latest" value={packState?.catalog.latestVersion ?? pack.version} />
                <DetailFact label="Installed version" value={packState?.install.version ?? 'Not installed'} />
                <DetailFact label="Manifest path" value={packState?.install.manifestPath ?? packState?.localManifest.manifestPath ?? 'No manifest path'} />
                <DetailFact label="Install folder" value={profileInstallPath ?? packState?.install.installPath ?? 'No install folder selected'} />
              </div>
              <div className="space-y-2">
                <ProgressBar label={busy ? stage : action?.label ?? 'Checking...'} value={busy ? progress : packState?.ok ? 100 : packState ? 62 : 20} />
                <div className="flex flex-wrap gap-2">
                  <CyberButton disabled={disabled} icon={ActionIcon} onClick={() => packState && onAction(packState)} variant={action?.variant ?? 'ghost'}>
                    {busy ? 'Working...' : action?.label ?? 'Checking...'}
                  </CyberButton>
                  <CyberButton icon={FileInput} onClick={onImportManifest} variant="ghost">
                    Import Manifest
                  </CyberButton>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-soft">Profile</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Local files and handoff</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <DetailFact label="Profile id" value={pack.id} />
                <DetailFact label="Minecraft" value={pack.minecraft} />
                <DetailFact label="Channel" value={pack.channel} />
                <DetailFact label="Source repo" value={pack.sourceRepo ?? 'Bundled official pack'} />
              </div>
              <div className="flex flex-wrap gap-2">
                <CyberButton icon={FolderOpen} onClick={onSelectFolder} variant="secondary">
                  Set Folder
                </CyberButton>
                <CyberButton icon={FolderOpen} onClick={onOpenFolder} variant="ghost">
                  Open Folder
                </CyberButton>
                <CyberButton icon={Home} onClick={onOpenHome} variant="ghost">
                  Home
                </CyberButton>
                <CyberButton icon={ShieldAlert} onClick={() => onDiagnostics(pack.id)} variant="ghost">
                  Diagnostics
                </CyberButton>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-soft">Runtime</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{packState?.route.label ?? pack.runtimeLaneLabel}</h3>
              </div>
              <p className="text-sm leading-6 text-slate-300">{packState?.route.detail ?? `${pack.name} uses the ${pack.runtimeLaneLabel} lane.`}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <DetailFact label="Runtime lane" value={pack.runtimeLaneLabel} />
                <DetailFact label="Route" value={packState?.route.shortLabel ?? 'Checking'} />
                <DetailFact label="Modules" value={pack.moduleCount === null ? 'Catalog defined' : `${pack.moduleCount}`} />
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-soft">Content Graph</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">Installed content graph evidence</h3>
                </div>
                <StatusChip
                  compact
                  label={contentGraphLoading ? 'Loading' : contentGraph?.available ? 'Available' : 'Not materialized'}
                  status={contentGraphLoading ? 'warning' : contentGraph?.available ? 'healthy' : 'missing'}
                />
              </div>
              {contentGraph?.available ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <MetricCard icon={Network} label="Modules" value={`${contentGraph.aggregate?.moduleCount ?? 0}`} />
                    <MetricCard icon={Boxes} label="Nodes" value={`${contentGraph.aggregate?.nodeCount ?? 0}`} />
                    <MetricCard icon={Sparkles} label="Edges" value={`${contentGraph.aggregate?.edgeCount ?? 0}`} />
                    <MetricCard icon={Sparkles} label="Features" value={`${contentGraph.aggregate?.featureCount ?? 0}`} />
                    <MetricCard icon={Network} label="Export Plans" value={`${contentGraph.aggregate?.exportPlanCount ?? 0}`} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <DetailFact label="Evidence source" value={contentGraph.aggregate?.source === 'release-evidence' ? 'Release evidence' : 'Installed scan'} />
                    <DetailFact label="Evidence schema" value={contentGraph.evidenceSchemaVersion ?? 'echo.content_graph.evidence.v1'} />
                  </div>
                  {(contentGraph.aggregate?.hytaleBlockerCount ?? 0) > 0 ? (
                    <WarningCard
                      tone="amber"
                      title="Hytale export blockers"
                      text={`${contentGraph.aggregate?.hytaleBlockerCount} blocker(s) across installed modules prevent a clean Hytale export plan. Hytale status is planning evidence, not runtime support.`}
                    />
                  ) : null}
                  {(contentGraph.aggregate?.modules ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {contentGraph.aggregate?.modules.slice(0, 5).map((moduleSummary) => (
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2" key={moduleSummary.moduleId}>
                          <p className="text-sm font-medium text-white">{moduleSummary.moduleId}</p>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                            <span>{moduleSummary.nodeCount} nodes</span>
                            <span>{moduleSummary.edgeCount} edges</span>
                            <span>{moduleSummary.featureCount} features</span>
                            <span>{moduleSummary.exportPlanCount ?? 0} plans</span>
                          </div>
                        </div>
                      ))}
                      {(contentGraph.aggregate?.modules.length ?? 0) > 5 ? (
                        <p className="text-xs text-slate-500">+{(contentGraph.aggregate?.modules.length ?? 0) - 5} more modules</p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-300">
                  {contentGraphLoading
                    ? 'Reading installed content graph evidence...'
                    : contentGraph?.message ?? 'Run install or repair for this pack to materialize .ECHO Content Graph evidence.'}
                </p>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

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

function StatePanel({ label, value, status }: { label: string; value: string; status: HealthStatus }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <StatusChip compact status={status} />
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white" title={value}>{value}</p>
    </div>
  )
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cyan-soft/20 bg-black/30 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words font-mono text-xs text-slate-200">{value}</p>
    </div>
  )
}
