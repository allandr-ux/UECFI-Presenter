/* Shared live-engine driver for the UECFI remote pages.
 *
 * Embeds presentation.htm -- the exact projection renderer the sidebar
 * Live Output Preview uses -- and feeds it through its previewState
 * injection point (see initPresentation in presentation.js). The page polls
 * api/state once a second and re-renders only when the payload changes.
 * Same-origin iframe (served from the same remote port), so direct
 * contentWindow access is allowed. The mirror is deliberately faithful:
 * it never alters sizes, theme, or layout versus the projector.
 * No dependencies.
 */
(function () {
  var lastJson = "";
  var engineLive = false;

  function el(id) { return document.getElementById(id); }

  function setStatus(msg) {
    var s = el("status");
    if (s) s.textContent = msg || "";
  }

  function setOffAir(off) {
    var o = el("offair");
    if (o) o.style.display = off ? "flex" : "none";
  }

  // Transport rules from the server (state.nav). Pages with Prev/Next
  // buttons expose window.onRemoteNav to disable them; others ignore.
  function emitNav(nav) {
    try {
      if (typeof window.onRemoteNav === "function") {
        window.onRemoteNav(nav || { canPrev: false, canNext: false });
      }
    } catch (e) {}
  }

  /* Fullscreen toggle (Fullsceen API; iPhone Safari has none, so the
   * button hides itself there -- iOS users get fullscreen via the
   * Add-to-Home-Screen web-app meta tags on the remote pages). */
  function fsSupported() {
    try {
      var de = document.documentElement;
      return !!(de.requestFullscreen || de.webkitRequestFullscreen ||
        de.mozRequestFullScreen || de.msRequestFullscreen);
    } catch (e) { return false; }
  }
  function fsActive() {
    try {
      return !!(document.fullscreenElement || document.webkitFullscreenElement ||
        document.mozFullScreenElement || document.msFullscreenElement);
    } catch (e) { return false; }
  }
  function updateFsBtn() {
    var b = el("fsBtn");
    if (!b) return;
    try {
      if (!fsSupported()) { b.style.display = "none"; return; }
      b.textContent = fsActive() ? "Exit Full" : "\u26F6 Full";
    } catch (e) {}
  }
  function toggleFullscreen() {
    try {
      if (fsActive()) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      } else {
        var de = document.documentElement;
        var r = de.requestFullscreen || de.webkitRequestFullscreen ||
          de.mozRequestFullScreen || de.msRequestFullscreen;
        if (r) {
          var p = null;
          try { p = r.call(de); } catch (e) {}
          if (p && typeof p.catch === "function") p.catch(function () {});
        }
      }
    } catch (e) {}
    setTimeout(updateFsBtn, 300);
  }

  /* Keep the screen awake during a service. Prefers the Wake Lock API
   * (Android/Chrome/desktop); falls back to a tiny silent looping video
   * for iOS Safari, which has no Wake Lock API. Stay-awake video technique
   * via NoSleep.js v0.12.0 by Rich Tibbett (MIT license). */
  var WAKE_VIDEOS = [
    { file: "keepawake.mp4", type: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' },
    { file: "keepawake.webm", type: 'video/webm; codecs="vp8, vorbis"' }
  ];
  var wakeLockObj = null;
  var wantAwake = true;
  var awakeVideo = null;

  function pickAwakeVideo() {
    try {
      var v = document.createElement("video");
      if (v && typeof v.canPlayType === "function") {
        for (var i = 0; i < WAKE_VIDEOS.length; i++) {
          var res = v.canPlayType(WAKE_VIDEOS[i].type);
          if (res === "probably" || res === "maybe") return WAKE_VIDEOS[i].file;
        }
      }
    } catch (e) {}
    return WAKE_VIDEOS[0].file;
  }
  // Idempotent: safe to call on every tap/visibility change. A play()
  // outside a user gesture (page load) is rejected on iOS, so the flag
  // must NOT latch on failure -- the next tap retries and succeeds.
  function startAwakeVideo() {
    try {
      if (awakeVideo) {
        try {
          if (!awakeVideo.paused) return; // already keeping us awake
        } catch (e) {}
      } else {
        var v = document.createElement("video");
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.setAttribute("preload", "auto");
        v.setAttribute("loop", "");
        v.muted = true;
        try { v.playsInline = true; } catch (e) {}
        try { v.volume = 0; } catch (e) {}
        v.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;";
        v.src = pickAwakeVideo();
        if (document.body) document.body.appendChild(v);
        awakeVideo = v;
      }
      var p = null;
      try { p = awakeVideo.play(); } catch (e) {}
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (e) {}
  }
  function hasWakeLockApi() {
    try {
      return (typeof navigator !== "undefined" && navigator.wakeLock &&
        typeof navigator.wakeLock.request === "function");
    } catch (e) { return false; }
  }
  function acquireWakeLock() {
    if (!wantAwake) return;
    try {
      if (typeof document !== "undefined" && document.hidden) return;
    } catch (e) {}
    if (hasWakeLockApi()) {
      try {
        navigator.wakeLock.request("screen").then(function (lock) {
          wakeLockObj = lock;
          try {
            lock.addEventListener("release", function () {
              wakeLockObj = null;
              if (wantAwake) setTimeout(acquireWakeLock, 1500);
            });
          } catch (e) {}
        }).catch(function () {
          startAwakeVideo(); // denied (e.g. battery saver): still try video
        });
      } catch (e) { startAwakeVideo(); }
      return;
    }
    startAwakeVideo();
  }

  // Render the projector-sized engine frame scaled down into its box
  // (same technique as the dashboard sidebar preview).
  function fitEngine() {
    try {
      var frame = el("engine");
      var box = el("engineBox");
      if (!frame || !box) return;
      var w = parseInt(frame.getAttribute("width"), 10) || 800;
      var h = parseInt(frame.getAttribute("height"), 10) || 600;
      var availW = box.clientWidth || box.offsetWidth || 0;
      if (!(availW > 0)) availW = w;
      var s = availW / w;
      frame.style.width = w + "px";
      frame.style.height = h + "px";
      frame.style.transform = "scale(" + s + ")";
      box.style.height = Math.max(1, Math.ceil(h * s)) + "px";
    } catch (e) {}
  }

  function applyState(st) {
    var frame = el("engine");
    if (!frame) return false;
    var win = null;
    try { win = frame.contentWindow; } catch (e) { return false; }
    if (!win || typeof win.updatePresentation !== "function") return false;
    try {
      win.previewState = {
        text1: st.text1, text2: st.text2, titleArr: st.titleArr,
        font1: st.font1, font2: st.font2, title: st.title,
        footnote: st.footnote, index: st.index, last: st.last,
        bkgnd: st.bkgnd, bkgndColor: st.bkgndColor, fontColor: st.fontColor,
        winX: st.winX, winY: st.winY,
        marginTop: st.marginTop, marginBottom: st.marginBottom,
        marginLeft: st.marginLeft, marginRight: st.marginRight,
        maxFS: st.maxFS, transition: st.transition, showTitle: st.showTitle,
        shadow: st.shadow, ver1: st.ver1, ver2: st.ver2, align: st.align,
        theme: st.theme
      };
      if (st.winX > 0 && st.winY > 0) {
        frame.setAttribute("width", st.winX);
        frame.setAttribute("height", st.winY);
      }
      if (typeof win.passVariable === "function") {
        try { win.passVariable(); } catch (e) {}
      }
      win.updatePresentation();
      if (typeof win.updateContent2 === "function") win.updateContent2();
      else if (typeof win.updateContent === "function") win.updateContent();
      fitEngine();
      return true;
    } catch (e) {
      return false;
    }
  }

  function pollState() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "api/state", true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200) {
        engineLive = false;
        setOffAir(true);
        setStatus("Connection lost");
        emitNav(null);
        return;
      }
      try {
        var st = JSON.parse(xhr.responseText);
        if (!st || !st.live) {
          engineLive = false;
          lastJson = "";
          setOffAir(true);
          setStatus("No live projection");
          emitNav(null);
          return;
        }
        var js = JSON.stringify(st);
        if (js !== lastJson || !engineLive) {
          if (applyState(st)) {
            lastJson = js;
            engineLive = true;
            setOffAir(false);
            setStatus(st.status || "");
            emitNav(st.nav);
          } else if (!engineLive) {
            setOffAir(true);
            setStatus("Loading live view…");
          }
        } else {
          setOffAir(false);
          setStatus(st.status || "");
          emitNav(st.nav);
        }
      } catch (e) {
        setOffAir(true);
      }
    };
    try { xhr.send(); } catch (e) {}
  }

  window.RemoteEngine = {
    start: function (ms) {
      fitEngine();
      pollState();
      setInterval(pollState, ms || 1000);
      try {
        var fsBtn = el("fsBtn");
        if (fsBtn) fsBtn.addEventListener("click", toggleFullscreen);
        updateFsBtn();
        var fsEvents = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"];
        for (var i = 0; i < fsEvents.length; i++) {
          document.addEventListener(fsEvents[i], updateFsBtn);
        }
      } catch (e) {}
      // Stay awake: native wake lock where available, silent-video
      // fallback elsewhere. iOS only allows video playback from a user
      // gesture, so every tap/click re-ensures playback (idempotent).
      try {
        acquireWakeLock();
        document.addEventListener("visibilitychange", function () {
          try { if (!document.hidden) acquireWakeLock(); } catch (e) {}
        });
        var armAwake = function () { startAwakeVideo(); };
        document.addEventListener("touchend", armAwake, { passive: true });
        document.addEventListener("click", armAwake);
        setInterval(function () {
          try {
            if (wantAwake && hasWakeLockApi() && !wakeLockObj && !document.hidden) acquireWakeLock();
          } catch (e) {}
        }, 30000);
      } catch (e) {}
      if (typeof window.addEventListener === "function") {
        window.addEventListener("resize", fitEngine);
        window.addEventListener("orientationchange", fitEngine);
      }
    },
    fit: fitEngine,
    toggleFullscreen: toggleFullscreen
  };
})();
