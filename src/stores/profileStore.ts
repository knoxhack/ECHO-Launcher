import { create } from 'zustand'
import { bundledProfiles } from '../data/bundledProfiles'
import type { LauncherProfile } from '../types/profiles'
import { normalizeAshfallProfiles } from '../utils/ashfallProfileMigration'

interface ProfileStore {
  profiles: LauncherProfile[]
  setProfiles: (profiles: LauncherProfile[]) => void
  updateProfile: (profile: LauncherProfile) => void
  duplicateProfile: (profileId: string) => void
}

export const useProfileStore = create<ProfileStore>()((set) => ({
  profiles: normalizeAshfallProfiles(bundledProfiles, bundledProfiles),
  setProfiles: (profiles) => set({ profiles: normalizeAshfallProfiles(profiles, bundledProfiles) }),
  updateProfile: (profile) =>
    set((state) => ({
      profiles: normalizeAshfallProfiles(
        state.profiles.map((item) => (item.id === profile.id ? profile : item)),
        bundledProfiles,
      ),
    })),
  duplicateProfile: () =>
    set((state) => {
      return { profiles: normalizeAshfallProfiles(state.profiles, bundledProfiles) }
    }),
}))
