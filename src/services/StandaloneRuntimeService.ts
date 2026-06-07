import type {
  StandaloneRuntimeLaunchPayload,
  StandaloneRuntimeLaunchResult,
  StandaloneRuntimeState,
} from '../types/standaloneRuntime'
import { invokeNative, requireNative } from './nativeBridge'

export class StandaloneRuntimeService {
  async getState(runtimeRoot?: string): Promise<StandaloneRuntimeState> {
    requireNative()
    return invokeNative('standalone-runtime:get-state', runtimeRoot ? { runtimeRoot } : undefined)
  }

  async launch(payload: StandaloneRuntimeLaunchPayload = {}): Promise<StandaloneRuntimeLaunchResult> {
    requireNative()
    return invokeNative('standalone-runtime:launch', payload)
  }
}

export const standaloneRuntimeService = new StandaloneRuntimeService()
