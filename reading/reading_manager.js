/**
 * reading_manager.js
 * Database and state manager for Centro Readings (Doctrines, Principles, Creeds, Responsive Readings).
 * Uses universal AppDB (SQLite with JSON persistence fallback) to store and manage readings.
 */
function readingManagerClass() {
  var activeDbPath = "";
  var dbConn = null;
  var isReady = false;
  var allReadingsResult = { data: [] };
  var categoryResult = { data: [] };
  var searchResult = { data: [] };
  var nameIdCache = {};

  this.init = function(isPrimary) {
    initDatabase();
  };

  this.isReady = function() {
    return isReady;
  };

  this.getAllReadings = function() {
    return allReadingsResult;
  };

  this.getCategoryList = function() {
    return categoryResult;
  };

  this.getReadingObjWithID = function(id) {
    if (!id || !dbConn) return null;
    try {
      var rows = AppDB.allSync(dbConn, "SELECT * FROM rm WHERE id = ?", [Number(id)]);
      if (rows && rows.length > 0) {
        return rowToReadingObj(rows[0]);
      }
    } catch (err) {
      console.error("[ReadingManager] getReadingObjWithID error:", err);
    }
    return null;
  };

  this.search = function(query) {
    if (!dbConn) return;
    try {
      var cleanQuery = String(query || "").trim();
      if (!cleanQuery) {
        if (typeof readingNavObj !== "undefined" && readingNavObj && readingNavObj.updateReadingList) {
          readingNavObj.updateReadingList(allReadingsResult, "_ALL");
        }
        return;
      }
      var pattern = "%" + cleanQuery + "%";
      var rows = AppDB.allSync(
        dbConn,
        "SELECT * FROM rm WHERE lyrics LIKE ? OR name LIKE ? ORDER BY name COLLATE NOCASE ASC",
        [pattern, pattern]
      );
      searchResult = { data: sortRowsCaseInsensitive(rows || []) };
      if (typeof readingNavObj !== "undefined" && readingNavObj && readingNavObj.searchComplete) {
        readingNavObj.searchComplete(searchResult);
      }
    } catch (err) {
      console.error("[ReadingManager] search error:", err);
    }
  };

  this.saveReading = function(obj) {
    if (!obj) return false;
    if (obj.id) {
      return updateReadingRecord(obj);
    } else {
      return insertReadingRecord(obj);
    }
  };

  this.deleteReading = function(id) {
    if (!id || !dbConn) return false;
    try {
      AppDB.runSync(dbConn, "DELETE FROM rm WHERE id = ?", [Number(id)]);
      refreshCategories();
      refreshAllReadings();
      persistMirror();
      return true;
    } catch (err) {
      console.error("[ReadingManager] deleteReading error:", err);
      return false;
    }
  };



  // --- Internal Database Helpers ---

  function initDatabase() {
    activeDbPath = (typeof AppStorage !== "undefined" && AppStorage.resolveStoragePath)
      ? AppStorage.resolveStoragePath("readings", "default.db")
      : "storage/readings/default.db";

    try {
      dbConn = AppDB.open(activeDbPath);
      isReady = true;
      createTable();
    } catch (err) {
      console.error("[ReadingManager] Error opening database at " + activeDbPath + ":", err);
      isReady = false;
    }
  }

  function createTable() {
    try {
      var sql = "CREATE TABLE IF NOT EXISTS rm (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, cat TEXT, bkgndfname TEXT, notes TEXT, lyrics TEXT)";
      AppDB.execSync(dbConn, sql);
      restoreFromMirrorIfNeeded();
      refreshCategories();
      refreshAllReadings();
    } catch (err) {
      console.error("[ReadingManager] createTable error:", err);
    }
  }

  function insertReadingRecord(obj, silent) {
    try {
      var rawLyrics = obj.lyrics || (Array.isArray(obj.slides) ? obj.slides.join("<slide>") : "");
      var sql = "INSERT INTO rm (name, cat, bkgndfname, notes, lyrics) VALUES (?, ?, ?, ?, ?)";
      var res = AppDB.runSync(dbConn, sql, [
        obj.name || "Untitled",
        obj.catIndex || "Doctrines",
        obj.bkgnd_fname || "",
        obj.notes || "",
        rawLyrics
      ]);

      refreshCategories();
      refreshAllReadings();
      persistMirror();

      if (!silent) {
        alert('Reading "' + (obj.name || "") + '" added.');
      }
      return res && res.lastInsertRowid ? Number(res.lastInsertRowid) : true;
    } catch (err) {
      console.error("[ReadingManager] INSERT error:", err);
      if (!silent) alert("Error saving reading: " + (err && err.message ? err.message : err));
      return false;
    }
  }

  function updateReadingRecord(obj) {
    try {
      var rawLyrics = obj.lyrics || (Array.isArray(obj.slides) ? obj.slides.join("<slide>") : "");
      var sql = "UPDATE rm SET name=?, cat=?, bkgndfname=?, notes=?, lyrics=? WHERE id=?";
      AppDB.runSync(dbConn, sql, [
        obj.name || "Untitled",
        obj.catIndex || "Doctrines",
        obj.bkgnd_fname || "",
        obj.notes || "",
        rawLyrics,
        Number(obj.id)
      ]);

      refreshCategories();
      refreshAllReadings();
      persistMirror();
      alert('Reading "' + (obj.name || "") + '" updated.');
      return true;
    } catch (err) {
      console.error("[ReadingManager] UPDATE error:", err);
      alert("Error updating reading: " + (err && err.message ? err.message : err));
      return false;
    }
  }

  function refreshAllReadings() {
    if (!dbConn) return;
    try {
      var rows = AppDB.allSync(dbConn, "SELECT * FROM rm ORDER BY name COLLATE NOCASE ASC");
      allReadingsResult = { data: sortRowsCaseInsensitive(rows || []) };
      updateNameIdCache();
      if (typeof readingNavObj !== "undefined" && readingNavObj && readingNavObj.updateReadingList) {
        readingNavObj.updateReadingList(allReadingsResult, "_ALL");
      }
    } catch (err) {
      console.error("[ReadingManager] refreshAllReadings error:", err);
    }
  }

  function refreshCategories() {
    if (!dbConn) return;
    try {
      var rows = AppDB.allSync(dbConn, "SELECT DISTINCT cat FROM rm ORDER BY cat COLLATE NOCASE ASC");
      categoryResult = { data: rows || [] };
      if (typeof readingNavObj !== "undefined" && readingNavObj && readingNavObj.updateCategoryList) {
        readingNavObj.updateCategoryList(categoryResult);
      }
    } catch (err) {
      console.error("[ReadingManager] refreshCategories error:", err);
    }
  }

  function updateNameIdCache() {
    nameIdCache = {};
    if (allReadingsResult && allReadingsResult.data) {
      allReadingsResult.data.forEach(function(row) {
        if (row && row.name) {
          nameIdCache[row.name.toLowerCase().trim()] = row.id;
        }
      });
    }
  }

  function rowToReadingObj(row) {
    var obj = new readingObj();
    obj.id = row.id;
    obj.name = row.name || "";
    obj.catIndex = row.cat || "Doctrines";
    obj.bkgnd_fname = row.bkgndfname || "";
    obj.notes = row.notes || "";
    obj.lyrics = row.lyrics || "";
    obj.slides = splitSlides(row.lyrics);
    return obj;
  }

  function splitSlides(raw) {
    if (!raw) return [""];
    return String(raw).split(/<slide>/gi).map(function(s) {
      return s.trim();
    });
  }

  function sortRowsCaseInsensitive(rows) {
    return rows.slice().sort(function(a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
    });
  }

  function persistMirror() {
    try {
      if (typeof AppStorage !== "undefined" && AppStorage.resolveStoragePath) {
        var mirrorPath = AppStorage.resolveStoragePath("readings", "readings_backup.json");
        var fs = (typeof require === "function") ? require("fs") : null;
        if (fs && allReadingsResult && allReadingsResult.data) {
          fs.writeFileSync(mirrorPath, JSON.stringify(allReadingsResult.data, null, 2), "utf8");
        }
      }
    } catch (e) {}
  }

  function restoreFromMirrorIfNeeded() {
    try {
      var rowCount = AppDB.allSync(dbConn, "SELECT COUNT(*) as cnt FROM rm");
      if (rowCount && rowCount[0] && rowCount[0].cnt > 0) return;

      if (typeof AppStorage !== "undefined" && AppStorage.resolveStoragePath) {
        var mirrorPath = AppStorage.resolveStoragePath("readings", "readings_backup.json");
        var fs = (typeof require === "function") ? require("fs") : null;
        if (fs && fs.existsSync(mirrorPath)) {
          var backup = JSON.parse(fs.readFileSync(mirrorPath, "utf8"));
          if (Array.isArray(backup) && backup.length > 0) {
            backup.forEach(function(r) {
              AppDB.runSync(dbConn, "INSERT INTO rm (name, cat, bkgndfname, notes, lyrics) VALUES (?, ?, ?, ?, ?)", [
                r.name || "", r.cat || "Doctrines", r.bkgndfname || "", r.notes || "", r.lyrics || ""
              ]);
            });
          }
        }
      }
    } catch (e) {}
  }
}

if (typeof window !== "undefined") {
  window.readingManagerClass = readingManagerClass;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { readingManagerClass };
}
