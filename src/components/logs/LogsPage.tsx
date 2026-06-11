import { DownloadCloud, FileText, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { bundledLogEntries } from '../../data/bundledLauncherData'
import { logAnalyzer } from '../../services/LogAnalyzer'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useLauncherStore } from '../../stores/launcherStore'
import { useProfileStore } from '../../stores/profileStore'
import type { LogEntry, LogLevel } from '../../types/diagnostics'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { SectionHeader } from '../cyber/SectionHeader'
import { StatusChip } from '../cyber/StatusChip'

const levels: Array<LogLevel | 'ALL'> = ['ALL', 'ERROR', 'WARN', 'INFO']

function statusForLevel(level: LogLevel) {
  if (level === 'ERROR') return 'critical'
  if (level === 'WARN') return 'warning'
  return 'healthy'
}

export function LogsPage() {
  const addToast = useLauncherStore((state) => state.addToast)
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const profiles = useProfileStore((state) => state.profiles)
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0]
  const [entries, setEntries] = useState<LogEntry[]>(bundledLogEntries)
  const [level, setLevel] = useState<LogLevel | 'ALL'>('ALL')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return entries.filter((entry) => {
      const levelMatches = level === 'ALL' || entry.level === level
      const queryMatches =
        normalized.length === 0 ||
        entry.message.toLowerCase().includes(normalized) ||
        entry.source.toLowerCase().includes(normalized)
      return levelMatches && queryMatches
    })
  }, [entries, level, query])

  const likelyCause = useMemo(() => logAnalyzer.summarizeLikelyCauses(entries), [entries])

  async function refreshLogs() {
    setLoading(true)
    try {
      if (!isNativeAvailable()) {
        setEntries(logAnalyzer.filterByLevel('ALL'))
        addToast('Logs unavailable', 'Desktop log access is unavailable in this preview.', 'warning')
        return
      }
      const nextEntries = await logAnalyzer.readLatestLogs(selectedProfile?.installPath)
      setEntries(nextEntries)
      addToast(nextEntries.length ? 'Logs refreshed' : 'No logs found', nextEntries.length ? `${nextEntries.length} entries loaded.` : 'Launch or verify Ashfall to create local logs.', nextEntries.length ? 'success' : 'info')
    } catch (error) {
      setEntries(bundledLogEntries)
      addToast('Log read failed', error instanceof Error ? error.message : 'No local logs could be loaded.', 'warning')
    } finally {
      setLoading(false)
    }
  }

  async function exportLogs() {
    if (!isNativeAvailable()) {
      addToast('Export unavailable', 'Desktop log export requires the native launcher bridge.', 'warning')
      return
    }
    setExporting(true)
    try {
      const result = await invokeNative('logs:export', {
        profileId: selectedProfile?.id,
        installPath: selectedProfile?.installPath,
      })
      addToast('Logs exported', result.zipPath, 'success')
    } catch (error) {
      addToast('Export failed', error instanceof Error ? error.message : 'Unable to export logs.', 'warning')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Diagnostics"
        title="Launcher Logs"
        action={
          <div className="flex flex-wrap gap-2">
            <CyberButton icon={RefreshCw} onClick={refreshLogs} disabled={loading}>
              {loading ? 'Refreshing' : 'Refresh'}
            </CyberButton>
            <CyberButton icon={DownloadCloud} onClick={exportLogs} disabled={exporting}>
              {exporting ? 'Exporting' : 'Export'}
            </CyberButton>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <GlassCard className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {levels.map((item) => (
                <button
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    level === item
                      ? 'border-cyan-echo bg-cyan-echo/20 text-white'
                      : 'border-cyan-echo/20 bg-white/[0.04] text-slate-300 hover:bg-cyan-echo/10'
                  }`}
                  key={item}
                  onClick={() => setLevel(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="flex min-w-0 items-center gap-2 rounded-lg border border-cyan-echo/20 bg-slate-950/40 px-3 py-2 text-sm text-slate-300 md:w-72">
              <Search className="h-4 w-4 text-cyan-soft" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search logs"
                value={query}
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-lg border border-cyan-echo/15">
            {filteredEntries.map((entry) => (
              <div className="grid gap-3 border-b border-cyan-echo/10 bg-slate-950/30 p-3 last:border-b-0 md:grid-cols-[5rem_8rem_minmax(0,1fr)]" key={entry.id}>
                <span className="text-xs tabular-nums text-slate-400">{entry.timestamp}</span>
                <StatusChip compact label={entry.level} status={statusForLevel(entry.level)} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase text-cyan-soft">{entry.source}</p>
                  <p className="break-words text-sm text-slate-100">{entry.message}</p>
                </div>
              </div>
            ))}
            {filteredEntries.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No log entries match the current filters.</div>
            ) : null}
          </div>
        </GlassCard>

        <GlassCard className="space-y-3">
          <div className="flex items-center gap-2 text-cyan-soft">
            <FileText className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase">Summary</p>
          </div>
          <p className="text-3xl font-semibold text-white">{entries.length}</p>
          <p className="text-sm leading-6 text-slate-300">{likelyCause}</p>
          <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
            {(['ERROR', 'WARN', 'INFO'] as LogLevel[]).map((item) => (
              <div className="rounded-lg border border-cyan-echo/15 bg-white/[0.04] p-2" key={item}>
                <p className="text-slate-400">{item}</p>
                <p className="text-lg font-semibold text-white">{entries.filter((entry) => entry.level === item).length}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
