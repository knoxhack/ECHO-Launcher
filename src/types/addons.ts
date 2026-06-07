import type { HealthStatus } from './launcher'

export type AddonCategory =
  | 'Foundation'
  | 'Player Interface'
  | 'Gameplay'
  | 'Expansion Chapters'

export type AddonRequirement = 'required' | 'recommended' | 'optional'

export interface AddonModule {
  id: string
  name: string
  category: AddonCategory
  version: string
  latestVersion: string
  requirement: AddonRequirement
  status: HealthStatus
  defaultEnabled: boolean
  locked: boolean
  dependencies: string[]
  recommendedWith: string[]
  notes: string
}

export interface BuildPreset {
  id: string
  name: string
  description: string
  addonIds: string[]
}

export interface DependencyWarning {
  id: string
  title: string
  affectedModule: string
  detail: string
  severity: 'warning' | 'critical'
}
