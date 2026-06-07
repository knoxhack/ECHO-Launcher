import { bundledReleaseManifest } from '../data/bundledManifests'

export class DiscordPostGenerator {
  createChangelogText(version = bundledReleaseManifest.version) {
    const notes = bundledReleaseManifest.notes.map((note) => `- ${note}`).join('\n')
    return `**Ashfall ${version} - Horizon**\n${notes}\n\nRun ECHO Launcher before updating and back up worlds with worldgen changes.`
  }

  createDiagnosticText(summary: string) {
    return `**ECHO Diagnostic Report**\n${summary}\nAttach latest.log and crash reports when opening support threads.`
  }
}

export const discordPostGenerator = new DiscordPostGenerator()
