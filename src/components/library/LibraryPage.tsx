import * as Tabs from '@radix-ui/react-tabs'
import { Boxes, DownloadCloud, Monitor, PackageOpen } from 'lucide-react'
import { useState } from 'react'
import { ModpacksPage } from '../dashboard/ModpacksPage'
import { DownloadsPage } from '../downloads/DownloadsPage'
import { ProfilesPage } from '../profiles/ProfilesPage'
import { StandaloneRuntimePage } from '../runtime/StandaloneRuntimePage'

type LibraryTabId = 'packs' | 'updates' | 'loadout' | 'runtime'

const libraryTabs = [
  { id: 'packs', label: 'Packs', icon: PackageOpen },
  { id: 'updates', label: 'Updates', icon: DownloadCloud },
  { id: 'loadout', label: 'Loadout', icon: Boxes },
  { id: 'runtime', label: 'Runtime', icon: Monitor },
] as const

export function LibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTabId>('packs')

  return (
    <Tabs.Root className="space-y-6" onValueChange={(value) => setActiveTab(value as LibraryTabId)} value={activeTab}>
      <Tabs.List className="glass-surface inline-flex flex-wrap rounded-xl p-1">
        {libraryTabs.map((tab) => {
          const Icon = tab.icon
          return (
            <Tabs.Trigger
              className="flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-slate-400 transition data-[state=active]:bg-cyan-echo/15 data-[state=active]:text-cyan-soft"
              key={tab.id}
              value={tab.id}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Tabs.Trigger>
          )
        })}
      </Tabs.List>

      <Tabs.Content className="space-y-6" value="packs">
        <ModpacksPage />
      </Tabs.Content>
      <Tabs.Content className="space-y-6" value="updates">
        <DownloadsPage />
      </Tabs.Content>
      <Tabs.Content className="space-y-6" value="loadout">
        <ProfilesPage />
      </Tabs.Content>
      <Tabs.Content className="space-y-6" value="runtime">
        <StandaloneRuntimePage />
      </Tabs.Content>
    </Tabs.Root>
  )
}
