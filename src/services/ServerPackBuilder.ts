import type { ServerExportPlan } from '../types/server'
import { invokeNative, requireNative } from './nativeBridge'

export interface ServerPackOptions {
  profileId: string
  includeConfigs: boolean
  includeDatapacks: boolean
  includeWorldBackup: boolean
  exportStartupScripts: boolean
}

export class ServerPackBuilder {
  estimateSize(options: ServerPackOptions) {
    let size = 612
    if (options.includeConfigs) size += 12
    if (options.includeDatapacks) size += 84
    if (options.includeWorldBackup) size += 940
    return size
  }

  createExportPlan(options: ServerPackOptions): ServerExportPlan {
    return {
      profileId: options.profileId,
      estimatedSizeMb: this.estimateSize(options),
      requiredJava: 'Java 25+',
      neoforgeVersion: '26.1.2.43-beta',
      files: [
        'server/mods',
        'server/config',
        'server/defaultconfigs',
        options.exportStartupScripts ? 'start.bat' : 'README.md',
        options.exportStartupScripts ? 'start.sh' : 'manifest.json',
      ],
      warnings: [
        'Client-only modules will be excluded.',
        'Worldgen update warning should be reviewed before exporting existing worlds.',
      ],
    }
  }

  async generateServerPack(options: ServerPackOptions) {
    requireNative()
    return invokeNative('server:generate', {
      profileId: options.profileId,
      includeConfigs: options.includeConfigs,
      includeDatapacks: options.includeDatapacks,
      includeWorldBackup: options.includeWorldBackup,
    })
  }
}

export const serverPackBuilder = new ServerPackBuilder()
