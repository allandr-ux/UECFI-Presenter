/**
 * Song Manager Class
 *
 * Manages song database storage and queries using AppDB and AppStorage.
 * Cross-platform compatible across Electron, web (cPanel/Apache/NGINX), etc.
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
  this.processExportSongXML = processExportSongXML;
  this.processExportCatXML = processExportCatXML;
  this.processImportSongXML = processImportSongXML;
  this.addImportSongs = addImportSongs;
  this.getSongObjWithID = getSongObjWithID;
  this.getSongID = getSongID;
  this.checkSongExists = checkSongExists;

  var debugMode = false;
  var isReady = false;
  var dbRelPath = "./song/default.db";
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
  var allSongsResult = null;
  var searchResult = null;
  var categoryResult = null;
  var fontResult = null;

  function init(arg) {
    currentSong = new songObj();
    isReady = false;
    openDatabase();
  }

  function joinSlides(slides) {
    var str = "";
    var len = slides.length;
    for (var i = 0; i < len; i++) {
      str = str + slides[i] + "<slide>";
    }
    return str;
  }

  function splitSlides(lyrics) {
    if (!lyrics) return [];
    var slides = lyrics.split("<slide>");
    slides.splice(slides.length - 1, 1);
    log("Number of slides after splitting: " + slides.length);
    return slides;
  }

  function updateNameIdCache() {
    if (!allSongsResult || !allSongsResult.data) return;
    var len = allSongsResult.data.length;
    for (var i = 0; i < len; i++) {
      songNames[i] = allSongsResult.data[i].name;
      songIds[i] = allSongsResult.data[i].id;
    }
  }

  function addSong(song, isLast, isImport) {
    songName = song.name;
    songCat = song.catIndex;
    songFont = song.font;
    songBkgnd = song.bkgnd_fname;
    songKey = song.key;
    songCopy = song.copyright;
    songNotes = song.notes;
    if (isImport) {
      songLyrics = song.slides;
    } else {
      songLyrics = joinSlides(song.slides);
    }
    insertSongRecord(isLast, isImport);
  }

  function updateSong(song, index, specificId) {
    var idToUpdate = null;
    if (specificId == null) {
      idToUpdate = allSongsResult.data[index].id;
    } else {
      idToUpdate = specificId;
    }
    songName = song.name;
    songCat = song.catIndex;
    songFont = song.font;
    songBkgnd = song.bkgnd_fname;
    songKey = song.key;
    songCopy = song.copyright;
    songNotes = song.notes;
    songLyrics = joinSlides(song.slides);
    updateSongRecord(idToUpdate);
  }

  function deleteSong(index) {
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
        obj.slides = splitSlides(allSongsResult.data[i].lyrics);
        found = true;
        break;
      }
    }
    return found ? obj : null;
  }

  function getSongID(index, fromSearch) {
    var id = 0;
    if (!fromSearch) {
      id = allSongsResult && allSongsResult.data ? allSongsResult.data[index].id : 0;
    } else {
      id = searchResult && searchResult.data ? searchResult.data[index].id : 0;
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
    obj.name = row.name;
    obj.catIndex = row.cat;
    obj.font = row.font;
    obj.bkgnd_fname = row.bkgndfname;
    obj.key = row.key;
    obj.copyright = row.copy;
    obj.notes = row.notes;
    obj.slides = splitSlides(row.lyrics);
    return obj;
  }

  function getSongsFromCat(cat) {
    currentCat = cat;
    if (typeof songNavObj !== "undefined" && songNavObj && songNavObj.update_songList) {
      songNavObj.update_songList(allSongsResult, cat);
    }
  }

  function exportSongListToFile() {
    if (!allSongsResult || !allSongsResult.data) return;
    var len = allSongsResult.data.length;
    var str = "";
    for (var i = 0; i < len; i++) {
      str += allSongsResult.data[i].name + "|" + allSongsResult.data[i].cat + "\n";
    }
    var targetPath = "./song/songlist.txt";
    if (typeof save2file === "function") {
      save2file(str, targetPath, false);
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
        log("Song Manager Font: " + fontList[i]);
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

  function processImportSongXML() {
    var xmlPort = new songPortXML();
    xmlPort.init(allSongsResult, null, null, 1);
    xmlPort.importXML();
  }

  function processExportSongXML() {
    var xmlPort = new songPortXML();
    xmlPort.init(allSongsResult, null, null, 1);
    xmlPort.exportAll();
  }

  function processExportCatXML() {
    var xmlPort = new songPortXML();
    xmlPort.init(allSongsResult, currentCat, null, 2);
    xmlPort.exportByCat();
  }

  function addImportSongs(importedData) {
    if (!importedData || !importedData.data) return;
    var len = importedData.data.length;
    for (var i = 0; i < len; i++) {
      var row = importedData.data[i];
      var exists = checkSongExists(row.name);
      if (!exists) {
        songName = row.name;
        songLyrics = row.lyrics;
        songCopy = row.copy;
        songCat = row.cat;
        songFont = row.font;
        songKey = row.key;
        songNotes = row.notes;
        songBkgnd = "";
        var isLast = (i === len - 1);
        insertSongRecord(isLast, true);
      }
    }
  }

  function checkSongExists(name) {
    if (allSongsResult && allSongsResult.data) {
      var len = allSongsResult.data.length;
      for (var i = 0; i < len; i++) {
        if (allSongsResult.data[i].name === name) {
          return true;
        }
      }
    }
    return false;
  }

  function log(msg) {
    if (debugMode) {
      console.log("[SongManager]...." + msg);
    }
  }

  function openDatabase() {
    var resolvedDbPath = (typeof AppStorage !== "undefined" && AppStorage.resolveStoragePath)
      ? AppStorage.resolveStoragePath("song", "default.db")
      : dbRelPath;

    try {
      dbConn = AppDB.open(resolvedDbPath);
      log("DB opened successfully at: " + resolvedDbPath);
      isReady = true;
      createTable();
    } catch (err) {
      console.error("[SongManager] Error opening database:", err);
      isReady = false;
    }
  }

  function createTable() {
    log("Creating song Manager table...");
    try {
      var sql = "CREATE TABLE IF NOT EXISTS sm (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, cat TEXT, font TEXT, bkgndfname TEXT, key TEXT, copy TEXT, notes TEXT, lyrics TEXT)";
      AppDB.execSync(dbConn, sql);
      log("Song table ready.");
      refreshCategories();
      refreshFonts();
      refreshAllSongs();
    } catch (err) {
      console.error("[SongManager] Error creating table:", err);
    }
  }

  function insertSongRecord(isLast, isImport) {
    log("Adding Record: " + songName);
    try {
      var sql = "INSERT INTO sm (name, cat, font, bkgndfname, key, copy, notes, lyrics) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      var runRes = AppDB.runSync(dbConn, sql, [songName, songCat, songFont, songBkgnd, songKey, songCopy, songNotes, songLyrics]);
      log("Inserted into sm DB successfully...");

      if (isLast) {
        var lastId = runRes && runRes.lastInsertRowid ? runRes.lastInsertRowid : 0;
        if (typeof songEditObj !== "undefined" && songEditObj && songEditObj.setEditPrimaryKey) {
          songEditObj.setEditPrimaryKey(lastId);
        }
        refreshCategories();
        refreshFonts();
        refreshAllSongs();

        if (isImport) {
          alert("Song Lyrics imported to the Song Database");
        } else {
          alert('Song "' + songName + '" added to the Song Database.');
        }
      }
    } catch (err) {
      console.error("[SongManager] INSERT error:", err);
    }
  }

  function updateSongRecord(id) {
    log("Updating Record with key: " + id);
    try {
      var sql = "UPDATE sm SET name=?, cat=?, font=?, bkgndfname=?, key=?, copy=?, notes=?, lyrics=? WHERE id=?";
      AppDB.runSync(dbConn, sql, [songName, songCat, songFont, songBkgnd, songKey, songCopy, songNotes, songLyrics, id]);
      log("Updated DB successfully...");
      refreshCategories();
      refreshFonts();
      refreshAllSongs();
      alert('Song "' + songName + '" updated.');
    } catch (err) {
      console.error("[SongManager] UPDATE error:", err);
    }
  }

  function refreshAllSongs() {
    log("Getting ALL Data from Song DB");
    try {
      var rows = AppDB.allSync(dbConn, "SELECT * FROM sm ORDER BY name ASC");
      allSongsResult = { data: rows || [] };
      log("Successfully got all data from Song DB, count: " + allSongsResult.data.length);
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
    log("Getting ALL Categories from Song DB");
    try {
      var rows = AppDB.allSync(dbConn, "SELECT DISTINCT cat FROM sm ORDER BY cat ASC");
      categoryResult = { data: rows || [] };
      log("Successfully got all categories from Song DB");
      if (typeof songNavObj !== "undefined" && songNavObj && songNavObj.update_CategoryList) {
        songNavObj.update_CategoryList(categoryResult);
      }
    } catch (err) {
      console.error("[SongManager] refreshCategories error:", err);
    }
  }

  function refreshFonts() {
    log("Getting ALL Unique Fonts from Song DB");
    try {
      var rows = AppDB.allSync(dbConn, "SELECT DISTINCT font FROM sm ORDER BY font ASC");
      fontResult = { data: rows || [] };
      parseFontList();
    } catch (err) {
      console.error("[SongManager] refreshFonts error:", err);
    }
  }

  function searchRecords(query) {
    log("Searching Song DB: " + query);
    try {
      var rows = AppDB.allSync(dbConn, "SELECT * FROM sm WHERE lyrics LIKE ?", ["%" + query + "%"]);
      searchResult = { data: rows || [] };
      log("Successfully got data from Song DB search");
      if (typeof songNavObj !== "undefined" && songNavObj && songNavObj.searchComplete) {
        songNavObj.searchComplete(searchResult);
      }
    } catch (err) {
      console.error("[SongManager] searchRecords error:", err);
    }
  }

  function deleteSongById(id) {
    log("Deleting record with id: " + id);
    try {
      AppDB.runSync(dbConn, "DELETE FROM sm WHERE id = ?", [id]);
      refreshCategories();
      refreshFonts();
      refreshAllSongs();
    } catch (err) {
      console.error("[SongManager] Error deleting song by ID:", err);
    }
  }

  function deleteSongsByCategory(cat) {
    log("Deleting records with category: " + cat);
    try {
      AppDB.runSync(dbConn, "DELETE FROM sm WHERE cat = ?", [cat]);
      refreshCategories();
      refreshFonts();
      refreshAllSongs();
    } catch (err) {
      console.error("[SongManager] Error deleting songs by category:", err);
    }
  }
}
