/**
 * Song Import Class
 *
 * Imports songs from external SQLite database (.db) using AppDB and native dialogs.
 * Cross-platform compatible across Electron and web environments.
 */
function songImportClass() {
  this.init = init;
  var debugMode = true;

  function init() {
    selectDatabaseFile();
  }

  function log(msg) {
    if (debugMode) {
      console.log("[SongImportManager]...." + msg);
    }
  }

  function selectDatabaseFile() {
    if (typeof window !== "undefined" && window.electronBridge && window.electronBridge.showOpenDialogAsync) {
      window.electronBridge.showOpenDialogAsync({
        title: "Select Song DB",
        filters: [{ name: "UECFI Presenter Song DB", extensions: ["db", "sqlite"] }],
        properties: ["openFile"]
      }).then(function (res) {
        if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
          processImportDb(res.filePaths[0]);
        }
      }).catch(function (err) {
        console.error("[SongImportManager] Dialog error:", err);
      });
    } else {
      // Browser fallback using input element
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".db,.sqlite";
      input.onchange = function (e) {
        var file = e.target.files[0];
        if (file) {
          log("File selected in web fallback: " + file.name);
          alert("SQLite file import is only supported in Desktop / Electron mode.");
        }
      };
      input.click();
    }
  }

  function processImportDb(filePath) {
    log("Importing DB from: " + filePath);
    try {
      var importConn = AppDB.open(filePath);
      log("DB opened successfully");

      var ensureTableSql = "CREATE TABLE IF NOT EXISTS sm (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, cat TEXT, font TEXT, bkgndfname TEXT, key TEXT, copy TEXT, notes TEXT, lyrics TEXT)";
      AppDB.execSync(importConn, ensureTableSql);

      log("Getting ALL Data from Song Import DB");
      var rows = AppDB.allSync(importConn, "SELECT * FROM sm ORDER BY name ASC");
      log("Successfully got all data from Song Import DB, count: " + (rows ? rows.length : 0));

      if (typeof songManagerObj !== "undefined" && songManagerObj && songManagerObj.addImportSongs) {
        songManagerObj.addImportSongs({ data: rows || [] });
      }
    } catch (err) {
      log("Error during DB import: " + (err.message || err));
      alert("Error importing song database: " + (err.message || err));
    }
  }
}
