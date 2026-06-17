import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scriptPath = fileURLToPath(new URL('./ashfall-lane-game-capture-assist.mjs', import.meta.url))

async function createInstanceRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-ashfall-capture-assist-'))
  await fs.mkdir(path.join(root, 'Ashfall Native Edition'), { recursive: true })
  await fs.mkdir(path.join(root, 'Ashfall NeoForge Edition'), { recursive: true })
  return root
}

async function runAssist(args, options = {}) {
  return execFileAsync(process.execPath, [scriptPath, ...args], options)
}

async function readEvidence(instanceRoot, laneName = 'Ashfall Native Edition') {
  const evidencePath = path.join(
    instanceRoot,
    laneName,
    '.echo',
    'ashfall-lane-game-smoke-evidence.json',
  )
  return JSON.parse(await fs.readFile(evidencePath, 'utf8'))
}

describe('Ashfall lane gameplay capture assistant', () => {
  it('prepares evidence files and proof folders without marking claims true', async () => {
    const instanceRoot = await createInstanceRoot()

    await runAssist(['--instance-root', instanceRoot, '--lane', 'native', '--json'])

    const evidence = await readEvidence(instanceRoot)
    expect(evidence.schemaVersion).toBe('echo.ashfall.lane-game-smoke.evidence.v1')
    expect(evidence.packId).toBe('ashfall-native-edition')
    expect(evidence.claims.hudVisible).toBe(false)
    expect(evidence.proofs.hudVisible).toEqual([])
    await expect(fs.stat(path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'proofs', 'screenshots'))).resolves.toBeTruthy()
    await expect(fs.stat(path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'proofs', 'logs'))).resolves.toBeTruthy()
    await expect(fs.stat(path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'proofs', 'saves'))).resolves.toBeTruthy()
    await expect(fs.stat(path.join(instanceRoot, 'Ashfall Native Edition', '.echo', 'proofs', 'notes'))).resolves.toBeTruthy()
  })

  it('keeps a requested claim false when the proof file is missing', async () => {
    const instanceRoot = await createInstanceRoot()

    await expect(runAssist([
      '--instance-root',
      instanceRoot,
      '--lane',
      'native',
      '--claim',
      'hudVisible=proofs/screenshots/hud-visible.png',
      '--strict',
      '--json',
    ])).rejects.toMatchObject({ code: 1 })

    const evidence = await readEvidence(instanceRoot)
    expect(evidence.claims.hudVisible).toBe(false)
    expect(evidence.proofs.hudVisible).toEqual(['proofs/screenshots/hud-visible.png'])
  })

  it('accepts a requested claim only when the local proof file is non-empty', async () => {
    const instanceRoot = await createInstanceRoot()
    const proofPath = path.join(
      instanceRoot,
      'Ashfall Native Edition',
      '.echo',
      'proofs',
      'screenshots',
      'hud-visible.png',
    )
    await fs.mkdir(path.dirname(proofPath), { recursive: true })
    await fs.writeFile(proofPath, 'captured hud pixels\n')

    await runAssist([
      '--instance-root',
      instanceRoot,
      '--lane',
      'native',
      '--claim',
      'hudVisible=proofs/screenshots/hud-visible.png',
      '--strict',
      '--json',
    ])

    const evidence = await readEvidence(instanceRoot)
    expect(evidence.claims.hudVisible).toBe(true)
    expect(evidence.proofs.hudVisible).toEqual(['proofs/screenshots/hud-visible.png'])
  })

  it('requires lane-qualified claims when preparing all lanes', async () => {
    const instanceRoot = await createInstanceRoot()

    await expect(runAssist([
      '--instance-root',
      instanceRoot,
      '--lane',
      'all',
      '--claim',
      'hudVisible=proofs/screenshots/hud-visible.png',
      '--strict',
      '--json',
    ])).rejects.toThrow('Command failed')
  })

  it('rejects URL proof references as non-local proof', async () => {
    const instanceRoot = await createInstanceRoot()

    await expect(runAssist([
      '--instance-root',
      instanceRoot,
      '--lane',
      'native',
      '--claim',
      'hudVisible=https://example.test/hud.png',
      '--strict',
      '--json',
    ])).rejects.toMatchObject({ code: 1 })

    const evidence = await readEvidence(instanceRoot)
    expect(evidence.claims.hudVisible).toBe(false)
    expect(evidence.proofs.hudVisible).toEqual(['https://example.test/hud.png'])
  })
})
