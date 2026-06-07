import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const launcherRoot = path.resolve(import.meta.dirname, '..')
const inputPath = process.argv[2]

const requiredCheckIds = [
  'apk-installed',
  'qr-pairing',
  'desktop-approval',
  'auto-finish-pairing',
  'live-data',
  'launch-action',
  'update-action',
  'repair-action',
  'scan-install-action',
  'packos-check-action',
  'support-bundle-action',
  'duplicate-operation-guard',
  'desktop-diagnostics-copied',
  'android-diagnostics-copied',
]

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!inputPath) {
  fail('Usage: npm.cmd run rc:mobile:acceptance -- <filled-acceptance.json>')
}

const resolvedInput = path.resolve(inputPath)
if (!existsSync(resolvedInput)) fail(`Acceptance file not found: ${resolvedInput}`)

const acceptance = JSON.parse(readFileSync(resolvedInput, 'utf8'))
const checks = Array.isArray(acceptance.checks) ? acceptance.checks : []
const byId = new Map(checks.map((check) => [String(check.id ?? ''), check]))
const failures = []

function noteFor(id) {
  return String(byId.get(id)?.notes ?? '').trim()
}

function requireNoteIncludes(id, patterns, description) {
  const note = noteFor(id)
  if (!note) {
    failures.push(`Check ${id} must include notes with ${description}`)
    return
  }
  if (!patterns.some((pattern) => pattern.test(note))) {
    failures.push(`Check ${id} notes must mention ${description}`)
  }
}

function requireNoteMatchesAll(id, patterns, description) {
  const note = noteFor(id)
  if (!note) {
    failures.push(`Check ${id} must include notes with ${description}`)
    return
  }
  const missing = patterns.filter((pattern) => !pattern.test(note))
  if (missing.length) failures.push(`Check ${id} notes must mention ${description}`)
}

if (Number(acceptance.schemaVersion) !== 1) failures.push('schemaVersion must be 1')
if (!String(acceptance.testedAt ?? '').trim()) failures.push('testedAt is required')
if (!String(acceptance.tester ?? '').trim()) failures.push('tester is required')
if (!String(acceptance.androidDevice?.model ?? '').trim()) failures.push('androidDevice.model is required')
if (!String(acceptance.androidDevice?.androidVersion ?? '').trim()) failures.push('androidDevice.androidVersion is required')
if (!String(acceptance.androidDevice?.network ?? '').trim()) failures.push('androidDevice.network is required')
if (!String(acceptance.desktop?.os ?? '').trim()) failures.push('desktop.os is required')
if (!String(acceptance.desktop?.lanUrl ?? '').trim()) failures.push('desktop.lanUrl is required')
if (!/^https?:\/\/[^/]+:4177\/api\/?$/i.test(String(acceptance.desktop?.lanUrl ?? '').trim())) {
  failures.push('desktop.lanUrl must look like http://<lan-ip>:4177/api/')
}
if (!/^[a-f0-9]{64}$/i.test(String(acceptance.artifacts?.apkSha256 ?? '').trim())) {
  failures.push('artifacts.apkSha256 must be a SHA-256 hex string')
}
if (!String(acceptance.artifacts?.rcPackage ?? '').trim()) failures.push('artifacts.rcPackage is required')

for (const id of requiredCheckIds) {
  const check = byId.get(id)
  if (!check) {
    failures.push(`Missing check: ${id}`)
    continue
  }
  if (String(check.status ?? '').toLowerCase() !== 'pass') {
    failures.push(`Check ${id} must be pass`)
  }
}

if (!String(acceptance.diagnostics?.desktopCopied ?? '').trim()) {
  failures.push('diagnostics.desktopCopied is required')
}
if (!String(acceptance.diagnostics?.androidCopied ?? '').trim()) {
  failures.push('diagnostics.androidCopied is required')
}
const desktopDiagnostics = String(acceptance.diagnostics?.desktopCopied ?? '')
const androidDiagnostics = String(acceptance.diagnostics?.androidCopied ?? '')
for (const expected of [
  'Mobile Command Center',
  'LAN',
  'Phone health URL',
  'Command center URL',
  'Pending devices',
  'Paired devices',
  'Beta acceptance checklist',
  'LAN/firewall troubleshooting',
  'No device tokens',
]) {
  if (!desktopDiagnostics.toLowerCase().includes(expected.toLowerCase())) {
    failures.push(`diagnostics.desktopCopied must include "${expected}"`)
  }
}
if (!/bridge url|lan url/i.test(desktopDiagnostics)) {
  failures.push('diagnostics.desktopCopied must include "Bridge URL" or "LAN URL"')
}
for (const expected of ['ECHO Android Bridge Diagnostics', 'Bridge URL', 'Data:', 'Device token stored', 'No device tokens']) {
  if (!androidDiagnostics.toLowerCase().includes(expected.toLowerCase())) {
    failures.push(`diagnostics.androidCopied must include "${expected}"`)
  }
}

requireNoteIncludes('live-data', [/live launcher data/i, /not sample/i, /sample fallback.*(no|false|cleared)/i], 'live data replacing sample fallback')
requireNoteMatchesAll('launch-action', [/launch|minecraft launcher/i, /queued|opened|complete|attention|failed|handoff/i], 'the Launch action result message')
requireNoteMatchesAll('update-action', [/update/i, /queued|running|already|complete|failed/i], 'the Update action result message')
requireNoteMatchesAll('repair-action', [/repair/i, /queued|running|already|complete|failed/i], 'the Repair action result message')
requireNoteMatchesAll('scan-install-action', [/scan|verify|verification/i, /missing|corrupt|complete|0/i], 'the Scan Install verification result')
requireNoteMatchesAll('packos-check-action', [/packos/i, /ready|state|blocked|unavailable|complete|failed/i], 'the PackOS Check result message')
requireNoteMatchesAll('support-bundle-action', [/support bundle|logs/i, /exported|queued|complete|failed|zip/i], 'the Export Support Bundle result message')
requireNoteMatchesAll('duplicate-operation-guard', [/update|repair|scan|support/i, /already running|no overlapping|duplicate|one operation/i], 'duplicate operation guard behavior')

const reportsDir = path.join(launcherRoot, 'reports')
mkdirSync(reportsDir, { recursive: true })
const generatedAt = new Date().toISOString()
const report = {
  generatedAt,
  passed: failures.length === 0,
  input: resolvedInput,
  failures,
  acceptance,
}
const jsonPath = path.join(reportsDir, 'mobile-manual-acceptance.json')
const markdownPath = path.join(reportsDir, 'mobile-manual-acceptance.md')
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(
  markdownPath,
  [
    '# Mobile Manual Acceptance',
    '',
    `Generated: ${generatedAt}`,
    `Status: ${report.passed ? 'PASS' : 'FAIL'}`,
    `Input: ${resolvedInput}`,
    '',
    '## Checks',
    '',
    ...requiredCheckIds.map((id) => {
      const check = byId.get(id)
      return `- ${String(check?.status ?? 'missing').toUpperCase()} ${id}: ${String(check?.notes ?? '')}`
    }),
    '',
    '## Failures',
    '',
    ...(failures.length ? failures.map((failure) => `- ${failure}`) : ['- none']),
    '',
  ].join('\n'),
)

console.log(`Mobile manual acceptance ${report.passed ? 'PASS' : 'FAIL'}`)
console.log(`JSON: ${jsonPath}`)
console.log(`Markdown: ${markdownPath}`)
process.exit(report.passed ? 0 : 1)
