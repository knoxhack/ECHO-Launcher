import type { LauncherDesktopSettings } from '../types/releases'
import type { OfficialServerStatusFallback } from '../types/serverStatus'

export const officialServerSettingsDefaults = {
  officialServerName: 'Ashfall Official',
  officialServerStatusUrl: 'http://64.74.111.235:16363/status.json',
  officialDiscordInviteUrl: '',
  officialStatusPollSeconds: 30,
} satisfies Pick<
  LauncherDesktopSettings,
  'officialServerName' | 'officialServerStatusUrl' | 'officialDiscordInviteUrl' | 'officialStatusPollSeconds'
>

export type OfficialServerSettingsPatch = typeof officialServerSettingsDefaults

export function normalizeOfficialServerSettings(input: Partial<OfficialServerSettingsPatch> = {}): OfficialServerSettingsPatch {
  const pollSeconds = Number(input.officialStatusPollSeconds)
  return {
    officialServerName: String(input.officialServerName ?? '').trim() || officialServerSettingsDefaults.officialServerName,
    officialServerStatusUrl: String(input.officialServerStatusUrl ?? '').trim() || officialServerSettingsDefaults.officialServerStatusUrl,
    officialDiscordInviteUrl: String(input.officialDiscordInviteUrl ?? '').trim(),
    officialStatusPollSeconds: Math.max(
      10,
      Math.min(300, Number.isFinite(pollSeconds) ? Math.floor(pollSeconds) : officialServerSettingsDefaults.officialStatusPollSeconds),
    ),
  }
}

export function officialServerFallbackFromSettings(settings: Partial<OfficialServerSettingsPatch>): OfficialServerStatusFallback {
  const normalized = normalizeOfficialServerSettings(settings)
  return {
    serverName: normalized.officialServerName,
    discordInviteUrl: normalized.officialDiscordInviteUrl,
  }
}
