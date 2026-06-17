import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL('./ashfall-lane-game-smoke.mjs', import.meta.url))

const LANES = [
  {
    name: 'Ashfall Native Edition',
    pack: 'ashfall-native-edition',
    modulePath: 'addons/echoashfallprotocol.echo-addon',
    logText: 'ECHO Launcher initialized\nNative profile screen: Ashfall\nJoined world\n',
  },
  {
    name: 'Ashfall NeoForge Edition',
    pack: 'ashfall-neoforge-edition',
    modulePath: 'mods/echoashfallprotocol-neoforge.jar',
    logText: 'Game directory: C:/tmp/ashfall\nMinecraft Version: 26.1.2\nJoined world\n',
  },
  {
    name: 'Ashfall Standalone Edition',
    pack: 'ashfall-standalone-edition',
    modulePath: 'mods/echoashfallprotocol-standalone.jar',
    logText: 'ECHO Launcher initialized\nJoined world\n',
  },
]

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-lane-smoke-'))
  for (const lane of LANES) {
    const instancePath = path.join(root, lane.name)
    await fs.mkdir(path.join(instancePath, path.dirname(lane.modulePath)), { recursive: true })
    await fs.writeFile(path.join(instancePath, lane.modulePath), 'module')
    await fs.mkdir(path.join(instancePath, 'logs'), { recursive: true })
    await fs.writeFile(path.join(instancePath, 'logs', 'latest.log'), lane.logText)
    await writeJson(path.join(instancePath, '.echo', 'installed-manifest.json'), {
      pack: lane.pack,
      version: 'test',
      files: [{ path: lane.modulePath }],
    })
  }
  return root
}

async function runSmoke(instanceRoot, outPath) {
  await execFileAsync(process.execPath, [
    scriptPath,
    '--instance-root',
    instanceRoot,
    '--out',
    outPath,
  ])
  return JSON.parse(await fs.readFile(outPath, 'utf8'))
}

