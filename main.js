let { app, BrowserWindow, ipcMain, screen } = require('electron'); ipcMain.on('get-screens', e => { e.returnValue = screen.getAllDisplays(); });
let path = require("path");

app.commandLine.appendSwitch("disable-http-cache");
function createWindow() {
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

  mainWindow.maximize();
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.webContents.on(
    "console-message",
    (event, level, message, line, sourceId) => {
      console.log(`[Browser Window] ${message}`);
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

  mainWindow.webContents.setWindowOpenHandler((details) => { 
    return { 
      action: 'allow', 
      overrideBrowserWindowOptions: { 
        focusable: false,
        show: true,
        webPreferences: { 
          nodeIntegration: true, 
          contextIsolation: false, 
          webSecurity: false 
        } 
      } 
    }; 
  }); 

  // Track projection/child windows created from mainWindow
  mainWindow.webContents.on('did-create-window', (childWin) => {
    mainWindow._childWin = childWin;
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

ipcMain.on('show-open-dialog', (event, options) => {
  const { dialog } = require('electron');
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = dialog.showOpenDialogSync(win, options || {});
  event.returnValue = result && result.length > 0 ? result[0] : null;
});

ipcMain.handle('dialog:show-open', async (event, options) => {
  const { dialog } = require('electron');
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, options || {});
  return (!result.canceled && result.filePaths.length > 0) ? result.filePaths[0] : null;
});

ipcMain.on('show-save-dialog', (event, options) => {
  const { dialog } = require('electron');
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = dialog.showSaveDialogSync(win, options || {});
  event.returnValue = result || null;
});

ipcMain.handle('dialog:show-save', async (event, options) => {
  const { dialog } = require('electron');
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showSaveDialog(win, options || {});
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
