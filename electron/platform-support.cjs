const path = require('node:path')

function pathForPlatform(platform) {
  return platform === 'linux' ? path.posix : path.win32
}

function platformKindFromNodePlatform(platform = process.platform) {
  if (platform === 'win32') return 'windows'
  if (platform === 'linux') return 'linux'
  if (platform === 'darwin') return 'macos'
  return 'unsupported'
}

function detectWine(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return false
  return Boolean(env.WINEPREFIX || env.WINELOADERNOEXEC || env.WINESERVER || env.WINEDEBUG)
}

function buildPlatformInfo({
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  packaged = false,
} = {}) {
  const kind = platformKindFromNodePlatform(platform)
  const compat = detectWine(env, platform) ? 'wine' : undefined
  const linuxAppImage = platform === 'linux' && Boolean(env.APPIMAGE)
  const updatesSupported = Boolean(packaged && (platform === 'win32' || linuxAppImage))
  return {
    kind,
    compat,
    arch,
    launcherSupport: compat === 'wine' ? 'wine-compatible' : kind === 'windows' || kind === 'linux' ? 'native' : 'unsupported',
    updatesSupported,
  }
}

function launcherUpdatesSupportedForPlatform(info, packaged = false, autoUpdaterAvailable = true, env = process.env) {
  if (!packaged || !autoUpdaterAvailable) return false
  if (info?.kind === 'windows') return true
  if (info?.kind === 'linux') return Boolean(env.APPIMAGE)
  return false
}

function launcherUpdateUnsupportedMessage(info, packaged = false, env = process.env) {
  if (!packaged) return 'Launcher self-updates require a packaged launcher build.'
  if (info?.kind === 'linux' && !env.APPIMAGE) return 'Linux self-updates require the packaged AppImage build.'
  if (info?.kind === 'macos') return 'Launcher self-updates are not configured for macOS builds.'
  return 'Launcher self-updates are not available for this launcher build.'
}

