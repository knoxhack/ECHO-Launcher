import { bundledLogEntries } from '../data/bundledLauncherData'
import type { LogEntry, LogLevel } from '../types/diagnostics'
import { invokeNative, requireNative } from './nativeBridge'

export class LogAnalyzer {
  parseLogs(rawLog: string): LogEntry[] {
    return rawLog
      .split('\n')
      .filter(Boolean)
      .map((line, index) => ({
        id: `parsed-${index}`,
        level: line.includes('ERROR') ? 'ERROR' : line.includes('WARN') ? 'WARN' : 'INFO',
        source: 'Imported',
        message: line,
        timestamp: new Date().toLocaleTimeString(),
      }))
  }

  filterByLevel(level: LogLevel | 'ALL') {
    return level === 'ALL' ? bundledLogEntries : bundledLogEntries.filter((entry) => entry.level === level)
  }

  async readLatestLogs(installPath?: string) {
    requireNative()
    const result = await invokeNative('logs:read', { installPath })
    return this.parseLogs(result.latest)
  }

  summarizeLikelyCauses(entries: LogEntry[] = bundledLogEntries) {
    const hasMissingDependency = entries.some((entry) => entry.message.toLowerCase().includes('missing dependency'))
    const hasVersionMismatch = entries.some((entry) => entry.message.toLowerCase().includes('version mismatch'))
    if (hasMissingDependency) return 'Missing dependency or disabled required module.'
    if (hasVersionMismatch) return 'Version mismatch between local files and the selected manifest.'
    return 'No launch-blocking crash pattern detected.'
  }
}

export const logAnalyzer = new LogAnalyzer()
