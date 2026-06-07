import { bundledAssetManifest } from '../data/bundledManifests'
import { invokeNative, requireNative } from './nativeBridge'

export class AssetValidator {
  async checkMissingAssets(moduleId: string, installPath?: string) {
    requireNative()
    if (installPath) {
      const result = await invokeNative('asset:validate', {
        installPath,
        moduleId,
        expected: bundledAssetManifest.sounds,
      })
      return {
        moduleId,
        expectedSounds: result.expected,
        missingSounds: result.missing,
        missingTextures: [],
        missingLangFiles: [],
        missingModels: [],
      }
    }
    return {
      moduleId,
      expectedSounds: bundledAssetManifest.sounds.length,
      missingSounds: [],
      missingTextures: [],
      missingLangFiles: [],
      missingModels: [],
    }
  }
}

export const assetValidator = new AssetValidator()