function minecraftLauncherRootsForPlatform({ platform = process.platform, env = process.env, home = '' } = {}) {
  const platformPath = pathForPlatform(platform)
  const explicitRoot = String(env.ECHO_LAUNCHER_MINECRAFT_ROOT ?? '').trim()
  if (explicitRoot) return [explicitRoot]
  const roots = []
  if (platform === 'linux') {
    roots.push(platformPath.join(home, '.minecraft'))
    roots.push(platformPath.join(home, '.var', 'app', 'com.mojang.Minecraft', '.minecraft'))
    return [...new Set(roots.filter(Boolean))]
  }

  if (env.APPDATA) roots.push(platformPath.join(env.APPDATA, '.minecraft'))
  if (env.LOCALAPPDATA) {
    roots.push(platformPath.join(env.LOCALAPPDATA, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Roaming', '.minecraft'))
  }
  roots.push(platformPath.join(home, 'AppData', 'Roaming', '.minecraft'))
  return [...new Set(roots.filter(Boolean))]
}

function commonImportRootsForPlatform({ platform = process.platform, env = process.env, home = '' } = {}) {
  const platformPath = pathForPlatform(platform)
  const roots = []
  if (platform === 'linux') {
    roots.push(platformPath.join(home, '.minecraft'))
    roots.push(platformPath.join(home, '.local', 'share', 'PrismLauncher', 'instances'))
    roots.push(platformPath.join(home, '.var', 'app', 'org.prismlauncher.PrismLauncher', 'data', 'PrismLauncher', 'instances'))
    roots.push(platformPath.join(home, '.local', 'share', 'ModrinthApp', 'profiles'))
    roots.push(platformPath.join(home, '.var', 'app', 'com.modrinth.ModrinthApp', 'config', 'com.modrinth.theseus', 'profiles'))
    roots.push(platformPath.join(home, '.local', 'share', 'CurseForge', 'Minecraft', 'Instances'))
    roots.push(platformPath.join(home, 'curseforge', 'minecraft', 'Instances'))
    return [...new Set(roots.filter(Boolean))]
  }

  const appData = env.APPDATA
  const localAppData = env.LOCALAPPDATA
  if (appData) {
    roots.push(platformPath.join(appData, '.minecraft'))
    roots.push(platformPath.join(appData, 'CurseForge', 'minecraft', 'Instances'))
    roots.push(platformPath.join(appData, 'PrismLauncher', 'instances'))
  }
  if (localAppData) {
    roots.push(platformPath.join(localAppData, 'ModrinthApp', 'profiles'))
  }
  roots.push(platformPath.join(home, 'Documents', 'CurseForge', 'Minecraft', 'Instances'))
  roots.push(platformPath.join(home, 'curseforge', 'minecraft', 'Instances'))
  return [...new Set(roots.filter(Boolean))]
}

function javaSearchConfigForPlatform({ platform = process.platform, env = process.env, home = '' } = {}) {
  const platformPath = pathForPlatform(platform)
  if (platform === 'linux') {
    return {
      pathCommand: ['which', ['java']],
      executableName: 'java',
      roots: ['/usr/lib/jvm', '/usr/java', platformPath.join(home, '.jdks')],
      minecraftRuntimeRoots: [
        platformPath.join(home, '.minecraft', 'runtime'),
        platformPath.join(home, '.var', 'app', 'com.mojang.Minecraft', '.minecraft', 'runtime'),
      ],
    }
  }

  return {
    pathCommand: ['where.exe', ['java']],
    executableName: 'java.exe',
    roots: [env.ProgramFiles, env['ProgramFiles(x86)']]
      .filter(Boolean)
      .flatMap((root) => ['Eclipse Adoptium', 'Java', 'Microsoft'].map((folder) => platformPath.join(root, folder))),
    minecraftRuntimeRoots: [
      env.APPDATA ? platformPath.join(env.APPDATA, '.minecraft', 'runtime') : null,
      env.LOCALAPPDATA ? platformPath.join(env.LOCALAPPDATA, 'Minecraft Launcher', 'runtime') : null,
      env.ProgramFiles ? platformPath.join(env.ProgramFiles, 'Minecraft Launcher', 'runtime') : null,
      env['ProgramFiles(x86)'] ? platformPath.join(env['ProgramFiles(x86)'], 'Minecraft Launcher', 'runtime') : null,
      'C:\\XboxGames\\Minecraft Launcher\\Content\\runtime',
      env.LOCALAPPDATA ? platformPath.join(env.LOCALAPPDATA, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime') : null,
      env.LOCALAPPDATA ? platformPath.join(env.LOCALAPPDATA, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Roaming', '.minecraft', 'runtime') : null,
    ].filter(Boolean),
  }
}

function linuxMinecraftLauncherCandidates() {
  return ['minecraft-launcher']
}

function minecraftLauncherExecutableCandidatesForPlatform({ platform = process.platform, env = process.env, home = '' } = {}) {
  const platformPath = pathForPlatform(platform)
  if (platform === 'linux') {
    return [
      ...linuxMinecraftLauncherCandidates(),
      '/usr/bin/minecraft-launcher',
      '/usr/local/bin/minecraft-launcher',
      platformPath.join(home, '.local', 'bin', 'minecraft-launcher'),
    ]
  }

  return [
    env['ProgramFiles(x86)'] ? platformPath.join(env['ProgramFiles(x86)'], 'Minecraft Launcher', 'MinecraftLauncher.exe') : null,
    env.ProgramFiles ? platformPath.join(env.ProgramFiles, 'Minecraft Launcher', 'MinecraftLauncher.exe') : null,
    'C:\\Program Files (x86)\\Minecraft Launcher\\MinecraftLauncher.exe',
    'C:\\Program Files\\Minecraft Launcher\\MinecraftLauncher.exe',
    'C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe',
    env.LOCALAPPDATA ? platformPath.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'MinecraftLauncher.exe') : null,
    env.LOCALAPPDATA ? platformPath.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'Minecraft.exe') : null,
  ].filter(Boolean)
}

function minecraftLauncherOpenPriority({ executablePath, platform = process.platform, protocolHandlerVerified = false } = {}) {
  const priority = []
  if (executablePath) priority.push({ kind: 'executable', target: executablePath })
  if (platform === 'linux') {
    priority.push(...linuxMinecraftLauncherCandidates().map((target) => ({ kind: 'command', target })))
    if (protocolHandlerVerified) priority.push({ kind: 'protocol', target: 'minecraft://' })
    return priority
  }
  priority.push(...minecraftLauncherExecutableCandidatesForPlatform({ platform }).map((target) => ({ kind: 'executable', target })))
  priority.push({ kind: 'protocol', target: 'minecraft://' })
  return priority
}

module.exports = {
  buildPlatformInfo,
  commonImportRootsForPlatform,
  detectWine,
  javaSearchConfigForPlatform,
  launcherUpdateUnsupportedMessage,
  launcherUpdatesSupportedForPlatform,
  linuxMinecraftLauncherCandidates,
  minecraftLauncherExecutableCandidatesForPlatform,
  minecraftLauncherOpenPriority,
  minecraftLauncherRootsForPlatform,
  platformKindFromNodePlatform,
}
