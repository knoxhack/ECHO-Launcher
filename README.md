# ECHO Launcher

ECHO Launcher is the official launcher, updater, repair tool, profile manager, server pack generator, diagnostics center, and ecosystem command center for Ashfall and the ECHO mod ecosystem.

ECHO Launcher is not a generic CurseForge clone. It is the official command center for Ashfall and the ECHO ecosystem.

## Run

Install dependencies:

```bash
npm install
```

Desktop development mode:

```bash
npm run desktop
```

Browser preview remains useful for visual work, but the beta launcher is strict desktop software. Install, update, repair, import, backup, diagnostics, Minecraft Launcher handoff, and export flows require the Electron native bridge.

Mobile beta pairing and troubleshooting lives in `docs/mobile-command-center-beta.md`. Release-candidate handoff steps live in `docs/mobile-beta-release-candidate.md`.

Mobile RC verification:

```bash
npm run rc:mobile
npm run rc:mobile:device
npm run rc:mobile:package
npm run rc:mobile:ready
```

`rc:mobile:package` creates a timestamped tester handoff folder, an uploadable zip, a `.sha256` checksum, and package reports under `reports/`.

```bash
npm run dev
```

Build strict Ashfall release assets from the seed CurseForge instance:

```bash
npm run pack:ashfall
```

Defaults:

- Source: `C:\CurseForge\Instances\Ashfall Protocol`
- Output: `release-artifacts/`
- Version: `1.2.0-beta.1`
- Channel: `stable`

The command emits upload-ready GitHub Release assets: `echo-release.json`, `ashfall-stable-1.2.0-beta.1.pack.json`, `ashfall-stable-1.2.0-beta.1-pack.zip`, and `ashfall-stable-1.2.0-beta.1-export-report.json`.

Local upload prep flow:

1. Run `npm run pack:ashfall`.
2. Confirm the command exits successfully and review `release-artifacts/ashfall-stable-1.2.0-beta.1-export-report.json`.
3. Create or edit GitHub Release tag `v1.2.0-beta.1` with title `Ashfall 1.2.0-beta.1`.
4. Manually upload `echo-release.json`, `ashfall-stable-1.2.0-beta.1.pack.json`, and `ashfall-stable-1.2.0-beta.1-pack.zip` from `release-artifacts/`.

Windows packaging:

```bash
npm run package:win
npm run package:win:dir
```

Installer artifacts are written under `installer-artifacts/`.

Linux packaging:

```bash
npm run package:linux
npm run package:linux:dir
```

Linux native builds use Linux Java and the Linux Minecraft Launcher data folder. Running the Windows build under Wine is detected as Wine compatibility mode; it uses the Wine-prefix Minecraft Launcher data and disables automatic updater restart into the Windows installer.

First-time Linux installer files should be built on Linux, not Windows. Use the manual GitHub Actions workflow **Build Linux Installer** or run the package command on a Linux/WSL2 machine:

```bash
npm ci
npm run package:linux
```

The **Build Linux Installer** workflow does not publish a GitHub Release. It uploads a downloadable workflow artifact named `echo-launcher-linux-appimage`. Download it from the workflow run, then upload these generated files to the `knoxhack/ECHOLauncher` GitHub Release:

- `ECHO-Launcher-1.0.1-x86_64.AppImage`
- `ECHO-Launcher-1.0.1-x86_64.AppImage.blockmap`
- `latest-linux.yml`

Players can run the first Linux AppImage with:

```bash
chmod +x ECHO-Launcher-1.0.1-x86_64.AppImage
./ECHO-Launcher-1.0.1-x86_64.AppImage
```

Windows can still produce `linux-unpacked`, but final AppImage packaging may fail there because AppImage creation needs Linux-style symlink behavior.

Launcher self-update publishing uses a dedicated GitHub Releases feed at `knoxhack/ECHOLauncher`, separate from Ashfall pack releases. Set `GH_TOKEN` with release upload permissions, then run:

```bash
npm run package:win:publish
npm run package:linux:publish
```

Those publish flows upload platform-specific artifacts and update metadata consumed by packaged launcher builds. Windows uses the NSIS installer, blockmap, and `latest.yml`; Linux AppImage builds use Linux update metadata on the same GitHub Releases feed.

The non-publish packaging scripts use `--publish never` so CI artifact builds do not require `GH_TOKEN`. Only `package:win:publish` and `package:linux:publish` upload directly to GitHub Releases.

Manual browser export flow:

