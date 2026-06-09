import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const keepTemp = process.argv.includes('--keep-temp')
const packId = 'ashfall-native-edition'
const moduleId = 'e2e.weather'
const publisher = 'knoxhack'
const now = new Date('2026-06-09T00:00:00.000Z').toISOString()

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i += 1) {
  let value = i
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  crcTable[i] = value >>> 0
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath))
}

function filePathFromUrl(url) {
  const parsed = new URL(url)
  assert(parsed.protocol === 'file:', `Local E2E only accepts file URLs: ${url}`)
  const pathname = decodeURIComponent(parsed.pathname)
  return process.platform === 'win32' && /^\/[a-z]:/i.test(pathname) ? pathname.slice(1) : pathname
}

async function readJsonUrl(url) {
  return JSON.parse(await fs.readFile(filePathFromUrl(url), 'utf8'))
}

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function u16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

function jsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeStoredZip(filePath, entries) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, '/')
    const nameBuffer = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8')
    const crc = crc32(data)
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer,
    ])
    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer,
    ])

    localParts.push(localHeader, data)
    centralParts.push(centralHeader)
    offset += localHeader.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const endRecord = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ])

  await fs.writeFile(filePath, Buffer.concat([...localParts, centralDirectory, endRecord]))
}

async function readStoredZip(filePath) {
  const archive = await fs.readFile(filePath)
  const entries = new Map()
  let offset = 0

  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8)
    const compressedSize = archive.readUInt32LE(offset + 18)
    const uncompressedSize = archive.readUInt32LE(offset + 22)
    const nameLength = archive.readUInt16LE(offset + 26)
    const extraLength = archive.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const dataEnd = dataStart + compressedSize
    const name = archive.subarray(nameStart, nameStart + nameLength).toString('utf8')

    assert(method === 0, `Only stored ZIP entries are supported in this fixture: ${name}`)
    assert(compressedSize === uncompressedSize, `ZIP entry size mismatch: ${name}`)
    entries.set(name, archive.subarray(dataStart, dataEnd))
    offset = dataEnd
  }

  return entries
}

function parseEchoProtocolUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'echo:') return null
  const parts = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)].filter(Boolean)
  if (parts[0] === 'install' && parts[1] === 'addon' && parts[2]) {
    return {
      action: 'install-addon',
      id: decodeURIComponent(parts[2]).toLowerCase(),
      pack: parsed.searchParams.get('pack') || undefined,
    }
  }
  if (parts[0] === 'update' && parts[1] === 'pack' && parts[2]) {
    return {
      action: 'update-pack',
      id: decodeURIComponent(parts[2]).toLowerCase(),
    }
  }
  return null
}

function resolveEchoProtocolEntry(rawUrl, entries) {
  const request = parseEchoProtocolUrl(rawUrl)
  if (!request) return null
  const entry = entries.find((candidate) => {
    if (candidate.validation !== 'approved') return false
    if (request.action === 'install-addon') {
      return (candidate.kind === 'addon' || candidate.kind === 'module') && candidate.id.toLowerCase() === request.id
    }
    return candidate.kind === 'modpack' && candidate.id.toLowerCase() === request.id
  })
  if (!entry) return null

  if (request.action === 'install-addon') {
    const targetPack = request.pack || packId
    const packEntry = entries.find((candidate) => candidate.kind === 'modpack' && candidate.validation === 'approved' && candidate.id.toLowerCase() === targetPack)
    if (!packEntry) return null
    const packAllowsModule = (packEntry.dependencies ?? []).some((dependency) => String(dependency.id).toLowerCase() === entry.id.toLowerCase())
      || (entry.compatibility ?? []).map((item) => String(item).toLowerCase()).includes(targetPack)
    if (!packAllowsModule) return null
    const artifact = artifactForPackTarget(entry, targetPack)
    if (!artifact?.url || !artifact.sha256) return null
    return { ...request, entry, packEntry, artifact }
  }

  const manifest = artifactRecords(entry).find((record) => record.role === 'manifest' || /\.pack\.json$/i.test(record.name))
  if (!manifest?.url || !manifest.sha256) return null
  return { ...request, entry, artifact: manifest }
}

