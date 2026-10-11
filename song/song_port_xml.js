/**
 * Song Port XML Class
 *
 * Handles XML export and import of songs without Adobe AIR dependencies.
 * Uses native Electron save/open dialogs, AppStorage, DOMParser, and web fallbacks.
 */
function songPortXML() {
  this.init = init;
  this.exportAll = exportAll;
  this.exportByCat = exportByCat;
  this.exportSingle = exportSingle;
  this.importXML = importXML;

  var songData = null;
  var targetCategory = null;
  var exportFilter = null;
  var exportType = 0;

  function init(data, category, filter, type) {
    songData = data;
    targetCategory = category;
    exportFilter = filter;
    exportType = type;
  }

  function getExportFileName() {
    var now = new Date();
    var dateStr = now.toDateString().replace(/\s+/g, "_");
    var fileName = "";
    switch (exportType) {
      case 1:
        fileName = "vvsongs_" + dateStr + ".xml";
        break;
      case 2:
        fileName = targetCategory + "_songs_" + dateStr + ".xml";
        break;
      case 3:
        fileName = "vvsongs_" + dateStr + ".xml";
        break;
      default:
        fileName = "vvsongs_" + dateStr + ".xml";
        break;
    }
    return fileName;
  }

  function buildSongXML(song) {
    var xml = "";
    xml += "<song>\n";
    xml += "  <category>" + (song.catIndex || "") + "</category>\n";
    xml += "  <name>" + (song.name || "") + "</name>\n";
    xml += "  <font>" + (song.font || "") + "</font>\n";
    xml += "  <bkgnd>" + (song.bkgnd_fname || "") + "</bkgnd>\n";
    xml += "  <key>" + (song.key || "") + "</key>\n";
    xml += "  <copyright>" + (song.copyright || "") + "</copyright>\n";
    xml += "  <notes>" + (song.notes || "") + "</notes>\n";
    xml += "  <slide><![CDATA[" + (song.slides || "") + "]]></slide>\n";
    xml += "</song>\n";
    return xml;
  }

  function exportAll() {
    var song = new songObj();
    song.init();
    var fileName = getExportFileName();
    var xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    xml += "<songDB>\n";
    xml += "<type>XMLsong</type>\n";

    if (songData && songData.data) {
      var len = songData.data.length;
      for (var i = 0; i < len; i++) {
        var row = songData.data[i];
        song.name = row.name;
        song.catIndex = row.cat;
        song.font = row.font;
        song.bkgnd_fname = row.bkgndfname;
        song.key = row.key;
        song.copyright = row.copy;
        song.notes = row.notes;
        var lyrics = row.lyrics || "";
        song.slides = lyrics.replace(/\x0B/g, "");
        xml += buildSongXML(song);
      }
    }
    xml += "</songDB>\n";
    saveXmlFile(xml, fileName);
  }

  function exportByCat() {
    if (targetCategory === "_ALL") {
      exportType = 1;
      exportAll();
      return false;
    }
    var song = new songObj();
    song.init();
    var fileName = getExportFileName();
    var xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    xml += "<songDB>\n";
    xml += "<type>XMLsong</type>\n";

    var invalidCategory = true;
    if (songData && songData.data) {
      var len = songData.data.length;
      for (var i = 0; i < len; i++) {
        var row = songData.data[i];
        if (row.cat === targetCategory) {
          invalidCategory = false;
          song.name = row.name;
          song.catIndex = row.cat;
          song.font = row.font;
          song.bkgnd_fname = row.bkgndfname;
          song.key = row.key;
          song.copyright = row.copy;
          song.notes = row.notes;
          var lyrics = row.lyrics || "";
          song.slides = lyrics.replace(/\x0B/g, "");
          xml += buildSongXML(song);
        }
      }
    }
    xml += "</songDB>\n";

    if (invalidCategory) {
      alert("Database contains invalid Category. Contact UECFI Presenter");
    } else {
      saveXmlFile(xml, fileName);
    }
  }

  function exportSingle() {
  }

  function saveXmlFile(xmlContent, defaultName) {
    if (typeof window !== "undefined" && window.electronBridge && window.electronBridge.showSaveDialogAsync) {
      window.electronBridge.showSaveDialogAsync({
        title: "Export Song DB to XML",
        defaultPath: defaultName,
        filters: [{ name: "XML Files", extensions: ["xml"] }]
      }).then(function (res) {
        var targetPath = (typeof res === "string") ? res : (res && res.filePath ? res.filePath : null);
        if (targetPath) {
          if (typeof AppStorage !== "undefined" && AppStorage.writeFile) {
            Promise.resolve(AppStorage.writeFile(targetPath, xmlContent)).then(function() {
              alert("Song database exported successfully to: " + targetPath);
            });
          }
        }
      }).catch(function (err) {
        console.error("[SongPortXML] Error saving XML file:", err);
      });
    } else {
      try {
        var blob = new Blob([xmlContent], { type: "text/xml;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert("Error exporting XML in web environment: " + err.message);
      }
    }
  }

  function importXML() {
    if (typeof window !== "undefined" && window.electronBridge && window.electronBridge.showOpenDialogAsync) {
      window.electronBridge.showOpenDialogAsync({
        title: "Select Song DB in XML format.",
        filters: [{ name: "UECFI Presenter Song DB", extensions: ["xml"] }],
        properties: ["openFile"]
      }).then(function (res) {
        var filePath = null;
        if (typeof res === "string") {
          filePath = res;
        } else if (res && res.filePaths && res.filePaths.length > 0) {
          filePath = res.filePaths[0];
        } else if (Array.isArray(res) && res.length > 0) {
          filePath = res[0];
        }
        if (filePath) {
          readXmlFile(filePath);
        }
      }).catch(function (err) {
        console.error("[SongPortXML] Error opening XML dialog:", err);
      });
    } else {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".xml";
      input.onchange = function (e) {
        var file = e.target.files[0];
        if (file) {
          var reader = new FileReader();
          reader.onload = function (evt) {
            parseAndImportXML(evt.target.result);
          };
          reader.readAsText(file);
        }
      };
      input.click();
    }
  }

  async function readXmlFile(filePath) {
    try {
      var xmlStr = "";
      if (typeof AppStorage !== "undefined" && AppStorage.readFile) {
        xmlStr = await AppStorage.readFile(filePath);
      } else if (typeof require === "function") {
        var fs = require("fs");
        xmlStr = fs.readFileSync(filePath, "utf-8");
      }
      parseAndImportXML(xmlStr);
    } catch (err) {
      console.error("[SongPortXML] Error reading XML file:", err);
      alert("Error reading XML file: " + err.message);
    }
  }

  function parseAndImportXML(xmlStr) {
    if (!xmlStr || typeof xmlStr !== "string") {
      alert("Invalid database for UECFI Presenter Songs in XML format. (Empty content)");
      return;
    }
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(xmlStr, "text/xml");
    validateAndProcessXML(xmlDoc);
  }

  function validateAndProcessXML(xmlDoc) {
    if (!xmlDoc) {
      alert("Invalid database for UECFI Presenter Songs in XML format. (Invalid XML format)");
      return;
    }
    var typeElem = xmlDoc.getElementsByTagName("type")[0];
    if (typeElem && typeElem.textContent === "XMLsong") {
      processImportDoc(xmlDoc);
    } else if (!typeElem) {
      alert("Invalid database for UECFI Presenter Songs in XML format. (Type field not present)");
    } else {
      alert("Invalid database for UECFI Presenter Songs in XML format. (Wrong type field)");
    }
  }

  function processImportDoc(xmlDoc) {
    var songNodes = xmlDoc.getElementsByTagName("song");
    var totalSongs = songNodes.length;
    console.log("[SongPortXML] Record Length XML: " + totalSongs);

    var lastIdx = getLastNewSongIndex(xmlDoc);
    if (lastIdx === -1) {
      alert("All songs in this XML file already exist in the database.");
      return;
    }

    for (var i = 0; i < totalSongs; i++) {
      var node = songNodes[i];
      var name = getTagText(node, "name");
      var exists = songManagerObj.checkSongExists(name);
      if (!exists) {
        var song = new songObj();
        song.init();
        song.name = name;
        song.catIndex = getTagText(node, "category");
        song.font = getTagText(node, "font");
        song.bkgnd_fname = getTagText(node, "bkgnd");
        song.key = getTagText(node, "key");
        song.copyright = getTagText(node, "copyright");
        song.notes = getTagText(node, "notes");
        song.slides = getTagText(node, "slide");

        var isLast = (lastIdx === i);
        songManagerObj.addSong(song, isLast, true);
      }
    }
  }

  function getTagText(parent, tagName) {
    var elem = parent.getElementsByTagName(tagName)[0];
    return elem ? elem.textContent : "";
  }

  function getLastNewSongIndex(xmlDoc) {
    var songNodes = xmlDoc.getElementsByTagName("song");
    var totalSongs = songNodes.length;
    var lastIdx = -1;
    for (var i = 0; i < totalSongs; i++) {
      var name = getTagText(songNodes[i], "name");
      var exists = songManagerObj.checkSongExists(name);
      if (!exists) {
        lastIdx = i;
      }
    }
    return lastIdx;
  }
}