1. Run `npm.cmd run package:win`.
2. Run `npm run dev` and open the browser preview.
3. Select the repo folder, `installer-artifacts` folder, or the three update files manually.
4. Click **Export Upload Bundle** and upload the bundled release assets to `knoxhack/ECHOLauncher`.

Validation:

```bash
npm run test
npm run lint
npm run build
npm run chat:test
npm run chat:build
npm run chat:smoke
```

Local chat development:

```bash
npm run dev:chat
npm run desktop:chat
```

`dev:chat` runs Vite and the in-memory community chat service together. In Settings > Community Chat, use **Use Local Service** to fill the local REST/WebSocket URLs, **Test Chat Service** to check `/health` plus bootstrap, and **Clear Service URLs** to return to preview fallback.

## Ashfall Beta Install

The beta defaults to **Minecraft Launcher Handoff** on Windows and Linux. The launcher installs Ashfall into ECHO app data, verifies strict SHA-256 release metadata, ensures the official Minecraft Launcher dependency is present, writes an ECHO-managed Minecraft Launcher profile, and opens the official launcher executable for Microsoft login and final play.

The beta exposes one playable pack: **Ashfall**, generated from `C:\CurseForge\Instances\Ashfall Protocol` and delivered only through strict GitHub Release assets. The official-pack catalog also shows view-only previews for **ECHO Prime**, **Orbital**, and **Arcana Division**. Preview packs do not create profiles and cannot be installed, exported, or launched until strict pack release metadata is published.

First-run player flow:

- Click **Play Ashfall**.
- ECHO downloads and verifies the Ashfall pack artifact from GitHub Releases.
- ECHO detects the official Minecraft Launcher; if it is missing, ECHO starts the official vendor installer flow and records the installer log under ECHO app data.
- ECHO writes or updates only its ECHO-managed Minecraft Launcher profile.
- Sign in and press Play inside the official Minecraft Launcher.

Players do not need to manually install the official Minecraft Launcher first, manage profiles, channels, presets, or native Java launch settings.

## Minecraft Launcher Handoff Mode

ECHO Launcher runs the beta through **Minecraft Launcher Handoff** mode. In this mode ECHO installs, repairs, verifies, validates, and prepares Ashfall, then creates or updates an ECHO-managed profile in the official Minecraft Launcher and opens it for final play.

This is the beta default:

- ECHO still owns trusted releases, install/update/repair, diagnostics, worldgen warnings, server packs, and asset validation.
- Microsoft account auth and the final game launch happen inside the official Minecraft Launcher.
- ECHO does not direct-launch Java for normal player play.
- ECHO opens a detected `MinecraftLauncher.exe`, `Minecraft.exe`, or `minecraft-launcher` executable before trying any protocol fallback.
- If the official Minecraft Launcher is missing, ECHO uses official Minecraft/Microsoft installer sources only: Windows uses `winget`/Microsoft Store/official download flow, Debian-based Linux downloads the official `Minecraft.deb`, and other Linux distributions are routed through Minecraft's official download page and package guidance.
- Existing Minecraft Launcher profiles are never deleted.
- The launcher profile file is backed up before ECHO writes to it.
- Only profiles marked as ECHO-managed are updated.
- If the required NeoForge/version metadata is missing from `.minecraft/versions`, handoff blocks with a clear diagnostic instead of writing a broken profile.
- If full verified NeoForge installer metadata is unavailable in a development manifest, ECHO can write ECHO-marked bootstrap version metadata so the official launcher can see the managed profile. Production releases should provide a verified NeoForge installer artifact.
- Settings and Tools show Minecraft Launcher dependency status, the resolved executable path, installer log path, repair action, and folder open action.

Native launch remains available only in Settings under **Advanced** for local developer testing. Official Minecraft download and install behavior follows Minecraft's current download/support pages: https://www.minecraft.net/en-us/download and https://help.minecraft.net/hc/en-us/articles/23907917790093-How-to-Download-and-Install-the-Minecraft-Launcher.

## Version 3

Version 3 adds the player launch path:

- Configurable Microsoft public-client ID in Settings
- Microsoft device-code login through the desktop backend
- MSAL token cache with encrypted persistence when MSAL Node Extensions can create a platform store
- Minecraft/Xbox session resolution isolated behind native services
- Real launch preflight for account, Java, files, NeoForge metadata, RAM, and classpath
- Developer Offline Launch toggle for local client testing without a Microsoft account
- Allowlisted Java launch through Electron IPC only
- Launch command preview with access tokens redacted
- Launch logs written under ECHO app data
- Stop/read launch state commands
- World compatibility scanner for Ashfall worldgen markers
- Expanded crash signatures for missing mods, Java mismatch, NeoForge mismatch, assets, configs, and auth/session issues
- SoundCore and WeatherCore validation reports
- Minecraft Launcher Handoff launch path

