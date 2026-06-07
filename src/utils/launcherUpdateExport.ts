export const LAUNCHER_UPDATE_REPO = 'knoxhack/ECHOLauncher'
export const LATEST_YML_NAME = 'latest.yml'

export type LauncherUpdateArtifactRole = 'installer' | 'blockmap' | 'latestYml'

export interface LauncherUpdateArtifactInput {
  file: File
  relativePath?: string
}

export interface LauncherUpdateArtifact {
  role: LauncherUpdateArtifactRole
  file: File
  name: string
  relativePath?: string
  size: number
  version?: string
}

export interface LauncherUpdatePreparedArtifact extends LauncherUpdateArtifact {
  sha256: string
}

export type LauncherUpdateLatestYmlSource = 'existing' | 'generated' | 'repaired'

export interface LauncherUpdateSelection {
  installer?: LauncherUpdateArtifact
  blockmap?: LauncherUpdateArtifact
  latestYml?: LauncherUpdateArtifact
  latestYmlSource?: LauncherUpdateLatestYmlSource
  latestYmlOriginal?: LauncherUpdateArtifact
  candidates: LauncherUpdateArtifact[]
  version?: string
  warnings: string[]
  fixes: string[]
}

export interface LauncherUpdateUploadReport {
  ok: boolean
  generatedAt: string
  targetRepo: string
  version: string
  recommendedTag: string
  releaseTitle: string
  versionFolder: string
  latestYmlSource: LauncherUpdateLatestYmlSource
  updateInfo?: string
  manualUploadOrder: string[]
  files: Array<{
    name: string
    role: LauncherUpdateArtifactRole
    size: number
    sha256: string
  }>
  warnings: string[]
  fixes: string[]
}

export interface LauncherUpdateUploadReportOptions {
  updateInfo?: string
  version?: string
}

const installerPattern = /^ECHO-Launcher-(.+)-Setup\.exe$/iu
const blockmapPattern = /^ECHO-Launcher-(.+)-Setup\.exe\.blockmap$/iu

export function parseLauncherUpdateArtifact(file: File, relativePath?: string): LauncherUpdateArtifact | null {
  const name = file.name
  const installer = name.match(installerPattern)
  if (installer?.[1]) {
    return { role: 'installer', file, name, relativePath, size: file.size, version: installer[1] }
  }

  const blockmap = name.match(blockmapPattern)
  if (blockmap?.[1]) {
    return { role: 'blockmap', file, name, relativePath, size: file.size, version: blockmap[1] }
  }

  if (name.toLowerCase() === LATEST_YML_NAME) {
    return { role: 'latestYml', file, name, relativePath, size: file.size }
  }

  return null
}

function versionParts(version: string) {
  return version
    .split(/[-.]/u)
    .map((part) => (/^\d+$/u.test(part) ? Number(part) : part.toLowerCase()))
}

export function compareLauncherVersions(left: string, right: string) {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart === rightPart) continue
    if (typeof leftPart === 'number' && typeof rightPart === 'number') return leftPart - rightPart
    if (typeof leftPart === 'number') return 1
    if (typeof rightPart === 'number') return -1
    return String(leftPart).localeCompare(String(rightPart))
  }
  return 0
}

export async function sha256File(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function base64FromBytes(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    output += alphabet[first >> 2]
    output += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)]
    output += index + 1 < bytes.length ? alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)] : '='
    output += index + 2 < bytes.length ? alphabet[third & 63] : '='
  }
  return output
}

export async function sha512Base64File(file: File) {
  const digest = await crypto.subtle.digest('SHA-512', await file.arrayBuffer())
  return base64FromBytes(new Uint8Array(digest))
}

