import type { LauncherProfile } from '../types/profiles'
import { invokeNative, requireNative } from './nativeBridge'

export class InstanceManager {
  async listInstances() {
    requireNative()
    return invokeNative('profile:list')
  }

  async createInstance(profile: LauncherProfile) {
    return { ...profile, id: `${profile.id}-${Date.now()}` }
  }

  async deleteInstance(instanceId: string) {
    return { ok: true, instanceId }
  }

  async duplicateInstance(profile: LauncherProfile) {
    requireNative()
    return invokeNative('profile:duplicate', { profileId: profile.id })
  }

  getInstallPath(instanceId: string) {
    return `C:\\Games\\ECHO\\Instances\\${instanceId}`
  }
}

export const instanceManager = new InstanceManager()
