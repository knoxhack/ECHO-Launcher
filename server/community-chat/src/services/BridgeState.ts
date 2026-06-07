export class BridgeState {
  private connectedCounts = new Map<string, number>()
  private sourceIds: string[] = []
  private sourceIdSet = new Set<string>()

  constructor(private maxSourceIds = 10_000) {}

  isConnected(serverId: string) {
    return (this.connectedCounts.get(serverId) ?? 0) > 0
  }

  connect(serverId: string) {
    const before = this.isConnected(serverId)
    this.connectedCounts.set(serverId, (this.connectedCounts.get(serverId) ?? 0) + 1)
    return this.isConnected(serverId) !== before
  }

  disconnect(serverId: string) {
    const before = this.isConnected(serverId)
    const next = Math.max(0, (this.connectedCounts.get(serverId) ?? 0) - 1)
    if (next > 0) this.connectedCounts.set(serverId, next)
    else this.connectedCounts.delete(serverId)
    return this.isConnected(serverId) !== before
  }

  rememberSourceId(serverId: string, sourceId: string) {
    const key = `${serverId}:${sourceId}`
    if (this.sourceIdSet.has(key)) return false
    this.sourceIdSet.add(key)
    this.sourceIds.push(key)
    while (this.sourceIds.length > this.maxSourceIds) {
      const old = this.sourceIds.shift()
      if (old) this.sourceIdSet.delete(old)
    }
    return true
  }

  clear() {
    this.connectedCounts.clear()
    this.sourceIds = []
    this.sourceIdSet.clear()
  }
}
