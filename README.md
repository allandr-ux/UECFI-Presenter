# UECFI Presenter

Cross-platform church presentation suite featuring an Electron desktop Operator Console, dedicated Main Screen output, Stage View, timed-lyrics audio sync, Bible search, and LAN Remote Viewers (browser & Android).

## Components

- **Desktop App (`electron/` + `src/`)**: Electron + React + TypeScript Operator Console and fullscreen Main Screen window. Local media is served via the `uecfi-media://` custom protocol.
- **LAN Remote Server (`electron/server.ts`)**: Built-in HTTP + WebSocket server (default port `4850`, with automatic fallback) and UDP discovery (`4851`).
- **Browser Remote Viewer (`?view=remote`)**: Mobile-friendly Stage View and Main Screen mirror, also deployable as static files from `dist/` (`base: './'`).
- **Android Companion (`android/`)**: Jetpack Compose remote controller and Main Screen mirror with automatic LAN UDP discovery.

## Development & Build

### Desktop & Web
```bash
npm install
npm run dev          # Start Vite + Electron in dev mode
npm run typecheck    # Typecheck renderer and Electron main process
npm run build        # Build dist/ and dist-electron/
npm run package:mac  # Package macOS .app / .dmg / .zip into release/
npm run package:win  # Package Windows NSIS / portable into release/
```

### Android Companion
```bash
cd android
./gradlew compileDebugKotlin
./gradlew installDebug     # Install onto connected ADB device
./gradlew assembleRelease  # Minified R8 release APK
```

## Remote Pairing & Device Whitelisting

- Opening the LAN server root (`/`) redirects to `/?view=remote` (view-only until paired).
- **PIN & QR Pairing**: Open **Display Setup** in the desktop app to view the QR code and 6-digit **Remote Control PIN**. Scanning the QR code or entering the PIN once in the browser or Android app issues a persistent device token.
- **Revocation**: Paired devices appear under **Whitelisted Devices** in **Display Setup** and can be revoked at any time, immediately returning that device to view-only mode.
