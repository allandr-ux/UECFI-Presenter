/**
 * UECFI Storage & Platform Abstraction Layer
 * 
 * Provides a unified API for data storage, file reading/writing, and database operations.
 * Allows UECFI Presenter to run seamlessly both in Electron (Node.js runtime) and in standard
 * web browser environments (NGINX, Apache, cPanel, static servers) using IndexedDB, localStorage,
 * and Fetch API.
 */
(function(global) {
  'use strict';

  // Detect runtime environment
  const isElectron = (typeof process !== 'undefined' && process.versions && !!process.versions.electron);
  const isNode = (typeof require === 'function');
  const hasIndexedDB = (typeof indexedDB !== 'undefined');
  const hasLocalStorage = (typeof localStorage !== 'undefined');

  const DB_NAME = 'uecfi_presenter_db';
  const DB_VERSION = 1;
  const STORE_FILES = 'files';
  const STORE_KV = 'keyval';

  let idbPromise = null;

  // Initialize IndexedDB database for browser mode
  function getIDB() {
    if (!hasIndexedDB) return Promise.reject(new Error('IndexedDB not supported'));
    if (idbPromise) return idbPromise;

    idbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          db.createObjectStore(STORE_FILES, { keyPath: 'path' });
        }
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
    return idbPromise;
  }

  // App root directory, anchored to the loaded HTML file. Deterministic on
  // every platform, packaged or dev -- unlike process.cwd(), which depends
  // on how the app was launched (notably unreliable for installed
  // Windows builds).
  function appRootDir() {
    try {
      if (typeof window !== "undefined" && window.location && /^file:/i.test(window.location.href || "")) {
        const path = require("path");
        let p = "";
        try {
          p = decodeURIComponent(window.location.pathname || "");
        } catch (e) {
          p = window.location.pathname || "";
        }
        p = p.replace(/^\/([A-Za-z]:\/)/, "$1");
        return path.dirname(p);
      }
    } catch (e) {}
    try {
      if (typeof __dirname === "string" && __dirname) return __dirname;
    } catch (e) {}
    try {
      if (typeof process !== "undefined" && process.cwd) return process.cwd();
    } catch (e) {}
    return ".";
  }

  // Convert a filesystem path to a fetch/XHR/img-safe file:// URL.
  // Relative paths pass through (they resolve against the document on any
  // platform). Native absolute paths -- including Windows backslash and
  // drive-letter forms, which XHR cannot parse -- are normalized.
  function fileUrlFromPath(p) {
    try {
      let s = String(p == null ? "" : p);
      if (/^file:\/\//i.test(s)) s = s.replace(/^file:\/+/i, "");
      const absWin = /^[A-Za-z]:[\\/]/.test(s) || s.indexOf(":\\") >= 0;
      if (!absWin && s.charAt(0) !== "/") return p;
      s = s.replace(/\\/g, "/");
      if (/^[A-Za-z]:\//.test(s)) return encodeURI("file:///" + s);
      if (s.charAt(0) !== "/") return encodeURI("file:///" + s);
      return encodeURI("file://" + s);
    } catch (e) {
      return p;
    }
  }

  const AppStorage = {
    isElectron: isElectron,
    isWeb: !isElectron,

    /**
     * App root directory, anchored to the loaded HTML file. Deterministic
     * on every platform, packaged or dev -- unlike process.cwd(), which
     * depends on how the app was launched (notably unreliable for
     * installed Windows builds).
     */
    appDir: appRootDir,

    /**
     * Convert a filesystem path to a fetch/XHR/img-safe file:// URL.
     * Relative paths pass through (they resolve against the document on
     * any platform). Native absolute paths -- including Windows backslash
     * and drive-letter forms, which XHR cannot parse -- are normalized.
     */
    toFileUrl: fileUrlFromPath,

    /**
     * Reads a text file.
     * Uses Node.js fs when available; falls back to IndexedDB -> localStorage -> Fetch API.
     */
    async readFile(filePath) {
      if (isNode) {
        try {
          const fs = require('fs');
          const path = require('path');
          const cleanPath = filePath.startsWith('file://') ? filePath.replace('file://', '') : filePath;
          const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(appRootDir(), cleanPath);
          if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf8');
          }
        } catch (e) {
          console.warn('[STORAGE] Node fs readFile failed, falling back:', e);
        }
      }

      // Check IndexedDB
      if (hasIndexedDB) {
        try {
          const db = await getIDB();
          const content = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readonly');
            const req = tx.objectStore(STORE_FILES).get(filePath);
            req.onsuccess = () => resolve(req.result ? req.result.content : null);
            req.onerror = () => reject(req.error);
          });
          if (content !== null) return content;
        } catch (e) {
          console.warn('[STORAGE] IndexedDB read failed:', e);
        }
      }

      // Check localStorage
      if (hasLocalStorage) {
        const lsKey = 'uecfi_file_' + filePath.replace(/^[\.\/]+/, '');
        const val = localStorage.getItem(lsKey);
        if (val !== null) return val;
      }

      // Web Fetch fallback for static files (e.g. content/*.txt, xml/*.xml).
      // Native absolute paths (Windows backslashes/drive letters) must be
      // converted to file:// URLs or fetch cannot parse them.
      try {
        const res = await fetch(fileUrlFromPath(filePath));
        if (res.ok) {
          return await res.text();
        }
      } catch (err) {
        console.warn('[STORAGE] Fetch fallback failed for ' + filePath, err);
      }

      throw new Error(`File not found: ${filePath}`);
    },

    /**
     * Writes a text file.
     * Uses Node.js fs in Electron; IndexedDB and localStorage in web browsers.
     */
    async writeFile(filePath, content) {
      if (isNode) {
        try {
          const fs = require('fs');
          const path = require('path');
          const cleanPath = filePath.startsWith('file://') ? filePath.replace('file://', '') : filePath;
          const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(appRootDir(), cleanPath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content, 'utf8');
        } catch (e) {
          console.warn('[STORAGE] Node fs writeFile failed:', e);
        }
      }

      // Save to IndexedDB for persistent browser storage
      if (hasIndexedDB) {
        try {
          const db = await getIDB();
          await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_FILES, 'readwrite');
            const req = tx.objectStore(STORE_FILES).put({ path: filePath, content, updatedAt: Date.now() });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        } catch (e) {
          console.warn('[STORAGE] IndexedDB write failed:', e);
        }
      }

      // Mirror to localStorage for instant synchronous fallback availability
      if (hasLocalStorage) {
        try {
          const lsKey = 'uecfi_file_' + filePath.replace(/^[\.\/]+/, '');
          localStorage.setItem(lsKey, typeof content === 'string' ? content : JSON.stringify(content));
        } catch (e) {
          console.warn('[STORAGE] localStorage quota exceeded or error:', e);
        }
      }

      return true;
    },

    /**
     * Synchronous getItem helper with universal fallback.
     */
    getItem(key, defaultVal = null) {
      if (hasLocalStorage) {
        try {
          const v = localStorage.getItem(key);
          return v !== null ? v : defaultVal;
        } catch (e) {
          return defaultVal;
        }
      }
      return defaultVal;
    },

    /**
     * Synchronous setItem helper with universal fallback.
     */
    setItem(key, value) {
      if (hasLocalStorage) {
        try {
          localStorage.setItem(key, String(value));
          return true;
        } catch (e) {
          console.warn('[STORAGE] setItem error:', e);
          return false;
        }
      }
      return false;
    },

    /**
     * Resolves a relative or storage path to an absolute path.
     */
    resolvePath(...parts) {
      if (isNode) {
        const path = require('path');
        return path.join(appRootDir(), ...parts);
      }
      return parts.join('/').replace(/\/+/g, '/');
    },

    /**
     * Resolves a path under the user/storage directory.
     */
    resolveStoragePath(...parts) {
      return this.resolvePath('storage', ...parts);
    },

    /**
     * Checks if a file exists synchronously.
     */
    existsSync(filePath) {
      if (isNode) {
        try {
          const fs = require('fs');
          const path = require('path');
          const cleanPath = filePath.startsWith('file://') ? filePath.replace('file://', '') : filePath;
          const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(appRootDir(), cleanPath);
          return fs.existsSync(fullPath);
        } catch (e) {
          return false;
        }
      }
      const lsKey = 'uecfi_file_' + filePath.replace(/^[\.\/]+/, '');
      return localStorage.getItem(lsKey) !== null;
    },

    /**
     * Copies a file from src to dest.
     */
    copyFile(src, dest, overwrite = true) {
      if (isNode) {
        try {
          const fs = require('fs');
          const path = require('path');
          const anchor = (f) => {
            let c = f.startsWith('file://') ? f.replace('file://', '') : f;
            if (!path.isAbsolute(c)) c = path.join(appRootDir(), c);
            return c;
          };
          const cleanSrc = anchor(src);
          const cleanDest = anchor(dest);
          if (!overwrite && fs.existsSync(cleanDest)) return false;
          fs.mkdirSync(path.dirname(cleanDest), { recursive: true });
          fs.copyFileSync(cleanSrc, cleanDest);
          return true;
        } catch (e) {
          console.error('[STORAGE] copyFile error:', e);
          return false;
        }
      }
      return false;
    },

    /**
     * Deletes a file everywhere it may live: disk (Node/Electron) AND the
     * IndexedDB + localStorage mirrors that writeFile maintains. Skipping the
     * mirrors would leave deleted content readable through the readFile
     * fallback chain, so they are purged on every runtime, unconditionally.
     */
    deleteFile(filePath) {
      if (isNode) {
        try {
          const fs = require('fs');
          const cleanPath = filePath.startsWith('file://') ? filePath.replace('file://', '') : filePath;
          if (fs.existsSync(cleanPath)) {
            fs.unlinkSync(cleanPath);
          }
        } catch (e) {
          console.error('[STORAGE] deleteFile error:', e);
        }
      }
      if (hasIndexedDB) {
        try {
          getIDB().then((db) => {
            try {
              const tx = db.transaction(STORE_FILES, 'readwrite');
              tx.objectStore(STORE_FILES).delete(filePath);
            } catch (e) {}
          }).catch(() => {});
        } catch (e) {}
      }
      if (hasLocalStorage) {
        try {
          const lsKey = 'uecfi_file_' + filePath.replace(/^[\.\/]+/, '');
          localStorage.removeItem(lsKey);
        } catch (e) {}
      }
      return true;
    },

    /**
     * Reads a directory synchronously (returns file names array).
     */
    listDirectory(dirPath) {
      if (isNode) {
        try {
          const fs = require('fs');
          const cleanPath = dirPath.startsWith('file://') ? dirPath.replace('file://', '') : dirPath;
          if (fs.existsSync(cleanPath) && fs.statSync(cleanPath).isDirectory()) {
            return fs.readdirSync(cleanPath);
          }
        } catch (e) {
          console.error('[STORAGE] listDirectory error:', e);
        }
      }
      return [];
    }
  };

  global.AppStorage = AppStorage;
})(typeof window !== 'undefined' ? window : this);
