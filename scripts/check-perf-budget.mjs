import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const assetsDir = path.join(distDir, 'assets')
const maxInitialBytes = 420_000

function fail(message) {
  console.error(`[perf-budget] ${message}`)
  process.exitCode = 1
}

function assetPathFromSrc(src) {
  return path.join(distDir, src.replace(/^\/+/, ''))
}

const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8')
const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)].map((match) => match[1])

if (scriptSources.length === 0) {
  fail('No initial module script found in dist/index.html.')
} else {
  let initialBytes = 0
  for (const src of scriptSources) {
    const stats = await fs.stat(assetPathFromSrc(src))
    initialBytes += stats.size
  }
  if (initialBytes > maxInitialBytes) {
    fail(`Initial JS is ${initialBytes} bytes; budget is ${maxInitialBytes} bytes.`)
  } else {
    console.log(`[perf-budget] Initial JS ${initialBytes} bytes / ${maxInitialBytes} byte budget.`)
  }
}

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
if (packageJson.dependencies?.['framer-motion'] || packageJson.devDependencies?.['framer-motion']) {
  fail('framer-motion is still declared in package.json.')
}

const assets = await fs.readdir(assetsDir)
const jsAssets = assets.filter((asset) => asset.endsWith('.js'))
const framerHits = []
for (const asset of jsAssets) {
  const source = await fs.readFile(path.join(assetsDir, asset), 'utf8')
  if (source.includes('framer-motion')) framerHits.push(asset)
}

if (framerHits.length > 0) {
  fail(`framer-motion marker found in production JS: ${framerHits.join(', ')}.`)
} else {
  console.log('[perf-budget] framer-motion is absent from production JS.')
}
