import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const launcherRoot = path.resolve(import.meta.dirname, '..')
const workspaceRoot = path.resolve(launcherRoot, '..')
const androidRoot = path.join(workspaceRoot, 'ECHO-Command-Android')
const runChecks = process.argv.includes('--run-checks')

const requiredFiles = [
  { id: 'desktop-beta-doc', path: path.join(launcherRoot, 'docs', 'mobile-command-center-beta.md') },
  { id: 'desktop-rc-doc', path: path.join(launcherRoot, 'docs', 'mobile-beta-release-candidate.md') },
  { id: 'android-beta-doc', path: path.join(androidRoot, 'docs', 'beta-mobile-pairing.md') },
  { id: 'android-apk', path: path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk') },
  { id: 'desktop-dist', path: path.join(launcherRoot, 'dist', 'index.html') },
]

const checks = []

function record(id, ok, detail) {
  checks.push({ id, ok, detail })
}

function runCommand(id, cwd, command, args) {
  const printable = [command, ...args].join(' ')
  const result = spawnSync(command, args, {
    cwd,
    shell: true,
    stdio: 'inherit',
  })
  record(id, result.status === 0, `${printable} exited ${result.status ?? 'unknown'}`)
}

for (const item of requiredFiles) {
  if (!existsSync(item.path)) {
    record(item.id, false, `${item.path} is missing`)
    continue
  }
  const stats = statSync(item.path)
  record(item.id, stats.size > 0, `${item.path} (${stats.size} bytes)`)
}

if (runChecks) {
  runCommand('launcher-test', launcherRoot, 'npm.cmd', ['test'])
  runCommand('launcher-build', launcherRoot, 'npm.cmd', ['run', 'build'])
  runCommand('launcher-lint', launcherRoot, 'npm.cmd', ['run', 'lint'])
  runCommand('android-unit-test', androidRoot, '.\\gradlew.bat', [':app:testDebugUnitTest'])
  runCommand('android-check', androidRoot, '.\\gradlew.bat', [':app:check'])
  runCommand('android-assemble-debug', androidRoot, '.\\gradlew.bat', [':app:assembleDebug'])
} else {
  record('automated-checks', true, 'Skipped command execution; pass --run-checks to run full gates.')
}

const passed = checks.every((check) => check.ok)
const generatedAt = new Date().toISOString()
const report = {
  generatedAt,
  passed,
  runChecks,
  launcherRoot,
  androidRoot,
  checks,
  manualRequired: [
    'Pair with a real Android phone on the same LAN.',
    'Approve the pending Android device in desktop Settings.',
    'Confirm Android switches from sample fallback to live launcher data.',
    'Run Launch, Update, Repair, Scan Install, Run PackOS Check, and Export Support Bundle from Android.',
    'Confirm duplicate Update, Repair, Scan Install, or Export Support Bundle taps do not queue overlapping operations.',
    'Copy diagnostics from desktop and Android Settings.',
  ],
}

const reportsDir = path.join(launcherRoot, 'reports')
mkdirSync(reportsDir, { recursive: true })
const jsonPath = path.join(reportsDir, 'mobile-rc-verification.json')
const markdownPath = path.join(reportsDir, 'mobile-rc-verification.md')
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(
  markdownPath,
  [
    '# Mobile RC Verification',
    '',
    `Generated: ${generatedAt}`,
    `Status: ${passed ? 'PASS' : 'FAIL'}`,
    '',
    '## Automated Checks',
    '',
    ...checks.map((check) => `- ${check.ok ? 'PASS' : 'FAIL'} ${check.id}: ${check.detail}`),
    '',
    '## Manual Acceptance Still Required',
    '',
    ...report.manualRequired.map((item) => `- ${item}`),
    '',
  ].join('\n'),
)

console.log(`Mobile RC verification ${passed ? 'PASS' : 'FAIL'}`)
console.log(`JSON: ${jsonPath}`)
console.log(`Markdown: ${markdownPath}`)
process.exit(passed ? 0 : 1)
