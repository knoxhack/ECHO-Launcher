# ECHO Community Chat

The launcher Community page connects directly to the official Minecraft server mod, `echocommunitybridge`. The mod owns the official chat API, history, and WebSocket fanout on the same public HTTP port used for `/status.json`.

## Mod-Hosted Service

Official launcher and Android builds use the same public base URL as official server status:

Default official URLs:

| Setting key | Local value |
| --- | --- |
| `communityApiUrl` | `http://64.74.111.235:16363` |
| `communityWebSocketUrl` | `ws://64.74.111.235:16363/v1/chat/socket` |

For local Minecraft server testing, manually use `http://127.0.0.1:47870` and `ws://127.0.0.1:47870/v1/chat/socket`. The mod may still bind internally to `47870`; public players must use the forwarded public status port `16363`.

## Browser Preview Workflow

1. Start the Minecraft server with `echocommunitybridge` loaded.
2. Open `http://127.0.0.1:5173/?launcher-preview`.
3. In Settings > Community Chat, choose `Use Local Service`.
4. Choose `Test Server Mod`; it checks `/health` and the bootstrap contract.
5. Open Community, save a nickname, and send a message.
6. Open a second browser tab to the same preview URL.
7. Confirm both tabs show `Connected`, the message appears in both tabs, and the sending tab shows it only once.

Use `Clear Service URLs` to return to the built-in launcher preview fallback.

## Launcher Settings

Settings are persisted through the existing desktop settings file and browser-preview Zustand store:

| Setting key | Purpose |
| --- | --- |
| `communityApiUrl` | Base HTTPS URL for the ECHO Chat REST API. Blank uses local preview data. |
| `communityWebSocketUrl` | WSS endpoint for live chat deltas. Blank disables socket connection. |
| `chatNickname` | User's launcher chat display name. |
| `chatNotifications` | Enables launcher chat notification behavior. |

## REST Contract

The launcher expects:

- `GET /v1/community/bootstrap`
- `GET /v1/channels/:channelId/messages?before=&after=&limit=50`
- `POST /v1/channels/:channelId/messages`

Public chat clients identify themselves with:

| Header | Purpose |
| --- | --- |
| `X-ECHO-Chat-Client` | Stable client/device id. |
| `X-ECHO-Chat-Nickname` | Display name for authored messages. |
| `X-ECHO-Chat-Source` | Optional `launcher` or `android`; blank defaults to `launcher`. |

The bootstrap response should include channel groups, channels, members, self identity, latest messages by channel, pagination flags, moderation rules, and bridge status. Initial channel payloads should include only the latest 50 messages.

## WebSocket Contract

The launcher connects to `communityWebSocketUrl?clientId=...&source=launcher` and batches inbound events before updating React state. Android clients should use `source=android`.

Supported event types:

- `message.created`

Events are deltas, not full channel snapshots.

## Minecraft Bridge

Official server chat is owned by `echocommunitybridge`:

- Launcher and Android `POST /v1/channels/server-ashfall/messages`.
- Launcher and Android connect to `WS /v1/chat/socket`.
- Minecraft chat is stored as `source=minecraft` and broadcast to launcher/Android.
- Discord inbound chat is stored as `source=discord` when `relay.discordChat=true`.
- Join, leave, advancement, start, and stop events are stored as `source=system`.
- Launcher and Android messages are broadcast in-game and posted to Discord through the mod's existing Discord REST queue.
- Slash-prefixed launcher/Android messages are stored for clients but are not relayed into Minecraft as commands.

Bridge rules:

- In-game chat relays into the matching launcher server channel.
- Launcher messages in server channels relay back into Minecraft chat.
- Android messages in server channels relay back into Minecraft chat using the same bridge socket.
- Discord messages are posted to this service by `echocommunitybridge` as `discord.chat` bridge events.
- Source IDs and message IDs prevent loops.
- Commands are not relayed.
- Text is plain text and sanitized before broadcast.
- Joins, leaves, deaths, and server status events appear as system messages.

## Performance Requirements

- Message timelines are virtualized in the launcher.
- Cursor pagination is required for older history.
- The service should index messages by `(channel_id, created_at, id)`.
- Presence, typing, read receipts, and unread counts should be throttled.
- No REST polling is needed while the WebSocket is connected.
