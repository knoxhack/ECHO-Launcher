import { CheckCircle2, ClipboardCopy, FileArchive, FolderOpen, History, PackageCheck, RadioTower, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import echoBanner from '../../assets/brand/echo-banner.webp'
import echoLogo from '../../assets/brand/echo-logo.webp'
import { useLauncherStore } from '../../stores/launcherStore'
import type { LauncherUpdateLatestYmlSource, LauncherUpdateSelection, LauncherUpdateUploadReport } from '../../utils/launcherUpdateExport'
import {
  LAUNCHER_UPDATE_REPO,
  buildLauncherUpdateReleaseNotes,
  buildLauncherUpdateUploadReport,
  selectLauncherUpdateArtifacts,
} from '../../utils/launcherUpdateExport'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { StatusChip } from '../cyber/StatusChip'

type FileSystemHandleLike = {
  kind: 'file' | 'directory'
  name: string
}

type FileSystemFileHandleLike = FileSystemHandleLike & {
  kind: 'file'
  getFile: () => Promise<File>
}

type FileSystemDirectoryHandleLike = FileSystemHandleLike & {
  kind: 'directory'
  getDirectoryHandle: (name: string) => Promise<FileSystemDirectoryHandleLike>
  values: () => AsyncIterable<FileSystemHandleLike>
}

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>
}

const HISTORY_STORAGE_KEY = 'echo.launcherUpdateExporter.history'
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', 'win-unpacked'])
const MAX_SCAN_DEPTH = 5
const MAX_HISTORY_ITEMS = 12

interface LauncherUpdateHistoryEntry {
  exportedAt: string
  fileCount: number
  latestYmlSource: LauncherUpdateLatestYmlSource
  recommendedTag: string
  releaseTitle: string
  version: string
  versionFolder: string
}

async function filesFromDirectory(handle: FileSystemDirectoryHandleLike, basePath = handle.name, depth = 0): Promise<Array<{ file: File; relativePath?: string }>> {
  const files: Array<{ file: File; relativePath?: string }> = []
  if (depth > MAX_SCAN_DEPTH) return files

  for await (const entry of handle.values()) {
    const relativePath = `${basePath}/${entry.name}`
    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandleLike
      const file = await fileHandle.getFile()
      files.push({ file, relativePath })
      continue
    }

    if (SKIPPED_DIRECTORIES.has(entry.name)) continue
    files.push(...(await filesFromDirectory(entry as FileSystemDirectoryHandleLike, relativePath, depth + 1)))
  }
  return files
}

