# Mobile Command Center Beta Checklist

This checklist is for beta testers pairing the Android ECHO Command Center app with ECHO Launcher on desktop.

## Desktop Setup

1. Start ECHO Launcher on the PC.
2. Open Settings.
3. Find Mobile Command Center.
4. Confirm the bridge status is `Bridge running`.
5. Confirm the LAN URL uses the desktop LAN address and port `4177`, for example `http://192.168.1.25:4177/api/`.
6. Select Generate Pairing QR.

## Android Pairing

1. Install the Android debug APK from the Android project or RC zip:
   `app/build/outputs/apk/debug/app-debug.apk`
2. Open ECHO Command Center on Android.
3. Open Settings.
4. Use Scan QR under Pair new launcher.
5. Leave Android on the waiting state.
6. On desktop, approve the pending Android device.
7. Confirm Android shows a stored device token and live launcher data.

## APK Install Options

Use ADB when the phone is visible to the desktop:

```powershell
cd C:\Experimental\Codex\ECHONATIVEPLATFORM\ECHOLauncher
npm.cmd run rc:mobile:device -- --install --launch
```

If ADB does not list the phone:

- Unlock the phone and keep the screen awake.
- Enable Developer options and USB debugging.
- Accept the `Allow USB debugging?` prompt on the phone.
- Change USB mode from charge-only to File transfer / Android Auto when Android shows the USB notification.
- Try a known data-capable USB cable and a direct motherboard USB port.
- If ADB is still unavailable, copy `ECHO-Command-Center-Android-debug.apk` from the RC zip to the phone and install it from Android Files after allowing installs from that source.

## Firewall And LAN Checks

Use these checks when Android shows the bridge as unreachable or sample fallback.

- The phone and PC must be on the same Wi-Fi or LAN.
- Guest Wi-Fi and phone hotspot client isolation can block device-to-PC connections.
- The desktop bridge listens on port `4177`.
- Windows Firewall must allow ECHO Launcher or Node/Electron to accept private-network inbound connections.
- The Android bridge URL should use the PC LAN IP, not `127.0.0.1`.
- Emulator testing should use `http://10.0.2.2:4177/api/`; physical phones should use the PC LAN IP.
- If port `4177` is already in use, restart the bridge from desktop Settings after freeing the port.
- From the phone browser, open `http://<desktop-lan-ip>:4177/api/mobile/health`. A JSON health response proves LAN/firewall reachability before pairing.
- If health works but command-center data does not, pair again and confirm Android Settings shows a stored device token.
- If health does not work, confirm desktop Settings shows `Bridge running`, then check Windows Defender Firewall private-network inbound rules.

## Diagnostics To Send Back

Desktop:

1. Open ECHO Launcher Settings.
2. Confirm the Mobile Command Center card shows the Beta Bridge Checklist.
3. Select Copy Diagnostics in Mobile Command Center.
4. Paste the copied text into the beta report.

Android:

1. Open ECHO Command Center Settings.
2. Select Copy Diagnostics in Bridge status.
3. Paste the copied text into the beta report.

Copied diagnostics intentionally exclude device tokens, token hashes, and pairing payloads. The desktop diagnostics should include the phone health URL, command-center URL, paired-device count, pending-device count, LAN/firewall notes, and the beta acceptance checklist.

## Action Checks

Run these from Android after pairing. Record the visible result message for each action in the acceptance report.

- Launch Ashfall should queue or complete a Minecraft Launcher handoff and show progress in Android.
- Update Pack should queue, run, complete, fail, or report that an update is already running.
- Repair Install should queue, run, complete, fail, or report that repair is already running.
- Scan Install should report missing/corrupt counts or a clean verification result.
- Run PackOS Check should report the selected PackOS state, such as ready, blocked, unavailable, complete, or failed.
- Export Support Bundle should report an exported support bundle path, zip, complete, queued, or failed message.
- Repeated Update, Repair, Scan Install, or Export Support Bundle taps should not create overlapping desktop operations.

## Acceptance Pass

- Desktop shows one paired Android device.
- Android Settings shows the bridge as reachable.
- Android Home, Chat, Play, Index, and Dev show `Live launcher data`, not `Sample fallback`.
- Launch, Update, Repair, Scan Install, Run PackOS Check, and Export Support Bundle return deterministic messages.
- Repeated Update, Repair, Scan Install, or Export Support Bundle taps do not create overlapping desktop operations.
- Desktop and Android copied diagnostics are pasted into the acceptance report.
