import { Archive, CheckCircle2, FileCheck2, FolderOpen, GitBranch, Save, UploadCloud, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useLauncherStore } from '../../stores/launcherStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { PublisherDiffResult, PublisherFile, PublisherPublishResult, PublisherScanResult, PublisherSettingsState } from '../../types/native'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { MetricCard } from '../cyber/MetricCard'
import { SectionHeader } from '../cyber/SectionHeader'
import { StatusChip } from '../cyber/StatusChip'

const emptyPublisherSettings: PublisherSettingsState = {
  owner: '',
  repo: '',
  hasToken: false,
}

export function PublisherPage() {
  const addToast = useLauncherStore((state) => state.addToast)
  const settings = useSettingsStore()
  const setPublisher = useSettingsStore((state) => state.setPublisher)
  const [publisherSettings, setPublisherSettings] = useState<PublisherSettingsState>(settings.publisher ?? emptyPublisherSettings)
  const [owner, setOwner] = useState(settings.publisher?.owner ?? settings.releaseFeed.owner)
  const [repo, setRepo] = useState(settings.publisher?.repo ?? settings.releaseFeed.repo)
  const [token, setToken] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [version, setVersion] = useState('')
  const [changelog, setChangelog] = useState('Ashfall hybrid release.')
  const [scan, setScan] = useState<PublisherScanResult | null>(null)
  const [diff, setDiff] = useState<PublisherDiffResult | null>(null)
  const [publishReport, setPublishReport] = useState<PublisherPublishResult | null>(null)
  const [busy, setBusy] = useState<'settings' | 'scan' | 'diff' | 'publish' | null>(null)

  useEffect(() => {
    if (!isNativeAvailable()) return
    invokeNative('publisher:get-settings')
      .then((result) => {
        setPublisherSettings(result)
        setPublisher(result)
        setOwner(result.owner)
        setRepo(result.repo)
      })
      .catch((error: unknown) => addToast('Publisher settings unavailable', error instanceof Error ? error.message : 'Unable to load publisher settings.', 'warning'))
  }, [addToast, setPublisher])

  const changelogLines = useMemo(
    () =>
      changelog
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean),
    [changelog],
  )

  const selectSourceFolder = async () => {
    const result = await invokeNative('dialog:select-directory', {
      title: 'Select Ashfall source modpack folder',
      defaultPath: sourcePath || undefined,
    })
    if (!result.canceled && result.path) {
      setSourcePath(result.path)
      addToast('Source folder selected', result.path, 'success')
    }
  }

  const savePublisherSettings = async () => {
    setBusy('settings')
    try {
      const saved = await invokeNative('publisher:save-settings', {
        owner,
        repo,
        token: token.trim() || undefined,
      })
      setPublisherSettings(saved)
      setPublisher(saved)
      setToken('')
      addToast('Publisher settings saved', `${saved.owner}/${saved.repo}${saved.hasToken ? ' with token' : ''}`, 'success')
    } catch (error) {
      addToast('Publisher settings failed', error instanceof Error ? error.message : 'Unable to save publisher settings.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  const runScan = async () => {
    setBusy('scan')
    try {
      const result = await invokeNative('publisher:scan', {
        sourcePath: sourcePath || undefined,
        version,
        channel: 'stable',
      })
      setScan(result)
      setDiff(null)
      setPublishReport(null)
      if (!sourcePath) setSourcePath(result.sourcePath)
      addToast('Pack scan complete', `${result.counts.totalFiles} files hashed.`, 'success')
    } catch (error) {
      addToast('Pack scan failed', error instanceof Error ? error.message : 'Unable to scan pack source.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  const runDiff = async () => {
    setBusy('diff')
    try {
      const result = await invokeNative('publisher:diff', {
        sourcePath: sourcePath || undefined,
        version,
        channel: 'stable',
        refresh: true,
      })
      setDiff(result)
      setScan(result.scan)
      if (!sourcePath) setSourcePath(result.scan.sourcePath)
      addToast('Release diff ready', `${result.upload.length} files need upload for ${result.targetVersion}.`, result.warnings.length ? 'warning' : 'success')
    } catch (error) {
      addToast('Release diff failed', error instanceof Error ? error.message : 'Unable to compare release manifest.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  const publishRelease = async () => {
    setBusy('publish')
    try {
      const result = await invokeNative('publisher:publish', {
        sourcePath: sourcePath || undefined,
        version,
        channel: 'stable',
        changelog: changelogLines,
        owner,
        repo,
        token: token.trim() || undefined,
        saveToken: Boolean(token.trim()),
        prerelease: version.includes('beta') || version.includes('alpha') || version.includes('rc'),
      })
      setPublishReport(result)
      if (token.trim()) {
        const saved = await invokeNative('publisher:get-settings')
        setPublisherSettings(saved)
        setPublisher(saved)
        setToken('')
      }
      addToast('Hybrid release published', `${result.uploaded.length} assets uploaded to ${result.tagName}.`, 'success')
    } catch (error) {
      addToast('Publish failed', error instanceof Error ? error.message : 'Unable to publish hybrid release.', 'danger')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <GlassCard tone="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-soft">Creator Mode</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">ECHO Pack Publisher</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Publish hybrid Ashfall releases with a full install archive and hashed per-file update assets.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <MetricCard icon={Archive} label="Files" value={`${scan?.counts.totalFiles ?? 0}`} />
            <MetricCard icon={UploadCloud} label="Upload" value={`${diff?.upload.length ?? 0}`} />
            <MetricCard icon={CheckCircle2} label="Unchanged" tone="success" value={`${diff?.unchanged.length ?? 0}`} />
            <MetricCard icon={XCircle} label="Removed" tone={diff?.removed.length ? 'amber' : 'cyan'} value={`${diff?.removed.length ?? 0}`} />
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <GlassCard>
          <SectionHeader eyebrow="Release" title="Publisher Control" />
          <div className="space-y-4">
            <Field label="Source Folder">
              <div className="flex gap-2">
                <input className="h-11 min-w-0 flex-1 rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 font-mono text-xs text-white outline-none focus:border-cyan-echo" onChange={(event) => setSourcePath(event.target.value)} value={sourcePath} />
                <CyberButton icon={FolderOpen} onClick={() => void selectSourceFolder()} size="sm">
                  Browse
                </CyberButton>
              </div>
            </Field>
            <Field label="Version">
              <input className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-echo" onChange={(event) => setVersion(event.target.value)} value={version} />
            </Field>
            <Field label="Changelog">
              <textarea className="min-h-28 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-echo" onChange={(event) => setChangelog(event.target.value)} value={changelog} />
            </Field>
            <div className="grid gap-2">
              <CyberButton disabled={busy !== null} icon={FileCheck2} onClick={() => void runScan()} variant="secondary">
                {busy === 'scan' ? 'Scanning...' : 'Scan Source'}
              </CyberButton>
              <CyberButton disabled={busy !== null} icon={GitBranch} onClick={() => void runDiff()} variant="secondary">
                {busy === 'diff' ? 'Comparing...' : 'Compare Latest'}
              </CyberButton>
              <CyberButton disabled={busy !== null || !version.trim()} icon={UploadCloud} onClick={() => void publishRelease()} variant="primary">
                {busy === 'publish' ? 'Publishing...' : 'Publish Hybrid Release'}
              </CyberButton>
            </div>
          </div>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard>
            <SectionHeader eyebrow="GitHub" title="Publisher Repository" />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Owner">
                <input className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-echo" onChange={(event) => setOwner(event.target.value)} value={owner} />
              </Field>
              <Field label="Repository">
                <input className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-echo" onChange={(event) => setRepo(event.target.value)} value={repo} />
              </Field>
              <Field label="Fine-Grained PAT">
                <input className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-echo" onChange={(event) => setToken(event.target.value)} placeholder={publisherSettings.hasToken ? 'Token saved' : 'github_pat_...'} type="password" value={token} />
              </Field>
              <div className="flex items-end gap-3">
                <CyberButton disabled={busy !== null} icon={Save} onClick={() => void savePublisherSettings()} variant="secondary">
                  {busy === 'settings' ? 'Saving...' : 'Save'}
                </CyberButton>
                <StatusChip label={publisherSettings.hasToken ? 'Token saved' : 'Token needed'} status={publisherSettings.hasToken ? 'healthy' : 'warning'} />
              </div>
            </div>
          </GlassCard>

          {diff?.warnings.length ? (
            <GlassCard tone="amber">
              <SectionHeader eyebrow="Baseline" title="Diff Warning" />
              <p className="text-sm leading-6 text-amber-100">{diff.warnings.join(' ')}</p>
            </GlassCard>
          ) : null}

          {publishReport ? (
            <GlassCard tone="success">
              <SectionHeader eyebrow="Published" title={publishReport.tagName} />
              <div className="grid gap-3 md:grid-cols-2">
                <ReportLine label="Release" value={publishReport.releaseUrl} />
                <ReportLine label="Manifest" value={publishReport.manifestPath} />
                <ReportLine label="Metadata" value={publishReport.releaseMetadataPath} />
                <ReportLine label="Full Zip" value={publishReport.artifactPath} />
                <ReportLine label="Needed Jars" value={publishReport.neededJarsPath ? `${publishReport.neededJarsPath} (${publishReport.neededJarsCount ?? 0})` : 'not emitted'} />
              </div>
            </GlassCard>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <FileLane title="Added" files={diff?.added ?? []} status="update_available" />
            <FileLane title="Changed" files={diff?.changed ?? []} status="warning" />
            <FileLane title="Upload Assets" files={diff?.upload ?? []} status="downloading" />
            <FileLane title="Removed" files={diff?.removed ?? []} status="failed" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      {children}
    </label>
  )
}

function ReportLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cyan-soft/20 bg-black/30 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-200">{value}</p>
    </div>
  )
}

function FileLane({ title, files, status }: { title: string; files: PublisherFile[]; status: 'update_available' | 'warning' | 'downloading' | 'failed' }) {
  return (
    <GlassCard tone={files.length && status === 'failed' ? 'amber' : 'default'}>
      <SectionHeader eyebrow="Files" title={`${title} (${files.length})`} />
      {files.length === 0 ? (
        <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 text-sm text-slate-400">No files in this lane.</div>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {files.slice(0, 40).map((file) => (
            <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-3" key={`${title}-${file.path}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="break-all font-mono text-xs text-slate-200">{file.path}</span>
                <StatusChip compact status={status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{file.moduleId}</span>
                <span>{file.side}</span>
                <span>{formatBytes(file.size)}</span>
              </div>
            </div>
          ))}
          {files.length > 40 ? <p className="text-xs text-slate-500">{files.length - 40} more files hidden.</p> : null}
        </div>
      )}
    </GlassCard>
  )
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
