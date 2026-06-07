import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Channel } from '../types/launcher'
import type { LaunchMode, LauncherDesktopSettings, PublisherSettings, ReleaseFeedConfig } from '../types/releases'
import {
  communityChatSettingsDefaults,
  communityChatUrlsFromStatusUrl,
  normalizeCommunityChatSettings,
  shouldFollowOfficialChatUrl,
} from '../utils/communityChat'
import { normalizeOfficialServerSettings, officialServerSettingsDefaults } from '../utils/officialServerSettings'

export type PerformancePreset = 'low' | 'balanced' | 'high' | 'cinematic'

interface SettingsStore {
  ramGb: number
  updateChannel: Channel
  performancePreset: PerformancePreset
  guideMode: boolean
  showHints: boolean
  interactiveTips: boolean
  shaderSupport: boolean
  entityCulling: boolean
  smoothLighting: boolean
  rainSnow: boolean
  thunderstorms: boolean
  volumetricFog: boolean
  weatherScreenEffects: boolean
  positionalAudio: boolean
  ambientSounds: boolean
  masterVolume: number
  serverPackProgress: number
  serverPackActive: boolean
  releaseFeed: ReleaseFeedConfig
  publisher: PublisherSettings
  supportGuideUrl: string
  launchMode: LaunchMode
  advancedMode: boolean
  creatorMode: boolean
  officialServerStatusUrl: string
  officialDiscordInviteUrl: string
  officialServerName: string
  officialStatusPollSeconds: number
  communityApiUrl: string
  communityWebSocketUrl: string
  chatNickname: string
  chatNotifications: boolean
  packOsReportRoot: string
  setRamGb: (ramGb: number) => void
  setUpdateChannel: (channel: Channel) => void
  setReleaseFeed: (releaseFeed: ReleaseFeedConfig) => void
  setPublisher: (publisher: PublisherSettings) => void
  setSupportGuideUrl: (supportGuideUrl: string) => void
  setAdvancedMode: (advancedMode: boolean) => void
  setCreatorMode: (creatorMode: boolean) => void
  setOfficialServerSettings: (settings: Partial<Pick<SettingsStore, 'officialServerStatusUrl' | 'officialDiscordInviteUrl' | 'officialServerName' | 'officialStatusPollSeconds'>>) => void
  setCommunitySettings: (settings: Partial<Pick<SettingsStore, 'communityApiUrl' | 'communityWebSocketUrl' | 'chatNickname' | 'chatNotifications'>>) => void
  setPackOsReportRoot: (packOsReportRoot: string) => void
  setDesktopSettings: (settings: LauncherDesktopSettings) => void
  applyPerformancePreset: (preset: PerformancePreset) => void
  setBooleanSetting: (key: BooleanSettingKey, value: boolean) => void
  setMasterVolume: (value: number) => void
  startServerPack: () => void
  tickServerPack: () => void
}

type BooleanSettingKey =
  | 'guideMode'
  | 'showHints'
  | 'interactiveTips'
  | 'shaderSupport'
  | 'entityCulling'
  | 'smoothLighting'
  | 'rainSnow'
  | 'thunderstorms'
  | 'volumetricFog'
  | 'weatherScreenEffects'
  | 'positionalAudio'
  | 'ambientSounds'

