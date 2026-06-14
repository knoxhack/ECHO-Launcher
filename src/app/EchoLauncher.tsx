import { lazy, Suspense, useEffect, useMemo } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { AppShell } from '../components/shell/AppShell'
import { ToastHost } from '../components/cyber/ToastHost'
import { useLauncherStore } from '../stores/launcherStore'
import { useProfileStore } from '../stores/profileStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useReadinessStore } from '../stores/readinessStore'
import { usePackStateStore } from '../stores/packStateStore'
import { defaultAccountState, useAccountStore } from '../stores/accountStore'
import { defaultLaunchState, useLaunchStore } from '../stores/launchStore'
import { useReleaseStore } from '../stores/releaseStore'
import { useLauncherUpdateStore } from '../stores/launcherUpdateStore'
import { useCommunityChatStore } from '../stores/communityChatStore'
import { useServerStatusStore } from '../stores/serverStatusStore'
import { invokeNative, isNativeAvailable } from '../services/nativeBridge'
import { launcherUpdatePrimaryDetail } from '../utils/launcherUpdateState'
import { latestPlayableRelease, releaseAcceptedCount, releaseRejectedCount } from '../utils/releaseValidation'
import type { PageId } from '../types/launcher'
import { getVisibleNavItems } from '../components/shell/navigation'

type PageComponent = ComponentType | LazyExoticComponent<ComponentType>

