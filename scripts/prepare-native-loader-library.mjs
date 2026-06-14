import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const VERSION = String(process.env.ECHO_NATIVE_LOADER_VERSION || '1.0.1').trim()
const EXPECTED_SHA1 = String(process.env.ECHO_NATIVE_LOADER_SHA1 || '7abe5fcc00cd907067700396ebd5400759233260').toLowerCase()
const EXPECTED_SIZE = Number(process.env.ECHO_NATIVE_LOADER_SIZE || 1_827_301)
const PUBLIC_FILE_NAME = `echo-native-loader-${VERSION}.jar`
const LIBRARY_FILE_NAME = `native-loader-${VERSION}.jar`
const OUT_DIR = path.resolve('build', 'native-loader')

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function sha1File(filePath) {
  const bytes = await fs.readFile(filePath)
  return crypto.createHash('sha1').update(bytes).digest('hex')
}

function sourceCandidates() {
  const configured = String(process.env.ECHO_NATIVE_LOADER_LOCAL_JAR || '').trim()
  const roots = [
    path.resolve('build', 'native-loader'),
    path.resolve('..', 'ECHO-Native-Platform', 'build', 'public-alpha'),
    path.resolve('..', 'ECHO-Native-Platform', 'build', 'native-loader-client-library'),
    path.resolve('..', 'ECHO-Native-Platform', 'build', 'libs'),
  ]
  const candidates = []
  if (configured) candidates.push(path.resolve(configured))
  for (const root of roots) {
    candidates.push(path.join(root, PUBLIC_FILE_NAME))
    candidates.push(path.join(root, LIBRARY_FILE_NAME))
  }
  return [...new Set(candidates)]
}

async function verifiedCandidate(candidatePath) {
  if (!(await exists(candidatePath))) return null
  const stats = await fs.stat(candidatePath)
  if (!stats.isFile() || stats.size <= 0) return null
  if (EXPECTED_SIZE && stats.size !== EXPECTED_SIZE) return null
  const sha1 = await sha1File(candidatePath)
  if (EXPECTED_SHA1 && sha1.toLowerCase() !== EXPECTED_SHA1) return null
  return { path: candidatePath, sha1, size: stats.size }
}

async function copyIfDifferent(source, target) {
  if (path.resolve(source) === path.resolve(target)) return
  await fs.copyFile(source, target)
}

async function main() {
  const checked = []
  let source = null
  for (const candidatePath of sourceCandidates()) {
    checked.push(candidatePath)
    source = await verifiedCandidate(candidatePath)
    if (source) break
  }
  if (!source) {
    throw new Error(
      `Unable to find verified ${PUBLIC_FILE_NAME}. Checked: ${checked.join(', ')}. ` +
        'Run ECHO-Native-Platform release packaging first or set ECHO_NATIVE_LOADER_LOCAL_JAR.',
    )
  }

  await fs.mkdir(OUT_DIR, { recursive: true })
  const publicTarget = path.join(OUT_DIR, PUBLIC_FILE_NAME)
  const libraryTarget = path.join(OUT_DIR, LIBRARY_FILE_NAME)
  await copyIfDifferent(source.path, publicTarget)
  await copyIfDifferent(source.path, libraryTarget)
  await fs.writeFile(
    path.join(OUT_DIR, 'native-loader-metadata.json'),
    `${JSON.stringify(
      {
        version: VERSION,
        sourcePath: source.path,
        publicFileName: PUBLIC_FILE_NAME,
        libraryFileName: LIBRARY_FILE_NAME,
        minecraftLibrary: {
          name: `com.echo:native-loader:${VERSION}`,
          path: `com/echo/native-loader/${VERSION}/${LIBRARY_FILE_NAME}`,
        },
        sha1: source.sha1,
        size: source.size,
        preparedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`Prepared ${PUBLIC_FILE_NAME} and ${LIBRARY_FILE_NAME} in ${OUT_DIR}`)
}

await main()