const presetSettings: Record<PerformancePreset, Partial<SettingsStore>> = {
  low: {
    shaderSupport: false,
    entityCulling: true,
    smoothLighting: false,
    rainSnow: true,
    thunderstorms: false,
    volumetricFog: false,
    weatherScreenEffects: false,
  },
  balanced: {
    shaderSupport: true,
    entityCulling: true,
    smoothLighting: true,
    rainSnow: true,
    thunderstorms: true,
    volumetricFog: false,
    weatherScreenEffects: true,
  },
  high: {
    shaderSupport: true,
    entityCulling: true,
    smoothLighting: true,
    rainSnow: true,
    thunderstorms: true,
    volumetricFog: true,
    weatherScreenEffects: true,
  },
  cinematic: {
    shaderSupport: true,
    entityCulling: false,
    smoothLighting: true,
    rainSnow: true,
    thunderstorms: true,
    volumetricFog: true,
    weatherScreenEffects: true,
  },
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ramGb: 8,
      updateChannel: 'alpha',
      performancePreset: 'balanced',
      guideMode: true,
      showHints: true,
      interactiveTips: true,
      shaderSupport: true,
      entityCulling: true,
      smoothLighting: true,
      rainSnow: true,
      thunderstorms: true,
      volumetricFog: false,
      weatherScreenEffects: true,
      positionalAudio: true,
      ambientSounds: true,
      masterVolume: 78,
      serverPackProgress: 0,
      serverPackActive: false,
      releaseFeed: {
        provider: 'github',
        owner: 'knoxhack',
        repo: 'ECHO-Native-Platform-Public-Alpha',
        includePrereleases: true,
      },
      publisher: {
        owner: 'knoxhack',
        repo: 'ECHO-Native-Platform-Public-Alpha',
        hasToken: false,
      },
      supportGuideUrl: '',
      launchMode: 'minecraft_launcher',
      advancedMode: false,
      creatorMode: false,
      packOsReportRoot: '',
      ...officialServerSettingsDefaults,
      ...communityChatSettingsDefaults,
      setRamGb: (ramGb) => set({ ramGb }),
      setUpdateChannel: (updateChannel) => set({ updateChannel }),
      setReleaseFeed: (releaseFeed) => set({ releaseFeed }),
      setPublisher: (publisher) => set({ publisher }),
      setSupportGuideUrl: (supportGuideUrl) => set({ supportGuideUrl }),
      setAdvancedMode: (advancedMode) => set({ advancedMode }),
      setCreatorMode: (creatorMode) => set({ creatorMode }),
      setOfficialServerSettings: (settings) =>
        set((state) => {
          const official = normalizeOfficialServerSettings(settings)
          const derived = communityChatUrlsFromStatusUrl(official.officialServerStatusUrl)
          const followOfficialApi = shouldFollowOfficialChatUrl(state.communityApiUrl, state.officialServerStatusUrl)
          const followOfficialSocket = shouldFollowOfficialChatUrl(state.communityWebSocketUrl, state.officialServerStatusUrl)
          return {
            ...official,
            ...normalizeCommunityChatSettings(
              {
                communityApiUrl: followOfficialApi ? derived.communityApiUrl : state.communityApiUrl,
                communityWebSocketUrl: followOfficialSocket ? derived.communityWebSocketUrl : state.communityWebSocketUrl,
                chatNickname: state.chatNickname,
                chatNotifications: state.chatNotifications,
              },
              official.officialServerStatusUrl,
            ),
          }
        }),
      setCommunitySettings: (settings) =>
        set((state) =>
          normalizeCommunityChatSettings({
            communityApiUrl: state.communityApiUrl,
            communityWebSocketUrl: state.communityWebSocketUrl,
            chatNickname: state.chatNickname,
            chatNotifications: state.chatNotifications,
            ...settings,
          }, state.officialServerStatusUrl),
        ),
      setPackOsReportRoot: (packOsReportRoot) => set({ packOsReportRoot }),
      setDesktopSettings: (settings) =>
        set(() => {
          const official = normalizeOfficialServerSettings(settings)
          return {
            releaseFeed: settings.releaseFeed,
            publisher: settings.publisher,
            supportGuideUrl: settings.supportGuideUrl,
            launchMode: settings.launchMode,
            advancedMode: settings.advancedMode,
            creatorMode: settings.creatorMode,
            packOsReportRoot: settings.packOsReportRoot ?? '',
            ...official,
            ...normalizeCommunityChatSettings(settings, official.officialServerStatusUrl, {
              migrateLegacyLocalDefaults: settings.communityChatPortMigrationVersion !== 1,
            }),
          }
        }),
      applyPerformancePreset: (performancePreset) =>
        set({
          performancePreset,
          ...presetSettings[performancePreset],
        }),
      setBooleanSetting: (key, value) => set({ [key]: value }),
      setMasterVolume: (masterVolume) => set({ masterVolume }),
      startServerPack: () => set({ serverPackProgress: 0, serverPackActive: true }),
      tickServerPack: () =>
        set((state) => {
          const serverPackProgress = Math.min(state.serverPackProgress + 7, 100)
          return { serverPackProgress, serverPackActive: serverPackProgress < 100 }
        }),
    }),
    {
      name: 'echo-settings-store',
      partialize: (state) => ({
        ramGb: state.ramGb,
        updateChannel: state.updateChannel,
        performancePreset: state.performancePreset,
        guideMode: state.guideMode,
        showHints: state.showHints,
        interactiveTips: state.interactiveTips,
        shaderSupport: state.shaderSupport,
        entityCulling: state.entityCulling,
        smoothLighting: state.smoothLighting,
        rainSnow: state.rainSnow,
        thunderstorms: state.thunderstorms,
        volumetricFog: state.volumetricFog,
        weatherScreenEffects: state.weatherScreenEffects,
        positionalAudio: state.positionalAudio,
        ambientSounds: state.ambientSounds,
        masterVolume: state.masterVolume,
        releaseFeed: state.releaseFeed,
        publisher: state.publisher,
        supportGuideUrl: state.supportGuideUrl,
        launchMode: state.launchMode,
        advancedMode: state.advancedMode,
        creatorMode: state.creatorMode,
        packOsReportRoot: state.packOsReportRoot,
        officialServerStatusUrl: state.officialServerStatusUrl,
        officialDiscordInviteUrl: state.officialDiscordInviteUrl,
        officialServerName: state.officialServerName,
        officialStatusPollSeconds: state.officialStatusPollSeconds,
        communityApiUrl: state.communityApiUrl,
        communityWebSocketUrl: state.communityWebSocketUrl,
        chatNickname: state.chatNickname,
        chatNotifications: state.chatNotifications,
      }),
    },
  ),
)
