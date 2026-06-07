import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import AdmZip from 'adm-zip'

const launcherRoot = path.resolve(import.meta.dirname, '..')
const workspaceRoot = path.resolve(launcherRoot, '..')
const androidRoot = path.join(workspaceRoot, 'ECHO-Command-Android')
const reportsDir = path.join(launcherRoot, 'reports')
const generatedAt = new Date().toISOString()
const stamp = generatedAt.replace(/[:.]/g, '-')
const packageRoot = path.join(launcherRoot, 'release-candidates', `mobile-command-center-${stamp}`)
const packageName = path.basename(packageRoot)
const zipPath = `${packageRoot}.zip`
const checksumPath = `${zipPath}.sha256`
const verificationPath = path.join(launcherRoot, 'reports', 'mobile-rc-verification.json')
const allowQuick = process.argv.includes('--allow-quick')
const packageScriptPath = path.join(launcherRoot, 'scripts', 'mobile-rc-package.mjs')
const packageGenerator = {
  file: 'scripts/mobile-rc-package.mjs',
  sha256: crypto.createHash('sha256').update(readFileSync(packageScriptPath)).digest('hex'),
}

const sources = [
  {
    id: 'android-apk',
    source: path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    target: 'ECHO-Command-Center-Android-debug.apk',
  },
  {
    id: 'android-apk-metadata',
    source: path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'output-metadata.json'),
    target: 'android-output-metadata.json',
  },
  {
    id: 'desktop-beta-guide',
    source: path.join(launcherRoot, 'docs', 'mobile-command-center-beta.md'),
    target: 'docs/mobile-command-center-beta.md',
  },
  {
    id: 'desktop-rc-guide',
    source: path.join(launcherRoot, 'docs', 'mobile-beta-release-candidate.md'),
    target: 'docs/mobile-beta-release-candidate.md',
  },
  {
    id: 'android-beta-guide',
    source: path.join(androidRoot, 'docs', 'beta-mobile-pairing.md'),
    target: 'docs/beta-mobile-pairing.md',
  },
  {
    id: 'manual-acceptance-template',
    source: path.join(launcherRoot, 'docs', 'mobile-manual-acceptance-template.json'),
    target: 'mobile-manual-acceptance-template.json',
  },
  {
    id: 'rc-verification-json',
    source: path.join(launcherRoot, 'reports', 'mobile-rc-verification.json'),
    target: 'reports/mobile-rc-verification.json',
  },
  {
    id: 'rc-verification-md',
    source: path.join(launcherRoot, 'reports', 'mobile-rc-verification.md'),
    target: 'reports/mobile-rc-verification.md',
  },
]

const optionalSources = [
  {
    id: 'device-assist-json',
    source: path.join(launcherRoot, 'reports', 'mobile-device-assist.json'),
    target: 'reports/mobile-device-assist.json',
  },
  {
    id: 'device-assist-md',
    source: path.join(launcherRoot, 'reports', 'mobile-device-assist.md'),
    target: 'reports/mobile-device-assist.md',
  },
]

function copyPackageSource(item, copied, required = true) {
  if (!existsSync(item.source)) {
    if (required) throw new Error(`Required RC package source is missing: ${item.source}`)
    return false
  }
  const target = path.join(packageRoot, item.target)
  mkdirSync(path.dirname(target), { recursive: true })
  copyFileSync(item.source, target)
  const bytes = statSync(target).size
  copied.push({
    id: item.id,
    file: item.target.replace(/\\/g, '/'),
    bytes,
    sha256: crypto.createHash('sha256').update(readFileSync(target)).digest('hex'),
  })
  return true
}

