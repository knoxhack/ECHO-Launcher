# Phase 15.1 Desktop Launcher

Status: implemented as a runtime-foundation launcher slice.

## Scope

- Adds a Runtime page to the Electron launcher.
- Verifies the sibling standalone runtime workspace before launch.
- Shows runtime checks, support-bundle evidence, warnings, logs, and a planning-only repair list.
- Launches the Phase 14.20 `EchoStandaloneRuntime` app-image when verification passes.
- Keeps Native Loader and Minecraft Launcher handoff as explicit launch modes.

## Boundary

This is not a complete game launcher campaign flow. It is a desktop launcher shell for the deterministic, headless-safe standalone alpha foundation and tiny Ashfall vertical slice.

Native Loader remains gated for Phase 15.2. Minecraft handoff continues to use the existing official Minecraft Launcher path.

## Verification Targets

- `src/utils/standaloneRuntimeShell.test.ts`
- `src/components/runtime/StandaloneRuntimePage.tsx`
- `electron/main.cjs` commands:
  - `standalone-runtime:get-state`
  - `standalone-runtime:launch`
