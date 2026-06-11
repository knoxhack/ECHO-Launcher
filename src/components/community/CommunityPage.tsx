import * as Tabs from '@radix-ui/react-tabs'
import { MessageSquare, Server } from 'lucide-react'
import { useState } from 'react'
import { ChatPage } from '../chat/ChatPage'
import { ServerPackPage } from '../server/ServerPackPage'

type CommunityTabId = 'chat' | 'servers'

const communityTabs = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'servers', label: 'Servers', icon: Server },
] as const

export function CommunityPage() {
  const [activeTab, setActiveTab] = useState<CommunityTabId>('chat')

  return (
    <Tabs.Root className="space-y-6" onValueChange={(value) => setActiveTab(value as CommunityTabId)} value={activeTab}>
      <Tabs.List className="glass-surface inline-flex rounded-xl p-1">
        {communityTabs.map((tab) => {
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

      <Tabs.Content className="space-y-6" value="chat">
        <ChatPage />
      </Tabs.Content>
      <Tabs.Content className="space-y-6" value="servers">
        <ServerPackPage />
      </Tabs.Content>
    </Tabs.Root>
  )
}
