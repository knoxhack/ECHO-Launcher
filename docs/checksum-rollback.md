# Checksum And Rollback

Every trusted launcher, pack, and module update must have enough metadata to verify what was downloaded before it is used.

## Verification

- Release metadata is fetched from trusted GitHub Release assets.
- Pack manifests include expected paths, sizes, and SHA-256 hashes.
- Module release metadata includes per-module artifact names, sizes, hashes, and descriptor versions.
- The launcher blocks bare GitHub source archives as playable releases.

## Rollback

Before replacing files, the launcher records the previous managed state. If verification, extraction, or post-update validation fails, the launcher can restore the previous file set and report the failing artifact.

The Repair tab exposes this as **Restore Last Known Good**. The command only consumes launcher-managed install/update rollback plans from the launcher log directory and only restores files from the launcher-managed backup folder. A restore writes `rollback-restore-*.json`, refreshes manifest verification, restores the previous `.echo/installed-manifest.json` when available, and reports every restored, removed, skipped, or warning entry for release evidence.
