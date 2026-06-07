import { invokeNative, requireNative } from './nativeBridge'

export interface JavaRuntime {
  path: string
  version: string
  vendor: string
  valid: boolean
  warning?: string
}

export class JavaRuntimeService {
  async detectJava(): Promise<JavaRuntime> {
    requireNative()
    const detection = await invokeNative('java:detect')
    const preferred = detection.preferred
    if (preferred) {
      return {
        path: preferred.path,
        version: preferred.version,
        vendor: preferred.vendor,
        valid: preferred.valid,
        warning: preferred.warning,
      }
    }
    return {
      path: '',
      version: 'not found',
      vendor: 'No Java runtime detected',
      valid: false,
      warning: 'Install Java 25+ before launching Ashfall.',
    }
  }

  validateVersion(version: string) {
    const major = Number.parseInt(version.split('.')[0] ?? '0', 10)
    return {
      valid: major >= 25,
      message: major >= 25 ? 'Java runtime validated.' : 'Java 25+ is recommended for this profile.',
    }
  }
}

export const javaRuntimeService = new JavaRuntimeService()
