import { describe, expect, it } from 'vitest'
import { crashAnalyzer } from '../services/CrashAnalyzer'
import type { LogEntry } from '../types/diagnostics'
import { buildLaunchBlockers, redactLaunchCommand, worldgenCompatibility } from './launchValidation'

describe('Version 3 launch validation', () => {
  it('builds launch preflight blockers for unsafe launch conditions', () => {
    const blockers = buildLaunchBlockers({
      javaValid: false,
      missingFiles: 2,
      corruptFiles: 1,
      classpathCount: 0,
      neoforgeReady: false,
    })

    expect(blockers.map((blocker) => blocker.id)).toEqual(['java', 'files', 'classpath', 'neoforge'])
  })

  it('allows launch when required signals are present', () => {
    expect(
      buildLaunchBlockers({
        javaValid: true,
        missingFiles: 0,
        corruptFiles: 0,
        classpathCount: 12,
        neoforgeReady: true,
      }),
    ).toEqual([])
  })

  it('redacts Minecraft access tokens from command previews', () => {
    expect(redactLaunchCommand('java --accessToken secret-token-value', 'secret-token-value')).toBe('java --accessToken <minecraft-access-token>')
  })

  it('reports old worldgen markers', () => {
    expect(worldgenCompatibility('1.3.0', '1.4.0', 1)).toEqual({
      ok: false,
      warning: 'Worldgen marker 1.3.0 differs from selected profile 1.4.0.',
    })
  })

  it('detects crash signatures for auth and Java failures', () => {
    const entries: LogEntry[] = [
      { id: '1', level: 'ERROR', source: 'Launch', message: 'Unauthorized Minecraft access token', timestamp: 'now' },
      { id: '2', level: 'ERROR', source: 'Launch', message: 'Unsupported class file major version requires Java 25', timestamp: 'now' },
    ]

    const analysis = crashAnalyzer.classifyCrash(entries)
    expect(analysis.severity).toBe('Critical')
    expect(analysis.signatures?.map((signature) => signature.id)).toContain('auth-session')
    expect(analysis.signatures?.map((signature) => signature.id)).toContain('java-version')
  })
})
