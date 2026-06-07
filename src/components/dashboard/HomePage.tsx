import * as Dialog from '@radix-ui/react-dialog'
import {
  Archive,
  DownloadCloud,
  Gamepad2,
  MessageSquare,
  Monitor,
  RadioTower,
  RotateCcw,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { backupService } from '../../services/BackupService'
import { installService } from '../../services/InstallService'
import { launchService } from '../../services/LaunchService'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useCommunityChatStore } from '../../stores/communityChatStore'
import { useDiagnosticsStore } from '../../stores/diagnosticsStore'
import { useLaunchStore } from '../../stores/launchStore'
import { useLauncherStore } from '../../stores/launcherStore'
import { usePackOsStore } from '../../stores/packOsStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReadinessStore } from '../../stores/readinessStore'
import { useReleaseStore } from '../../stores/releaseStore'
import { useServerStatusStore } from '../../stores/serverStatusStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useStandaloneRuntimeStore } from '../../stores/standaloneRuntimeStore'
import type { LauncherRuntimeModeId, MinecraftRuntimeModeId, StandaloneRuntimeModeCard } from '../../types/standaloneRuntime'
import type { NativeHandoffPreparationResult, NativeInstallResult } from '../../types/native'
import { formatOfficialServerUpdatedAt, getOfficialServerRuntimeState } from '../../types/serverStatus'
import { getAshfallHomeActions } from '../../utils/ashfallHomeActions'
import { cn } from '../../utils/cn'
import { OFFICIAL_ASHFALL_CHAT_CHANNEL_ID } from '../../utils/communityChat'
import { officialServerSettingsDefaults } from '../../utils/officialServerSettings'
import {
  isPackOsLaunchBlocked,
  packOsHealthStatus,
  packOsPrimaryReason,
  packOsUiStateLabel,
  selectedPackOsPack,
} from '../../utils/packosStatus'
import { latestPlayableReleaseForPack, nativeLoaderMetadataStatus } from '../../utils/releaseValidation'
import { buildRuntimeLaunchButtonState, buildRuntimeModeCards } from '../../utils/standaloneRuntimeShell'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { ProgressBar } from '../cyber/ProgressBar'
import { StatusChip } from '../cyber/StatusChip'

const runtimeModeIcons: Record<LauncherRuntimeModeId, LucideIcon> = {
  'neoforge-minecraft': Gamepad2,
  'native-loader-minecraft': Terminal,
  'native-runtime': Monitor,
}

const runtimeModeBadges: Record<LauncherRuntimeModeId, string> = {
  'neoforge-minecraft': 'Uses Minecraft Launcher',
  'native-loader-minecraft': 'ECHO Native Loader',
  'native-runtime': 'Standalone beta',
}

const runtimeModeSkin: Record<LauncherRuntimeModeId, {
  number: string
  routeName: string
  selectedClass: string
  idleClass: string
  iconClass: string
  accentClass: string
  panelClass: string
}> = {
  'neoforge-minecraft': {
    number: '01',
    routeName: 'Compatibility fallback',
    selectedClass: 'border-cyan-echo/80 bg-cyan-echo/15 shadow-[0_0_34px_rgba(37,232,255,0.18)]',
    idleClass: 'border-cyan-echo/20 bg-cyan-echo/[0.04] hover:border-cyan-echo/45 hover:bg-cyan-echo/10',
    iconClass: 'border-cyan-echo/35 bg-cyan-echo/10 text-cyan-soft',
    accentClass: 'bg-cyan-echo',
    panelClass: 'border-cyan-echo/35 bg-cyan-echo/[0.07]',
  },
  'native-loader-minecraft': {
    number: '02',
    routeName: 'Primary Native lane',
    selectedClass: 'border-amber-echo/80 bg-amber-echo/15 shadow-[0_0_34px_rgba(255,184,77,0.16)]',
    idleClass: 'border-amber-echo/20 bg-amber-echo/[0.04] hover:border-amber-echo/45 hover:bg-amber-echo/10',
    iconClass: 'border-amber-echo/35 bg-amber-echo/10 text-amber-echo',
    accentClass: 'bg-amber-echo',
    panelClass: 'border-amber-echo/35 bg-amber-echo/[0.07]',
  },
  'native-runtime': {
    number: '03',
    routeName: 'Standalone ECHO path',
    selectedClass: 'border-success-echo/75 bg-success-echo/15 shadow-[0_0_34px_rgba(93,255,179,0.14)]',
    idleClass: 'border-success-echo/20 bg-success-echo/[0.04] hover:border-success-echo/45 hover:bg-success-echo/10',
    iconClass: 'border-success-echo/35 bg-success-echo/10 text-success-echo',
    accentClass: 'bg-success-echo',
    panelClass: 'border-success-echo/35 bg-success-echo/[0.07]',
  },
}

