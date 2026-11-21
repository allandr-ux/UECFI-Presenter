/**
 * Song XML Import & Export Engine (Rebuilt)
 *
 * Handles exporting songs (all, by category, or single) to UECFI Presenter XML
 * and importing songs from XML files with resilient parsing, CDATA/entity handling,
 * slide normalization, and transactional batch import via songManagerObj.
 */
function songPortXML() {
  this.init = init;
  this.exportAll = exportAll;
  this.exportByCat = exportByCat;
  this.exportSingle = exportSingle;
  this.importXML = importXML;
  this.parseXMLString = parseSongsFromXML;

  var songData = null;
  var targetCategory = null;
  var exportFilter = null;
  var exportType = 0;

  function init(data, category, filter, type) {
    songData = data;
    targetCategory = category;
    exportFilter = filter;
    exportType = type || 1;
  }

  function escapeXmlText(val) {
    if (val == null) return "";
    return String(val)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function decodeXmlEntities(val) {
    if (!val) return "";
    return String(val)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, dec) {
        return String.fromCharCode(parseInt(dec, 10));
      })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      })
      .replace(/&amp;/g, "&");
  }

  function normalizeLyricsForStorage(rawSlidesInput) {
    if (!rawSlidesInput) return "";
    var parts = [];
    if (Array.isArray(rawSlidesInput)) {
      parts = rawSlidesInput;
    } else {
      var str = String(rawSlidesInput).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      if (/<slide>/i.test(str)) {
        parts = str.split(/<slide>/i);
      } else {
        parts = str.split(/\r?\n\s*\r?\n+/);
      }
    }

    var cleanedSlides = [];
    for (var i = 0; i < parts.length; i++) {
      var s = String(parts[i] || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
      if (!s) continue;
      // Convert raw newlines to <BR> if not already HTML line breaks
      s = s.replace(/\n/g, "<BR>");
      cleanedSlides.push(s);
    }

    if (cleanedSlides.length === 0) return "";
    return cleanedSlides.join("<slide>") + "<slide>";
  }

  function getLiveSongRows() {
    if (typeof songManagerObj !== "undefined" && songManagerObj) {
      if (typeof songManagerObj.getRawSongRows === "function") {
        var live = songManagerObj.getRawSongRows();
        if (Array.isArray(live) && live.length > 0) return live;
      }
      if (typeof songManagerObj.getAllSongs === "function") {
        var all = songManagerObj.getAllSongs();
        if (Array.isArray(all) && all.length > 0) return all;
      }
    }
    if (songData && Array.isArray(songData.data) && songData.data.length > 0) {
      return songData.data;
    }
    return [];
  }

  function getActiveCategorySelection() {
    var modernCat = typeof document !== "undefined" ? document.getElementById("modernSongCategory") : null;
    if (modernCat && modernCat.options && modernCat.selectedIndex >= 0) {
      var opt = modernCat.options[modernCat.selectedIndex];
      if (opt && opt.text && opt.text !== "_ALL") return opt.text;
    }
    var legacyCat = typeof document !== "undefined" ? document.getElementById("songnav_category") : null;
    if (legacyCat && legacyCat.options && legacyCat.selectedIndex >= 0) {
      var lOpt = legacyCat.options[legacyCat.selectedIndex];
      if (lOpt && lOpt.text && lOpt.text !== "_ALL") return lOpt.text;
    }
    if (targetCategory && targetCategory !== "" && targetCategory !== "_ALL") {
      return targetCategory;
    }
    return "_ALL";
  }

  function getExportFileName(catName) {
    var now = new Date();
    var dateStr = now.toDateString().replace(/\s+/g, "_");
    if (exportType === 2 && catName && catName !== "_ALL") {
      var safeCat = String(catName).replace(/[^a-zA-Z0-9_-]/g, "_");
      return safeCat + "_songs_" + dateStr + ".xml";
    }
    return "vvsongs_" + dateStr + ".xml";
  }

  function resolveDefaultSavePath(fileName) {
    if (typeof require === "function") {
      try {
        var path = require("path");
        var os = require("os");
        var fs = require("fs");
        if (path.isAbsolute(fileName)) return fileName;
        var downloadsDir = path.join(os.homedir(), "Downloads");
        var baseDir = fs.existsSync(downloadsDir) ? downloadsDir : os.homedir();
        return path.join(baseDir, fileName);
      } catch (e) {}
    }
    return fileName;
  }

  function buildSongXMLFromRow(row) {
    var name = row.name || "";
    var cat = row.cat != null ? row.cat : (row.catIndex || "");
    var font = row.font || "Arial";
    var bkgnd = row.bkgndfname != null ? row.bkgndfname : (row.bkgnd_fname || "");
    if (bkgnd === "null" || bkgnd === "undefined") bkgnd = "";
    var key = row.key || "";
    var copyright = row.copy != null ? row.copy : (row.copyright || "");
    var notes = row.notes || "";
    var audio = row.audio != null ? String(row.audio).trim() : "";
    var rawLyrics = row.lyrics != null ? row.lyrics : (row.slides || "");
    var normalizedSlides = normalizeLyricsForStorage(rawLyrics);
    // Safe CDATA wrapping even if lyrics contain "]]>"
    var safeCdata = normalizedSlides.replace(/\]\]>/g, "]]]]><![CDATA[>");

    var xml = "";
    xml += "<song>\n";
    xml += "  <category>" + escapeXmlText(cat) + "</category>\n";
    xml += "  <name>" + escapeXmlText(name) + "</name>\n";
    xml += "  <font>" + escapeXmlText(font) + "</font>\n";
    xml += "  <bkgnd>" + escapeXmlText(bkgnd) + "</bkgnd>\n";
    xml += "  <key>" + escapeXmlText(key) + "</key>\n";
    xml += "  <copyright>" + escapeXmlText(copyright) + "</copyright>\n";
    xml += "  <notes>" + escapeXmlText(notes) + "</notes>\n";
    if (audio) {
      xml += "  <audio>" + escapeXmlText(audio) + "</audio>\n";
      var embeddedB64 = readAudioBase64ForExport(audio);
      if (embeddedB64) {
        xml += "  <audioData><![CDATA[" + embeddedB64 + "]]></audioData>\n";
      }
    }
    xml += "  <slide><![CDATA[" + safeCdata + "]]></slide>\n";
    xml += "</song>\n";
    return xml;
  }

  function readAudioBase64ForExport(audioFileName) {
    if (!audioFileName || typeof require !== "function") return "";
    try {
      var fs = require("fs");
      var foundPath = null;
      if (typeof window !== "undefined" && window.songAudioEngine && typeof window.songAudioEngine.findAudioFilePath === "function") {
        foundPath = window.songAudioEngine.findAudioFilePath(audioFileName);
      } else if (typeof AppStorage !== "undefined" && typeof AppStorage.resolveStoragePath === "function") {
        var p = AppStorage.resolveStoragePath("audio", audioFileName);
        if (fs.existsSync(p)) foundPath = p;
      }
      if (!foundPath || !fs.existsSync(foundPath)) return "";
      var stat = fs.statSync(foundPath);
      if (!stat || stat.size <= 0 || stat.size > 30 * 1024 * 1024) return "";
      return fs.readFileSync(foundPath).toString("base64");
    } catch (e) {
      return "";
    }
  }

  function buildFullXMLDocument(rows) {
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += "<songDB>\n";
    xml += "<type>XMLsong</type>\n";
    for (var i = 0; i < rows.length; i++) {
      xml += buildSongXMLFromRow(rows[i]);
    }
    xml += "</songDB>\n";
    return xml;
  }

  function exportAll() {
    exportType = 1;
    var rows = getLiveSongRows();
    if (!rows || rows.length === 0) {
      alert("There are no songs in the database to export.");
      return;
    }
    var xml = buildFullXMLDocument(rows);
    var fileName = getExportFileName("_ALL");
    saveXmlFile(xml, fileName, rows.length);
  }

  function exportByCat() {
    var cat = getActiveCategorySelection();
    if (!cat || cat === "_ALL") {
      exportAll();
      return false;
    }
    exportType = 2;
    var allRows = getLiveSongRows();
    var filtered = [];
    for (var i = 0; i < allRows.length; i++) {
      var rCat = allRows[i].cat != null ? allRows[i].cat : (allRows[i].catIndex || "");
      if (rCat === cat) {
        filtered.push(allRows[i]);
      }
    }
    if (filtered.length === 0) {
      alert('No songs found in category "' + cat + '" to export.');
      return false;
    }
    var xml = buildFullXMLDocument(filtered);
    var fileName = getExportFileName(cat);
    saveXmlFile(xml, fileName, filtered.length);
    return true;
  }

  function exportSingle(songRowOrObj) {
    var target = songRowOrObj;
    if (!target) {
      var rows = getLiveSongRows();
      var idx = (typeof window !== "undefined" && typeof window.selectedSongIdx === "number" && window.selectedSongIdx >= 0)
        ? window.selectedSongIdx
        : 0;
      if (typeof window !== "undefined" && window.songDataStore && Array.isArray(window.songDataStore.songTitle) && window.songDataStore.songTitle[idx]) {
        var selectedItem = window.songDataStore.songTitle[idx];
        target = rows.find(function (r) { return r && (r.id === selectedItem.id || r.name === selectedItem.Title); }) || rows[selectedItem.ID] || rows[idx] || null;
      } else {
        target = rows[idx] || null;
      }
    }
    if (!target) {
      alert("No song selected to export.");
      return;
    }
    var xml = buildFullXMLDocument([target]);
    var safeName = String(target.name || "song").replace(/[^a-zA-Z0-9_-]/g, "_");
    saveXmlFile(xml, safeName + ".xml", 1);
  }

  async function promptSaveXmlPath(dialogOptions) {
    if (typeof window !== "undefined" && window.electronBridge) {
      if (typeof window.electronBridge.showSaveDialogAsync === "function") {
        var asyncRes = await window.electronBridge.showSaveDialogAsync(dialogOptions);
        if (asyncRes) return asyncRes;
      } else if (typeof window.electronBridge.showSaveDialog === "function") {
        var syncRes = window.electronBridge.showSaveDialog(dialogOptions);
        if (syncRes) return syncRes;
      }
    }
    if (typeof require === "function") {
      try {
        var ipcRenderer = require("electron").ipcRenderer;
        if (ipcRenderer) {
          return await ipcRenderer.invoke("dialog:show-save", dialogOptions);
        }
      } catch (e) {}
    }
    return null;
  }

  async function saveXmlFile(xmlContent, defaultName, exportedCount) {
    var hasDesktopSave = (typeof window !== "undefined" && window.electronBridge && (window.electronBridge.showSaveDialogAsync || window.electronBridge.showSaveDialog)) || (typeof require === "function");
    if (hasDesktopSave) {
      try {
        var dialogOpts = {
          title: "Export Song DB to XML",
          defaultPath: resolveDefaultSavePath(defaultName),
          filters: [{ name: "XML Files (*.xml)", extensions: ["xml"] }]
        };
        var res = await promptSaveXmlPath(dialogOpts);
        var targetPath = (typeof res === "string")
          ? res
          : (res && res.filePath ? res.filePath : null);
        if (!targetPath) return;

        if (!/\.xml$/i.test(targetPath)) {
          targetPath += ".xml";
        }

        var wroteDirect = false;
        if (typeof require === "function") {
          try {
            var fs = require("fs");
            var path = require("path");
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, xmlContent, "utf8");
            wroteDirect = true;
          } catch (fsErr) {
            console.warn("[SongPortXML] Direct fs write failed, falling back to AppStorage:", fsErr);
          }
        }
        if (!wroteDirect && typeof AppStorage !== "undefined" && AppStorage.writeFile) {
          await AppStorage.writeFile(targetPath, xmlContent);
        }
        var countMsg = typeof exportedCount === "number" ? (" (" + exportedCount + " song" + (exportedCount === 1 ? "" : "s") + ")") : "";
        alert("Song database" + countMsg + " exported successfully to:\n" + targetPath);
      } catch (err) {
        console.error("[SongPortXML] Error saving XML file:", err);
        alert("Error exporting XML file: " + (err && err.message ? err.message : err));
      }
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

  function extractDialogFilePath(res) {
    if (!res) return null;
    if (typeof res === "string") return res;
    if (res.canceled) return null;
    if (Array.isArray(res.filePaths) && res.filePaths.length > 0) return res.filePaths[0];
    if (typeof res.filePath === "string" && res.filePath) return res.filePath;
    if (Array.isArray(res) && res.length > 0) return res[0];
    return null;
  }

  function importXML() {
    if (typeof window !== "undefined" && window.electronBridge && window.electronBridge.showOpenDialogAsync) {
      window.electronBridge.showOpenDialogAsync({
        title: "Select Song DB in XML format",
        filters: [{ name: "UECFI Presenter Song DB (*.xml)", extensions: ["xml"] }],
        properties: ["openFile"]
      }).then(function (res) {
        var filePath = extractDialogFilePath(res);
        if (filePath) {
          readXmlFileAndImport(filePath);
        }
      }).catch(function (err) {
        console.error("[SongPortXML] Error opening XML dialog:", err);
        alert("Error opening file dialog: " + (err && err.message ? err.message : err));
      });
    } else {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".xml,text/xml,application/xml";
      input.onchange = function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) {
          var reader = new FileReader();
          reader.onload = function (evt) {
            processXmlContent(evt.target.result);
          };
          reader.onerror = function () {
            alert("Failed to read the selected XML file.");
          };
          reader.readAsText(file, "UTF-8");
        }
      };
      input.click();
    }
  }

  async function readXmlFileAndImport(filePath) {
    try {
      var xmlStr = null;
      var sourceDir = "";
      if (typeof require === "function") {
        try {
          var fs = require("fs");
          var path = require("path");
          var cleanPath = String(filePath).replace(/^file:\/+/i, "");
          sourceDir = path.dirname(cleanPath);
          if (fs.existsSync(cleanPath)) {
            xmlStr = fs.readFileSync(cleanPath, "utf8");
          }
        } catch (fsErr) {
          console.warn("[SongPortXML] Direct fs.readFileSync failed, trying AppStorage:", fsErr);
        }
      }
      if ((xmlStr === null || xmlStr === "") && typeof AppStorage !== "undefined" && AppStorage.readFile) {
        xmlStr = await AppStorage.readFile(filePath);
      }
      processXmlContent(xmlStr, sourceDir);
    } catch (err) {
      console.error("[SongPortXML] Error reading XML file:", err);
      alert("Error reading XML file: " + (err && err.message ? err.message : err));
    }
  }

  function sanitizeXmlString(raw) {
    if (!raw || typeof raw !== "string") return "";
    // Remove UTF-8 BOM and invalid XML control characters
    var cleaned = raw.replace(/^\uFEFF/, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    // Escape bare '&' outside CDATA blocks so DOMParser doesn't abort on song titles like "Praise & Worship"
    var parts = cleaned.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g);
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        parts[i] = parts[i].replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;");
      }
    }
    return parts.join("");
  }

  function getDirectTagText(parentNode, tagNames) {
    var names = Array.isArray(tagNames) ? tagNames : [tagNames];
    for (var i = 0; i < names.length; i++) {
      var elems = parentNode.getElementsByTagName(names[i]);
      if (elems && elems.length > 0 && elems[0].textContent != null) {
        return elems[0].textContent;
      }
    }
    return "";
  }

  function extractSlidesFromDomNode(songNode) {
    var slideElems = songNode.getElementsByTagName("slide");
    if (!slideElems || slideElems.length === 0) {
      slideElems = songNode.getElementsByTagName("slides");
    }
    if (!slideElems || slideElems.length === 0) {
      slideElems = songNode.getElementsByTagName("lyrics");
    }
    if (!slideElems || slideElems.length === 0) return "";

    if (slideElems.length === 1) {
      return normalizeLyricsForStorage(slideElems[0].textContent || "");
    }
    var multi = [];
    for (var i = 0; i < slideElems.length; i++) {
      multi.push(slideElems[i].textContent || "");
    }
    return normalizeLyricsForStorage(multi.join("<slide>"));
  }

  function parseSongsViaRegexFallback(xmlStr) {
    var results = [];
    var songBlocks = String(xmlStr).match(/<song\b[^>]*>[\s\S]*?<\/song>/gi) || [];

    function extractField(block, tagList) {
      for (var t = 0; t < tagList.length; t++) {
        var re = new RegExp("<" + tagList[t] + "\\b[^>]*>([\\s\\S]*?)<\\/" + tagList[t] + ">", "i");
        var m = block.match(re);
        if (m && m[1] != null) {
          var inner = m[1].trim();
          var cdataMatch = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
          if (cdataMatch) {
            return cdataMatch[1];
          }
          return decodeXmlEntities(inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
        }
      }
      return "";
    }

    for (var i = 0; i < songBlocks.length; i++) {
      var block = songBlocks[i];
      var name = extractField(block, ["name", "title"]).trim();
      if (!name) continue;
      var cat = extractField(block, ["category", "cat"]).trim() || "Uncategorized";
      var font = extractField(block, ["font"]).trim() || "Arial";
      var bkgnd = extractField(block, ["bkgnd", "bkgndfname"]).trim();
      if (bkgnd === "null" || bkgnd === "undefined") bkgnd = "";
      var key = extractField(block, ["key"]).trim();
      var copy = extractField(block, ["copyright", "copy"]).trim();
      var notes = extractField(block, ["notes"]).trim();
      var audio = extractField(block, ["audio"]).trim();
      var audioData = extractField(block, ["audioData"]).trim();
      var slideRaw = extractField(block, ["slide", "slides", "lyrics"]);
      var lyrics = normalizeLyricsForStorage(slideRaw);

      results.push({
        name: name,
        cat: cat,
        font: font,
        bkgndfname: bkgnd,
        key: key,
        copy: copy,
        notes: notes,
        audio: audio,
        audioData: audioData,
        lyrics: lyrics
      });
    }
    return results;
  }

  function parseSongsFromXML(xmlStr) {
    if (!xmlStr || typeof xmlStr !== "string" || !xmlStr.trim()) {
      throw new Error("The selected XML file is empty.");
    }

    var sanitized = sanitizeXmlString(xmlStr);
    var parsedSongs = [];

    if (typeof DOMParser !== "undefined") {
      try {
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(sanitized, "text/xml");
        var parseErrors = xmlDoc ? xmlDoc.getElementsByTagName("parsererror") : [];
        var songNodes = xmlDoc ? xmlDoc.getElementsByTagName("song") : [];

        if (songNodes && songNodes.length > 0 && (!parseErrors || parseErrors.length === 0)) {
          for (var i = 0; i < songNodes.length; i++) {
            var node = songNodes[i];
            var name = getDirectTagText(node, ["name", "title"]).trim();
            if (!name) continue;
            var cat = getDirectTagText(node, ["category", "cat"]).trim() || "Uncategorized";
            var font = getDirectTagText(node, ["font"]).trim() || "Arial";
            var bkgnd = getDirectTagText(node, ["bkgnd", "bkgndfname"]).trim();
            if (bkgnd === "null" || bkgnd === "undefined") bkgnd = "";
            var key = getDirectTagText(node, ["key"]).trim();
            var copy = getDirectTagText(node, ["copyright", "copy"]).trim();
            var notes = getDirectTagText(node, ["notes"]).trim();
            var audio = getDirectTagText(node, ["audio"]).trim();
            var audioData = getDirectTagText(node, ["audioData"]).trim();
            var lyrics = extractSlidesFromDomNode(node);

            parsedSongs.push({
              name: name,
              cat: cat,
              font: font,
              bkgndfname: bkgnd,
              key: key,
              copy: copy,
              notes: notes,
              audio: audio,
              audioData: audioData,
              lyrics: lyrics
            });
          }
        }
      } catch (domErr) {
        console.warn("[SongPortXML] DOMParser error, using fallback parser:", domErr);
      }
    }

    if (parsedSongs.length === 0) {
      parsedSongs = parseSongsViaRegexFallback(sanitized);
    }

    return parsedSongs;
  }

  function materializeImportedAudio(song, sourceXmlDir) {
    if (!song || !song.audio || typeof require !== "function") return;
    try {
      var fs = require("fs");
      var path = require("path");
      var safeName = path.basename(String(song.audio).trim());
      if (!safeName) return;
      song.audio = safeName;

      var destDirs = [];
      if (typeof AppStorage !== "undefined" && typeof AppStorage.resolveStoragePath === "function") {
        destDirs.push(path.dirname(AppStorage.resolveStoragePath("audio", safeName)));
      }
      destDirs.push(path.join(process.cwd(), "audio"));
      var uniqueDirs = Array.from(new Set(destDirs));

      var buf = null;
      if (song.audioData) {
        buf = Buffer.from(song.audioData.replace(/\s+/g, ""), "base64");
      } else if (sourceXmlDir) {
        var siblingCandidates = [
          path.join(sourceXmlDir, safeName),
          path.join(sourceXmlDir, "audio", safeName)
        ];
        for (var i = 0; i < siblingCandidates.length; i++) {
          if (fs.existsSync(siblingCandidates[i])) {
            buf = fs.readFileSync(siblingCandidates[i]);
            break;
          }
        }
      }

      if (buf && buf.length > 0) {
        uniqueDirs.forEach(function (dir) {
          try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            var outPath = path.join(dir, safeName);
            if (!fs.existsSync(outPath)) {
              fs.writeFileSync(outPath, buf);
            }
          } catch (wErr) {}
        });
      }
    } catch (e) {
      console.warn("[SongPortXML] Could not materialize imported audio:", e);
    } finally {
      delete song.audioData;
    }
  }

  function processXmlContent(xmlStr, sourceXmlDir) {
    var songs = [];
    try {
      songs = parseSongsFromXML(xmlStr);
    } catch (err) {
      alert("Invalid Song XML file: " + (err && err.message ? err.message : err));
      return;
    }

    if (!songs || songs.length === 0) {
      alert("Invalid database for UECFI Presenter Songs in XML format (no <song> records found).");
      return;
    }

    for (var i = 0; i < songs.length; i++) {
      materializeImportedAudio(songs[i], sourceXmlDir);
    }

    console.log("[SongPortXML] Parsed songs from XML: " + songs.length);

    if (typeof songManagerObj === "undefined" || !songManagerObj) {
      alert("Song Manager is not initialized.");
      return;
    }

    if (typeof songManagerObj.importSongsBatch === "function") {
      var stats = songManagerObj.importSongsBatch(songs, { source: "xml", showAlert: true });
      console.log("[SongPortXML] Import stats:", stats);
    } else if (typeof songManagerObj.addImportSongs === "function") {
      songManagerObj.addImportSongs({ data: songs });
    }
  }
}
