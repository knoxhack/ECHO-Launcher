import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL('./ashfall-computer-use-proof-import.mjs', import.meta.url))

async function createInstanceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-computer-use-import-'))
  await fs.mkdir(path.join(root, 'Ashfall Native Edition'), { recursive: true })
  return root
}

async function runImport(args, options = {}) {
  return execFileAsync(process.execPath, [scriptPath, ...args], options)
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

describe('Ashfall Computer Use proof importer', () => {
  it('imports non-empty visible proof files into Ashfall evidence', async () => {
    const instanceRoot = await createInstanceRoot()
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-computer-use-sources-'))
    const screenshot = path.join(sourceRoot, 'hud-visible.png')
    await fs.writeFile(screenshot, 'captured png bytes')

    await runImport([
      '--instance-root',
      instanceRoot,
      '--lane',
      'native',
      '--claim',
      `hudVisible=${screenshot}`,
      '--action',
      'Pressed F1 off, entered world, verified HUD is visible.',
      '--verification-check',
      'hudVisible|HUD visible|captured|hudVisible|Verified HUD from imported screenshot.',
      '--verification-check',
      'terminalVisible|Terminal visible|not-attempted||Terminal was not opened in this capture.',
      '--app-id',
      'test-game.exe',
      '--window-title',
      'Ashfall Native Test Window',
      '--captured-at',
      '2026-06-17T14:00:00.000Z',
      '--strict',
      '--json',
    ])

    const evidencePath = path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'ashfall-lane-game-smoke-evidence.json')
    const evidence = await readJson(evidencePath)
    expect(evidence.schemaVersion).toBe('echo.ashfall.lane-game-smoke.evidence.v1')
    expect(evidence.claims.hudVisible).toBe(true)
    expect(evidence.proofs.hudVisible).toHaveLength(1)
    expect(evidence.proofs.hudVisible[0]).toMatch(/^proofs\/screenshots\/hudvisible-2026-06-17t14-00-00-000z\.png$/u)
    expect(evidence.computerUseSession).toBe('proofs/computer-use-session.json')
    expect(evidence.verificationSummary).toEqual({
      checkCount: 2,
      capturedCount: 1,
      blockedCount: 0,
      notAttemptedCount: 1,
    })
    expect(evidence.verificationChecks[0]).toMatchObject({
      id: 'hudVisible',
      status: 'captured',
      evidenceRef: 'hudVisible',
    })
    expect(evidence.visibleProofs).toEqual([
      {
        claim: 'hudVisible',
        proof: evidence.proofs.hudVisible[0],
        source: 'computer-use-window-screenshot',
      },
    ])

    const copiedProof = path.join(instanceRoot, 'Ashfall Native Edition', '.echo', evidence.proofs.hudVisible[0])
    await expect(fs.stat(copiedProof)).resolves.toMatchObject({ size: 18 })

    const session = await readJson(path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'proofs', 'computer-use-session.json'))
    expect(session.schemaVersion).toBe('echo.ashfall.computer_use_gameplay_session.v1')
    expect(session.appId).toBe('test-game.exe')
    expect(session.windowTitle).toBe('Ashfall Native Test Window')
    expect(session.actions).toContain('Pressed F1 off, entered world, verified HUD is visible.')
    expect(session.verificationSummary.capturedCount).toBe(1)
    expect(session.verificationChecks[0].id).toBe('hudVisible')
    expect(session.claimProofs[0].claim).toBe('hudVisible')
  })

  it('rejects missing proof files without marking the claim true', async () => {
    const instanceRoot = await createInstanceRoot()
    const missingScreenshot = path.join(instanceRoot, 'missing.png')

    await expect(runImport([
      '--instance-root',
      instanceRoot,
      '--lane',
      'native',
      '--claim',
      `hudVisible=${missingScreenshot}`,
      '--strict',
      '--json',
    ])).rejects.toMatchObject({ code: 1 })

    const evidencePath = path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'ashfall-lane-game-smoke-evidence.json')
    const evidence = await readJson(evidencePath)
    expect(evidence.claims.hudVisible).toBe(false)
    expect(evidence.proofs.hudVisible).toEqual([])
  })

  it('rejects captured verification checks that do not reference imported proof', async () => {
    const instanceRoot = await createInstanceRoot()
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-computer-use-sources-'))
    const screenshot = path.join(sourceRoot, 'hud-visible.png')
    await fs.writeFile(screenshot, 'captured png bytes')

    await expect(runImport([
      '--instance-root',
      instanceRoot,
      '--lane',
      'native',
      '--claim',
      `hudVisible=${screenshot}`,
      '--verification-check',
      'terminalVisible|Terminal visible|captured|terminalVisible|No terminal proof was imported.',
      '--strict',
      '--json',
    ])).rejects.toMatchObject({ code: 1 })

    const evidencePath = path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'ashfall-lane-game-smoke-evidence.json')
    const evidence = await readJson(evidencePath)
    expect(evidence.claims.hudVisible).toBe(true)
    expect(evidence.verificationSummary.capturedCount).toBe(1)
    expect(evidence.verificationChecks[0].id).toBe('terminalVisible')
  })

  it('rejects otherwise valid proof imports without visible action metadata', async () => {
    const instanceRoot = await createInstanceRoot()
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-computer-use-sources-'))
    const screenshot = path.join(sourceRoot, 'hud-visible.png')
    await fs.writeFile(screenshot, 'captured png bytes')

    await expect(runImport([
      '--instance-root',
      instanceRoot,
      '--lane',
      'native',
      '--claim',
      `hudVisible=${screenshot}`,
      '--verification-check',
      'hudVisible|HUD visible|captured|hudVisible|Verified HUD from imported screenshot.',
      '--strict',
      '--json',
    ])).rejects.toMatchObject({ code: 1 })

    const evidencePath = path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'ashfall-lane-game-smoke-evidence.json')
    const evidence = await readJson(evidencePath)
    expect(evidence.claims.hudVisible).toBe(true)
    expect(evidence.computerUseSession).toBe('proofs/computer-use-session.json')

    const session = await readJson(path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'proofs', 'computer-use-session.json'))
    expect(session.actions).toEqual([])
  })

  it('records a custom proof source for game-native screenshots triggered by Computer Use', async () => {
    const instanceRoot = await createInstanceRoot()
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-computer-use-sources-'))
    const screenshot = path.join(sourceRoot, 'hud-f2.png')
    await fs.writeFile(screenshot, 'minecraft screenshot bytes')

    await runImport([
      '--instance-root',
      instanceRoot,
      '--lane',
      'native',
      '--claim',
      `hudVisible=${screenshot}`,
      '--action',
      'Activated the game window with Computer Use and pressed F2 to save the HUD screenshot.',
      '--proof-source',
      'computer-use-game-native-screenshot',
      '--verification-check',
      'hudVisible|HUD visible|captured|hudVisible|Verified HUD from game-native screenshot triggered by Computer Use.',
      '--captured-at',
      '2026-06-17T14:10:00.000Z',
      '--strict',
      '--json',
    ])

    const evidencePath = path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'ashfall-lane-game-smoke-evidence.json')
    const evidence = await readJson(evidencePath)
    expect(evidence.visibleProofs).toEqual([
      {
        claim: 'hudVisible',
        proof: evidence.proofs.hudVisible[0],
        source: 'computer-use-game-native-screenshot',
      },
    ])

    const session = await readJson(path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'proofs', 'computer-use-session.json'))
    expect(session.proofSource).toBe('computer-use-game-native-screenshot')
  })
})