const runtimeModeRoutes: Record<LauncherRuntimeModeId, {
  title: string
  subtitle: string
  steps: Array<{ label: string; detail: string }>
}> = {
  'neoforge-minecraft': {
    title: 'Minecraft opens through NeoForge',
    subtitle: 'Compatibility fallback: Ashfall prepares NeoForge metadata, then hands off to the official Minecraft Launcher when fallback is selected or Native Loader is blocked.',
    steps: [
      { label: 'Ashfall files', detail: 'Install and verify pack content' },
      { label: 'NeoForge profile', detail: 'Preserve the existing launcher profile' },
      { label: 'Minecraft Launcher', detail: 'Player signs in and presses Play' },
    ],
  },
  'native-loader-minecraft': {
    title: 'Minecraft opens through ECHO Native Loader',
    subtitle: 'Primary lane: Ashfall uses verified Native Loader metadata before handoff and does not silently launch NeoForge.',
    steps: [
      { label: 'Fixture runtime', detail: 'Verify local Minecraft artifacts' },
      { label: 'Native launcher', detail: 'Run the ECHO Native handoff' },
      { label: 'Ashfall client', detail: 'Start isolated Minecraft process' },
    ],
  },
  'native-runtime': {
    title: 'Standalone runtime beta checks',
    subtitle: 'Parity harness: launch stays gated until standalone runtime metadata and local verification pass.',
    steps: [
      { label: 'Runtime checks', detail: 'Verify standalone ECHO runtime' },
      { label: 'Native process', detail: 'Launch ECHO directly' },
      { label: 'Beta gate', detail: 'Do not claim a finished standalone engine' },
    ],
  },
}

const minecraftRuntimeModes = new Set<LauncherRuntimeModeId>(['neoforge-minecraft', 'native-loader-minecraft'])

