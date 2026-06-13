import { Bell, ChevronDown, Cloud, DownloadCloud, Settings, ShieldCheck } from 'lucide-react'
import echoLogo from '../../assets/brand/echo-logo.webp'
import { useDownloadStore } from '../../stores/downloadStore'
import { useLauncherStore } from '../../stores/launcherStore'
import { useLauncherUpdateStore } from '../../stores/launcherUpdateStore'
import { useProfileStore } from '../../stores/profileStore'
import { useReadinessStore } from '../../stores/readinessStore'
import { defaultLaunchState, useLaunchStore } from '../../stores/launchStore'
import { launcherUpdateHealthStatus, launcherUpdatePrimaryDetail, launcherUpdateVisibleInTopBar } from '../../utils/launcherUpdateState'
import { CyberButton } from '../cyber/CyberButton'
import { StatusChip } from '../cyber/StatusChip'
import { getPageLabel } from './navigation'

export function TopBar() {
  const activePage = useLauncherStore((state) => state.activePage)
  const desktopBackend = useLauncherStore((state) => state.desktopBackend)
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const addToast = useLauncherStore((state) => state.addToast)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const profiles = useProfileStore((state) => state.profiles)
  const downloads = useDownloadStore((state) => state.downloads)
  const launcherUpdate = useLauncherUpdateStore((state) => state.state)
  const launchState = useLaunchStore((state) => state.launchState) ?? defaultLaunchState
  const readiness = useReadinessStore((state) => state.readiness)
  const readinessLoading = useReadinessStore((state) => state.loading)
  const refreshReadiness = useReadinessStore((state) => state.refreshReadiness)
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0]
  const activeDownloads = downloads.filter((download) => download.status === 'downloading').length
  const warningCount = readiness?.warnings.length ?? 0

  return (
    <header className="z-30 flex h-18 shrink-0 items-center justify-between border-b border-cyan-echo/15 bg-black/18 px-4 py-2">
      <div className="flex min-w-0 items-center gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase text-cyan-soft">Active Pack</p>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-white 2xl:text-2xl">{activePage === 'home' ? selectedProfile.name : getPageLabel(activePage)}</h1>
            <button
              aria-label="Change active pack"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-echo/20 bg-cyan-echo/10 text-cyan-soft hover:bg-cyan-echo/20"
              onClick={() => addToast('Active pack', `${selectedProfile.name} is selected for Minecraft Launcher handoff.`, 'info')}
              type="button"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 2xl:gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-cyan-echo/20 bg-cyan-echo/[0.055] px-3 py-2 text-sm text-slate-200 xl:flex">
          <ShieldCheck className="h-4 w-4 text-success-echo" aria-hidden="true" />
          <span>{selectedProfile.name}</span>
          <span className="text-slate-500">/</span>
          <span className="text-cyan-soft">Handoff</span>
        </div>
        {launchState.active ? <StatusChip label="Minecraft Running" status="downloading" /> : null}
        {launcherUpdate && launcherUpdateVisibleInTopBar(launcherUpdate.status) ? (
          <button
            aria-label="Launcher update status"
            className="hidden items-center gap-2 rounded-full border border-cyan-echo/30 bg-cyan-echo/10 px-2.5 py-1 text-xs font-semibold text-cyan-soft hover:bg-cyan-echo/20 2xl:flex"
            onClick={() => addToast('Launcher update', launcherUpdatePrimaryDetail(launcherUpdate), launcherUpdate.status === 'failed' ? 'danger' : 'info')}
            type="button"
          >
            <DownloadCloud className="h-3.5 w-3.5" aria-hidden="true" />
            <StatusChip compact label={launcherUpdate.status === 'downloading' ? `${Math.round(launcherUpdate.progress)}%` : undefined} status={launcherUpdateHealthStatus(launcherUpdate.status)} />
          </button>
        ) : null}
        <StatusChip
          label={desktopBackend === 'connected' ? 'Desktop Connected' : 'Browser Preview'}
          status={desktopBackend === 'connected' ? 'operational' : 'warning'}
        />
        <button
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-soft/20 bg-white/5 text-slate-300 hover:bg-white/10 2xl:h-10 2xl:w-10"
          onClick={() =>
            addToast(
              warningCount ? `${warningCount} launcher alert${warningCount === 1 ? '' : 's'}` : 'No new launcher alerts',
              warningCount ? readiness?.warnings.slice(0, 3).join(' ') : activeDownloads > 0 ? `${activeDownloads} download active.` : 'All queues are clear.',
              warningCount ? 'warning' : 'info',
            )
          }
          type="button"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {activeDownloads > 0 || warningCount > 0 ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cyan-echo" /> : null}
        </button>
        <CyberButton
          icon={Cloud}
          onClick={async () => {
            const next = await refreshReadiness(selectedProfile.id)
            if (!next) {
              addToast('Readiness unavailable', 'Native filesystem actions are available in the desktop app.', 'warning')
              return
            }
            addToast(
              next.ok ? 'Launcher ready' : 'Launcher needs attention',
              next.ok ? `${next.profile.name} is installed and release metadata is available.` : next.warnings.slice(0, 3).join(' '),
              next.ok ? 'success' : 'warning',
            )
          }}
          size="sm"
          variant="ghost"
        >
          {readinessLoading ? 'Checking...' : 'Sync'}
        </CyberButton>
        <button
          aria-label="Open settings"
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-cyan-echo/20 bg-white/[0.045] text-slate-300 hover:bg-cyan-echo/10 hover:text-white 2xl:flex 2xl:h-10 2xl:w-10"
          onClick={() => setActivePage('settings')}
          type="button"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="hidden h-10 w-10 overflow-hidden rounded-lg border border-cyan-echo/35 bg-black shadow-cyber xl:block">
          <img alt="" className="h-full w-full object-cover" src={echoLogo} />
        </div>
      </div>
    </header>
  )
}
