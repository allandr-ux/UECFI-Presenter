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
      const nodeMajor = (typeof process !== 'undefined' && process.versions && process.versions.node)
        ? parseInt(process.versions.node.split('.')[0], 10)
        : 0;
      const isElectron = (typeof process !== 'undefined' && process.versions && !!process.versions.electron);
      // better-sqlite3 v13 requires Node >= 22 (N-API 10+). In Electron 33 (Node 20),
      // attempting to load this native addon crashes the renderer process with exit code -36861.
      if (!isElectron && nodeMajor >= 22) {
        Database = require('better-sqlite3');
      }
    } catch(e) {
      console.warn('[AppDB] better-sqlite3 could not be loaded directly:', e);
      Database = null;
    }
  }

  // Cache open database connections by path
  const dbCache = new Map();

  function createPersistentJsonDb(dbFilePath, fsMod, pathMod) {
    const lsKey = 'uecfi_jsondb_' + String(dbFilePath || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const jsonPath = dbFilePath ? (dbFilePath + '.json') : null;
    let state = { nextId: 1, tables: { sm: [], sch: [] } };

    function loadState() {
      try {
        if (fsMod && jsonPath && fsMod.existsSync(jsonPath)) {
          const parsed = JSON.parse(fsMod.readFileSync(jsonPath, 'utf8'));
          if (parsed && parsed.tables) {
            state = parsed;
            if (!state.tables.sch) state.tables.sch = [];
            if (!state.tables.sm) state.tables.sm = [];
            if (!state.nextId) {
              const maxSm = state.tables.sm.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
              const maxSch = state.tables.sch.reduce((m, r) => Math.max(m, Number(r.schId) || 0), 0);
              state.nextId = Math.max(maxSm, maxSch, 0) + 1;
            }
            return;
          }
        }
      } catch (e) {}
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(lsKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.tables) {
              state = parsed;
              if (!state.tables.sch) state.tables.sch = [];
              if (!state.tables.sm) state.tables.sm = [];
              return;
            }
          }
        }
      } catch (e) {}
    }

    function saveState() {
      try {
        if (fsMod && pathMod && jsonPath) {
          fsMod.mkdirSync(pathMod.dirname(jsonPath), { recursive: true });
          fsMod.writeFileSync(jsonPath, JSON.stringify(state, null, 2), 'utf8');
        }
      } catch (e) {}
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(lsKey, JSON.stringify(state));
        }
      } catch (e) {}
    }

    loadState();

    return {
      exec: () => {},
      pragma: () => {},
      prepare(sql) {
        const s = String(sql || '').trim();
        return {
          run(params = []) {
            const p = Array.isArray(params) ? params : [params];

            // --- SM (Songs) Table Operations ---
            if (/^INSERT\s+INTO\s+sm\b/i.test(s)) {
              const id = state.nextId++;
              const hasAudio = p.length >= 9;
              state.tables.sm.push({
                id,
                name: p[0] != null ? String(p[0]) : '',
                cat: p[1] != null ? String(p[1]) : '',
                font: p[2] != null ? String(p[2]) : '',
                bkgndfname: p[3] != null ? String(p[3]) : '',
                key: p[4] != null ? String(p[4]) : '',
                copy: p[5] != null ? String(p[5]) : '',
                notes: p[6] != null ? String(p[6]) : '',
                lyrics: p[7] != null ? String(p[7]) : '',
                audio: hasAudio && p[8] != null ? String(p[8]) : ''
              });
              saveState();
              return { changes: 1, lastInsertRowid: id };
            }
            if (/^UPDATE\s+sm\s+SET\b/i.test(s)) {
              const id = p[p.length - 1];
              const hasAudio = p.length >= 10;
              let changes = 0;
              state.tables.sm = state.tables.sm.map(row => {
                if (row.id == id) {
                  changes++;
                  return {
                    id: row.id,
                    name: p[0] != null ? String(p[0]) : '',
                    cat: p[1] != null ? String(p[1]) : '',
                    font: p[2] != null ? String(p[2]) : '',
                    bkgndfname: p[3] != null ? String(p[3]) : '',
                    key: p[4] != null ? String(p[4]) : '',
                    copy: p[5] != null ? String(p[5]) : '',
                    notes: p[6] != null ? String(p[6]) : '',
                    lyrics: p[7] != null ? String(p[7]) : '',
                    audio: hasAudio ? (p[8] != null ? String(p[8]) : '') : (row.audio || '')
                  };
                }
                return row;
              });
              saveState();
              return { changes, lastInsertRowid: id };
            }
            if (/^DELETE\s+FROM\s+sm\s+WHERE\s+id\s*=/i.test(s)) {
              const before = state.tables.sm.length;
              state.tables.sm = state.tables.sm.filter(r => r.id != p[0]);
              saveState();
              return { changes: before - state.tables.sm.length, lastInsertRowid: 0 };
            }
            if (/^DELETE\s+FROM\s+sm\s+WHERE\s+cat\s*=/i.test(s)) {
              const before = state.tables.sm.length;
              state.tables.sm = state.tables.sm.filter(r => r.cat !== p[0]);
              saveState();
              return { changes: before - state.tables.sm.length, lastInsertRowid: 0 };
            }
            if (/^DELETE\s+FROM\s+sm\b/i.test(s)) {
              const before = state.tables.sm.length;
              state.tables.sm = [];
              saveState();
              return { changes: before, lastInsertRowid: 0 };
            }

            // --- SCH (Schedule) Table Operations ---
            if (/^INSERT\s+INTO\s+sch\b/i.test(s)) {
              const id = state.nextId++;
              state.tables.sch.push({
                schId: id,
                isSong: (p[0] === true || p[0] === 1 || p[0] === '1') ? 1 : 0,
                book: Number(p[1]) || 0,
                ch: Number(p[2]) || 0,
                ver: Number(p[3]) || 0,
                songID: Number(p[4]) || 0,
                sch_order: Number(p[5]) || 0
              });
              saveState();
              return { changes: 1, lastInsertRowid: id };
            }
            if (/^DELETE\s+FROM\s+sch\s+WHERE\s+schId\s*=/i.test(s)) {
              const before = state.tables.sch.length;
              state.tables.sch = state.tables.sch.filter(r => r.schId != p[0]);
              saveState();
              return { changes: before - state.tables.sch.length, lastInsertRowid: 0 };
            }
            if (/^DELETE\s+FROM\s+sch\b/i.test(s)) {
              const before = state.tables.sch.length;
              state.tables.sch = [];
              saveState();
              return { changes: before, lastInsertRowid: 0 };
            }
            if (/^UPDATE\s+sch\s+SET\s+sch_order\s*=/i.test(s)) {
              const val = Number(p[0]) || 0;
              const id = p[1];
              let changes = 0;
              state.tables.sch.forEach(r => {
                if (r.schId == id) {
                  r.sch_order = val;
                  changes++;
                }
              });
              saveState();
              return { changes, lastInsertRowid: id };
            }

            return { changes: 0, lastInsertRowid: 0 };
          },
          all(params = []) {
            const p = Array.isArray(params) ? params : [params];

            // --- SM (Songs) Table Queries ---
            if (/SELECT\s+DISTINCT\s+cat\s+FROM\s+sm/i.test(s)) {
              const cats = Array.from(new Set(state.tables.sm.map(r => r.cat).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }));
              return cats.map(cat => ({ cat }));
            }
            if (/SELECT\s+DISTINCT\s+font\s+FROM\s+sm/i.test(s)) {
              const fonts = Array.from(new Set(state.tables.sm.map(r => r.font).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }));
              return fonts.map(font => ({ font }));
            }
            if (/SELECT\s+\*\s+FROM\s+sm\s+WHERE\s+lyrics\s+LIKE/i.test(s)) {
              const needle = String(p[0] || '').replace(/^%+|%+$/g, '').toLowerCase();
              return state.tables.sm
                .filter(r => (String(r.lyrics || '').toLowerCase().includes(needle) || String(r.name || '').toLowerCase().includes(needle)))
                .sort((a, b) => String(a.name || '').trim().localeCompare(String(b.name || '').trim(), undefined, { sensitivity: 'base' }));
            }
            if (/SELECT\s+\*\s+FROM\s+sm/i.test(s)) {
              if (/ORDER\s+BY\s+id\s+ASC/i.test(s)) {
                return state.tables.sm.slice().sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
              }
              return state.tables.sm.slice().sort((a, b) => String(a.name || '').trim().localeCompare(String(b.name || '').trim(), undefined, { sensitivity: 'base' }));
            }

            // --- SCH (Schedule) Table Queries ---
            if (/SELECT\s+schId\s+FROM\s+sch\s+WHERE\s+isSong\s*=\s*1\s+AND\s+songID\s*=/i.test(s)) {
              const match = state.tables.sch.find(r => (r.isSong == 1 || r.isSong === true) && r.songID == p[0]);
              return match ? [{ schId: match.schId }] : [];
            }
            if (/SELECT\s+schId\s+FROM\s+sch\s+WHERE\s+isSong\s*=\s*0/i.test(s)) {
              const match = state.tables.sch.find(r => (r.isSong == 0 || !r.isSong) && r.book == p[0] && r.ch == p[1] && r.ver == p[2]);
              return match ? [{ schId: match.schId }] : [];
            }
            if (/SELECT\s+\*\s+FROM\s+sch/i.test(s)) {
              return state.tables.sch.slice().sort((a, b) => (Number(a.sch_order) || 0) - (Number(b.sch_order) || 0));
            }

            return [];
          },
          get(params = []) {
            const rows = this.all(params);
            return rows.length > 0 ? rows[0] : null;
          }
        };
      }
    };
  }

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
      const pathMod = isNode ? require('path') : null;
      const fsMod = isNode ? require('fs') : null;
      const appBase = (typeof AppStorage !== "undefined" && AppStorage.appDir)
        ? AppStorage.appDir()
        : ((typeof __dirname === "string" && __dirname) ? __dirname : (typeof process !== 'undefined' && process.cwd ? process.cwd() : '.'));
      const fullPath = (pathMod && !pathMod.isAbsolute(cleanPath)) ? pathMod.join(appBase, cleanPath) : cleanPath;

      if (Database && fsMod && pathMod) {
        try {
          fsMod.mkdirSync(pathMod.dirname(fullPath), { recursive: true });
          rawDb = new Database(fullPath);
          try {
            rawDb.pragma('journal_mode = DELETE');
            rawDb.pragma('synchronous = FULL');
          } catch (pragmaErr) {}
        } catch (err) {
          console.warn('[AppDB] Primary DB open failed at ' + fullPath + ', trying userData fallback:', err);
          if (typeof AppStorage !== 'undefined' && typeof AppStorage.userDataStorageDir === 'function') {
            try {
              const fallbackPath = pathMod.join(AppStorage.userDataStorageDir(), pathMod.basename(pathMod.dirname(fullPath)), pathMod.basename(fullPath));
              fsMod.mkdirSync(pathMod.dirname(fallbackPath), { recursive: true });
              if (!fsMod.existsSync(fallbackPath) && fsMod.existsSync(fullPath)) {
                try { fsMod.copyFileSync(fullPath, fallbackPath); } catch (copyErr) {}
              }
              rawDb = new Database(fallbackPath);
              try {
                rawDb.pragma('journal_mode = DELETE');
                rawDb.pragma('synchronous = FULL');
              } catch (pragmaErr) {}
            } catch (fallbackErr) {
              console.error('[AppDB] Fallback DB open also failed:', fallbackErr);
            }
          }
        }
      }

      if (!rawDb) {
        console.warn('[AppDB] Using persistent JSON fallback for:', fullPath);
        rawDb = createPersistentJsonDb(fullPath, fsMod, pathMod);
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
