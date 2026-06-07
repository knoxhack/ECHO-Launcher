import { create } from 'zustand'
import type { AccountState } from '../types/auth'

interface AccountStore {
  account: AccountState
  setAccount: (account: AccountState) => void
}

export const defaultAccountState: AccountState = {
  linked: true,
  displayName: 'Minecraft Launcher',
  provider: 'minecraft_launcher',
  username: 'Minecraft Launcher',
  uuid: '00000000000000000000000000000000',
  canRefresh: false,
  authConfigured: false,
  warning: 'Microsoft login is delegated to the official Minecraft Launcher.',
}

export const useAccountStore = create<AccountStore>()((set) => ({
  account: defaultAccountState,
  setAccount: (account) => set({ account }),
}))
