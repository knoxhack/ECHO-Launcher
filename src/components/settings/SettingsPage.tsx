import * as Slider from '@radix-ui/react-slider'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Archive,
  Check,
  ClipboardCopy,
  Cpu,
  DownloadCloud,
  FolderOpen,
  Gauge,
  Link,
  MessageSquare,
  MonitorCog,
  PackageCheck,
  QrCode,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Rocket,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
  Volume2,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import * as QRCode from 'qrcode'
import { javaRuntimeService } from '../../services/JavaRuntimeService'
import { backupService } from '../../services/BackupService'
import { communityChatService } from '../../services/CommunityChatService'
import { releaseService } from '../../services/ReleaseService'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useLauncherStore } from '../../stores/launcherStore'
import { useLauncherUpdateStore } from '../../stores/launcherUpdateStore'
import { useServerStatusStore } from '../../stores/serverStatusStore'
import { useSettingsStore, type PerformancePreset } from '../../stores/settingsStore'
import type { AppReadinessState, MobileBridgeDeviceRole, MobileBridgeState, NativePaths } from '../../types/native'
import {
  LOCAL_COMMUNITY_CHAT_API_URL,
  LOCAL_COMMUNITY_CHAT_WEBSOCKET_URL,
  communityChatSettingsDefaults,
  normalizeCommunityChatSettings,
} from '../../utils/communityChat'
import { launcherUpdateHealthStatus, launcherUpdatePrimaryDetail, launcherUpdateStatusLabels } from '../../utils/launcherUpdateState'
import { officialServerFallbackFromSettings, officialServerSettingsDefaults, normalizeOfficialServerSettings } from '../../utils/officialServerSettings'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { SectionHeader } from '../cyber/SectionHeader'
import { StatusChip } from '../cyber/StatusChip'
import { ToggleRow } from '../cyber/ToggleRow'
import { WarningCard } from '../cyber/WarningCard'

const presetLabels: { id: PerformancePreset; label: string }[] = [
  { id: 'low', label: 'Low-End Laptop' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'high', label: 'High Quality' },
  { id: 'cinematic', label: 'Cinematic' },
]

