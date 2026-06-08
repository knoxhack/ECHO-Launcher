# Modpack Update Flow

Modpack updates are file-level updates, not all-or-nothing downloads when individual files are available.

## Flow

1. Read the release index channel metadata.
2. Fetch the selected edition's `echo-release.json`.
3. Fetch the pack manifest referenced by that release metadata.
4. Expand `moduleRequirements` into managed files for the edition's artifact family.
5. Compare installed files by path, version, size, and SHA-256.
6. Download only missing, changed, or corrupt files that have an individual release asset URL.
7. Fall back to the full pack archive only when the changed file cannot be resolved individually.

## Edition Families

| Edition | Module artifact family |
| --- | --- |
| Ashfall Native Edition | `.echo-addon` |
| Ashfall NeoForge Edition | `-neoforge.jar` |
| Ashfall Standalone Edition | `-standalone.jar` |
