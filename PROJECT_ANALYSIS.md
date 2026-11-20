# UECFI Presenter: Comprehensive Architectural & Technical Analysis

**Project Name:** UECFI Presenter (Centro Presentation & Worship Projection Software)  
**Version:** 1.1.0  
**Target Environment:** Electron 33.4.11 / Node.js 20+ / Web / Android Cross-Platform  
**Date:** November 14, 2026  

---

## 1. Executive Summary

**UECFI Presenter** is an open-source, multi-platform centro presentation, worship projection, and live production studio suite designed specifically for the Union Espiritista Cristiana de Filipinas, Inc. (UECFI). Originally migrated from Adobe AIR, the project has evolved into a hybrid Electron desktop application paired with an Android remote control app, a Node.js/WebSocket WebRTC signaling server, and a WordPress REST API plugin for catalog synchronization.

The suite provides seamless centro projection (Bible scripture, dual-language verses, worship song lyrics with audio synchronization, program announcements, lower-thirds), live video studio mixing (WebRTC camera ingestion, Green Room backstage management, operator intercom), and remote audience streaming.

---

## 2. System Architecture & Component Inventory

The ecosystem consists of four major operational tiers:

```
+-----------------------------------------------------------------------------------+
|                            UECFI PRESENTER ECOSYSTEM                              |
+-----------------------------------------------------------------------------------+
|  1. Desktop Main Controller      2. Centro Projector          3. Remote & Audience |
|  - Electron Main Process         - Frameless Pop-up           - WebRTC Remote App |
|  - Preload IPC Bridge            - presentation.htm Engine    - Audience Web Portal|
|  - uecfipresenter2.html (UI)     - Dynamic Font Autoscaling   - Android Controller |
+-----------------------------------------------------------------------------------+
|  4. Supporting Backend & Ecosystem Services                                       |
|  - WebRTC Signaling Server (uecfi-signaling, Express + ws)                        |
|  - WordPress Content API Plugin (uecfi-presenter-api, PHP REST API)               |
+-----------------------------------------------------------------------------------+
```

### 2.1 Electron Main Process (`main.js`)
* **Window Lifecycle & Management:** Instantiates the primary controller window (`uecfipresenter2.html`, 1024x768 default maximized) and monitors display configurations via Electron's `screen` API.
* **Navigation & Security Guards:** Intercepts `will-navigate` and `setWindowOpenHandler` events to restrict in-app navigation strictly to safe local files (`file://` or `about:blank`), routing external `http://` or `https://` URLs to the OS default browser via `shell.openExternal`.
* **IPC IPC Bridge Handlers:** Exposes native synchronous/asynchronous file dialogs (`show-open-dialog`, `show-save-dialog`, `dialog:show-open`, `dialog:show-save`), screen detection (`get-screens`), dynamic application menu configuration (`set-menu`), and centro window lifecycle commands (`close-projection-window`).
* **Media Permissions:** Intercepts session permission requests to grant camera and microphone access automatically for live video streaming and WebRTC stage production.

### 2.2 Desktop IPC Bridge & Preload Script (`preload.js`)
* Securely exposes desktop capabilities to renderer scripts via `window.electronBridge`:
  - Screen inspection (`getScreens()`)
  - File picker dialogs (`showOpenDialog()`, `showSaveDialog()`, and async variants)
  - Window controls (`closeProjectionWindow()`)
  - Menu events (`setMenu()`, `onMenuClick()`)
  - OS Network interface enumeration (`getNetworkInterfaces()`)
* Contains contextual fallback mechanisms if `contextIsolation` is toggled.