export function SettingsPage() {
  const addToast = useLauncherStore((state) => state.addToast)
  const launcherUpdate = useLauncherUpdateStore((state) => state.state)
  const launcherUpdateLoading = useLauncherUpdateStore((state) => state.loading)
  const refreshLauncherUpdate = useLauncherUpdateStore((state) => state.refresh)
  const checkLauncherUpdate = useLauncherUpdateStore((state) => state.check)
  const downloadLauncherUpdate = useLauncherUpdateStore((state) => state.download)
  const installLauncherUpdate = useLauncherUpdateStore((state) => state.install)
  const settings = useSettingsStore()
  const setDesktopSettings = useSettingsStore((state) => state.setDesktopSettings)
  const setOfficialServerSettings = useSettingsStore((state) => state.setOfficialServerSettings)
  const refreshOfficialStatus = useServerStatusStore((state) => state.refreshStatus)
  const clearOfficialStatus = useServerStatusStore((state) => state.clearStatus)
  const [releaseOwner, setReleaseOwner] = useState(settings.releaseFeed.owner)
  const [releaseRepo, setReleaseRepo] = useState(settings.releaseFeed.repo)
  const [includePrereleases, setIncludePrereleases] = useState(settings.releaseFeed.includePrereleases)
  const [supportGuideUrl, setSupportGuideUrl] = useState(settings.supportGuideUrl)
  const [advancedMode, setAdvancedMode] = useState(settings.advancedMode)
  const [creatorMode, setCreatorMode] = useState(settings.creatorMode)
  const [officialServerName, setOfficialServerName] = useState(settings.officialServerName)
  const [officialServerStatusUrl, setOfficialServerStatusUrl] = useState(settings.officialServerStatusUrl)
  const [officialDiscordInviteUrl, setOfficialDiscordInviteUrl] = useState(settings.officialDiscordInviteUrl)
  const [officialStatusPollSeconds, setOfficialStatusPollSeconds] = useState(String(settings.officialStatusPollSeconds))
  const [communityApiUrl, setCommunityApiUrl] = useState(settings.communityApiUrl)
  const [communityWebSocketUrl, setCommunityWebSocketUrl] = useState(settings.communityWebSocketUrl)
  const [chatNickname, setChatNickname] = useState(settings.chatNickname)
  const [chatNotifications, setChatNotifications] = useState(settings.chatNotifications)
  const [officialStatusTesting, setOfficialStatusTesting] = useState(false)
  const [communityStatusTesting, setCommunityStatusTesting] = useState(false)
  const [nativePaths, setNativePaths] = useState<NativePaths | null>(null)
  const [readiness, setReadiness] = useState<AppReadinessState | null>(null)
  const [mobileBridge, setMobileBridge] = useState<MobileBridgeState | null>(null)
  const [pairingQrDataUrl, setPairingQrDataUrl] = useState('')
  const [settingsNowMs, setSettingsNowMs] = useState(() => Date.now())
  const [backupSourcePath, setBackupSourcePath] = useState<string | undefined>()

  useEffect(() => {
    if (!isNativeAvailable()) return
    Promise.all([
      invokeNative('paths:get'),
      releaseService.getSettings(),
      refreshLauncherUpdate(),
      invokeNative('app:get-readiness'),
      invokeNative('mobile-bridge:get-state'),
    ])
      .then(([paths, desktopSettings, , readinessState, mobileBridgeState]) => {
        setNativePaths(paths)
        setReadiness(readinessState)
        setMobileBridge(mobileBridgeState)
        setDesktopSettings(desktopSettings)
        setReleaseOwner(desktopSettings.releaseFeed.owner)
        setReleaseRepo(desktopSettings.releaseFeed.repo)
        setIncludePrereleases(desktopSettings.releaseFeed.includePrereleases)
        setSupportGuideUrl(desktopSettings.supportGuideUrl)
        setAdvancedMode(desktopSettings.advancedMode)
        setCreatorMode(desktopSettings.creatorMode)
        setOfficialServerName(desktopSettings.officialServerName)
        setOfficialServerStatusUrl(desktopSettings.officialServerStatusUrl)
        setOfficialDiscordInviteUrl(desktopSettings.officialDiscordInviteUrl)
        setOfficialStatusPollSeconds(String(desktopSettings.officialStatusPollSeconds))
        setCommunityApiUrl(desktopSettings.communityApiUrl)
        setCommunityWebSocketUrl(desktopSettings.communityWebSocketUrl)
        setChatNickname(desktopSettings.chatNickname)
        setChatNotifications(desktopSettings.chatNotifications)
      })
      .catch((error: unknown) => addToast('Unable to read desktop settings', error instanceof Error ? error.message : 'Desktop settings lookup failed.', 'warning'))
  }, [addToast, refreshLauncherUpdate, setDesktopSettings])

  useEffect(() => {
    if (isNativeAvailable()) return
    const id = window.setTimeout(() => {
      setOfficialServerName(settings.officialServerName)
      setOfficialServerStatusUrl(settings.officialServerStatusUrl)
      setOfficialDiscordInviteUrl(settings.officialDiscordInviteUrl)
      setOfficialStatusPollSeconds(String(settings.officialStatusPollSeconds))
      setCommunityApiUrl(settings.communityApiUrl)
      setCommunityWebSocketUrl(settings.communityWebSocketUrl)
      setChatNickname(settings.chatNickname)
      setChatNotifications(settings.chatNotifications)
    }, 0)
    return () => window.clearTimeout(id)
  }, [
    settings.chatNickname,
    settings.chatNotifications,
    settings.communityApiUrl,
    settings.communityWebSocketUrl,
    settings.officialDiscordInviteUrl,
    settings.officialServerName,
    settings.officialServerStatusUrl,
    settings.officialStatusPollSeconds,
  ])

  useEffect(() => {
    const payload = mobileBridge?.activePairing?.pairingPayload
    if (!payload) return
    let disposed = false
    QRCode.toDataURL(payload, {
      margin: 1,
      width: 220,
      color: {
        dark: '#020617',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (!disposed) setPairingQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (!disposed) setPairingQrDataUrl('')
      })
    return () => {
      disposed = true
    }
  }, [mobileBridge?.activePairing?.pairingPayload])

  useEffect(() => {
    const id = window.setInterval(() => setSettingsNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const saveReleaseSettings = async () => {
    try {
      const saved = await releaseService.saveSettings({
        releaseFeed: {
          provider: 'github',
          owner: releaseOwner,
          repo: releaseRepo,
          includePrereleases,
        },
        supportGuideUrl,
        launchMode: 'minecraft_launcher',
        advancedMode,
        creatorMode,
      })
      setDesktopSettings(saved)
      addToast('Desktop settings saved', saved.releaseFeed.owner && saved.releaseFeed.repo ? `${saved.releaseFeed.owner}/${saved.releaseFeed.repo}` : 'Feed still needs an owner and repository.', saved.releaseFeed.owner && saved.releaseFeed.repo ? 'success' : 'warning')
    } catch (error) {
      addToast('Release settings failed', error instanceof Error ? error.message : 'Unable to save release settings.', 'danger')
    }
  }

  const testReleaseFeed = async () => {
    try {
      await saveReleaseSettings()
      const index = await releaseService.listReleases(true)
      addToast('Release feed connected', `${index.releases.length} Ashfall release entries found.`, 'success')
    } catch (error) {
      addToast('Release feed unavailable', error instanceof Error ? error.message : 'Unable to list GitHub releases.', 'danger')
    }
  }

  const officialServerPatch = () =>
    normalizeOfficialServerSettings({
      officialServerName,
      officialServerStatusUrl,
      officialDiscordInviteUrl,
      officialStatusPollSeconds: Number(officialStatusPollSeconds),
    })

  const syncOfficialServerDraft = (patch: ReturnType<typeof officialServerPatch>) => {
    setOfficialServerName(patch.officialServerName)
    setOfficialServerStatusUrl(patch.officialServerStatusUrl)
    setOfficialDiscordInviteUrl(patch.officialDiscordInviteUrl)
    setOfficialStatusPollSeconds(String(patch.officialStatusPollSeconds))
  }

  const saveOfficialServerSettings = async () => {
    const patch = officialServerPatch()
    try {
      setOfficialServerSettings(patch)
      clearOfficialStatus()
      syncOfficialServerDraft(patch)
      if (isNativeAvailable()) {
        const saved = await releaseService.saveSettings(patch)
        setDesktopSettings(saved)
        syncOfficialServerDraft(normalizeOfficialServerSettings(saved))
      }
      addToast('Official server settings saved', patch.officialServerStatusUrl, 'success')
    } catch (error) {
      addToast('Official server settings failed', error instanceof Error ? error.message : 'Unable to save official server settings.', 'danger')
    }
  }

  const testOfficialServerStatus = async () => {
    const patch = officialServerPatch()
    setOfficialStatusTesting(true)
    setOfficialServerSettings(patch)
    syncOfficialServerDraft(patch)
    try {
      await refreshOfficialStatus(patch.officialServerStatusUrl, officialServerFallbackFromSettings(patch))
      const statusState = useServerStatusStore.getState()
      if (statusState.error) {
        addToast('Official server unavailable', statusState.error, 'danger')
        return
      }
      addToast('Official server connected', `${statusState.status?.serverName ?? patch.officialServerName} status loaded.`, 'success')
    } finally {
      setOfficialStatusTesting(false)
    }
  }

  const resetOfficialServerSettings = async () => {
    const patch = officialServerSettingsDefaults
    try {
      setOfficialServerSettings(patch)
      clearOfficialStatus()
      syncOfficialServerDraft(patch)
      if (isNativeAvailable()) {
        const saved = await releaseService.saveSettings(patch)
        setDesktopSettings(saved)
      }
      addToast('Official server defaults restored', patch.officialServerStatusUrl, 'success')
    } catch (error) {
      addToast('Official server reset failed', error instanceof Error ? error.message : 'Unable to reset official server settings.', 'danger')
    }
  }

  const communityChatPatch = () =>
    normalizeCommunityChatSettings({
      communityApiUrl,
      communityWebSocketUrl,
      chatNickname,
      chatNotifications,
    }, officialServerPatch().officialServerStatusUrl)

  const syncCommunityChatDraft = (patch: ReturnType<typeof communityChatPatch>) => {
    setCommunityApiUrl(patch.communityApiUrl)
    setCommunityWebSocketUrl(patch.communityWebSocketUrl)
    setChatNickname(patch.chatNickname)
    setChatNotifications(patch.chatNotifications)
  }

  const persistCommunityChatSettings = async (
    patch: ReturnType<typeof communityChatPatch>,
    toastTitle = 'Community chat settings saved',
    toastDetail = patch.communityApiUrl || 'Using local chat preview until the ECHO API is connected.',
  ) => {
    try {
      settings.setCommunitySettings(patch)
      syncCommunityChatDraft(patch)
      if (isNativeAvailable()) {
        const saved = await releaseService.saveSettings(patch)
        setDesktopSettings(saved)
        syncCommunityChatDraft(normalizeCommunityChatSettings(saved))
      }
      addToast(toastTitle, toastDetail, 'success')
    } catch (error) {
      addToast('Community chat settings failed', error instanceof Error ? error.message : 'Unable to save community chat settings.', 'danger')
    }
  }

  const saveCommunityChatSettings = async () => {
    await persistCommunityChatSettings(communityChatPatch())
  }

  const applyLocalCommunityService = async () => {
    const patch = normalizeCommunityChatSettings({
      ...communityChatPatch(),
      communityApiUrl: LOCAL_COMMUNITY_CHAT_API_URL,
      communityWebSocketUrl: LOCAL_COMMUNITY_CHAT_WEBSOCKET_URL,
    })
    await persistCommunityChatSettings(patch, 'Local server mod selected', LOCAL_COMMUNITY_CHAT_API_URL)
  }

  const clearCommunityServiceUrls = async () => {
    const patch = normalizeCommunityChatSettings({
      ...communityChatPatch(),
      communityApiUrl: '',
      communityWebSocketUrl: '',
    })
    await persistCommunityChatSettings(patch, 'Community chat preview selected', 'Service URLs cleared.')
  }

  const testCommunityChatService = async () => {
    const patch = communityChatPatch()
    setCommunityStatusTesting(true)
    try {
      const result = await communityChatService.checkHealth({
        communityApiUrl: patch.communityApiUrl,
        clientId: 'settings-health-check',
        nickname: patch.chatNickname || 'Settings Check',
      })
      addToast(
        result.status === 'connected' ? 'Server mod chat connected' : result.status === 'preview' ? 'Chat preview active' : 'Server mod chat unavailable',
        result.detail,
        result.status === 'connected' ? 'success' : result.status === 'preview' ? 'info' : 'danger',
      )
    } finally {
      setCommunityStatusTesting(false)
    }
  }

  const handleCheckLauncherUpdate = async () => {
    const next = await checkLauncherUpdate()
    if (!next) {
      addToast('Update check failed', 'Launcher update status could not be refreshed.', 'danger')
      return
    }
    addToast('Launcher update check complete', launcherUpdatePrimaryDetail(next), next.status === 'failed' ? 'danger' : next.status === 'available' ? 'info' : 'success')
  }

  const handleDownloadLauncherUpdate = async () => {
    const next = await downloadLauncherUpdate()
    if (!next) {
      addToast('Update download failed', 'Launcher update download could not be started.', 'danger')
      return
    }
    addToast('Launcher update download', launcherUpdatePrimaryDetail(next), next.status === 'failed' ? 'danger' : 'info')
  }

  const handleInstallLauncherUpdate = async () => {
    const next = await installLauncherUpdate()
    if (!next) {
      addToast('Update install failed', 'Launcher update install could not be started.', 'danger')
      return
    }
    if (next.error) {
      addToast('Update install blocked', next.error, 'warning')
      return
    }
    addToast('Restarting launcher', 'The downloaded launcher update is being installed.', 'info')
  }

  const openPath = async (targetPath: string) => {
    if (!targetPath) {
      addToast('Path unavailable', 'Desktop path information has not loaded yet.', 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Opening local folders requires npm run desktop.', 'warning')
      return
    }
    await invokeNative('shell:open-path', { path: targetPath })
  }

  const refreshMobileBridge = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Mobile pairing requires the ECHO Launcher desktop app.', 'warning')
      return null
    }
    const state = await invokeNative('mobile-bridge:get-state')
    setMobileBridge(state)
    return state
  }

  const createMobilePairingCode = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Mobile pairing requires the ECHO Launcher desktop app.', 'warning')
      return
    }
    try {
      const state = await invokeNative('mobile-bridge:create-pairing-code')
      setMobileBridge(state)
      addToast('Mobile pairing QR ready', state.activePairing?.code ?? state.bridgeUrl, 'success')
    } catch (error) {
      addToast('Mobile pairing failed', error instanceof Error ? error.message : 'Unable to create a pairing QR.', 'danger')
    }
  }

  const approveMobileDevice = async (requestId: string, role: MobileBridgeDeviceRole) => {
    try {
      const state = await invokeNative('mobile-bridge:approve-device', { requestId, role })
      setMobileBridge(state)
      addToast('Mobile device approved', 'Android will finish pairing automatically while the QR window is active.', 'success')
    } catch (error) {
      addToast('Approval failed', error instanceof Error ? error.message : 'Unable to approve mobile device.', 'danger')
    }
  }

  const denyMobileDevice = async (requestId: string) => {
    try {
      const state = await invokeNative('mobile-bridge:deny-device', { requestId })
      setMobileBridge(state)
      addToast('Mobile device denied', 'The pending pairing request was removed.', 'info')
    } catch (error) {
      addToast('Deny failed', error instanceof Error ? error.message : 'Unable to deny mobile device.', 'danger')
    }
  }

  const revokeMobileDevice = async (deviceId: string) => {
    try {
      const state = await invokeNative('mobile-bridge:revoke-device', { deviceId })
      setMobileBridge(state)
      addToast('Mobile device revoked', 'The Android device must pair again before using launcher commands.', 'warning')
    } catch (error) {
      addToast('Revoke failed', error instanceof Error ? error.message : 'Unable to revoke mobile device.', 'danger')
    }
  }

  const restartMobileBridge = async () => {
    try {
      const state = await invokeNative('mobile-bridge:restart')
      setMobileBridge(state)
      addToast('Mobile bridge restarted', state.bridgeUrl, 'success')
    } catch (error) {
      addToast('Mobile bridge restart failed', error instanceof Error ? error.message : 'Unable to restart mobile bridge.', 'danger')
    }
  }

  const copyMobileBridgeDiagnostics = async () => {
    const state = mobileBridge ?? await refreshMobileBridge()
    if (!state) return
    const healthUrl = state.bridgeUrl ? `${state.bridgeUrl.replace(/\/+$/, '')}/mobile/health` : 'unavailable'
    const commandCenterUrl = state.bridgeUrl ? `${state.bridgeUrl.replace(/\/+$/, '')}/mobile/command-center` : 'unavailable'
    const lines = [
      'ECHO Mobile Command Center Diagnostics',
      `Generated: ${new Date().toISOString()}`,
      `Status: ${state.status}`,
      `Bridge URL: ${state.bridgeUrl}`,
      `LAN URL: ${state.bridgeUrl}`,
      `Phone health URL: ${healthUrl}`,
      `Command center URL: ${commandCenterUrl}`,
      `LAN Address: ${state.lanAddress}`,
      `Port: ${state.port}`,
      `Pairing active: ${state.activePairing ? 'yes' : 'no'}`,
      `Pairing expires: ${state.activePairing?.expiresAt ?? 'none'}`,
      `Pending devices: ${state.activePairing?.pendingDevices.length ?? 0}`,
      `Paired devices: ${state.pairedDevices.length}`,
      `Error: ${state.error ?? 'none'}`,
      '',
      'Pending:',
      ...(state.activePairing?.pendingDevices.length
        ? state.activePairing.pendingDevices.map((device) => `- ${device.deviceName} ${device.requestedRole} ${device.status} lastSeen=${device.lastSeenAt}`)
        : ['- none']),
      '',
      'Paired:',
      ...(state.pairedDevices.length
        ? state.pairedDevices.map((device) => `- ${device.deviceName} ${device.role} lastSeen=${device.lastSeenAt}`)
        : ['- none']),
      '',
      'Beta acceptance checklist:',
      '- Phone browser opens the health URL and receives JSON.',
      '- Android Settings shows paired/authenticated bridge status.',
      '- Android Home/Play/Dev shows Live launcher data, not Sample fallback.',
      '- Desktop pending device was explicitly accepted.',
      '- Launch, Update, Repair, Scan Install, Run PackOS Check, and Export Support Bundle were tested.',
      '- Repeated Update/Repair/Scan taps did not queue unsafe duplicate operations.',
      '',
      'LAN/firewall troubleshooting:',
      '- Phone and desktop must be on the same local network.',
      '- If health URL fails on phone but works on desktop, allow ECHO Launcher through the desktop firewall for this private network.',
      '- If pairing expires, generate a fresh QR before retrying.',
      '',
      'No device tokens, token hashes, or pairing codes are included.',
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      addToast('Mobile diagnostics copied', 'Bridge status copied without tokens or pairing codes.', 'success')
    } catch {
      addToast('Copy unavailable', 'Clipboard access is unavailable in this window.', 'warning')
    }
  }

  const repairMinecraftLauncherDependency = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Minecraft Launcher dependency repair requires the desktop app.', 'warning')
      return
    }
    try {
      const dependency = await invokeNative('minecraft-launcher:ensure-dependency')
      const nextReadiness = await invokeNative('app:get-readiness')
      setReadiness(nextReadiness)
      addToast(
        dependency.ok ? 'Minecraft Launcher dependency ready' : 'Minecraft Launcher installer started',
        dependency.launcherExecutablePath ?? (dependency.launcherDependencyWarnings.join(' ') || 'Finish the official installer, then retry Play.'),
        dependency.ok ? 'success' : 'warning',
      )
    } catch (error) {
      addToast('Minecraft Launcher repair failed', error instanceof Error ? error.message : 'Unable to repair launcher dependency.', 'danger')
    }
  }

  const applyClientOptions = async (label: string) => {
    const options = {
      performancePreset: settings.performancePreset,
      ramGb: settings.ramGb,
      shaderSupport: settings.shaderSupport,
      entityCulling: settings.entityCulling,
      smoothLighting: settings.smoothLighting,
      rainSnow: settings.rainSnow,
      thunderstorms: settings.thunderstorms,
      volumetricFog: settings.volumetricFog,
      weatherScreenEffects: settings.weatherScreenEffects,
      positionalAudio: settings.positionalAudio,
      ambientSounds: settings.ambientSounds,
      masterVolume: settings.masterVolume,
      guideMode: settings.guideMode,
      showHints: settings.showHints,
      interactiveTips: settings.interactiveTips,
    }
    try {
      const result = await invokeNative('settings:apply-client-options', { profileId: 'ashfall-native-edition', options })
      addToast(`${label} saved`, result.optionsPath, result.warnings.length ? 'warning' : 'success')
    } catch (error) {
      addToast(`${label} failed`, error instanceof Error ? error.message : 'Unable to save client options.', 'danger')
    }
  }

  const selectBackupSource = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Selecting backup folders requires npm run desktop.', 'warning')
      return
    }
    const result = await invokeNative('dialog:select-directory', {
      title: 'Select Ashfall world or config folder to back up',
      defaultPath: backupSourcePath,
    })
    if (!result.canceled && result.path) {
      setBackupSourcePath(result.path)
      addToast('Backup source selected', result.path, 'success')
    }
  }

  const platform = readiness?.platform ?? launcherUpdate?.platform
  const platformLabel = platform
    ? platform.compat === 'wine'
      ? 'Windows under Wine'
      : platform.kind === 'linux'
        ? 'Linux Native'
        : platform.kind === 'windows'
          ? 'Windows Native'
          : platform.kind === 'macos'
            ? 'macOS'
            : 'Unsupported'
    : 'Detecting'
  const platformSupportLabel = platform
    ? platform.launcherSupport === 'wine-compatible'
      ? 'Wine compatible'
      : platform.launcherSupport === 'native'
        ? 'Native'
        : 'Unsupported'
    : 'Unknown'
  const updaterModeLabel = launcherUpdate?.manualInstallRequired
    ? 'Manual install in Wine'
    : platform?.updatesSupported
      ? 'Automatic'
      : 'Unavailable'
  const pendingMobileDevices = mobileBridge?.activePairing?.pendingDevices ?? []
  const pairedMobileDevices = mobileBridge?.pairedDevices ?? []
  const mobilePairingExpired = mobileBridge?.activePairing ? Date.parse(mobileBridge.activePairing.expiresAt) <= settingsNowMs : false

  return (
    <div className="space-y-6">
      <Tabs.Root className="space-y-6" defaultValue="general">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-soft">Settings</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Launcher Preferences</h2>
          </div>
          <Tabs.List className="glass-surface inline-flex rounded-xl p-1">
            {[
              { id: 'general', label: 'General', icon: MonitorCog },
              { id: 'performance', label: 'Performance', icon: Gauge },
              ...(advancedMode || creatorMode ? [{ id: 'advanced', label: 'Advanced', icon: MonitorCog }] : []),
            ].map((tab) => {
              const Icon = tab.icon
              return (
                <Tabs.Trigger
                  className="flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-slate-400 transition data-[state=active]:bg-cyan-echo/15 data-[state=active]:text-cyan-soft"
                  key={tab.id}
                  value={tab.id}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Tabs.Trigger>
              )
            })}
          </Tabs.List>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <Tabs.Content className="space-y-6" value="general">
              <GlassCard>
                <SectionHeader eyebrow="Launcher" title="General Settings" />
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                    <p className="mb-2 text-sm font-semibold text-white">Java Runtime</p>
                    <p className="rounded-lg border border-cyan-soft/20 bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-300">
                      Normal beta play uses Minecraft Launcher Handoff. Java detection is available for advanced troubleshooting.
                    </p>
                    <CyberButton
                      className="mt-3"
                      icon={Cpu}
                      onClick={async () => {
                        const runtime = await javaRuntimeService.detectJava()
                        addToast('Java runtime detected', `${runtime.vendor} ${runtime.version}`, 'success')
                      }}
                      size="sm"
                    >
                      Detect Java
                    </CyberButton>
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Platform</p>
                      <StatusChip label={platformSupportLabel} status={platform?.launcherSupport === 'unsupported' ? 'warning' : 'operational'} />
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-soft/20 bg-slate-950/70 px-3 py-2">
                        <span className="text-slate-400">Runtime</span>
                        <span className="font-semibold text-white">{platformLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-soft/20 bg-slate-950/70 px-3 py-2">
                        <span className="text-slate-400">Launcher updates</span>
                        <span className="font-semibold text-white">{updaterModeLabel}</span>
                      </div>
                    </div>
                    {platform?.compat === 'wine' ? (
                      <p className="mt-3 text-xs leading-5 text-amber-100/90">
                        Wine mode uses the Windows launcher inside the same Wine prefix. Automatic restart into the installer is disabled.
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Minecraft Launcher</p>
                      <StatusChip
                        label={readiness?.minecraftLauncher.launcherDependencySource ?? 'not checked'}
                        status={readiness?.minecraftLauncher.launcherExecutablePath ? 'healthy' : 'warning'}
                      />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/70 px-3 py-2">
                        <p className="text-slate-400">Executable</p>
                        <p className="break-all font-mono text-xs text-white">{readiness?.minecraftLauncher.launcherExecutablePath ?? 'not detected'}</p>
                      </div>
                      <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/70 px-3 py-2">
                        <p className="text-slate-400">Install log</p>
                        <p className="break-all font-mono text-xs text-white">{readiness?.minecraftLauncher.launcherInstallLogPath ?? 'not written yet'}</p>
                      </div>
                    </div>
                    {readiness?.minecraftLauncher.launcherDependencyWarnings?.length ? (
                      <p className="mt-3 text-xs leading-5 text-amber-100/90">
                        {readiness.minecraftLauncher.launcherDependencyWarnings.join(' ')}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <CyberButton icon={Wrench} onClick={() => void repairMinecraftLauncherDependency()} size="sm" variant="secondary">
                        Repair Dependency
                      </CyberButton>
                      <CyberButton
                        icon={FolderOpen}
                        onClick={() => void openPath(readiness?.minecraftLauncher.launcherInstallPath ?? readiness?.minecraftLauncher.minecraftRoot ?? readiness?.minecraftLauncher.launcherInstallLogPath ?? '')}
                        size="sm"
                        variant="ghost"
                      >
                        Open Folder
                      </CyberButton>
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                    <p className="mb-2 text-sm font-semibold text-white">Ashfall Content Directory</p>
                    <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-300">
                      {nativePaths?.playerContentRoot ?? nativePaths?.instances ?? 'Desktop path unavailable'}
                    </div>
                    <p className="mt-2 break-all text-xs text-slate-500">App data: {nativePaths?.root ?? 'Desktop path unavailable'}</p>
                    <CyberButton className="mt-3" icon={FolderOpen} onClick={() => void openPath(nativePaths?.playerContentRoot ?? nativePaths?.instances ?? '')} size="sm">
                      Open Folder
                    </CyberButton>
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 xl:col-span-2">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Mobile Command Center</p>
                        <p className="mt-1 text-xs text-slate-400">Pair the Android app over your local Wi-Fi network.</p>
                      </div>
                      <StatusChip
                        label={mobileBridge?.status === 'running' ? 'Bridge running' : mobileBridge?.status === 'error' ? 'Bridge error' : 'Bridge stopped'}
                        status={mobileBridge?.status === 'running' ? 'healthy' : 'warning'}
                      />
                    </div>
                    {mobileBridge?.error ? (
                      <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                        {mobileBridge.error}
                      </div>
                    ) : null}
                    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                      <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <QrCode className="h-5 w-5 text-cyan-soft" />
                          {mobileBridge?.activePairing ? (
                            <StatusChip compact label={mobilePairingExpired ? 'Expired' : 'Active'} status={mobilePairingExpired ? 'warning' : 'operational'} />
                          ) : null}
                        </div>
                        <div className="mt-4 flex min-h-[232px] items-center justify-center rounded-lg border border-white/10 bg-white p-3">
                          {mobileBridge?.activePairing?.pairingPayload && pairingQrDataUrl ? (
                            <img alt="Mobile pairing QR code" className="h-[220px] w-[220px]" src={pairingQrDataUrl} />
                          ) : (
                            <div className="text-center text-sm font-semibold text-slate-900">Generate Pairing QR</div>
                          )}
                        </div>
                        <p className="mt-3 break-all font-mono text-xs leading-5 text-slate-300">
                          {mobileBridge?.activePairing?.pairingPayload ?? mobileBridge?.bridgeUrl ?? 'Bridge state unavailable'}
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">LAN URL</p>
                            <p className="mt-1 break-all font-mono text-xs text-white">{mobileBridge?.bridgeUrl ?? 'not started'}</p>
                          </div>
                          <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pairing Code</p>
                            <p className="mt-1 font-mono text-sm font-semibold text-white">{mobileBridge?.activePairing?.code ?? 'none'}</p>
                          </div>
                          <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expires</p>
                            <p className="mt-1 text-sm font-semibold text-white">
                              {mobileBridge?.activePairing ? new Date(mobileBridge.activePairing.expiresAt).toLocaleTimeString() : 'not generated'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <CyberButton icon={QrCode} onClick={() => void createMobilePairingCode()} size="sm" variant="primary">
                            Generate Pairing QR
                          </CyberButton>
                          <CyberButton icon={RefreshCw} onClick={() => void refreshMobileBridge()} size="sm" variant="secondary">
                            Refresh
                          </CyberButton>
                          <CyberButton icon={ClipboardCopy} onClick={() => void copyMobileBridgeDiagnostics()} size="sm" variant="secondary">
                            Copy Diagnostics
                          </CyberButton>
                          <CyberButton icon={RadioTower} onClick={() => void restartMobileBridge()} size="sm" variant="ghost">
                            Restart Bridge
                          </CyberButton>
                        </div>
                        <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Beta Bridge Checklist</p>
                          <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-2">
                            <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">
                              Phone health: <span className="break-all font-mono text-cyan-soft">{mobileBridge?.bridgeUrl ? `${mobileBridge.bridgeUrl.replace(/\/+$/, '')}/mobile/health` : 'bridge unavailable'}</span>
                            </div>
                            <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">
                              Android must show <span className="font-semibold text-white">Live launcher data</span> after approval.
                            </div>
                            <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">
                              Test Launch, Update, Repair, Scan Install, and PackOS Check from Android.
                            </div>
                            <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-2">
                              If phone health fails, check same Wi-Fi and desktop firewall access for port {mobileBridge?.port ?? 4177}.
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Android Devices</p>
                            <span className="text-xs font-semibold text-cyan-soft">{pendingMobileDevices.length}</span>
                          </div>
                          <div className="space-y-2">
                            {pendingMobileDevices.length ? pendingMobileDevices.map((device) => (
                              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2" key={device.requestId}>
                                <div>
                                  <p className="text-sm font-semibold text-white">{device.deviceName}</p>
                                  <p className="text-xs text-slate-500">Requested {device.requestedRole} - {new Date(device.lastSeenAt).toLocaleTimeString()}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <CyberButton icon={Check} onClick={() => void approveMobileDevice(device.requestId, device.requestedRole)} size="sm" variant="success">
                                    Accept
                                  </CyberButton>
                                  <CyberButton icon={X} onClick={() => void denyMobileDevice(device.requestId)} size="sm" variant="danger">
                                    Deny
                                  </CyberButton>
                                </div>
                              </div>
                            )) : (
                              <p className="text-sm text-slate-400">No pending Android pairing requests.</p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paired Devices</p>
                            <span className="text-xs font-semibold text-cyan-soft">{pairedMobileDevices.length}</span>
                          </div>
                          <div className="space-y-2">
                            {pairedMobileDevices.length ? pairedMobileDevices.map((device) => (
                              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2" key={device.deviceId}>
                                <div className="min-w-0">
                                  <p className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <Smartphone className="h-4 w-4 text-cyan-soft" />
                                    {device.deviceName}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {device.role} - last seen {new Date(device.lastSeenAt).toLocaleString()}
                                  </p>
                                </div>
                                <CyberButton icon={Trash2} onClick={() => void revokeMobileDevice(device.deviceId)} size="sm" variant="danger">
                                  Revoke
                                </CyberButton>
                              </div>
                            )) : (
                              <p className="text-sm text-slate-400">No Android devices have completed pairing yet.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 xl:col-span-2">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Launcher Updates</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Dedicated feed: {launcherUpdate?.feedOwner ?? 'knoxhack'}/{launcherUpdate?.feedRepo ?? 'ECHO-Launcher'}
                        </p>
                      </div>
                      {launcherUpdate ? (
                        <StatusChip
                          label={launcherUpdateStatusLabels[launcherUpdate.status]}
                          status={launcherUpdateHealthStatus(launcherUpdate.status)}
                        />
                      ) : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Installed</p>
                        <p className="mt-1 text-sm font-semibold text-white">{launcherUpdate?.currentVersion ?? 'unknown'}</p>
                      </div>
                      <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available</p>
                        <p className="mt-1 text-sm font-semibold text-white">{launcherUpdate?.availableVersion ?? 'none'}</p>
                      </div>
                      <div className="rounded-lg border border-cyan-soft/20 bg-slate-950/60 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prereleases</p>
                        <p className="mt-1 text-sm font-semibold text-white">{launcherUpdate?.allowPrerelease ? 'Allowed for this build' : 'Stable only'}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{launcherUpdatePrimaryDetail(launcherUpdate)}</p>
                    {launcherUpdate?.status === 'downloading' ? (
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950">
                        <div className="h-full bg-cyan-echo transition-all" style={{ width: `${Math.round(launcherUpdate.progress)}%` }} />
                      </div>
                    ) : null}
                    {launcherUpdate?.releaseNotes.length ? (
                      <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/50 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Release Notes</p>
                        <ul className="space-y-1 text-sm text-slate-300">
                          {launcherUpdate.releaseNotes.slice(0, 4).map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-3">
                      <CyberButton disabled={launcherUpdateLoading || launcherUpdate?.canCheck === false} icon={RefreshCw} onClick={() => void handleCheckLauncherUpdate()} size="sm" variant="secondary">
                        {launcherUpdate?.status === 'checking' ? 'Checking...' : 'Check for Updates'}
                      </CyberButton>
                      <CyberButton disabled={launcherUpdateLoading || !launcherUpdate?.canDownload} icon={DownloadCloud} onClick={() => void handleDownloadLauncherUpdate()} size="sm" variant="primary">
                        {launcherUpdate?.status === 'downloading' ? 'Downloading...' : 'Download Update'}
                      </CyberButton>
                      <CyberButton disabled={launcherUpdateLoading || !launcherUpdate?.canInstall} icon={Rocket} onClick={() => void handleInstallLauncherUpdate()} size="sm" variant="success">
                        Restart and Install
                      </CyberButton>
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 xl:col-span-2">
                    <p className="mb-3 text-sm font-semibold text-white">Visibility Mode</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ToggleRow
                        checked={advancedMode}
                        description="Shows developer diagnostics and launch controls after settings are saved."
                        label="Advanced Mode"
                        onCheckedChange={setAdvancedMode}
                      />
                      <ToggleRow
                        checked={creatorMode}
                        description="Shows publisher/release tooling after settings are saved."
                        label="Creator Mode"
                        onCheckedChange={(value) => {
                          setCreatorMode(value)
                          if (value) setAdvancedMode(true)
                        }}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Official Server</p>
                        <p className="mt-1 text-xs text-slate-400">Feeds the Home page server panel and Discord action.</p>
                      </div>
                      <RadioTower className="h-5 w-5 text-cyan-soft" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Server Name
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          onChange={(event) => setOfficialServerName(event.target.value)}
                          placeholder={officialServerSettingsDefaults.officialServerName}
                          value={officialServerName}
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Poll Seconds
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          max={300}
                          min={10}
                          onChange={(event) => setOfficialStatusPollSeconds(event.target.value)}
                          type="number"
                          value={officialStatusPollSeconds}
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
                        Status JSON URL
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          onChange={(event) => setOfficialServerStatusUrl(event.target.value)}
                          placeholder={officialServerSettingsDefaults.officialServerStatusUrl}
                          type="url"
                          value={officialServerStatusUrl}
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
                        Discord Invite URL
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          onChange={(event) => setOfficialDiscordInviteUrl(event.target.value)}
                          placeholder="https://discord.gg/..."
                          type="url"
                          value={officialDiscordInviteUrl}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <CyberButton icon={Save} onClick={() => void saveOfficialServerSettings()} size="sm" variant="primary">
                        Save Settings
                      </CyberButton>
                      <CyberButton disabled={officialStatusTesting} icon={Link} onClick={() => void testOfficialServerStatus()} size="sm" variant="secondary">
                        {officialStatusTesting ? 'Testing...' : 'Test Status'}
                      </CyberButton>
                      <CyberButton icon={RotateCcw} onClick={() => void resetOfficialServerSettings()} size="sm" variant="ghost">
                        Reset Defaults
                      </CyberButton>
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Community Chat</p>
                        <p className="mt-1 text-xs text-slate-400">Feeds the launcher Community page and official server chat bridge.</p>
                      </div>
                      <MessageSquare className="h-5 w-5 text-cyan-soft" />
                    </div>
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-cyan-soft/10 bg-slate-950/60 px-3 py-2">
                      <StatusChip
                        compact
                        label={communityApiUrl.trim() ? 'Server URL' : 'Preview'}
                        status={communityApiUrl.trim() ? 'queued' : 'missing'}
                      />
                      <span className="min-w-0 truncate text-xs text-slate-400">
                        {communityApiUrl.trim() || 'Blank URLs use the launcher preview fallback.'}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Nickname
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          maxLength={32}
                          onChange={(event) => setChatNickname(event.target.value)}
                          placeholder="Choose a launcher chat name"
                          value={chatNickname}
                        />
                      </label>
                      <div className="flex items-end">
                        <ToggleRow checked={chatNotifications} label="Chat notifications" onCheckedChange={setChatNotifications} />
                      </div>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
                        Community API URL
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          onChange={(event) => setCommunityApiUrl(event.target.value)}
                          placeholder={communityChatSettingsDefaults.communityApiUrl || "https://community.echo.example"}
                          type="url"
                          value={communityApiUrl}
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
                        Community WebSocket URL
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          onChange={(event) => setCommunityWebSocketUrl(event.target.value)}
                          placeholder={communityChatSettingsDefaults.communityWebSocketUrl || "wss://community.echo.example/v1/chat/socket"}
                          type="url"
                          value={communityWebSocketUrl}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <CyberButton icon={Save} onClick={() => void saveCommunityChatSettings()} size="sm" variant="primary">
                        Save Chat Settings
                      </CyberButton>
                      <CyberButton icon={Link} onClick={() => void applyLocalCommunityService()} size="sm" variant="secondary">
                        Use Local Server
                      </CyberButton>
                      <CyberButton disabled={communityStatusTesting} icon={RefreshCw} onClick={() => void testCommunityChatService()} size="sm" variant="secondary">
                        {communityStatusTesting ? 'Testing...' : 'Test Server Mod'}
                      </CyberButton>
                      <CyberButton icon={RotateCcw} onClick={() => void clearCommunityServiceUrls()} size="sm" variant="ghost">
                        Clear Chat URLs
                      </CyberButton>
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4 xl:col-span-2">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Official GitHub Release Feed</p>
                        <p className="mt-1 text-xs text-slate-400">Required for Version 2 install, update, and repair.</p>
                      </div>
                      <RadioTower className="h-5 w-5 text-cyan-soft" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Owner
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          onChange={(event) => setReleaseOwner(event.target.value)}
                          placeholder="GitHub organization"
                          value={releaseOwner}
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Repository
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          onChange={(event) => setReleaseRepo(event.target.value)}
                          placeholder="Ashfall release repository"
                          value={releaseRepo}
                        />
                      </label>
                      <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
                        Support Guide URL
                        <input
                          className="h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-echo"
                          onChange={(event) => setSupportGuideUrl(event.target.value)}
                          placeholder="https://..."
                          value={supportGuideUrl}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <ToggleRow checked={includePrereleases} label="Include prerelease GitHub releases" onCheckedChange={setIncludePrereleases} />
                      <CyberButton icon={Save} onClick={() => void saveReleaseSettings()} size="sm" variant="primary">
                        Save Settings
                      </CyberButton>
                      <CyberButton icon={Link} onClick={() => void testReleaseFeed()} size="sm" variant="secondary">
                        Test Feed
                      </CyberButton>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </Tabs.Content>

            <Tabs.Content className="space-y-6" value="performance">
              <GlassCard>
                <SectionHeader eyebrow="Performance Presets" title="Runtime Tuning" />
                <div className="grid gap-3 md:grid-cols-4">
                  {presetLabels.map((preset) => (
                    <button
                      className={`rounded-lg border p-4 text-left transition ${
                        settings.performancePreset === preset.id
                          ? 'border-cyan-echo/50 bg-cyan-echo/15 text-cyan-soft shadow-cyber'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                      key={preset.id}
                      onClick={() => {
                        settings.applyPerformancePreset(preset.id)
                        addToast('Performance preset applied', preset.label, 'success')
                      }}
                      type="button"
                    >
                      <Sparkles className="mb-3 h-5 w-5" />
                      <span className="font-semibold">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </GlassCard>

              <GlassCard>
                <SectionHeader eyebrow="Memory" title="RAM Allocation" />
                <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-slate-300">Selected allocation</p>
                    <p className="text-2xl font-semibold text-cyan-soft">{settings.ramGb} GB</p>
                  </div>
                  <Slider.Root
                    className="relative flex h-8 w-full touch-none select-none items-center"
                    max={16}
                    min={2}
                    onValueChange={(value) => settings.setRamGb(value[0] ?? 8)}
                    step={1}
                    value={[settings.ramGb]}
                  >
                    <Slider.Track className="relative h-2 grow rounded-full bg-slate-950">
                      <Slider.Range className="absolute h-full rounded-full bg-cyan-echo" />
                    </Slider.Track>
                    <Slider.Thumb aria-label="RAM allocation" className="block h-5 w-5 rounded-full border border-cyan-echo bg-white shadow-cyber" />
                  </Slider.Root>
                  <div className="mt-2 flex justify-between text-xs text-slate-500">
                    <span>2 GB</span>
                    <span>16 GB</span>
                  </div>
                </div>
              </GlassCard>

              <div className="grid gap-6 xl:grid-cols-2">
                <GlassCard>
                  <SectionHeader eyebrow="Graphics Card" title="Visual Systems" />
                  <div className="space-y-3">
                    <ToggleRow checked={settings.shaderSupport} label="Shader Support" onCheckedChange={(value) => settings.setBooleanSetting('shaderSupport', value)} />
                    <ToggleRow checked={settings.entityCulling} label="Entity Culling" onCheckedChange={(value) => settings.setBooleanSetting('entityCulling', value)} />
                    <ToggleRow checked={settings.smoothLighting} label="Smooth Lighting" onCheckedChange={(value) => settings.setBooleanSetting('smoothLighting', value)} />
                    <CyberButton icon={MonitorCog} onClick={() => void applyClientOptions('Graphics options')} size="sm" variant="ghost">
                      Save Graphics Options
                    </CyberButton>
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHeader eyebrow="Weather Effects" title="WeatherCore" />
                  <div className="space-y-3">
                    <ToggleRow checked={settings.rainSnow} label="Rain & Snow" onCheckedChange={(value) => settings.setBooleanSetting('rainSnow', value)} />
                    <ToggleRow checked={settings.thunderstorms} label="Thunderstorms" onCheckedChange={(value) => settings.setBooleanSetting('thunderstorms', value)} />
                    <ToggleRow checked={settings.volumetricFog} label="Volumetric Fog" onCheckedChange={(value) => settings.setBooleanSetting('volumetricFog', value)} />
                    <ToggleRow checked={settings.weatherScreenEffects} label="WeatherCore screen effects" onCheckedChange={(value) => settings.setBooleanSetting('weatherScreenEffects', value)} />
                    <CyberButton icon={Sparkles} onClick={() => void applyClientOptions('Weather options')} size="sm" variant="ghost">
                      Save Weather Options
                    </CyberButton>
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHeader eyebrow="SoundCore" title="Audio Systems" />
                  <div className="space-y-3">
                    <ToggleRow checked={settings.positionalAudio} label="3D Positional Audio" onCheckedChange={(value) => settings.setBooleanSetting('positionalAudio', value)} />
                    <ToggleRow checked={settings.ambientSounds} label="Ambient Sounds" onCheckedChange={(value) => settings.setBooleanSetting('ambientSounds', value)} />
                    <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm text-slate-300">Master Volume</p>
                        <p className="font-semibold text-white">{settings.masterVolume}%</p>
                      </div>
                      <Slider.Root
                        className="relative flex h-8 w-full touch-none select-none items-center"
                        max={100}
                        min={0}
                        onValueChange={(value) => settings.setMasterVolume(value[0] ?? 78)}
                        step={1}
                        value={[settings.masterVolume]}
                      >
                        <Slider.Track className="relative h-2 grow rounded-full bg-slate-950">
                          <Slider.Range className="absolute h-full rounded-full bg-cyan-echo" />
                        </Slider.Track>
                        <Slider.Thumb aria-label="Master volume" className="block h-5 w-5 rounded-full border border-cyan-echo bg-white shadow-cyber" />
                      </Slider.Root>
                    </div>
                    <CyberButton icon={Volume2} onClick={() => void applyClientOptions('SoundCore options')} size="sm" variant="ghost">
                      Save SoundCore Options
                    </CyberButton>
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHeader eyebrow="TutorialCore" title="Guidance" />
                  <div className="space-y-3">
                    <ToggleRow checked={settings.guideMode} label="Guide Mode" onCheckedChange={(value) => settings.setBooleanSetting('guideMode', value)} />
                    <ToggleRow checked={settings.showHints} label="Show Hints" onCheckedChange={(value) => settings.setBooleanSetting('showHints', value)} />
                    <ToggleRow checked={settings.interactiveTips} label="Interactive Tips" onCheckedChange={(value) => settings.setBooleanSetting('interactiveTips', value)} />
                    <CyberButton icon={Save} onClick={() => void applyClientOptions('TutorialCore options')} size="sm" variant="ghost">
                      Save TutorialCore Options
                    </CyberButton>
                  </div>
                </GlassCard>
              </div>
            </Tabs.Content>

            <Tabs.Content className="space-y-6" value="advanced">
              <GlassCard tone="amber">
                <SectionHeader eyebrow="Advanced" title="Launcher Handoff" />
                <div className="grid gap-4">
                  <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Minecraft Launcher Handoff</p>
                        <p className="mt-1 text-xs text-slate-400">
                          ECHO installs, updates, repairs, and verifies Ashfall, then opens the official Minecraft Launcher for Microsoft login and play.
                        </p>
                      </div>
                      <PackageCheck className="h-5 w-5 text-cyan-soft" />
                    </div>
                    <StatusChip label="Only Launch Path" status="operational" />
                  </div>

                  <CyberButton icon={Save} onClick={() => void saveReleaseSettings()} size="sm" variant="primary">
                    Save Advanced Settings
                  </CyberButton>
                </div>
              </GlassCard>
            </Tabs.Content>
          </div>

          <aside className="space-y-6">
            <WarningCard
              actions={
                <>
                  <CyberButton
                    icon={Archive}
                    onClick={async () => {
                      const result = await backupService.createBackup('ashfall', backupSourcePath)
                      addToast(result.ok ? 'World backup created' : 'Backup needs a source folder', result.backupPath ?? result.reason, result.ok ? 'success' : 'warning')
                    }}
                    size="sm"
                  >
                    Backup World
                  </CyberButton>
                  <CyberButton icon={FolderOpen} onClick={() => void selectBackupSource()} size="sm" variant="ghost">
                    Select Source
                  </CyberButton>
                </>
              }
              text="Updating Ashfall or mods may cause world incompatibilities and data loss. Always backup your world before updating."
              title="World Compatibility Warning"
            />
          </aside>
        </div>
      </Tabs.Root>
    </div>
  )
}