export function HomePage() {
  const [launching, setLaunching] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [nativeLoaderMetadata, setNativeLoaderMetadata] = useState({
    checking: true,
    ready: false,
    reason: 'Checking Native Loader release metadata.',
    versionId: '',
  })
  const [handoffProgress, setHandoffProgress] = useState(0)
  const [handoffStage, setHandoffStage] = useState('Ready')
  const [handoffDetail, setHandoffDetail] = useState('')
  const [worldgenOpen, setWorldgenOpen] = useState(false)
  const [, setLastPreparation] = useState<NativeHandoffPreparationResult | null>(null)
  const [, setLastUpdate] = useState<NativeInstallResult | null>(null)

  const profiles = useProfileStore((state) => state.profiles)
  const setProfiles = useProfileStore((state) => state.setProfiles)
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const setSelectedProfileId = useLauncherStore((state) => state.setSelectedProfileId)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const setActiveToolsTab = useLauncherStore((state) => state.setActiveToolsTab)
  const addToast = useLauncherStore((state) => state.addToast)
  const setActiveChatChannel = useCommunityChatStore((state) => state.setActiveChannel)
  const setLaunchState = useLaunchStore((state) => state.setLaunchState)
  const readiness = useReadinessStore((state) => state.readiness)
  const refreshReadiness = useReadinessStore((state) => state.refreshReadiness)
  const packOs = usePackOsStore((state) => state.packOs)
  const refreshPackOs = usePackOsStore((state) => state.refreshPackOs)
  const releaseIndex = useReleaseStore((state) => state.releaseIndex)
  const ramGb = useSettingsStore((state) => state.ramGb)
  const advancedMode = useSettingsStore((state) => state.advancedMode)
  const creatorMode = useSettingsStore((state) => state.creatorMode)
  const officialServerStatusUrl = useSettingsStore((state) => state.officialServerStatusUrl)
  const officialDiscordInviteUrl = useSettingsStore((state) => state.officialDiscordInviteUrl)
  const officialServerName = useSettingsStore((state) => state.officialServerName)
  const officialStatusPollSeconds = useSettingsStore((state) => state.officialStatusPollSeconds)
  const officialStatus = useServerStatusStore((state) => state.status)
  const officialStatusLoading = useServerStatusStore((state) => state.loading)
  const officialStatusError = useServerStatusStore((state) => state.error)
  const refreshOfficialStatus = useServerStatusStore((state) => state.refreshStatus)
  const tickRepair = useDiagnosticsStore((state) => state.tickRepair)
  const repairActive = useDiagnosticsStore((state) => state.repairActive)
  const repairProgress = useDiagnosticsStore((state) => state.repairProgress)
  const standaloneRuntimeState = useStandaloneRuntimeStore((state) => state.state)
  const refreshStandaloneRuntime = useStandaloneRuntimeStore((state) => state.refresh)
  const launchStandaloneRuntime = useStandaloneRuntimeStore((state) => state.launchStandalone)
  const standaloneLaunching = useStandaloneRuntimeStore((state) => state.launching)

  const profileRefreshInFlight = useRef(false)
  const lastProfileRefreshAt = useRef(0)
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0]
  const selectedRuntimeMode = selectedProfile?.runtimeMode ?? 'neoforge-minecraft'
  const profileForRuntimeMode = useMemo(
    () => Object.fromEntries(profiles.filter((profile) => profile.runtimeMode).map((profile) => [profile.runtimeMode, profile])),
    [profiles],
  )
  const latestRelease = useMemo(() => latestPlayableReleaseForPack(releaseIndex, selectedProfile.id), [releaseIndex, selectedProfile.id])
  const nativeLoaderRelease = useMemo(() => latestPlayableReleaseForPack(releaseIndex, 'ashfall-native-edition'), [releaseIndex])
  const nativeLoaderProfile = profileForRuntimeMode['native-loader-minecraft']
  const homeActions = getAshfallHomeActions(selectedProfile, latestRelease)
  const installIntent = homeActions.primaryUsesInstallFlow
  const selectedPackOs = selectedPackOsPack(packOs, selectedProfileId)
  const packOsBlocked = isPackOsLaunchBlocked(packOs, selectedProfileId)
  const packOsStatus = packOsHealthStatus(selectedPackOs)
  const packOsReason = packOsPrimaryReason(packOs, selectedProfileId)

  useEffect(() => {
    void refreshReadiness()
    void refreshPackOs()
    if (isNativeAvailable()) void refreshStandaloneRuntime()
  }, [refreshPackOs, refreshReadiness, refreshStandaloneRuntime])

  useEffect(() => {
    let disposed = false

    const checkNativeLoaderMetadata = async () => {
      if (!isNativeAvailable()) {
        setNativeLoaderMetadata({
          checking: false,
          ready: false,
          reason: 'Desktop app required to verify Native Loader metadata.',
          versionId: '',
        })
        return
      }

      setNativeLoaderMetadata((current) => ({
        ...current,
        checking: true,
        reason: 'Checking Native Loader release metadata.',
      }))

      try {
        const localNativeStatus = await launchService.nativeLoaderStatus().catch(() => null)
        const manifest = nativeLoaderRelease?.version
          ? (await invokeNative('release:fetch-manifest', {
              channel: 'stable',
              version: nativeLoaderRelease.version,
              pack: 'ashfall-native-edition',
              refresh: false,
            })).manifest
          : nativeLoaderProfile?.manifestPath
            ? await invokeNative('manifest:load', { manifestPath: nativeLoaderProfile.manifestPath })
            : null

        if (disposed) return
        if (!manifest) {
          const localFallbackAllowed = Boolean(localNativeStatus?.ready && (advancedMode || creatorMode))
          setNativeLoaderMetadata({
            checking: false,
            ready: localFallbackAllowed,
            reason: localFallbackAllowed
              ? `${localNativeStatus?.message ?? 'Local Native Loader fallback is ready.'} Developer fallback is enabled.`
              : localNativeStatus?.message ?? 'Install or refresh Ashfall before Native Loader metadata can be verified.',
            versionId: localFallbackAllowed ? 'local-ashfall-native-loader' : '',
          })
          return
        }

        const status = nativeLoaderMetadataStatus(manifest)
        const localFallbackAllowed = Boolean(localNativeStatus?.ready && (advancedMode || creatorMode))
        setNativeLoaderMetadata({
          checking: false,
          ready: status.ok || localFallbackAllowed,
          reason: status.ok
            ? `Native Loader metadata ready: ${status.versionId}.`
            : localFallbackAllowed
              ? `${localNativeStatus?.message ?? 'Local Native Loader fallback is ready.'} Developer fallback is enabled.`
              : status.reason,
          versionId: status.versionId || (localFallbackAllowed ? 'local-ashfall-native-loader' : ''),
        })
      } catch (error) {
        if (disposed) return
        setNativeLoaderMetadata({
          checking: false,
          ready: false,
          reason: error instanceof Error ? error.message : 'Native Loader metadata could not be verified.',
          versionId: '',
        })
      }
    }

    void checkNativeLoaderMetadata()
    return () => {
      disposed = true
    }
  }, [advancedMode, creatorMode, nativeLoaderProfile?.manifestPath, nativeLoaderRelease?.version])

  useEffect(() => {
    if (!isNativeAvailable()) return
    let disposed = false
    const refreshProfiles = () => {
      if (document.visibilityState !== 'visible') return
      if (profileRefreshInFlight.current) return
      const now = Date.now()
      if (now - lastProfileRefreshAt.current < 15_000) return
      profileRefreshInFlight.current = true
      lastProfileRefreshAt.current = now
      void invokeNative('profile:list')
        .then((nextProfiles) => {
          if (!disposed) setProfiles(nextProfiles)
        })
        .catch(() => undefined)
        .finally(() => {
          profileRefreshInFlight.current = false
        })
    }

    window.addEventListener('focus', refreshProfiles)
    document.addEventListener('visibilitychange', refreshProfiles)
    return () => {
      disposed = true
      window.removeEventListener('focus', refreshProfiles)
      document.removeEventListener('visibilitychange', refreshProfiles)
    }
  }, [setProfiles])

  useEffect(() => {
    if (!repairActive) return
    const timer = window.setInterval(tickRepair, 420)
    return () => window.clearInterval(timer)
  }, [repairActive, tickRepair])

  useEffect(() => {
    if (repairProgress === 100) {
      addToast('Repair install complete', 'Ashfall files are ready for Minecraft Launcher handoff.', 'success')
    }
  }, [addToast, repairProgress])

  const officialStatusFallback = useMemo(
    () => ({ serverName: officialServerName, discordInviteUrl: officialDiscordInviteUrl }),
    [officialDiscordInviteUrl, officialServerName],
  )

  useEffect(() => {
    const pollMs = Math.max(10, officialStatusPollSeconds || 30) * 1000
    const firstRefresh = window.setTimeout(() => {
      void refreshOfficialStatus(officialServerStatusUrl, officialStatusFallback)
    }, 700)
    const timer = window.setInterval(() => {
      void refreshOfficialStatus(officialServerStatusUrl, officialStatusFallback)
    }, pollMs)
    return () => {
      window.clearTimeout(firstRefresh)
      window.clearInterval(timer)
    }
  }, [officialServerStatusUrl, officialStatusFallback, officialStatusPollSeconds, refreshOfficialStatus])

  const prepareAndOpenMinecraftLauncher = async (runtimeMode: MinecraftRuntimeModeId = 'neoforge-minecraft') => {
    const runtimeLabel = runtimeMode === 'native-loader-minecraft' ? 'Native Loader + Minecraft' : 'NeoForge + Minecraft'
    if (packOsBlocked) {
      setHandoffProgress(96)
      setHandoffStage('PackOS blocks launch')
      setHandoffDetail(packOsReason)
      addToast('PackOS blocks launch', packOsReason, 'danger')
      return
    }

    setLaunching(true)
    const operationId = launchService.createOperationId('handoff')
    let pollTimer: number | undefined
    const pollStatus = async () => {
      try {
        const status = await launchService.getOperationStatus(operationId)
        if (status.status === 'idle') return
        setHandoffProgress(status.progress)
        setHandoffStage(status.label)
        setHandoffDetail(status.message ?? '')
      } catch {
        // The handoff call itself will surface the actionable error.
      }
    }

    setHandoffProgress(4)
    setHandoffStage(installIntent ? `Preparing Ashfall for ${runtimeLabel}` : `Preparing ${runtimeLabel}`)
    setHandoffDetail('')
    setLastUpdate(null)
    addToast(
      'Preparing Ashfall',
      installIntent ? `Installing the latest GitHub Ashfall release and preparing ${runtimeLabel}.` : `Checking Ashfall and preparing ${runtimeLabel}.`,
      'info',
    )
    try {
      if (!isNativeAvailable()) {
        addToast('Desktop app required', 'Ashfall install and handoff require the Electron desktop app.', 'warning')
        return
      }
      pollTimer = window.setInterval(() => void pollStatus(), 500)
      void pollStatus()
      const result = await launchService.prepareHandoff(
        selectedProfile.id,
        selectedProfile.installPath,
        ramGb,
        true,
        operationId,
        installIntent ? 'allow' : 'skip',
        runtimeMode,
      )
      setLastPreparation(result)
      invokeNative('profile:list')
        .then(setProfiles)
        .catch(() => undefined)
      void refreshReadiness()
      void refreshPackOs()
      setLaunchState({
        active: false,
        profileId: selectedProfile.id,
        status: result.ok ? 'handoff' : 'preflight_failed',
        message: result.message,
        exitedAt: new Date().toISOString(),
      })
      if (result.ok) {
        setHandoffProgress(100)
        setHandoffStage('Ready in Minecraft Launcher')
        setHandoffDetail(result.message)
        addToast('Minecraft Launcher ready', result.message, result.handoff?.openedLauncher ? 'success' : 'warning')
      } else {
        setHandoffProgress(96)
        setHandoffStage(result.handoff ? 'Minecraft Launcher needs attention' : 'Ashfall needs attention')
        setHandoffDetail(result.message)
        addToast(result.handoff ? 'Minecraft Launcher needs attention' : 'Ashfall needs attention', result.message, 'danger')
      }
    } catch (error) {
      setHandoffProgress(96)
      setHandoffStage('Ashfall handoff failed')
      setHandoffDetail(error instanceof Error ? error.message : 'Unable to prepare Minecraft Launcher handoff.')
      addToast('Ashfall handoff failed', error instanceof Error ? error.message : 'Unable to prepare Minecraft Launcher handoff.', 'danger')
    } finally {
      if (pollTimer) window.clearInterval(pollTimer)
      setLaunching(false)
    }
  }

  const updateAshfall = async () => {
    if (!latestRelease?.version) {
      addToast('Update unavailable', 'Refresh the release feed before updating Ashfall.', 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Ashfall updates require the Electron desktop app.', 'warning')
      return
    }

    setUpdating(true)
    setLastPreparation(null)
    setLastUpdate(null)
    setHandoffProgress(4)
    setHandoffStage('Preparing Ashfall update')
    setHandoffDetail('')
    addToast('Updating Ashfall', `Installing Ashfall ${latestRelease.version} without launching Minecraft.`, 'info')

    const operationId = launchService.createOperationId('update')
    let pollTimer: number | undefined
    const pollStatus = async () => {
      try {
        const status = await launchService.getOperationStatus(operationId)
        if (status.status === 'idle') return
        setHandoffProgress(status.progress)
        setHandoffStage(status.label)
        setHandoffDetail(status.message ?? '')
      } catch {
        // The update call itself will surface the actionable error.
      }
    }

    try {
      pollTimer = window.setInterval(() => void pollStatus(), 500)
      void pollStatus()
      const result = await installService.runInstall({
        profileId: selectedProfile.id,
        installPath: selectedProfile.installPath,
        channel: selectedProfile.channel,
        version: latestRelease.version,
        operationId,
        refresh: true,
      })
      setLastUpdate(result)
      setHandoffProgress(result.ok ? 100 : 96)
      setHandoffStage(result.ok ? 'Update complete' : 'Update needs attention')
      setHandoffDetail(
        result.ok
          ? result.installPath
          : `${result.failed.length + result.skipped.length + result.after.missing.length + result.after.corrupt.length} files still need attention.`,
      )
      invokeNative('profile:list')
        .then(setProfiles)
        .catch(() => undefined)
      void refreshReadiness()
      addToast(
        result.ok ? 'Ashfall updated' : 'Ashfall update needs attention',
        result.ok ? `Updated ${result.updated?.length ?? 0} and verified ${result.verified.length} files.` : 'Open Downloads for the full install report.',
        result.ok ? 'success' : 'danger',
      )
    } catch (error) {
      setHandoffProgress(96)
      setHandoffStage('Update failed')
      setHandoffDetail(error instanceof Error ? error.message : 'Unable to update Ashfall.')
      addToast('Update failed', error instanceof Error ? error.message : 'Unable to update Ashfall.', 'danger')
    } finally {
      if (pollTimer) window.clearInterval(pollTimer)
      setUpdating(false)
    }
  }

  const launchNativeLoaderAshfall = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Ashfall Native Loader launch requires the Electron desktop app.', 'warning')
      return
    }

    setLaunching(true)
    setHandoffProgress(8)
    setHandoffStage('Starting ECHO Native Loader')
    setHandoffDetail('Launching the isolated Ashfall native-loader pack.')
    const operationId = launchService.createOperationId('native-loader')
    let pollTimer: number | undefined
    const pollStatus = async () => {
      try {
        const status = await launchService.getOperationStatus(operationId)
        if (status.status === 'idle') return
        setHandoffProgress(status.progress)
        setHandoffStage(status.label)
        setHandoffDetail(status.message ?? '')
      } catch {
        // The launch result will surface the actionable error.
      }
    }

    try {
      pollTimer = window.setInterval(() => void pollStatus(), 500)
      void pollStatus()
      const result = await launchService.launchNativeLoaderAshfall(operationId, selectedProfile.id)
      setLaunchState(result.state)
      setHandoffProgress(result.ok ? 100 : 96)
      setHandoffStage(result.ok ? 'Native Loader running' : 'Native Loader blocked')
      setHandoffDetail(result.message)
      addToast(result.ok ? 'Native Loader started' : 'Native Loader blocked', result.message, result.ok ? 'success' : 'danger')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start Ashfall Native Loader.'
      setHandoffProgress(96)
      setHandoffStage('Native Loader failed')
      setHandoffDetail(message)
      addToast('Native Loader failed', message, 'danger')
    } finally {
      if (pollTimer) window.clearInterval(pollTimer)
      setLaunching(false)
    }
  }

  const launchSelectedRuntime = async () => {
    if (selectedRuntimeMode === 'native-runtime') {
      const result = await launchStandaloneRuntime({ profileId: selectedProfile.id })
      if (!result) return
      addToast(result.ok ? 'Native Runtime launched' : 'Native Runtime blocked', result.message, result.ok ? 'success' : 'danger')
      return
    }
    if (selectedRuntimeMode === 'native-loader-minecraft') {
      if (nativeLoaderMetadata.versionId === 'local-ashfall-native-loader' && (advancedMode || creatorMode)) {
        await launchNativeLoaderAshfall()
        return
      }
      await prepareAndOpenMinecraftLauncher('native-loader-minecraft')
      return
    }
    await prepareAndOpenMinecraftLauncher(selectedRuntimeMode)
  }

  const handleBackup = async () => {
    const sourcePath = selectedProfile.installPath ? `${selectedProfile.installPath}\\saves` : undefined
    const result = await backupService.createBackup(selectedProfile.id, sourcePath)
    if (result.ok) addToast('World backup created', result.backupPath ?? 'Backup complete.', 'success')
    else addToast('Backup needs a real world path', result.reason ?? 'No save directory was found for Ashfall.', 'warning')
  }

  const handoffBlocked = handoffProgress >= 96 && handoffProgress < 100 && !launching && Boolean(handoffDetail)
  const progressTone = handoffProgress === 100 || repairProgress === 100 ? 'success' : handoffBlocked ? 'danger' : 'cyan'
  const visibleProgress = launching || updating || handoffProgress > 0 ? handoffProgress : repairActive || repairProgress > 0 ? repairProgress : 100
  const visibleStage =
    launching || updating || handoffProgress > 0
      ? handoffStage
      : repairProgress === 100
        ? 'Repair complete'
        : selectedRuntimeMode === 'native-runtime'
          ? 'Native Runtime ready'
          : 'Ready in Minecraft Launcher'
  const visibleDetail =
    handoffDetail ||
    (selectedRuntimeMode === 'native-runtime'
      ? 'Standalone runtime verification controls launch readiness.'
      : 'Minecraft Launcher profile and Ashfall files are verified before handoff.')
  const minecraftReady = readiness?.minecraftLauncher?.ok ?? true
  const runtimeCards = useMemo(
    () =>
      buildRuntimeModeCards(standaloneRuntimeState, {
        minecraftReady,
        nativeLoaderReady: nativeLoaderMetadata.ready,
        nativeLoaderDisabledReason: nativeLoaderMetadata.checking ? 'Checking Native Loader metadata...' : nativeLoaderMetadata.reason,
      }),
    [minecraftReady, nativeLoaderMetadata.checking, nativeLoaderMetadata.ready, nativeLoaderMetadata.reason, standaloneRuntimeState],
  )
  const selectedRuntimeCard = runtimeCards.find((card) => card.id === selectedRuntimeMode) ?? runtimeCards[0]
  const selectedLaunchButton = buildRuntimeLaunchButtonState({
    mode: selectedRuntimeMode,
    state: standaloneRuntimeState,
    nativeAvailable: isNativeAvailable(),
    minecraftReady,
    nativeLoaderReady: nativeLoaderMetadata.ready,
    nativeLoaderDisabledReason: nativeLoaderMetadata.checking ? 'Checking Native Loader metadata...' : nativeLoaderMetadata.reason,
    launching: launching || updating || standaloneLaunching,
  })
  const selectedRuntimeIsMinecraft = minecraftRuntimeModes.has(selectedRuntimeMode)
  const selectedRuntimeBlocked = selectedLaunchButton.disabled || (selectedRuntimeIsMinecraft && packOsBlocked)
  const selectedRuntimeActionLabel = selectedRuntimeIsMinecraft && installIntent && !selectedLaunchButton.disabled
    ? homeActions.primaryActionLabel
    : selectedLaunchButton.label
  const selectedRuntimeRoute = runtimeModeRoutes[selectedRuntimeMode]

  const officialRuntimeState = getOfficialServerRuntimeState(officialStatus, officialStatusLoading, officialStatusError)
  const officialRuntimeLabel: Record<typeof officialRuntimeState, string> = {
    loading: 'Loading',
    online: 'Online',
    offline: 'Offline',
    stale: 'Stale',
    unavailable: 'Unavailable',
  }
  const officialServerTitle = officialStatus?.serverName || officialServerName || officialServerSettingsDefaults.officialServerName
  const officialPlayerText = officialStatus ? `${officialStatus.playerCount} / ${officialStatus.maxPlayers || '--'}` : '-- / --'
  const selectedRuntimeSkin = runtimeModeSkin[selectedRuntimeMode]
  const openOfficialServerChat = () => {
    setActiveChatChannel(OFFICIAL_ASHFALL_CHAT_CHANNEL_ID)
    setActivePage('chat')
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_76px] gap-3 overflow-hidden">
      <GlassCard className="grid min-h-0 grid-rows-[auto_160px_minmax(0,1fr)] gap-4 p-5" tone="cyan">
        <div className="flex min-h-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-soft">Runtime</p>
            <h1 className="truncate text-2xl font-semibold text-white">How should Ashfall launch?</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusChip compact label={selectedRuntimeCard.label} status={selectedLaunchButton.status} />
            {homeActions.updateActionLabel ? (
              <CyberButton disabled={launching || updating} icon={RotateCcw} onClick={() => void updateAshfall()} size="sm" variant="secondary">
                {updating ? 'Updating...' : 'Update'}
              </CyberButton>
            ) : null}
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-3 gap-3">
          {runtimeCards.map((card) => (
            <RuntimeChoiceCard
              card={card}
              key={card.id}
              onSelect={() => {
                const matchingProfile = profileForRuntimeMode[card.id] as typeof selectedProfile | undefined
                if (matchingProfile) setSelectedProfileId(matchingProfile.id)
              }}
              selected={selectedRuntimeMode === card.id}
            />
          ))}
        </div>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-3">
          <section className={cn('relative flex min-h-0 flex-col overflow-hidden rounded-lg border bg-black/20 p-4', selectedRuntimeSkin.panelClass)}>
            <div className={cn('absolute left-0 top-0 h-full w-1', selectedRuntimeSkin.accentClass)} />
            <div className="flex min-w-0 items-start justify-between gap-3 pl-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">{runtimeModeBadges[selectedRuntimeMode]}</p>
                <h2 className="mt-1 truncate text-xl font-semibold text-white">{selectedRuntimeCard.label}</h2>
              </div>
              <StatusChip compact status={selectedRuntimeCard.status} />
            </div>
            <p className="mt-3 line-clamp-3 pl-2 text-sm leading-5 text-slate-300">{selectedRuntimeRoute.subtitle}</p>
            <div className="mt-auto grid grid-cols-3 gap-2 pl-2">
              {selectedRuntimeRoute.steps.map((step, index) => (
                <div className="min-w-0 rounded-md border border-white/10 bg-black/25 p-2" key={step.label}>
                  <p className="font-mono text-[10px] font-bold text-cyan-soft">{String(index + 1).padStart(2, '0')}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-white">{step.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Ready Check</p>
                <h2 className="truncate text-base font-semibold text-white">{visibleStage}</h2>
              </div>
              <span className="font-mono text-xs text-slate-300">{Math.round(visibleProgress)}%</span>
            </div>
            <div className="mt-3">
              <ProgressBar tone={progressTone} value={visibleProgress} />
            </div>
            <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-300" title={visibleDetail}>{visibleDetail}</p>
            <div className="mt-auto space-y-2">
              <CyberButton
                className="w-full"
                disabled={selectedRuntimeBlocked}
                icon={selectedRuntimeMode === 'native-runtime' ? Monitor : installIntent ? DownloadCloud : runtimeModeIcons[selectedRuntimeMode]}
                onClick={() => void launchSelectedRuntime()}
                size="lg"
                variant={selectedRuntimeBlocked ? 'ghost' : selectedRuntimeMode === 'native-loader-minecraft' ? 'warning' : selectedRuntimeMode === 'native-runtime' ? 'success' : 'primary'}
              >
                {selectedRuntimeActionLabel}
              </CyberButton>
              <p className="line-clamp-2 text-xs leading-4 text-slate-500" title={selectedLaunchButton.detail ?? selectedRuntimeCard.detail}>
                {selectedLaunchButton.detail ?? selectedRuntimeCard.detail}
              </p>
            </div>
          </section>
        </div>
      </GlassCard>

      <GlassCard className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4 p-3">
        <SupportLine
          detail={`${officialPlayerText} players / updated ${formatOfficialServerUpdatedAt(officialStatus)}`}
          icon={RadioTower}
          label="Server"
          status={<StatusChip compact label={officialRuntimeLabel[officialRuntimeState]} status={officialRuntimeState === 'online' ? 'operational' : officialRuntimeState === 'unavailable' ? 'critical' : 'warning'} />}
          title={officialServerTitle}
        />
        <SupportLine
          detail={packOsReason}
          icon={ShieldAlert}
          label="PackOS"
          status={<StatusChip compact label={packOsUiStateLabel(selectedPackOs?.uiState)} status={packOsStatus} />}
          title={selectedPackOs?.name ?? 'Ashfall'}
        />
        <div className="flex shrink-0 items-center gap-2">
          <CyberButton icon={MessageSquare} onClick={openOfficialServerChat} size="sm" variant="secondary">
            Chat
          </CyberButton>
          <CyberButton
            icon={ShieldAlert}
            onClick={() => {
              setActiveToolsTab('diagnostics')
              setActivePage('tools')
            }}
            size="sm"
            variant={packOsBlocked ? 'warning' : 'secondary'}
          >
            Diagnostics
          </CyberButton>
          <CyberButton icon={Archive} onClick={handleBackup} size="sm" variant="warning">
            Backup
          </CyberButton>
        </div>
      </GlassCard>

      <Dialog.Root onOpenChange={setWorldgenOpen} open={worldgenOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
          <Dialog.Content className="glass-surface fixed left-1/2 top-1/2 z-50 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 shadow-cyber">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-xl font-semibold text-white">Worldgen Safety</Dialog.Title>
                <Dialog.Description className="mt-3 text-sm leading-6 text-slate-300">
                  Existing chunks remain playable, but newly generated chunks can use updated Ashfall resource distribution, storm anchors, and ruin placement after pack updates.
                </Dialog.Description>
              </div>
              <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close modal">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <div className="mt-5 rounded-lg border border-amber-echo/40 bg-amber-echo/10 p-4 text-sm text-amber-echo">
              Back up your world before updating. ECHO never includes saves in modpack exports.
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <CyberButton icon={Archive} onClick={handleBackup} variant="secondary">
                Backup World
              </CyberButton>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function RuntimeChoiceCard({
  card,
  onSelect,
  selected,
}: {
  card: StandaloneRuntimeModeCard
  onSelect: () => void
  selected: boolean
}) {
  const Icon = runtimeModeIcons[card.id]
  const skin = runtimeModeSkin[card.id]

  return (
    <button
      aria-pressed={selected}
      className={cn(
        'group relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border p-4 text-left transition hover:-translate-y-px',
        selected ? skin.selectedClass : skin.idleClass,
      )}
      onClick={onSelect}
      type="button"
    >
      <div className={cn('absolute left-0 top-0 h-full w-1', skin.accentClass, selected ? 'opacity-100' : 'opacity-45')} />
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', skin.iconClass)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <StatusChip compact status={card.status} />
      </div>
      <div className="mt-3 min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.eyebrow}</p>
        <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-5 text-white">{card.label}</h2>
        <p className="mt-2 line-clamp-2 text-xs leading-4 text-slate-300">{card.detail}</p>
      </div>
      <div className="mt-auto pt-3">
        <p className={cn('truncate text-[10px] font-bold uppercase', card.id === 'native-runtime' ? 'text-success-echo' : 'text-amber-echo')}>
          {runtimeModeBadges[card.id]}
        </p>
      </div>
    </button>
  )
}

function SupportLine({
  detail,
  icon: Icon,
  label,
  status,
  title,
}: {
  detail: string
  icon: LucideIcon
  label: string
  status?: ReactNode
  title: string
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-echo/20 bg-black/30 text-cyan-soft">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-soft">{label}</p>
        <p className="truncate text-sm font-semibold text-white" title={title}>{title}</p>
        <p className="truncate text-xs text-slate-400" title={detail}>{detail}</p>
      </div>
      {status}
    </div>
  )
}