Version 3 does not store a client secret. Normal beta play delegates Microsoft login to the official Minecraft Launcher. For local development, Settings includes **Developer Offline Launch** inside the Advanced area; keep it disabled for public builds and normal player use.

## Version 2

Version 2 turns the MVP into a real desktop updater foundation:

- Strict desktop gate when the Electron bridge is unavailable
- Official GitHub Releases feed, defaulting to `knoxhack/ECHO`
- Release listing through allowlisted native IPC
- Trusted manifest fetch and cache with SHA-256 verification
- Install/update from verified release artifacts
- Repair from verified release artifacts only
- Backups and rollback plan reports before replacing corrupt files
- NeoForge installer metadata and allowlisted Java execution path
- Guided non-destructive import of existing Ashfall/ECHO installs
- Configurable support guide URL

## Implemented Pages

- Home / Play dashboard
- Community Chat
- Modpacks and guided install import
- Profiles & Addons
- Repair, Diagnostics & Crash Analyzer
- Settings / Performance / Server Tools
- Downloads / Install & Update Pipeline
- Logs
- Server Pack Generator
- ECHO Ecosystem Health

## Release Asset Format

Each GitHub release should include:

- `echo-release.json`
- `ashfall-{channel}-{version}.pack.json`
- `ashfall-{channel}-{version}-pack.zip`
- `file-{sha-prefix}-{safe-pack-path}` assets for per-file updates
- Optional verified NeoForge installer artifact when the release needs installer repair

Beta installs require strict manifests. A bare GitHub zip is blocked even if it exists in the release.
Fresh installs use the verified full pack zip. Existing managed installs use the per-file assets from the pack manifest so updates download only missing, changed, or corrupt files.

For the default Ashfall beta release, `npm run pack:ashfall` writes an `uploadPrep` section into `ashfall-stable-1.2.0-beta.1-export-report.json` with the recommended tag, release title, upload order, file sizes, and SHA-256 hashes. Use that report as the local checklist before manually attaching the assets to the GitHub Release.

`echo-release.json` must include enough metadata for the launcher to trust the pack manifest:

```json
{
  "pack": "ashfall",
  "version": "1.2.0-beta.1",
  "channel": "stable",
  "manifestAsset": "ashfall-stable-1.2.0-beta.1.pack.json",
  "manifestSha256": "64-character-sha256",
  "artifactMode": "zip",
  "artifactAsset": "ashfall-stable-1.2.0-beta.1-pack.zip",
  "artifactSha256": "64-character-sha256",
  "notes": ["Ashfall"],
  "assets": [
    { "name": "ashfall-stable-1.2.0-beta.1.pack.json", "role": "pack-manifest", "sha256": "64-character-sha256" },
    { "name": "ashfall-stable-1.2.0-beta.1-pack.zip", "role": "pack-artifact", "sha256": "64-character-sha256" },
    { "name": "file-abcd1234abcd-mods-echocore-1.2.0.jar", "role": "pack-file", "path": "mods/echocore-1.2.0.jar", "sha256": "64-character-sha256" }
  ]
}
```

Pack manifests must contain safe relative paths and SHA-256 hashes for every file inside the zip:

```json
{
  "pack": "ashfall",
  "name": "Ashfall",
  "version": "1.2.0-beta.1",
  "channel": "stable",
  "minecraft": "26.1.2",
  "minecraftVersion": "26.1.2",
  "artifactMode": "zip",
  "artifactName": "ashfall-stable-1.2.0-beta.1-pack.zip",
  "artifactSha256": "64-character-sha256",
  "loader": {
    "type": "neoforge",
    "version": "26.1.2.43-beta",
    "minecraftLauncherVersionId": "neoforge-26.1.2.43-beta",
    "versionJson": {}
  },
  "runtime": {
    "requiredJava": "25+"
  },
  "launch": {
    "mainClass": "net.neoforged.fml.startup.Client",
    "gameArgs": [],
    "jvmArgs": []
  },
  "modules": ["echocore"],
  "files": [
    {
      "path": "mods/echocore-1.2.0.jar",
      "assetName": "file-abcd1234abcd-mods-echocore-1.2.0.jar",
      "sha256": "64-character-sha256",
      "size": 3612480,
      "required": true,
      "moduleId": "echocore",
      "side": "both"
    }
  ],
  "changelog": ["Horizon release"],
  "worldgenWarning": true
}
```

