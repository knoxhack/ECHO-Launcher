# Launcher Update Flow

ECHO Launcher has its own app update feed in `knoxhack/ECHO-Launcher`. Pack and module updates are separate flows.

## Launcher App Updates

Packaged desktop builds use GitHub Releases from this repo. Windows consumes the NSIS installer, blockmap, and `latest.yml`. Linux consumes the AppImage, blockmap, and `latest-linux.yml`.

## Pack Updates

The launcher reads the release index, resolves the selected pack channel, fetches the edition manifest, verifies SHA-256 metadata, and updates only the files that changed.

## Module Updates

When a pack manifest declares `moduleRequirements`, the launcher resolves each module against `knoxhack/ECHO-Modules` and replaces only the individual module artifact that changed.

## Rollback

Before replacing managed files, the launcher records a rollback plan and keeps enough metadata to restore the previous installed file set when validation fails.