function main() {
  if (!existsSync(verificationPath)) {
    throw new Error('Run npm.cmd run rc:mobile before packaging. Missing reports/mobile-rc-verification.json.')
  }
  const verification = JSON.parse(readFileSync(verificationPath, 'utf8'))
  if (!verification.passed) {
    throw new Error('Mobile RC verification did not pass. Run npm.cmd run rc:mobile and fix failures before packaging.')
  }
  if (!verification.runChecks && !allowQuick) {
    throw new Error('Packaging requires a full npm.cmd run rc:mobile report. Use --allow-quick only for local smoke bundles.')
  }

  const copied = []
  mkdirSync(packageRoot, { recursive: true })
  mkdirSync(reportsDir, { recursive: true })

  for (const item of sources) copyPackageSource(item, copied, true)
  for (const item of optionalSources) copyPackageSource(item, copied, false)

  const hasDeviceAssist = copied.some((item) => item.id === 'device-assist-md')

  const manifest = {
    generatedAt,
    packageRoot,
    packageName,
    zipPath,
    checksumPath,
    automatedGate: 'passed',
    manualAcceptance: 'required',
    androidApk: 'ECHO-Command-Center-Android-debug.apk',
    packageGenerator,
    files: copied,
    manualRequired: [
      'Install APK on a physical Android phone.',
      'Pair over LAN with ECHO Launcher QR.',
      'Approve the phone in desktop Settings.',
      'Confirm live data replaces sample fallback.',
      'Run Launch, Update, Repair, Scan Install, Run PackOS Check, and Export Support Bundle.',
      'Confirm repeated Update, Repair, Scan Install, or Export Support Bundle taps do not queue overlapping operations.',
      'Copy diagnostics from desktop and Android Settings.',
    ],
  }

  writeFileSync(path.join(packageRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(
    path.join(packageRoot, 'TESTER-README.md'),
    [
      '# ECHO Command Center Mobile Beta',
      '',
      '## Install',
      '',
      'Install `ECHO-Command-Center-Android-debug.apk` on the Android test device.',
      hasDeviceAssist ? 'If ADB/manual install help is needed, see `reports/mobile-device-assist.md`.' : 'For ADB/manual install help, run `npm.cmd run rc:mobile:device -- --install --launch` before the phone pass.',
      '',
      '## Pair',
      '',
      'Follow `docs/mobile-command-center-beta.md` and `docs/beta-mobile-pairing.md`.',
      'Before scanning the QR, open `http://<desktop-lan-ip>:4177/api/mobile/health` from the phone browser and confirm the desktop bridge returns JSON.',
      'After approval, Android must show `Live launcher data`. `Sample fallback` means the bridge is still not accepted for beta.',
      '',
      '## Report Issues',
      '',
      'Copy diagnostics from both desktop Settings and Android Settings, then paste both blocks into the beta report.',
      'Include the observed Android action result messages for Launch, Update, Repair, Scan Install, Run PackOS Check, and Export Support Bundle.',
      'If ADB was unavailable, include `reports/mobile-device-assist.md` so the install path is documented.',
      '',
      '## Manual Acceptance',
      '',
      '- [ ] APK installed on physical Android phone',
      '- [ ] Phone browser health check returns bridge JSON',
      '- [ ] QR scanned from desktop ECHO Launcher',
      '- [ ] Pending device approved on desktop',
      '- [ ] Android Settings shows paired/authenticated bridge status',
      '- [ ] Android shows `Live launcher data`, not `Sample fallback`',
      '- [ ] Launch action tested with observed result message',
      '- [ ] Update action tested with observed result message',
      '- [ ] Repair action tested with observed result message',
      '- [ ] Scan Install action tested with observed result message',
      '- [ ] Run PackOS Check action tested with observed result message',
      '- [ ] Export Support Bundle action tested with observed result message',
      '- [ ] Duplicate Update/Repair/Scan/Support Bundle tap behavior tested and overlapping operations are rejected or ignored',
      '- [ ] Desktop diagnostics copied',
      '- [ ] Android diagnostics copied',
      '- [ ] Filled acceptance JSON includes APK SHA, RC package name, device/network details, and evidence notes',
      '',
      'Fill `mobile-manual-acceptance-template.json` after the phone pass, then validate it with:',
      '',
      '```powershell',
      'npm.cmd run rc:mobile:acceptance -- C:\\path\\to\\filled-mobile-acceptance.json',
      '```',
      '',
      'See `manifest.json` for file checksums.',
      '',
    ].join('\n'),
  )

  const zip = new AdmZip()
  zip.addLocalFolder(packageRoot, packageName)
  zip.writeZip(zipPath)
  const zipBytes = statSync(zipPath).size
  const zipSha256 = crypto.createHash('sha256').update(readFileSync(zipPath)).digest('hex')
  writeFileSync(checksumPath, `${zipSha256}  ${path.basename(zipPath)}\n`)

  const report = {
    generatedAt,
    passed: true,
    packageRoot,
    packageName,
    zipPath,
    checksumPath,
    zipBytes,
    zipSha256,
    automatedGate: 'passed',
    manualAcceptance: 'required',
    verificationReport: verificationPath,
    deviceAssistIncluded: hasDeviceAssist,
    packageGenerator,
    files: copied,
    uploadableArtifacts: [
      {
        id: 'mobile-rc-zip',
        file: zipPath,
        bytes: zipBytes,
        sha256: zipSha256,
      },
      {
        id: 'mobile-rc-zip-sha256',
        file: checksumPath,
        bytes: statSync(checksumPath).size,
        sha256: crypto.createHash('sha256').update(readFileSync(checksumPath)).digest('hex'),
      },
    ],
    remainingGate: 'Validate a real-phone manual acceptance report before tagging beta.',
  }
  writeFileSync(path.join(reportsDir, 'mobile-rc-package.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(
    path.join(reportsDir, 'mobile-rc-package.md'),
    [
      '# Mobile RC Package',
      '',
      `Generated: ${generatedAt}`,
      'Status: PASS',
      `Package folder: ${packageRoot}`,
      `Zip: ${zipPath}`,
      `Zip SHA-256: ${zipSha256}`,
      `Zip bytes: ${zipBytes}`,
      '',
      '## Included Files',
      '',
      ...copied.map((file) => `- ${file.file} (${file.bytes} bytes, ${file.sha256})`),
      '',
      '## Remaining Gate',
      '',
      '- Validate a real-phone manual acceptance report before tagging beta.',
      '',
    ].join('\n'),
  )

  console.log(`Mobile RC package created: ${packageRoot}`)
  console.log(`Mobile RC package zip: ${zipPath}`)
  console.log(`Zip SHA-256: ${zipSha256}`)
  console.log(`Files: ${copied.length}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