function artifactRecords(entry) {
  const records = []
  const visit = (node, role = 'asset') => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, role))
      return
    }
    if (!node || typeof node !== 'object') return
    if (node.file || node.name || node.url || node.sha256) {
      records.push({
        role,
        name: String(node.file ?? node.name ?? role),
        url: node.url,
        sha256: node.sha256,
        size: node.size,
      })
    }
    for (const [key, value] of Object.entries(node)) visit(value, key)
  }
  visit(entry.artifacts)
  return records
}

function artifactForPackTarget(entry, pack) {
  const records = artifactRecords(entry)
  if (pack === 'ashfall-neoforge-edition') return records.find((record) => record.role === 'neoforge' || /-neoforge\.jar$/i.test(record.name))
  if (pack === 'ashfall-standalone-edition') return records.find((record) => record.role === 'standalone' || /-standalone\.jar$/i.test(record.name))
  return records.find((record) => record.role === 'native' || /\.echo-addon$/i.test(record.name))
}

function dependencyClosure(entries, rootIds) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const seen = new Set()
  const out = []
  const visit = (id) => {
    if (seen.has(id)) return
    const entry = byId.get(id)
    assert(entry, `Missing Release Index dependency ${id}.`)
    assert(entry.validation !== 'blocked', `Blocked Release Index dependency ${id}.`)
    assert(entry.validation === 'approved', `Unapproved Release Index dependency ${id}.`)
    seen.add(id)
    for (const dependency of entry.dependencies ?? []) visit(dependency.id)
    out.push(entry)
  }
  rootIds.forEach(visit)
  return out
}

async function createModuleArtifact(releasesDir, version) {
  const fileName = `${moduleId}-${version}.echo-addon`
  const filePath = path.join(releasesDir, fileName)
  const packageManifest = {
    schemaVersion: 'echo.addon.package.v1',
    id: moduleId,
    name: 'E2E Weather Module',
    version,
    publisher,
    kind: 'module',
    targets: [packId],
    dependencies: [],
    artifacts: {
      native: {
        file: fileName,
      },
    },
  }
  const moduleManifest = {
    schemaVersion: 'echo.module.release.v1',
    id: moduleId,
    name: 'E2E Weather Module',
    version,
    entrypoint: 'com.echo.e2e.weather.WeatherModule',
  }

  await writeStoredZip(filePath, [
    { name: 'echo-addon-package.json', data: jsonBuffer(packageManifest) },
    { name: 'META-INF/echo.mod.json', data: jsonBuffer(moduleManifest) },
    { name: 'content/version.txt', data: Buffer.from(`${version}\n`, 'utf8') },
  ])

  const bytes = await fs.readFile(filePath)
  return {
    fileName,
    filePath,
    size: bytes.length,
    sha256: sha256(bytes),
  }
}

async function ingestLocalModuleArtifact(artifact, version) {
  const zipEntries = await readStoredZip(artifact.filePath)
  const packageManifest = JSON.parse(zipEntries.get('echo-addon-package.json')?.toString('utf8') ?? '{}')
  const moduleManifest = JSON.parse(zipEntries.get('META-INF/echo.mod.json')?.toString('utf8') ?? '{}')

  assert(packageManifest.schemaVersion === 'echo.addon.package.v1', 'Package manifest schemaVersion mismatch.')
  assert(packageManifest.id === moduleId, 'Package manifest id mismatch.')
  assert(packageManifest.version === version, 'Package manifest version mismatch.')
  assert(moduleManifest.id === moduleId, 'Module metadata id mismatch.')
  assert(moduleManifest.version === version, 'Module metadata version mismatch.')
  assert(await sha256File(artifact.filePath) === artifact.sha256, 'Artifact SHA-256 changed during local ingestion.')

  return {
    id: moduleId,
    kind: 'module',
    version,
    channel: 'alpha',
    publisher,
    sourceRepo: 'knoxhack/ECHO-Modules',
    releaseTag: `local-e2e-v${version}`,
    commitSha: '0000000000000000000000000000000000000000',
    artifacts: {
      native: {
        file: artifact.fileName,
        url: pathToFileURL(artifact.filePath).href,
        size: artifact.size,
        sha256: artifact.sha256,
      },
    },
    dependencies: [],
    compatibility: [packId],
    trust: 'provenance-attested',
    validation: 'approved',
  }
}

