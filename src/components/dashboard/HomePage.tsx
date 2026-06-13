import * as Dialog from '@radix-ui/react-dialog'
import {
  Archive,
  DownloadCloud,
  Gamepad2,
  MessageSquare,
  Monitor,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { backupService } from '../../services/BackupService'
import { installService } from '../../services/InstallService'
import { launchService } from '../../services/LaunchService'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { repairService } from '../../services/RepairService'
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
import type { HealthStatus } from '../../types/launcher'
import type { LauncherRuntimeModeId, MinecraftRuntimeModeId } from '../../types/standaloneRuntime'
import type { NativeHandoffPreparationResult, NativeInstallResult } from '../../types/native'
import { formatOfficialServerUpdatedAt, getOfficialServerRuntimeState } from '../../types/serverStatus'
import { defaultAshfallRuntimeMode, getAshfallHomeRoute, getSelectedPackHomeActions } from '../../utils/ashfallHomeActions'
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
import { buildRuntimeLaunchButtonState, runtimeSummaryStatus } from '../../utils/standaloneRuntimeShell'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { ProgressBar } from '../cyber/ProgressBar'
import { StatusChip } from '../cyber/StatusChip'

const runtimeModeIcons: Record<LauncherRuntimeModeId, LucideIcon> = {
  'neoforge-minecraft': Gamepad2,
  'native-loader-minecraft': Terminal,
  'native-runtime': Monitor,
}

const minecraftRuntimeModes = new Set<LauncherRuntimeModeId>(['neoforge-minecraft', 'native-loader-minecraft'])

interface HomeBlockerItem {
  id: string
  label: string
  title: string
  detail: string
  status: HealthStatus
  actionLabel?: string
  action?: () => void | Promise<void>
}

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
  const selectedRuntimeMode = defaultAshfallRuntimeMode(selectedProfile ?? {})
  const selectedMinecraftRuntimeMode: MinecraftRuntimeModeId = selectedRuntimeMode === 'neoforge-minecraft' ? 'neoforge-minecraft' : 'native-loader-minecraft'
  const profileForRuntimeMode = useMemo(
    () => Object.fromEntries(profiles.filter((profile) => profile.runtimeMode).map((profile) => [profile.runtimeMode, profile])),
    [profiles],
  )
  const latestRelease = useMemo(() => latestPlayableReleaseForPack(releaseIndex, selectedProfile.id), [releaseIndex, selectedProfile.id])
  const nativeLoaderRelease = useMemo(() => latestPlayableReleaseForPack(releaseIndex, 'ashfall-native-edition'), [releaseIndex])
  const nativeLoaderProfile = profileForRuntimeMode['native-loader-minecraft']
  const selectedPackOs = selectedPackOsPack(packOs, selectedProfileId)
  const packOsBlocked = isPackOsLaunchBlocked(packOs, selectedProfileId)
  const packOsStatus = packOsHealthStatus(selectedPackOs)
  const packOsReason = packOsPrimaryReason(packOs, selectedProfileId)

  useEffect(() => {
    void refreshReadiness(selectedProfile.id)
    void refreshPackOs()
    if (isNativeAvailable()) void refreshStandaloneRuntime()
  }, [refreshPackOs, refreshReadiness, refreshStandaloneRuntime, selectedProfile.id])

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
              channel: nativeLoaderProfile?.channel ?? 'alpha',
              version: nativeLoaderRelease.version,
              pack: 'ashfall-native-edition',
              refresh: false,
            })).manifest
          : nativeLoaderProfile?.manifestPath
            ? await invokeNative('manifest:load', { manifestPath: nativeLoaderProfile.manifestPath, profileId: nativeLoaderProfile.id })
            : null

        if (disposed) return
        if (!manifest) {
          const localFallbackAllowed = Boolean(localNativeStatus?.ready && (advancedMode || creatorMode))
          setNativeLoaderMetadata({
            checking: false,
            ready: localFallbackAllowed,
            reason: localFallbackAllowed
              ? `${localNativeStatus?.message ?? 'Local Native Loader fallback is ready.'} Developer fallback is enabled.`
              : localNativeStatus?.message ?? `Install or refresh ${selectedProfile.name} before Native Loader metadata can be verified.`,
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
  }, [advancedMode, creatorMode, nativeLoaderProfile?.channel, nativeLoaderProfile?.id, nativeLoaderProfile?.manifestPath, nativeLoaderRelease?.version, selectedProfile.name])

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
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') tickRepair()
    }, 420)
    return () => window.clearInterval(timer)
  }, [repairActive, tickRepair])

  useEffect(() => {
    if (repairProgress === 100) {
      addToast('Repair install complete', `${selectedProfile.name} files are ready for handoff.`, 'success')
    }
  }, [addToast, repairProgress, selectedProfile.name])

  const officialStatusFallback = useMemo(
    () => ({ serverName: officialServerName, discordInviteUrl: officialDiscordInviteUrl }),
    [officialDiscordInviteUrl, officialServerName],
  )

  useEffect(() => {
    const pollMs = Math.max(10, officialStatusPollSeconds || 30) * 1000
    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refreshOfficialStatus(officialServerStatusUrl, officialStatusFallback)
    }
    const firstRefresh = window.setTimeout(refreshIfVisible, 700)
    const timer = window.setInterval(refreshIfVisible, pollMs)
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshOfficialStatus(officialServerStatusUrl, officialStatusFallback)
      }
    }
    document.addEventListener('visibilitychange', refreshOnVisible)
    return () => {
      window.clearTimeout(firstRefresh)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [officialServerStatusUrl, officialStatusFallback, officialStatusPollSeconds, refreshOfficialStatus])

  const prepareAndOpenMinecraftLauncher = async (runtimeMode: MinecraftRuntimeModeId = selectedMinecraftRuntimeMode) => {
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
      if (document.visibilityState !== 'visible') return
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
    setHandoffStage(installIntent ? `Preparing ${selectedProfile.name} for ${runtimeLabel}` : `Preparing ${runtimeLabel}`)
    setHandoffDetail('')
    setLastUpdate(null)
    addToast(
      `Preparing ${selectedProfile.name}`,
      installIntent ? `Installing the latest approved ${selectedProfile.name} release and preparing ${runtimeLabel}.` : `Checking ${selectedProfile.name} and preparing ${runtimeLabel}.`,
      'info',
    )
    try {
      if (!isNativeAvailable()) {
        addToast('Desktop app required', 'Pack install and handoff require the Electron desktop app.', 'warning')
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
      void refreshReadiness(selectedProfile.id)
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
        setHandoffStage(result.handoff ? 'Minecraft Launcher needs attention' : `${selectedProfile.name} needs attention`)
        setHandoffDetail(result.message)
        addToast(result.handoff ? 'Minecraft Launcher needs attention' : `${selectedProfile.name} needs attention`, result.message, 'danger')
      }
    } catch (error) {
      setHandoffProgress(96)
      setHandoffStage(`${selectedProfile.name} handoff failed`)
      setHandoffDetail(error instanceof Error ? error.message : 'Unable to prepare Minecraft Launcher handoff.')
      addToast(`${selectedProfile.name} handoff failed`, error instanceof Error ? error.message : 'Unable to prepare Minecraft Launcher handoff.', 'danger')
    } finally {
      if (pollTimer) window.clearInterval(pollTimer)
      setLaunching(false)
    }
  }

  const installOrUpdateSelectedPack = async (operation: 'install' | 'update') => {
    const manifestPath = latestRelease?.version ? undefined : selectedProfile.manifestPath
    if (!latestRelease?.version && !manifestPath) {
      addToast(
        `${operation === 'install' ? 'Install' : 'Update'} unavailable`,
        'Refresh the Catalog or import a pack manifest before continuing.',
        'warning',
      )
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Pack install and update actions require the Electron desktop app.', 'warning')
      return
    }

    setUpdating(true)
    setLastPreparation(null)
    setLastUpdate(null)
    setHandoffProgress(4)
    setHandoffStage(operation === 'install' ? `Preparing ${selectedProfile.name} install` : `Preparing ${selectedProfile.name} update`)
    setHandoffDetail('')
    addToast(
      operation === 'install' ? `Installing ${selectedProfile.name}` : `Updating ${selectedProfile.name}`,
      latestRelease?.version ? `Installing ${selectedProfile.name} ${latestRelease.version}.` : `Using imported manifest ${manifestPath}.`,
      'info',
    )

    const operationId = launchService.createOperationId(operation)
    let pollTimer: number | undefined
    const pollStatus = async () => {
      if (document.visibilityState !== 'visible') return
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
        manifestPath,
        channel: selectedProfile.channel,
        version: latestRelease?.version,
        operationId,
        refresh: true,
      })
      setLastUpdate(result)
      setHandoffProgress(result.ok ? 100 : 96)
      setHandoffStage(result.ok ? (operation === 'install' ? 'Install complete' : 'Update complete') : `${operation === 'install' ? 'Install' : 'Update'} needs attention`)
      setHandoffDetail(
        result.ok
          ? result.installPath
          : `${result.failed.length + result.skipped.length + result.after.missing.length + result.after.corrupt.length} files still need attention.`,
      )
      invokeNative('profile:list')
        .then(setProfiles)
        .catch(() => undefined)
      void refreshReadiness(selectedProfile.id)
      void refreshPackOs()
      addToast(
        result.ok ? (operation === 'install' ? `${selectedProfile.name} installed` : `${selectedProfile.name} updated`) : `${selectedProfile.name} ${operation} needs attention`,
        result.ok ? `Updated ${result.updated?.length ?? 0} and verified ${result.verified.length} files.` : 'Open Downloads for the full install report.',
        result.ok ? 'success' : 'danger',
      )
    } catch (error) {
      setHandoffProgress(96)
      setHandoffStage(operation === 'install' ? 'Install failed' : 'Update failed')
      setHandoffDetail(error instanceof Error ? error.message : `Unable to ${operation} ${selectedProfile.name}.`)
      addToast(operation === 'install' ? 'Install failed' : 'Update failed', error instanceof Error ? error.message : `Unable to ${operation} ${selectedProfile.name}.`, 'danger')
    } finally {
      if (pollTimer) window.clearInterval(pollTimer)
      setUpdating(false)
    }
  }

  const repairSelectedPack = async () => {
    const installPath = selectedProfile.installPath
    const manifestPath = selectedProfile.manifestPath
    if (!installPath || !manifestPath) {
      addToast('Repair unavailable', 'Select a pack with an install folder and imported manifest first.', 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Pack repair requires the Electron desktop app.', 'warning')
      return
    }

    setUpdating(true)
    setLastPreparation(null)
    setLastUpdate(null)
    setHandoffProgress(8)
    setHandoffStage(`Repairing ${selectedProfile.name}`)
    setHandoffDetail('Verifying installed files against the selected pack manifest.')
    addToast(`Repairing ${selectedProfile.name}`, 'Missing or corrupt files will be restored from the manifest artifacts.', 'info')

    try {
      const result = await repairService.runRepair({
        profileId: selectedProfile.id,
        installPath,
        manifestPath,
        channel: selectedProfile.channel,
        version: latestRelease?.version,
      })
      const filesClean = result.after.missing.length === 0 && result.after.corrupt.length === 0
      setHandoffProgress(result.ok ? 100 : 96)
      setHandoffStage(result.ok ? (selectedRuntimeBlocked ? 'Files repaired, launch still needs attention' : 'Repair complete') : 'Repair needs attention')
      setHandoffDetail(
        result.ok && selectedRuntimeBlocked && filesClean
          ? `Files verified, but ${selectedRoute.label} still needs diagnostics.`
          : result.ok
          ? `Repaired ${result.repaired.length} and verified ${result.after.valid.length} files.`
          : `${result.skipped.length + result.after.missing.length + result.after.corrupt.length} files still need attention.`,
      )
      invokeNative('profile:list')
        .then(setProfiles)
        .catch(() => undefined)
      void refreshReadiness(selectedProfile.id)
      void refreshPackOs()
      addToast(
        result.ok && selectedRuntimeBlocked ? 'Files repaired, launch still needs attention' : result.ok ? `${selectedProfile.name} repaired` : `${selectedProfile.name} repair needs attention`,
        result.ok && selectedRuntimeBlocked ? `Open Diagnostics for ${selectedRoute.label}. Report: ${result.reportPath}` : result.ok ? `Report: ${result.reportPath}` : 'Open Tools > Repair for the full repair report.',
        result.ok ? (selectedRuntimeBlocked ? 'warning' : 'success') : 'danger',
      )
    } catch (error) {
      setHandoffProgress(96)
      setHandoffStage('Repair failed')
      setHandoffDetail(error instanceof Error ? error.message : `Unable to repair ${selectedProfile.name}.`)
      addToast('Repair failed', error instanceof Error ? error.message : `Unable to repair ${selectedProfile.name}.`, 'danger')
    } finally {
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
      if (document.visibilityState !== 'visible') return
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
      : `Minecraft Launcher profile and ${selectedProfile.name} files are verified before handoff.`)
  const selectedReadiness = readiness?.profile?.id === selectedProfile.id ? readiness : null
  const minecraftReady = selectedReadiness?.minecraftLauncher?.ok ?? true
  const selectedRoute = getAshfallHomeRoute(selectedProfile)
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
  const selectedPackCanRepair = Boolean(selectedProfile.installPath && selectedProfile.manifestPath)
  const selectedPackCanInstallFrom = Boolean(latestRelease?.version || selectedProfile.manifestPath)
  const homeActions = getSelectedPackHomeActions(selectedProfile, latestRelease, {
    canRepair: selectedPackCanRepair,
    launchBlocked: selectedRuntimeBlocked,
    packName: selectedProfile.name,
  })
  const installIntent = homeActions.primaryUsesInstallFlow
  const primaryUsesInstallFlow = homeActions.primaryActionKind === 'install' || homeActions.primaryActionKind === 'update'
  const primaryUsesRepairFlow = homeActions.primaryActionKind === 'repair'
  const primaryBusy = launching || updating || standaloneLaunching
  const primaryDisabled =
    primaryBusy ||
    (primaryUsesInstallFlow
      ? !isNativeAvailable() || !selectedPackCanInstallFrom
      : primaryUsesRepairFlow
        ? !isNativeAvailable() || !selectedPackCanRepair
        : selectedRuntimeBlocked)
  const cockpitStatus = homeActions.needsInstall
    ? 'Not installed'
    : homeActions.needsUpdate
      ? 'Update available'
      : homeActions.primaryActionKind === 'repair'
        ? 'Repair available'
      : selectedRuntimeBlocked
        ? 'Blocked'
        : 'Ready to play'
  const cockpitStatusTone: HealthStatus = homeActions.needsInstall
    ? 'missing'
    : homeActions.needsUpdate
      ? 'update_available'
      : homeActions.primaryActionKind === 'repair'
        ? 'warning'
      : selectedRuntimeBlocked
        ? 'critical'
        : 'healthy'
  const routeReadiness: { status: HealthStatus; detail: string } =
    selectedRuntimeMode === 'native-runtime'
      ? {
          status: runtimeSummaryStatus(standaloneRuntimeState),
          detail: standaloneRuntimeState?.ok ? 'Standalone runtime checks passed.' : standaloneRuntimeState?.warnings[0] ?? selectedLaunchButton.detail ?? 'Standalone runtime verification is required.',
        }
      : selectedRuntimeMode === 'native-loader-minecraft'
        ? {
            status: nativeLoaderMetadata.ready ? 'healthy' : 'warning',
            detail: nativeLoaderMetadata.checking ? 'Checking Native Loader metadata.' : nativeLoaderMetadata.reason,
          }
        : {
            status: minecraftReady ? 'healthy' : 'warning',
            detail: selectedReadiness?.minecraftLauncher.warnings.join(' ') || 'Minecraft Launcher profile is ready.',
          }
  const officialRuntimeState = getOfficialServerRuntimeState(officialStatus, officialStatusLoading, officialStatusError)
  const officialRuntimeLabel = officialRuntimeState === 'online' ? 'Online' : officialRuntimeState === 'unavailable' ? 'Unavailable' : officialRuntimeState === 'offline' ? 'Offline' : 'Checking'
  const officialServerTitle = officialStatus?.serverName || officialServerName || officialServerSettingsDefaults.officialServerName
  const officialPlayerText = officialStatus ? `${officialStatus.playerCount} / ${officialStatus.maxPlayers || '--'}` : '-- / --'
  const openOfficialServerChat = () => {
    setActiveChatChannel(OFFICIAL_ASHFALL_CHAT_CHANNEL_ID)
    setActivePage('community')
  }
  const openDiagnostics = () => {
    setActiveToolsTab('diagnostics')
    setActivePage('tools')
  }
  const openLibrary = () => {
    setActivePage('library')
  }
  const handlePrimaryAction = async () => {
    if (homeActions.primaryActionKind === 'install' || homeActions.primaryActionKind === 'update') {
      await installOrUpdateSelectedPack(homeActions.primaryActionKind)
      return
    }
    if (primaryUsesRepairFlow) {
      await repairSelectedPack()
      return
    }
    await launchSelectedRuntime()
  }
  const primaryActionDetail = primaryDisabled
    ? primaryUsesInstallFlow
      ? !isNativeAvailable()
        ? 'Desktop app required to install approved packages.'
        : 'No approved Catalog release or imported manifest is available for this pack.'
      : primaryUsesRepairFlow
        ? !isNativeAvailable()
          ? 'Desktop app required to repair installed packs.'
          : 'Repair needs an installed pack folder and local manifest.'
      : packOsBlocked
        ? packOsReason
        : selectedLaunchButton.detail ?? 'This pack needs attention before launch.'
    : homeActions.primaryActionKind === 'install'
      ? latestRelease?.version
        ? 'Installs the approved Catalog package for the selected pack.'
        : 'Installs from the imported local pack manifest.'
      : homeActions.primaryActionKind === 'update'
        ? latestRelease?.version
          ? 'Updates installed files from the approved Catalog package.'
          : 'Refreshes installed files from the imported local manifest.'
        : homeActions.primaryActionKind === 'repair'
          ? 'Repairs missing or corrupt files from the selected pack manifest.'
          : `Starts ${selectedRoute.label} for the selected pack.`
  const primaryButtonVariant =
    primaryDisabled
      ? 'ghost'
      : homeActions.primaryActionKind === 'update' || homeActions.primaryActionKind === 'repair'
        ? 'warning'
        : homeActions.primaryActionKind === 'launch-standalone'
          ? 'success'
          : 'primary'
  const primaryButtonIcon =
    homeActions.primaryActionKind === 'install' || homeActions.primaryActionKind === 'update'
      ? DownloadCloud
      : homeActions.primaryActionKind === 'repair'
        ? ShieldAlert
      : runtimeModeIcons[selectedRuntimeMode]
  const RouteIcon = runtimeModeIcons[selectedRuntimeMode]
  const blockerItems: HomeBlockerItem[] = [
    {
      id: 'packos',
      label: 'PackOS',
      title: packOsBlocked ? 'Launch blocked' : packOsUiStateLabel(selectedPackOs?.uiState),
      detail: packOsReason,
      status: packOsStatus,
      actionLabel: packOsBlocked ? 'Diagnostics' : undefined,
      action: packOsBlocked ? openDiagnostics : undefined,
    },
    {
      id: 'catalog',
      label: 'Catalog',
      title: latestRelease?.version ? `Approved ${latestRelease.version}` : 'No approved release loaded',
      detail: latestRelease?.manifestSha256
        ? 'Install package includes verified checksum metadata.'
        : selectedProfile.manifestPath
          ? 'Local manifest is available for repair or reinstall while the Catalog gate is unresolved.'
          : 'Refresh the Catalog or open Library for release diagnostics.',
      status: latestRelease?.version ? 'healthy' : selectedProfile.manifestPath ? 'operational' : 'warning',
      actionLabel: 'Library',
      action: openLibrary,
    },
    {
      id: 'install',
      label: 'Install',
      title: selectedReadiness?.install.installed ? 'Installed' : 'Not installed yet',
      detail: selectedReadiness?.install.installed
        ? selectedReadiness.install.installPath ?? selectedProfile.installPath ?? 'Install path ready.'
        : 'Use the primary action to install this pack.',
      status: selectedReadiness?.install.installed ? 'healthy' : 'missing',
      actionLabel: selectedReadiness?.install.installed ? (homeActions.primaryActionKind === 'repair' ? 'Repair' : undefined) : 'Library',
      action: selectedReadiness?.install.installed ? (homeActions.primaryActionKind === 'repair' ? repairSelectedPack : undefined) : openLibrary,
    },
    {
      id: 'route',
      label: 'Launch route',
      title: selectedRoute.label,
      detail: routeReadiness.detail,
      status: routeReadiness.status,
      actionLabel: routeReadiness.status === 'healthy' || routeReadiness.status === 'operational' ? undefined : 'Diagnostics',
      action: routeReadiness.status === 'healthy' || routeReadiness.status === 'operational' ? undefined : openDiagnostics,
    },
    {
      id: 'backup',
      label: 'Backup',
      title: selectedProfile.installPath ? 'World backup available' : 'Install first',
      detail: selectedProfile.installPath ? 'Create a save backup before major updates.' : 'Backups are available after the pack has an install folder.',
      status: selectedProfile.installPath ? 'operational' : 'warning',
      actionLabel: 'Backup',
      action: handleBackup,
    },
    {
      id: 'server',
      label: 'Community',
      title: `${officialServerTitle} ${officialRuntimeLabel}`,
      detail: `${officialPlayerText} players / updated ${formatOfficialServerUpdatedAt(officialStatus)}`,
      status: officialRuntimeState === 'online' ? 'operational' : officialRuntimeState === 'unavailable' ? 'critical' : 'warning',
      actionLabel: 'Chat',
      action: openOfficialServerChat,
    },
  ]

  return (
    <>
      <div className="grid h-full min-h-0 gap-3 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_360px] xl:overflow-hidden">
        <section className="min-h-0 space-y-3 xl:overflow-y-auto">
          <GlassCard className="space-y-5 p-5" tone="cyan">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-soft">Home</p>
                <h1 className="mt-1 text-3xl font-semibold text-white">Can I play?</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Select a modpack. ECHO derives the launch route from that pack and keeps the main action focused on getting you in.
                </p>
              </div>
              <StatusChip label={cockpitStatus} status={cockpitStatusTone} />
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
              <label className="min-w-0 space-y-2" htmlFor="home-pack-select">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Select modpack</span>
                <select
                  className="h-12 w-full rounded-lg border border-cyan-echo/25 bg-black/35 px-3 text-sm font-semibold text-white outline-none transition focus:border-cyan-echo focus:ring-2 focus:ring-cyan-echo/20"
                  id="home-pack-select"
                  onChange={(event) => setSelectedProfileId(event.target.value)}
                  value={selectedProfile.id}
                >
                  {profiles.map((profile) => (
                    <option className="bg-slate-950 text-white" key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Selected pack</p>
                <p className="mt-2 truncate text-base font-semibold text-white" title={selectedProfile.name}>
                  {selectedProfile.name}
                </p>
                <p className="mt-1 truncate text-xs text-slate-400" title={selectedProfile.version}>
                  Installed {selectedProfile.version}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Primary action</p>
                  <p className="mt-1 text-sm leading-5 text-slate-300" title={primaryActionDetail}>
                    {primaryActionDetail}
                  </p>
                </div>
                <CyberButton
                  className="w-full shrink-0 sm:w-auto"
                  disabled={primaryDisabled}
                  icon={primaryButtonIcon}
                  onClick={() => void handlePrimaryAction()}
                  size="lg"
                  variant={primaryButtonVariant}
                >
                  {primaryBusy ? homeActions.primaryBusyLabel : homeActions.primaryActionLabel}
                </CyberButton>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
              <section className="min-w-0 rounded-lg border border-cyan-echo/20 bg-cyan-echo/[0.045] p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-echo/25 bg-black/35 text-cyan-soft">
                    <RouteIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Launch route</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">{selectedRoute.label}</h2>
                    <p className="mt-2 text-sm leading-5 text-slate-300">{selectedRoute.detail}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {selectedRoute.steps.map((step, index) => (
                    <RouteStep index={index} key={step} label={step} />
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Readiness</p>
                    <h2 className="mt-1 truncate text-base font-semibold text-white">{visibleStage}</h2>
                  </div>
                  <span className="font-mono text-xs text-slate-300">{Math.round(visibleProgress)}%</span>
                </div>
                <div className="mt-3">
                  <ProgressBar tone={progressTone} value={visibleProgress} />
                </div>
                <p className="mt-3 line-clamp-4 text-xs leading-5 text-slate-300" title={visibleDetail}>
                  {visibleDetail}
                </p>
              </section>
            </div>
          </GlassCard>
        </section>

        <aside className="min-h-0 space-y-3 xl:overflow-y-auto">
          <GlassCard className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-soft">Blockers first</p>
                <h2 className="mt-1 text-lg font-semibold text-white">What needs attention</h2>
              </div>
              <StatusChip compact label={officialRuntimeLabel} status={officialRuntimeState === 'online' ? 'operational' : officialRuntimeState === 'unavailable' ? 'critical' : 'warning'} />
            </div>
            <div className="space-y-2">
              {blockerItems.map((item) => (
                <BlockerRow item={item} key={item.id} />
              ))}
            </div>
          </GlassCard>

          <GlassCard className="grid gap-2 p-3">
            <CyberButton icon={MessageSquare} onClick={openOfficialServerChat} size="sm" variant="secondary">
              Community
            </CyberButton>
            <CyberButton icon={ShieldAlert} onClick={openDiagnostics} size="sm" variant={packOsBlocked ? 'warning' : 'secondary'}>
              Diagnostics
            </CyberButton>
            <CyberButton icon={Archive} onClick={() => void handleBackup()} size="sm" variant="warning">
              Backup
            </CyberButton>
          </GlassCard>
        </aside>
      </div>

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
              <CyberButton icon={Archive} onClick={() => void handleBackup()} variant="secondary">
                Backup World
              </CyberButton>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function RouteStep({ index, label }: { index: number; label: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="font-mono text-[10px] font-bold text-cyan-soft">{String(index + 1).padStart(2, '0')}</p>
      <p className="mt-1 text-xs font-semibold leading-4 text-white">{label}</p>
    </div>
  )
}

function BlockerRow({ item }: { item: HomeBlockerItem }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-soft">{item.label}</p>
          <p className="mt-1 text-sm font-semibold text-white" title={item.title}>
            {item.title}
          </p>
        </div>
        <StatusChip compact status={item.status} />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400" title={item.detail}>
        {item.detail}
      </p>
      {item.action && item.actionLabel ? (
        <div className="mt-3">
          <CyberButton onClick={() => void item.action?.()} size="sm" variant="ghost">
            {item.actionLabel}
          </CyberButton>
        </div>
      ) : null}
    </div>
  )
}
