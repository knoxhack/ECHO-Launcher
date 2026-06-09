# Official Server Status

The launcher Home page reads the official server status JSON and renders it in the top-right Home card. The same settings are editable in Settings > General > Official Server.

## Defaults

The bundled launcher defaults are:

| Setting key | Default |
| --- | --- |
| `officialServerName` | `Ashfall Official` |
| `officialServerStatusUrl` | `https://api.echoplatform.dev/status.json` |
| `officialDiscordInviteUrl` | blank |
| `officialStatusPollSeconds` | `30` |

Desktop builds persist these keys through `settings:save` in the existing desktop settings file. Browser preview stores them through the existing Zustand persisted settings store and does not require Electron APIs.

## Status Contract

The launcher expects `schemaVersion: 1` from the configured status URL. A valid response contains:

```json
{
  "schemaVersion": 1,
  "serverId": "official-ashfall",
  "serverName": "ECHO Ashfall Official",
  "motd": "Survive. Adapt. Endure.",
  "online": true,
  "playerCount": 7,
  "maxPlayers": 40,
  "players": ["KnoxHack"],
  "discord": {
    "linked": true,
    "inviteUrl": "https://discord.gg/..."
  },
  "version": {
    "minecraft": "26.1.2",
    "neoforge": "26.1.2.29-beta",
    "echo": "1.7.0"
  },
  "recentEvents": [],
  "lastUpdated": "2026-05-24T12:00:00Z"
}
```

Malformed JSON, missing schema version, non-OK HTTP responses, timeouts, and CORS failures are treated as fetch failures. The Home page stays usable and keeps the last known status when one exists.

## Home Card Behavior

The Home card keeps the existing right-sidebar footprint and shows:

| Row | Source |
| --- | --- |
| `Server` | Runtime state: `Loading`, `Online`, `Offline`, `Stale`, or `Unavailable`. |
| `Players` | `playerCount / maxPlayers`, or placeholders while loading. |
| `Discord` | `Linked` when the status or settings provide an invite URL; otherwise `Unavailable`. |
| `Updated` | Relative timestamp from `lastUpdated`. |

Runtime state rules:

- `Loading`: no status has loaded and a fetch is in progress.
- `Online`: status loaded, not stale, and `online=true`.
- `Offline`: status loaded, not stale, and `online=false`.
- `Stale`: loaded status is older than two minutes.
- `Unavailable`: no status is available after a failed fetch.

Player names render only when the server is online. The strip shows up to three names and a compact `+N` overflow count. Long names, counts, and labels truncate so the right sidebar does not resize.

The card button opens `Join Discord` when an invite URL exists. Without an invite, it switches to `View Servers` and navigates to the launcher's Servers page.

## Settings Controls

Settings > General > Official Server exposes:

- `Server Name`
- `Poll Seconds`
- `Status JSON URL`
- `Discord Invite URL`

Controls:

- `Save Settings`: normalizes values, clears the current Home-card status, saves through desktop settings when Electron is available, and saves to the browser store in preview mode.
- `Test Status`: fetches the configured URL once, updates the shared Home-card status store, and shows a success or failure toast.
- `Reset Defaults`: restores `Ashfall Official`, `https://api.echoplatform.dev/status.json`, blank invite, and `30` seconds.

Poll seconds are normalized to the supported range of 10 to 300 seconds.

## Browser Preview

Use:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5173/?launcher-preview
```

The status endpoint must allow browser CORS. The bridge default `public_status.corsOrigin=*` supports this.

## Release Checklist

1. Run the launcher in browser preview and confirm the Home card does not overlap at the desktop viewport.
2. Confirm Settings > General > Official Server shows all four fields.
3. Use `Test Status` with a valid schema version `1` response and confirm the Home card updates.
4. Use `Reset Defaults` and confirm the Home card returns to the official HTTPS default URL and fallback state.
5. Stop or block the status endpoint and confirm the Home page remains usable, showing stale or unavailable state.
6. Configure a Discord invite URL and confirm the Home card button changes to `Join Discord`.