function createPackEntry(manifestPath, version, manifestSha256) {
  return {
    id: packId,
    kind: 'modpack',
    version,
    channel: 'alpha',
    publisher,
    sourceRepo: 'knoxhack/ECHO-Ashfall-Native-Edition',
    releaseTag: `local-pack-v${version}`,
    commitSha: '1111111111111111111111111111111111111111',
    artifacts: {
      manifest: {
        file: `${packId}-alpha-${version}.pack.json`,
        url: pathToFileURL(manifestPath).href,
        sha256: manifestSha256,
      },
    },
    dependencies: [{ id: moduleId, kind: 'module', version: '*' }],
    compatibility: [packId],
    trust: 'official',
    validation: 'approved',
  }
}

async function writeIndex(root, entries) {
  await fs.mkdir(path.join(root, 'channels', 'alpha'), { recursive: true })
  await fs.mkdir(path.join(root, 'modules'), { recursive: true })
  await fs.mkdir(path.join(root, 'modpacks'), { recursive: true })
  await fs.writeFile(path.join(root, 'modules', `${moduleId}.json`), jsonBuffer(entries.find((entry) => entry.id === moduleId)))
  await fs.writeFile(path.join(root, 'modpacks', `${packId}.json`), jsonBuffer(entries.find((entry) => entry.id === packId)))
  await fs.writeFile(path.join(root, 'channels', 'alpha', 'launcher-channel.json'), jsonBuffer({
    schemaVersion: 1,
    channel: 'alpha',
    generatedAt: now,
    releaseManifestUrl: pathToFileURL(path.join(root, 'channels', 'alpha', 'release-manifest.json')).href,
    repositoryCatalogUrl: pathToFileURL(path.join(root, 'channels', 'alpha', 'repositories.json')).href,
    catalogUrls: {
      products: [],
      modpacks: [
        pathToFileURL(path.join(root, 'modpacks', `${packId}.json`)).href,
      ],
      modules: [
        pathToFileURL(path.join(root, 'modules', `${moduleId}.json`)).href,
      ],
      addons: [],
    },
  }))
}

async function loadCatalogFromChannel(channelUrl) {
  const channel = await readJsonUrl(channelUrl)
  assert(channel.schemaVersion === 1, 'Launcher channel schemaVersion mismatch.')
  assert(channel.channel === 'alpha', 'Launcher channel mismatch.')
  const catalogUrls = channel.catalogUrls ?? {}
  const urls = Array.isArray(catalogUrls)
    ? catalogUrls
    : Object.values(catalogUrls).flatMap((value) => (Array.isArray(value) ? value : [value]))
  const entries = []
  for (const url of urls.filter(Boolean)) {
    const payload = await readJsonUrl(url)
    entries.push(...(Array.isArray(payload) ? payload : [payload]))
  }
  assert(entries.length >= 2, 'Release Index channel did not load module and modpack entries.')
  return entries
}

async function copyVerifiedArtifact(record, destinationPath) {
  assert(record?.url, 'Selected artifact is missing a URL.')
  const normalizedSource = filePathFromUrl(record.url)
  const actualSha256 = await sha256File(normalizedSource)
  assert(actualSha256 === record.sha256, `Artifact checksum mismatch: expected ${record.sha256}, got ${actualSha256}.`)
  await fs.mkdir(path.dirname(destinationPath), { recursive: true })
  await fs.copyFile(normalizedSource, destinationPath)
  assert(await sha256File(destinationPath) === record.sha256, 'Installed artifact checksum mismatch.')
}

