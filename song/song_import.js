/**
 * Song Native Database Import Engine (Rebuilt)
 *
 * Imports songs from an external SQLite database (.db / .sqlite) and merges
 * them into the active Song Database via songManagerObj.importSongsBatch.
 */
function songImportClass() {
  this.init = init;
  this.importFromPath = processImportDb;

  function init() {
    selectDatabaseFile();
  }

  function extractDialogFilePath(res) {
    if (!res) return null;
    if (typeof res === "string") return res;
    if (res.canceled) return null;
    if (Array.isArray(res.filePaths) && res.filePaths.length > 0) return res.filePaths[0];
    if (typeof res.filePath === "string" && res.filePath) return res.filePath;
    if (Array.isArray(res) && res.length > 0) return res[0];
    return null;
  }

  function selectDatabaseFile() {
    if (typeof window !== "undefined" && window.electronBridge && window.electronBridge.showOpenDialogAsync) {
      window.electronBridge.showOpenDialogAsync({
        title: "Select Song DB",
        filters: [{ name: "UECFI Presenter Song DB (*.db, *.sqlite)", extensions: ["db", "sqlite"] }],
        properties: ["openFile"]
      }).then(function (res) {
        var filePath = extractDialogFilePath(res);
        if (filePath) {
          processImportDb(filePath);
        }
      }).catch(function (err) {
        console.error("[SongImportManager] Dialog error:", err);
        alert("Error opening file dialog: " + (err && err.message ? err.message : err));
      });
    } else {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".db,.sqlite,.json";
      input.onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (/\.json$/i.test(file.name)) {
          var reader = new FileReader();
          reader.onload = function (evt) {
            try {
              var parsed = JSON.parse(evt.target.result);
              var rows = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.data) ? parsed.data : []);
              if (typeof songManagerObj !== "undefined" && songManagerObj && songManagerObj.importSongsBatch) {
                songManagerObj.importSongsBatch(rows, { source: "json", showAlert: true });
              }
            } catch (err) {
              alert("Invalid JSON song database: " + err.message);
            }
          };
          reader.readAsText(file, "UTF-8");
        } else {
          alert("SQLite (.db) file import requires the Desktop / Electron app. In a browser, please use XML Import.");
        }
      };
      input.click();
    }
  }

  function processImportDb(filePath) {
    console.log("[SongImportManager] Importing DB from:", filePath);
    var importConn = null;
    try {
      var cleanPath = String(filePath).replace(/^file:\/+/i, "");
      importConn = AppDB.open(cleanPath);
      var rows = AppDB.allSync(importConn, "SELECT * FROM sm ORDER BY name COLLATE NOCASE ASC");

      if (!rows || rows.length === 0) {
        alert("The selected database does not contain any songs.");
        return;
      }

      if (typeof songManagerObj !== "undefined" && songManagerObj) {
        if (typeof songManagerObj.importSongsBatch === "function") {
          songManagerObj.importSongsBatch(rows, { source: "db", showAlert: true });
        } else if (typeof songManagerObj.addImportSongs === "function") {
          songManagerObj.addImportSongs({ data: rows });
        }
      }
    } catch (err) {
      console.error("[SongImportManager] Error during DB import:", err);
      alert("Error importing song database: " + (err && err.message ? err.message : err));
    } finally {
      if (importConn && typeof importConn.close === "function") {
        try { importConn.close(); } catch (e) {}
      }
    }
  }
}
