import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Bell,
  Flag,
  Hash,
  Loader2,
  Pin,
  RadioTower,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { releaseService } from '../../services/ReleaseService'
import { isNativeAvailable } from '../../services/nativeBridge'
import { useCommunityChatStore } from '../../stores/communityChatStore'
import { useLauncherStore } from '../../stores/launcherStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { CommunityChatChannel, CommunityChatMember, CommunityChatMessage, CommunityChatRole } from '../../types/communityChat'
import { canModerateCommunityChat, normalizeNickname } from '../../utils/communityChat'
import { cn } from '../../utils/cn'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { StatusChip } from '../cyber/StatusChip'

export function ChatPage() {
  const addToast = useLauncherStore((state) => state.addToast)
  const settings = useSettingsStore()
  const setDesktopSettings = useSettingsStore((state) => state.setDesktopSettings)
  const setCommunitySettings = useSettingsStore((state) => state.setCommunitySettings)
  const {
    activeChannelId,
    groups,
    channels,
    members,
    messagesByChannel,
    hasMoreByChannel,
    loading,
    loadingOlder,
    sending,
    connection,
    error,
    clientId,
    nickname,
    role,
    rules,
    bridge,
    refreshOfficialChat,
    setActiveChannel,
    loadOlderMessages,
    sendMessage,
    hideMessage,
    reportMessage,
  } = useCommunityChatStore()
  const [draft, setDraft] = useState('')
  const [nicknameDraft, setNicknameDraft] = useState(settings.chatNickname)
  const parentRef = useRef<HTMLDivElement>(null)
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? channels[0]
  const messages = activeChannel ? messagesByChannel[activeChannel.id] ?? [] : []
  const activeMembers = useMemo(
    () => members.filter((member) => !activeChannel || !member.channelId || member.channelId === activeChannel.id).slice(0, 32),
    [activeChannel, members],
  )
  const lastMessageId = messages.at(-1)?.id
  // eslint-disable-next-line react-hooks/incompatible-library -- Virtualization is the chat page's primary anti-lag guardrail.
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 14,
  })
  const canPost = Boolean(activeChannel && !activeChannel.readOnly && nickname)
  const moderator = canModerateCommunityChat(role)

  useEffect(() => {
    setNicknameDraft(settings.chatNickname)
  }, [settings.chatNickname])

  useEffect(() => {
    void refreshOfficialChat(false)
  }, [refreshOfficialChat])

  useEffect(() => {
    if (!lastMessageId || loadingOlder) return
    rowVirtualizer.scrollToIndex(Math.max(0, messages.length - 1), { align: 'end' })
  }, [activeChannelId, lastMessageId, loadingOlder, messages.length, rowVirtualizer])

  const handleScroll = () => {
    const element = parentRef.current
    if (!element || element.scrollTop > 90 || loadingOlder || !activeChannel || !hasMoreByChannel[activeChannel.id]) return
    void loadOlderMessages(settings.communityApiUrl)
  }

  const saveNickname = async () => {
    const chatNickname = normalizeNickname(nicknameDraft)
    if (!chatNickname) {
      addToast('Nickname required', 'Choose a launcher nickname before posting.', 'warning')
      return
    }
    try {
      setCommunitySettings({ chatNickname })
      if (isNativeAvailable()) {
        const saved = await releaseService.saveSettings({ chatNickname })
        setDesktopSettings(saved)
      }
      addToast('Chat nickname saved', chatNickname, 'success')
    } catch (saveError) {
      addToast('Nickname save failed', saveError instanceof Error ? saveError.message : 'Unable to save chat nickname.', 'danger')
    }
  }

  const submitMessage = async () => {
    const body = draft.trim()
    if (!body || !activeChannel || !canPost) return
    setDraft('')
    await sendMessage(settings.communityApiUrl, body)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_300px] gap-3 overflow-hidden">
      <GlassCard className="flex min-h-0 flex-col p-0">
        <div className="shrink-0 border-b border-cyan-echo/15 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-cyan-soft">ECHO Community</p>
              <h2 className="truncate text-lg font-semibold text-white">Launcher Chat</h2>
            </div>
            <ConnectionBadge state={connection} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {groups.map((group) => (
            <div className="mb-5" key={group.id}>
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{group.label}</p>
              <div className="space-y-1">
                {group.channelIds.map((channelId) => {
                  const channel = channels.find((item) => item.id === channelId)
                  if (!channel) return null
                  return (
                    <ChannelButton
                      active={channel.id === activeChannel?.id}
                      channel={channel}
                      key={channel.id}
                      onClick={() => setActiveChannel(channel.id)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="flex min-h-0 flex-col p-0" tone={activeChannel?.kind === 'minecraft_server' ? 'cyan' : 'default'}>
        <div className="shrink-0 border-b border-cyan-echo/15 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {activeChannel?.kind === 'minecraft_server' ? <RadioTower className="h-4 w-4 text-cyan-soft" /> : <Hash className="h-4 w-4 text-slate-400" />}
                <h2 className="truncate text-lg font-semibold text-white">{activeChannel?.name ?? 'community'}</h2>
              </div>
              <p className="mt-1 truncate text-xs text-slate-400">{activeChannel?.description ?? 'Loading community channels.'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activeChannel?.readOnly ? <StatusChip compact label="Read only" status="warning" /> : null}
              {activeChannel?.kind === 'minecraft_server' ? <StatusChip compact label="Bridge" status="operational" /> : null}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-300">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-soft" />
              Loading chat
            </div>
          ) : (
            <div className="h-full overflow-y-auto px-3 py-2" onScroll={handleScroll} ref={parentRef}>
              {loadingOlder ? (
                <div className="mb-2 flex items-center justify-center rounded-lg border border-cyan-echo/15 bg-black/20 py-2 text-xs text-cyan-soft">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading history
                </div>
              ) : null}
              <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const message = messages[virtualRow.index]
                  if (!message) return null
                  return (
                    <div
                      className="absolute left-0 top-0 w-full"
                      data-index={virtualRow.index}
                      key={message.id}
                      ref={rowVirtualizer.measureElement}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <MessageRow
                        canModerate={moderator}
                        message={message}
                        onHide={hideMessage}
                        onReport={reportMessage}
                        selfId={clientId}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-cyan-echo/15 p-3">
          {!nickname ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-echo/30 bg-amber-echo/10 p-2">
              <input
                className="h-9 min-w-[220px] flex-1 rounded-lg border border-amber-echo/30 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-echo"
                maxLength={32}
                onChange={(event) => setNicknameDraft(event.target.value)}
                placeholder="Launcher nickname"
                value={nicknameDraft}
              />
              <CyberButton onClick={() => void saveNickname()} size="sm" variant="warning">
                Save
              </CyberButton>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              className="max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 py-2 text-sm leading-5 text-white outline-none focus:border-cyan-echo disabled:opacity-60"
              disabled={!activeChannel || activeChannel.readOnly || !nickname}
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submitMessage()
                }
              }}
              placeholder={activeChannel?.readOnly ? 'Read-only channel' : nickname ? `Message #${activeChannel?.name ?? 'community'}` : 'Save a nickname to post'}
              value={draft}
            />
            <button
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-cyan-echo/30 bg-cyan-echo text-slate-950 transition hover:bg-cyan-soft disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!draft.trim() || !canPost || sending}
              onClick={() => void submitMessage()}
              type="button"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-amber-echo">{error}</p> : null}
        </div>
      </GlassCard>

      <GlassCard className="flex min-h-0 flex-col p-0">
        <div className="shrink-0 border-b border-cyan-echo/15 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-cyan-soft">Presence</p>
              <h2 className="text-lg font-semibold text-white">{activeMembers.length} Online</h2>
            </div>
            <Users className="h-5 w-5 text-cyan-soft" />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          <div className="rounded-lg border border-cyan-echo/15 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-success-echo" />
              Moderation
            </div>
            <div className="grid gap-2 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <span>Slow mode</span>
                <span className="font-mono text-cyan-soft">{activeChannel?.slowModeSeconds ?? 5}s</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Your role</span>
                <span className="font-mono text-cyan-soft">{role}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-cyan-echo/15 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Pin className="h-4 w-4 text-amber-echo" />
              Rules
            </div>
            <div className="space-y-2">
              {rules.map((rule) => (
                <p className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs leading-5 text-slate-300" key={rule}>
                  {rule}
                </p>
              ))}
            </div>
          </div>

          {bridge.map((item) => (
            <div className="rounded-lg border border-cyan-echo/20 bg-cyan-echo/[0.055] p-3" key={item.channelId}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{item.label}</p>
                  <p className="text-xs text-slate-400">Minecraft bridge</p>
                </div>
                <StatusChip compact label={item.connected ? 'Live' : 'Offline'} status={item.connected ? 'operational' : 'warning'} />
              </div>
            </div>
          ))}

          <div className="space-y-2">
            {activeMembers.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

function ChannelButton({ active, channel, onClick }: { active: boolean; channel: CommunityChatChannel; onClick: () => void }) {
  const Icon = channel.kind === 'minecraft_server' ? RadioTower : channel.kind === 'announcement' ? Bell : Hash
  return (
    <button
      className={cn(
        'flex h-10 w-full items-center gap-2 rounded-lg border px-2 text-left text-sm transition',
        active
          ? 'border-cyan-echo/45 bg-cyan-echo/15 text-white'
          : 'border-transparent text-slate-400 hover:border-cyan-echo/20 hover:bg-white/[0.045] hover:text-white',
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
      {channel.unreadCount > 0 ? (
        <span className="rounded-full bg-amber-echo px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{channel.unreadCount}</span>
      ) : null}
    </button>
  )
}

const MessageRow = memo(function MessageRow({
  canModerate,
  message,
  onHide,
  onReport,
  selfId,
}: {
  canModerate: boolean
  message: CommunityChatMessage
  onHide: (messageId: string) => void
  onReport: (messageId: string) => void
  selfId: string
}) {
  const ownMessage = message.author.id === selfId
  const sourceClass = sourceTone(message.source)
  return (
    <div className={cn('group flex gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.035]', message.hidden && 'opacity-55')}>
      <div className={cn('mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold uppercase', sourceClass)}>
        {initials(message.author.displayName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white">{message.author.displayName}</span>
          <RoleBadge role={message.author.role} />
          <SourceBadge source={message.source} />
          {message.pending ? <span className="font-mono text-[10px] uppercase text-cyan-soft">Sending</span> : null}
          {message.failed ? <span className="font-mono text-[10px] uppercase text-danger-echo">Failed</span> : null}
          <span className="text-[10px] text-slate-500">{formatTime(message.createdAt)}</span>
        </div>
        <p className={cn('mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200', message.hidden && 'italic text-slate-500')}>
          {message.hidden ? 'Message hidden by moderation.' : message.body}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          aria-label="Report message"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-echo/15 bg-black/30 text-slate-300 hover:text-amber-echo"
          onClick={() => onReport(message.id)}
          title="Report"
          type="button"
        >
          <Flag className="h-3.5 w-3.5" />
        </button>
        {canModerate && !ownMessage ? (
          <button
            aria-label="Hide message"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-danger-echo/25 bg-danger-echo/10 text-red-100 hover:bg-danger-echo/20"
            onClick={() => onHide(message.id)}
            title="Hide"
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  )
})

function MemberRow({ member }: { member: CommunityChatMember }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2">
      <span className={cn('h-2 w-2 rounded-full', member.status === 'online' ? 'bg-success-echo' : member.status === 'idle' ? 'bg-amber-echo' : 'bg-slate-600')} />
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-echo/15 bg-cyan-echo/10 text-[10px] font-bold uppercase text-cyan-soft">
        {initials(member.displayName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-200">{member.displayName}</p>
        <p className="text-[10px] uppercase text-slate-500">{member.source}</p>
      </div>
    </div>
  )
}

function ConnectionBadge({ state }: { state: string }) {
  const status = state === 'connected' ? 'operational' : state === 'error' ? 'warning' : 'queued'
  const label = state === 'connected' ? 'Connected' : state === 'offline' ? 'Preview' : state === 'error' ? 'Unavailable' : state
  return <StatusChip compact label={label} status={status} />
}

function RoleBadge({ role }: { role: CommunityChatRole }) {
  if (role === 'member' || role === 'guest') return null
  return <span className="rounded-full border border-cyan-echo/20 bg-cyan-echo/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-cyan-soft">{role}</span>
}

function SourceBadge({ source }: { source: CommunityChatMessage['source'] }) {
  const label = source === 'android' ? 'Android' : source === 'minecraft' ? 'Minecraft' : source === 'discord' ? 'Discord' : source === 'system' ? 'System' : 'Launcher'
  return <span className={cn('font-mono text-[10px] uppercase', sourceTextClass(source))}>{label}</span>
}

function sourceTone(source: CommunityChatMessage['source']) {
  if (source === 'minecraft') return 'border-success-echo/35 bg-success-echo/10 text-success-echo'
  if (source === 'discord') return 'border-indigo-300/35 bg-indigo-500/10 text-indigo-200'
  if (source === 'android') return 'border-lime-300/35 bg-lime-500/10 text-lime-200'
  if (source === 'system') return 'border-amber-echo/35 bg-amber-echo/10 text-amber-echo'
  return 'border-cyan-echo/20 bg-cyan-echo/10 text-cyan-soft'
}

function sourceTextClass(source: CommunityChatMessage['source']) {
  if (source === 'minecraft') return 'text-success-echo'
  if (source === 'discord') return 'text-indigo-200'
  if (source === 'android') return 'text-lime-200'
  if (source === 'system') return 'text-amber-echo'
  return 'text-cyan-soft'
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? 'E') + (parts[1]?.[0] ?? '')
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
