import { WebSocket } from 'ws'
import type { ChatEventEnvelope } from '../types/chat.js'
import type { EventBus } from './EventBus.js'

export class RealtimeHub {
  private clients = new Set<WebSocket>()
  private unsubscribe: (() => void) | null = null

  constructor(private eventBus: EventBus) {}

  start() {
    this.unsubscribe = this.eventBus.subscribe((event) => this.send(event))
  }

  add(socket: WebSocket) {
    this.clients.add(socket)
    socket.on('close', () => this.clients.delete(socket))
  }

  async publish(type: ChatEventEnvelope['type'], payload: unknown) {
    await this.eventBus.publish({
      type,
      payload,
      createdAt: new Date().toISOString(),
    })
  }

  async close() {
    this.unsubscribe?.()
    this.unsubscribe = null
    for (const socket of this.clients) socket.close()
    this.clients.clear()
  }

  private send(event: ChatEventEnvelope) {
    const payload = JSON.stringify(event)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload)
    }
  }
}
