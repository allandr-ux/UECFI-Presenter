/**
 * Dual-Port Remote Servers for UECFI Presenter
 *
 * Two HTTP servers (Node 'http' in the Electron renderer):
 *   - Presenter port: speaker remote (live projection + Prev/Next and
 *     dashboard-configurable custom buttons) + command API.
 *   - Audience port:  live projection ONLY (no commands accepted).
 *
 * The servers also advertise `_uecfi-presenter._tcp` via mDNS
 * (bonjour-service, best-effort) so the Android remote can auto-discover
 * the PC without manual IP entry. TXT carries both ports; the SRV port is
 * the presenter port (command API), or the audience port when only the
 * audience server is up. mDNS failure never breaks the HTTP servers.
 *
 * The "live feed" is NOT a JPEG snapshot: remote pages embed the same
 * projection engine the sidebar Live Output Preview uses (presentation.htm
 * in an <iframe>) and drive it through its previewState injection point.
 * /api/state publishes the current slide + theme ~on every poll; remote
 * pages re-render only when the payload actually changes. When nothing is
 * projected, /api/state reports live:false and both pages render OFF AIR.
 */
function vvWebServer() {
  this.init = startOrStopServers;
  this.remoteVVStatus = isAnyRunning;
  this.getStatus = getStatus;

  const DEFAULT_PRESENTER_PORT = 50000;
  const DEFAULT_AUDIENCE_PORT = 50001;

  let presenterServer = null;
  let audienceServer = null;
  let presenterPort = DEFAULT_PRESENTER_PORT;
  let audiencePort = DEFAULT_AUDIENCE_PORT;
  let bindHost = "0.0.0.0";
  let presenterRunning = false;
  let audienceRunning = false;
  let canProcessCommand = true;
  // Always listen on all interfaces so phones on the LAN can connect.
  // The IP selected in Settings is display-only (shown in status URLs).
  let displayHost = "";

  // mDNS advertisement (_uecfi-presenter._tcp) for Android auto-discovery.
  // Best-effort: any failure only logs, the HTTP servers keep working.
  const MDNS_SERVICE_TYPE = "uecfi-presenter";
  let bonjour = null;
  let mdnsService = null;
  let mdnsPort = -1;

  function mdnsTxt() {
    return {
      app: "UECFI Presenter",
      presenter: String(presenterPort),
      audience: String(audiencePort),
      ver: "1"
    };
  }

  // bonjour-service runs in the Electron renderer, where the global
  // setTimeout is the browser version (returns a number, no .unref()).
  // Its registry.js calls timer.unref() / setTimeout().unref(), which
  // throws "timer.unref is not a function" as an uncaught Browser Window
  // error. Swap in Node's timers once so mDNS never breaks the servers.
  let nodeTimersPatched = false;
  function ensureNodeTimers() {
    if (nodeTimersPatched) return;
    try {
      if (typeof require !== "function") return;
      const nt = require("timers");
      if (!nt || typeof nt.setTimeout !== "function") return;
      let needsPatch = false;
      try {
        const probe = global.setTimeout(function () {}, 0);
        if (typeof probe === "number" || (probe && typeof probe.unref !== "function")) needsPatch = true;
        try { global.clearTimeout(probe); } catch (e) {}
      } catch (e) { needsPatch = true; }
      if (needsPatch) {
        const w = (typeof window !== "undefined") ? window : global;
        w.setTimeout = nt.setTimeout.bind(nt);
        w.clearTimeout = nt.clearTimeout.bind(nt);
        if (typeof nt.setInterval === "function") w.setInterval = nt.setInterval.bind(nt);
        if (typeof nt.clearInterval === "function") w.clearInterval = nt.clearInterval.bind(nt);
        global.setTimeout = w.setTimeout;
        global.clearTimeout = w.clearTimeout;
      }
      nodeTimersPatched = true;
    } catch (e) {}
  }

  // (Re)advertise when servers start, unadvertise when all are stopped.
  // bonjour-service has no updateTxt, so a port change republishes.
  function refreshMdnsAdvertisement() {
    try {
      if (typeof require !== "function") return;
      if (!isAnyRunning()) { stopMdnsAdvertisement(); return; }
      const port = presenterRunning ? presenterPort : audiencePort;
      if (mdnsService && mdnsPort === port) return; // already advertised
      stopMdnsAdvertisement();
      ensureNodeTimers();
      let BonjourCtor = null;
      try {
        const mod = require("bonjour-service");
        BonjourCtor = (mod && (mod.Bonjour || mod.default)) || mod;
        if (typeof BonjourCtor !== "function") throw new Error("bad bonjour-service export");
      } catch (e) {
        console.warn("[MDNS] bonjour-service unavailable, skipping advertisement.");
        return;
      }
      try {
        bonjour = new BonjourCtor();
        if (bonjour && typeof bonjour.on === "function") {
          bonjour.on("error", (err) => console.warn("[MDNS] error:", err && err.message));
        }
        mdnsService = bonjour.publish({
          name: "UECFI Presenter",
          type: MDNS_SERVICE_TYPE,
          port: port,
          txt: mdnsTxt()
        });
        if (mdnsService && typeof mdnsService.on === "function") {
          mdnsService.on("error", (err) => console.warn("[MDNS] service error:", err && err.message));
        }
        mdnsPort = port;
        console.log(`[MDNS] Advertising _${MDNS_SERVICE_TYPE}._tcp on port ${port}`);
      } catch (e) {
        console.warn("[MDNS] advertisement failed:", e && e.message);
        stopMdnsAdvertisement();
      }
    } catch (e) {}
  }

  function stopMdnsAdvertisement() {
    const b = bonjour;
    bonjour = null;
    mdnsService = null;
    mdnsPort = -1;
    try {
      if (b) {
        if (typeof b.unpublishAll === "function") {
          b.unpublishAll(() => { try { b.destroy(); } catch (e) {} });
        } else {
          try { b.destroy(); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // Files the remote engine pages need (presentation.htm iframe + theme).
  // Everything else on disk stays unreachable from the network.
  const STATIC_FILES = {
    "/presentation.htm": { file: "presentation.htm", type: "text/html; charset=utf-8" },
    "/uecfi-logo.png": { file: "uecfi-logo.png", type: "image/png" },
    "/keepawake.mp4": { file: "network/keepawake.mp4", type: "video/mp4" },
    "/keepawake.webm": { file: "network/keepawake.webm", type: "video/webm" },
    "/remote_engine.js": { file: "network/remote_engine.js", type: "text/javascript; charset=utf-8" },
    "/presentation.js": { file: "presentation.js", type: "text/javascript; charset=utf-8" },
    "/storage_service.js": { file: "storage_service.js", type: "text/javascript; charset=utf-8" },
    "/uecfipresenter.css": { file: "uecfipresenter.css", type: "text/css; charset=utf-8" }
  };
  const STATIC_DIRS = ["background", "graphics", "fonts", "font", "audio", "storage/audio"];
  const MIME_BY_EXT = {
    ".htm": "text/html; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".eot": "application/vnd.ms-fontobject"
  };

  function isAnyRunning() {
    return presenterRunning || audienceRunning;
  }

  function getStatus() {
    const shown = displayHost || bindHost;
    return {
      presenter: { running: presenterRunning, port: presenterPort, url: presenterRunning ? `http://${shown}:${presenterPort}/` : null },
      audience: { running: audienceRunning, port: audiencePort, url: audienceRunning ? `http://${shown}:${audiencePort}/` : null }
    };
  }

  function getAppRoot() {
    try {
      if (typeof AppStorage !== "undefined" && AppStorage.appDir) {
        const d = AppStorage.appDir();
        if (d) return d;
      }
    } catch (e) {}
    try {
      if (typeof __dirname === "string" && __dirname) return __dirname;
    } catch (e) {}
    try {
      if (typeof process !== "undefined" && process.cwd) return process.cwd();
    } catch (e) {}
    return ".";
  }

  // Supports init({ presenterPort, audiencePort, host }) and the legacy
  // init(port, host) which only (re)starts the presenter server.
  // With no arguments (or explicit stop), shuts everything down.
  function startOrStopServers(portOrConfig, targetHost) {
    let wantPresenter = null;
    let wantAudience = null;
    let host = null;

    if (portOrConfig && typeof portOrConfig === "object") {
      if (portOrConfig.presenterPort) wantPresenter = parseInt(portOrConfig.presenterPort, 10);
      if (portOrConfig.audiencePort) wantAudience = parseInt(portOrConfig.audiencePort, 10);
      if (portOrConfig.host) host = portOrConfig.host;
    } else if (portOrConfig) {
      wantPresenter = parseInt(portOrConfig, 10);
      if (targetHost) host = targetHost;
    }

    // No ports requested: stop everything (legacy toggle-off path)
    if (!wantPresenter && !wantAudience) {
      stopServer("presenter");
      stopServer("audience");
      refreshMdnsAdvertisement();
      return true;
    }

    if (typeof require !== "function") {
      alert("Remote servers require the desktop runtime (not available in client-only browser hosting).");
      return false;
    }

    if (host) displayHost = host;
    // Never bind to a single IP (e.g. 127.0.0.1 fallback): that makes the
    // server loopback-only and undiscoverable from phones. Always listen on
    // all interfaces; the selected IP is display-only.
    bindHost = "0.0.0.0";
    if (wantPresenter && wantAudience && wantPresenter === wantAudience) {
      alert("Presenter and audience ports must be different.");
      return false;
    }
    if (wantPresenter) presenterPort = wantPresenter;
    if (wantAudience) audiencePort = wantAudience;

    let ok = true;
    if (wantPresenter) ok = startServer("presenter", presenterPort) && ok;
    if (wantAudience) ok = startServer("audience", audiencePort) && ok;
    refreshMdnsAdvertisement();
    return ok;
  }

  function startServer(role, port) {
    try {
      const http = require("http");
      const fs = require("fs");
      const path = require("path");

      if ((role === "presenter" && presenterServer) || (role === "audience" && audienceServer)) {
        return true; // already up (e.g. same port re-enabled)
      }

      const serverInstance = http.createServer((req, res) => {
        try {
          const reqUrl = req.url || "/";
          const urlPath = reqUrl.split("?")[0];

          if (urlPath === "/favicon.ico") {
            res.writeHead(204);
            res.end();
            return;
          }

          // Projection-engine assets for the remote live view (both roles).
          if (serveStatic(urlPath, res, fs, path, req)) return;

          if (role === "audience") {
            // Audience is view-only: the page, the engine assets above and
            // the read-only live state. Nothing else.
            if (urlPath === "/" || urlPath === "/index.html") {
              servePage("audience.html", "UECFI Live", res, fs, path);
            } else if (urlPath === "/api/state") {
              sendJson(res, buildProjectionPayload("audience"));
            } else {
              res.writeHead(403, { "Content-Type": "text/plain" });
              res.end("Forbidden");
            }
            return;
          }

          // ---- Presenter role below ----
          if (urlPath === "/" || urlPath === "/index.html") {
            servePage("presenter.html", "UECFI Presenter Remote", res, fs, path);
            return;
          }

          if (urlPath === "/api/buttons") {
            sendJson(res, getCustomButtons());
            return;
          }

          if (urlPath === "/api/state") {
            const clientType = (qs(reqUrl, "client") || (req.headers && req.headers["x-client-device"]) || "").toLowerCase();
            const payloadRole = (clientType === "tv") ? "audience" : "presenter";
            sendJson(res, buildProjectionPayload(payloadRole));
            return;
          }

          // Scripture-selector data for the speaker remote
          if (urlPath === "/api/books") {
            sendJson(res, getBibleBooks());
            return;
          }
          if (urlPath === "/api/chapters") {
            sendJson(res, getBibleChapters(qs(reqUrl, "book")));
            return;
          }
          if (urlPath === "/api/verses") {
            sendJson(res, getBibleVerses(qs(reqUrl, "book"), qs(reqUrl, "chapter")));
            return;
          }

          // Song / program pickers for Slides + Songs modals.
          // [{id,name}] / [{id,title,type}]. Empty array (never 404) when
          // managers are not loaded yet, so older remotes keep working.
          if (urlPath === "/api/songs") {
            sendJson(res, getSongList());
            return;
          }
          if (urlPath === "/api/program") {
            sendJson(res, getProgramList());
            return;
          }

          if (urlPath === "/api/nav/verse") {
            const dir = qs(reqUrl, "dir") || "next";
            const fn = (dir === "prev")
              ? (typeof call_prevVerse === "function" ? call_prevVerse : (typeof window !== "undefined" ? window.call_prevVerse : null))
              : (typeof call_nextVerse === "function" ? call_nextVerse : (typeof window !== "undefined" ? window.call_nextVerse : null));
            const ok = (typeof fn === "function") ? fn() : false;
            sendJson(res, { ok: ok, dir: dir });
            return;
          }

          // Legacy command API (test.txt?command=N&value=...): presenter only
          if (reqUrl.includes("test.txt") || reqUrl.includes("command=")) {
            res.writeHead(200, {
              "Content-Type": "text/plain; charset=utf-8",
              "Access-Control-Allow-Origin": "*"
            });
            res.end(handleCommand(reqUrl));
            return;
          }

          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");

          function servePage(file, fallbackTitle, res, fs, path) {
            // Remote pages change often: never let phones cache them.
            const htmlHeaders = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
            try {
              const htmlPath = path.join(getAppRoot(), "network", file);
              if (fs.existsSync(htmlPath)) {
                res.writeHead(200, htmlHeaders);
                res.end(fs.readFileSync(htmlPath, "utf8"));
              } else {
                res.writeHead(200, htmlHeaders);
                res.end(`<h1>${fallbackTitle}</h1><p>Active</p>`);
              }
            } catch (e) {
              res.writeHead(200, htmlHeaders);
              res.end(`<h1>${fallbackTitle}</h1><p>Active</p>`);
            }
          }

          function sendJson(res, obj) {
            try {
              res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*"
              });
              res.end(JSON.stringify(obj));
            } catch (e) {
              res.writeHead(500, { "Content-Type": "text/plain" });
              res.end("Server Error");
            }
          }
        } catch (handlerErr) {
          console.error("[HTTP SERVER] Request handling error:", handlerErr);
          try {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Server Error");
          } catch (e) {}
        }
      });

      serverInstance.on("error", (err) => {
        console.error(`[HTTP SERVER] ${role} server error:`, err);
        if (role === "presenter") { presenterRunning = false; presenterServer = null; }
        else { audienceRunning = false; audienceServer = null; }
        refreshMdnsAdvertisement();
        alert(`Remote ${role} server error: ` + err.message);
      });

      serverInstance.listen(port, bindHost, () => {
        console.log(`[HTTP SERVER] UECFI ${role} remote listening on http://${bindHost}:${port}/`);
      });

      if (role === "presenter") { presenterServer = serverInstance; presenterRunning = true; }
      else { audienceServer = serverInstance; audienceRunning = true; }
      return true;
    } catch (err) {
      console.error("[HTTP SERVER] Start failure:", err);
      alert(`Remote ${role} server failed to start: ` + err.message);
      return false;
    }
  }

  // Serves the projection-engine files remote live views need.
  // Static assets (backgrounds, graphics, media) get long-lived caching headers (7 days)
  // and ETag / 304 validation. Dynamic files (.htm, .js, .css) remain no-store.
  // Returns true when the path was handled (served or rejected as 404).
  function serveStatic(urlPath, res, fs, path, req) {
    try {
      let decoded = urlPath;
      try { decoded = decodeURIComponent(urlPath); } catch (e) { return false; }
      if (decoded.indexOf("..") !== -1 || decoded.indexOf("\\") !== -1 || decoded.indexOf("\0") !== -1) return false;

      const root = getAppRoot();
      let full = null;
      let contentType = null;
      let isCacheableAsset = false;

      if (Object.prototype.hasOwnProperty.call(STATIC_FILES, decoded)) {
        const entry = STATIC_FILES[decoded];
        full = path.join(root, entry.file);
        contentType = entry.type;
        const ext = path.extname(entry.file).toLowerCase();
        isCacheableAsset = /^\.(png|jpe?g|webp|gif|bmp|mp4|webm|woff2?|ttf|otf)$/.test(ext);
      } else {
        const segs = decoded.replace(/^\/+/, "").split("/");
        if (segs.length >= 2 && STATIC_DIRS.indexOf(segs[0]) !== -1) {
          const ext = path.extname(segs[segs.length - 1]).toLowerCase();
          if (!Object.prototype.hasOwnProperty.call(MIME_BY_EXT, ext)) return false;
          full = path.join(root, ...segs);
          // Confine to the app root even after normalization.
          const normRoot = path.normalize(root + path.sep);
          const normFull = path.normalize(full);
          if (normFull !== normRoot.slice(0, -1) && normFull.indexOf(normRoot) !== 0) return false;
          contentType = MIME_BY_EXT[ext];
          isCacheableAsset = /^\.(png|jpe?g|webp|gif|bmp|mp4|webm|woff2?|ttf|otf)$/.test(ext);
        }
      }

      if (!full || !contentType) return false;

      try {
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const stat = fs.statSync(full);
          const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`;
          const lastModified = stat.mtime.toUTCString();

          const reqHeaders = (req && req.headers) || {};
          if (isCacheableAsset && (reqHeaders["if-none-match"] === etag || reqHeaders["if-modified-since"] === lastModified)) {
            res.writeHead(304, {
              "ETag": etag,
              "Last-Modified": lastModified,
              "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
              "Access-Control-Allow-Origin": "*"
            });
            res.end();
            return true;
          }

          const headers = {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": isCacheableAsset ? "public, max-age=604800, stale-while-revalidate=86400" : "no-store",
            "ETag": etag,
            "Last-Modified": lastModified
          };

          res.writeHead(200, headers);
          res.end(fs.readFileSync(full));
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
        }
      } catch (e) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopServer(role) {
    try {
      if (role === "presenter" && presenterServer) {
        try { presenterServer.close(); } catch (e) {}
        presenterServer = null;
      }
      if (role === "audience" && audienceServer) {
        try { audienceServer.close(); } catch (e) {}
        audienceServer = null;
      }
    } catch (e) {}
    if (role === "presenter") presenterRunning = false;
    else audienceRunning = false;
    return true;
  }

  // Custom presenter buttons, configured in the dashboard app.
  // Stored as [{ label, command, value }]; command uses the same numbers
  // as the command API (1 = present verse ref, 4 = blank, 7 = schedule #…).
  function getCustomButtons() {
    const fallback = [{ label: "Blank Screen", command: "4", value: "0" }];
    try {
      if (typeof localStorage === "undefined") return fallback;
      const raw = localStorage.getItem("uecfi_remote_buttons");
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return fallback;
      const clean = parsed
        .filter(b => b && typeof b.label === "string" && b.label.trim() !== "" && /^\d+$/.test(String(b.command || "")))
        .map(b => ({ label: String(b.label).slice(0, 24), command: String(b.command), value: String(b.value || "") }));
      return clean.length > 0 ? clean : fallback;
    } catch (e) {
      return fallback;
    }
  }

  // Shared transport rules (see computeRemoteNav in p_window.js): what CAN
  // Prev/Next do right now. Fail-open when the helper is unavailable.
  function remoteNav() {
    try {
      if (typeof computeRemoteNav === "function") return computeRemoteNav();
    } catch (e) {}
    return { canPrev: true, canNext: true };
  }

  // Read a controller global without throwing when it was never declared.
  function gv(name, fb) {
    try {
      const v = eval(name);
      return (v === undefined || v === null) ? fb : v;
    } catch (e) {
      return fb;
    }
  }

  function num(v, fb) {
    const n = Number(v);
    return isFinite(n) ? n : fb;
  }

  // Single query-string value (?a=1&b=2), "" when absent/unparseable.
  function qs(reqUrl, name) {
    try {
      const q = (reqUrl.split("?")[1] || "").replace(/\?/g, "&");
      const params = new URLSearchParams(q);
      const v = params.get(name);
      return v === null || v === undefined ? "" : v;
    } catch (e) {
      return "";
    }
  }

  // Book catalogue for the remote scripture selector: resolves both active
  // Bible versions (version1 / version2) from the loaded Bible XMLs just like
  // renderBookList() in uecfipresenter.js, returning "Primary/Secondary" in
  // `name` (plus explicit `primary` and `secondary` fields). Clients send the
  // first variant (`primary`) as the command=1 reference.
  function getBibleBooks() {
    try {
      const names = gv("booknames", null);
      if (!Array.isArray(names)) return [];
      const bibleArr = gv("bible", null);
      const defNames = gv("default_booknames", null);
      const v1 = gv("version1", 1);
      const v2 = gv("version2", 2);

      // Helper matching getBookNameSafely() in uecfipresenter.js so the remote
      // book list always mirrors the desktop app's active dual versions.
      function resolveBookName(vIndex, bIndex) {
        try {
          if (bibleArr && bibleArr[vIndex]) {
            const bnNode = bibleArr[vIndex].getElementsByTagName("booknames")[0];
            if (bnNode && bnNode.textContent) {
              const arr = bnNode.textContent.split(",");
              if (arr[bIndex] && arr[bIndex].trim()) return arr[bIndex].trim();
            }
            const books = bibleArr[vIndex].getElementsByTagName("b");
            if (books && books[bIndex] && typeof books[bIndex].getAttribute === "function") {
              const nm = books[bIndex].getAttribute("n");
              if (nm && nm.trim()) return nm.trim();
            }
          }
          if (Array.isArray(defNames) && defNames[bIndex]) {
            const parts = String(defNames[bIndex]).split("/");
            if (vIndex === v2) {
              return (parts.length > 1 ? parts[1] : parts[0]).trim();
            }
            return parts[0].trim();
          }
        } catch (e) {}
        return String(names[bIndex] || "").split("/")[0].trim();
      }

      const out = [];
      for (let i = 0; i < names.length; i++) {
        if (typeof names[i] === "string" && names[i] !== "") {
          const p1 = resolveBookName(v1, i) || String(names[i]).split("/")[0].trim();
          const p2 = resolveBookName(v2, i) || p1;
          const combined = (p2 && p2 !== p1) ? `${p1}/${p2}` : `${p1}/${p2}`;
          out.push({ i: i, name: combined, primary: p1, secondary: p2 });
        }
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  // numofch[bookIdx+1] = [chapterCount, versesCh1, versesCh2, ...]
  function getBibleChapters(book) {
    try {
      const b = parseInt(book, 10);
      const table = gv("numofch", null);
      const names = gv("booknames", null);
      if (!isFinite(b) || !table || !names || b < 0 || b >= names.length) return { book: b || 0, count: 0 };
      const row = table[b + 1];
      const count = (row && isFinite(Number(row[0]))) ? Number(row[0]) : 0;
      return { book: b, count: count };
    } catch (e) {
      return { book: 0, count: 0 };
    }
  }

  function getBibleVerses(book, chapter) {
    try {
      const b = parseInt(book, 10);
      const c = parseInt(chapter, 10);
      const table = gv("numofch", null);
      const names = gv("booknames", null);
      if (!isFinite(b) || !isFinite(c) || !table || !names || b < 0 || b >= names.length) {
        return { book: 0, chapter: 1, count: 0 };
      }
      const row = table[b + 1];
      const count = (row && c >= 1 && isFinite(Number(row[c]))) ? Number(row[c]) : 0;
      return { book: b, chapter: c, count: count };
    } catch (e) {
      return { book: 0, chapter: 1, count: 0 };
    }
  }

  // Slides/Songs modals: stable id lists. Never throws, never 404s —
  // remotes fall back to /api/buttons cmd 8/9 when these are empty.
  function getSongList() {
    try {
      const mgr = gv("songManagerObj", null);
      if (mgr && typeof mgr.getAllSongs === "function") {
        const list = mgr.getAllSongs();
        if (Array.isArray(list)) {
          return list
            .filter(s => s && s.name != null)
            .map(s => ({ id: String(s.id), name: String(s.name) }));
        }
      }
    } catch (e) {}
    return [];
  }

  function getProgramList() {
    try {
      let pm = null;
      try { pm = gv("programManager", null); } catch (e) { pm = null; }
      if ((!pm || !Array.isArray(pm.items)) && typeof window !== "undefined" && window.programManager) {
        pm = window.programManager;
      }
      if (pm && Array.isArray(pm.items)) {
        return pm.items
          .filter(it => it && it.title != null)
          .map(it => ({ id: String(it.id), title: String(it.title), type: String(it.type || "") }));
      }
    } catch (e) {}
    return [];
  }

  // JSON-safe deep clone (drops functions/circular refs instead of throwing).
  function jsonSafe(v) {
    try {
      const seen = new Set();
      return JSON.parse(JSON.stringify(v, (k, val) => {
        if (typeof val === "function") return undefined;
        if (val && typeof val === "object") {
          if (seen.has(val)) return undefined;
          seen.add(val);
        }
        return val;
      }));
    } catch (e) {
      return null;
    }
  }

  // Backgrounds are stored as app-relative paths (./background/x.png).
  // An absolute disk path can never resolve on a phone, so map it back
  // into the allowlisted image dirs by basename when possible.
  function mapBkgndForRemote(b) {
    try {
      if (!b || typeof b !== "string") return "";
      let s = b.trim();
      if (s === "") return "";
      if (s.startsWith("file://")) s = s.replace(/^file:\/\//, "");
      if (s.indexOf("..") === -1 && s.indexOf("\\") === -1 &&
          s.indexOf(":") === -1 && !s.startsWith("/")) {
        return s;
      }
      const base = s.split(/[\\/]/).pop();
      if (!base || base.indexOf("..") !== -1) return "";
      const fs = require("fs");
      const path = require("path");
      const root = getAppRoot();
      const dirs = ["background", "graphics"];
      for (let i = 0; i < dirs.length; i++) {
        try {
          const full = path.join(root, dirs[i], base);
          if (fs.existsSync(full) && fs.statSync(full).isFile()) return `./${dirs[i]}/${base}`;
        } catch (e) {}
      }
      return "";
    } catch (e) {
      return "";
    }
  }

  // Live slide + theme payload. Field names match the projection engine's
  // previewState injection point (see initPresentation in presentation.js),
  // so remote pages can render through the exact same renderer. The object
  // is timestamp-free so clients can diff it with a plain string compare.
  // Output state (Logo / Attention toolbar buttons) rides along too:
  // liveOutputMode is the controller source of truth, p_logo_mode + the
  // p_logo_* config drive the logoLayer overlay, p_output_mode drives the
  // blackLayer overlay. Without these the remote engine always renders
  // plain live content.
  function buildProjectionPayload(role) {
    try {
      const live = !!gv("presentWindowOpen", false);
      let theme = null;
      try { theme = jsonSafe(gv("activeThemeObj", null)); } catch (e) { theme = null; }
      let indicator = "";
      try {
        const lms = gv("liveMonitorState", null) ||
          ((typeof window !== "undefined" && window.liveMonitorState) ? window.liveMonitorState : null);
        if (lms && lms.indicator) indicator = String(lms.indicator);
        else if (typeof window !== "undefined" && window.p_title) indicator = String(window.p_title);
      } catch (e) {}
      let outputMode = "live";
      try {
        outputMode = String(gv("liveOutputMode", gv("p_output_mode", "live")) || "live");
        if (outputMode !== "live" && outputMode !== "logo" && outputMode !== "black" && outputMode !== "attention") outputMode = "live";
      } catch (e) { outputMode = "live"; }

      const rawAttentionMode = !!gv("p_attention_mode", outputMode === "attention" || outputMode === "black");
      const attentionSpeakerShow = !!gv("p_attention_speaker_show", false);
      const isAttentionActive = (outputMode === "attention" || rawAttentionMode);

      let effectiveOutputMode = outputMode;
      let effectiveAttentionMode = rawAttentionMode;
      if (role === "presenter" && isAttentionActive && !attentionSpeakerShow) {
        effectiveOutputMode = "live";
        effectiveAttentionMode = false;
      }
      let isVerse = false;
      try {
        if (typeof isLiveVerseActive === "function") {
          isVerse = isLiveVerseActive();
        } else if (typeof window !== "undefined" && typeof window.isLiveVerseActive === "function") {
          isVerse = window.isLiveVerseActive();
        } else {
          const projType = String(gv("liveProjectionType", "") || "");
          isVerse = live && (projType === "verses" || (theme && theme.context === "verses"));
        }
      } catch (e) {
        isVerse = false;
      }

      return {
        live: live,
        projectionType: String(gv("liveProjectionType", "") || ""),
        isVerse: !!isVerse,
        text1: jsonSafe(gv("p_text1_arr", [])) || [],
        text2: jsonSafe(gv("p_text2_arr", [])) || [],
        titleArr: jsonSafe(gv("p_title_arr", [])) || [],
        font1: String(gv("p_text1_font", "Arial") || "Arial"),
        font2: String(gv("p_text2_font", "Arial") || "Arial"),
        title: String(gv("p_title", "") || ""),
        footnote: String(gv("p_footnote", "") || ""),
        index: num(gv("p_current_index", 0), 0),
        last: num(gv("p_last_index", 0), 0),
        bkgnd: mapBkgndForRemote(gv("p_bkgnd_filename", "")),
        bkgndColor: String(gv("p_bkgnd_color", "black") || "black"),
        fontColor: String(gv("p_font_color", "#FFFFFF") || "#FFFFFF"),
        winX: num(gv("pWindowX", 800), 800),
        winY: num(gv("pWindowY", 600), 600),
        marginTop: num(gv("p_topMargin", 50), 50),
        marginBottom: num(gv("p_bottomMargin", 50), 50),
        marginLeft: num(gv("p_leftMargin", 50), 50),
        marginRight: num(gv("p_rightMargin", 50), 50),
        maxFS: num(gv("p_maxFontSize", 100), 100),
        transition: !!gv("p_enableTransition", true),
        showTitle: gv("p_showTitle", true) !== false,
        shadow: gv("p_enableShadow", true) !== false,
        ver1: num(gv("p_ver1ScaleFactor", 1), 1),
        ver2: num(gv("p_ver2ScaleFactor", 1), 1),
        align: String(gv("p_align", "center") || "center"),
        theme: theme,
        syncEnabled: (typeof window !== "undefined" && window.songAudioEngine) ? (window.songAudioEngine.syncEnabled !== false) : true,
        syncActiveLineIndex: (typeof window !== "undefined" && window.songAudioEngine && typeof window.songAudioEngine.activeLineIndex === "number") ? window.songAudioEngine.activeLineIndex : -1,
        syncActiveColor: (theme && theme.syncActiveColor) || "#F59E0B",
        syncInactiveColor: (theme && theme.syncInactiveColor) || "#94A3B8",
        status: indicator,
        nav: remoteNav(),
        outputMode: effectiveOutputMode,
        logoMode: !!gv("p_logo_mode", outputMode === "logo"),
        logoImage: String(gv("p_logo_image", "") || ""),
        logoTitle: String(gv("p_logo_title", "") || ""),
        logoSub: String(gv("p_logo_sub", "") || ""),
        logoBg: String(gv("p_logo_bg", "#020617") || "#020617"),
        logoColor: String(gv("p_logo_color", "#ffffff") || "#ffffff"),
        logoImgSize: num(gv("p_logo_imgsize", 40), 40),
        logoTitleSize: num(gv("p_logo_titlesize", 8), 8),
        logoSubSize: num(gv("p_logo_subsize", 4), 4),
        logoTitleBold: gv("p_logo_title_bold", true) !== false,
        logoTitleItalic: !!gv("p_logo_title_italic", false),
        logoSubBold: !!gv("p_logo_sub_bold", false),
        logoSubItalic: !!gv("p_logo_sub_italic", false),
        logoBgImage: String(gv("p_logo_bgimage", "") || ""),
        logoBgDim: num(gv("p_logo_bgdim", 50), 50),
        attentionActive: isAttentionActive,
        attentionMode: effectiveAttentionMode,
        attentionImage: String(gv("p_attention_image", "") || ""),
        attentionTitle: String(gv("p_attention_title", "ATTENTION") || "ATTENTION"),
        attentionSub: String(gv("p_attention_sub", "") || ""),
        attentionBg: String(gv("p_attention_bg", "#000000") || "#000000"),
        attentionColor: String(gv("p_attention_color", "#ffffff") || "#ffffff"),
        attentionImgSize: num(gv("p_attention_imgsize", 35), 35),
        attentionTitleSize: num(gv("p_attention_titlesize", 10), 10),
        attentionSubSize: num(gv("p_attention_subsize", 5), 5),
        attentionTitleBold: gv("p_attention_title_bold", true) !== false,
        attentionTitleItalic: !!gv("p_attention_title_italic", false),
        attentionTitleCaps: gv("p_attention_title_caps", true) !== false,
        attentionTitleColor: String(gv("p_attention_title_color", "") || gv("p_attention_color", "#ffffff") || "#ffffff"),
        attentionTitleBorderColor: String(gv("p_attention_title_border_color", "#000000") || "#000000"),
        attentionTitleBorderThickness: num(gv("p_attention_title_border_thickness", 0), 0),
        attentionTitlePaddingV: num(gv("p_attention_title_padding_v", 0), 0),
        attentionTitlePaddingH: num(gv("p_attention_title_padding_h", 0), 0),
        attentionSubBold: !!gv("p_attention_sub_bold", false),
        attentionSubItalic: !!gv("p_attention_sub_italic", false),
        attentionSubCaps: !!gv("p_attention_sub_caps", false),
        attentionSubColor: String(gv("p_attention_sub_color", "") || gv("p_attention_color", "#ffffff") || "#ffffff"),
        attentionSubBorderColor: String(gv("p_attention_sub_border_color", "#000000") || "#000000"),
        attentionSubBorderThickness: num(gv("p_attention_sub_border_thickness", 0), 0),
        attentionSubPaddingV: num(gv("p_attention_sub_padding_v", 0), 0),
        attentionSubPaddingH: num(gv("p_attention_sub_padding_h", 0), 0),
        attentionBorderColor: String(gv("p_attention_border_color", "#ffffff") || "#ffffff"),
        attentionBorderThickness: num(gv("p_attention_border_thickness", 0), 0),
        attentionPaddingV: num(gv("p_attention_padding_v", 5), 5),
        attentionPaddingH: num(gv("p_attention_padding_h", 5), 5),
        attentionSpeakerShow: !!gv("p_attention_speaker_show", false),
        attentionBgImage: String(gv("p_attention_bgimage", "") || ""),
        attentionBgDim: num(gv("p_attention_bgdim", 60), 60),
        customSlide: jsonSafe(gv("p_custom_slide", null))
      };
    } catch (e) {
      return { live: false };
    }
  }

  // Legacy command set (presenter role only). Throttled to one per 400ms.
  function handleCommand(reqUrl) {
    let responseText = "";
    try {
      const urlParts = reqUrl.split("?");
      const queryString = urlParts[1] || "";
      const params = new URLSearchParams(queryString.replace(/\?/g, "&"));
      const command = params.get("command") || "";
      let value = params.get("value") || "";
      value = decodeURIComponent(value);

      if (canProcessCommand) {
        canProcessCommand = false;
        setTimeout(() => { canProcessCommand = true; }, 400);

        switch (command) {
          case "1": { // Present Bible Reference
            if (typeof bibleRefObj !== "undefined" && bibleRefObj) {
              const success = bibleRefObj.init(value);
              if (success) {
                bibleRefObj.present();
                responseText = "OK: Presenting " + value;
              } else {
                responseText = bibleRefObj.getErrorMessage ? bibleRefObj.getErrorMessage() : "Invalid Bible Reference";
              }
            }
            break;
          }
          case "2": // Next Slide (gated by transport rules)
            if (typeof call_nextSlide === "function") {
              responseText = call_nextSlide() ? "OK: Next Slide" : "Ignored: Next unavailable";
            }
            break;
          case "3": // Previous Slide (gated by transport rules)
            if (typeof call_prevSlide === "function") {
              responseText = call_prevSlide() ? "OK: Previous Slide" : "Ignored: Previous unavailable";
            }
            break;
          case "20": // Next Verse (verses only)
            if (typeof call_nextVerse === "function") {
              responseText = call_nextVerse() ? "OK: Next Verse" : "Ignored: Verse navigation unavailable";
            } else if (typeof window !== "undefined" && typeof window.call_nextVerse === "function") {
              responseText = window.call_nextVerse() ? "OK: Next Verse" : "Ignored: Verse navigation unavailable";
            } else {
              responseText = "Verse navigation unavailable";
            }
            break;
          case "21": // Previous Verse (verses only)
            if (typeof call_prevVerse === "function") {
              responseText = call_prevVerse() ? "OK: Previous Verse" : "Ignored: Verse navigation unavailable";
            } else if (typeof window !== "undefined" && typeof window.call_prevVerse === "function") {
              responseText = window.call_prevVerse() ? "OK: Previous Verse" : "Ignored: Verse navigation unavailable";
            } else {
              responseText = "Verse navigation unavailable";
            }
            break;
          case "4": // Stop / Close Presentation (ends live, shows OFF AIR)
            if (typeof call_closePresentation === "function") call_closePresentation();
            responseText = "OK: Closed Presentation";
            break;
          case "10": { // Show Logo overlay (keeps live content underneath)
            if (typeof setLiveMonitorMode === "function") {
              setLiveMonitorMode("logo");
              responseText = "OK: Logo Screen";
            } else {
              responseText = "Logo unavailable";
            }
            break;
          }
          case "11": { // Attention / Black overlay (keeps live content underneath)
            if (typeof setLiveMonitorMode === "function") {
              setLiveMonitorMode("attention");
              responseText = "OK: Attention";
            } else {
              responseText = "Attention unavailable";
            }
            break;
          }
          case "12": { // Restore live content from logo/black overlay
            try {
              if (typeof reRenderLiveMonitor === "function") {
                reRenderLiveMonitor();
                responseText = "OK: Live Restored";
              } else if (typeof setLiveMonitorMode === "function") {
                setLiveMonitorMode("live");
                responseText = "OK: Live Restored";
              } else {
                responseText = "Live restore unavailable";
              }
            } catch (e) {
              responseText = "Live restore unavailable";
            }
            break;
          }
          case "5": // Get Recent
            if (typeof recent !== "undefined" && recent && typeof recent.data2string === "function") {
              responseText = recent.data2string();
            }
            break;
          case "6": // Get Schedule Text
            if (typeof scheduleObj !== "undefined" && scheduleObj && typeof scheduleObj.getScheduleText === "function") {
              responseText = scheduleObj.getScheduleText();
            }
            break;
          case "7": // Present Schedule Item
            if (typeof scheduleObj !== "undefined" && scheduleObj && typeof scheduleObj.processRemotePresent === "function") {
              scheduleObj.processRemotePresent(value);
              responseText = "OK: Present Schedule " + value;
            }
            break;
          case "8": { // Present Song by stable song id
            try {
              if (typeof songManagerObj !== "undefined" && songManagerObj &&
                  typeof songManagerObj.getSongObjWithID === "function" &&
                  typeof songPresentObj === "function") {
                const song = songManagerObj.getSongObjWithID(value);
                if (song && song.slides && song.slides.length > 0) {
                  const pres = new songPresentObj();
                  pres.init(song);
                  pres.present(0);
                  responseText = "OK: Presenting song " + (song.name || value);
                } else {
                  responseText = "Song not found: " + value;
                }
              } else {
                responseText = "Song presenting unavailable";
              }
            } catch (e) {
              responseText = "Song not found: " + value;
            }
            break;
          }
          case "9": { // Present Program Item by stable item id (numeric index fallback)
            try {
              const pm = (typeof programManager !== "undefined") ? programManager :
                ((typeof window !== "undefined" && window.programManager) ? window.programManager : null);
              if (pm && Array.isArray(pm.items) && typeof pm.presentItem === "function") {
                let idx = pm.items.findIndex(it => it && String(it.id) === String(value));
                if (idx < 0 && /^\d+$/.test(value)) {
                  const n = parseInt(value, 10);
                  if (n >= 0 && n < pm.items.length) idx = n;
                }
                if (idx >= 0) {
                  pm.presentItem(idx);
                  responseText = "OK: Presenting program " + ((pm.items[idx] && pm.items[idx].title) || value);
                } else {
                  responseText = "Program item not found: " + value;
                }
              } else {
                responseText = "Program presenting unavailable";
              }
            } catch (e) {
              responseText = "Program item not found: " + value;
            }
            break;
          }
          default:
            responseText = "Unknown Command";
            break;
        }
      }
    } catch (e) {
      console.error("[HTTP SERVER] Command error:", e);
    }
    return responseText;
  }
}