The export command excludes user/runtime state including `.cache`, `.echo`, `.curseclient`, `logs`, `crash-reports`, `debug`, `downloads`, `saves`, `screenshots`, `options.txt`, `servers.dat`, caches, backups, locks, and local-only CurseForge state. `servers.dat` remains excluded by default, but selecting the exact top-level `servers.dat` file as an extra include intentionally ships the server list.

## Architecture

- `electron/` contains the desktop shell, preload bridge, and allowlisted native IPC.
- `scripts/lib/pack-export.mjs` builds strict Ashfall release assets and `.echo-pack.zip` exports from the local seed instance.
- `src/components` contains the cyberglass shell, reusable UI primitives, and page modules.
- `src/types` defines launcher, release, manifest, addon, profile, diagnostics, native IPC, and server export contracts.
- `src/services` is the renderer service layer. Native workflows call Electron IPC and throw a desktop-required error outside the desktop app.
- `src/stores` uses Zustand for launcher, profile, addon, download, diagnostics, and persisted settings state.
- `src/utils/releaseValidation.ts` contains shared release safety helpers covered by Vitest.
- `src/utils/launchValidation.ts` contains launch preflight, device-code, command-redaction, and worldgen compatibility helpers covered by Vitest.
- `src/utils/minecraftLauncherHandoff.ts` contains the Minecraft Launcher profile ownership and update safety helpers covered by Vitest.

## Microsoft Login And Launch

Configure the Microsoft public client ID in Settings. ECHO Launcher uses the Microsoft device-code flow for desktop login and requests:

- `XboxLive.signin`
- `offline_access`

The native backend exchanges the Microsoft token for Xbox Live, XSTS, and Minecraft Services tokens, checks entitlements/profile data, and keeps Minecraft service calls isolated behind `minecraft:resolve-session`.

Launch is blocked unless preflight passes:

- Java 25+ detected
- Microsoft Minecraft account linked, unless Developer Offline Launch is enabled
- Manifest verification has no missing/corrupt files
- Internal Minecraft runtime verification has no missing/corrupt files
- NeoForge loader metadata exists
- A launch classpath exists through internal runtime libraries, NeoForge metadata, or `.echo/launch-plan.json`

When launch starts, Electron spawns the selected Java executable directly with generated arguments. No arbitrary shell endpoint is exposed.

In Minecraft Launcher Handoff mode, ECHO does not spawn Java. It verifies the instance, writes an ECHO-managed profile with `gameDir` pointing at the managed instance folder, confirms NeoForge/version metadata exists, then opens the official Minecraft Launcher.

If the official Minecraft Launcher data folder exists but the selected NeoForge version metadata does not, ECHO first tries the verified NeoForge installer artifact from the pack manifest. Development manifests without that artifact fall back to ECHO-marked bootstrap metadata, then continue to the normal file verification gate.

## Native Safety Model

Electron IPC commands are allowlisted. The launcher never exposes an arbitrary shell endpoint.

- GitHub release feed settings are stored in ECHO app data.
- Release manifests are cached under the ECHO release cache.
- Manifest paths must be safe relative paths.
- Downloads require HTTP(S) and verify SHA-256 before install.
- Mojang runtime files are downloaded from Mojang metadata and verified with Mojang SHA-1/size metadata.
- Minecraft jars/assets are not redistributed in the ECHO installer or Ashfall pack release.
- Corrupt files are backed up before replacement.
- Repair restores missing/corrupt files only from verified artifacts.
- NeoForge installer execution is limited to the verified installer artifact and detected Java runtime.
- Microsoft login uses public-client OAuth only; no client secret belongs in the app.
- Launch command previews redact Minecraft access tokens.
- Minecraft Launcher profile updates are restricted to ECHO-managed profiles and are backed up before write.
- Destructive actions should remain behind user confirmation before packaged production release.

## Guided Import

The Modpacks page can scan common Minecraft, CurseForge, Prism Launcher, and Modrinth locations, or a manually selected folder. Imports are non-destructive: ECHO Launcher creates a managed profile that points at the existing install. Repair or conversion remains explicit.

## Roadmap

Version 4:

- Official and custom ECHO-stack modpack library
- Custom local manifest generator for user-made ECHO-stack packs
- Safer trust model for custom remote feeds
- Creator mode
- Discord post generator publishing workflow
- Release readiness scans
- Asset validation dashboards
- Codex/GitHub workflow hooks
- Screenshot/media tools
