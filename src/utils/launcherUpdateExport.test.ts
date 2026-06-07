import { describe, expect, it } from 'vitest'
import {
  buildLauncherUpdateReleaseNotes,
  buildLauncherUpdateUploadReport,
  buildLatestYmlContent,
  compareLauncherVersions,
  parseLatestYml,
  parseLauncherUpdateArtifact,
  selectLauncherUpdateArtifacts,
  sha512Base64File,
  uploadOrderForSelection,
} from './launcherUpdateExport'

function file(name: string, contents = 'test') {
  return new File([contents], name)
}

describe('launcher update export helpers', () => {
  it('parses launcher installer and blockmap names', () => {
    expect(parseLauncherUpdateArtifact(file('ECHO-Launcher-1.2.3-Setup.exe'))).toMatchObject({
      role: 'installer',
      version: '1.2.3',
    })
    expect(parseLauncherUpdateArtifact(file('ECHO-Launcher-1.2.3-Setup.exe.blockmap'))).toMatchObject({
      role: 'blockmap',
      version: '1.2.3',
    })
    expect(parseLauncherUpdateArtifact(file('latest.yml'))).toMatchObject({ role: 'latestYml' })
    expect(parseLauncherUpdateArtifact(file('ECHO-Launcher-1.2.3.dmg'))).toBeNull()
  })

  it('sorts launcher versions with stable builds above prerelease suffixes', () => {
    expect(compareLauncherVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(compareLauncherVersions('1.0.1', '1.0.1-beta.1')).toBeGreaterThan(0)
  })

  it('parses latest.yml path and version', () => {
    expect(parseLatestYml('version: 1.0.1\npath: ECHO-Launcher-1.0.1-Setup.exe\n')).toEqual({
      path: 'ECHO-Launcher-1.0.1-Setup.exe',
      sha512: undefined,
      url: undefined,
      version: '1.0.1',
    })
  })

  it('selects nested repo-root artifacts and generates missing latest.yml', async () => {
    const selection = await selectLauncherUpdateArtifacts([
      { file: file('ECHO-Launcher-1.0.0-Setup.exe'), relativePath: 'ECHOLauncher/installer-artifacts/ECHO-Launcher-1.0.0-Setup.exe' },
      {
        file: file('ECHO-Launcher-1.0.0-Setup.exe.blockmap'),
        relativePath: 'ECHOLauncher/installer-artifacts/ECHO-Launcher-1.0.0-Setup.exe.blockmap',
      },
      { file: file('ECHO-Launcher-1.0.1-Setup.exe'), relativePath: 'ECHOLauncher/installer-artifacts/ECHO-Launcher-1.0.1-Setup.exe' },
      {
        file: file('ECHO-Launcher-1.0.1-Setup.exe.blockmap'),
        relativePath: 'ECHOLauncher/installer-artifacts/ECHO-Launcher-1.0.1-Setup.exe.blockmap',
      },
    ])

    expect(selection.version).toBe('1.0.1')
    expect(selection.installer?.name).toBe('ECHO-Launcher-1.0.1-Setup.exe')
    expect(selection.blockmap?.name).toBe('ECHO-Launcher-1.0.1-Setup.exe.blockmap')
    expect(selection.latestYml?.name).toBe('latest.yml')
    expect(selection.latestYmlSource).toBe('generated')
    expect(selection.fixes.join(' ')).toContain('latest.yml was missing')
    expect(selection.warnings).toEqual([])
  })

  it('keeps an existing matching latest.yml', async () => {
    const installer = file('ECHO-Launcher-1.0.1-Setup.exe')
    const sha512 = await sha512Base64File(installer)
    const latestYml = buildLatestYmlContent({
      installerName: 'ECHO-Launcher-1.0.1-Setup.exe',
      installerSha512: sha512,
      installerSize: installer.size,
      releaseDate: '2026-05-23T00:00:00.000Z',
      version: '1.0.1',
    })
    const selection = await selectLauncherUpdateArtifacts([
      { file: installer },
      { file: file('ECHO-Launcher-1.0.1-Setup.exe.blockmap') },
      { file: file('latest.yml', latestYml) },
    ])

    expect(selection.latestYmlSource).toBe('existing')
    expect(selection.fixes).toEqual([])
    expect(selection.warnings).toEqual([])
  })

  it('repairs latest.yml when it references another installer', async () => {
    const selection = await selectLauncherUpdateArtifacts([
      { file: file('ECHO-Launcher-1.0.1-Setup.exe') },
      { file: file('ECHO-Launcher-1.0.1-Setup.exe.blockmap') },
      { file: file('latest.yml', 'version: 1.0.0\npath: ECHO-Launcher-1.0.0-Setup.exe\n') },
    ])

    expect(selection.latestYmlSource).toBe('repaired')
    expect(selection.fixes.join(' ')).toContain('latest.yml was repaired')
    expect(selection.warnings).toEqual([])
    expect(await selection.latestYml?.file.text()).toContain('path: ECHO-Launcher-1.0.1-Setup.exe')
  })

  it('keeps a clear warning when installer artifacts are incomplete', async () => {
    const selection = await selectLauncherUpdateArtifacts([
      { file: file('ECHO-Launcher-1.0.1-Setup.exe') },
    ])

    expect(selection.blockmap).toBeUndefined()
    expect(selection.latestYml).toBeUndefined()
    expect(selection.warnings.join(' ')).toContain('No blockmap matched ECHO-Launcher-1.0.1-Setup.exe')
    expect(selection.warnings.join(' ')).toContain('latest.yml was not found and cannot be generated')
  })

  it('builds upload order, report, and release notes', async () => {
    const selection = await selectLauncherUpdateArtifacts([
      { file: file('ECHO-Launcher-1.0.1-Setup.exe') },
      { file: file('ECHO-Launcher-1.0.1-Setup.exe.blockmap') },
      { file: file('latest.yml', 'version: 1.0.1\npath: ECHO-Launcher-1.0.1-Setup.exe\n') },
    ])
    const { report } = await buildLauncherUpdateUploadReport(selection)

    expect(uploadOrderForSelection(selection)).toEqual([
      'latest.yml',
      'ECHO-Launcher-1.0.1-Setup.exe',
      'ECHO-Launcher-1.0.1-Setup.exe.blockmap',
    ])
    expect(report.recommendedTag).toBe('v1.0.1')
    expect(report.releaseTitle).toBe('ECHO Launcher 1.0.1')
    expect(report.latestYmlSource).toBe('repaired')
    expect(report.fixes.join(' ')).toContain('latest.yml was repaired')
    expect(report.files).toHaveLength(3)
    expect(buildLauncherUpdateReleaseNotes(report)).toContain('Target repository: knoxhack/ECHOLauncher')
  })

  it('allows custom release version and update info at export time', async () => {
    const selection = await selectLauncherUpdateArtifacts([
      { file: file('ECHO-Launcher-1.0.1-Setup.exe') },
      { file: file('ECHO-Launcher-1.0.1-Setup.exe.blockmap') },
    ])
    const { artifacts, report } = await buildLauncherUpdateUploadReport(selection, {
      updateInfo: 'Improves launcher update export flow.',
      version: '1.0.2',
    })

    expect(report.version).toBe('1.0.2')
    expect(report.versionFolder).toBe('ECHO-Launcher-1.0.2')
    expect(report.updateInfo).toBe('Improves launcher update export flow.')
    expect(report.latestYmlSource).toBe('repaired')
    expect(report.warnings.join(' ')).toContain('differs from installer filename version 1.0.1')
    expect(await artifacts[0]?.file.text()).toContain('version: 1.0.2')
    expect(buildLauncherUpdateReleaseNotes(report)).toContain('Improves launcher update export flow.')
  })
})
