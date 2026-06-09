import type { LauncherDesktopSettings } from '../types/releases'
import type { OfficialServerStatusFallback } from '../types/serverStatus'

export const OFFICIAL_SERVER_STATUS_URL =
  import.meta.env.VITE_ECHO_OFFICIAL_SERVER_STATUS_URL?.trim() || 'https://api.echoplatform.dev/status.json'

const LEGACY_OFFICIAL_SERVER_STATUS_URLS = new Set([
  'http://64.74.111.235:16363/status.json',
  'http://64.74.111.235:16363/status.json/',
])

export const officialServerSettingsDefaults = {
  officialServerName: 'Ashfall Official',
  officialServerStatusUrl: OFFICIAL_SERVER_STATUS_URL,
  officialDiscordInviteUrl: '',
  officialStatusPollSeconds: 30,
} satisfies Pick<
  LauncherDesktopSettings,
  'officialServerName' | 'officialServerStatusUrl' | 'officialDiscordInviteUrl' | 'officialStatusPollSeconds'
>

export type OfficialServerSettingsPatch = typeof officialServerSettingsDefaults

export function normalizeOfficialServerSettings(
  input: Partial<OfficialServerSettingsPatch> = {},
  options: { migrateLegacyDefaults?: boolean } = {},
): OfficialServerSettingsPatch {
  const pollSeconds = Number(input.officialStatusPollSeconds)
  const rawStatusUrl = String(input.officialServerStatusUrl ?? '').trim() || officialServerSettingsDefaults.officialServerStatusUrl
  return {
    officialServerName: String(input.officialServerName ?? '').trim() || officialServerSettingsDefaults.officialServerName,
    officialServerStatusUrl:
      options.migrateLegacyDefaults && LEGACY_OFFICIAL_SERVER_STATUS_URLS.has(rawStatusUrl)
        ? officialServerSettingsDefaults.officialServerStatusUrl
        : rawStatusUrl,
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
