import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { WebSocket } from 'ws'

const smokePort = await readSmokePort()
const baseUrl = `http://127.0.0.1:${smokePort}`
const messageNonce = `smoke-${Date.now()}`
const smokeMessageBody = 'chat smoke test'

interface SmokeMessageEvent {
  type: string
  payload: {
    channelId?: string
    body?: string
    nonce?: string
  }
}

async function main() {
  const service = spawn(process.execPath, ['dist/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(smokePort),
      HOST: '127.0.0.1',
      DATABASE_URL: '',
      REDIS_URL: '',
      CORS_ORIGIN: '*',
      DEFAULT_SLOW_MODE_SECONDS: '0',
      MESSAGE_RATE_LIMIT_MAX: '20',
    },
  })
  const logs: string[] = []
  service.stdout.on('data', (chunk: Buffer) => logs.push(chunk.toString()))
  service.stderr.on('data', (chunk: Buffer) => logs.push(chunk.toString()))

  const sockets: WebSocket[] = []
  try {
    await waitForHealth(service, logs)
    await assertBootstrap()
    sockets.push(await connectSocket('smoke-listener-a'), await connectSocket('smoke-listener-b'))
    const eventPromises = sockets.map((socket) => collectSingleMessageEvent(socket, {
      channelId: 'general',
      body: smokeMessageBody,
      nonce: messageNonce,
    }))
    await sendSmokeMessage()
    const events = await Promise.all(eventPromises)
    console.log(`chat smoke passed: ${events.length} websocket clients received one message.created delta on port ${smokePort}`)
  } finally {
    for (const socket of sockets) socket.close()
    await stopService(service)
  }
}

async function waitForHealth(service: ChildProcessWithoutNullStreams, logs: string[]) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (service.exitCode !== null) {
      throw new Error(`chat service exited early with code ${service.exitCode}.\n${logs.join('').slice(-2_000)}`)
    }
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: 'no-store' })
      if (response.ok) return
    } catch {
      // Service is still starting.
    }
    await delay(250)
  }
  throw new Error(`chat service did not become healthy on ${baseUrl}.\n${logs.join('').slice(-2_000)}`)
}

async function assertBootstrap() {
  const response = await fetch(`${baseUrl}/v1/community/bootstrap`, {
    headers: {
      Accept: 'application/json',
      'X-ECHO-Chat-Client': 'smoke-client',
      'X-ECHO-Chat-Nickname': 'Smoke Tester',
    },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`bootstrap failed with HTTP ${response.status}`)
  const json = await response.json() as { channels?: Array<{ id?: string }> }
  if (!json.channels?.some((channel) => channel.id === 'general')) {
    throw new Error('bootstrap did not include the default general channel')
  }
}

function connectSocket(clientId: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socketUrl = `ws://127.0.0.1:${smokePort}/v1/chat/socket?clientId=${encodeURIComponent(clientId)}`
    const socket = new WebSocket(socketUrl)
    const timeout = globalThis.setTimeout(() => {
      socket.close()
      reject(new Error('websocket connection timed out'))
    }, 5_000)
    socket.once('open', () => {
      globalThis.clearTimeout(timeout)
      resolve(socket)
    })
    socket.once('error', reject)
  })
}

function collectSingleMessageEvent(socket: WebSocket, expected: { channelId: string; body: string; nonce: string }) {
  return new Promise<SmokeMessageEvent>((resolve, reject) => {
    const matches: SmokeMessageEvent[] = []
    let settleTimeout: ReturnType<typeof globalThis.setTimeout> | null = null
    const timeout = globalThis.setTimeout(() => {
      cleanup()
      reject(new Error(`timed out waiting for ${expected.channelId} message.created websocket delta`))
    }, 5_000)
    const onMessage = (data: WebSocket.RawData) => {
      const event = parseSocketEvent(data)
      if (!matchesExpectedMessage(event, expected)) return
      matches.push(event)
      settleTimeout ??= globalThis.setTimeout(() => {
        cleanup()
        if (matches.length !== 1) {
          reject(new Error(`expected exactly one matching message.created event, received ${matches.length}`))
          return
        }
        resolve(matches[0]!)
      }, 300)
    }
    const cleanup = () => {
      globalThis.clearTimeout(timeout)
      if (settleTimeout) globalThis.clearTimeout(settleTimeout)
      socket.off('message', onMessage)
    }
    socket.on('message', onMessage)
  })
}

function parseSocketEvent(data: WebSocket.RawData) {
  try {
    const event = JSON.parse(data.toString()) as { type?: unknown; payload?: unknown }
    if (typeof event.type !== 'string' || !event.payload || typeof event.payload !== 'object') return null
    return event as SmokeMessageEvent
  } catch {
    return null
  }
}

function matchesExpectedMessage(event: SmokeMessageEvent | null, expected: { channelId: string; body: string; nonce: string }): event is SmokeMessageEvent {
  return event?.type === 'message.created'
    && event.payload.channelId === expected.channelId
    && event.payload.body === expected.body
    && event.payload.nonce === expected.nonce
}

async function sendSmokeMessage() {
  const response = await fetch(`${baseUrl}/v1/channels/general/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-ECHO-Chat-Client': 'smoke-sender',
      'X-ECHO-Chat-Nickname': 'Smoke Tester',
    },
    body: JSON.stringify({ body: smokeMessageBody, nonce: messageNonce }),
  })
  if (!response.ok) throw new Error(`message send failed with HTTP ${response.status}: ${await response.text()}`)
}

async function stopService(service: ChildProcessWithoutNullStreams) {
  if (service.exitCode !== null) return
  const exited = new Promise<void>((resolve) => service.once('exit', () => resolve()))
  service.kill('SIGTERM')
  await Promise.race([exited, delay(2_000)])
  if (service.exitCode === null) service.kill('SIGKILL')
}

async function readSmokePort() {
  const configuredPort = readPort(process.env.CHAT_SMOKE_PORT)
  if (configuredPort) return configuredPort
  return findOpenPort()
}

function readPort(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function findOpenPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      const port = address.port
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
