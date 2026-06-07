import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const scanRoots = ['src', 'electron']
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'])
const bannedFragments = [
  'echo-diagnostic-2026',
  'Windows 11 / x64',
  'C:\\Games\\ECHO\\Exports\\Ashfall-Server-Pack',
  'Crash analyzer action completed',
  'Detailed log opened',
  'Crash log opened',
  'Support guide unavailable',
  'Send to Discord',
  '00:02:18',
  '00:00:54',
  'onClick={() => undefined',
  'onClick={() => {}}',
]

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'installer-artifacts', '.git'].includes(entry.name)) continue
      yield* walk(absolute)
    } else if (extensions.has(path.extname(entry.name))) {
      yield absolute
    }
  }
}

const findings = []
for (const relativeRoot of scanRoots) {
  const absoluteRoot = path.join(root, relativeRoot)
  for await (const file of walk(absoluteRoot)) {
    const text = await readFile(file, 'utf8')
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const fragment of bannedFragments) {
        if (line.includes(fragment)) {
          findings.push({
            file: path.relative(root, file),
            line: index + 1,
            fragment,
          })
        }
      }
    })
  }
}

if (findings.length) {
  console.error('Placeholder audit failed:')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} contains "${finding.fragment}"`)
  }
  process.exit(1)
}

console.log(`Placeholder audit passed across ${scanRoots.join(', ')}.`)
