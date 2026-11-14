/**
 * Song Manager Class (Rebuilt)
 *
 * Manages song database storage, queries, and import/export orchestration.
 * Features synchronous SQLite persistence, cross-build userData + JSON backup
 * mirroring (so songs survive restarts in dev, unpacked, portable, and installed builds),
 * and transactional batch import.
 */
function songManagerClass() {
  this.init = init;
  this.addSong = addSong;
  this.updateSong = updateSong;
  this.deleteSong = deleteSong;
  this.deleteSongByCat = deleteSongByCat;
  this.getSongObj = getSongObj;
  this.getSongsFromCat = getSongsFromCat;
  this.get_sm_cat_records = get_sm_cat_records;
  this.getFontList = getFontList;
  this.searchRecords = searchRecords;
  this.processImportSongDB = processImportSongDB;
  this.processExportSongDB = processExportSongDB;
  this.processExportSongXML = processExportSongXML;
  this.processExportCatXML = processExportCatXML;
  this.processExportSingleSongXML = processExportSingleSongXML;
  this.processImportSongXML = processImportSongXML;
  this.addImportSongs = addImportSongs;
  this.importSongsBatch = importSongsBatch;
  this.getRawSongRows = getRawSongRows;
  this.getDbPath = function () { return activeDbPath; };
  this.getSongObjWithID = getSongObjWithID;
  this.getAllSongs = getAllSongs;
  this.getSongID = getSongID;
  this.checkSongExists = checkSongExists;

  var debugMode = false;
  var isReady = false;
  var dbRelPath = "./song/default.db";
  var activeDbPath = "";
  var dbConn = null;
  var currentCat = "_ALL";
  var currentSong = null;
  var songNames = [];
  var songIds = [];
  var fontList = [];
  var songName;
  var songCat;
  var songFont;
  var songBkgnd;
  var songKey;
  var songCopy;
  var songNotes;
  var songLyrics;
  var songAudio;
  var allSongsResult = { data: [] };
  var searchResult = { data: [] };
  var categoryResult = { data: [] };
  var fontResult = { data: [] };

  var BACKUP_LS_KEY = "uecfi_songs_backup_v2";

  function init() {
    currentSong = new songObj();
    isReady = false;
    openDatabase();
  }

  function log(msg) {
    if (debugMode) {
      console.log("[SongManager] " + msg);
    }
  }

  function joinSlides(slides) {
    if (!slides) return "";
    if (typeof slides === "string") {
      return normalizeLyricsString(slides);
    }
    var cleaned = [];
    for (var i = 0; i < slides.length; i++) {
      var s = String(slides[i] || "").trim();
      if (s.length > 0) {
        cleaned.push(s);
      }
    }
    if (cleaned.length === 0) return "";
    return cleaned.join("<slide>") + "<slide>";
  }

  function normalizeLyricsString(rawLyrics) {
    if (!rawLyrics) return "";
    var str = String(rawLyrics).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    var parts = /<slide>/i.test(str) ? str.split(/<slide>/i) : str.split(/\r?\n\s*\r?\n+/);
    var cleaned = [];
    for (var i = 0; i < parts.length; i++) {
      var s = String(parts[i] || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
      if (!s) continue;
      s = s.replace(/\n/g, "<BR>");
      cleaned.push(s);
    }
    if (cleaned.length === 0) return "";
    return cleaned.join("<slide>") + "<slide>";
  }

  function splitSlides(lyrics) {
    if (!lyrics) return [];
    var rawParts = String(lyrics).split(/<slide>/i);
    var slides = [];
    for (var i = 0; i < rawParts.length; i++) {
      var trimmed = rawParts[i].trim();
      if (trimmed.length > 0) {
        slides.push(rawParts[i]);
      }
    }
    log("Number of slides after splitting: " + slides.length);
    return slides;
  }

  function updateNameIdCache() {
    songNames = [];
    songIds = [];
    if (!allSongsResult || !allSongsResult.data) return;
    var len = allSongsResult.data.length;
    for (var i = 0; i < len; i++) {
      songNames[i] = allSongsResult.data[i].name;
      songIds[i] = allSongsResult.data[i].id;
    }
  }

  function getBackupFilePaths() {
    var paths = [];
    if (typeof require !== "function") return paths;
    try {
      var path = require("path");
      if (activeDbPath) {
        paths.push(path.join(path.dirname(activeDbPath), "songs_backup.json"));
      }
      if (typeof AppStorage !== "undefined" && typeof AppStorage.userDataStorageDir === "function") {
        var uDir = AppStorage.userDataStorageDir();
        var uBackup = path.join(uDir, "song", "songs_backup.json");
        if (paths.indexOf(uBackup) === -1) paths.push(uBackup);
      }
      if (typeof AppStorage !== "undefined" && typeof AppStorage.appDir === "function") {
        var appBackup = path.join(AppStorage.appDir(), "storage", "song", "songs_backup.json");
        if (paths.indexOf(appBackup) === -1) paths.push(appBackup);
      }
    } catch (e) {}
    return paths;
  }

  function persistSongMirror(rows, isIntentionalEmpty) {
    var safeRows = Array.isArray(rows) ? rows : [];
    var payload = JSON.stringify({
      version: 2,
      updatedAt: Date.now(),
      intentionalEmpty: !!isIntentionalEmpty,
      songs: safeRows
    });

    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(BACKUP_LS_KEY, payload);
      }
    } catch (e) {}

    if (typeof require === "function") {
      try {
        var fs = require("fs");
        var path = require("path");
        var backupPaths = getBackupFilePaths();
        for (var i = 0; i < backupPaths.length; i++) {
          try {
            fs.mkdirSync(path.dirname(backupPaths[i]), { recursive: true });
            fs.writeFileSync(backupPaths[i], payload, "utf8");
          } catch (writeErr) {}
        }

        // Also mirror the SQLite file to userDataStorageDir so portable/unpacked/dev stay in sync
        if (activeDbPath && fs.existsSync(activeDbPath) && typeof AppStorage !== "undefined" && typeof AppStorage.userDataStorageDir === "function") {
          var userDbPath = path.join(AppStorage.userDataStorageDir(), "song", "default.db");
          if (path.resolve(activeDbPath).toLowerCase() !== path.resolve(userDbPath).toLowerCase()) {
            try {
              fs.mkdirSync(path.dirname(userDbPath), { recursive: true });
              fs.copyFileSync(activeDbPath, userDbPath);
            } catch (copyErr) {}
          }
        }
      } catch (e) {}
    }
  }

  function loadBackupSnapshot() {
    if (typeof require === "function") {
      try {
        var fs = require("fs");
        var backupPaths = getBackupFilePaths();
        var newest = null;
        for (var i = 0; i < backupPaths.length; i++) {
          if (fs.existsSync(backupPaths[i])) {
            try {
              var parsed = JSON.parse(fs.readFileSync(backupPaths[i], "utf8"));
              if (parsed && Array.isArray(parsed.songs)) {
                if (!newest || (parsed.updatedAt || 0) > (newest.updatedAt || 0)) {
                  newest = parsed;
                }
              }
            } catch (parseErr) {}
          }
        }
        if (newest) return newest;
      } catch (e) {}
    }

    try {
      if (typeof localStorage !== "undefined") {
        var raw = localStorage.getItem(BACKUP_LS_KEY);
        if (raw) {
          var parsedLs = JSON.parse(raw);
          if (parsedLs && Array.isArray(parsedLs.songs)) {
            return parsedLs;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function sortSongRowsCaseInsensitive(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.slice().sort(function (a, b) {
      var nameA = String((a && a.name) || "").trim();
      var nameB = String((b && b.name) || "").trim();
      var cmp = nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      return cmp !== 0 ? cmp : nameA.localeCompare(nameB);
    });
  }

  function restoreFromMirrorIfNeeded() {
    try {
      var currentRows = AppDB.allSync(dbConn, "SELECT * FROM sm ORDER BY name COLLATE NOCASE ASC") || [];
      if (currentRows.length > 0) {
        currentRows = sortSongRowsCaseInsensitive(currentRows);
        persistSongMirror(currentRows, false);
        return;
      }

      var snapshot = loadBackupSnapshot();
      if (snapshot && snapshot.intentionalEmpty) {
        return;
      }

      var songsToRestore = (snapshot && Array.isArray(snapshot.songs) && snapshot.songs.length > 0)
        ? snapshot.songs
        : null;

      // Also check userDataStorageDir SQLite DB if snapshot wasn't created yet
      if (!songsToRestore && typeof require === "function" && typeof AppStorage !== "undefined" && typeof AppStorage.userDataStorageDir === "function") {
        try {
          var path = require("path");
          var fs = require("fs");
          var userDbPath = path.join(AppStorage.userDataStorageDir(), "song", "default.db");
          if (fs.existsSync(userDbPath) && path.resolve(userDbPath).toLowerCase() !== path.resolve(activeDbPath || "").toLowerCase()) {
            var altConn = AppDB.open(userDbPath);
            var altRows = AppDB.allSync(altConn, "SELECT * FROM sm ORDER BY name COLLATE NOCASE ASC") || [];
            if (altRows.length > 0) {
              songsToRestore = sortSongRowsCaseInsensitive(altRows);
            }
          }
        } catch (e) {}
      }

      if (songsToRestore && songsToRestore.length > 0) {
        console.log("[SongManager] Restoring " + songsToRestore.length + " songs from persistent mirror...");
        var insertSql = "INSERT INTO sm (name, cat, font, bkgndfname, key, copy, notes, lyrics, audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try { AppDB.execSync(dbConn, "BEGIN IMMEDIATE"); } catch (e) {}
        for (var i = 0; i < songsToRestore.length; i++) {
          var r = songsToRestore[i];
          AppDB.runSync(dbConn, insertSql, [
            r.name || "",
            r.cat || "Uncategorized",
            r.font || "Arial",
            r.bkgndfname || "",
            r.key || "",
            r.copy || "",
            r.notes || "",
            r.lyrics || "",
            r.audio || ""
          ]);
        }
        try { AppDB.execSync(dbConn, "COMMIT"); } catch (e) {}
      }
    } catch (err) {
      console.warn("[SongManager] restoreFromMirrorIfNeeded warning:", err);
    }
  }

  function invalidateExternalCaches() {
    if (typeof window !== "undefined") {
      window._allSongsCache = null;
    }
  }

  function addSong(song, isLast, isImport) {
    songName = (song && song.name != null) ? String(song.name).trim() : "";
    songCat = (song && song.catIndex != null && String(song.catIndex).trim() !== "") ? String(song.catIndex).trim() : "Uncategorized";
    songFont = (song && song.font != null && String(song.font).trim() !== "") ? String(song.font).trim() : "Arial";
    songBkgnd = (song && song.bkgnd_fname != null) ? String(song.bkgnd_fname).trim() : "";
    if (songBkgnd === "null" || songBkgnd === "undefined") songBkgnd = "";
    songKey = (song && song.key != null) ? String(song.key).trim() : "";
    songCopy = (song && song.copyright != null) ? String(song.copyright).trim() : "";
    songNotes = (song && song.notes != null) ? String(song.notes).trim() : "";
    songAudio = (song && song.audio != null) ? String(song.audio).trim() : "";
    if (isImport) {
      songLyrics = normalizeLyricsString(song.slides);
    } else {
      songLyrics = joinSlides(song.slides);
    }
    insertSongRecord(isLast !== false, !!isImport);
  }

  function importSongsBatch(rawSongs, options) {
    var opts = options || {};
    var stats = { total: 0, added: 0, updated: 0, skipped: 0 };
    if (!Array.isArray(rawSongs) || rawSongs.length === 0) {
      if (opts.showAlert) {
        alert("No valid songs found to import.");
      }
      return stats;
    }

    stats.total = rawSongs.length;

    // Snapshot existing songs in DB prior to this import batch
    var existingRows = [];
    try {
      existingRows = AppDB.allSync(dbConn, "SELECT * FROM sm ORDER BY id ASC") || [];
    } catch (e) {
      existingRows = (allSongsResult && allSongsResult.data) ? allSongsResult.data.slice() : [];
    }

    var existingByName = {};
    for (var eIdx = 0; eIdx < existingRows.length; eIdx++) {
      var er = existingRows[eIdx];
      var eKey = String(er.name || "").trim().toLowerCase();
      if (eKey && !existingByName[eKey]) {
        existingByName[eKey] = er;
      }
    }

    var insertSql = "INSERT INTO sm (name, cat, font, bkgndfname, key, copy, notes, lyrics) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    var updateSql = "UPDATE sm SET name=?, cat=?, font=?, bkgndfname=?, key=?, copy=?, notes=?, lyrics=? WHERE id=?";
    var lastInsertedId = 0;

    var inTx = false;
    try {
      AppDB.execSync(dbConn, "BEGIN IMMEDIATE");
      inTx = true;
    } catch (txErr) {
      inTx = false;
    }

    try {
      for (var i = 0; i < rawSongs.length; i++) {
        var item = rawSongs[i];
        if (!item) continue;

        var name = String(item.name != null ? item.name : (item.Title || "")).trim();
        if (!name) {
          stats.skipped++;
          continue;
        }
        var cat = String(item.cat != null ? item.cat : (item.catIndex != null ? item.catIndex : (item.category || "Uncategorized"))).trim() || "Uncategorized";
        var font = String(item.font || "Arial").trim() || "Arial";
        var bkgnd = String(item.bkgndfname != null ? item.bkgndfname : (item.bkgnd_fname != null ? item.bkgnd_fname : (item.bkgnd || ""))).trim();
        if (bkgnd === "null" || bkgnd === "undefined") bkgnd = "";
        var key = String(item.key || "").trim();
        var copy = String(item.copy != null ? item.copy : (item.copyright || "")).trim();
        var notes = String(item.notes || "").trim();
        var rawLyrics = item.lyrics != null ? item.lyrics : (item.slides || "");
        var lyrics = Array.isArray(rawLyrics) ? joinSlides(rawLyrics) : normalizeLyricsString(rawLyrics);

        var lookupKey = name.toLowerCase();
        var preExisting = existingByName[lookupKey];

        if (preExisting) {
          var existingLyricsNorm = normalizeLyricsString(preExisting.lyrics || "");
          if (existingLyricsNorm === lyrics && String(preExisting.cat || "") === cat) {
            stats.skipped++;
            continue;
          }
          AppDB.runSync(dbConn, updateSql, [name, cat, font, bkgnd, key, copy, notes, lyrics, preExisting.id]);
          lastInsertedId = preExisting.id;
          // Remove from preExisting map so if the import file itself has a second song with the same title (e.g. SPEAKER), both are kept
          delete existingByName[lookupKey];
          stats.updated++;
        } else {
          var runRes = AppDB.runSync(dbConn, insertSql, [name, cat, font, bkgnd, key, copy, notes, lyrics]);
          if (runRes && runRes.lastInsertRowid) {
            lastInsertedId = Number(runRes.lastInsertRowid);
          }
          stats.added++;
        }
      }

      if (inTx) {
        AppDB.execSync(dbConn, "COMMIT");
      }
    } catch (batchErr) {
      if (inTx) {
        try { AppDB.execSync(dbConn, "ROLLBACK"); } catch (rbErr) {}
      }
      console.error("[SongManager] Batch import error:", batchErr);
      if (opts.showAlert) {
        alert("Error importing songs into database: " + (batchErr && batchErr.message ? batchErr.message : batchErr));
      }
      return stats;
    }

    if (lastInsertedId && typeof songEditObj !== "undefined" && songEditObj && songEditObj.setEditPrimaryKey) {
      songEditObj.setEditPrimaryKey(lastInsertedId);
    }

    currentCat = "_ALL";
    invalidateExternalCaches();
    refreshCategories();
    refreshFonts();
    refreshAllSongs();
    persistSongMirror(allSongsResult.data, false);

    if (opts.showAlert) {
      if (stats.added === 0 && stats.updated === 0) {
        alert("All " + stats.total + " song(s) in this file already exist in the Song Database.");
      } else {
        var msg = "Successfully imported " + (stats.added + stats.updated) + " song(s) to the Song Database.";
        if (stats.skipped > 0) {
          msg += " (" + stats.skipped + " duplicate(s) skipped)";
        }
        alert(msg);
      }
    }

    return stats;
  }

  function addImportSongs(importedData) {
    if (!importedData || !Array.isArray(importedData.data)) return;
    importSongsBatch(importedData.data, { source: "import", showAlert: true });
  }

  function updateSong(song, index, specificId) {
    var idToUpdate = null;
    if (specificId == null) {
      idToUpdate = (allSongsResult && allSongsResult.data && allSongsResult.data[index])
        ? allSongsResult.data[index].id
        : null;
    } else {
      idToUpdate = specificId;
    }
    if (idToUpdate == null) return;

    songName = song.name;
    songCat = song.catIndex;
    songFont = song.font;
    songBkgnd = song.bkgnd_fname;
    if (songBkgnd === "null" || songBkgnd === "undefined") songBkgnd = "";
    songKey = song.key;
    songCopy = song.copyright;
    songNotes = song.notes;
    songAudio = (song && song.audio != null) ? String(song.audio).trim() : "";
    songLyrics = joinSlides(song.slides);
    updateSongRecord(idToUpdate);
  }

  function deleteSong(index) {
    if (!allSongsResult || !allSongsResult.data || !allSongsResult.data[index]) return;
    var idToDelete = allSongsResult.data[index].id;
    deleteSongById(idToDelete);
  }

  function deleteSongByCat(cat) {
    deleteSongsByCategory(cat);
  }

  function getSongObjWithID(id) {
    var found = false;
    var obj = new songObj();
    obj.init();
    obj.slides = [];
    if (!allSongsResult || !allSongsResult.data) return null;
    var len = allSongsResult.data.length;
    for (var i = 0; i < len; i++) {
      if (allSongsResult.data[i].id == id) {
        obj.name = allSongsResult.data[i].name;
        obj.catIndex = allSongsResult.data[i].cat;
        obj.font = allSongsResult.data[i].font;
        obj.bkgnd_fname = allSongsResult.data[i].bkgndfname;
        obj.key = allSongsResult.data[i].key;
        obj.copyright = allSongsResult.data[i].copy;
        obj.notes = allSongsResult.data[i].notes;
        obj.audio = allSongsResult.data[i].audio || "";
        obj.slides = splitSlides(allSongsResult.data[i].lyrics);
        found = true;
        break;
      }
    }
    return found ? obj : null;
  }

  function getAllSongs() {
    try {
      if (!allSongsResult || !allSongsResult.data) return [];
      return allSongsResult.data.map(function (row) {
        return {
          id: row.id,
          name: row.name || "Untitled",
          cat: row.cat || "",
          font: row.font || "Arial",
          bkgndfname: row.bkgndfname || "",
          key: row.key || "",
          copy: row.copy || "",
          notes: row.notes || "",
          lyrics: row.lyrics || "",
          slides: splitSlides(row.lyrics)
        };
      });
    } catch (e) {
      return [];
    }
  }

  function getRawSongRows() {
    try {
      var rows = AppDB.allSync(dbConn, "SELECT * FROM sm ORDER BY name COLLATE NOCASE ASC");
      if (Array.isArray(rows)) {
        rows = sortSongRowsCaseInsensitive(rows);
        allSongsResult = { data: rows };
        return rows;
      }
    } catch (e) {}
    return (allSongsResult && Array.isArray(allSongsResult.data))
      ? sortSongRowsCaseInsensitive(allSongsResult.data)
      : [];
  }

  function getSongID(index, fromSearch) {
    var id = 0;
    if (!fromSearch) {
      id = (allSongsResult && allSongsResult.data && allSongsResult.data[index]) ? allSongsResult.data[index].id : 0;
    } else {
      id = (searchResult && searchResult.data && searchResult.data[index]) ? searchResult.data[index].id : 0;
    }
    return id;
  }

  function getSongObj(index, fromSearch) {
    var obj = new songObj();
    obj.init();
    obj.slides = [];
    var sourceData = fromSearch ? searchResult : allSongsResult;
    if (!sourceData || !sourceData.data || !sourceData.data[index]) return obj;
    var row = sourceData.data[index];
    obj.id = row.id;
    obj.name = row.name;
    obj.catIndex = row.cat;
    obj.font = row.font;
    obj.bkgnd_fname = row.bkgndfname;
    obj.key = row.key;
    obj.copyright = row.copy;
    obj.notes = row.notes;
    obj.audio = row.audio || "";
    obj.slides = splitSlides(row.lyrics);
    return obj;
  }

  function getSongsFromCat(cat) {
    currentCat = cat || "_ALL";
    if (typeof songNavObj !== "undefined" && songNavObj && songNavObj.update_songList) {
      songNavObj.update_songList(allSongsResult, currentCat);
    }
  }

  function get_sm_cat_records() {
    return categoryResult;
  }

  function parseFontList() {
    fontList = [];
    if (fontResult && fontResult.data) {
      var len = fontResult.data.length;
      for (var i = 0; i < len; i++) {
        fontList[i] = fontResult.data[i].font;
      }
    }
  }

  function getFontList() {
    return fontList;
  }

  function processImportSongDB() {
    var importer = new songImportClass();
    importer.init();
  }

  async function processExportSongDB() {
    var rows = getRawSongRows();
    if (!rows || rows.length === 0) {
      alert("There are no songs in the database to export.");
      return;
    }
    var now = new Date();
    var dateStr = now.toDateString().replace(/\s+/g, "_");
    var defaultName = "default_songs_" + dateStr + ".db";
    var defaultSavePath = defaultName;
    if (typeof require === "function") {
      try {
        var pathMod = require("path");
        var osMod = require("os");
        var fsMod = require("fs");
        var downloadsDir = pathMod.join(osMod.homedir(), "Downloads");
        var baseDir = fsMod.existsSync(downloadsDir) ? downloadsDir : osMod.homedir();
        defaultSavePath = pathMod.join(baseDir, defaultName);
      } catch (e) {}
    }

    var dialogOpts = {
      title: "Export Song Database (.db)",
      defaultPath: defaultSavePath,
      filters: [{ name: "SQLite Song Database (*.db)", extensions: ["db", "sqlite"] }]
    };

    var hasDesktopSave = (typeof window !== "undefined" && window.electronBridge && (window.electronBridge.showSaveDialogAsync || window.electronBridge.showSaveDialog)) || (typeof require === "function");
    if (hasDesktopSave) {
      try {
        var res = null;
        if (typeof window !== "undefined" && window.electronBridge) {
          if (typeof window.electronBridge.showSaveDialogAsync === "function") {
            res = await window.electronBridge.showSaveDialogAsync(dialogOpts);
          } else if (typeof window.electronBridge.showSaveDialog === "function") {
            res = window.electronBridge.showSaveDialog(dialogOpts);
          }
        }
        if (!res && typeof require === "function") {
          try {
            var ipcRenderer = require("electron").ipcRenderer;
            if (ipcRenderer) res = await ipcRenderer.invoke("dialog:show-save", dialogOpts);
          } catch (ipcErr) {}
        }
        var targetPath = (typeof res === "string") ? res : (res && res.filePath ? res.filePath : null);
        if (!targetPath) return;
        if (!/\.(db|sqlite)$/i.test(targetPath)) {
          targetPath += ".db";
        }

        var copiedOk = false;
        if (typeof require === "function") {
          try {
            var fs = require("fs");
            var path = require("path");
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            var srcDbPath = (dbConn && dbConn.rawDb && typeof dbConn.rawDb.name === "string" && fs.existsSync(dbConn.rawDb.name))
              ? dbConn.rawDb.name
              : activeDbPath;
            if (srcDbPath && fs.existsSync(srcDbPath)) {
              fs.copyFileSync(srcDbPath, targetPath);
              copiedOk = fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0;
            }
          } catch (copyErr) {
            console.warn("[SongManager] Direct fs.copyFileSync failed, trying AppStorage:", copyErr);
          }
        }
        if (!copiedOk) {
          copiedOk = AppStorage.copyFile(activeDbPath, targetPath, true);
        }
        if (!copiedOk) {
          throw new Error("Could not write database file to target location.");
        }
        alert("Song database (" + rows.length + " songs) exported successfully to:\n" + targetPath);
      } catch (err) {
        alert("Unable to export song database: " + (err && err.message ? err.message : err));
      }
    } else {
      var destPath = AppStorage.resolvePath("vvexport", "default_songs.db");
      try {
        AppStorage.copyFile(activeDbPath, destPath, true);
        alert("Song database saved to vvexport folder: " + destPath);
      } catch (err) {
        alert("Unable to save song database: " + err.message);
      }
    }
  }

  function processImportSongXML() {
    var xmlPort = new songPortXML();
    xmlPort.init(allSongsResult, null, null, 1);
    xmlPort.importXML();
  }

  function processExportSongXML() {
    var rows = getRawSongRows();
    var xmlPort = new songPortXML();
    xmlPort.init({ data: rows }, null, null, 1);
    xmlPort.exportAll();
  }

  function processExportCatXML() {
    var rows = getRawSongRows();
    var xmlPort = new songPortXML();
    xmlPort.init({ data: rows }, currentCat, null, 2);
    xmlPort.exportByCat();
  }

  function processExportSingleSongXML() {
    var rows = getRawSongRows();
    var xmlPort = new songPortXML();
    xmlPort.init({ data: rows }, null, null, 3);
    xmlPort.exportSingle();
  }

  function checkSongExists(name) {
    if (!name) return false;
    var target = String(name).trim().toLowerCase();
    if (allSongsResult && allSongsResult.data) {
      var len = allSongsResult.data.length;
      for (var i = 0; i < len; i++) {
        if (String(allSongsResult.data[i].name || "").trim().toLowerCase() === target) {
          return true;
        }
      }
    }
    return false;
  }

  function openDatabase() {
    activeDbPath = (typeof AppStorage !== "undefined" && AppStorage.resolveStoragePath)
      ? AppStorage.resolveStoragePath("song", "default.db")
      : dbRelPath;

    try {
      dbConn = AppDB.open(activeDbPath);
      log("DB opened successfully at: " + activeDbPath);
      isReady = true;
      createTable();
    } catch (err) {
      console.error("[SongManager] Error opening database:", err);
      isReady = false;
    }
  }

  function createTable() {
    try {
      var sql = "CREATE TABLE IF NOT EXISTS sm (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, cat TEXT, font TEXT, bkgndfname TEXT, key TEXT, copy TEXT, notes TEXT, lyrics TEXT, audio TEXT)";
      AppDB.execSync(dbConn, sql);
      try {
        AppDB.execSync(dbConn, "ALTER TABLE sm ADD COLUMN audio TEXT");
      } catch (alterErr) {}
      restoreFromMirrorIfNeeded();
      refreshCategories();
      refreshFonts();
      refreshAllSongs();
    } catch (err) {
      console.error("[SongManager] Error creating table:", err);
    }
  }

  function insertSongRecord(isLast, isImport) {
    try {
      var sql = "INSERT INTO sm (name, cat, font, bkgndfname, key, copy, notes, lyrics, audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
      var runRes = AppDB.runSync(dbConn, sql, [songName, songCat, songFont, songBkgnd, songKey, songCopy, songNotes, songLyrics, songAudio]);

      if (isLast) {
        var lastId = runRes && runRes.lastInsertRowid ? Number(runRes.lastInsertRowid) : 0;
        if (typeof songEditObj !== "undefined" && songEditObj && songEditObj.setEditPrimaryKey) {
          songEditObj.setEditPrimaryKey(lastId);
        }
        invalidateExternalCaches();
        refreshCategories();
        refreshFonts();
        refreshAllSongs();
        persistSongMirror(allSongsResult.data, false);

        if (isImport) {
          alert("Song Lyrics imported to the Song Database");
        } else {
          alert('Song "' + songName + '" added to the Song Database.');
        }
      }
    } catch (err) {
      console.error("[SongManager] INSERT error:", err);
      alert("Error saving song: " + (err && err.message ? err.message : err));
    }
  }

  function updateSongRecord(id) {
    try {
      var sql = "UPDATE sm SET name=?, cat=?, font=?, bkgndfname=?, key=?, copy=?, notes=?, lyrics=?, audio=? WHERE id=?";
      AppDB.runSync(dbConn, sql, [songName, songCat, songFont, songBkgnd, songKey, songCopy, songNotes, songLyrics, songAudio, id]);
      invalidateExternalCaches();
      refreshCategories();
      refreshFonts();
      refreshAllSongs();
      persistSongMirror(allSongsResult.data, false);
      alert('Song "' + songName + '" updated.');
    } catch (err) {
      console.error("[SongManager] UPDATE error:", err);
    }
  }

  function refreshAllSongs() {
    try {
      var rows = AppDB.allSync(dbConn, "SELECT * FROM sm ORDER BY name COLLATE NOCASE ASC");
      allSongsResult = { data: sortSongRowsCaseInsensitive(rows || []) };
      updateNameIdCache();
      if (typeof scheduleObj !== "undefined" && scheduleObj && scheduleObj.init) {
        scheduleObj.init();
      }
      if (typeof songNavObj !== "undefined" && songNavObj && songNavObj.update_songList) {
        songNavObj.update_songList(allSongsResult, "_ALL");
      }
    } catch (err) {
      console.error("[SongManager] refreshAllSongs error:", err);
    }
  }

  function refreshCategories() {
    try {
      var rows = AppDB.allSync(dbConn, "SELECT DISTINCT cat FROM sm ORDER BY cat COLLATE NOCASE ASC");
      categoryResult = { data: rows || [] };
      if (typeof songNavObj !== "undefined" && songNavObj && songNavObj.update_CategoryList) {
        songNavObj.update_CategoryList(categoryResult);
      }
    } catch (err) {
      console.error("[SongManager] refreshCategories error:", err);
    }
  }

  function refreshFonts() {
    try {
      var rows = AppDB.allSync(dbConn, "SELECT DISTINCT font FROM sm ORDER BY font COLLATE NOCASE ASC");
      fontResult = { data: rows || [] };
      parseFontList();
    } catch (err) {
      console.error("[SongManager] refreshFonts error:", err);
    }
  }

  function searchRecords(query) {
    try {
      var cleanQuery = String(query || "").replace(/^%+|%+$/g, "");
      var pattern = "%" + cleanQuery + "%";
      var rows = AppDB.allSync(
        dbConn,
        "SELECT * FROM sm WHERE lyrics LIKE ? OR name LIKE ? ORDER BY name COLLATE NOCASE ASC",
        [pattern, pattern]
      );
      searchResult = { data: sortSongRowsCaseInsensitive(rows || []) };
      if (typeof songNavObj !== "undefined" && songNavObj && songNavObj.searchComplete) {
        songNavObj.searchComplete(searchResult);
      }
    } catch (err) {
      console.error("[SongManager] searchRecords error:", err);
    }
  }

  function deleteSongById(id) {
    try {
      AppDB.runSync(dbConn, "DELETE FROM sm WHERE id = ?", [id]);
      invalidateExternalCaches();
      refreshCategories();
      refreshFonts();
      refreshAllSongs();
      var isEmptyNow = !allSongsResult.data || allSongsResult.data.length === 0;
      persistSongMirror(allSongsResult.data, isEmptyNow);
    } catch (err) {
      console.error("[SongManager] Error deleting song by ID:", err);
    }
  }

  function deleteSongsByCategory(cat) {
    try {
      AppDB.runSync(dbConn, "DELETE FROM sm WHERE cat = ?", [cat]);
      currentCat = "_ALL";
      invalidateExternalCaches();
      refreshCategories();
      refreshFonts();
      refreshAllSongs();
      var isEmptyNow = !allSongsResult.data || allSongsResult.data.length === 0;
      persistSongMirror(allSongsResult.data, isEmptyNow);
    } catch (err) {
      console.error("[SongManager] Error deleting songs by category:", err);
    }
  }
}
