import { invokeNative, requireNative } from './nativeBridge'

export interface HashResult {
  path: string
  expected: string
  actual: string
  valid: boolean
}

export class HashVerifier {
  async verifyFileHash(path: string, expected: string): Promise<HashResult> {
    requireNative()
    const result = await invokeNative('manifest:verify', {})
    const file = result.results.find((item) => item.path === path)
    if (file) {
      return {
        path,
        expected,
        actual: file.actual ?? '',
        valid: file.status === 'valid',
      }
    }
    return { path, expected, actual: '', valid: false }
  }

  async detectMissingOrCorruptFiles() {
    requireNative()
    const result = await invokeNative('manifest:verify', {})
    return { missing: result.missing, corrupt: result.corrupt }
  }
}

export const hashVerifier = new HashVerifier()
