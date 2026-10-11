/**
 * Preload script for UECFI Presenter
 * 
 * Securely bridges desktop APIs to the renderer window while isolating renderer context.
 * Exposes window.electronBridge with desktop capabilities:
 * - dialogs: file open/save
 * - screens: monitor detection
 * - menu: application menu actions
 * - projection: closing / controlling projection displays
 * - fs/path/shell wrappers for graceful desktop file and external URL handling
 */
const { contextBridge, ipcRenderer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const electronBridge = {
  isElectron: true,
  platform: process.platform,
  
  // Display & Screen inspection
  getScreens() {
    try {
      return ipcRenderer.sendSync('get-screens') || [];
    } catch (e) {
      console.error('[BRIDGE] getScreens error:', e);
      return [];
    }
  },

  // Native Open File Dialog
  showOpenDialog(options) {
    try {
      return ipcRenderer.sendSync('show-open-dialog', options || {});
    } catch (e) {
      console.error('[BRIDGE] showOpenDialog error:', e);
      return null;
    }
  },

  async showOpenDialogAsync(options) {
    try {
      return await ipcRenderer.invoke('dialog:show-open', options || {});
    } catch (e) {
      console.error('[BRIDGE] showOpenDialogAsync error:', e);
      return null;
    }
  },

  // Native Save File Dialog
  showSaveDialog(options) {
    try {
      return ipcRenderer.sendSync('show-save-dialog', options || {});
    } catch (e) {
      console.error('[BRIDGE] showSaveDialog error:', e);
      return null;
    }
  },

  async showSaveDialogAsync(options) {
    try {
      return await ipcRenderer.invoke('dialog:show-save', options || {});
    } catch (e) {
      console.error('[BRIDGE] showSaveDialogAsync error:', e);
      return null;
    }
  },

  // Close Projection Child Window
  closeProjectionWindow() {
    try {
      ipcRenderer.send('close-projection-window');
    } catch (e) {
      console.error('[BRIDGE] closeProjectionWindow error:', e);
    }
  },

  // Set Application Menu
  setMenu(template) {
    try {
      ipcRenderer.send('set-menu', template);
    } catch (e) {
      console.error('[BRIDGE] setMenu error:', e);
    }
  },

  // Menu click events listener
  onMenuClick(callback) {
    ipcRenderer.on('menu-click', (event, funcName) => {
      if (typeof callback === 'function') callback(funcName);
    });
  },

  // External browser URL launcher
  openExternal(url) {
    if (url) shell.openExternal(url);
  },

  // Network info for remote server binding
  getNetworkInterfaces() {
    try {
      return os.networkInterfaces();
    } catch(e) {
      return {};
    }
  }
};

// Expose safely to window
try {
  contextBridge.exposeInMainWorld('electronBridge', electronBridge);
} catch (err) {
  // If contextIsolation is disabled during transitional phase, assign directly
  window.electronBridge = electronBridge;
}
