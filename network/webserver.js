/**
 * Dual-Port Remote Servers for UECFI Presenter
 *
 * Two HTTP servers (Node 'http' in the Electron renderer):
 *   - Presenter port: speaker remote (live projection + Prev/Next and
 *     dashboard-configurable custom buttons) + command API.
 *   - Audience port:  live projection ONLY (no commands accepted).
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

  // Files the remote engine pages need (presentation.htm iframe + theme).
  // Everything else on disk stays unreachable from the network.
  const STATIC_FILES = {
    "/presentation.htm": { file: "presentation.htm", type: "text/html; charset=utf-8" },
    "/keepawake.mp4": { file: "network/keepawake.mp4", type: "video/mp4" },
    "/keepawake.webm": { file: "network/keepawake.webm", type: "video/webm" },
    "/remote_engine.js": { file: "network/remote_engine.js", type: "text/javascript; charset=utf-8" },
    "/presentation.js": { file: "presentation.js", type: "text/javascript; charset=utf-8" },
    "/storage_service.js": { file: "storage_service.js", type: "text/javascript; charset=utf-8" },
    "/uecfipresenter.css": { file: "uecfipresenter.css", type: "text/css; charset=utf-8" }
  };
  const STATIC_DIRS = ["background", "graphics", "fonts", "font"];
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
    return {
      presenter: { running: presenterRunning, port: presenterPort, url: presenterRunning ? `http://${bindHost}:${presenterPort}/` : null },
      audience: { running: audienceRunning, port: audiencePort, url: audienceRunning ? `http://${bindHost}:${audiencePort}/` : null }
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
      return true;
    }

    if (typeof require !== "function") {
      alert("Remote servers require the desktop runtime (not available in client-only browser hosting).");
      return false;
    }

    if (host) bindHost = host;
    if (wantPresenter && wantAudience && wantPresenter === wantAudience) {
      alert("Presenter and audience ports must be different.");
      return false;
    }
    if (wantPresenter) presenterPort = wantPresenter;
    if (wantAudience) audiencePort = wantAudience;

    let ok = true;
    if (wantPresenter) ok = startServer("presenter", presenterPort) && ok;
    if (wantAudience) ok = startServer("audience", audiencePort) && ok;
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
          if (serveStatic(urlPath, res, fs, path)) return;

          if (role === "audience") {
            // Audience is view-only: the page, the engine assets above and
            // the read-only live state. Nothing else.
            if (urlPath === "/" || urlPath === "/index.html") {
              servePage("audience.html", "UECFI Live", res, fs, path);
            } else if (urlPath === "/api/state") {
              sendJson(res, buildProjectionPayload());
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
            sendJson(res, buildProjectionPayload());
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
  // Returns true when the path was handled (served or rejected as 404).
  function serveStatic(urlPath, res, fs, path) {
    try {
      let decoded = urlPath;
      try { decoded = decodeURIComponent(urlPath); } catch (e) { return false; }
      if (decoded.indexOf("..") !== -1 || decoded.indexOf("\\") !== -1 || decoded.indexOf("\0") !== -1) return false;

      const root = getAppRoot();

      if (Object.prototype.hasOwnProperty.call(STATIC_FILES, decoded)) {
        const entry = STATIC_FILES[decoded];
        const full = path.join(root, entry.file);
        try {
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            res.writeHead(200, { "Content-Type": entry.type, "Cache-Control": "no-store" });
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
      }

      const segs = decoded.replace(/^\/+/, "").split("/");
      if (segs.length >= 2 && STATIC_DIRS.indexOf(segs[0]) !== -1) {
        const ext = path.extname(segs[segs.length - 1]).toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(MIME_BY_EXT, ext)) return false;
        const full = path.join(root, ...segs);
        // Confine to the app root even after normalization.
        const normRoot = path.normalize(root + path.sep);
        const normFull = path.normalize(full);
        if (normFull !== normRoot.slice(0, -1) && normFull.indexOf(normRoot) !== 0) return false;
        try {
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            res.writeHead(200, { "Content-Type": MIME_BY_EXT[ext], "Cache-Control": "no-store" });
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
      }
      return false;
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

  // Book catalogue for the remote scripture selector: stored display
  // names ("Juan/John"); clients send the first variant as the reference.
  function getBibleBooks() {
    try {
      const names = gv("booknames", null);
      if (!Array.isArray(names)) return [];
      const out = [];
      for (let i = 0; i < names.length; i++) {
        if (typeof names[i] === "string" && names[i] !== "") out.push({ i: i, name: names[i] });
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
  function buildProjectionPayload() {
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
      return {
        live: live,
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
        status: indicator,
        nav: remoteNav()
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
          case "4": // Close / Blank Presentation
            if (typeof call_closePresentation === "function") call_closePresentation();
            responseText = "OK: Closed Presentation";
            break;
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
