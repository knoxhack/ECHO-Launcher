import { ClipboardCopy, Copy, FolderOpen, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { LogEntry, LogLevel } from '../../types/diagnostics'
import { cn } from '../../utils/cn'
import { CyberButton } from './CyberButton'

interface LogViewerProps {
  entries: LogEntry[]
  onAction?: (action: string) => void
}

const levelClasses: Record<LogLevel, string> = {
  INFO: 'text-cyan-soft',
  WARN: 'text-amber-echo',
  ERROR: 'text-danger-echo',
}

export function LogViewer({ entries, onAction }: LogViewerProps) {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LogLevel | 'ALL'>('ALL')
  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const matchesLevel = level === 'ALL' || entry.level === level
        const matchesQuery = `${entry.source} ${entry.message}`.toLowerCase().includes(query.toLowerCase())
        return matchesLevel && matchesQuery
      }),
    [entries, level, query],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-80 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="h-10 w-full rounded-lg border border-cyan-soft/20 bg-slate-950/60 pl-9 pr-3 text-sm text-white placeholder:text-slate-500"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search logs"
            value={query}
          />
        </label>
        {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((item) => (
          <button
            className={cn(
              'h-10 rounded-lg border px-3 text-sm font-semibold transition',
              level === item
                ? 'border-cyan-echo/50 bg-cyan-echo/20 text-cyan-soft'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10',
            )}
            key={item}
            onClick={() => setLevel(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
      <div className="max-h-[430px] overflow-auto rounded-lg border border-cyan-soft/20 bg-black/40 p-3 font-mono text-xs">
        {filteredEntries.map((entry) => (
          <div className="grid grid-cols-[72px_72px_150px_1fr] gap-3 border-b border-white/5 py-2 last:border-b-0" key={entry.id}>
            <span className="text-slate-500">{entry.timestamp}</span>
            <span className={cn('font-semibold', levelClasses[entry.level])}>{entry.level}</span>
            <span className="text-slate-300">{entry.source}</span>
            <span className="text-slate-200">{entry.message}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <CyberButton icon={Copy} onClick={() => onAction?.('Copy summary')} size="sm">
          Copy Summary
        </CyberButton>
        <CyberButton icon={FolderOpen} onClick={() => onAction?.('Open folder')} size="sm" variant="ghost">
          Open Folder
        </CyberButton>
        <CyberButton icon={ClipboardCopy} onClick={() => onAction?.('Copy support report')} size="sm" variant="secondary">
          Copy Support Report
        </CyberButton>
      </div>
    </div>
  )
}
