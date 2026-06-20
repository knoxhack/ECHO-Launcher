import type { LaunchPreflightReport, LaunchRequest, LaunchProcessState, MinecraftLauncherDependencyStatus, MinecraftLauncherHandoffResult, MinecraftLauncherProfileStatus, MinecraftLaunchPlan } from '../types/launch'
import type { NativeHandoffPreparationResult, NativeLoaderAshfallLaunchResult, NativeLoaderAshfallStatus, NativeOperationStatus } from '../types/native'
import type { MinecraftRuntimeModeId } from '../types/standaloneRuntime'
import { invokeNative, requireNative } from './nativeBridge'

export type HandoffUpdatePolicy = 'allow' | 'skip'
type LaunchRequestOptions = Omit<LaunchRequest, 'profileId' | 'installPath' | 'ramGb'>

export class LaunchService {
  createOperationId(prefix = 'handoff'): string {
    const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    return `${prefix}-${random}`
  }

  private launchRequest(profileId: string, installPath?: string, ramGb?: number, options: LaunchRequestOptions = {}): LaunchRequest {
    return { ...options, profileId, installPath, ramGb }
  }

  async preflight(profileId: string, installPath?: string, ramGb?: number, options: LaunchRequestOptions = {}): Promise<LaunchPreflightReport> {
    requireNative()
    return invokeNative('launch:preflight', this.launchRequest(profileId, installPath, ramGb, options))
  }

  async buildCommand(profileId: string, installPath?: string, ramGb?: number, options: LaunchRequestOptions = {}): Promise<MinecraftLaunchPlan> {
    requireNative()
    return invokeNative('launch:build-command', this.launchRequest(profileId, installPath, ramGb, options))
  }

  async start(profileId: string, installPath?: string, ramGb?: number, options: LaunchRequestOptions = {}): Promise<LaunchProcessState> {
    requireNative()
    return invokeNative('launch:start', this.launchRequest(profileId, installPath, ramGb, options))
  }

  async stop(): Promise<LaunchProcessState> {
    requireNative()
    return invokeNative('launch:stop')
  }

  async readLog(): Promise<{ state: LaunchProcessState; log: string }> {
    requireNative()
    return invokeNative('launch:read-log')
  }

  async minecraftLauncherStatus(profileId: string, installPath?: string): Promise<MinecraftLauncherProfileStatus> {
    requireNative()
    return invokeNative('minecraft-launcher:status', { profileId, installPath })
  }

  async minecraftLauncherDependencyStatus(): Promise<MinecraftLauncherDependencyStatus> {
    requireNative()
    return invokeNative('minecraft-launcher:dependency-status')
  }

  async ensureMinecraftLauncherDependency(): Promise<MinecraftLauncherDependencyStatus> {
    requireNative()
    return invokeNative('minecraft-launcher:ensure-dependency')
  }

  async openMinecraftLauncher(ensure = true): Promise<MinecraftLauncherDependencyStatus & { opened: boolean; openedLauncher: boolean; method?: string; warnings?: string[] }> {
    requireNative()
    return invokeNative('minecraft-launcher:open', { ensure })
  }

  async getOperationStatus(operationId?: string): Promise<NativeOperationStatus> {
    requireNative()
    return invokeNative('operation:get-status', operationId ? { operationId } : undefined)
  }

  async nativeLoaderStatus(): Promise<NativeLoaderAshfallStatus> {
    requireNative()
    return invokeNative('native-loader:get-status')
  }

  async launchNativeLoaderAshfall(operationId?: string, profileId?: string): Promise<NativeLoaderAshfallLaunchResult> {
    requireNative()
    return invokeNative('native-loader:launch-ashfall', operationId || profileId ? { operationId, profileId } : undefined)
  }

  async prepareHandoff(
    profileId: string,
    installPath?: string,
    ramGb?: number,
    refreshRelease = true,
    operationId?: string,
    updatePolicy: HandoffUpdatePolicy = 'allow',
    runtimeMode?: MinecraftRuntimeModeId,
    prepareOnly = false,
  ): Promise<NativeHandoffPreparationResult> {
    requireNative()
    return invokeNative('launch:prepare-handoff', { profileId, installPath, ramGb, refreshRelease, operationId, updatePolicy, runtimeMode, prepareOnly })
  }

  async handoffToMinecraftLauncher(profileId: string, installPath?: string, ramGb?: number, runtimeMode?: MinecraftRuntimeModeId, prepareOnly = false, autoRepair = true): Promise<MinecraftLauncherHandoffResult> {
    requireNative()
    return invokeNative('minecraft-launcher:handoff', { profileId, installPath, ramGb, runtimeMode, prepareOnly, autoRepair })
  }
}

export const launchService = new LaunchService()
