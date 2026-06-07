# Mobile Command Center Release Candidate Handoff

This handoff is the beta tester checklist for ECHO Launcher plus the Android ECHO Command Center app.

## Built Artifacts

- Android debug APK:
  `C:\Experimental\Codex\ECHONATIVEPLATFORM\ECHO-Command-Android\app\build\outputs\apk\debug\app-debug.apk`
- Desktop launcher build output:
  `C:\Experimental\Codex\ECHONATIVEPLATFORM\ECHOLauncher\dist`

## Verified Checks

Run these before handing a build to testers:

```powershell
cd C:\Experimental\Codex\ECHONATIVEPLATFORM\ECHOLauncher
npm.cmd run rc:mobile
```

The RC verifier runs launcher tests, launcher build, launcher lint, Android unit tests, Android check, and Android debug APK assembly. It also confirms the mobile beta docs and APK exist, then writes:

- `reports/mobile-rc-verification.json`
- `reports/mobile-rc-verification.md`

For a fast artifact/docs presence check without running builds:

```powershell
npm.cmd run rc:mobile:quick
```

After `npm.cmd run rc:mobile` passes, create the tester handoff folder:

```powershell
npm.cmd run rc:mobile:package
```

The package command writes a timestamped folder under `release-candidates/`, an uploadable `.zip` next to it, and a `.zip.sha256` checksum file. It also writes:

- `reports/mobile-rc-package.json`
- `reports/mobile-rc-package.md`

The package includes:

- Android debug APK
- Desktop and Android tester docs
- RC verification reports
- Device-assist reports when `npm.cmd run rc:mobile:device` has been run
- `manifest.json` checksums
- `mobile-manual-acceptance-template.json`
- `TESTER-README.md` manual acceptance checklist

Upload the generated `.zip` and provide the `.sha256` file so testers can verify they received the exact handoff bundle. Packaging requires the most recent `reports/mobile-rc-verification.json` to come from the full `npm.cmd run rc:mobile` gate.

Optional ADB-assisted phone setup:

```powershell
npm.cmd run rc:mobile:device
npm.cmd run rc:mobile:device -- --install --launch
```

The device assistant looks for Android platform-tools, lists authorized devices, can install and launch the APK, and writes:

- `reports/mobile-device-assist.json`
- `reports/mobile-device-assist.md`

If more than one device is connected, pass `--serial <device-serial>`.

If ADB reports no devices, continue with manual install instead of blocking the beta pass:

1. Copy the APK out of the RC zip to the phone.
2. Open the APK from Android Files.
3. Allow installs from that source when Android prompts.
4. Open ECHO Command Center manually.
5. Capture `reports/mobile-device-assist.md` with the failure details and include it in the tester notes.

After the real-phone pass, copy `mobile-manual-acceptance-template.json`, fill every check with `status: "pass"`, include both copied diagnostics blocks, and include observed action/result notes. The validator requires concrete evidence for live-data replacement, Launch, Update, Repair, Scan Install, Run PackOS Check, Export Support Bundle, and duplicate-operation behavior.

```powershell
npm.cmd run rc:mobile:acceptance -- C:\path\to\filled-mobile-acceptance.json
```

The validator writes:

- `reports/mobile-manual-acceptance.json`
- `reports/mobile-manual-acceptance.md`

A beta tag should only be created after `reports/mobile-rc-verification.json`, `reports/mobile-rc-package.json`, and `reports/mobile-manual-acceptance.json` show valid current evidence. If Android or desktop code changes after packaging, rerun:

```powershell
npm.cmd run rc:mobile
npm.cmd run rc:mobile:package
```

After both reports pass, run the final ready gate:

```powershell
npm.cmd run rc:mobile:ready
```

When the ready gate reports `READY`, create the annotated beta tag through the guarded command:

```powershell
npm.cmd run rc:mobile:ready -- --tag mobile-command-center-v1.0.1
```

The ready gate writes:

- `reports/mobile-rc-ready.json`
- `reports/mobile-rc-ready.md`

The ready gate also rejects stale packages: the uploadable zip must exist, its `.sha256` file must match, and the package must contain the current Android APK, current full verification report, current tester docs, current manual acceptance template, and the current package-generator checksum.

## Manual Phone Acceptance

These checks require a real Android device on the same LAN as the desktop PC.

1. Install the debug APK on the phone.
2. Start ECHO Launcher on desktop.
3. Open desktop Settings and confirm Mobile Command Center is running.
4. Generate a pairing QR.
5. From the phone browser, open `http://<desktop-lan-ip>:4177/api/mobile/health` and confirm a JSON response.
6. Scan the QR from Android Settings.
7. Confirm Android shows waiting for desktop approval.
8. Approve the pending device on desktop.
9. Confirm Android finishes pairing without another manual Pair tap.
10. Refresh Android Home or Play.
11. Confirm Android shows `Live launcher data`, not `Sample fallback`.
12. Tap Launch Ashfall, Update Pack, Repair Install, Scan Install, Run PackOS Check, and Export Support Bundle.
13. Confirm each action returns a deterministic message and desktop operation state appears in Android.
14. Tap Update, Repair, Scan Install, or Export Support Bundle twice and confirm no overlapping duplicate operation is created.
15. Copy diagnostics from both desktop and Android Settings.

The filled acceptance file must include the actual copied diagnostics text. Desktop diagnostics should show Mobile Command Center bridge fields, and Android diagnostics should show `ECHO Android Bridge Diagnostics`, data source, bridge URL, and token-storage status without including secrets.

## Tester Instructions

Send testers:

- `docs/mobile-command-center-beta.md`
- The uploadable Mobile Command Center RC `.zip` from `release-candidates/`.
- The matching `.zip.sha256` checksum file.
- Desktop installer or desktop run instructions.
- A request to paste both desktop and Android copied diagnostics when reporting pairing, firewall, or live-data issues.

## RC Notes

- The bridge uses port `4177`.
- Health is unauthenticated and contains no secrets.
- Pairing requires explicit desktop approval.
- Copied diagnostics exclude device tokens, token hashes, and pairing payloads.
- A Git tag should only be created after the manual phone acceptance report passes validation.