async function installFromDeepLink(entries, installRoot, rawUrl) {
  const resolved = resolveEchoProtocolEntry(rawUrl, entries)
  assert(resolved, `Deep link did not resolve through an approved index entry: ${rawUrl}`)
  const closure = dependencyClosure(entries, [resolved.entry.id, resolved.packEntry?.id].filter(Boolean))
  assert(closure.map((entry) => entry.id).includes(moduleId), 'Dependency closure did not include the target module.')
  const artifact = resolved.artifact
  assert(artifact, 'No playable native artifact selected for install.')

  const installedPath = path.join(installRoot, 'addons', artifact.name)
  await copyVerifiedArtifact(artifact, installedPath)
  await fs.mkdir(path.join(installRoot, '.echo'), { recursive: true })
  await fs.writeFile(path.join(installRoot, '.echo', 'installed.json'), jsonBuffer({
    id: resolved.entry.id,
    version: resolved.entry.version,
    path: path.relative(installRoot, installedPath).replace(/\\/g, '/'),
    sha256: artifact.sha256,
  }))
  return { artifact, installedPath }
}

async function updateModule(entries, installRoot, previousInstall, newEntry) {
  const newArtifact = artifactForPackTarget(newEntry, packId)
  assert(newArtifact, 'No playable native artifact selected for update.')
  const backupDir = path.join(installRoot, '.echo', 'rollback', `update-${newEntry.version}`)
  const oldRelativePath = path.relative(installRoot, previousInstall.installedPath).replace(/\\/g, '/')
  const newPath = path.join(installRoot, 'addons', newArtifact.name)
  const newRelativePath = path.relative(installRoot, newPath).replace(/\\/g, '/')
  const backupPath = path.join(backupDir, oldRelativePath)

  await fs.mkdir(path.dirname(backupPath), { recursive: true })
  await fs.copyFile(previousInstall.installedPath, backupPath)
  assert(await sha256File(backupPath) === previousInstall.artifact.sha256, 'Rollback backup does not match the original artifact.')
  await fs.rm(previousInstall.installedPath)
  await copyVerifiedArtifact(newArtifact, newPath)

  const rollbackPlan = {
    installId: `local-e2e-${moduleId}`,
    operation: 'update',
    installPath: installRoot,
    backedUp: [{ path: oldRelativePath, backupPath }],
    removed: [newRelativePath],
    createdAt: now,
  }
  const rollbackPlanPath = path.join(backupDir, 'rollback-plan.json')
  await fs.writeFile(rollbackPlanPath, jsonBuffer(rollbackPlan))
  const savedRollbackPlan = JSON.parse(await fs.readFile(rollbackPlanPath, 'utf8'))
  assert(savedRollbackPlan.backedUp?.[0]?.path === oldRelativePath, 'Rollback plan did not persist the backed up artifact path.')
  assert(savedRollbackPlan.removed?.[0] === newRelativePath, 'Rollback plan did not persist the updated artifact path.')
  await fs.writeFile(path.join(installRoot, '.echo', 'installed.json'), jsonBuffer({
    id: newEntry.id,
    version: newEntry.version,
    path: newRelativePath,
    sha256: newArtifact.sha256,
  }))

  assert(resolveEchoProtocolEntry(`echo://update/pack/${packId}`, entries), 'Pack update deep link did not resolve.')
  return { artifact: newArtifact, installedPath: newPath, rollbackPlan }
}

async function repairCorruptInstall(currentInstall) {
  await fs.writeFile(currentInstall.installedPath, Buffer.from('corrupted local e2e artifact\n', 'utf8'))
  const corruptSha = await sha256File(currentInstall.installedPath)
  assert(corruptSha !== currentInstall.artifact.sha256, 'Corruption fixture did not change the installed artifact.')
  await copyVerifiedArtifact(currentInstall.artifact, currentInstall.installedPath)
  assert(await sha256File(currentInstall.installedPath) === currentInstall.artifact.sha256, 'Repair did not restore the expected artifact.')
}

