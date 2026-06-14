const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')
const { getRceditBundle } = require('app-builder-lib/out/toolsets/windows')

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) return false
  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(source, destination, { recursive: true })
  return true
}

function copyFileIfExists(source, destination) {
  if (!fs.existsSync(source)) return false
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
  return true
}

function stageStandaloneRuntime(context) {
  const launcherRoot = path.resolve(__dirname, '..')
  const configuredRoot = String(process.env.ECHO_STANDALONE_RUNTIME_ROOT || '').trim()
  const runtimeRoot = configuredRoot
    ? path.resolve(configuredRoot)
    : path.resolve(launcherRoot, '..', 'ECHO-Standalone-Runtime')
  const appImageRoot = path.join(runtimeRoot, 'build', 'jpackage-opengl-client', 'EchoStandaloneRuntime')
  if (!fs.existsSync(appImageRoot)) {
    console.warn(`[afterPack] Standalone runtime app image not found at ${appImageRoot}; packaged standalone launch will rely on an external runtime root.`)
    return
  }

  const stagedRoot = path.join(context.appOutDir, 'resources', 'Echo', 'echo-standalone-runtime')
  copyIfExists(appImageRoot, path.join(stagedRoot, 'build', 'jpackage-opengl-client', 'EchoStandaloneRuntime'))
  copyIfExists(path.join(runtimeRoot, 'reports'), path.join(stagedRoot, 'reports'))
  copyFileIfExists(path.join(runtimeRoot, 'settings.gradle'), path.join(stagedRoot, 'settings.gradle'))
  copyFileIfExists(path.join(runtimeRoot, 'build.gradle'), path.join(stagedRoot, 'build.gradle'))
  console.log(`[afterPack] Staged standalone runtime from ${runtimeRoot} into ${stagedRoot}`)
}

function shouldBundleStandaloneRuntime() {
  const value = String(process.env.ECHO_BUNDLE_STANDALONE_RUNTIME || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

module.exports = async function afterPackWinIcon(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  if (shouldBundleStandaloneRuntime()) {
    stageStandaloneRuntime(context)
  } else {
    console.log('[afterPack] Standalone runtime bundling disabled; launcher will use external/GitHub-hosted runtime artifacts.')
  }

  const { appInfo, platformSpecificBuildOptions } = context.packager
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`)
  const iconPath = await context.packager.getIconPath()
  const rceditBundle = await getRceditBundle('1.1.0')
  const rceditPath = process.arch === 'ia32' ? rceditBundle.x86 : rceditBundle.x64

  const args = [
    exePath,
    '--set-version-string',
    'FileDescription',
    appInfo.productName,
    '--set-version-string',
    'ProductName',
    appInfo.productName,
    '--set-version-string',
    'LegalCopyright',
    appInfo.copyright,
    '--set-file-version',
    appInfo.shortVersion || appInfo.buildVersion,
    '--set-product-version',
    appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm(),
    '--set-version-string',
    'InternalName',
    appInfo.productFilename,
    '--set-version-string',
    'OriginalFilename',
    '',
  ]

  if (platformSpecificBuildOptions.requestedExecutionLevel && platformSpecificBuildOptions.requestedExecutionLevel !== 'asInvoker') {
    args.push('--set-requested-execution-level', platformSpecificBuildOptions.requestedExecutionLevel)
  }

  if (appInfo.companyName) {
    args.push('--set-version-string', 'CompanyName', appInfo.companyName)
  }

  if (platformSpecificBuildOptions.legalTrademarks) {
    args.push('--set-version-string', 'LegalTrademarks', platformSpecificBuildOptions.legalTrademarks)
  }

  if (iconPath) {
    args.push('--set-icon', iconPath)
  }

  execFileSync(rceditPath, args, { stdio: 'inherit' })
}
