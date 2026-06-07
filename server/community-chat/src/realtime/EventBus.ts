import { EventEmitter } from 'node:events'
import { Redis } from 'ioredis'
import type { ChatEventEnvelope } from '../types/chat.js'

export interface EventBus {
  publish(event: ChatEventEnvelope): Promise<void>
  subscribe(listener: (event: ChatEventEnvelope) => void): () => void
  close(): Promise<void>
}

export class LocalEventBus implements EventBus {
  private emitter = new EventEmitter()

  async publish(event: ChatEventEnvelope) {
    this.emitter.emit('event', event)
  }

  subscribe(listener: (event: ChatEventEnvelope) => void) {
    this.emitter.on('event', listener)
    return () => this.emitter.off('event', listener)
  }

  async close() {
    this.emitter.removeAllListeners()
  }
}

export class RedisEventBus implements EventBus {
  private publisher: Redis
  private subscriber: Redis
  private emitter = new EventEmitter()
  private channel = 'echo-chat:events'

  constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl, { lazyConnect: true })
    this.subscriber = new Redis(redisUrl, { lazyConnect: true })
  }

  async start() {
    if (this.publisher.status === 'wait') await this.publisher.connect()
    if (this.subscriber.status === 'wait') await this.subscriber.connect()
    await this.subscriber.subscribe(this.channel)
    this.subscriber.on('message', (_channel: string, payload: string) => {
      try {
        this.emitter.emit('event', JSON.parse(payload) as ChatEventEnvelope)
      } catch {
        // Ignore malformed fanout payloads.
      }
    })
  }

  async publish(event: ChatEventEnvelope) {
    if (this.publisher.status === 'wait') await this.publisher.connect()
    await this.publisher.publish(this.channel, JSON.stringify(event))
  }

  subscribe(listener: (event: ChatEventEnvelope) => void) {
    this.emitter.on('event', listener)
    return () => this.emitter.off('event', listener)
  }

  async close() {
    this.publisher.disconnect()
    this.subscriber.disconnect()
    this.emitter.removeAllListeners()
  }
}
