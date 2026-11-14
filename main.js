let { app, BrowserWindow, ipcMain } = require('electron');

let path = require("path");
let fs = require("fs");
try {
  fs.writeFileSync(path.join(__dirname, "electron_debug.log"), `[MAIN] Started at ${new Date().toISOString()}\n`);
} catch (e) {}

function logDebug(msg) {
  try {
    fs.appendFileSync(path.join(__dirname, "electron_debug.log"), `[MAIN] ${new Date().toISOString()} - ${msg}\n`);
  } catch (e) {}
}

process.on("uncaughtException", (err) => {
  logDebug(`[UNCAUGHT] ${err && err.stack ? err.stack : err}`);
});
process.on("unhandledRejection", (reason) => {
  logDebug(`[UNHANDLED REJECTION] ${reason}`);
});

app.commandLine.appendSwitch("disable-http-cache");

function createWindow() {
  logDebug("createWindow called");
  const { screen } = require('electron');
  ipcMain.on('get-screens', e => { e.returnValue = screen.getAllDisplays(); });
  logDebug("Creating BrowserWindow...");
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    icon: path.join(__dirname, "app-icon.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  logDebug("BrowserWindow instantiated");

  mainWindow.maximize();
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow.isDestroyed()) mainWindow.show();
  });
  // Fallback to ensure window is visible even if ready-to-show is delayed
  setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 2000);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[MAIN] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    const msg = `Render process gone: reason=${details.reason}, exitCode=${details.exitCode}`;
    console.error(`[MAIN] ${msg}`);
    logDebug(msg);
  });

  mainWindow.webContents.on(
    "console-message",
    (event, level, message, line, sourceId) => {
      console.log(`[Browser Window] ${message}`);
      logDebug(`[Browser Window] ${message}`);
    },
  );

  // Right-click clipboard menu for text fields and selections, so copy/paste
  // is reachable by mouse as well as keyboard (works with the Edit roles).
  mainWindow.webContents.on("context-menu", (event, params) => {
    const { Menu } = require("electron");
    const items = [];
    if (params.isEditable) {
      items.push({ role: "cut", enabled: params.editFlags.canCut });
      items.push({ role: "copy", enabled: params.editFlags.canCopy });
      items.push({ role: "paste", enabled: params.editFlags.canPaste });
      items.push({ type: "separator" });
      items.push({ role: "selectAll", enabled: params.editFlags.canSelectAll });
    } else if (params.selectionText && params.selectionText.trim() !== "") {
      items.push({ role: "copy" });
    }
    if (items.length === 0) return;
    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });

  // Security guard: prevent main controller window from ever navigating away
  // from local application files (file://) to untrusted remote origins while
  // nodeIntegration is enabled. Any external HTTP(S) link is routed to the
  // system browser instead.
  const isSafeLocalUrl = (targetUrl) => {
    if (!targetUrl || typeof targetUrl !== "string") return false;
    return targetUrl.startsWith("file://") || targetUrl === "about:blank";
  };

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isSafeLocalUrl(targetUrl)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(targetUrl)) {
        const { shell } = require("electron");
        shell.openExternal(targetUrl);
      }
    }
  });

  // Only allow local projection windows (e.g. presentation.htm over file://)
  // to spawn child BrowserWindows. External HTTP(S) links are opened safely
  // in the user's default OS browser and denied a BrowserWindow instance.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const targetUrl = (details && details.url) ? details.url : "";
    if (!isSafeLocalUrl(targetUrl)) {
      if (/^https?:\/\//i.test(targetUrl)) {
        const { shell } = require("electron");
        shell.openExternal(targetUrl);
      }
      return { action: "deny" };
    }
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        focusable: false,
        show: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false,
          preload: path.join(__dirname, "preload.js"),
        },
      },
    };
  });

  // Track projection/child windows created from mainWindow
  mainWindow.webContents.on('did-create-window', (childWin) => {
    mainWindow._childWin = childWin;
    // Prevent child projection window from navigating to remote URLs
    childWin.webContents.on("will-navigate", (event, targetUrl) => {
      if (!isSafeLocalUrl(targetUrl)) {
        event.preventDefault();
      }
    });
    // Prevent child projection window from taking focus away from main controller window
    if (typeof childWin.setFocusable === 'function') {
      childWin.setFocusable(false);
    }
    // Ensure mainWindow retains focus
    if (!mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
    childWin.on('closed', () => {
      if (mainWindow._childWin === childWin) {
        mainWindow._childWin = null;
      }
    });
  });

  mainWindow.loadFile("uecfipresenter2.html");
}

