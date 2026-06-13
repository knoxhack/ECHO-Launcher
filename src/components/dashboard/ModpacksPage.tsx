import { Archive, Boxes, Eye, FileInput, FolderSearch, LockKeyhole, Play, RadioTower, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { officialModpacksFromReleaseIndex, type OfficialModpack } from '../../data/officialModpacks'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useLauncherStore } from '../../stores/launcherStore'
import { usePackOsStore } from '../../stores/packOsStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReleaseStore } from '../../stores/releaseStore'

import type { NativeImportCandidate } from '../../types/native'
import type { PageId, ToolsTabId } from '../../types/launcher'
import type { PackOsLauncherPackState } from '../../types/packos'
import type { ReleaseEntry, ReleaseIndex } from '../../types/releases'
import { packOsHealthStatus, packOsUiStateLabel } from '../../utils/packosStatus'
import { latestPlayableReleaseForPack, releaseAcceptedCount, releaseRejectedCount } from '../../utils/releaseValidation'
import { cn } from '../../utils/cn'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { MetricCard } from '../cyber/MetricCard'
import { StatusChip } from '../cyber/StatusChip'
import { WarningCard } from '../cyber/WarningCard'

const packOsIdAliases: Record<string, string> = {
  'echo-prime': 'echo_prime',
  'arcane-division': 'arcana_division',
  'arcana-division': 'arcana_division',
  'arcana-division-native-edition': 'arcana_division',
  'arcana-division-neoforge-edition': 'arcana_division',
  'arcana-division-standalone-edition': 'arcana_division',
  orbital: 'pack2_draft',
}

