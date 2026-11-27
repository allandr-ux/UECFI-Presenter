import { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker, protocol, safeStorage, screen, session, shell, systemPreferences } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import type {
  DisplayInfo,
  LiveState,
  ParticipantSignalMessage,
  RemoteConnectionInfo,
  WhitelistedDevice
} from '../shared/types';
import { LocalRemoteServer, MIME_TYPES } from './server';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'uecfi-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let operatorWindow: BrowserWindow | null = null;
let mainScreenWindow: BrowserWindow | null = null;
let overflowScreenWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;
let selectedMainDisplayId: number | null = null;
let selectedOverflowDisplayId: number | null = null;
let displaySleepBlockerId: number | null = null;
let currentLiveState: LiveState | null = null;
let remoteServer: LocalRemoteServer | null = null;
let remoteInfo: RemoteConnectionInfo = {
  localUrl: 'http://127.0.0.1:4850/?view=remote',
  wsUrl: 'ws://127.0.0.1:4850',
  port: 4850,
  localPin: null,
  connectedClients: 0,
  onlineSessionCode: null,
  onlinePin: null,
  onlineConnected: false
};

const isDev = !app.isPackaged;
const isWin = process.platform === 'win32';
const distDir = path.join(__dirname, '..', '..', 'dist');
// macOS uses a HIG-padded 1024x1024 icon (824x824 body + 100px margin) so it matches
// standard Dock icon sizing, while Windows keeps the full-bleed app-icon.png.
const devIconPath =
  process.platform === 'darwin' && fs.existsSync(path.join(__dirname, '..', '..', 'build', 'icon-mac.png'))
    ? path.join(__dirname, '..', '..', 'build', 'icon-mac.png')
    : path.join(__dirname, '..', '..', 'app-icon.png');

// Set a stable Windows AppUserModelId so taskbar grouping and pinning stay consistent
// across installed, portable, and dev builds.
if (isWin) {
  app.setAppUserModelId('org.uecfi.presenter');
}

// Prevent launching a second desktop instance (common on Windows when double-clicking a shortcut),
// which would otherwise fall back to a different LAN port and contend on Chromium userData storage.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (operatorWindow && !operatorWindow.isDestroyed()) {
      if (operatorWindow.isMinimized()) {
        operatorWindow.restore();
      }
      operatorWindow.focus();
    }
  });
}

// Allow programmatic audio playback when an audio-synced song is triggered remotely
// from the Android app over WebSocket without requiring a local click inside the Electron window.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/**
 * Prevents the OS from blanking/sleeping the projector display while either
 * Main Screen or Overflow Screen is open, and releases the blocker once both close.
 */
function syncDisplaySleepBlocker() {
  const hasOutputOpen = Boolean(
    (mainScreenWindow && !mainScreenWindow.isDestroyed()) ||
      (overflowScreenWindow && !overflowScreenWindow.isDestroyed())
  );
  if (hasOutputOpen) {
    if (displaySleepBlockerId === null || !powerSaveBlocker.isStarted(displaySleepBlockerId)) {
      displaySleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    }
  } else if (displaySleepBlockerId !== null) {
    if (powerSaveBlocker.isStarted(displaySleepBlockerId)) {
      powerSaveBlocker.stop(displaySleepBlockerId);
    }
    displaySleepBlockerId = null;
  }
}

function loadRendererView(
  win: BrowserWindow,
  view: 'operator' | 'mainScreen' | 'overflow' | 'about',
  extraQuery?: Record<string, string>
) {
  const query = { view, ...extraQuery };
  if (isDev) {
    const qs = new URLSearchParams(query).toString();
    win.loadURL(`http://localhost:5173/?${qs}`);
    return;
  }
  win.loadFile(path.join(distDir, 'index.html'), { query });
}

function openAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }
  aboutWindow = new BrowserWindow({
    width: 340,
    height: 270,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: '#111622',
    title: 'About UECFI Presenter',
    ...(operatorWindow && !operatorWindow.isDestroyed() ? { parent: operatorWindow } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  hardenWindow(aboutWindow);
  loadRendererView(aboutWindow, 'about', { version: app.getVersion() });
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

function hardenWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Allow explicit external https:// links (e.g. API key portals) to open in the system browser
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (isDev) {
      if (!targetUrl.startsWith('http://localhost:5173/')) {
        event.preventDefault();
      }
      return;
    }
    const allowedUrl = pathToFileURL(path.join(distDir, 'index.html'));
    try {
      const parsedTarget = new URL(targetUrl);
      // Compare drive-letter/path case-insensitively on Windows (e.g. C:/ vs c:/).
      const allowedPath = isWin ? allowedUrl.pathname.toLowerCase() : allowedUrl.pathname;
      const targetPath = isWin ? parsedTarget.pathname.toLowerCase() : parsedTarget.pathname;
      if (parsedTarget.protocol !== 'file:' || targetPath !== allowedPath) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });
}

function createOperatorWindow() {
  operatorWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0f17',
    title: 'UECFI Presenter',
    // Hide the Windows menu bar by default so Alt-drag in the Slide Builder doesn't
    // steal keyboard focus to the menu bar; ignored on macOS.
    autoHideMenuBar: true,
    ...(isDev && fs.existsSync(devIconPath) ? { icon: devIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  operatorWindow.maximize();
  hardenWindow(operatorWindow);
  loadRendererView(operatorWindow, 'operator');

  operatorWindow.on('closed', () => {
    operatorWindow = null;
    if (mainScreenWindow && !mainScreenWindow.isDestroyed()) {
      mainScreenWindow.close();
    }
    if (overflowScreenWindow && !overflowScreenWindow.isDestroyed()) {
      overflowScreenWindow.close();
    }
  });
}

function getTargetDisplay(): Electron.Display {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  if (selectedMainDisplayId !== null) {
    const match = displays.find((d) => d.id === selectedMainDisplayId);
    if (match) return match;
  }

  // Prefer the first secondary display if available
  const secondary = displays.find((d) => d.id !== primary.id);
  return secondary ?? primary;
}

function openMainScreenWindow(displayId?: number): boolean {
  if (typeof displayId === 'number') {
    selectedMainDisplayId = displayId;
  }

  const targetDisplay = getTargetDisplay();
  const { x, y, width, height } = targetDisplay.bounds;

  if (mainScreenWindow && !mainScreenWindow.isDestroyed()) {
    // On Windows, setBounds() is ignored while a window is already fullscreen,
    // so exit fullscreen first before moving to the new target display.
    if (isWin && mainScreenWindow.isFullScreen()) {
      mainScreenWindow.setFullScreen(false);
    }
    mainScreenWindow.setBounds({ x, y, width, height });
    mainScreenWindow.setFullScreen(true);
    mainScreenWindow.focus();
    syncDisplaySleepBlocker();
    return true;
  }

  mainScreenWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    // On Windows with mixed-DPI monitors, passing fullscreen: true in the constructor
    // can snap the window to the primary display. Defer fullscreen until ready-to-show on win32,
    // while keeping macOS behavior unchanged.
    fullscreen: !isWin,
    show: !isWin,
    alwaysOnTop: true,
    backgroundColor: '#000000',
    title: 'UECFI Presenter - Main Screen',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isWin) {
    mainScreenWindow.once('ready-to-show', () => {
      if (!mainScreenWindow || mainScreenWindow.isDestroyed()) return;
      mainScreenWindow.setBounds({ x, y, width, height });
      mainScreenWindow.setFullScreen(true);
      mainScreenWindow.show();
    });
  }

  hardenWindow(mainScreenWindow);
  loadRendererView(mainScreenWindow, 'mainScreen');
  syncDisplaySleepBlocker();

  mainScreenWindow.on('closed', () => {
    mainScreenWindow = null;
    syncDisplaySleepBlocker();
  });

  return true;
}

function openOverflowScreenWindow(displayId?: number): boolean {
  if (typeof displayId === 'number') {
    selectedOverflowDisplayId = displayId;
  }

  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const targetDisplay =
    (selectedOverflowDisplayId !== null
      ? displays.find((d) => d.id === selectedOverflowDisplayId)
      : undefined) ??
    displays.find((d) => d.id !== primary.id && d.id !== selectedMainDisplayId) ??
    displays.find((d) => d.id !== primary.id) ??
    primary;
  const { x, y, width, height } = targetDisplay.bounds;

  if (overflowScreenWindow && !overflowScreenWindow.isDestroyed()) {
    if (isWin && overflowScreenWindow.isFullScreen()) {
      overflowScreenWindow.setFullScreen(false);
    }
    overflowScreenWindow.setBounds({ x, y, width, height });
    overflowScreenWindow.setFullScreen(true);
    overflowScreenWindow.focus();
    syncDisplaySleepBlocker();
    return true;
  }

  overflowScreenWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    fullscreen: !isWin,
    show: !isWin,
    alwaysOnTop: true,
    backgroundColor: '#000000',
    title: 'UECFI Presenter - Overflow Screen',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isWin) {
    overflowScreenWindow.once('ready-to-show', () => {
      if (!overflowScreenWindow || overflowScreenWindow.isDestroyed()) return;
      overflowScreenWindow.setBounds({ x, y, width, height });
      overflowScreenWindow.setFullScreen(true);
      overflowScreenWindow.show();
    });
  }

  hardenWindow(overflowScreenWindow);
  loadRendererView(overflowScreenWindow, 'overflow');
  syncDisplaySleepBlocker();

  overflowScreenWindow.on('closed', () => {
    overflowScreenWindow = null;
    syncDisplaySleepBlocker();
  });

  return true;
}

function registerIpcHandlers() {
  ipcMain.handle('displays:list', (): DisplayInfo[] => {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const target = getTargetDisplay();

    return displays.map((d, idx) => ({
      id: d.id,
      label: d.label || `Display ${idx + 1}`,
      bounds: d.bounds,
      isPrimary: d.id === primary.id,
      isMainScreen: d.id === target.id
    }));
  });

  ipcMain.handle('mainScreen:open', (_event, displayId?: number) => {
    return openMainScreenWindow(displayId);
  });

  ipcMain.handle('mainScreen:close', () => {
    if (mainScreenWindow && !mainScreenWindow.isDestroyed()) {
      mainScreenWindow.close();
      mainScreenWindow = null;
    }
    return true;
  });

  ipcMain.handle('mainScreen:isOpen', () => {
    return Boolean(mainScreenWindow && !mainScreenWindow.isDestroyed());
  });

  ipcMain.handle('overflowScreen:open', (_event, displayId?: number) => {
    return openOverflowScreenWindow(displayId);
  });

  ipcMain.handle('overflowScreen:close', () => {
    if (overflowScreenWindow && !overflowScreenWindow.isDestroyed()) {
      overflowScreenWindow.close();
      overflowScreenWindow = null;
    }
    return true;
  });

  ipcMain.handle('overflowScreen:isOpen', () => {
    return Boolean(overflowScreenWindow && !overflowScreenWindow.isDestroyed());
  });

  ipcMain.handle('liveState:get', () => currentLiveState);

  ipcMain.on('liveState:update', (_event, state: LiveState) => {
    currentLiveState = state;
    if (mainScreenWindow && !mainScreenWindow.isDestroyed()) {
      mainScreenWindow.webContents.send('liveState:sync', state);
    }
    if (overflowScreenWindow && !overflowScreenWindow.isDestroyed()) {
      overflowScreenWindow.webContents.send('liveState:sync', state);
    }
    remoteServer?.broadcastState(state);
  });

  ipcMain.on(
    'programSync:update',
    (
      _event,
      bundle: {
        programId: string;
        programName: string;
        items: import('../shared/types').ProgramItem[];
        logoSlide: import('../shared/types').ProgramItem | null;
      }
    ) => {
      remoteServer?.updateProgramSyncBundle(bundle);
    }
  );

  ipcMain.handle('chat:getHistory', () => {
    return remoteServer?.getChatHistory() ?? [];
  });

  ipcMain.on('chat:send', (_event, text: string) => {
    remoteServer?.sendDesktopChatMessage(text);
  });

  ipcMain.on(
    'bibleSync:update',
    (
      _event,
      bundle: {
        primaryBible: import('../shared/types').BibleVersion | null;
        secondaryBible: import('../shared/types').BibleVersion | null;
        verseStyle?: Partial<import('../shared/types').ProgramItem>;
      }
    ) => {
      remoteServer?.updateBibleSyncBundle(bundle);
    }
  );

  ipcMain.on(
    'liveState:audioTime',
    (_event, payload: { timeSec?: number; activeBlockIndex: number }) => {
      if (currentLiveState) {
        currentLiveState = {
          ...currentLiveState,
          audioCurrentTimeSec: payload.timeSec,
          activeBlockIndex: payload.activeBlockIndex
        };
      }
      if (mainScreenWindow && !mainScreenWindow.isDestroyed()) {
        mainScreenWindow.webContents.send('liveState:audioTimeSync', payload);
      }
      if (overflowScreenWindow && !overflowScreenWindow.isDestroyed()) {
        overflowScreenWindow.webContents.send('liveState:audioTimeSync', payload);
      }
      remoteServer?.broadcastTimeSync(payload.timeSec, payload.activeBlockIndex);
    }
  );

  ipcMain.handle('remote:info', () => ({
    ...remoteInfo,
    connectedClients: remoteServer?.getClientCount() ?? 0
  }));

  ipcMain.handle('remote:regeneratePin', () => {
    if (remoteServer) {
      const updated = remoteServer.regeneratePin();
      remoteInfo = {
        ...remoteInfo,
        ...updated
      };
    }
    return {
      ...remoteInfo,
      connectedClients: remoteServer?.getClientCount() ?? 0
    };
  });

  ipcMain.handle('remote:whitelist', (): WhitelistedDevice[] => {
    return remoteServer?.getWhitelistedDevices() ?? [];
  });

  ipcMain.handle('remote:revokeDevice', (_event, deviceId: string): WhitelistedDevice[] => {
    return remoteServer?.revokeDevice(deviceId) ?? [];
  });

  ipcMain.on('participants:signal', (event, msg: ParticipantSignalMessage) => {
    const fromMainScreen = mainScreenWindow && event.sender === mainScreenWindow.webContents;
    const fromOverflowScreen = overflowScreenWindow && event.sender === overflowScreenWindow.webContents;
    if (fromMainScreen || fromOverflowScreen) {
      // Signals from MainScreen or OverflowScreen go to Operator and LAN server
      if (operatorWindow && !operatorWindow.isDestroyed()) {
        operatorWindow.webContents.send('participants:signal', msg);
      }
      remoteServer?.sendParticipantSignalFromDesktop(msg);
      return;
    }

    // Signals from OperatorConsole
    if (
      (msg.type === 'RTC_OFFER' || msg.type === 'RTC_ANSWER' || msg.type === 'RTC_ICE') &&
      msg.toId === 'screen:main'
    ) {
      if (mainScreenWindow && !mainScreenWindow.isDestroyed()) {
        mainScreenWindow.webContents.send('participants:signal', msg);
      }
      return;
    }

    if (
      (msg.type === 'RTC_OFFER' || msg.type === 'RTC_ANSWER' || msg.type === 'RTC_ICE') &&
      msg.toId === 'screen:overflow'
    ) {
      if (overflowScreenWindow && !overflowScreenWindow.isDestroyed()) {
        overflowScreenWindow.webContents.send('participants:signal', msg);
      }
      return;
    }

    if (msg.type === 'PARTICIPANT_STATE') {
      if (mainScreenWindow && !mainScreenWindow.isDestroyed()) {
        mainScreenWindow.webContents.send('participants:signal', msg);
      }
      if (overflowScreenWindow && !overflowScreenWindow.isDestroyed()) {
        overflowScreenWindow.webContents.send('participants:signal', msg);
      }
    }

    remoteServer?.sendParticipantSignalFromDesktop(msg);
  });

  ipcMain.handle('media:save', (_event, payload: { name: string; data: Uint8Array }) => {
    if (!remoteServer) {
      throw new Error('Local media server is not running.');
    }
    return remoteServer.saveMediaFile(payload.name, payload.data);
  });

  ipcMain.handle('media:listImages', () => {
    if (!remoteServer) {
      return [];
    }
    return remoteServer.listMediaImages();
  });

  ipcMain.handle('media:delete', (_event, fileName: string) => {
    if (!remoteServer) {
      return false;
    }
    return remoteServer.deleteMediaFile(fileName);
  });

  const secretsPath = path.join(app.getPath('userData'), 'secrets.json');
  const readSecrets = (): Record<string, string> => {
    try {
      if (!fs.existsSync(secretsPath)) return {};
      return JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  };

  ipcMain.handle('secrets:get', (_event, key: string): string | null => {
    if (!key || typeof key !== 'string') return null;
    const store = readSecrets();
    const encoded = store[key];
    if (!encoded) return null;
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
      }
      return encoded;
    } catch {
      return null;
    }
  });

  ipcMain.handle('secrets:set', (_event, payload: { key: string; value: string | null }): boolean => {
    if (!payload?.key || typeof payload.key !== 'string') return false;
    const store = readSecrets();
    if (!payload.value) {
      delete store[payload.key];
    } else if (safeStorage.isEncryptionAvailable()) {
      store[payload.key] = safeStorage.encryptString(payload.value).toString('base64');
    } else {
      store[payload.key] = payload.value;
    }
    fs.writeFileSync(secretsPath, JSON.stringify(store), { mode: 0o600 });
    return true;
  });
}