ipcMain.on('close-projection-window', () => {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach(w => {
    // If it is not the main window (e.g. child popup window), close it
    if (w.id !== 1 && !w.isDestroyed()) {
      w.close();
    }
  });
});

function getDialogParentWindow(event) {
  try {
    if (event && event.sender) {
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      if (senderWin && !senderWin.isDestroyed()) return senderWin;
    }
  } catch (e) {}
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  const all = BrowserWindow.getAllWindows();
  for (let i = 0; i < all.length; i++) {
    if (all[i] && !all[i].isDestroyed() && all[i].isFocusable()) {
      return all[i];
    }
  }
  return all[0] || null;
}

function normalizeSaveDialogOptions(options) {
  const opts = Object.assign({}, options || {});
  if (opts.defaultPath && typeof opts.defaultPath === 'string' && !path.isAbsolute(opts.defaultPath)) {
    try {
      const baseDir = app.getPath('downloads') || app.getPath('documents') || app.getPath('home');
      opts.defaultPath = path.join(baseDir, opts.defaultPath);
    } catch (e) {
      opts.defaultPath = path.resolve(opts.defaultPath);
    }
  }
  return opts;
}

ipcMain.on('show-open-dialog', (event, options) => {
  const { dialog } = require('electron');
  const win = getDialogParentWindow(event);
  const result = win ? dialog.showOpenDialogSync(win, options || {}) : dialog.showOpenDialogSync(options || {});
  event.returnValue = result && result.length > 0 ? result[0] : null;
});

ipcMain.handle('dialog:show-open', async (event, options) => {
  const { dialog } = require('electron');
  const win = getDialogParentWindow(event);
  const result = win ? await dialog.showOpenDialog(win, options || {}) : await dialog.showOpenDialog(options || {});
  return (!result.canceled && result.filePaths && result.filePaths.length > 0) ? result.filePaths[0] : null;
});

ipcMain.on('show-save-dialog', (event, options) => {
  const { dialog } = require('electron');
  const win = getDialogParentWindow(event);
  const opts = normalizeSaveDialogOptions(options);
  const result = win ? dialog.showSaveDialogSync(win, opts) : dialog.showSaveDialogSync(opts);
  event.returnValue = result || null;
});

ipcMain.handle('dialog:show-save', async (event, options) => {
  const { dialog } = require('electron');
  const win = getDialogParentWindow(event);
  const opts = normalizeSaveDialogOptions(options);
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  return (!result.canceled && result.filePath) ? result.filePath : null;
});

ipcMain.on('set-menu', (event, template) => {
    const { Menu } = require('electron');
    function mapTemplate(tmpl) {
        return tmpl.map(item => {
            let newItem = { ...item };
            if (newItem.submenu) newItem.submenu = mapTemplate(newItem.submenu);
            if (newItem.id) {
                newItem.click = () => {
                    if (event.sender && !event.sender.isDestroyed()) {
                        event.sender.send('menu-click', newItem.id);
                    }
                };
            }
            return newItem;
        });
    }
    const menu = Menu.buildFromTemplate(mapTemplate(template));
    Menu.setApplicationMenu(menu);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

// Guaranteed quit (Cmd+Q / Quit menu): destroy every window, including a
// frameless projection window that may be stuck off-screen on a disconnected
// monitor and would otherwise keep the app alive with no visible UI.
app.on("before-quit", () => {
  try {
    BrowserWindow.getAllWindows().forEach((w) => {
      try {
        w.destroy();
      } catch (e) {}
    });
  } catch (e) {}
});
