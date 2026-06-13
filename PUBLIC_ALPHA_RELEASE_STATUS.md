# Launcher Release Status

ECHO Launcher is the install, update, repair, rollback, and diagnostics surface for ECHO products. It is not itself the ECHO Native Platform release artifact.

For the Native Platform `1.0.0-RC1` lane, the launcher must keep warning or blocked catalog entries locked until Release Index evidence includes checksum-backed assets, download smoke, install, repair, rollback, diagnostics export, log export, first launch, and gameplay proof. Galactic Survey packaged Electron evidence now covers install/update/rollback/repair, diagnostics, log export, prepare-only Minecraft Launcher handoff metadata in an isolated Minecraft root, and a separate real `.minecraft` handoff preparation smoke when `scripts/galactic-survey-real-minecraft-handoff-smoke.mjs` is run with `--allow-real-minecraft-root`. First launch remains blocked until a real runtime launch path or official Minecraft Launcher open/play proof passes.

Public launcher download metadata is staged through GitHub releases and the ECHO website only after the matching Release Index entry is approved.
