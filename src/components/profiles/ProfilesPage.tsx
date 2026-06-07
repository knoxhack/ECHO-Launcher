import { AlertTriangle, CheckCircle2, Play, Save } from 'lucide-react'
import { bundledAddons } from '../../data/bundledAddons'
import { addonResolver } from '../../services/AddonResolver'
import { invokeNative, isNativeAvailable } from '../../services/nativeBridge'
import { useAddonStore } from '../../stores/addonStore'
import { useLauncherStore } from '../../stores/launcherStore'
import { useProfileStore } from '../../stores/profileStore'
import type { AddonCategory } from '../../types/addons'
import { useState } from 'react'
import { AddonToggleCard } from '../cyber/AddonToggleCard'
import { CyberButton } from '../cyber/CyberButton'
import { GlassCard } from '../cyber/GlassCard'
import { ProfileCard } from '../cyber/ProfileCard'
import { SectionHeader } from '../cyber/SectionHeader'
import { StatusChip } from '../cyber/StatusChip'

const addonCategories: AddonCategory[] = ['Foundation', 'Player Interface', 'Gameplay', 'Expansion Chapters']

export function ProfilesPage() {
  const profiles = useProfileStore((state) => state.profiles)
  const updateProfile = useProfileStore((state) => state.updateProfile)
  const selectedProfileId = useLauncherStore((state) => state.selectedProfileId)
  const setSelectedProfileId = useLauncherStore((state) => state.setSelectedProfileId)
  const setActivePage = useLauncherStore((state) => state.setActivePage)
  const addToast = useLauncherStore((state) => state.addToast)
  const enabledAddonIds = useAddonStore((state) => state.enabledAddonIds)
  const toggleAddon = useAddonStore((state) => state.toggleAddon)
  const [savingLoadout, setSavingLoadout] = useState(false)
  const warnings = addonResolver.getDependencyWarnings(bundledAddons, enabledAddonIds)
  const enabledCount = enabledAddonIds.length
  const profile = profiles.find((item) => item.id === selectedProfileId) ?? profiles[0]

  const handlePlay = (profileId = profile.id) => {
    setSelectedProfileId(profileId)
    setActivePage('home')
    const selected = profiles.find((item) => item.id === profileId) ?? profile
    addToast(`${selected.name} selected`, 'Use Home to install, verify, and launch this beta runtime path.', 'info')
  }

  const handleOpenFolder = async (installPath?: string) => {
    if (!installPath) {
      addToast('Install folder not set', 'Select an install folder for Ashfall first.', 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Opening folders requires the desktop app.', 'warning')
      return
    }
    await invokeNative('shell:open-path', { path: installPath })
  }

  const handleSelectFolder = async (targetProfile = profile) => {
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Selecting local folders requires the desktop app.', 'warning')
      return
    }
    const result = await invokeNative('dialog:select-directory', {
      title: `Select install folder for ${targetProfile.name}`,
      defaultPath: targetProfile.installPath,
    })
    if (result.canceled || !result.path) return
    const updated = { ...targetProfile, installPath: result.path }
    updateProfile(updated)
    await invokeNative('profile:save', updated)
    addToast('Install folder saved', result.path, 'success')
  }

  const saveLoadout = async () => {
    if (!profile) {
      addToast('Ashfall profile unavailable', 'The Ashfall profile has not loaded yet.', 'warning')
      return
    }
    if (!isNativeAvailable()) {
      addToast('Desktop app required', 'Loadouts are written to the installed Ashfall folder by the desktop app.', 'warning')
      return
    }
    setSavingLoadout(true)
    try {
      const result = await invokeNative('profile:apply-loadout', {
        profileId: profile.id,
        installPath: profile.installPath,
        enabledAddons: enabledAddonIds,
      })
      updateProfile(result.profile)
      addToast(
        result.ok ? 'Ashfall loadout saved' : 'Loadout saved with warnings',
        `${result.loadoutPath} (${result.enabledAddons.length} enabled, ${result.disabledAddons.length} disabled)`,
        result.warnings.length ? 'warning' : 'success',
      )
    } catch (error) {
      addToast('Loadout save failed', error instanceof Error ? error.message : 'Unable to write Ashfall loadout.', 'danger')
    } finally {
      setSavingLoadout(false)
    }
  }

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-soft">Ashfall Loadout</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">One Pack Configuration</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Beta testers get isolated Ashfall profiles for NeoForge, Native Loader, and Standalone Runtime validation.
            </p>
          </div>
          <StatusChip label={`${enabledCount} modules enabled`} status="operational" />
        </div>
      </GlassCard>

      <section>
        <SectionHeader eyebrow="Profiles" title="Ashfall Beta Runtime Profiles" />
        <div className="grid gap-4 xl:grid-cols-3">
          {profiles.map((item) => (
            <ProfileCard
              key={item.id}
              onManage={() => addToast('Ashfall profile', `${item.name} is isolated for beta runtime testing.`, 'info')}
              onOpenFolder={() => void handleOpenFolder(item.installPath)}
              onPlay={() => handlePlay(item.id)}
              onSelectFolder={() => {
                setSelectedProfileId(item.id)
                void handleSelectFolder(item)
              }}
              profile={item}
              selected={item.id === selectedProfileId}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          {addonCategories.map((category) => (
            <div key={category}>
              <SectionHeader eyebrow="Addon Manager" title={category} />
              <div className="grid gap-4 xl:grid-cols-2">
                {bundledAddons
                  .filter((addon) => addon.category === category)
                  .map((addon) => (
                    <AddonToggleCard
                      addon={addon}
                      affectedModules={addonResolver.getAffectedByDependency(bundledAddons, addon.id)}
                      enabled={enabledAddonIds.includes(addon.id)}
                      key={addon.id}
                      onToggle={() => {
                        toggleAddon(addon.id)
                        addToast(addon.locked ? 'Module locked' : 'Addon state updated', addon.name, addon.locked ? 'warning' : 'info')
                      }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </section>

        <aside className="space-y-4">
          <GlassCard tone={warnings.some((warning) => warning.severity === 'critical') ? 'danger' : 'amber'}>
            <SectionHeader eyebrow="Dependency Warnings" title="Live Resolver" />
            <div className="space-y-3">
              {warnings.length === 0 ? (
                <div className="flex items-center gap-3 rounded-lg border border-success-echo/30 bg-success-echo/10 p-3 text-sm text-success-echo">
                  <CheckCircle2 className="h-4 w-4" />
                  Dependencies are aligned.
                </div>
              ) : (
                warnings.slice(0, 6).map((warning) => (
                  <div
                    className="rounded-lg border border-amber-echo/40 bg-amber-echo/10 p-3 text-sm text-amber-echo"
                    key={warning.id}
                  >
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      {warning.title}
                    </div>
                    <p className="leading-5">{warning.detail}</p>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHeader eyebrow="Actions" title="Ashfall Commands" />
            <div className="grid gap-2">
              <CyberButton icon={Play} onClick={() => handlePlay()} variant="primary">
                Go To Play
              </CyberButton>
              <CyberButton disabled={savingLoadout} icon={Save} onClick={() => void saveLoadout()}>
                Save Loadout
              </CyberButton>
            </div>
          </GlassCard>
        </aside>
      </div>
    </div>
  )
}