async function rollbackUpdate(plan) {
  for (const relativePath of plan.removed) {
    await fs.rm(path.join(plan.installPath, relativePath), { force: true })
  }
  for (const backup of plan.backedUp) {
    const destination = path.join(plan.installPath, backup.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(backup.backupPath, destination)
  }
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-release-index-e2e-'))
  const releaseRoot = path.join(tempRoot, 'release-index')
  const releasesDir = path.join(tempRoot, 'releases')
  const installRoot = path.join(tempRoot, 'install')
  await fs.mkdir(releasesDir, { recursive: true })

  try {
    const artifactV1 = await createModuleArtifact(releasesDir, '1.0.0')
    const artifactV2 = await createModuleArtifact(releasesDir, '1.1.0')
    const moduleV1 = await ingestLocalModuleArtifact(artifactV1, '1.0.0')
    const moduleV2 = await ingestLocalModuleArtifact(artifactV2, '1.1.0')
    const manifestV1Path = path.join(releasesDir, `${packId}-alpha-1.0.0.pack.json`)
    await fs.writeFile(manifestV1Path, jsonBuffer({
      pack: packId,
      version: '1.0.0',
      channel: 'alpha',
      moduleRequirements: [{ id: moduleId, version: '1.0.0' }],
      files: [{ path: `addons/${artifactV1.fileName}`, sha256: artifactV1.sha256, size: artifactV1.size, required: true }],
    }))
    const manifestV2Path = path.join(releasesDir, `${packId}-alpha-1.1.0.pack.json`)
    await fs.writeFile(manifestV2Path, jsonBuffer({
      pack: packId,
      version: '1.1.0',
      channel: 'alpha',
      moduleRequirements: [{ id: moduleId, version: '1.1.0' }],
      files: [{ path: `addons/${artifactV2.fileName}`, sha256: artifactV2.sha256, size: artifactV2.size, required: true }],
    }))
    const packV1 = createPackEntry(manifestV1Path, '1.0.0', await sha256File(manifestV1Path))
    const packV2 = createPackEntry(manifestV2Path, '1.1.0', await sha256File(manifestV2Path))
    await writeIndex(releaseRoot, [moduleV1, packV1])
    const channelUrl = pathToFileURL(path.join(releaseRoot, 'channels', 'alpha', 'launcher-channel.json')).href
    const installEntries = await loadCatalogFromChannel(channelUrl)

    const installed = await installFromDeepLink(installEntries, installRoot, `echo://install/addon/${moduleId}?pack=${packId}`)
    await writeIndex(releaseRoot, [moduleV2, packV2])
    const updateEntries = await loadCatalogFromChannel(channelUrl)
    const updated = await updateModule(updateEntries, installRoot, installed, moduleV2)
    await repairCorruptInstall(updated)
    await rollbackUpdate(updated.rollbackPlan)

    const restoredPath = path.join(installRoot, updated.rollbackPlan.backedUp[0].path)
    assert(await sha256File(restoredPath) === installed.artifact.sha256, 'Rollback did not restore the original module artifact.')
    await fs.access(path.join(installRoot, updated.rollbackPlan.removed[0])).then(
      () => {
        throw new Error('Rollback did not remove the updated module artifact.')
      },
      () => undefined,
    )

    console.log(JSON.stringify({
      ok: true,
      releaseIndexFixture: path.join(releaseRoot, 'channels', 'alpha', 'launcher-channel.json'),
      installed: path.relative(tempRoot, installed.installedPath).replace(/\\/g, '/'),
      updated: path.relative(tempRoot, updated.installedPath).replace(/\\/g, '/'),
      rollbackRestored: path.relative(tempRoot, restoredPath).replace(/\\/g, '/'),
      tempCleaned: !keepTemp,
      keptTemp: keepTemp ? tempRoot : undefined,
    }, null, 2))
  } finally {
    if (!keepTemp) await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

await main()