### 2.3 Centro Projection Engine (`p_window.js`, `presentation.htm`, `presentation.js`)
* **Window Spawning & Monitor Routing:** `p_window.js` queries display bounds to position a secondary frameless projection window (`presentation.htm`) on target monitors (dual-screen centro displays or primary display in single-monitor mode).
* **State Synchronization (`passVariable()`):** Transfers controller state directly to the projector instance (text arrays `p_text1_arr`/`p_text2_arr`, title, footnote, theme styles, logo/attention overlay parameters, active audio sync line index).
* **Overlay Engine:** Features dedicated custom screens:
  - **Logo Screen Mode:** Configurable logo image, organization title, subtitle, custom background, and dimming level.
  - **Attention Screen Mode:** Instant blackout/notice overlay with optional audio chime (`attention.mp3`).
* **Dynamic Typography:** `presentation.js` continuously computes optimal font sizes (`p_maxFontSize`, `p_ver1ScaleFactor`, `p_ver2ScaleFactor`) to maximize readability across arbitrary projector aspect ratios and resolutions.

### 2.4 Live Production Studio (`live_studio.js`)
* **WebRTC Multi-Camera Ingestion:** Supports local camera capture and remote WebRTC video feeds.
* **Green Room Backstage & Intercom:** Maintains a private WebSocket connection with `uecfi-signaling`. Remote speakers join a virtual waiting room, communicate with the operator via private two-way intercom, and can be promoted "On Stage" to centro projectors.
* **Stage Layouts:** Supports single full-screen video, picture-in-picture (PiP), side-by-side split screen, and lower-third overlay over live slides.

### 2.5 Data & Storage Abstraction Layer (`db_service.js`, `storage_service.js`)
* **Universal Database Service (`AppDB` in `db_service.js`):**
  - **Primary Driver:** Uses `better-sqlite3` when running in compatible Node.js environments.
  - **Native Version Guard & JSON Fallback:** Handles ABI compatibility constraints (e.g. Electron 33 Node 20 vs better-sqlite3 v13 requirement of Node 22) by falling back to a zero-dependency persistent JSON storage driver (`createPersistentJsonDb`) backed by disk files (`.json`) and `localStorage`.
* **Platform Storage Abstraction (`AppStorage` in `storage_service.js`):**
  - Provides unified file reads/writes across Electron (`fs`), IndexedDB, `localStorage`, and Web Fetch API.
  - Handles path normalization for cross-platform file URLs (`fileUrlFromPath`).

### 2.6 Theme & Design System (`theme_manager.js`)
* Manages visual presentation themes (Modern Dark, Modern Light, Classic Centro, Velvet Purple, Golden Worship, Custom User Themes).
* Configures granular styling for three distinct content categories:
  1. **Verses:** Primary verse font/color, secondary translation font/color, header, footnote, background image/gradient.
  2. **Songs:** Lyric text fonts, alternate line highlight colors (`alternateLineColor`), audio sync active line color (`syncActiveColor`), background media.
  3. **Program Items:** Sub-divided into *Tema* (sermon theme), *Person* (guest speaker), and *General* (announcements).
* Provides WYSIWYG live preview synchronization in real-time.

### 2.7 Song & Audio Engine (`song_audio_engine.js`)
* Supports lyric-synced audio playback (`HTML5 Audio` / `Web Audio API`).
* Handles multi-track audio playback, seeking, volume fade, and line-by-line highlight synchronization on centro displays and remote client views.

---

## 3. Sub-Project Ecosystem Analysis

### 3.1 WebRTC Signaling Server (`uecfi-signaling/`)
* **Stack:** Node.js, Express, `ws` (WebSocket server), CORS.
* **Functionality:** Broker for WebRTC signaling (SDP offer/answer, ICE candidates) between the desktop host app and remote guest web portals (`public/`).
* **Deployment Readiness:** Includes `render.yaml` for instant deployment on Render.com, cPanel Node.js Passenger, or NGINX reverse proxies.

### 3.2 Android Application (`uecfi-presenter-android/`)
* **Stack:** Android SDK (Java/Kotlin, Gradle).
* **Functionality:** Native Android companion app providing handheld remote control (verse selection, song navigation, program item triggering, and live monitor status monitoring).

