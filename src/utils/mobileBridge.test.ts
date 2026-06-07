import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const mobileBridge = require('../../electron/mobile-bridge.cjs') as {
  authenticateDevice: (settings: unknown, token: string, options?: { now?: number; host?: string }) => { settings: { pairedDevices: Array<{ tokenHash: string }> }; device: { deviceName: string; role: string } | null }
  approvePendingDevice: (settings: unknown, requestId: string, role: string, options?: { now?: number; host?: string }) => unknown
  buildAndroidCommandCenterSnapshot: (input?: Record<string, unknown>) => Record<string, unknown>
  buildBridgeApiUrl: (host: string, port: number) => string
  buildMobileBridgeHealth: (settings: unknown, options?: { host?: string; now?: number; running?: boolean; error?: string; version?: string }) => Record<string, unknown>
  createPairingSession: (settings: unknown, options: { host: string; now: number; code: string }) => { activePairing: { code: string; pairingPayload: string; pendingDevices: Array<{ requestId: string }> } }
  isRunningMobileOperation: (operation: unknown, actionType: string) => boolean
  mapMobileAction: (action: string) => { type: string } | null
  canRunMobileAction: (role: string, action: string) => boolean
  requestPairing: (settings: unknown, body: { deviceName: string; pairingCode: string; requestedRole: string }, options?: { now?: number; host?: string }) => { settings: { pairedDevices: Array<{ deviceId: string; tokenHash: string }>; activePairing: { pendingDevices: Array<{ requestId: string }> } }; status: string; token?: string }
  revokePairedDevice: (settings: unknown, deviceId: string, options?: { now?: number; host?: string }) => { pairedDevices: unknown[] }
}

