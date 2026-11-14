/**
 * Preload script for UECFI Presenter
 * 
 * Securely bridges desktop APIs to the renderer window while isolating renderer context.
 */
const { contextBridge, ipcRenderer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const io = require('socket.io-client');
const SimplePeer = require('simple-peer');

const electronBridge = {
  isElectron: true,
  platform: process.platform,

  getAppVersion() {
    try {
      const pkg = require(path.join(__dirname, 'package.json'));
      if (pkg && pkg.version) return String(pkg.version);
    } catch (e) {}
    return '1.1.0';
  },
  
  getScreens() {
    try {
      return ipcRenderer.sendSync('get-screens') || [];
    } catch (e) {
      console.error('[BRIDGE] getScreens error:', e);
      return [];
    }
  },

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
      console.warn('[BRIDGE] showOpenDialogAsync invoke failed, falling back to sync:', e);
      return this.showOpenDialog(options);
    }
  },

  showSaveDialog(options) {
    try {
      const opts = Object.assign({}, options || {});
      if (opts.defaultPath && typeof opts.defaultPath === 'string' && !path.isAbsolute(opts.defaultPath)) {
        const downloadsDir = path.join(os.homedir(), 'Downloads');
        const baseDir = fs.existsSync(downloadsDir) ? downloadsDir : os.homedir();
        opts.defaultPath = path.join(baseDir, opts.defaultPath);
      }
      return ipcRenderer.sendSync('show-save-dialog', opts);
    } catch (e) {
      console.error('[BRIDGE] showSaveDialog error:', e);
      return null;
    }
  },

  async showSaveDialogAsync(options) {
    const opts = Object.assign({}, options || {});
    try {
      if (opts.defaultPath && typeof opts.defaultPath === 'string' && !path.isAbsolute(opts.defaultPath)) {
        const downloadsDir = path.join(os.homedir(), 'Downloads');
        const baseDir = fs.existsSync(downloadsDir) ? downloadsDir : os.homedir();
        opts.defaultPath = path.join(baseDir, opts.defaultPath);
      }
      return await ipcRenderer.invoke('dialog:show-save', opts);
    } catch (e) {
      console.warn('[BRIDGE] showSaveDialogAsync invoke failed, falling back to sync:', e);
      return this.showSaveDialog(opts);
    }
  },

  closeProjectionWindow() {
    try {
      ipcRenderer.send('close-projection-window');
    } catch (e) {
      console.error('[BRIDGE] closeProjectionWindow error:', e);
    }
  },

  setMenu(template) {
    try {
      ipcRenderer.send('set-menu', template);
    } catch (e) {
      console.error('[BRIDGE] setMenu error:', e);
    }
  },

  onMenuClick(callback) {
    ipcRenderer.on('menu-click', (event, funcName) => {
      if (typeof callback === 'function') callback(funcName);
    });
  },

  openExternal(url) {
    if (url) shell.openExternal(url);
  },

  getNetworkInterfaces() {
    try {
      return os.networkInterfaces();
    } catch(e) {
      return {};
    }
  },

  // Media/P2P capabilities
  io,
  SimplePeer
};

// Expose safely to window
try {
  contextBridge.exposeInMainWorld('electronBridge', electronBridge);
} catch (err) {
  window.electronBridge = electronBridge;
}
