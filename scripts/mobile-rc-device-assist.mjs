import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const launcherRoot = path.resolve(import.meta.dirname, '..')
const workspaceRoot = path.resolve(launcherRoot, '..')
const androidRoot = path.join(workspaceRoot, 'ECHO-Command-Android')
const apkPath = path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const reportsDir = path.join(launcherRoot, 'reports')
const packageName = 'com.echo.command'
const install = process.argv.includes('--install')
const launch = process.argv.includes('--launch')
const serialIndex = process.argv.indexOf('--serial')
const requestedSerial = serialIndex >= 0 ? process.argv[serialIndex + 1] : ''

function pathCandidates() {
  const names = process.platform === 'win32' ? ['adb.exe', 'adb.cmd', 'adb'] : ['adb']
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
  ].filter(Boolean)
  return roots.flatMap((root) => names.map((name) => path.join(root, 'platform-tools', name)))
}

function findAdb() {
  for (const candidate of pathCandidates()) {
    if (existsSync(candidate)) return candidate
  }
  const locator = process.platform === 'win32' ? 'where' : 'which'
  const located = spawnSync(locator, ['adb'], { encoding: 'utf8', shell: true })
  if (located.status === 0) {
    const first = String(located.stdout ?? '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (first) return first
  }
  return ''
}

function run(adb, args) {
  const result = spawnSync(adb, args, {
    encoding: 'utf8',
    shell: false,
  })
  return {
    command: [adb, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
  }
}

function parseDevices(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/)
      return { serial, state, details: details.join(' ') }
    })
}

function getProp(adb, serial, prop) {
  const result = run(adb, ['-s', serial, 'shell', 'getprop', prop])
  return result.ok ? result.stdout : ''
}

function writeReport(report) {
  mkdirSync(reportsDir, { recursive: true })
  const jsonPath = path.join(reportsDir, 'mobile-device-assist.json')
  const markdownPath = path.join(reportsDir, 'mobile-device-assist.md')
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(
    markdownPath,
    [
      '# Mobile Device Assist',
      '',
      `Generated: ${report.generatedAt}`,
      `Status: ${report.passed ? 'PASS' : 'FAIL'}`,
      `ADB: ${report.adbPath || 'not found'}`,
      `APK: ${report.apkPath}`,
      '',
      '## Devices',
      '',
      ...(report.devices.length
        ? report.devices.map((device) => `- ${device.serial} ${device.state} ${device.model || ''} Android ${device.androidVersion || ''}`.trim())
        : ['- none']),
      '',
      '## Actions',
      '',
      ...(report.actions.length ? report.actions.map((action) => `- ${action.ok ? 'PASS' : 'FAIL'} ${action.command}`) : ['- none']),
      '',
      '## Failures',
      '',
      ...(report.failures.length ? report.failures.map((failure) => `- ${failure}`) : ['- none']),
      '',
      '## Troubleshooting',
      '',
      ...(report.troubleshooting.length ? report.troubleshooting.map((item) => `- ${item}`) : ['- none']),
      '',
      '## Manual Install Fallback',
      '',
      ...(report.manualInstallFallback.length ? report.manualInstallFallback.map((item) => `- ${item}`) : ['- none']),
      '',
      '## Next Manual Steps',
      '',
      ...(report.nextManualSteps.length ? report.nextManualSteps.map((item) => `- ${item}`) : ['- none']),
      '',
    ].join('\n'),
  )
  return { jsonPath, markdownPath }
}

const failures = []
const actions = []
const troubleshooting = []
const manualInstallFallback = []
const adbPath = findAdb()

if (!existsSync(apkPath)) failures.push(`APK is missing: ${apkPath}`)
if (!adbPath) failures.push('ADB was not found. Install Android platform-tools or set ANDROID_HOME/ANDROID_SDK_ROOT.')

let devices = []
if (adbPath) {
  const listed = run(adbPath, ['devices', '-l'])
  actions.push(listed)
  if (!listed.ok) failures.push(`ADB devices failed: ${listed.stderr || listed.stdout}`)
  devices = parseDevices(listed.stdout).map((device) => {
    if (device.state !== 'device') return device
    return {
      ...device,
      model: getProp(adbPath, device.serial, 'ro.product.model'),
      androidVersion: getProp(adbPath, device.serial, 'ro.build.version.release'),
      sdk: getProp(adbPath, device.serial, 'ro.build.version.sdk'),
    }
  })
}

const readyDevices = devices.filter((device) => device.state === 'device')
if (adbPath && readyDevices.length === 0) {
  failures.push('No authorized Android device is connected over ADB.')
  troubleshooting.push(
    'Unlock the Android phone and keep the screen awake.',
    'Enable Developer options and USB debugging on the phone.',
    'Accept the "Allow USB debugging?" prompt for this desktop.',
    'If the phone only charges, change the USB mode to File transfer / Android Auto if available.',
    'Try a data-capable USB cable or a different USB port, then rerun npm.cmd run rc:mobile:device.',
  )
  manualInstallFallback.push(
    `Copy the APK to the phone manually: ${apkPath}`,
    'Open the APK from Android Files or Downloads.',
    'Allow installs from that source when Android prompts.',
    'Open ECHO Command Center manually after install.',
    'Include this mobile-device-assist report in tester notes so the ADB issue is recorded.',
  )
}
if (devices.some((device) => device.state === 'unauthorized')) {
  troubleshooting.push('The phone is visible but unauthorized. Accept the USB debugging prompt, or revoke USB debugging authorizations and reconnect.')
}

const selected = requestedSerial
  ? readyDevices.find((device) => device.serial === requestedSerial)
  : readyDevices.length === 1 ? readyDevices[0] : null

if (requestedSerial && !selected) failures.push(`Requested ADB serial is not connected or authorized: ${requestedSerial}`)
if ((install || launch) && readyDevices.length > 1 && !requestedSerial) {
  failures.push('Multiple ADB devices are connected. Re-run with --serial <device-serial>.')
}

if (selected && install && existsSync(apkPath)) {
  const installed = run(adbPath, ['-s', selected.serial, 'install', '-r', apkPath])
  actions.push(installed)
  if (!installed.ok) failures.push(`APK install failed: ${installed.stderr || installed.stdout}`)
}

if (selected && launch) {
  const launched = run(adbPath, ['-s', selected.serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'])
  actions.push(launched)
  if (!launched.ok) failures.push(`App launch failed: ${launched.stderr || launched.stdout}`)
}

const report = {
  generatedAt: new Date().toISOString(),
  passed: failures.length === 0,
  apkPath,
  adbPath,
  installRequested: install,
  launchRequested: launch,
  selectedSerial: selected?.serial ?? '',
  devices,
  actions,
  failures,
  troubleshooting,
  manualInstallFallback,
  nextManualSteps: [
    'Start ECHO Launcher desktop.',
    'Confirm desktop Settings shows Mobile Command Center bridge running.',
    'From the phone browser, open http://<desktop-lan-ip>:4177/api/mobile/health and confirm JSON is returned.',
    'Generate a Mobile Command Center QR.',
    'Scan from Android Settings.',
    'Approve the pending device on desktop.',
    'Run the manual acceptance checklist and validate it with rc:mobile:acceptance.',
  ],
}
const output = writeReport(report)
console.log(`Mobile device assist ${report.passed ? 'PASS' : 'FAIL'}`)
console.log(`JSON: ${output.jsonPath}`)
console.log(`Markdown: ${output.markdownPath}`)
process.exit(report.passed ? 0 : 1)
