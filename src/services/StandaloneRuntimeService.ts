import type {
  LauncherRuntimeModeId,
  StandaloneRuntimeLaunchPayload,
  StandaloneRuntimeLaunchResult,
  StandaloneRuntimeState,
} from '../types/standaloneRuntime'
import { invokeNative, requireNative } from './nativeBridge'

export class StandaloneRuntimeService {
  async getState(runtimeRoot?: string, mode: LauncherRuntimeModeId = 'native-runtime', profileId?: string): Promise<StandaloneRuntimeState> {
    requireNative()
    if (mode === 'standalone-engine') {
      return invokeNative('standalone-engine:get-state', {
        ...(runtimeRoot ? { installPath: runtimeRoot } : {}),
        ...(profileId ? { profileId } : {}),
      })
    }
    return invokeNative('standalone-runtime:get-state', runtimeRoot ? { runtimeRoot } : undefined)
  }

  async launch(payload: StandaloneRuntimeLaunchPayload = {}, mode: LauncherRuntimeModeId = 'native-runtime'): Promise<StandaloneRuntimeLaunchResult> {
    requireNative()
    if (mode === 'standalone-engine') {
      return invokeNative('standalone-engine:launch', payload)
    }
    return invokeNative('standalone-runtime:launch', payload)
  }
}

export const standaloneRuntimeService = new StandaloneRuntimeService()
