import {
  AlertTriangle,
  DownloadCloud,
  Gamepad2,
  Monitor,
  RefreshCcw,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { installService } from '../../services/InstallService'
import { launchService } from '../../services/LaunchService'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { repairService } from '../../services/RepairService'
import { useLauncherStore } from '../../stores/launcherStore'
import { usePackStateStore } from '../../stores/packStateStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReadinessStore } from '../../stores/readinessStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useStandaloneRuntimeStore } from '../../stores/standaloneRuntimeStore'
import type { NativePackPrimaryActionKind, NativePackState } from '../../types/native'

export const packActionIcons: Record<NativePackPrimaryActionKind, LucideIcon> = {
  play: Gamepad2,
  'launch-standalone': Monitor,
  install: DownloadCloud,
  update: RefreshCcw,
  repair: Wrench,
  diagnostics: ShieldAlert,
  unavailable: AlertTriangle,
}

interface PackActionOptions {
  onProgress?: (progress: number) => void
  onStage?: (stage: string) => void
  afterRefresh?: (profileId: string) => Promise<void> | void
}

export function usePackActions() {
  const addToast = useLauncherStore((state) => state.addToast)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const setActiveToolsTab = useLauncherStore((state) => state.setActiveToolsTab)
  const setSelectedProfileId = useLauncherStore((state) => state.setSelectedProfileId)
  const setProfiles = useProfileStore((state) => state.setProfiles)
  const ramGb = useSettingsStore((state) => state.ramGb)
  const refreshReadiness = useReadinessStore((state) => state.refreshReadiness)
  const refreshPackState = usePackStateStore((state) => state.refreshPackState)
  const launchStandaloneRuntime = useStandaloneRuntimeStore((state) => state.launchStandalone)
  const [busyPackId, setBusyPackId] = useState<string | null>(null)

  const refreshProfilesAndPack = useCallback(
    async (profileId: string) => {
      const [profiles] = await Promise.all([
        invokeNative('profile:list').catch(() => null),
        refreshPackState(profileId),
        refreshReadiness(profileId),
      ])
      if (profiles) setProfiles(profiles)
    },
    [refreshPackState, refreshReadiness, setProfiles],
  )

  const openDiagnostics = useCallback(
    (profileId: string) => {
      setSelectedProfileId(profileId)
      setActiveToolsTab('diagnostics')
      setActivePage('tools')
    },
    [setActivePage, setActiveToolsTab, setSelectedProfileId],
  )

  const runPackAction = useCallback(
    async (packState: NativePackState, options: PackActionOptions = {}) => {
      const { profile, primaryAction } = packState
      setSelectedProfileId(profile.id)
      options.onStage?.(primaryAction.label)
      options.onProgress?.(8)

      if (primaryAction.kind === 'diagnostics') {
        openDiagnostics(profile.id)
        return
      }
      if (primaryAction.kind === 'unavailable') {
        addToast('Pack unavailable', primaryAction.reason || packState.blockers[0]?.detail, 'warning')
        return
      }
      if (!isNativeAvailable()) {
        addToast('Desktop app required', 'Pack actions require the ECHO desktop app.', 'warning')
        return
      }

      setBusyPackId(profile.id)
      try {
        if (primaryAction.kind === 'install' || primaryAction.kind === 'update') {
          const operationId = launchService.createOperationId(primaryAction.kind)
          options.onStage?.(primaryAction.kind === 'install' ? `Installing ${profile.name}` : `Updating ${profile.name}`)
          const result = await installService.runInstall({
            profileId: profile.id,
            installPath: profile.installPath,
            channel: profile.channel,
            version: packState.catalog.release?.version,
            operationId,
            refresh: true,
          })
          options.onProgress?.(result.ok ? 100 : 96)
          addToast(
            result.ok ? `${profile.name} ready` : `${profile.name} install needs attention`,
            result.ok ? `Verified ${result.after.valid.length} files.` : `${result.after.missing.length} missing and ${result.after.corrupt.length} corrupt files remain.`,
            result.ok ? 'success' : 'danger',
          )
        } else if (primaryAction.kind === 'repair') {
          if (!packState.install.manifestPath) {
            addToast('Repair unavailable', 'This pack does not have a valid manifest to repair from.', 'warning')
            return
          }
          options.onStage?.(`Repairing ${profile.name}`)
          const result = await repairService.runRepair({
            profileId: profile.id,
            installPath: profile.installPath,
            manifestPath: packState.install.manifestPath,
            channel: profile.channel,
          })
          options.onProgress?.(result.ok ? 100 : 96)
          const next = await refreshPackState(profile.id)
          addToast(
            result.ok && next?.ok ? `${profile.name} repaired` : 'Files repaired, launch still needs attention',
            result.ok && next?.ok ? 'The pack is ready to play.' : next?.blockers[0]?.detail ?? `${result.after.missing.length} missing and ${result.after.corrupt.length} corrupt files remain.`,
            result.ok && next?.ok ? 'success' : 'warning',
          )
        } else if (primaryAction.kind === 'launch-standalone') {
          options.onStage?.(`Launching ${profile.name}`)
          const result = await launchStandaloneRuntime({ profileId: profile.id })
          options.onProgress?.(result?.ok ? 100 : 96)
          addToast(
            result?.ok ? `${profile.name} launched` : 'Standalone launch failed',
            result?.message ?? 'Standalone launch did not return a result.',
            result?.ok ? 'success' : 'danger',
          )
        } else {
          const operationId = launchService.createOperationId('handoff')
          options.onStage?.(`Preparing ${profile.name}`)
          const result = await launchService.prepareHandoff(
            profile.id,
            profile.installPath,
            ramGb,
            true,
            operationId,
            'allow',
            packState.route.mode === 'native-loader-minecraft' ? 'native-loader-minecraft' : 'neoforge-minecraft',
          )
          options.onProgress?.(result.ok ? 100 : 96)
          addToast(result.ok ? 'Minecraft Launcher ready' : `${profile.name} needs attention`, result.message, result.ok ? 'success' : 'danger')
        }

        await refreshProfilesAndPack(profile.id)
        await options.afterRefresh?.(profile.id)
      } catch (error) {
        options.onProgress?.(96)
        addToast(`${profile.name} action failed`, error instanceof Error ? error.message : 'The selected action failed.', 'danger')
      } finally {
        setBusyPackId(null)
      }
    },
    [addToast, launchStandaloneRuntime, openDiagnostics, ramGb, refreshPackState, refreshProfilesAndPack, setSelectedProfileId],
  )

  return {
    busyPackId,
    openDiagnostics,
    runPackAction,
  }
}