function packOsIdFor(packId: string) {
  return packOsIdAliases[packId] ?? packId
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
  const packOs = usePackOsStore((state) => state.packOs)
  const refreshPackOs = usePackOsStore((state) => state.refreshPackOs)
  const [importCandidates, setImportCandidates] = useState<NativeImportCandidate[]>([])
  const [scanningImports, setScanningImports] = useState(false)
  const visibleModpacks = useMemo(() => officialModpacksFromReleaseIndex(releaseIndex), [releaseIndex])

  const playableRelease = useMemo<ReleaseEntry | null>(
    () => releaseIndex?.latestPlayableRelease ?? releaseIndex?.releases[0] ?? null,
    [releaseIndex],
  )
  const rejectedCount = releaseRejectedCount(releaseIndex)
  const playablePackCount = visibleModpacks.filter((pack) => pack.status === 'playable').length
  const selectedPack = visibleModpacks.find((pack) => pack.id === selectedProfileId) ?? visibleModpacks[0]

  const refreshReleases = useCallback(async (refresh = false, announce = refresh) => {
    try {
      const index = await loadReleases(refresh)
      const hasPlayableRelease = index.releases.length > 0
      const accepted = releaseAcceptedCount(index)
      const rejected = releaseRejectedCount(index)
      if (announce) {
        addToast(
          hasPlayableRelease ? 'Approved release loaded' : 'Catalog checked',
          `${accepted} approved release${accepted === 1 ? '' : 's'} loaded; ${rejected} catalog diagnostic${rejected === 1 ? '' : 's'} tracked.`,
          accepted ? 'success' : 'warning',
        )
      }
    } catch (error) {
      if (announce) {
        addToast('Catalog unavailable', error instanceof Error ? error.message : 'Check the Release Index channel in Settings.', 'warning')
      }
    }
  }, [addToast, loadReleases])

  useEffect(() => {
    void refreshPackOs()
  }, [refreshPackOs])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshReleases(false, false), 0)
    return () => window.clearTimeout(timer)
  }, [refreshReleases])

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
      const imported = await invokeNative('manifest:import', { filePath: file.path, profileId: selectedPack?.id })
      addToast('Manifest imported', `${imported.manifest.version} saved to ${imported.manifestPath}`, 'success')
    } catch (error) {
      addToast('Manifest import failed', error instanceof Error ? error.message : 'Unable to import manifest.', 'danger')
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
        const folder = await invokeNative('dialog:select-directory', {
          title: 'Select an existing ECHO install',
        })
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

  const importCandidate = async (candidate: NativeImportCandidate) => {
    try {
      const result = await invokeNative('instance:import', { path: candidate.path, name: candidate.name || 'ECHO Pack' })
      const profiles = await invokeNative('profile:list')
      setProfiles(profiles)
      addToast(result.ok ? 'Install linked' : 'Import failed', `${result.profile.name} now points to ${result.profile.installPath}.`, result.ok ? 'success' : 'danger')
    } catch (error) {
      addToast('Import failed', error instanceof Error ? error.message : 'Unable to import selected install.', 'danger')
    }
  }

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-echo">Official Packs</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">ECHO Modpacks</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Official ECHO packs are tracked here from the Release Index channel. Approved entries unlock installs; warning-gated and unpublished families stay visible with diagnostics.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CyberButton
              icon={Play}
              onClick={() => {
                if (selectedPack) setSelectedProfileId(selectedPack.id)
                setActivePage('home')
              }}
              variant="primary"
            >
              Open Selected Pack
            </CyberButton>
            <CyberButton disabled={loadingReleases} icon={RadioTower} onClick={() => void refreshReleases(true, true)} variant="secondary">
              {loadingReleases ? 'Refreshing...' : 'Refresh Catalog'}
            </CyberButton>
            <CyberButton disabled={scanningImports} icon={FolderSearch} onClick={() => void scanImports(false)} variant="secondary">
              {scanningImports ? 'Scanning...' : 'Scan Imports'}
            </CyberButton>
          </div>
        </div>
      </GlassCard>

      <GlassCard tone={playableRelease ? 'success' : 'amber'}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-soft">ECHO Catalog</p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              {'ECHO Catalog'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {playableRelease
                ? `${playableRelease.name} is ready for strict install.`
                : 'No playable pack release is available until echo-release.json, the pack manifest, and the pack archive are uploaded together.'}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard icon={Boxes} label="Official Packs" value={`${visibleModpacks.length}`} />
            <MetricCard icon={RadioTower} label="Playable" value={`${playablePackCount}`} />
            <MetricCard icon={Archive} label="Trust" value={playableRelease ? 'Verified' : 'Missing'} tone={playableRelease ? 'success' : 'amber'} />
          </div>
        </div>
        {rejectedCount > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-echo/30 bg-amber-echo/10 p-3 text-sm leading-6 text-amber-100">
            {rejectedCount} Catalog diagnostic{rejectedCount === 1 ? '' : 's'} tracked. {releaseIndex?.warnings[0] ?? 'Open Downloads for exact asset diagnostics.'}
          </div>
        ) : null}
      </GlassCard>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleModpacks.map((pack) => (
            <OfficialPackCard
              key={pack.id}
              pack={pack}
              packOsState={packOs?.packs.find((state) => state.packId === packOsIdFor(pack.id))}
              releaseIndex={releaseIndex}
              selected={pack.id === selectedProfileId}
              addToast={addToast}
              setActivePage={setActivePage}
              setSelectedProfileId={setSelectedProfileId}
              setActiveToolsTab={setActiveToolsTab}
            />
          ))}
        </div>

        <GlassCard>
          <div className="grid gap-2">
            <CyberButton icon={FolderSearch} onClick={() => void scanImports(true)} variant="secondary">
              Manual Import
            </CyberButton>
            <CyberButton icon={FileInput} onClick={() => void importManifest()} variant="secondary">
              Import Manifest
            </CyberButton>
          </div>
        </GlassCard>
      </div>

      {importCandidates.length > 0 ? (
        <GlassCard tone="cyan">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-soft">Guided Import</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Detected ECHO Installs</h3>
            </div>
            <StatusChip label={`${importCandidates.length} found`} status="update_available" />
          </div>
          <div className="grid gap-3">
            {importCandidates.map((candidate) => (
              <div className="grid gap-3 rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 lg:grid-cols-[1fr_auto]" key={candidate.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{candidate.name}</p>
                    <StatusChip compact status={candidate.alreadyManaged ? 'healthy' : 'warning'} label={candidate.alreadyManaged ? 'Managed' : 'Importable'} />
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-slate-400">{candidate.path}</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Detected by {candidate.detectedBy.join(', ')} / {candidate.moduleCount} modules
                  </p>
                </div>
                <CyberButton disabled={candidate.alreadyManaged} icon={FileInput} onClick={() => void importCandidate(candidate)} variant="primary">
                  Link Install
                </CyberButton>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      <WarningCard
        text="Preview packs stay view-only until they have approved Release Index metadata and a supported player flow. Warning-gated Ashfall builds do not create install profiles."
        title="Official Pack Safety"
      />
    </div>
  )
}

const OfficialPackCard = memo(function OfficialPackCard({
  pack,
  packOsState,
  releaseIndex,
  selected,
  addToast,
  setActivePage,
  setSelectedProfileId,
  setActiveToolsTab,
}: {
  pack: OfficialModpack
  packOsState?: PackOsLauncherPackState
  releaseIndex: ReleaseIndex | null
  selected: boolean
  addToast: (title: string, detail?: string, tone?: 'success' | 'warning' | 'danger' | 'info') => void
  setActivePage: (page: PageId) => void
  setSelectedProfileId: (profileId: string) => void
  setActiveToolsTab: (tab: ToolsTabId) => void
}) {
  const playableRelease = latestPlayableReleaseForPack(releaseIndex, pack.id)
  const reportAllowsLauncher = packOsState ? packOsState.launcherVisible : pack.status === 'playable'
  const isPlayable = pack.status === 'playable' && reportAllowsLauncher
  const ready = isPlayable && Boolean(playableRelease)
  const version = isPlayable ? playableRelease?.version ?? 'not published' : pack.version
  const releaseLine = isPlayable ? playableRelease?.name ?? 'Awaiting strict release assets' : pack.phase
  const packOsStatus = packOsHealthStatus(packOsState ?? null)
  const packOsLabel = packOsState ? packOsUiStateLabel(packOsState.uiState) : 'No Report'
  const playBlocked = Boolean(packOsState && packOsState.launchAllowed === false && packOsState.uiState !== 'unknown')
  const playState = isPlayable
    ? playBlocked
      ? 'Blocked'
      : ready
        ? 'Enabled'
        : pack.betaGate === 'open'
          ? 'Missing release'
          : 'Gated'
    : 'Locked'
  const routeLabel = pack.runtimeMode === 'native-runtime' ? 'Standalone' : pack.runtimeMode === 'native-loader-minecraft' ? 'Native Loader' : 'NeoForge'
  const openSelectedPack = () => {
    setSelectedProfileId(pack.id)
    setActivePage('home')
    addToast(
      `${pack.name} selected`,
      ready
        ? 'Home is ready with the install, repair, or play action for this pack.'
        : isPlayable
          ? 'Home will show what setup is still missing for this pack.'
          : pack.diagnostic ?? pack.detail,
      ready ? 'success' : 'info',
    )
  }
  const openDiagnostics = () => {
    setSelectedProfileId(pack.id)
    setActiveToolsTab('diagnostics')
    setActivePage('tools')
  }
  const primaryActionLabel = ready ? 'Open Pack' : isPlayable ? 'Resolve Setup' : 'Inspect Gate'

  useEffect(() => {
    if (!selected) return
    const image = new Image()
    image.decoding = 'async'
    image.src = pack.image
  }, [pack.image, selected])

  return (
    <GlassCard
      className={cn('overflow-hidden p-0 transition duration-150', selected && 'ring-2 ring-cyan-echo/70')}
      tone={isPlayable ? (ready ? 'default' : 'amber') : 'default'}
    >
      <div className="relative aspect-[16/9] min-h-72 overflow-hidden">
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-200 hover:opacity-95"
          decoding="async"
          fetchPriority={selected ? 'high' : 'auto'}
          loading={selected ? 'eager' : 'lazy'}
          src={pack.image}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-transparent" />
        <div className="absolute left-5 top-5 flex flex-wrap gap-2">
          {selected ? <StatusChip compact label="Selected" status="update_available" /> : null}
          <StatusChip compact label={isPlayable ? 'Playable' : 'Preview'} status={ready ? 'healthy' : isPlayable ? 'warning' : 'queued'} />
          <StatusChip compact label={packOsLabel} status={packOsStatus} />
          <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-semibold uppercase text-slate-200 backdrop-blur">
            {pack.phase}
          </span>
        </div>
        <div className="absolute bottom-5 left-5 right-5">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-amber-echo">{releaseLine}</p>
              <h3 className="mt-1 text-2xl font-black leading-tight text-white 2xl:text-3xl">{pack.name}</h3>
              <p className="mt-2 max-w-xl break-words pr-4 text-sm leading-5 text-slate-200">{pack.summary}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <CyberButton icon={Play} onClick={openSelectedPack} size="sm" variant="primary">
                {primaryActionLabel}
              </CyberButton>
              <CyberButton icon={ShieldAlert} onClick={openDiagnostics} size="sm" variant="ghost">
                Verify
              </CyberButton>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-full flex-col justify-between gap-5 p-5">
        <div>
          <p className="text-sm leading-6 text-slate-300">
            {isPlayable
              ? playableRelease?.releaseNotes[0] ?? `Upload echo-release.json, ${pack.id}-${pack.channel}-version.pack.json, and the matching pack archive to enable tester installs.`
              : pack.detail}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <PackStat icon={Boxes} label="Version" value={version} />
            <PackStat icon={Archive} label="Route" value={routeLabel} />
            <PackStat icon={isPlayable ? Archive : Eye} label={isPlayable ? 'Manifest' : 'Access'} value={isPlayable ? (ready ? 'Verified' : 'Missing') : 'Preview only'} />
            <PackStat icon={RadioTower} label="Channel" value={packOsState?.channel ?? pack.channel} />
            <PackStat icon={ShieldAlert} label="PackOS" value={packOsLabel} />
            <PackStat icon={LockKeyhole} label="Play" value={playState} />
          </div>
        </div>

      </div>
    </GlassCard>
  )
})

function PackStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs uppercase text-slate-500">{label}</p>
        <p className="truncate font-semibold text-white">{value}</p>
      </div>
    </div>
  )
}
