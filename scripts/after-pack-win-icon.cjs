const path = require('path')
const { execFileSync } = require('child_process')
const { getRceditBundle } = require('app-builder-lib/out/toolsets/windows')

module.exports = async function afterPackWinIcon(context) {
  if (context.electronPlatformName !== 'win32') {
    return
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
