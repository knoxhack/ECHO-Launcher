# ECHO Launcher

Official desktop launcher, updater, repair tool, profile manager, diagnostics center, and release consumer for Ashfall and the ECHO ecosystem.

## Purpose

Official desktop launcher, updater, repair tool, profile manager, diagnostics center, and release consumer for Ashfall and the ECHO ecosystem.

## What Lives Here

React/Electron launcher source, pack export scripts, installer configuration, launcher update metadata support, mobile command-center experiments, and release policy docs.

## Release And Update Role

Owns launcher app releases from `knoxhack/ECHO-Launcher`. It also consumes pack and module releases from the release index and edition/module repos.

## Public Or Private

Public is recommended for launcher downloads, update metadata, issue triage, and player trust. Keep only secrets, signing keys, and unpublished credentials outside the repo.

## Build And Dev Commands

Run commands from the repository root.

- `npm install`
- `npm run dev`
- `npm run desktop`
- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run test:e2e:release-index`
- `npm run package:win`
- `npm run package:linux`

## Artifact Ownership

Launcher installers, AppImages, blockmaps, `latest.yml`, and `latest-linux.yml` belong to GitHub Releases in this repo. Pack/module artifacts do not belong here.

## Release Index E2E Fixture

`npm run test:e2e:release-index` creates local `.echo-addon` module artifacts, locally ingests them into a temporary Release Index catalog, resolves `echo://install/addon/<id>?pack=<pack-id>` and `echo://update/pack/<id>` links, then verifies install, update, repair after corruption, and rollback with SHA-256 checks. Pass `-- --keep-temp` to inspect the generated fixture files.

## Docs Index

- [docs/launcher-update-flow.md](docs/launcher-update-flow.md)
- [docs/modpack-update-flow.md](docs/modpack-update-flow.md)
- [docs/individual-module-updates.md](docs/individual-module-updates.md)
- [docs/checksum-rollback.md](docs/checksum-rollback.md)
- [docs/release-policy.md](docs/release-policy.md)
- [docs/mobile-command-center-beta.md](docs/mobile-command-center-beta.md)
- [docs/community-chat.md](docs/community-chat.md)
- [docs/mobile-beta-release-candidate.md](docs/mobile-beta-release-candidate.md)
- [docs/official-server-status.md](docs/official-server-status.md)
- [docs/phase-15-desktop-launcher.md](docs/phase-15-desktop-launcher.md)
- [PUBLIC_ALPHA_RELEASE_STATUS.md](PUBLIC_ALPHA_RELEASE_STATUS.md)

## Related Repos

- [knoxhack/ECHO-Modules](https://github.com/knoxhack/ECHO-Modules)
- [knoxhack/ECHO-Ashfall-Native-Edition](https://github.com/knoxhack/ECHO-Ashfall-Native-Edition)
- [knoxhack/ECHO-Ashfall-NeoForge-Edition](https://github.com/knoxhack/ECHO-Ashfall-NeoForge-Edition)
- [knoxhack/ECHO-Ashfall-Standalone-Edition](https://github.com/knoxhack/ECHO-Ashfall-Standalone-Edition)
- [knoxhack/ECHO-Release-Index](https://github.com/knoxhack/ECHO-Release-Index)
- [knoxhack/ECHO-Native-Platform](https://github.com/knoxhack/ECHO-Native-Platform)
- [knoxhack/ECHO-Standalone-Runtime](https://github.com/knoxhack/ECHO-Standalone-Runtime)
- [knoxhack/ECHO-SDK](https://github.com/knoxhack/ECHO-SDK)
- [knoxhack/ECHO-Developer-Studio](https://github.com/knoxhack/ECHO-Developer-Studio)
- [knoxhack/ECHO-Addons-Studio](https://github.com/knoxhack/ECHO-Addons-Studio)
- [knoxhack/ECHO-Platform-Website](https://github.com/knoxhack/ECHO-Platform-Website)