export function parseLatestYml(text: string) {
  const path = text.match(/^path:\s*['"]?([^'"\r\n]+)['"]?/imu)?.[1]?.trim()
  const url = text.match(/^\s*-\s*url:\s*['"]?([^'"\r\n]+)['"]?/imu)?.[1]?.trim()
  const version = text.match(/^version:\s*['"]?([^'"\r\n]+)['"]?/imu)?.[1]?.trim()
  const sha512 = text.match(/^sha512:\s*['"]?([^'"\r\n]+)['"]?/imu)?.[1]?.trim()
  return { path, sha512, url, version }
}

export function buildLatestYmlContent({
  installerName,
  installerSha512,
  installerSize,
  releaseDate = new Date().toISOString(),
  version,
}: {
  installerName: string
  installerSha512: string
  installerSize: number
  releaseDate?: string
  version: string
}) {
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${installerName}`,
    `    sha512: ${installerSha512}`,
    `    size: ${installerSize}`,
    `path: ${installerName}`,
    `sha512: ${installerSha512}`,
    `releaseDate: '${releaseDate}'`,
    '',
  ].join('\n')
}

function fileFromText(name: string, contents: string) {
  return new File([contents], name, { type: 'text/yaml' })
}

export async function selectLauncherUpdateArtifacts(inputs: LauncherUpdateArtifactInput[]): Promise<LauncherUpdateSelection> {
  const candidates = inputs
    .map((input) => parseLauncherUpdateArtifact(input.file, input.relativePath))
    .filter((artifact): artifact is LauncherUpdateArtifact => Boolean(artifact))
  const installers = candidates
    .filter((artifact) => artifact.role === 'installer' && artifact.version)
    .sort((left, right) => compareLauncherVersions(right.version ?? '', left.version ?? ''))
  const installer = installers[0]
  const version = installer?.version
  const blockmap = candidates.find((artifact) => artifact.role === 'blockmap' && artifact.version === version)
  const latestYml = candidates.find((artifact) => artifact.role === 'latestYml')
  const warnings: string[] = []
  const fixes: string[] = []
  let resolvedLatestYml = latestYml
  let latestYmlSource: LauncherUpdateLatestYmlSource | undefined = latestYml ? 'existing' : undefined

  if (!installer) warnings.push('No ECHO launcher installer was found.')
  if (installer && !blockmap) warnings.push(`No blockmap matched ${installer.name}.`)
  if (version && /-\w/u.test(version)) warnings.push(`Version ${version} looks like a prerelease. Stable users only receive stable launcher updates.`)

  if (installer && blockmap && version) {
    const installerSha512 = await sha512Base64File(installer.file)
    const repairedLatestYml = buildLatestYmlContent({
      installerName: installer.name,
      installerSha512,
      installerSize: installer.size,
      version,
    })

    if (!latestYml) {
      const file = fileFromText(LATEST_YML_NAME, repairedLatestYml)
      resolvedLatestYml = parseLauncherUpdateArtifact(file) ?? undefined
      latestYmlSource = 'generated'
      fixes.push('latest.yml was missing and was generated from the detected installer.')
    } else {
      const latestText = await latestYml.file.text()
      const latest = parseLatestYml(latestText)
      const referencedPath = latest.path ?? latest.url
      const needsRepair =
        referencedPath !== installer.name ||
        latest.version !== installer.version ||
        latest.sha512 !== installerSha512

      if (needsRepair) {
        const file = fileFromText(LATEST_YML_NAME, repairedLatestYml)
        resolvedLatestYml = parseLauncherUpdateArtifact(file, latestYml.relativePath) ?? undefined
        latestYmlSource = 'repaired'
        fixes.push('latest.yml was repaired to match the detected installer, version, size, and SHA-512 hash.')
      }
    }
  } else if (!latestYml) {
    warnings.push('latest.yml was not found and cannot be generated until an installer and matching blockmap are detected.')
  }

  if (resolvedLatestYml && installer && latestYml && latestYmlSource === 'existing') {
    const latest = parseLatestYml(await latestYml.file.text())
    const referencedPath = latest.path ?? latest.url
    if (referencedPath && referencedPath !== installer.name) {
      warnings.push(`latest.yml references ${referencedPath}, but the detected installer is ${installer.name}.`)
    }
    if (latest.version && latest.version !== installer.version) {
      warnings.push(`latest.yml version ${latest.version} does not match installer version ${installer.version}.`)
    }
  }

  return {
    installer,
    blockmap,
    latestYml: resolvedLatestYml,
    latestYmlOriginal: latestYml,
    latestYmlSource,
    candidates,
    version,
    warnings,
    fixes,
  }
}

export function uploadOrderForSelection(selection: Pick<LauncherUpdateSelection, 'installer' | 'blockmap' | 'latestYml'>) {
  return [selection.latestYml?.name, selection.installer?.name, selection.blockmap?.name].filter((name): name is string => Boolean(name))
}

export async function buildLauncherUpdateUploadReport(selection: LauncherUpdateSelection, options: LauncherUpdateUploadReportOptions = {}): Promise<{
  report: LauncherUpdateUploadReport
  artifacts: LauncherUpdatePreparedArtifact[]
}> {
  if (!selection.installer || !selection.blockmap || !selection.latestYml || !selection.version || !selection.latestYmlSource) {
    throw new Error('Installer, blockmap, and latest.yml are required before exporting.')
  }

  const installerSha512 = await sha512Base64File(selection.installer.file)
  const version = options.version?.trim() || selection.version
  const updateInfo = options.updateInfo?.trim()
  const warnings = [...selection.warnings]
  const fixes = [...selection.fixes]
  let latestYmlSource = selection.latestYmlSource
  let latestYml = selection.latestYml

  if (version !== selection.version) {
    const latestYmlFile = fileFromText(
      LATEST_YML_NAME,
      buildLatestYmlContent({
        installerName: selection.installer.name,
        installerSha512,
        installerSize: selection.installer.size,
        version,
      }),
    )
    latestYml = parseLauncherUpdateArtifact(latestYmlFile, selection.latestYml.relativePath) ?? latestYml
    latestYmlSource = 'repaired'
    fixes.push(`latest.yml was updated to use custom release version ${version}.`)
    warnings.push(`Custom release version ${version} differs from installer filename version ${selection.version}. Make sure the packaged app version matches.`)
  }

  const artifacts = await Promise.all(
    [latestYml, selection.installer, selection.blockmap].map(async (artifact) => ({
      ...artifact,
      sha256: await sha256File(artifact.file),
    })),
  )
  const versionFolder = `ECHO-Launcher-${version}`
  const report = {
    ok: warnings.length === 0,
    generatedAt: new Date().toISOString(),
    targetRepo: LAUNCHER_UPDATE_REPO,
    version,
    recommendedTag: `v${version}`,
    releaseTitle: `ECHO Launcher ${version}`,
    versionFolder,
    latestYmlSource,
    updateInfo,
    manualUploadOrder: uploadOrderForSelection({ ...selection, latestYml }),
    files: artifacts.map((artifact) => ({
      name: artifact.name,
      role: artifact.role,
      size: artifact.size,
      sha256: artifact.sha256,
    })),
    warnings,
    fixes,
  }

  return { report, artifacts }
}

export function buildLauncherUpdateReleaseNotes(report: LauncherUpdateUploadReport) {
  return [
    `# ${report.releaseTitle}`,
    '',
    `Target repository: ${report.targetRepo}`,
    `Recommended tag: ${report.recommendedTag}`,
    `Bundle folder: ${report.versionFolder}`,
    '',
    report.updateInfo ? `Update info:\n${report.updateInfo}` : 'Update info: none',
    '',
    'Upload these files to the GitHub Release:',
    ...report.manualUploadOrder.map((name, index) => `${index + 1}. ${name}`),
    '',
    `latest.yml: ${report.latestYmlSource}`,
    report.fixes.length ? `Fixes: ${report.fixes.join(' ')}` : 'Fixes: none',
    report.warnings.length ? `Warnings: ${report.warnings.join(' ')}` : 'Warnings: none',
    '',
  ].join('\n')
}