describe('mobile bridge helpers', () => {
  it('creates QR payloads with the LAN bridge URL', () => {
    const state = mobileBridge.createPairingSession({}, { host: '192.168.1.25', now: Date.parse('2026-05-31T12:00:00Z'), code: 'ECHO-1234-5678' })

    expect(state.activePairing.code).toBe('ECHO-1234-5678')
    expect(state.activePairing.pairingPayload).toBe('echo://pair?code=ECHO-1234-5678&bridge=http%3A%2F%2F192.168.1.25%3A4177%2Fapi%2F')
    expect(mobileBridge.buildBridgeApiUrl('192.168.1.25', 4177)).toBe('http://192.168.1.25:4177/api/')
  })

  it('requires explicit approval before issuing a device token', () => {
    const now = Date.parse('2026-05-31T12:00:00Z')
    const pairing = mobileBridge.createPairingSession({}, { host: '192.168.1.25', now, code: 'ECHO-1234-5678' })

    const pending = mobileBridge.requestPairing(
      pairing,
      { deviceName: 'Pixel Tester', pairingCode: 'ECHO-1234-5678', requestedRole: 'PLAYER' },
      { host: '192.168.1.25', now: now + 1000 },
    )
    expect(pending.status).toBe('pending')
    expect(pending.token).toBeUndefined()

    const requestId = pending.settings.activePairing.pendingDevices[0].requestId
    const approved = mobileBridge.approvePendingDevice(pending.settings, requestId, 'PLAYER', { host: '192.168.1.25', now: now + 2000 })
    const paired = mobileBridge.requestPairing(
      approved,
      { deviceName: 'Pixel Tester', pairingCode: 'ECHO-1234-5678', requestedRole: 'PLAYER' },
      { host: '192.168.1.25', now: now + 3000 },
    )

    expect(paired.status).toBe('paired')
    expect(paired.token).toBeTruthy()
    expect(paired.settings.pairedDevices).toHaveLength(1)
    expect(paired.settings.pairedDevices[0].tokenHash).not.toBe(paired.token)

    const authenticated = mobileBridge.authenticateDevice(paired.settings, paired.token ?? '', { host: '192.168.1.25', now: now + 4000 })
    expect(authenticated.device?.deviceName).toBe('Pixel Tester')
    expect(authenticated.device?.role).toBe('PLAYER')
  })

  it('builds public health diagnostics without secrets', () => {
    const now = Date.parse('2026-05-31T12:00:00Z')
    const pairing = mobileBridge.createPairingSession({}, { host: '192.168.1.25', now, code: 'ECHO-1234-5678' })
    const pending = mobileBridge.requestPairing(
      pairing,
      { deviceName: 'Pixel Tester', pairingCode: 'ECHO-1234-5678', requestedRole: 'PLAYER' },
      { host: '192.168.1.25', now: now + 1000 },
    )
    const approved = mobileBridge.approvePendingDevice(pending.settings, pending.settings.activePairing.pendingDevices[0].requestId, 'PLAYER', { host: '192.168.1.25', now })
    const paired = mobileBridge.requestPairing(
      approved,
      { deviceName: 'Pixel Tester', pairingCode: 'ECHO-1234-5678', requestedRole: 'PLAYER' },
      { host: '192.168.1.25', now: now + 2000 },
    )

    const health = mobileBridge.buildMobileBridgeHealth(paired.settings, {
      host: '192.168.1.25',
      running: true,
      now,
      version: '0.1.0-test',
    })

    expect(health).toEqual({
      ok: true,
      status: 'running',
      bridgeUrl: 'http://192.168.1.25:4177/api/',
      lanAddress: '192.168.1.25',
      port: 4177,
      pairingActive: true,
      pairedDeviceCount: 1,
      serverTime: '2026-05-31T12:00:00.000Z',
      version: '0.1.0-test',
    })
    expect(JSON.stringify(health)).not.toContain(paired.token)
    expect(JSON.stringify(health)).not.toContain('ECHO-1234-5678')
  })

  it('reports bridge startup errors in public state and health', () => {
    const health = mobileBridge.buildMobileBridgeHealth({}, {
      host: '192.168.1.25',
      running: false,
      error: 'listen EADDRINUSE: address already in use 0.0.0.0:4177',
    })

    expect(health.ok).toBe(false)
    expect(health.status).toBe('error')
  })

  it('revokes paired devices by id', () => {
    const now = Date.parse('2026-05-31T12:00:00Z')
    const pairing = mobileBridge.createPairingSession({}, { host: '192.168.1.25', now, code: 'ECHO-1234-5678' })
    const pending = mobileBridge.requestPairing(pairing, { deviceName: 'Pixel Tester', pairingCode: 'ECHO-1234-5678', requestedRole: 'PLAYER' }, { now })
    const approved = mobileBridge.approvePendingDevice(pending.settings, pending.settings.activePairing.pendingDevices[0].requestId, 'PLAYER', { now })
    const paired = mobileBridge.requestPairing(approved, { deviceName: 'Pixel Tester', pairingCode: 'ECHO-1234-5678', requestedRole: 'PLAYER' }, { now })

    const revoked = mobileBridge.revokePairedDevice(paired.settings, paired.settings.pairedDevices[0].deviceId, { now })

    expect(revoked.pairedDevices).toHaveLength(0)
  })

  it('builds Android command-center snapshot top-level fields', () => {
    const snapshot = mobileBridge.buildAndroidCommandCenterSnapshot({
      role: 'DEVELOPER',
      bridgeUrl: 'http://192.168.1.25:4177/api/',
      profile: { version: '1.0.1-beta', status: 'healthy', installPath: 'C:/Ashfall' },
      operation: { status: 'running', label: 'Updating Ashfall', progress: 73, phaseId: 'download', message: 'Downloading mods' },
    })

    expect(Object.keys(snapshot)).toEqual([
      'launcherConnection',
      'homeStatus',
      'homeQuickActions',
      'chatChannels',
      'chatMessages',
      'launcherTaskProgress',
      'servers',
      'secondScreen',
      'indexEntries',
      'devStatus',
      'devActions',
    ])
    expect((snapshot.launcherConnection as { role: string }).role).toBe('DEVELOPER')
    expect((snapshot.launcherTaskProgress as { progress: number }).progress).toBe(0.73)
  })

  it('maps live server, manifest, logs, and support bundle data into the Android snapshot', () => {
    const snapshot = mobileBridge.buildAndroidCommandCenterSnapshot({
      role: 'PLAYER',
      bridgeUrl: 'http://192.168.1.25:4177/api/',
      profile: { version: '1.0.1-beta', status: 'healthy', installPath: 'C:/Ashfall' },
      manifest: {
        pack: 'ashfall-native-edition',
        name: 'Ashfall Native Edition',
        version: '2.0.0-beta',
        channel: 'alpha',
        modules: ['echocore', 'ashfall-world'],
        minecraftVersion: '26.1.2',
        loader: { type: 'neoforge', version: '26.1.2.43-beta' },
        files: [
          {
            path: 'mods/echocore.jar',
            moduleId: 'echocore',
            required: true,
            side: 'both',
            size: 1048576,
          },
          {
            path: 'config/ashfall/world.toml',
            moduleId: 'ashfall-world',
            required: false,
            side: 'client',
            size: 2048,
          },
        ],
      },
      serverStatus: {
        serverName: 'Ashfall Live',
        motd: 'Storm front active.',
        online: true,
        playerCount: 7,
        maxPlayers: 40,
        players: ['Knox', 'Ari'],
        pingMs: 42,
        version: { echo: '2.0.0-beta' },
        recentEvents: [
          {
            type: 'join',
            player: 'Knox',
            message: 'Knox joined Ashfall.',
            createdAt: '2026-05-31T12:00:30.000Z',
          },
        ],
        lastUpdated: '2026-05-31T12:00:00.000Z',
      },
      logsSummary: {
        latestName: 'launcher.log',
        latestModifiedAt: '2026-05-31T12:01:00.000Z',
        latestSize: 5120,
        fileCount: 3,
      },
      supportBundle: {
        available: true,
        fileCount: 3,
        bundleCount: 2,
        latestName: 'echo-logs-2026-05-31.zip',
        latestSize: 2097152,
        generatedAt: '2026-05-31T12:02:00.000Z',
      },
      packOsRuntime: 'Ashfall Native Edition: ready',
      packOsReason: 'All required modules are present.',
      nativeAdapter: 'Reported',
    })

    expect((snapshot.homeStatus as { minecraftChatBridge: string; packVersion: string }).minecraftChatBridge).toBe('Live server status')
    expect((snapshot.homeStatus as { packVersion: string }).packVersion).toBe('2.0.0-beta')
    expect((snapshot.servers as Array<{ name: string; players: number; requiredPackVersion: string; pingMs: number }>)[0]).toMatchObject({
      name: 'Ashfall Live',
      players: 7,
      requiredPackVersion: '2.0.0-beta',
      pingMs: 42,
    })
    expect((snapshot.indexEntries as Array<{ title: string; category: string; recipe: string; status: string; tags: string[] }>)).toMatchObject([
      {
        title: 'ECHO Core',
        category: 'Mod',
        recipe: '1 file, 1 MB',
        status: 'Available in installed pack (1 required)',
        tags: ['manifest', 'ashfall-native-edition', 'alpha', 'both'],
      },
      {
        title: 'Ashfall World',
        category: 'Config',
        recipe: '1 file, 2 KB',
        status: 'Available in installed pack (0 required, 1 optional)',
        tags: ['manifest', 'ashfall-native-edition', 'alpha', 'client'],
      },
    ])
    expect((snapshot.chatMessages as Array<{ id: string }>).map((message) => message.id)).toEqual([
      'launcher-status',
      'official-server-status',
      'official-server-event-0',
      'launcher-log-summary',
      'support-bundle-summary',
    ])
    expect((snapshot.chatMessages as Array<{ id: string; body: string }>).find((message) => message.id === 'official-server-status')?.body).toContain('Players: Knox, Ari.')
    expect((snapshot.chatMessages as Array<{ id: string; body: string }>).find((message) => message.id === 'official-server-event-0')?.body).toBe('Knox joined Ashfall.')
    expect((snapshot.chatMessages as Array<{ id: string; body: string }>).find((message) => message.id === 'launcher-log-summary')?.body).toContain('launcher.log (5 KB). 3 log files available.')
    expect((snapshot.chatMessages as Array<{ id: string; body: string }>).find((message) => message.id === 'support-bundle-summary')?.body).toContain('echo-logs-2026-05-31.zip')
    expect((snapshot.chatMessages as Array<{ id: string; body: string }>).find((message) => message.id === 'support-bundle-summary')?.body).toContain('2 bundles, 3 log files available')
    expect((snapshot.devActions as Array<{ label: string; description: string }>).find((action) => action.label === 'View Launcher Logs')?.description).toContain('launcher.log')
    expect((snapshot.devActions as Array<{ label: string; description: string }>).find((action) => action.label === 'View Launcher Logs')?.description).toContain('3 files available')
    expect((snapshot.devActions as Array<{ label: string; description: string }>).find((action) => action.label === 'Export Support Bundle')?.description).toContain('echo-logs-2026-05-31.zip')
    expect((snapshot.devActions as Array<{ label: string; description: string }>).find((action) => action.label === 'Export Support Bundle')?.description).toContain('2 bundles available')
    expect((snapshot.devStatus as { packOsRuntime: string; nativeAdapter: string }).packOsRuntime).toBe('Ashfall Native Edition: ready')
    expect((snapshot.devStatus as { packOsRuntime: string; nativeAdapter: string }).nativeAdapter).toBe('Reported')
    expect((snapshot.secondScreen as { hazard: string }).hazard).toBe('All required modules are present.')
  })

  it('keeps the latest non-idle launcher operation visible in Android progress', () => {
    const completed = mobileBridge.buildAndroidCommandCenterSnapshot({
      operation: {
        status: 'completed',
        label: 'Mobile repair complete',
        progress: 42,
        phaseId: 'mobile-repair',
        message: 'Repaired 3 files.',
      },
    })
    const failed = mobileBridge.buildAndroidCommandCenterSnapshot({
      operation: {
        status: 'failed',
        label: 'Mobile update failed',
        progress: 96,
        phaseId: 'mobile-update',
        message: 'Release manifest unavailable.',
      },
    })

    expect((completed.launcherTaskProgress as { title: string; progress: number; speed: string; status: string })).toMatchObject({
      title: 'Mobile repair complete',
      progress: 1,
      speed: 'Complete',
      status: 'Repaired 3 files.',
    })
    expect((failed.launcherTaskProgress as { title: string; progress: number; speed: string; status: string })).toMatchObject({
      title: 'Mobile update failed',
      progress: 0.96,
      speed: 'Needs attention',
      status: 'Release manifest unavailable.',
    })
  })

  it('surfaces specific installed profile state without claiming missing installs are live', () => {
    const warning = mobileBridge.buildAndroidCommandCenterSnapshot({
      installed: true,
      installStatus: 'repair_required',
      profile: { version: '1.0.1-beta', status: 'repair_required' },
    })
    const missing = mobileBridge.buildAndroidCommandCenterSnapshot({
      installed: false,
      installStatus: 'healthy',
      profile: { version: '1.0.1-beta', status: 'healthy' },
    })

    expect((warning.homeStatus as { ashfall: string }).ashfall).toBe('Installed (Repair Required)')
    expect((missing.homeStatus as { ashfall: string }).ashfall).toBe('Not installed')
  })

  it('labels stale official server data instead of presenting it as live', () => {
    const snapshot = mobileBridge.buildAndroidCommandCenterSnapshot({
      serverStatus: {
        serverName: 'Ashfall Live',
        online: true,
        stale: true,
        playerCount: 2,
        maxPlayers: 40,
        players: ['Knox'],
        lastUpdated: '2026-05-31T11:00:00.000Z',
      },
    })

    expect((snapshot.homeStatus as { server: string; minecraftChatBridge: string }).server).toBe('Stale')
    expect((snapshot.homeStatus as { server: string; minecraftChatBridge: string }).minecraftChatBridge).toBe('Server status stale')
    expect((snapshot.chatMessages as Array<{ id: string; body: string }>).find((message) => message.id === 'official-server-status')?.body).toContain('Official server status is stale')
  })

  it('does not claim live server or PackOS status when bridge inputs are unavailable', () => {
    const snapshot = mobileBridge.buildAndroidCommandCenterSnapshot({
      role: 'PLAYER',
      bridgeUrl: 'http://192.168.1.25:4177/api/',
      profile: { version: 'GitHub latest', status: 'missing' },
    })

    expect((snapshot.homeStatus as { server: string; minecraftChatBridge: string; ashfall: string }).server).toBe('Unknown')
    expect((snapshot.homeStatus as { server: string; minecraftChatBridge: string; ashfall: string }).minecraftChatBridge).toBe('Ready')
    expect((snapshot.homeStatus as { server: string; minecraftChatBridge: string; ashfall: string }).ashfall).toBe('Not installed')
    expect((snapshot.servers as Array<{ online: boolean; players: number }>)[0]).toMatchObject({
      online: false,
      players: 0,
    })
    expect((snapshot.devStatus as { packOsRuntime: string }).packOsRuntime).toBe('Unknown')
    expect((snapshot.indexEntries as Array<{ installedInPack: boolean }>)[0].installedInPack).toBe(false)
  })

  it('maps Android action labels to launcher actions', () => {
    expect(mobileBridge.mapMobileAction('Launch Ashfall')?.type).toBe('launch')
    expect(mobileBridge.mapMobileAction('Update Pack')?.type).toBe('update')
    expect(mobileBridge.mapMobileAction('Update Ashfall')?.type).toBe('update')
    expect(mobileBridge.mapMobileAction('Repair Install')?.type).toBe('repair')
    expect(mobileBridge.mapMobileAction('Repair Ashfall')?.type).toBe('repair')
    expect(mobileBridge.mapMobileAction('Scan Install')?.type).toBe('verify')
    expect(mobileBridge.mapMobileAction('Verify Files')?.type).toBe('verify')
    expect(mobileBridge.mapMobileAction('Run PackOS Check')?.type).toBe('packos-check')
    expect(mobileBridge.mapMobileAction('Open Chat')?.type).toBe('refresh')
    expect(mobileBridge.mapMobileAction('Send Android chat message')?.type).toBe('refresh')
    expect(mobileBridge.mapMobileAction('Join Ashfall Official')?.type).toBe('launch')
    expect(mobileBridge.mapMobileAction('Share Phase Anchor to Chat')?.type).toBe('refresh')
    expect(mobileBridge.mapMobileAction('Pin Phase Anchor to Play Screen')?.type).toBe('refresh')
    expect(mobileBridge.mapMobileAction('Ask Community about Phase Anchor')?.type).toBe('refresh')
    expect(mobileBridge.mapMobileAction('View Latest News')?.type).toBe('news')
    expect(mobileBridge.mapMobileAction('Export Support Bundle')?.type).toBe('support-bundle')
    expect(mobileBridge.mapMobileAction('Generate Changelog')?.type).toBe('dev-note')
    expect(mobileBridge.mapMobileAction('Create Release Checklist')?.type).toBe('dev-note')
    expect(mobileBridge.mapMobileAction('Generate Next Phase Prompt')?.type).toBe('dev-note')
    expect(mobileBridge.mapMobileAction('Create Bug Report')?.type).toBe('dev-note')
    expect(mobileBridge.mapMobileAction('Open Asset Forge')?.type).toBe('dev-note')
    expect(mobileBridge.mapMobileAction('Definitely Not A Real Action')).toBeNull()
  })

  it('enforces role gates for mobile actions', () => {
    expect(mobileBridge.canRunMobileAction('VIEWER', 'Open Chat')).toBe(true)
    expect(mobileBridge.canRunMobileAction('VIEWER', 'Launch Ashfall')).toBe(false)
    expect(mobileBridge.canRunMobileAction('PLAYER', 'Launch Ashfall')).toBe(true)
    expect(mobileBridge.canRunMobileAction('PLAYER', 'Run PackOS Check')).toBe(true)
    expect(mobileBridge.canRunMobileAction('PLAYER', 'View Launcher Logs')).toBe(false)
    expect(mobileBridge.canRunMobileAction('DEVELOPER', 'View Launcher Logs')).toBe(true)
    expect(mobileBridge.canRunMobileAction('ADMIN', 'Export Support Bundle')).toBe(true)
    expect(mobileBridge.canRunMobileAction('ADMIN', 'Definitely Not A Real Action')).toBe(false)
  })

  it('matches running mobile operations by stable action marker after phase changes', () => {
    expect(mobileBridge.isRunningMobileOperation({
      status: 'running',
      phaseId: 'release',
      mobileActionType: 'mobile-launch',
    }, 'mobile-launch')).toBe(true)
    expect(mobileBridge.isRunningMobileOperation({
      status: 'queued',
      phaseId: 'download',
      mobileActionType: 'mobile-update',
    }, 'mobile-update')).toBe(true)
    expect(mobileBridge.isRunningMobileOperation({
      status: 'running',
      phaseId: 'hashing',
      mobileActionType: 'mobile-verify',
    }, 'mobile-verify')).toBe(true)
    expect(mobileBridge.isRunningMobileOperation({
      status: 'running',
      phaseId: 'dependency-check',
      mobileActionType: 'mobile-open-minecraft-launcher',
    }, 'mobile-open-minecraft-launcher')).toBe(true)
    expect(mobileBridge.isRunningMobileOperation({
      status: 'running',
      phaseId: 'collecting-logs',
      mobileActionType: 'mobile-support-bundle',
    }, 'mobile-support-bundle')).toBe(true)
    expect(mobileBridge.isRunningMobileOperation({
      status: 'completed',
      phaseId: 'mobile-update',
      mobileActionType: 'mobile-update',
    }, 'mobile-update')).toBe(false)
    expect(mobileBridge.isRunningMobileOperation({
      status: 'running',
      phaseId: 'download',
    }, 'mobile-update')).toBe(false)
  })
})