function bytesLabel(size?: number) {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function artifactStatus(selection: LauncherUpdateSelection | null, role: 'installer' | 'blockmap' | 'latestYml') {
  const artifact = selection?.[role]
  const latestLabel =
    role === 'latestYml' && artifact && selection?.latestYmlSource
      ? `${artifact.name} (${selection.latestYmlSource})`
      : artifact?.name
  return {
    label: latestLabel ?? (role === 'latestYml' ? 'latest.yml will auto-generate when possible' : `${role} missing`),
    status: artifact ? 'healthy' : 'warning',
    size: artifact?.size,
  } as const
}

function loadHistory(): LauncherUpdateHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function historyEntryFromReport(report: LauncherUpdateUploadReport): LauncherUpdateHistoryEntry {
  return {
    exportedAt: report.generatedAt,
    fileCount: report.files.length,
    latestYmlSource: report.latestYmlSource,
    recommendedTag: report.recommendedTag,
    releaseTitle: report.releaseTitle,
    version: report.version,
    versionFolder: report.versionFolder,
  }
}

export function WebLauncherUpdateExporter() {
  const addToast = useLauncherStore((state) => state.addToast)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const directoryInputRef = useRef<HTMLInputElement | null>(null)
  const [selection, setSelection] = useState<LauncherUpdateSelection | null>(null)
  const [report, setReport] = useState<LauncherUpdateUploadReport | null>(null)
  const [history, setHistory] = useState<LauncherUpdateHistoryEntry[]>(() => loadHistory())
  const [versionInput, setVersionInput] = useState('')
  const [updateInfo, setUpdateInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const directoryPickerAvailable = typeof window !== 'undefined' && Boolean((window as WindowWithDirectoryPicker).showDirectoryPicker)
  const releaseVersion = versionInput.trim()
  const versionMismatch = Boolean(selection?.version && releaseVersion && releaseVersion !== selection.version)
  const canExport = Boolean(selection?.installer && selection.blockmap && selection.latestYml && releaseVersion)

  const loadFiles = async (files: Array<{ file: File; relativePath?: string }>) => {
    setBusy(true)
    try {
      const next = await selectLauncherUpdateArtifacts(files)
      setSelection(next)
      setReport(null)
      setVersionInput(next.version ?? '')
      addToast(
        next.version ? `Launcher ${next.version} detected` : 'Launcher artifacts scanned',
        next.fixes[0] ?? next.warnings[0] ?? `${next.candidates.length} update artifact${next.candidates.length === 1 ? '' : 's'} found.`,
        next.warnings.length ? 'warning' : 'success',
      )
    } catch (error) {
      addToast('Artifact scan failed', error instanceof Error ? error.message : 'Unable to scan selected files.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const directoryInputRefCallback = (node: HTMLInputElement | null) => {
    directoryInputRef.current = node
    if (node) {
      node.setAttribute('webkitdirectory', '')
      node.setAttribute('directory', '')
    }
  }

  const selectFolder = async () => {
    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker
    if (!picker) {
      directoryInputRef.current?.click()
      return
    }
    try {
      const handle = await picker()
      await loadFiles(await filesFromDirectory(handle))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      addToast('Folder selection failed', error instanceof Error ? error.message : 'Unable to read the selected folder.', 'danger')
    }
  }

  const selectManualFiles = (files: FileList | null) => {
    if (!files?.length) return
    void loadFiles([...files].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name })))
  }

  const handleDrop = (files: FileList | null) => {
    setDragActive(false)
    selectManualFiles(files)
  }

  const exportBundle = async () => {
    if (!selection || !canExport) return
    setBusy(true)
    try {
      const { default: JSZip } = await import('jszip')
      const { report: nextReport, artifacts } = await buildLauncherUpdateUploadReport(selection, {
        updateInfo,
        version: releaseVersion,
      })
      const notes = buildLauncherUpdateReleaseNotes(nextReport)
      const zip = new JSZip()
      const versionFolder = nextReport.versionFolder
      for (const artifact of artifacts) {
        zip.file(`${versionFolder}/${artifact.name}`, artifact.file)
      }
      zip.file(`${versionFolder}/launcher-update-upload-report.json`, `${JSON.stringify(nextReport, null, 2)}\n`)
      zip.file(`${versionFolder}/github-release-notes.md`, notes)
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `echo-launcher-update-${nextReport.version}-upload-prep.zip`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setReport(nextReport)
      setHistory((current) => {
        const nextEntry = historyEntryFromReport(nextReport)
        const nextHistory = [nextEntry, ...current.filter((item) => item.version !== nextEntry.version)].slice(0, MAX_HISTORY_ITEMS)
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory))
        return nextHistory
      })
      addToast('Upload bundle exported', `${nextReport.manualUploadOrder.length} release assets prepared for ${LAUNCHER_UPDATE_REPO}.`, 'success')
    } catch (error) {
      addToast('Upload bundle failed', error instanceof Error ? error.message : 'Unable to export launcher update bundle.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const statuses = [
    { role: 'installer' as const, title: 'Installer' },
    { role: 'blockmap' as const, title: 'Blockmap' },
    { role: 'latestYml' as const, title: 'latest.yml' },
  ]
  const releaseNotes = report ? buildLauncherUpdateReleaseNotes(report) : ''

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020711] px-6 py-8 text-white">
      <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" src={echoBanner} />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-slate-950/90 to-slate-950/55" />
      <div className="cyber-grid absolute inset-0 opacity-15" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-6 xl:grid-cols-[1fr_420px]">
          <GlassCard tone="cyan">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-xl border border-cyan-echo/50 bg-black shadow-cyber">
                  <img alt="" className="h-full w-full object-cover" src={echoLogo} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-cyan-soft">Browser Release Prep</p>
                  <h1 className="text-3xl font-semibold tracking-wide text-white">Launcher Update Exporter</h1>
                </div>
              </div>
              <StatusChip label={selection?.warnings.length ? 'Review Warnings' : selection ? 'Ready' : 'Waiting'} status={selection?.warnings.length ? 'warning' : selection ? 'healthy' : 'queued'} />
            </div>

            <div
              className={`mb-5 rounded-xl border border-dashed p-4 transition ${
                dragActive ? 'border-cyan-echo bg-cyan-echo/10' : 'border-cyan-soft/25 bg-black/25'
              }`}
              onDragLeave={() => setDragActive(false)}
              onDragOver={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDrop(event.dataTransfer.files)
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Drop launcher update artifacts here</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Use files from <span className="font-mono text-cyan-soft">installer-artifacts</span> after running <span className="font-mono text-cyan-soft">npm.cmd run package:win</span>.
                  </p>
                </div>
                <StatusChip label={directoryPickerAvailable ? 'Folder picker ready' : 'Folder input fallback'} status={directoryPickerAvailable ? 'operational' : 'warning'} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {statuses.map((item) => {
                const status = artifactStatus(selection, item.role)
                return (
                  <div className="rounded-lg border border-cyan-soft/20 bg-black/30 p-4" key={item.role}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <StatusChip compact status={status.status} />
                    </div>
                    <p className="break-all font-mono text-xs leading-5 text-slate-300">{status.label}</p>
                    <p className="mt-2 text-xs text-slate-500">{bytesLabel(status.size)}</p>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <InfoTile label="Detected Version" value={selection?.version ?? 'not detected'} />
                <InfoTile label="Target Repo" value={LAUNCHER_UPDATE_REPO} />
                <InfoTile label="Release Tag" value={releaseVersion ? `v${releaseVersion}` : 'pending'} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <InfoTile label="latest.yml" value={selection?.latestYmlSource ?? 'pending'} />
                <InfoTile label="Hashes" value={selection?.installer && selection.latestYml ? 'ready' : 'pending'} />
                <InfoTile label="Zip Folder" value={releaseVersion ? `ECHO-Launcher-${releaseVersion}` : 'pending'} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr]">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Release Version</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-cyan-soft/25 bg-black/45 px-3 py-2 font-mono text-sm text-white outline-none transition focus:border-cyan-echo"
                    onChange={(event) => setVersionInput(event.target.value)}
                    placeholder="1.0.0"
                    value={versionInput}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Update Info</span>
                  <textarea
                    className="mt-2 min-h-20 w-full resize-y rounded-lg border border-cyan-soft/25 bg-black/45 px-3 py-2 text-sm leading-6 text-white outline-none transition focus:border-cyan-echo"
                    onChange={(event) => setUpdateInfo(event.target.value)}
                    placeholder="Short release notes or upload context"
                    value={updateInfo}
                  />
                </label>
              </div>
              {versionMismatch ? (
                <div className="mt-4 rounded-lg border border-amber-echo/40 bg-amber-echo/10 p-3 text-sm leading-6 text-amber-100">
                  Release version {releaseVersion} differs from the installer filename version {selection?.version}. The exporter will repair latest.yml, but the packaged app version should match before publishing.
                </div>
              ) : null}
              {selection?.fixes.length ? (
                <div className="mt-4 rounded-lg border border-success-echo/40 bg-success-echo/10 p-3 text-sm leading-6 text-emerald-100">
                  {selection.fixes.join(' ')}
                </div>
              ) : null}
              {selection?.warnings.length ? (
                <div className="mt-4 rounded-lg border border-amber-echo/40 bg-amber-echo/10 p-3 text-sm leading-6 text-amber-100">
                  {selection.warnings.join(' ')}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <CyberButton disabled={busy} icon={FolderOpen} onClick={() => void selectFolder()} variant="primary">
                Select Repo Folder
              </CyberButton>
              <CyberButton disabled={busy} icon={UploadCloud} onClick={() => fileInputRef.current?.click()} variant="secondary">
                Select Files
              </CyberButton>
              <CyberButton disabled={busy || !canExport} icon={FileArchive} onClick={() => void exportBundle()} variant="success">
                Export Upload Bundle
              </CyberButton>
              <input
                accept=".exe,.blockmap,.yml,.yaml"
                className="hidden"
                multiple
                onChange={(event) => selectManualFiles(event.target.files)}
                ref={fileInputRef}
                type="file"
              />
              <input
                className="hidden"
                multiple
                onChange={(event) => selectManualFiles(event.target.files)}
                ref={directoryInputRefCallback}
                type="file"
              />
            </div>
          </GlassCard>

          <aside className="space-y-6">
            <GlassCard>
              <div className="mb-4 flex items-center gap-3">
                <RadioTower className="h-5 w-5 text-cyan-soft" />
                <div>
                  <p className="text-sm font-semibold text-white">Manual Upload</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{LAUNCHER_UPDATE_REPO}</p>
                </div>
              </div>
              <div className="space-y-3 text-sm leading-6 text-slate-300">
                {(report?.manualUploadOrder ?? ['latest.yml', 'ECHO-Launcher-{version}-Setup.exe', 'ECHO-Launcher-{version}-Setup.exe.blockmap']).map((item, index) => (
                  <div className="flex gap-3 rounded-lg border border-cyan-soft/20 bg-black/25 p-3" key={item}>
                    <span className="text-cyan-soft">{index + 1}</span>
                    <span className="break-all font-mono text-xs">{item}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard tone={report?.ok ? 'success' : 'default'}>
              <div className="mb-4 flex items-center gap-3">
                <PackageCheck className="h-5 w-5 text-success-echo" />
                <div>
                  <p className="text-sm font-semibold text-white">{report ? report.releaseTitle : 'No Bundle Exported'}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{report?.recommendedTag ?? 'release tag pending'}</p>
                </div>
              </div>
              {report ? (
                <div className="space-y-2">
                  {report.files.map((file) => (
                    <div className="rounded-lg border border-white/10 bg-black/25 p-3" key={file.name}>
                      <p className="break-all font-mono text-xs text-slate-200">{file.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {bytesLabel(file.size)} / {file.sha256.slice(0, 16)}...
                      </p>
                    </div>
                  ))}
                  <div className="rounded-lg border border-success-echo/30 bg-success-echo/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-success-echo">Version Folder</p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-200">{report.versionFolder}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-300">Run `npm.cmd run package:win`, select the generated artifacts, then export the upload bundle.</p>
              )}
              {report ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <CyberButton
                    icon={ClipboardCopy}
                    onClick={() => {
                      void navigator.clipboard?.writeText(releaseNotes)
                      addToast('Release notes copied', `${report.recommendedTag} notes copied to clipboard.`, 'success')
                    }}
                    size="sm"
                    variant="ghost"
                  >
                  Copy Release Notes
                  </CyberButton>
                  <CyberButton
                    icon={CheckCircle2}
                    onClick={() => window.open(`https://github.com/${LAUNCHER_UPDATE_REPO}/releases/new?tag=${encodeURIComponent(report.recommendedTag)}&title=${encodeURIComponent(report.releaseTitle)}`, '_blank', 'noopener,noreferrer')}
                    size="sm"
                    variant="secondary"
                  >
                    Open Release Draft
                  </CyberButton>
                </div>
              ) : null}
            </GlassCard>

            <GlassCard>
              <div className="mb-4 flex items-center gap-3">
                <History className="h-5 w-5 text-cyan-soft" />
                <div>
                  <p className="text-sm font-semibold text-white">Version History</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Saved in this browser</p>
                </div>
              </div>
              {history.length ? (
                <div className="space-y-2">
                  {history.slice(0, 5).map((item) => (
                    <div className="rounded-lg border border-white/10 bg-black/25 p-3" key={`${item.version}-${item.exportedAt}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-xs text-slate-200">{item.recommendedTag}</p>
                        <StatusChip compact label={item.latestYmlSource} status="healthy" />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(item.exportedAt).toLocaleString()} / {item.fileCount} files
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">{item.versionFolder}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-300">Prepared launcher update versions will appear here after export.</p>
              )}
            </GlassCard>
          </aside>
        </div>
      </div>
    </main>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-200">{value}</p>
    </div>
  )
}
