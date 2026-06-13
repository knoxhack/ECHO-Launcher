import { Archive, Cpu, FileJson, FolderOpen, PackageCheck, Server, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useLauncherStore } from '../../stores/launcherStore'
import { useProfileStore } from '../../stores/profileStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { ServerPlanResult } from '../../types/native'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { MetricCard } from '../cyber/MetricCard'
import { ProgressBar } from '../cyber/ProgressBar'
import { SectionHeader } from '../cyber/SectionHeader'
import { ToggleRow } from '../cyber/ToggleRow'
import { WarningCard } from '../cyber/WarningCard'

export function ServerPackPage() {
  const profiles = useProfileStore((state) => state.profiles)
  const addToast = useLauncherStore((state) => state.addToast)
  const serverPackActive = useSettingsStore((state) => state.serverPackActive)
  const serverPackProgress = useSettingsStore((state) => state.serverPackProgress)
  const startServerPack = useSettingsStore((state) => state.startServerPack)
  const tickServerPack = useSettingsStore((state) => state.tickServerPack)
  const [profileId] = useState('ashfall-native-edition')
  const [plan, setPlan] = useState<ServerPlanResult | null>(null)
  const [latestOutput, setLatestOutput] = useState<string | null>(null)
  const [options, setOptions] = useState({
    includeConfigs: true,
    includeDatapacks: true,
    includeWorldBackup: false,
  })
  const profile = profiles.find((item) => item.id === profileId) ?? profiles[0]

  useEffect(() => {
    if (!isNativeAvailable()) return
    invokeNative('server:plan', {
      profileId,
      includeConfigs: options.includeConfigs,
      includeDatapacks: options.includeDatapacks,
      includeWorldBackup: options.includeWorldBackup,
      installPath: profile.installPath,
    })
      .then(setPlan)
      .catch((error: unknown) => addToast('Server plan unavailable', error instanceof Error ? error.message : 'Unable to build server export plan.', 'warning'))
  }, [addToast, options.includeConfigs, options.includeDatapacks, options.includeWorldBackup, profile.installPath, profileId])

  useEffect(() => {
    if (!serverPackActive) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') tickServerPack()
    }, 420)
    return () => window.clearInterval(timer)
  }, [serverPackActive, tickServerPack])

  useEffect(() => {
    if (serverPackProgress === 100) {
      addToast('Server pack generated', 'Output staged in the ECHO exports folder.', 'success')
    }
  }, [addToast, serverPackProgress])

  const updateOption = (key: keyof typeof options, value: boolean) => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const generateServerPack = async () => {
    startServerPack()
    try {
      const result = await invokeNative('server:generate', {
        profileId,
        installPath: profile.installPath,
        outputDir: plan?.outputDirectory,
        includeConfigs: options.includeConfigs,
        includeDatapacks: options.includeDatapacks,
        includeWorldBackup: options.includeWorldBackup,
      })
      setLatestOutput(result.outputDirectory)
      addToast(
        result.ok ? 'Server pack generated' : 'Server pack requires desktop app',
        result.ok ? result.outputDirectory : result.warnings.join(' '),
        result.ok ? 'success' : 'warning',
      )
    } catch (error) {
      addToast('Server pack generation failed', error instanceof Error ? error.message : 'Unable to export server pack.', 'danger')
    }
  }

  const openOutput = async () => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Opening local folders requires npm run desktop.', 'warning')
      return
    }
    const outputPath = latestOutput ?? plan?.outputDirectory
    if (!outputPath) {
      addToast('Output unavailable', 'Generate or load a server plan before opening the output folder.', 'warning')
      return
    }
    await invokeNative('shell:open-path', { path: outputPath })
  }

  return (
    <div className="space-y-6">
      <GlassCard tone="cyan">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-soft">Server Pack Generator</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Ashfall Multiplayer Export</h2>
          </div>
          <CyberButton icon={Server} onClick={() => void generateServerPack()} variant="primary">
            Generate Server Pack
          </CyberButton>
        </div>
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <GlassCard>
            <SectionHeader eyebrow="Profile" title="Ashfall Server Export" />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                <span className="text-sm font-semibold text-white">Profile</span>
                <select
                  className="mt-2 h-11 w-full rounded-lg border border-cyan-soft/20 bg-slate-950 px-3 text-sm text-white"
                  disabled
                  value={profileId}
                >
                  <option value="ashfall-native-edition">Ashfall Native Edition / {profile.version}</option>
                </select>
              </label>
              <div className="rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Output Directory</p>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-300">{latestOutput ?? plan?.outputDirectory ?? 'Load the server export plan first.'}</p>
                <CyberButton className="mt-3" icon={FolderOpen} onClick={() => void openOutput()} size="sm">
                  Open Output Folder
                </CyberButton>
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHeader eyebrow="Export Contents" title="Server Pack Options" />
            <div className="grid gap-3 md:grid-cols-2">
              <ToggleRow checked={options.includeConfigs} label="Include configs" onCheckedChange={(value) => updateOption('includeConfigs', value)} />
              <ToggleRow checked={options.includeDatapacks} label="Include datapacks" onCheckedChange={(value) => updateOption('includeDatapacks', value)} />
              <ToggleRow checked={options.includeWorldBackup} label="Include world backup optional" onCheckedChange={(value) => updateOption('includeWorldBackup', value)} />
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Server-safe mod files, a server manifest, README, and start scripts are generated from the installed Ashfall manifest.
            </p>
          </GlassCard>

          <GlassCard tone="cyan">
            <SectionHeader eyebrow="Export Plan" title="Generated Files" />
            <div className="grid gap-3 md:grid-cols-2">
              {(plan?.files ?? []).map((file) => (
                <div className="flex items-center gap-3 rounded-lg border border-cyan-soft/20 bg-white/[0.03] p-3" key={file}>
                  <FileJson className="h-4 w-4 text-cyan-soft" />
                  <span className="text-sm text-white">{file}</span>
                </div>
              ))}
            </div>
            {serverPackActive || serverPackProgress > 0 ? (
              <div className="mt-5">
                <ProgressBar label="Generating server pack" value={serverPackProgress} />
              </div>
            ) : null}
          </GlassCard>
        </div>

        <aside className="space-y-6">
          <GlassCard>
            <SectionHeader eyebrow="Selected Profile" title={profile.name} />
            <div className="grid grid-cols-2 gap-3">
              <MetricCard icon={PackageCheck} label="Version" value={profile.version} />
              <MetricCard icon={Cpu} label="Required Java" value={plan?.requiredJava ?? 'unknown'} />
              <MetricCard icon={Server} label="NeoForge" value={plan?.neoforgeVersion ?? profile.neoforge} />
              <MetricCard icon={Archive} label="Estimated Size" value={`${plan?.estimatedSizeMb ?? 0} MB`} tone="amber" />
            </div>
          </GlassCard>

          <WarningCard
            actions={
              <CyberButton icon={Archive} onClick={() => updateOption('includeWorldBackup', true)} size="sm">
                Include Backup
              </CyberButton>
            }
            text="Existing worlds should be backed up before export, and client compatibility should be pinned to the installed Ashfall manifest."
            title="Server Export Warnings"
          />

          <GlassCard tone="amber">
            <SectionHeader eyebrow="Warnings" title="Export Notes" />
            <div className="space-y-3">
              {(plan?.warnings ?? []).map((warning) => (
                <div className="flex gap-3 rounded-lg border border-amber-echo/40 bg-amber-echo/10 p-3 text-sm text-amber-echo" key={warning}>
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </aside>
      </div>
    </div>
  )
}
