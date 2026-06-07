import { staticDependencyWarnings } from '../data/bundledAddons'
import type { AddonModule, DependencyWarning } from '../types/addons'

export class AddonResolver {
  getRequiredModules(addons: AddonModule[]) {
    return addons.filter((addon) => addon.requirement === 'required').map((addon) => addon.id)
  }

  getRecommendedModules(addons: AddonModule[]) {
    return addons.filter((addon) => addon.requirement === 'recommended').map((addon) => addon.id)
  }

  getDependencyWarnings(addons: AddonModule[], enabledAddonIds: string[]): DependencyWarning[] {
    const enabled = new Set(enabledAddonIds)
    const addonById = new Map(addons.map((addon) => [addon.id, addon]))
    const warnings: DependencyWarning[] = []

    for (const addon of addons) {
      if (!enabled.has(addon.id)) continue

      const missingRequired = addon.dependencies.filter((dependency) => !enabled.has(dependency))
      if (missingRequired.length > 0) {
        warnings.push({
          id: `${addon.id}-missing-required`,
          title: `${addon.name} dependency missing`,
          affectedModule: addon.name,
          detail: `${addon.name} requires ${missingRequired.map((id) => addonById.get(id)?.name ?? id).join(', ')}.`,
          severity: 'critical',
        })
      }

      const missingRecommended = addon.recommendedWith.filter((dependency) => !enabled.has(dependency))
      if (missingRecommended.length > 0) {
        warnings.push({
          id: `${addon.id}-missing-recommended`,
          title: `${addon.name} integration reduced`,
          affectedModule: addon.name,
          detail: `${addon.name} works best with ${missingRecommended.map((id) => addonById.get(id)?.name ?? id).join(', ')} enabled.`,
          severity: 'warning',
        })
      }
    }

    for (const warning of staticDependencyWarnings) {
      const source = addons.find((addon) => addon.name === warning.affectedModule)
      if (source && enabled.has(source.id) && !warnings.some((item) => item.affectedModule === warning.affectedModule)) {
        warnings.push(warning)
      }
    }

    return warnings
  }

  getAffectedByDependency(addons: AddonModule[], dependencyId: string) {
    return addons.filter((addon) => addon.dependencies.includes(dependencyId)).map((addon) => addon.name)
  }
}

export const addonResolver = new AddonResolver()
