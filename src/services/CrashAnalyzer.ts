import { bundledLogEntries } from '../data/bundledLauncherData'
import type { CrashAnalysis, CrashSignature, LogEntry } from '../types/diagnostics'

export class CrashAnalyzer {
  classifyCrash(entries: LogEntry[] = bundledLogEntries): CrashAnalysis {
    const rules = [
      {
        id: 'missing-mod',
        label: 'Missing mod dependency',
        match: (message: string) => /missing dependency|required dependency|mod .* missing/i.test(message),
        suggestedFix: 'Run Repair Install and verify enabled required addons.',
      },
      {
        id: 'java-version',
        label: 'Java runtime mismatch',
        match: (message: string) => /unsupported class|java .* version|requires java/i.test(message),
        suggestedFix: 'Select Java 25+ in Settings and rerun launch preflight.',
      },
      {
        id: 'neoforge-version',
        label: 'NeoForge version mismatch',
        match: (message: string) => /neoforge|modlauncher|bootstraplauncher/i.test(message) && /mismatch|failed|missing/i.test(message),
        suggestedFix: 'Run Install / Update so NeoForge matches the selected manifest.',
      },
      {
        id: 'asset-missing',
        label: 'Asset validation failure',
        match: (message: string) => /soundcore|texture|model|lang|asset/i.test(message) && /missing|failed/i.test(message),
        suggestedFix: 'Run SoundCore and asset validation from Diagnostics.',
      },
      {
        id: 'config-parse',
        label: 'Configuration parse error',
        match: (message: string) => /toml|json|config/i.test(message) && /parse|syntax|malformed/i.test(message),
        suggestedFix: 'Back up configs, then run Reset Configs or Repair Install.',
      },
      {
        id: 'auth-session',
        label: 'Minecraft auth/session failure',
        match: (message: string) => /access token|xbox|xsts|minecraft profile|authentication|unauthorized/i.test(message),
        suggestedFix: 'Open the official Minecraft Launcher, sign in there, then launch the Ashfall profile.',
      },
    ]
    const signatures: CrashSignature[] = rules
      .map((rule) => {
        const matches = entries.filter((entry) => rule.match(entry.message))
        const evidence = matches.map((entry) => entry.message).slice(0, 3)
        return evidence.length
          ? {
              id: rule.id,
              label: rule.label,
              severity: (matches.some((entry) => entry.level === 'ERROR' || /error|fatal|crash|aborted|unauthorized/i.test(entry.message)) ? 'critical' : 'warning') as 'critical' | 'warning',
              confidence: Math.min(0.95, 0.55 + evidence.length * 0.15),
              evidence,
              suggestedFix: rule.suggestedFix,
            }
          : null
      })
      .filter((signature): signature is CrashSignature => signature !== null)

    const critical = signatures.find((signature) => signature.severity === 'critical')
    if (critical) {
      return {
        title: 'Startup Crash Detected',
        severity: 'Critical',
        likelyCause: critical.label,
        suggestedFix: critical.suggestedFix,
        signatures,
      }
    }

    return {
      title: signatures.length ? 'Launch Issue Pattern Detected' : 'No Critical Crash Detected',
      severity: 'Warning',
      likelyCause: signatures[0]?.label ?? 'Launcher logs contain warnings but no fatal dependency failure.',
      suggestedFix: signatures[0]?.suggestedFix ?? 'Verify files before switching update channels.',
      signatures,
    }
  }
}

export const crashAnalyzer = new CrashAnalyzer()
