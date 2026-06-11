import { ClipboardCopy, Cpu, DatabaseZap, FileCheck2, RadioTower, ShieldCheck, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useLauncherStore } from '../../stores/launcherStore'
import { useProfileStore } from '../../stores/profileStore'
import type { HealthStatus } from '../../types/launcher'
import type { EcosystemScanResult } from '../../types/native'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { HealthCard } from '../cyber/HealthCard'
import { SectionHeader } from '../cyber/SectionHeader'
import { StatusChip } from '../cyber/StatusChip'
import { WarningCard } from '../cyber/WarningCard'

function statusFromProblems(count: number): HealthStatus {
  return count === 0 ? 'healthy' : 'warning'
}

export function EcosystemHealthPage() {
  const addToast = useLauncherStore((state) => state.addToast)
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const profiles = useProfileStore((state) => state.profiles)
  const profile = profiles.find((item) => item.id === selectedProfileId) ?? profiles[0]
  const [scan, setScan] = useState<EcosystemScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const criticalCount = useMemo(() => scan?.modules.filter((module) => module.status === 'critical').length ?? 0, [scan])
  const warningCount = useMemo(
    () => scan?.modules.filter((module) => module.status === 'warning' || module.status === 'update_available').length ?? 0,
    [scan],
  )

  const runScan = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Ecosystem scans inspect installed files through native IPC.', 'warning')
      return
    }
    setLoading(true)
    try {
      const result = await invokeNative('ecosystem:scan', { profileId: profile.id, installPath: profile.installPath })
      setScan(result)
      addToast(result.ok ? 'Ecosystem scan clean' : 'Ecosystem scan found issues', result.warnings.join(' ') || `${result.modules.length} module groups checked.`, result.ok ? 'success' : 'warning')
    } catch (error) {
      addToast('Ecosystem scan failed', error instanceof Error ? error.message : 'Unable to scan installed files.', 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void runScan(), 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.installPath])

  const copySummary = async () => {
    if (!scan) return
    const text = [
      `Ashfall ecosystem scan ${scan.generatedAt}`,
      `Install: ${scan.installPath}`,
      `Version: ${scan.currentVersion}${scan.latestVersion ? ` / latest ${scan.latestVersion}` : ''}`,
      `Files: ${scan.verification.valid.length} valid, ${scan.verification.missing.length} missing, ${scan.verification.corrupt.length} corrupt`,
      `Warnings: ${scan.warnings.join(' | ') || 'none'}`,
    ].join('\n')
    await navigator.clipboard.writeText(text)
    addToast('Ecosystem summary copied', 'Scan summary copied to clipboard.', 'success')
  }

  return (
    <div className="space-y-6">
      <GlassCard tone={criticalCount > 0 ? 'danger' : warningCount > 0 ? 'amber' : 'success'}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-soft">ECHO Ecosystem Health</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Ashfall Module Command Center</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {scan ? `${scan.modules.length} module groups checked / ${warningCount} warnings / ${criticalCount} critical.` : 'Run a scan to inspect installed Ashfall files.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CyberButton disabled={loading} icon={ShieldCheck} onClick={() => void runScan()} variant="primary">
              Run Health Scan
            </CyberButton>
            {scan ? (
              <CyberButton icon={ClipboardCopy} onClick={() => void copySummary()} variant="secondary">
                Copy Summary
              </CyberButton>
            ) : null}
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 xl:grid-cols-4">
        <HealthCard detail={scan ? `${scan.verification.valid.length} manifest files verified.` : 'No scan has completed yet.'} icon={FileCheck2} status={scan ? statusFromProblems(scan.verification.missing.length + scan.verification.corrupt.length) : 'warning'} title="File Integrity" />
        <HealthCard detail={scan?.latestVersion ? `Installed ${scan.currentVersion}, latest ${scan.latestVersion}.` : 'Latest Catalog metadata not available.'} icon={RadioTower} status={scan?.latestVersion && scan.latestVersion !== scan.currentVersion ? 'update_available' : 'healthy'} title="Catalog" />
        <HealthCard detail={scan ? `${scan.assetReports.flatMap((report) => report.missing).length} expected asset entries missing.` : 'Asset validation runs with the scan.'} icon={Volume2} status={scan ? statusFromProblems(scan.assetReports.flatMap((report) => report.missing).length) : 'warning'} title="Asset Validation" />
        <HealthCard detail={scan ? `${scan.modules.length} module groups derived from installed manifest metadata.` : 'Module rows are built from the installed manifest.'} icon={Cpu} status={scan?.ok ? 'healthy' : 'warning'} title="Manifest Modules" />
      </div>

      {scan?.warnings.length ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {scan.warnings.slice(0, 4).map((warning) => (
            <WarningCard key={warning} text={warning} title="Scan Warning" />
          ))}
        </div>
      ) : null}

      <GlassCard>
        <SectionHeader eyebrow="Modules" title="Installed Manifest Groups" />
        {scan ? (
          <div className="overflow-hidden rounded-xl border border-cyan-soft/20">
            <div className="grid grid-cols-[220px_120px_120px_150px_1fr] gap-4 border-b border-cyan-soft/20 bg-cyan-echo/10 px-4 py-3 text-sm font-semibold text-cyan-soft">
              <span>Module</span>
              <span>Installed</span>
              <span>Latest</span>
              <span>Status</span>
              <span>Notes</span>
            </div>
            <div className="max-h-[620px] overflow-auto bg-black/25">
              {scan.modules.map((module) => (
                <div className="grid grid-cols-[220px_120px_120px_150px_1fr] gap-4 border-b border-white/5 px-4 py-4 last:border-b-0" key={module.id}>
                  <div>
                    <p className="font-semibold text-white">{module.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{module.id}</p>
                  </div>
                  <span className="text-sm text-slate-300">{module.installedVersion}</span>
                  <span className="text-sm text-slate-300">{module.latestVersion}</span>
                  <StatusChip compact status={module.status as HealthStatus} />
                  <p className="text-sm leading-6 text-slate-300">{module.notes}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm leading-6 text-slate-300">No ecosystem scan has completed yet.</p>
        )}
      </GlassCard>

      {scan ? (
        <GlassCard tone="cyan">
          <SectionHeader eyebrow="Asset Validation" title="Installed Asset Checks" />
          <div className="grid gap-3 md:grid-cols-2">
            {scan.assetReports.map((report) => (
              <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4" key={report.moduleId}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {report.moduleId.includes('sound') ? <Volume2 className="h-4 w-4 text-cyan-soft" /> : <DatabaseZap className="h-4 w-4 text-cyan-soft" />}
                    <p className="font-semibold text-white">{report.moduleId}</p>
                  </div>
                  <StatusChip compact status={report.missing.length ? 'warning' : 'healthy'} />
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  {report.present.length} present / {report.missing.length} missing / {report.expected} expected.
                </p>
                {report.missing.length ? <p className="mt-2 break-words text-xs text-amber-100">{report.missing.join(', ')}</p> : null}
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}
    </div>
  )
}
