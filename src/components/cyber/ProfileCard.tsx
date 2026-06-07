import { FolderOpen, FolderPlus, Play, Settings } from 'lucide-react'
import type { LauncherProfile } from '../../types/profiles'
import { CyberButton } from './CyberButton'
import { StatusChip } from './StatusChip'

interface ProfileCardProps {
  profile: LauncherProfile
  selected?: boolean
  onPlay: () => void
  onManage: () => void
  onDuplicate?: () => void
  onOpenFolder?: () => void
  onSelectFolder?: () => void
}

export function ProfileCard({ profile, selected, onPlay, onManage, onDuplicate, onOpenFolder, onSelectFolder }: ProfileCardProps) {
  return (
    <div className="glass-surface rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{profile.name}</h3>
            {selected ? <span className="rounded-full bg-cyan-echo/20 px-2 py-0.5 text-xs text-cyan-soft">Selected</span> : null}
            <span className="rounded-full border border-cyan-soft/20 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
              Minecraft Launcher
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{profile.channelLabel}</p>
        </div>
        <StatusChip compact status={profile.status} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">Version</p>
          <p className="font-medium text-slate-100">{profile.version}</p>
        </div>
        <div>
          <p className="text-slate-500">Modules</p>
          <p className="font-medium text-slate-100">{profile.moduleCount}</p>
        </div>
        <div>
          <p className="text-slate-500">RAM</p>
          <p className="font-medium text-slate-100">{profile.ramGb} GB</p>
        </div>
        <div>
          <p className="text-slate-500">Last Played</p>
          <p className="font-medium text-slate-100">{profile.lastPlayed}</p>
        </div>
      </div>
      {profile.installPath ? (
        <div className="mt-4 rounded-lg border border-cyan-soft/20 bg-black/20 p-3">
          <p className="text-xs text-slate-500">Install Folder</p>
          <p className="mt-1 truncate font-mono text-xs text-slate-200" title={profile.installPath}>
            {profile.installPath}
          </p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <CyberButton icon={Play} onClick={onPlay} size="sm" variant="primary">
          Play
        </CyberButton>
        <CyberButton icon={Settings} onClick={onManage} size="sm">
          Manage
        </CyberButton>
        {onDuplicate ? (
          <CyberButton icon={Settings} onClick={onDuplicate} size="sm" variant="ghost">
            Duplicate
          </CyberButton>
        ) : null}
        {onOpenFolder ? (
          <CyberButton icon={FolderOpen} onClick={onOpenFolder} size="sm" variant="ghost">
            Open Folder
          </CyberButton>
        ) : null}
        {onSelectFolder ? (
          <CyberButton icon={FolderPlus} onClick={onSelectFolder} size="sm" variant="ghost">
            Set Folder
          </CyberButton>
        ) : null}
      </div>
    </div>
  )
}
