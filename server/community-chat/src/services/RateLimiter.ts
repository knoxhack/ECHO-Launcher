import { Redis } from 'ioredis'

export interface RateLimiter {
  consume(key: string, options: { windowMs: number; max: number }): Promise<boolean>
  close(): Promise<void>
}

export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, number[]>()

  async consume(key: string, options: { windowMs: number; max: number }) {
    const now = Date.now()
    const current = (this.buckets.get(key) ?? []).filter((timestamp) => now - timestamp <= options.windowMs)
    if (current.length >= options.max) {
      this.buckets.set(key, current)
      return false
    }
    current.push(now)
    this.buckets.set(key, current)
    return true
  }

  async close() {
    this.buckets.clear()
  }
}

export class RedisRateLimiter implements RateLimiter {
  private redis: Redis

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { lazyConnect: true })
  }

  async consume(key: string, options: { windowMs: number; max: number }) {
    if (this.redis.status === 'wait') await this.redis.connect()
    const bucketKey = `echo-chat:rate:${key}`
    const now = Date.now()
    const windowStart = now - options.windowMs
    const pipeline = this.redis.pipeline()
    pipeline.zremrangebyscore(bucketKey, 0, windowStart)
    pipeline.zcard(bucketKey)
    pipeline.zadd(bucketKey, now, `${now}:${Math.random()}`)
    pipeline.pexpire(bucketKey, options.windowMs)
    const results = await pipeline.exec()
    const count = Number(results?.[1]?.[1] ?? 0)
    return count < options.max
  }

  async close() {
    this.redis.disconnect()
  }
}
