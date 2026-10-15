/**
 * UECFI Modern Database Service
 * 
 * Replaces Adobe AIR SQLConnection, SQLStatement, SQLEvent, and SQLErrorEvent.
 * Uses better-sqlite3 in Electron/Node, and provides in-memory fallback for web environments.
 * 
 * Usage:
 *   const db = AppDB.open(dbPath);
 *   const rows = await db.all("SELECT * FROM notes WHERE book = ?", [bookId]);
 *   const row = await db.get("SELECT * FROM notes WHERE id = ?", [id]);
 *   const result = await db.run("INSERT INTO notes (text) VALUES (?)", [text]);
 */
(function(global) {
  'use strict';

  const isNode = (typeof require === 'function');
  let Database = null;
  if (isNode) {
    try {
      Database = require('better-sqlite3');
    } catch(e) {
      console.warn('[AppDB] better-sqlite3 could not be loaded directly:', e);
    }
  }

  // Cache open database connections by path
  const dbCache = new Map();

  class AppDatabaseConnection {
    constructor(filePath, rawDb) {
      this.filePath = filePath;
      this.rawDb = rawDb;
    }

    /**
     * Executes a SELECT query and returns all matching rows.
     */
    async all(sql, params = []) {
      if (!this.rawDb) return [];
      try {
        const stmt = this.rawDb.prepare(sql);
        return stmt.all(params);
      } catch (err) {
        console.error(`[AppDB] all() error on [${sql}]:`, err);
        throw err;
      }
    }

    /**
     * Executes a SELECT query and returns the first row or null.
     */
    async get(sql, params = []) {
      if (!this.rawDb) return null;
      try {
        const stmt = this.rawDb.prepare(sql);
        const result = stmt.get(params);
        return result !== undefined ? result : null;
      } catch (err) {
        console.error(`[AppDB] get() error on [${sql}]:`, err);
        throw err;
      }
    }

    /**
     * Executes an INSERT/UPDATE/DELETE query.
     * Returns { changes: number, lastInsertRowid: number|bigint }.
     */
    async run(sql, params = []) {
      if (!this.rawDb) return { changes: 0, lastInsertRowid: 0 };
      try {
        const stmt = this.rawDb.prepare(sql);
        return stmt.run(params);
      } catch (err) {
        console.error(`[AppDB] run() error on [${sql}]:`, err);
        throw err;
      }
    }

    /**
     * Executes raw DDL or batch SQL (e.g. CREATE TABLE IF NOT EXISTS).
     */
    async exec(sql) {
      if (!this.rawDb) return;
      try {
        this.rawDb.exec(sql);
      } catch (err) {
        console.error(`[AppDB] exec() error:`, err);
        throw err;
      }
    }

    /**
     * Synchronous variants when synchronous execution is necessary.
     */
    execSync(sql) {
      if (!this.rawDb) return;
      return this.rawDb.exec(sql);
    }

    allSync(sql, params = []) {
      if (!this.rawDb) return [];
      return this.rawDb.prepare(sql).all(params);
    }

    getSync(sql, params = []) {
      if (!this.rawDb) return null;
      const res = this.rawDb.prepare(sql).get(params);
      return res !== undefined ? res : null;
    }

    runSync(sql, params = []) {
      if (!this.rawDb) return { changes: 0, lastInsertRowid: 0 };
      return this.rawDb.prepare(sql).run(params);
    }

    close() {
      if (this.rawDb && typeof this.rawDb.close === 'function') {
        try {
          this.rawDb.close();
        } catch(e) {
          console.warn('[AppDB] close error:', e);
        }
      }
      dbCache.delete(this.filePath);
    }
  }

  const AppDB = {
    /**
     * Opens or retrieves a cached database connection.
     */
    open(dbPath) {
      if (!dbPath) throw new Error('Database path must be provided');

      // Normalize path
      let cleanPath = dbPath;
      if (typeof cleanPath === 'object' && cleanPath.nativePath) {
        cleanPath = cleanPath.nativePath;
      }
      if (cleanPath.startsWith('file://')) {
        cleanPath = cleanPath.replace('file://', '');
      }

      if (dbCache.has(cleanPath)) {
        return dbCache.get(cleanPath);
      }

      let rawDb = null;
      if (Database) {
        try {
          const path = require('path');
          const fs = require('fs');
          const appBase = (typeof AppStorage !== "undefined" && AppStorage.appDir) ? AppStorage.appDir() : ((typeof __dirname === "string" && __dirname) ? __dirname : process.cwd());
          const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(appBase, cleanPath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          rawDb = new Database(fullPath);
        } catch (err) {
          console.error('[AppDB] Failed to open database at ' + cleanPath, err);
        }
      } else {
        // In-memory mock for pure web runtime
        console.log('[AppDB] Using in-memory fallback for:', cleanPath);
        rawDb = {
          prepare: () => ({
            run: () => ({ changes: 0, lastInsertRowid: 1 }),
            all: () => [],
            get: () => null
          }),
          exec: () => {}
        };
      }

      const connection = new AppDatabaseConnection(cleanPath, rawDb);
      dbCache.set(cleanPath, connection);
      return connection;
    },

    /**
     * Helper forwarders supporting both AppDB.execSync(conn, sql) and conn.execSync(sql)
     */
    execSync(conn, sql) {
      if (conn && typeof conn.execSync === 'function') {
        return conn.execSync(sql);
      } else if (conn && typeof conn.exec === 'function') {
        return conn.exec(sql);
      }
    },

    allSync(conn, sql, params = []) {
      if (conn && typeof conn.allSync === 'function') {
        return conn.allSync(sql, params);
      }
      return [];
    },

    getSync(conn, sql, params = []) {
      if (conn && typeof conn.getSync === 'function') {
        return conn.getSync(sql, params);
      }
      return null;
    },

    runSync(conn, sql, params = []) {
      if (conn && typeof conn.runSync === 'function') {
        return conn.runSync(sql, params);
      }
      return { changes: 0, lastInsertRowid: 0 };
    }
  };

  global.AppDB = AppDB;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppDB };
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
