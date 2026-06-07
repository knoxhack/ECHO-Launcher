import { invokeNative } from './nativeBridge'

export class LauncherUpdateService {
  getState() {
    return invokeNative('launcher-update:get-state')
  }

  check() {
    return invokeNative('launcher-update:check')
  }

  download() {
    return invokeNative('launcher-update:download')
  }

  install() {
    return invokeNative('launcher-update:install')
  }
}

export const launcherUpdateService = new LauncherUpdateService()
