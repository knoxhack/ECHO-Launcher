export interface AccountState {
  linked: boolean
  displayName: string
  provider: 'minecraft_launcher'
  username?: string
  uuid?: string
  expiresAt?: string
  canRefresh: boolean
  authConfigured: boolean
  warning?: string
}
