#!/usr/bin/env node
import {
  createAshfallPackArtifacts,
  DEFAULT_ASHFALL_SOURCE,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_RELEASE_CHANNEL,
  DEFAULT_RELEASE_VERSION,
} from './lib/pack-export.mjs'

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const value = process.argv.find((arg) => arg.startsWith(prefix))
  if (value) {
    return value.slice(prefix.length)
  }
  const index = process.argv.indexOf(`--${name}`)
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }
  return fallback
}

const sourcePath = readArg('source', DEFAULT_ASHFALL_SOURCE)
const outputDir = readArg('out', DEFAULT_OUTPUT_DIR)
const version = readArg('version', DEFAULT_RELEASE_VERSION)
const channel = readArg('channel', DEFAULT_RELEASE_CHANNEL)

try {
  const report = await createAshfallPackArtifacts({ sourcePath, outputDir, version, channel })
  const summary = {
    ok: report.ok,
    sourcePath: report.sourcePath,
    outputDir: report.outputDir,
    version: report.version,
    channel: report.channel,
    minecraftVersion: report.minecraftVersion,
    neoforgeVersion: report.neoforgeVersion,
    counts: report.counts,
    artifact: report.artifact,
    manifest: report.manifest,
    release: report.release,
  }
  console.log(JSON.stringify(summary, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

