import { Archive, CheckCircle2, DownloadCloud, FileInput, FolderOpen, HardDrive, RadioTower, RotateCcw, ShieldAlert, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { installService } from '../../services/InstallService'
import { launchService } from '../../services/LaunchService'
import { releaseService } from '../../services/ReleaseService'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useLauncherStore } from '../../stores/launcherStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReleaseStore } from '../../stores/releaseStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { NativeInstallResult } from '../../types/native'
import type { ReleaseEntry } from '../../types/releases'
import { isPlayablePackRelease, latestPlayableReleaseForPack, releaseAcceptedCount, releaseRejectedCount } from '../../utils/releaseValidation'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { MetricCard } from '../cyber/MetricCard'
import { ProgressBar } from '../cyber/ProgressBar'
import { SectionHeader } from '../cyber/SectionHeader'
import { StatusChip } from '../cyber/StatusChip'

export function DownloadsPage() {
  const addToast = useLauncherStore((state) => state.addToast)
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const profiles = useProfileStore((state) => state.profiles)
  const setProfiles = useProfileStore((state) => state.setProfiles)
  const advancedMode = useSettingsStore((state) => state.advancedMode)
  const creatorMode = useSettingsStore((state) => state.creatorMode)
  const releaseIndex = useReleaseStore((state) => state.releaseIndex)
  const loadingReleases = useReleaseStore((state) => state.loadingReleases)
  const loadReleases = useReleaseStore((state) => state.loadReleases)
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0]
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installStage, setInstallStage] = useState('Ready')
  const [installDetail, setInstallDetail] = useState('')
  const [installReport, setInstallReport] = useState<NativeInstallResult | null>(null)
  const [manifestPath, setManifestPath] = useState<string | undefined>()
  const [selectedVersion, setSelectedVersion] = useState<string | undefined>()

  const channelReleases = useMemo(
    () => releaseIndex?.releases.filter((release) => isPlayablePackRelease(release, selectedProfile.id)) ?? [],
    [releaseIndex?.releases, selectedProfile.id],
  )
  const latestRelease = useMemo(() => latestPlayableReleaseForPack(releaseIndex, selectedProfile.id), [releaseIndex, selectedProfile.id])
  const selectedRelease = useMemo<ReleaseEntry | null>(
    () => channelReleases.find((release) => release.version === selectedVersion) ?? latestRelease ?? channelReleases[0] ?? null,
    [channelReleases, latestRelease, selectedVersion],
  )
  const acceptedCount = releaseAcceptedCount(releaseIndex)
  const rejectedCount = releaseRejectedCount(releaseIndex)
  const releaseDiagnostics = useMemo(
    () => releaseIndex?.diagnostics?.filter((diagnostic) => diagnostic.severity !== 'info') ?? [],
    [releaseIndex?.diagnostics],
  )
  const canInstallSelectedRelease = Boolean(manifestPath || isPlayablePackRelease(selectedRelease, selectedProfile.id))
  const strictReleaseMissing = acceptedCount === 0 && !manifestPath

  const totals = useMemo(() => {
    if (!installReport) return { total: 0, completed: 0, blocked: 0 }
    const total = installReport.after.scanned + installReport.skipped.length + installReport.failed.length
    const completed = installReport.installed.length + installReport.verified.length + (installReport.updated?.length ?? 0)
    const blocked = installReport.skipped.length + installReport.failed.length + installReport.after.missing.length + installReport.after.corrupt.length
    return { total, completed, blocked }
  }, [installReport])

  const progress = totals.total === 0 ? 0 : Math.round((totals.completed / totals.total) * 100)
  const displayedProgress = installing ? installProgress : installReport?.ok ? 100 : progress
  const installAction = selectedRelease?.version && selectedProfile.status === 'healthy' && selectedProfile.version !== selectedRelease.version ? 'Update Ashfall' : 'Install Ashfall'
  const completedOperationLabel = installReport?.operation === 'update' ? 'Update' : installReport?.operation === 'verify' ? 'Verification' : 'Install'
  const progressLabel = installing ? installStage : installReport?.ok ? `${completedOperationLabel} complete` : installReport ? 'Install needs attention' : 'Install/update progress'

  const refreshReleases = useCallback(async (refresh = false, announce = refresh) => {
    try {
      const index = await loadReleases(refresh)
      const first = latestPlayableReleaseForPack(index, selectedProfile.id)
      setSelectedVersion(first?.version)
      if (announce) {
        const accepted = releaseAcceptedCount(index)
        const rejected = releaseRejectedCount(index)
        addToast('Catalog loaded', `${accepted} approved release${accepted === 1 ? '' : 's'} loaded; ${rejected} catalog diagnostic${rejected === 1 ? '' : 's'} tracked.`, accepted ? 'success' : 'warning')
      }
    } catch (error) {
      if (announce) {
        addToast('Catalog unavailable', error instanceof Error ? error.message : 'Check the Release Index channel in Settings.', 'warning')
      }
    }
  }, [addToast, loadReleases, selectedProfile.id])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshReleases(false, false), 0)
    return () => window.clearTimeout(timer)
  }, [refreshReleases])

  const importManifest = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Manifest import reads local files and requires npm run desktop.', 'warning')
      return
    }
    const file = await invokeNative('dialog:select-file', {
      title: 'Import Ashfall pack manifest',
      filters: [{ name: 'Ashfall Manifest', extensions: ['json'] }],
    })
    if (file.canceled || !file.path) return
    try {
      const imported = await invokeNative('manifest:import', { filePath: file.path })
      setManifestPath(imported.manifestPath)
      addToast('Manifest imported', `${imported.manifest.version} saved to ${imported.manifestPath}`, 'success')
    } catch (error) {
      addToast('Manifest import failed', error instanceof Error ? error.message : 'Unable to import manifest.', 'danger')
    }
  }

  const selectInstallFolder = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Selecting install folders requires npm run desktop.', 'warning')
      return
    }
    const result = await invokeNative('dialog:select-directory', {
      title: `Select install folder for ${selectedProfile.name}`,
      defaultPath: selectedProfile.installPath,
    })
    if (result.canceled || !result.path) return
    const updated = { ...selectedProfile, installPath: result.path }
    await invokeNative('profile:save', updated)
    addToast('Install folder saved', result.path, 'success')
  }

  const fetchSelectedManifest = async () => {
    try {
      const result = await releaseService.fetchManifest(selectedProfile.channel, selectedRelease?.version, true, selectedProfile.id)
      setManifestPath(undefined)
      addToast(
        result.cached ? 'Manifest cache verified' : 'Release manifest fetched',
        `${result.manifest.version} saved to ${result.manifestPath}`,
        'success',
      )
    } catch (error) {
      addToast('Manifest fetch failed', error instanceof Error ? error.message : 'Unable to fetch release manifest.', 'danger')
    }
  }

  const runInstall = async () => {
    setInstalling(true)
    const operationId = launchService.createOperationId('install')
    let pollTimer: number | undefined
    const pollStatus = async () => {
      try {
        const status = await launchService.getOperationStatus(operationId)
        if (status.status === 'idle') return
        setInstallProgress(status.progress)
        setInstallStage(status.label)
        setInstallDetail(status.message ?? '')
      } catch {
        // The install result handles the visible error state.
      }
    }

    setInstallProgress(6)
    setInstallStage('Resolving strict release assets')
    setInstallDetail('')
    setInstallReport(null)
    addToast('Install/update started', 'Verifying current files and downloading configured artifacts.', 'info')
    try {
      pollTimer = window.setInterval(() => void pollStatus(), 500)
      void pollStatus()
      const result = await installService.runInstall({
        profileId: selectedProfile.id,
        installPath: selectedProfile.installPath,
        manifestPath,
        channel: selectedProfile.channel,
        pack: selectedProfile.id,
        version: selectedRelease?.version,
        operationId,
        refresh: true,
      })
      setInstallReport(result)
      setInstallProgress(result.ok ? 100 : 96)
      setInstallStage(result.ok ? 'Install complete' : 'Install needs attention')
      setInstallDetail(result.ok ? result.installPath : `${result.skipped.length + result.failed.length + result.after.missing.length + result.after.corrupt.length} files still need attention.`)
      invokeNative('profile:list')
        .then(setProfiles)
        .catch(() => undefined)
      addToast(
        result.ok ? 'Install/update complete' : 'Install/update completed with blocked files',
        result.ok
          ? `Installed ${result.installed.length} and verified ${result.verified.length}.`
          : `${result.skipped.length + result.failed.length + result.after.missing.length + result.after.corrupt.length} files still need attention.`,
        result.ok ? 'success' : 'warning',
      )
    } catch (error) {
      setInstallProgress(0)
      setInstallStage('Install failed')
      setInstallDetail(error instanceof Error ? error.message : 'Unable to run install/update.')
      addToast('Install/update failed', error instanceof Error ? error.message : 'Unable to run install/update.', 'danger')
    } finally {
      if (pollTimer) window.clearInterval(pollTimer)
      setInstalling(false)
    }
  }

  const openReport = async () => {
    if (!installReport) return
    await invokeNative('shell:open-path', { path: installReport.reportPath })
  }

  const openInstallFolder = async () => {
    if (!selectedProfile.installPath) {
      addToast('Install folder not set', 'Select an install folder first.', 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Opening local folders requires npm run desktop.', 'warning')
      return
    }
    await invokeNative('shell:open-path', { path: selectedProfile.installPath })
  }

  return (
    <div className="space-y-6">
      <GlassCard tone="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-soft">Downloads</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Install & Update Pipeline</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Installs Ashfall from approved Catalog install packages, verifies SHA-256 hashes, and writes a local install report for Minecraft Launcher handoff.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <MetricCard icon={DownloadCloud} label="Downloaded" value={`${installReport?.downloaded?.length ?? 0}`} />
            <MetricCard icon={CheckCircle2} label="Verified" tone="success" value={`${installReport?.verified.length ?? 0}`} />
            <MetricCard icon={ShieldAlert} label="Updated" tone="amber" value={`${installReport?.updated?.length ?? 0}`} />
            <MetricCard icon={XCircle} label="Removed" tone={installReport?.removed?.length ? 'danger' : 'cyan'} value={`${installReport?.removed?.length ?? 0}`} />
          </div>
        </div>
        <div className="mt-5">
          <ProgressBar label={progressLabel} value={displayedProgress} />
          {installing && installDetail ? <p className="mt-2 break-all text-xs text-slate-400">{installDetail}</p> : null}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-cyan-soft">
              <RadioTower className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase">Catalog</p>
            </div>
            <p className="mt-2 text-sm font-semibold text-white">
              {'ECHO Catalog'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Approved {acceptedCount} / diagnostics {rejectedCount}</p>
          </div>
          <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Selected Release</p>
            <p className="mt-2 text-sm font-semibold text-white">{selectedRelease ? `${selectedRelease.channel} ${selectedRelease.version}` : 'No release selected'}</p>
          </div>
          <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Manifest Trust</p>
            <p className="mt-2 text-sm font-semibold text-white">
              {isPlayablePackRelease(selectedRelease, selectedProfile.id)
                ? 'Verified checksum metadata'
                : 'Blocked until echo-release.json and manifest hash exist'}
            </p>
          </div>
        </div>
        {releaseDiagnostics.length > 0 ? (
          <div className="mt-5 rounded-lg border border-amber-echo/35 bg-amber-echo/10 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-amber-100">Release diagnostics</p>
              <StatusChip label={`${releaseDiagnostics.length} issue${releaseDiagnostics.length === 1 ? '' : 's'}`} status="warning" />
            </div>
            <div className="space-y-2">
              {releaseDiagnostics.slice(0, 5).map((diagnostic) => (
                <div className="rounded-lg border border-amber-echo/25 bg-black/25 p-3" key={`${diagnostic.tagName}-${diagnostic.reason}`}>
                  <p className="text-xs font-semibold uppercase text-amber-echo">{diagnostic.tagName}</p>
                  <p className="mt-1 text-sm leading-5 text-amber-100">{diagnostic.reason}</p>
                  {diagnostic.assets.length > 0 ? <p className="mt-1 break-all text-xs text-amber-100/70">Assets: {diagnostic.assets.join(', ')}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {strictReleaseMissing ? (
          <div className="mt-5 rounded-lg border border-amber-echo/40 bg-amber-echo/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-amber-100">Strict Ashfall release assets are missing</p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/90">
                  Tester installs stay locked until the Catalog entry includes trusted metadata, the hashed pack manifest, and the matching compressed pack archive.
                </p>
              </div>
              <StatusChip label="Non-playable" status="warning" />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {['echo-release.json', `${selectedProfile.id}-${selectedProfile.channel}-<version>.pack.json`, 'metadata-named .echo-pack.zip or pack.zip'].map((asset) => (
                <div className="rounded-lg border border-amber-echo/30 bg-black/25 px-3 py-2 font-mono text-xs text-amber-100" key={asset}>
                  {asset}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <GlassCard>
          <SectionHeader eyebrow="Target" title="Selected Profile" />
          <div className="space-y-4">
            <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">{selectedProfile.name}</p>
              <p className="mt-1 text-xs text-slate-400">
                Installed {selectedProfile.version} / Catalog latest {latestRelease?.version ?? 'not loaded'} / Minecraft {selectedProfile.minecraft} / NeoForge {selectedProfile.neoforge}
              </p>
            </div>
            <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
              <p className="text-xs text-slate-500">Approved Release</p>
              {channelReleases.length > 0 ? (
                <select
                  className="mt-2 h-10 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm text-white"
                  onChange={(event) => setSelectedVersion(event.target.value)}
                  value={selectedRelease?.version ?? ''}
                >
                  {channelReleases.map((release) => (
                    <option key={release.id} value={release.version}>
                      {release.version} / {release.tagName}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-xs text-slate-300">Catalog releases are still loading, or this pack is not installed yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
              <p className="text-xs text-slate-500">Manual Manifest Override</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-200">{manifestPath ?? 'Using ECHO Catalog manifest'}</p>
            </div>
            <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
              <p className="text-xs text-slate-500">Install Folder</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-200">{selectedProfile.installPath ?? 'No install folder selected'}</p>
            </div>
            <div className="grid gap-2">
              <CyberButton disabled={installing || !canInstallSelectedRelease} icon={RotateCcw} onClick={() => void runInstall()} variant="primary">
                {installing ? 'Working...' : installAction}
              </CyberButton>
              <CyberButton disabled={loadingReleases} icon={RadioTower} onClick={() => void refreshReleases(true, true)} variant="secondary">
                {loadingReleases ? 'Refreshing...' : 'Refresh Releases'}
              </CyberButton>
              <CyberButton disabled={!isPlayablePackRelease(selectedRelease, selectedProfile.id)} icon={DownloadCloud} onClick={() => void fetchSelectedManifest()} variant="secondary">
                Fetch Trusted Manifest
              </CyberButton>
              {advancedMode || creatorMode ? (
                <CyberButton icon={FileInput} onClick={() => void importManifest()} variant="secondary">
                  Import Manifest Override
                </CyberButton>
              ) : null}
              <CyberButton icon={HardDrive} onClick={() => void selectInstallFolder()} variant="ghost">
                Set Install Folder
              </CyberButton>
              <CyberButton icon={FolderOpen} onClick={() => void openInstallFolder()} variant="ghost">
                Open Install Folder
              </CyberButton>
            </div>
          </div>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard tone={installReport?.ok ? 'success' : installReport ? 'amber' : 'default'}>
            <SectionHeader
              action={
                installReport ? (
                  <CyberButton icon={Archive} onClick={() => void openReport()} size="sm" variant="secondary">
                    Open Report
                  </CyberButton>
                ) : null
              }
              eyebrow="Install Report"
              title={installReport ? `Report ${installReport.installId}` : 'No Install Run Yet'}
            />
            {installReport ? (
              <div className="grid gap-3 md:grid-cols-2">
                <ReportBlock label="Operation" value={installReport.operation ?? 'install'} />
                <ReportBlock label="Install Path" value={installReport.installPath} />
                <ReportBlock label="Report Path" value={installReport.reportPath} />
                <ReportBlock label="Remaining Missing" value={installReport.after.missing.join(', ') || 'none'} />
                <ReportBlock label="Remaining Corrupt" value={installReport.after.corrupt.join(', ') || 'none'} />
              </div>
            ) : (
              <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
                Select an approved Catalog release or import a strict local manifest, then install. Ashfall installs require echo-release.json plus the hashed pack manifest and the metadata-named compressed pack archive.
              </div>
            )}
          </GlassCard>

          <InstallList title="Downloaded Assets" files={installReport?.downloaded ?? []} status="completed" />
          <InstallList title="Installed Files" files={installReport?.installed ?? []} status="completed" />
          <InstallList title="Updated Files" files={installReport?.updated ?? []} status="completed" />
          <InstallList title="Removed Managed Files" files={installReport?.removed ?? []} status="failed" />
          <InstallList title="Verified Existing Files" files={installReport?.verified ?? []} status="completed" />
          <IssueList title="Skipped Files" issues={installReport?.skipped ?? []} status="paused" />
          <IssueList title="Failed Files" issues={installReport?.failed ?? []} status="failed" />
        </div>
      </div>
    </div>
  )
}

function ReportBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cyan-soft/20 bg-black/30 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-200">{value}</p>
    </div>
  )
}

function InstallList({ title, files, status }: { title: string; files: string[]; status: 'completed' | 'paused' | 'failed' }) {
  return (
    <GlassCard>
      <SectionHeader eyebrow="Files" title={title} />
      {files.length === 0 ? (
        <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 text-sm text-slate-400">No files in this lane.</div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-3" key={file}>
              <span className="break-all font-mono text-xs text-slate-200">{file}</span>
              <StatusChip status={status} />
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}

function IssueList({
  title,
  issues,
  status,
}: {
  title: string
  issues: Array<{ path: string; reason: string }>
  status: 'paused' | 'failed'
}) {
  return (
    <GlassCard tone={issues.length > 0 ? (status === 'failed' ? 'danger' : 'amber') : 'default'}>
      <SectionHeader eyebrow="Files" title={title} />
      {issues.length === 0 ? (
        <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 text-sm text-slate-400">No files in this lane.</div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-3" key={issue.path}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="break-all font-mono text-xs text-slate-200">{issue.path}</span>
                <StatusChip status={status} />
              </div>
              <p className="text-sm leading-6 text-slate-300">{issue.reason}</p>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