describe('Ashfall lane gameplay smoke proof validation', () => {
  it('requires local proof files for boolean gameplay claims', async () => {
    const instanceRoot = await createFixture()
    const reportPath = path.join(instanceRoot, 'report.json')
    const nativeEvidencePath = path.join(
      instanceRoot,
      'Ashfall Native Edition',
      '.echo',
      'ashfall-lane-game-smoke-evidence.json',
    )

    await writeJson(nativeEvidencePath, {
      schemaVersion: 'echo.ashfall.lane-game-smoke.evidence.v1',
      packId: 'ashfall-native-edition',
      claims: {
        hudVisible: true,
      },
    })

    const missingProofReport = await runSmoke(instanceRoot, reportPath)
    const missingProofLane = missingProofReport.lanes.find((lane) => lane.packId === 'ashfall-native-edition')
    expect(missingProofLane.claimProofs.hudVisible.ok).toBe(false)
    expect(missingProofLane.blockers).toContain(
      'Gameplay proof hudVisible is claimed true but does not reference at least one non-empty local proof file.',
    )

    const proofPath = path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'proofs', 'hud-visible.txt')
    await fs.mkdir(path.dirname(proofPath), { recursive: true })
    await fs.writeFile(proofPath, 'HUD was visible during captured gameplay.\n')
    await writeJson(nativeEvidencePath, {
      schemaVersion: 'echo.ashfall.lane-game-smoke.evidence.v1',
      packId: 'ashfall-native-edition',
      claims: {
        hudVisible: true,
      },
      proofs: {
        hudVisible: ['proofs/hud-visible.txt'],
      },
    })

    const proofReport = await runSmoke(instanceRoot, reportPath)
    const proofLane = proofReport.lanes.find((lane) => lane.packId === 'ashfall-native-edition')
    expect(proofLane.claimProofs.hudVisible.ok).toBe(true)
    expect(proofLane.claims.hudVisible).toBe(true)
    expect(proofLane.blockers).not.toContain(
      'Gameplay proof hudVisible is claimed true but does not reference at least one non-empty local proof file.',
    )
  })

  it('validates imported Computer Use session checks against local proof files', async () => {
    const instanceRoot = await createFixture()
    const reportPath = path.join(instanceRoot, 'report.json')
    const nativeInstance = path.join(instanceRoot, 'Ashfall Native Edition')
    const evidencePath = path.join(nativeInstance, '.echo', 'ashfall-lane-game-smoke-evidence.json')
    const proofPath = path.join(nativeInstance, '.echo', 'proofs', 'screenshots', 'hud-visible.png')
    const sessionPath = path.join(nativeInstance, '.echo', 'proofs', 'computer-use-session.json')

    await fs.mkdir(path.dirname(proofPath), { recursive: true })
    await fs.writeFile(proofPath, 'captured hud pixels\n')
    await writeJson(evidencePath, {
      schemaVersion: 'echo.ashfall.lane-game-smoke.evidence.v1',
      packId: 'ashfall-native-edition',
      claims: {
        hudVisible: true,
      },
      proofs: {
        hudVisible: ['proofs/screenshots/hud-visible.png'],
      },
      computerUseSession: 'proofs/computer-use-session.json',
    })
    await writeJson(sessionPath, {
      schemaVersion: 'echo.ashfall.computer_use_gameplay_session.v1',
      packId: 'ashfall-native-edition',
      lane: 'native',
      actions: ['Opened inventory and verified the HUD remained visible.'],
      verificationChecks: [
        {
          id: 'terminalVisible',
          label: 'Terminal visible',
          status: 'captured',
          evidenceRef: 'terminalVisible',
          note: 'No Terminal proof exists.',
        },
      ],
      verificationSummary: {
        checkCount: 1,
        capturedCount: 1,
        blockedCount: 0,
        notAttemptedCount: 0,
      },
    })

    const invalidReport = await runSmoke(instanceRoot, reportPath)
    const invalidLane = invalidReport.lanes.find((lane) => lane.packId === 'ashfall-native-edition')
    expect(invalidLane.computerUseSession.present).toBe(true)
    expect(invalidLane.computerUseSession.blockers).toContain(
      'Computer Use session verificationChecks[0].evidenceRef terminalVisible must reference a validated local claim proof or imported artifact proof.',
    )
    expect(invalidLane.blockers).toContain(
      'Computer Use session: Computer Use session verificationChecks[0].evidenceRef terminalVisible must reference a validated local claim proof or imported artifact proof.',
    )

    await writeJson(sessionPath, {
      schemaVersion: 'echo.ashfall.computer_use_gameplay_session.v1',
      packId: 'ashfall-native-edition',
      lane: 'native',
      actions: ['Opened world and verified HUD visibility.'],
      verificationChecks: [
        {
          id: 'hudVisible',
          label: 'HUD visible',
          status: 'captured',
          evidenceRef: 'hudVisible',
          note: 'HUD verified from imported screenshot.',
        },
        {
          id: 'terminalVisible',
          label: 'Terminal visible',
          status: 'not-attempted',
          evidenceRef: null,
          note: 'Terminal was not opened during this narrow capture.',
        },
      ],
      verificationSummary: {
        checkCount: 2,
        capturedCount: 1,
        blockedCount: 0,
        notAttemptedCount: 1,
      },
    })

    const validReport = await runSmoke(instanceRoot, reportPath)
    const validLane = validReport.lanes.find((lane) => lane.packId === 'ashfall-native-edition')
    expect(validLane.computerUseSession.present).toBe(true)
    expect(validLane.computerUseSession.blockers).toEqual([])
    expect(validLane.computerUseSession.verificationSummary.capturedCount).toBe(1)
    expect(validLane.blockers).not.toContain(
      'Computer Use session: Computer Use session verificationChecks[0].evidenceRef terminalVisible must reference a validated local claim proof or imported artifact proof.',
    )
  })
})
