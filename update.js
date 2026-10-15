/**
 * Updates Controller — UECFI Presenter API client.
 *
 * Talks to the companion WordPress plugin (namespace uecfi/v1):
 *   GET <base>/app             app-update manifest
 *   GET <base>/bibles          Bible catalog [{slug,name,description,version,size,sha256,url}]
 *   GET <base>/songs           song-pack catalog (same shape)
 *   <item.url>                 direct file download
 *
 * Song-pack file format (JSON):
 *   {"songs":[{"name":"...","lyrics":"...","copy":"","cat":"","font":"","key":"","notes":""}]}
 * A bare array of song objects is accepted too. Entries without a name are
 * skipped; songs already in the library (same name) are left untouched.
 *
 * The update-server base URL is baked into the app (see UPDATE_SERVER_BASE).
 */

// Installed app version. Bump on every release (matches the UI badge).
// Compared with the manifest's `latest` field (semver, numeric parts).
var UPDATE_CLIENT_VERSION = "1.0.0";

// Update server, baked in. All API calls go to <base>/app|/bibles|/songs.
var UPDATE_SERVER_BASE = "https://uecfi.net/wp-json/uecfi/v1";

// -1/0/1: numeric dot-part comparison ("3.2" equals "3.2.0").
function compareVersions(a, b) {
  try {
    const pa = String(a == null ? "" : a).trim().split(".");
    const pb = String(b == null ? "" : b).trim().split(".");
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const x = parseInt(pa[i], 10);
      const y = parseInt(pb[i], 10);
      const xv = isFinite(x) ? x : 0;
      const yv = isFinite(y) ? y : 0;
      if (xv < yv) return -1;
      if (xv > yv) return 1;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

// Normalize a configured server base: trim, drop trailing slashes, "" if unset.
function normalizeServerBase(v) {
  try {
    const s = String(v == null ? "" : v).trim().replace(/\/+$/, "");
    return s;
  } catch (e) {
    return "";
  }
}

// Normalize a downloaded song pack into {songs:[...]} or throw.
function normalizeSongPack(parsed) {
  const rows = Array.isArray(parsed) ? parsed : (parsed && parsed.songs);
  if (!Array.isArray(rows)) {
    throw new Error("Song pack is not a JSON song list.");
  }
  const clean = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const name = String(r.name == null ? "" : r.name).trim();
    if (name === "") continue;
    clean.push({
      name: name,
      lyrics: String(r.lyrics == null ? "" : r.lyrics),
      copy: String(r.copy == null ? "" : r.copy),
      cat: String(r.cat == null ? "" : r.cat),
      font: String(r.font == null ? "" : r.font),
      key: String(r.key == null ? "" : r.key),
      notes: String(r.notes == null ? "" : r.notes),
    });
  }
  return clean;
}

function updateClass() {
  this.init = initAll;

  let bibleRows = [];
  let songRows = [];
  let manifestCache = null;

  function el(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }
  function on(id, evt, fn) {
    try {
      const e = el(id);
      if (e && typeof fn === "function") e.addEventListener(evt, fn);
    } catch (err) {}
  }
  function setStatus(id, html) {
    try {
      const e = el(id);
      if (e) e.innerHTML = html;
    } catch (err) {}
  }
  function setDisabled(id, v) {
    try {
      const e = el(id);
      if (e) e.disabled = !!v;
    } catch (err) {}
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getServer() {
    try {
      return normalizeServerBase(
        (typeof UPDATE_SERVER_BASE !== "undefined") ? UPDATE_SERVER_BASE : "");
    } catch (e) {
      return "";
    }
  }

  async function apiGet(path) {
    const base = getServer();
    if (!base) {
      throw new Error("Update server is not configured in this build.");
    }
    let res;
    try {
      res = await fetch(base + path);
    } catch (e) {
      throw new Error("Cannot reach the update server. Check the URL and your connection.");
    }
    if (!res.ok) {
      throw new Error("Server responded with status " + res.status + ".");
    }
    try {
      return await res.json();
    } catch (e) {
      throw new Error("Server returned an unreadable response.");
    }
  }

  // Download a file as BOTH raw bytes (for hashing) and decoded text (for
  // saving/parsing). Hashing must use the raw bytes: re-encoded text differs
  // whenever the file is not plain-ASCII UTF-8 (e.g. ISO-8859-1 Bible XML
  // with accented characters), which would false-trigger checksum mismatches.
  async function apiDownload(url) {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new Error("Download failed: cannot reach the server.");
    }
    if (!res.ok) {
      throw new Error("Download failed with status " + res.status + ".");
    }
    let bytes;
    try {
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      throw new Error("Download failed: unreadable response.");
    }
    let text;
    try {
      text = new TextDecoder("utf-8").decode(bytes);
    } catch (e) {
      throw new Error("Download failed: cannot decode response.");
    }
    return { bytes: bytes, text: text };
  }

  // Hex SHA-256 of a string (UTF-8) or raw bytes. Node crypto preferred;
  // WebCrypto fallback; null when neither is available (skip with warning).
  async function sha256Hex(input) {
    try {
      if (typeof require === "function") {
        const crypto = require("crypto");
        const h = crypto.createHash("sha256");
        if (typeof input === "string") h.update(input, "utf8");
        else h.update(input);
        return h.digest("hex");
      }
    } catch (e) {}
    try {
      if (typeof crypto !== "undefined" && crypto.subtle) {
        let data = input;
        if (typeof input === "string") {
          if (typeof TextEncoder === "undefined") return null;
          data = new TextEncoder().encode(input);
        }
        const digest = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) {}
    return null;
  }

  async function verifyOrWarn(input, wantHex) {
    if (!wantHex) return "(no checksum published)";
    const got = await sha256Hex(input);
    if (got === null) return "(checksum skipped: no hashing available)";
    if (String(got).toLowerCase() !== String(wantHex).toLowerCase()) {
      throw new Error("Checksum mismatch: the file may be corrupt. Aborted.");
    }
    return "Checksum verified.";
  }

  // Guard against truncated downloads (e.g. PHP timeouts on big files):
  // throws a specific message instead of a confusing checksum mismatch.
  function checkSize(dl, row) {
    try {
      const want = Number(row && row.size);
      if (isFinite(want) && want > 0 && dl && dl.bytes && dl.bytes.length !== want) {
        throw new Error("Incomplete download: received " + dl.bytes.length + " of " + want
          + " bytes. The connection may have dropped — try again.");
      }
    } catch (e) {
      if (e && /Incomplete download/.test(e.message || "")) throw e;
    }
  }

  // Platform-specific installer hash for manual verification after download.
  // Falls back to the legacy single installer_sha256 field.
  function platformHash(m) {
    try {
      m = m || {};
      let isMac = false;
      try {
        isMac = (typeof process !== "undefined" && process.platform === "darwin");
      } catch (e) {}
      const h = isMac ? (m.mac_sha256 || m.installer_sha256) : (m.windows_sha256 || m.installer_sha256);
      return String(h || "").trim();
    } catch (e) {
      return "";
    }
  }

  function fmtSize(n) {
    const v = Number(n);
    if (!isFinite(v) || v <= 0) return "";
    if (v >= 1048576) return (v / 1048576).toFixed(1) + " MB";
    if (v >= 1024) return Math.round(v / 1024) + " KB";
    return v + " B";
  }

  // ---------- app updates ----------

  async function checkApp() {
    setDisabled("updAppCheck", true);
    setStatus("updAppStatus", "Checking…");
    try {
      const m = await apiGet("/app");
      manifestCache = m || {};
      const latest = String((manifestCache.latest || "")).trim();
      const notes = String((manifestCache.notes || "")).trim();
      if (!latest) {
        setStatus("updAppStatus", "The server has no release published yet.");
        showDownload(false);
        return;
      }
      const cmp = compareVersions(UPDATE_CLIENT_VERSION, latest);
      if (cmp < 0) {
        const hash = platformHash(manifestCache);
        setStatus("updAppStatus",
          "Update available: <b>" + esc(latest) + "</b> (installed " + esc(UPDATE_CLIENT_VERSION) + ")."
          + (notes ? "<br>" + esc(notes) : "")
          + (hash ? "<br><span style=\"font-size:11px;\">Installer SHA-256 (verify after download): <code>" + esc(hash) + "</code></span>" : ""));
        showDownload(true);
      } else {
        setStatus("updAppStatus",
          "You are up to date (version " + esc(UPDATE_CLIENT_VERSION) + ")."
          + (notes ? "<br>" + esc(notes) : ""));
        showDownload(false);
      }
    } catch (e) {
      setStatus("updAppStatus", esc(e && e.message ? e.message : e));
      showDownload(false);
    } finally {
      setDisabled("updAppCheck", false);
    }
  }

  function showDownload(v) {
    try {
      const e = el("updAppDownload");
      if (e) e.style.display = v ? "" : "none";
    } catch (err) {}
  }

  function downloadApp() {
    try {
      const m = manifestCache || {};
      let url = "";
      try {
        if (typeof process !== "undefined" && process.platform === "darwin") {
          url = m.mac_url || m.windows_url || "";
        } else {
          url = m.windows_url || m.mac_url || "";
        }
      } catch (e) {
        url = m.windows_url || m.mac_url || "";
      }
      if (!url) {
        setStatus("updAppStatus", "No installer URL published for this platform.");
        return;
      }
      if (typeof window !== "undefined" && window.electronBridge && typeof window.electronBridge.openExternal === "function") {
        window.electronBridge.openExternal(url);
      } else if (typeof window !== "undefined" && typeof window.open === "function") {
        window.open(url, "_blank");
      }
      setStatus("updAppStatus", "Opening installer download… Run it after it finishes (the app cannot update itself while running).");
    } catch (e) {}
  }

  // ---------- catalogs (bibles + songs) ----------

  function fillList(listId, loadBtnId, rows) {
    try { clearSelectList(listId); } catch (e) {}
    const sel = el(listId);
    if (!sel) return;
    if (!rows || rows.length === 0) {
      try { sel.options[0] = new Option("(nothing published yet)", ""); } catch (e) {}
      sel.selectedIndex = 0;
      setDisabled(loadBtnId, true);
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const label = String(r.name || r.slug || ("item " + (i + 1)))
        + (r.version ? "  (v" + r.version + ")" : "")
        + (r.size ? "  [" + fmtSize(r.size) + "]" : "");
      try { sel.options[i] = new Option(label, i); } catch (e) {}
    }
    sel.selectedIndex = 0;
    setDisabled(loadBtnId, false);
  }

  function selectedRow(rows, listId) {
    const sel = el(listId);
    if (!sel || sel.selectedIndex < 0) return null;
    const idx = Number(sel.selectedIndex);
    if (!isFinite(idx) || idx < 0 || idx >= rows.length) return null;
    return rows[idx];
  }

  async function checkBibles() {
    setDisabled("updBibleCheck", true);
    setDisabled("updBibleLoad", true);
    setStatus("updBibleStatus", "Loading catalog…");
    try {
      const rows = await apiGet("/bibles");
      bibleRows = Array.isArray(rows) ? rows : [];
      fillList("updBibleList", "updBibleLoad", bibleRows);
      setStatus("updBibleStatus", bibleRows.length === 0
        ? "No Bibles published on the server yet."
        : (bibleRows.length + " translation" + (bibleRows.length === 1 ? "" : "s") + " available. Pick one and download."));
    } catch (e) {
      setStatus("updBibleStatus", esc(e && e.message ? e.message : e));
    } finally {
      setDisabled("updBibleCheck", false);
    }
  }

  async function loadBible() {
    const row = selectedRow(bibleRows, "updBibleList");
    if (!row || !row.url) {
      setStatus("updBibleStatus", "Pick a translation first.");
      return;
    }
    if (typeof AppStorage === "undefined" || typeof loadVersion !== "function") {
      setStatus("updBibleStatus", "Bible storage is unavailable in this runtime.");
      return;
    }
    setDisabled("updBibleCheck", true);
    setDisabled("updBibleLoad", true);
    setStatus("updBibleStatus", "Downloading " + esc(row.name || row.slug) + "…");
    try {
      const dl = await apiDownload(row.url);
      checkSize(dl, row);
      const verdict = await verifyOrWarn(dl.bytes, row.sha256);
      // Save under the XML's own <fname> when present (mirrors extractInfo):
      // loadVersion keys the registry off that tag, so matching it avoids
      // split-brain filenames. Falls back to the catalog slug.
      const slug = String(row.slug || "bible").replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "bible";
      let destName = slug + ".xml";
      try {
        const m = dl.text.match(/<fname>([^<]*)<\/fname>/i);
        if (m && m[1].trim().toLowerCase().endsWith(".xml")) {
          const base = m[1].trim().split(/[\\/]/).pop();
          if (base) destName = base;
        }
      } catch (e) {}
      // Drop a stale same-slug file from older downloads so only the
      // canonical fname file remains — but ONLY when its content is byte
      // for byte identical to this download (never touch user files).
      try {
        const slugPath = AppStorage.resolveStoragePath("bible", slug + ".xml");
        if (destName !== slug + ".xml" && typeof AppStorage.readFile === "function" &&
            typeof AppStorage.deleteFile === "function") {
          let old = null;
          try { old = await AppStorage.readFile(slugPath); } catch (e) { old = null; }
          if (old !== null && old === dl.text) {
            AppStorage.deleteFile(slugPath);
          }
        }
      } catch (e) {}
      const dest = AppStorage.resolveStoragePath("bible", destName);
      await AppStorage.writeFile(dest, dl.text);
      loadVersion(dest);
      setStatus("updBibleStatus", "Installed <b>" + esc(row.name || slug) + "</b>. " + esc(verdict));
    } catch (e) {
      setStatus("updBibleStatus", esc(e && e.message ? e.message : e));
    } finally {
      setDisabled("updBibleCheck", false);
      setDisabled("updBibleLoad", bibleRows.length === 0);
    }
  }

  async function checkSongs() {
    setDisabled("updSongCheck", true);
    setDisabled("updSongLoad", true);
    setStatus("updSongStatus", "Loading catalog…");
    try {
      const rows = await apiGet("/songs");
      songRows = Array.isArray(rows) ? rows : [];
      fillList("updSongList", "updSongLoad", songRows);
      setStatus("updSongStatus", songRows.length === 0
        ? "No song packs published on the server yet."
        : (songRows.length + " pack" + (songRows.length === 1 ? "" : "s") + " available. Pick one and download."));
    } catch (e) {
      setStatus("updSongStatus", esc(e && e.message ? e.message : e));
    } finally {
      setDisabled("updSongCheck", false);
    }
  }

  function songCount() {
    try {
      if (typeof songManagerObj !== "undefined" && songManagerObj &&
          typeof songManagerObj.getAllSongs === "function") {
        const list = songManagerObj.getAllSongs();
        return Array.isArray(list) ? list.length : 0;
      }
    } catch (e) {}
    return -1;
  }

  async function loadSongs() {
    const row = selectedRow(songRows, "updSongList");
    if (!row || !row.url) {
      setStatus("updSongStatus", "Pick a song pack first.");
      return;
    }
    if (typeof songManagerObj === "undefined" || !songManagerObj ||
        typeof songManagerObj.addImportSongs !== "function") {
      setStatus("updSongStatus", "Song library is unavailable in this runtime.");
      return;
    }
    setDisabled("updSongCheck", true);
    setDisabled("updSongLoad", true);
    setStatus("updSongStatus", "Downloading " + esc(row.name || row.slug) + "…");
    try {
      const dl = await apiDownload(row.url);
      checkSize(dl, row);
      const verdict = await verifyOrWarn(dl.bytes, row.sha256);
      let parsed;
      try {
        parsed = JSON.parse(dl.text);
      } catch (e) {
        throw new Error("Song pack is not valid JSON.");
      }
      const clean = normalizeSongPack(parsed);
      if (clean.length === 0) {
        throw new Error("Song pack contains no usable songs.");
      }
      const before = songCount();
      songManagerObj.addImportSongs({ data: clean });
      const after = songCount();
      let report;
      if (before >= 0 && after >= 0) {
        const added = Math.max(0, after - before);
        report = added + " new song" + (added === 1 ? "" : "s")
          + " imported (" + (clean.length - added) + " already in library). ";
      } else {
        report = clean.length + " songs imported. ";
      }
      setStatus("updSongStatus", esc(report) + esc(verdict));
    } catch (e) {
      setStatus("updSongStatus", esc(e && e.message ? e.message : e));
    } finally {
      setDisabled("updSongCheck", false);
      setDisabled("updSongLoad", songRows.length === 0);
    }
  }

  function initAll() {
    try {
      const v = el("updAppVersion");
      if (v) v.textContent = UPDATE_CLIENT_VERSION;
    } catch (e) {}
    on("updAppCheck", "click", checkApp);
    on("updAppDownload", "click", downloadApp);
    on("updBibleCheck", "click", checkBibles);
    on("updBibleLoad", "click", loadBible);
    on("updSongCheck", "click", checkSongs);
    on("updSongLoad", "click", loadSongs);
    showDownload(false);
    setDisabled("updBibleLoad", true);
    setDisabled("updSongLoad", true);
  }
}

// Backward-compatible alias used in config.js
const vvupdate = updateClass;
