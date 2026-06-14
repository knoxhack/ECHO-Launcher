import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const NATIVE_PACKS = [
  'ashfall-native-edition',
  'sky-relay-native-edition',
  'galactic-survey-native-edition',
  'openlands-native-edition',
  'arcana-division-native-edition',
]

const scriptPath = path.resolve(process.cwd(), 'scripts', 'all-modpacks-electron-install-smoke.mjs')
const defaultOut = path.resolve(
  process.cwd(),
  '..',
  'ECHO-Release-Index',
  'release-readiness',
  'all-native-modpacks-runtime-load-smoke.json',
)
const forwarded = process.argv.slice(2)
const hasOut = forwarded.includes('--out')
const args = [
  scriptPath,
  ...(hasOut ? [] : ['--out', defaultOut]),
  ...NATIVE_PACKS.flatMap((profileId) => ['--pack', profileId]),
  ...forwarded,
]

const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ECHO_LAUNCHER_SMOKE: 'all-native-modpacks-runtime-load',
  },
  stdio: 'inherit',
  windowsHide: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
