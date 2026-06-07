import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { readPackOsStateFromRoot } = require('./packos-reports.cjs')

const tempRoots = []

async function tempReportRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'echo-packos-'))
  tempRoots.push(root)
  return root
}

async function writeJson(root, fileName, value) {
  await writeFile(path.join(root, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('PackOS report loader', () => {
  it('returns unknown state for a missing report root', async () => {
    const state = await readPackOsStateFromRoot('', { generatedAt: '2026-05-29T00:00:00.000Z' })

    expect(state.status).toBe('unknown')
    expect(state.ok).toBe(false)
    expect(state.warnings).toContain('PackOS report root is not configured.')
    expect(state.selectedPack.launchAllowed).toBe(false)
  })

  it('keeps invalid JSON as a warning instead of throwing', async () => {
    const root = await tempReportRoot()
    await writeFile(path.join(root, 'launcher-status.json'), '{ bad json', 'utf8')

    const state = await readPackOsStateFromRoot(root)

    expect(state.status).toBe('unknown')
    expect(state.reports.find((report) => report.fileName === 'launcher-status.json')?.status).toBe('invalid')
    expect(state.warnings.some((warning) => warning.includes('invalid JSON'))).toBe(true)
  })

  it('selects the launcher-status pack state when reports are present', async () => {
    const root = await tempReportRoot()
    await writeJson(root, 'launcher-status.json', {
      schema: 'echo.report.launcher_status',
      generatedAt: '2026-05-29T00:00:00.000Z',
      data: {
        launcherStatus: {
          selectedPackId: 'ashfall-native-edition',
          safeCommands: ['.\\gradlew echoPackDoctor -PechoPack=ashfall-native-edition -PechoAddonSet=alpha'],
          packStates: [
            {
              packId: 'ashfall-native-edition',
              name: 'Ashfall Native Edition',
              selected: true,
              launcherVisible: true,
              variant: 'standard',
              channel: 'alpha',
              saveCompatibilityVersion: '1',
              readinessStatus: 'playable_with_warnings',
              lockfileStatus: 'valid_with_warnings',
              installStateStatus: 'not_configured',
              repairPlanStatus: 'no_repair_needed',
              healthStatus: 'warning_without_runtime',
              recoveryMode: 'normal',
              safeForLauncher: true,
              launchAllowed: true,
              uiState: 'playable_with_warnings',
              warnings: ['Install-state scan is not_configured.'],
            },
          ],
        },
      },
    })

    const state = await readPackOsStateFromRoot(root)

    expect(state.source).toBe('launcher-status')
    expect(state.ok).toBe(true)
    expect(state.selectedPack.channel).toBe('alpha')
    expect(state.selectedPack.launchAllowed).toBe(true)
  })

  it('blocks launch when PackOS explicitly marks the selected pack blocked', async () => {
    const root = await tempReportRoot()
    await writeJson(root, 'launcher-status.json', {
      launcherStatus: {
        selectedPackId: 'ashfall-native-edition',
        packStates: [
          {
            packId: 'ashfall-native-edition',
            name: 'Ashfall Native Edition',
            selected: true,
            launcherVisible: true,
            safeForLauncher: false,
            launchAllowed: false,
            uiState: 'blocked',
            blockingReasons: ['Required module echoashfallprotocol is missing.'],
          },
        ],
      },
    })

    const state = await readPackOsStateFromRoot(root)

    expect(state.ok).toBe(false)
    expect(state.status).toBe('blocked')
    expect(state.selectedPack.blockingReasons).toContain('Required module echoashfallprotocol is missing.')
  })
})
