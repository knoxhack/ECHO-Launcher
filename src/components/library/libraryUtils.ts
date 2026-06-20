import type { OfficialModpack, OfficialModpackFamily } from '../../data/officialModpacks'
import type { HealthStatus } from '../../types/launcher'
import type { NativePackState } from '../../types/native'
import type { LauncherRuntimeModeId } from '../../types/standaloneRuntime'

export type LibraryFamilyFilter = 'all' | OfficialModpack['familyId']
export type LibraryRuntimeFilter = 'all' | LauncherRuntimeModeId
export type LibraryStateFilter = 'all' | 'ready' | 'needs-attention' | 'available'

export interface LibraryFilters {
  query: string
  family: LibraryFamilyFilter
  runtime: LibraryRuntimeFilter
  state: LibraryStateFilter
}

export interface LibraryPackStatus {
  label: string
  status: HealthStatus
  detail: string
}

export interface LibraryFamilyGroup {
  family: OfficialModpackFamily
  packs: OfficialModpack[]
}

const runtimeOrder: LauncherRuntimeModeId[] = ['native-loader-minecraft', 'neoforge-minecraft', 'standalone-engine', 'native-runtime']

export function libraryPackStatus(packState?: NativePackState): LibraryPackStatus {
  if (!packState) return { label: 'Checking', status: 'queued', detail: 'Reading exact pack state from the desktop backend.' }
  if (packState.ok) return { label: 'Ready', status: 'healthy', detail: 'Files, manifest, route, and launch policy are ready.' }
  if (packState.localManifest.status === 'invalid') {
    return { label: 'Invalid Manifest', status: 'critical', detail: packState.localManifest.message }
  }
  if (!packState.catalog.ok && !packState.install.installed) {
    return {
      label: 'Unavailable',
      status: packState.blockers[0]?.status ?? 'warning',
      detail: packState.primaryAction.reason || packState.catalog.diagnostic || packState.blockers[0]?.detail || 'Catalog metadata is not currently installable.',
    }
  }
  return {
    label: packState.blockers[0]?.title ?? 'Needs Attention',
    status: packState.blockers[0]?.status ?? 'warning',
    detail: packState.blockers[0]?.detail ?? packState.primaryAction.reason ?? 'Pack state is incomplete.',
  }
}

export function groupLibraryPacks(packs: OfficialModpack[]): LibraryFamilyGroup[] {
  const groups = new Map<OfficialModpack['familyId'], LibraryFamilyGroup>()
  for (const pack of packs) {
    const existing = groups.get(pack.familyId)
    const group = existing ?? {
      family: {
        id: pack.familyId,
        name: pack.familyName,
        order: pack.familyOrder,
        artwork: pack.familyArtwork,
        summary: pack.summary,
      },
      packs: [],
    }
    group.packs.push(pack)
    groups.set(pack.familyId, group)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      packs: [...group.packs].sort((a, b) => runtimeOrder.indexOf(a.runtimeMode ?? 'native-loader-minecraft') - runtimeOrder.indexOf(b.runtimeMode ?? 'native-loader-minecraft')),
    }))
    .sort((a, b) => a.family.order - b.family.order)
}

export function filterLibraryPacks(
  packs: OfficialModpack[],
  packStates: Record<string, NativePackState>,
  filters: LibraryFilters,
): OfficialModpack[] {
  const query = filters.query.trim().toLowerCase()
  return packs.filter((pack) => {
    if (filters.family !== 'all' && pack.familyId !== filters.family) return false
    if (filters.runtime !== 'all' && pack.runtimeMode !== filters.runtime) return false
    if (query && !`${pack.name} ${pack.familyName} ${pack.summary} ${pack.detail} ${pack.runtimeLaneLabel}`.toLowerCase().includes(query)) return false

    const packState = packStates[pack.id]
    if (filters.state === 'ready') return Boolean(packState?.ok)
    if (filters.state === 'needs-attention') return Boolean(packState && !packState.ok && packState.primaryAction.kind !== 'unavailable')
    if (filters.state === 'available') return pack.status === 'playable' && packState?.primaryAction.kind !== 'unavailable'
    return true
  })
}