const HomePage = lazy(() => import('../components/dashboard/HomePage').then((module) => ({ default: module.HomePage })))
const LibraryPage = lazy(() => import('../components/library/LibraryPage').then((module) => ({ default: module.LibraryPage })))
const CommunityPage = lazy(() => import('../components/community/CommunityPage').then((module) => ({ default: module.CommunityPage })))
const SettingsPage = lazy(() => import('../components/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const ToolsPage = lazy(() => import('../components/tools/ToolsPage').then((module) => ({ default: module.ToolsPage })))
const WebLauncherUpdateExporter = lazy(() => import('../components/shell/WebLauncherUpdateExporter').then((module) => ({ default: module.WebLauncherUpdateExporter })))

const pages: Record<PageId, PageComponent> = {
  home: HomePage,
  library: LibraryPage,
  community: CommunityPage,
  tools: ToolsPage,
  settings: SettingsPage,
}

export function EchoLauncher() {
  const launcherPreview =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('launcher-preview')
  const activePage = useLauncherStore((state) => state.activePage)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const addToast = useLauncherStore((state) => state.addToast)
  const desktopBackend = useLauncherStore((state) => state.desktopBackend)
  const setDesktopBackend = useLauncherStore((state) => state.setDesktopBackend)
  const setLauncherVersion = useLauncherStore((state) => state.setLauncherVersion)
  const setProfiles = useProfileStore((state) => state.setProfiles)
  const setDesktopSettings = useSettingsStore((state) => state.setDesktopSettings)
  const advancedMode = useSettingsStore((state) => state.advancedMode)
  const creatorMode = useSettingsStore((state) => state.creatorMode)
  const communityApiUrl = useSettingsStore((state) => state.communityApiUrl)
  const communityWebSocketUrl = useSettingsStore((state) => state.communityWebSocketUrl)
  const chatNickname = useSettingsStore((state) => state.chatNickname)
  const officialServerName = useSettingsStore((state) => state.officialServerName)
  const officialStatus = useServerStatusStore((state) => state.status)
  const startOfficialChat = useCommunityChatStore((state) => state.startOfficialChat)
  const setAccount = useAccountStore((state) => state.setAccount)
  const setLaunchState = useLaunchStore((state) => state.setLaunchState)
  const setReleaseIndex = useReleaseStore((state) => state.setReleaseIndex)
  const loadReleases = useReleaseStore((state) => state.loadReleases)
  const launcherUpdate = useLauncherUpdateStore((state) => state.state)
  const setLauncherUpdate = useLauncherUpdateStore((state) => state.setState)
  const checkLauncherUpdate = useLauncherUpdateStore((state) => state.check)
  const refreshLauncherUpdate = useLauncherUpdateStore((state) => state.refresh)
  const refreshReadiness = useReadinessStore((state) => state.refreshReadiness)
  const refreshPackState = usePackStateStore((state) => state.refreshPackState)
  const visiblePages = useMemo(() => getVisibleNavItems({ advancedMode, creatorMode }).map((item) => item.id), [advancedMode, creatorMode])
  const officialPlayersKey = officialStatus?.players.join('\n') ?? ''
  const officialPlayers = useMemo(() => (officialPlayersKey ? officialPlayersKey.split('\n') : []), [officialPlayersKey])
  const renderedPage = visiblePages.includes(activePage) ? activePage : 'home'
  const Page = pages[renderedPage]

  useEffect(() => {
    if (!visiblePages.includes(activePage)) setActivePage('home')
  }, [activePage, setActivePage, visiblePages])

  useEffect(() => {
    if (desktopBackend === 'checking') return
    void startOfficialChat({
      communityApiUrl,
      communityWebSocketUrl,
      nickname: chatNickname,
      officialServerName,
      officialPlayers,
    })
  }, [chatNickname, communityApiUrl, communityWebSocketUrl, desktopBackend, officialPlayers, officialServerName, startOfficialChat])

  useEffect(() => {
    if (!isNativeAvailable()) {
      setDesktopBackend('browser-preview')
      return
    }

    let disposed = false
    let cancelStartupTasks: () => void = () => undefined

    invokeNative('app:get-bootstrap-state')
      .then((state) => {
        if (disposed) return
        setProfiles(state.profiles)
        setLauncherVersion(state.version)
        setDesktopSettings(state.settings)
        setAccount(state.account ?? defaultAccountState)
        setLaunchState(state.launch ?? defaultLaunchState)
        setLauncherUpdate(state.launcherUpdate ?? null)
        setReleaseIndex(state.releaseIndex ?? null)
        setDesktopBackend('connected')
        const latestRelease = latestPlayableRelease(state.releaseIndex)
        const accepted = releaseAcceptedCount(state.releaseIndex)
        const rejected = releaseRejectedCount(state.releaseIndex)
        addToast(
          'Desktop backend connected',
          latestRelease
            ? `Approved release ${latestRelease.version} loaded from the ECHO Catalog.`
            : `Ashfall installs: ${state.paths.instances}. Catalog entries accepted: ${accepted}, diagnostics: ${rejected}.`,
          latestRelease ? 'success' : 'warning',
        )
        cancelStartupTasks = scheduleStartupTask(() => {
          if (disposed) return
          void loadReleases(true).catch(() => undefined)
          void checkLauncherUpdate().then((updateState) => {
            if (!disposed && updateState?.status === 'available') {
              addToast('Launcher update available', launcherUpdatePrimaryDetail(updateState), 'info')
            }
          })
          const selectedProfileId = useLauncherStore.getState().selectedProfileId
          void refreshReadiness(selectedProfileId)
          void refreshPackState(selectedProfileId)
        })
      })
      .catch((error: unknown) => {
        if (disposed) return
        setDesktopBackend('error')
        addToast('Desktop backend error', error instanceof Error ? error.message : 'Native initialization failed.', 'danger')
      })

    return () => {
      disposed = true
      cancelStartupTasks()
    }
  }, [addToast, checkLauncherUpdate, loadReleases, refreshPackState, refreshReadiness, setAccount, setDesktopBackend, setDesktopSettings, setLaunchState, setLauncherUpdate, setLauncherVersion, setProfiles, setReleaseIndex])

  useEffect(() => {
    if (!isNativeAvailable() || !launcherUpdate || !['checking', 'downloading'].includes(launcherUpdate.status)) return
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshLauncherUpdate()
    }, 1500)
    return () => window.clearInterval(id)
  }, [launcherUpdate, refreshLauncherUpdate])

  if (!isNativeAvailable() && !launcherPreview) {
    return (
      <>
        <Suspense fallback={<PageLoading />}>
          <WebLauncherUpdateExporter />
        </Suspense>
        <ToastHost />
      </>
    )
  }

  return (
    <>
      <AppShell>
        <Suspense fallback={<PageLoading />}>
          <div className="page-fade h-full min-h-0" key={renderedPage}>
            <Page />
          </div>
        </Suspense>
      </AppShell>
      <ToastHost />
    </>
  )
}

function scheduleStartupTask(task: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const target = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (target.requestIdleCallback && target.cancelIdleCallback) {
    const id = target.requestIdleCallback(() => task(), { timeout: 1800 })
    return () => target.cancelIdleCallback?.(id)
  }
  const id = target.setTimeout(task, 700)
  return () => target.clearTimeout(id)
}

function PageLoading() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-300">
      Loading panel...
    </div>
  )
}