if (gotSingleInstanceLock) {
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    if (isDev && fs.existsSync(devIconPath)) {
      app.dock?.setIcon(devIconPath);
    }
    // Set the About panel title, copyright, and link explicitly without calling app.setName(),
    // which would change app.getPath('userData') and orphan existing user data.
    app.setAboutPanelOptions({
      applicationName: 'UECFI Presenter',
      applicationVersion: app.getVersion(),
      copyright: 'Copyright © 2026 by Kurog',
      credits: 'https://apps.uecfi.net',
      website: 'https://apps.uecfi.net'
    });
  }

  // Ensure native Cut/Copy/Paste/Select All shortcuts work in all inputs on macOS & Windows.
  // In packaged builds, omit Reload / Force Reload / DevTools from View so accidental
  // Ctrl+R / Cmd+R cannot reload the Operator Console mid-service.
  const macAppMenuTemplate: Electron.MenuItemConstructorOptions = {
    label: 'UECFI Presenter',
    submenu: [
      { label: 'About UECFI Presenter', click: () => openAboutWindow() },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: 'Hide UECFI Presenter' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: 'Quit UECFI Presenter' }
    ]
  };
  const viewMenuTemplate: Electron.MenuItemConstructorOptions = isDev
    ? { role: 'viewMenu' }
    : {
        label: 'View',
        submenu: [
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [macAppMenuTemplate] : []),
      { role: 'editMenu' as const },
      viewMenuTemplate,
      { role: 'windowMenu' as const }
    ])
  );

  const mediaDir = path.join(app.getPath('userData'), 'media');
  fs.mkdirSync(mediaDir, { recursive: true });

  protocol.handle('uecfi-media', async (request) => {
    try {
      const reqUrl = new URL(request.url);
      const safeFile = path.basename(reqUrl.pathname);
      const targetPath = path.join(mediaDir, safeFile);
      if (!safeFile || !fs.existsSync(targetPath)) {
        return new Response('Not Found', { status: 404 });
      }
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        return new Response('Not Found', { status: 404 });
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
          if (start >= stat.size || start > end) {
            return new Response(null, {
              status: 416,
              headers: {
                'Content-Range': `bytes */${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
          const chunkSize = end - start + 1;
          const webStream = Readable.toWeb(
            fs.createReadStream(targetPath, { start, end })
          ) as ReadableStream;
          return new Response(webStream, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(chunkSize),
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }

      const webStream = Readable.toWeb(fs.createReadStream(targetPath)) as ReadableStream;
      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });

  registerIpcHandlers();

  const cspDirectives = [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline' http://localhost:5173" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' uecfi-media: data: blob: http://127.0.0.1:* https://api.iconify.design https://pixabay.com https://cdn.pixabay.com",
    "media-src 'self' uecfi-media: blob: mediastream: http://127.0.0.1:*",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      'wss: ws:',
      'https:',
      'uecfi-media:',
      'http://127.0.0.1:*',
      'https://generativelanguage.googleapis.com',
      'https://api.groq.com',
      ...(isDev ? ['http://localhost:5173', 'ws://localhost:5173'] : [])
    ].join(' '),
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ');

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem') {
      callback(true);
      return;
    }
    callback(false);
  });

  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('camera').catch(() => {});
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isRendererDoc =
      details.url.startsWith('file://') || details.url.startsWith('http://localhost:5173');
    if (!isRendererDoc) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives]
      }
    });
  });

  remoteServer = new LocalRemoteServer({
    port: 4850,
    distDir,
    mediaDir,
    whitelistPath: path.join(app.getPath('userData'), 'whitelisted-devices.json'),
    isDev,
    onClientCountChange: (count) => {
      remoteInfo.connectedClients = count;
      if (operatorWindow && !operatorWindow.isDestroyed()) {
        operatorWindow.webContents.send('remote:clientCount', count);
      }
    },
    onRemoteCommand: (cmd) => {
      if (operatorWindow && !operatorWindow.isDestroyed()) {
        operatorWindow.webContents.send('remote:command', cmd);
      }
    },
    onWhitelistChange: (devices) => {
      if (operatorWindow && !operatorWindow.isDestroyed()) {
        operatorWindow.webContents.send('remote:whitelistChanged', devices);
      }
    },
    onChatMessage: (msg) => {
      if (operatorWindow && !operatorWindow.isDestroyed()) {
        operatorWindow.webContents.send('remote:chatMessage', msg);
      }
    },
    onParticipantSignal: (msg) => {
      if (
        (msg.type === 'RTC_OFFER' || msg.type === 'RTC_ANSWER' || msg.type === 'RTC_ICE') &&
        msg.toId === 'screen:main'
      ) {
        if (mainScreenWindow && !mainScreenWindow.isDestroyed()) {
          mainScreenWindow.webContents.send('participants:signal', msg);
        }
        return;
      }
      if (operatorWindow && !operatorWindow.isDestroyed()) {
        operatorWindow.webContents.send('participants:signal', msg);
      }
    }
  });

  try {
    const started = await remoteServer.start();
    remoteInfo = {
      ...remoteInfo,
      ...started,
      serverError: null
    };
  } catch (err) {
    console.error('Failed to start LocalRemoteServer:', err);
    remoteInfo = {
      ...remoteInfo,
      serverError: err instanceof Error ? err.message : String(err)
    };
  }

  createOperatorWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOperatorWindow();
    }
  });
});
}

app.on('before-quit', () => {
  if (displaySleepBlockerId !== null && powerSaveBlocker.isStarted(displaySleepBlockerId)) {
    powerSaveBlocker.stop(displaySleepBlockerId);
    displaySleepBlockerId = null;
  }
  remoteServer?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