### 3.3 WordPress REST API Plugin (`wordpress-plugin/uecfi-presenter-api/`)
* **Stack:** PHP, WordPress REST API Infrastructure (`namespace uecfi/v1`).
* **Functionality:** Extends WordPress to serve as a central distribution hub for Bible database XML files and song pack updates, featuring attachment streaming and Cloudflare R2 external storage redirection.

---

## 4. Security & Risk Assessment

| Category | Finding / Vulnerability | Risk Level | Impact & Recommendation |
| :--- | :--- | :--- | :--- |
| **Electron Security** | `nodeIntegration: true`, `contextIsolation: false`, `webSecurity: false` in `main.js`. | **HIGH** | If un-sanitized content or external text is rendered in the renderer process, an XSS vulnerability could escalate to Remote Code Execution (RCE). <br>**Rec:** Enable `contextIsolation: true`, disable `nodeIntegration: true`, and route desktop APIs strictly through `contextBridge`. |
| **Synchronous IPC & I/O** | Extensive reliance on `sendSync` and synchronous `fs` methods (`readFileSync`, `writeFileSync`) in `db_service.js` and `storage_service.js`. | **MEDIUM** | Can cause main UI thread freezes/stuttering during heavy Bible searches, song imports, or initial database loads. <br>**Rec:** Migrate synchronous calls to async `ipcRenderer.invoke` and async `fs.promises`. |
| **Signaling Security** | Signaling server uses room IDs and secret keys in plain text; lacks rate limiting or authentication tokens. | **MEDIUM** | Vulnerable to brute-force room probing or unauthorized guest connections on open signaling ports. <br>**Rec:** Add rate-limiting middleware (`express-rate-limit`) and JWT room authorization tokens. |
| **Global State Dependence** | Heavy reliance on `window` global variables (`window.liveMonitorState`, `window.p_logo_mode`, loose functions). | **LOW-MEDIUM** | Risk of state pollution, side effects during async updates, and harder unit testing. <br>**Rec:** Encapsulate global state into modular ES modules or singletons. |

---

## 5. Strengths & Architectural Highlights

1. **Unrivaled Graceful Degradation:** The dual-layer storage and database system (`db_service.js` and `storage_service.js`) guarantees that the software runs seamlessly in Electron desktop environments, web server deployments, and fallback environments even when native binaries (`better-sqlite3`) cannot compile or fail version checks.
2. **Robust Multi-Monitor & Production Management:** Complete separation between the operator control studio and centro projection output, complete with custom logo/attention screens and lower-third broadcast modes.
3. **Integrated Worship Audio Sync:** Built-in audio engine supporting synchronized song lyric presentation.
4. **Complete Multi-Channel Ecosystem:** Integrated companion Android control app, cloud WebRTC signaling server, and WordPress publishing API plugin.

---

## 6. Actionable Technology Roadmap

### Phase 1: Security & Hardening (Immediate - 30 Days)
* [ ] Refactor `main.js` webPreferences to enable `contextIsolation: true` and disable `nodeIntegration: true`.
* [ ] Harden `uecfi-signaling/server.js` with WebSocket connection rate-limiting and connection validation.
* [ ] Clean up debug log accumulation in `main.js` to prevent unbounded log growth.

### Phase 2: Performance & Async Refactoring (1 - 3 Months)
* [ ] Convert synchronous file/database operations in `db_service.js` and `storage_service.js` to asynchronous promises.
* [ ] Replace legacy `sendSync` IPC methods in `preload.js` with `ipcRenderer.invoke`.
* [ ] Implement layout measurement caching in `presentation.js` to eliminate redundant font scale recalculations.

### Phase 3: Code Modernization & Architecture (3 - 6 Months)
* [ ] Refactor monolithic renderer files (`uecfipresenter.js`, `presentation.js`, `p_window.js`) into clean ES modules.
* [ ] Encapsulate loose global variables into typed state stores.
* [ ] Add automated unit tests for database queries, XML parsing, and WebRTC signaling message handlers.

---
*Report generated automatically for UECFI Presenter codebase.*
