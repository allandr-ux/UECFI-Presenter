/**
 * Modern Presentation Window & Screen Controller
 * 
 * Manages monitor detection, screen selection, and spawning the
 * presentation projector window via standard window.open and Electron IPC.
 * Fully decoupled from Adobe AIR.
 */
var presentWindowOpen = false;
var pWindowX = "100";
var pWindowY = "100";
var dualScreen = true;
var screenList = [];
var selectedScreenIndex = 1;
var newWindow = null;

function getScreensArray() {
  if (window.electronBridge && typeof window.electronBridge.getScreens === "function") {
    return window.electronBridge.getScreens() || [];
  }
  return [
    { bounds: { x: 0, y: 0, width: window.screen.width || 1920, height: window.screen.height || 1080 } }
  ];
}

function getCurrentScreen() {
  const screens = getScreensArray();
  return screens[0] || { bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
}

function getScreenList() {
  screenList = getScreensArray();
  console.log(`[SCREEN] Screen List length: ${screenList.length}`);
}

function fillScreenList() {
  getScreenList();
  const c = screenList.length;
  console.log(`[SCREEN] Screen Count: ${c}`);
  clearSelectList("selectScreenID");
  for (let b = 0; b < c; b++) {
    const label = `Screen  ${b + 1}`;
    document.getElementById("selectScreenID").options[b] = new Option(label, b);
  }
  setScreenIndex(selectedScreenIndex, c);
}

function getSelectedScreenIndex() {
  const sel = document.getElementById("selectScreenID");
  if (sel) selectedScreenIndex = sel.selectedIndex;
}

function setScreenIndex(a, b) {
  const sel = document.getElementById("selectScreenID");
  if (!sel) return;
  if (a < b) {
    sel.selectedIndex = a;
  } else {
    sel.selectedIndex = 0;
  }
}

function addScreenSelectionEvent() {
  const sel = document.getElementById("selectScreenID");
  if (sel) sel.addEventListener("change", processScreenSelChange, false);
}

function processScreenSelChange() {
  getSelectedScreenIndex();
  console.log(`[SCREEN] Selected Screen Index: ${selectedScreenIndex}`);
}

function presentation() {
  // Fresh projection always owns the screen: drop any logo overlay first.
  window.p_logo_mode = false;
  const screens = getScreensArray();
  let targetBounds;
  if (dualScreen && screens[1]) {
    const s = screens[selectedScreenIndex] || screens[1];
    targetBounds = s.bounds;
    pWindowX = targetBounds.width;
    pWindowY = targetBounds.height;
  } else {
    targetBounds = screens[0].bounds;
    pWindowX = targetBounds.width;
    pWindowY = targetBounds.height;
  }

  if (!presentWindowOpen) {
    const features = `width=${targetBounds.width},height=${targetBounds.height},left=${targetBounds.x},top=${targetBounds.y},frame=false`;
    const popup = window.open("presentation.htm", "UECFI_Presentation", features);

    if (popup) {
      newWindow = {
        window: popup,
        close: () => {
          if (window.electronBridge && typeof window.electronBridge.closeProjectionWindow === "function") {
            window.electronBridge.closeProjectionWindow();
          }
          if (popup && !popup.closed) {
            try { popup.close(); } catch(e) {}
          }
        }
      };

      popup.addEventListener("beforeunload", () => {
        presentWindowClosed();
      });

      popup.addEventListener("load", () => {
        popup.passVariable = passVariable;
        try {
          if (typeof popup.passVariable === "function") popup.passVariable();
          if (typeof popup.updatePresentation === "function") popup.updatePresentation();
          if (typeof popup.updateContent2 === "function") popup.updateContent2();
        } catch (e) {
          console.warn("[PRESENTATION] Popup load synchronization error:", e);
        }
        pushSidebarPreview();
      });

      presentWindowOpen = true;
    }

    passVariable();
  } else {
    passVariable();
    if (newWindow && newWindow.window) {
      const win = newWindow.window;
      if (typeof win.passVariable === "function") win.passVariable();
      if (typeof win.updatePresentation === "function") win.updatePresentation();
      if (typeof win.updateContent === "function") win.updateContent();
    }
    pushSidebarPreview();
  }

  if (typeof window !== "undefined" && typeof window.focus === "function") {
    try { window.focus(); } catch(e) {}
  }
  if (typeof updateProjectionControls === "function") updateProjectionControls();
}

function closePresentWindow() {
  if (window.electronBridge && typeof window.electronBridge.closeProjectionWindow === "function") {
    window.electronBridge.closeProjectionWindow();
  }
  if (newWindow && newWindow.close) {
    try { newWindow.close(); } catch(e) {}
  }
  presentWindowClosed();
}

function presentWindowClosed() {
  presentWindowOpen = false;
  // A closed projector must not reopen onto a stale logo overlay.
  window.p_logo_mode = false;
  if (typeof setLiveProjectionType === "function") setLiveProjectionType(null);
  if (typeof window !== "undefined") window.liveProgramActive = false;
  if (typeof disableNavButtons === "function") {
    disableNavButtons(true);
  }

  window.presentedVerseIndex = -1;
  window.presentedSearchIdx = -1;
  window.presentedScheduleId = null;
  if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
  if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();
  if (typeof updateVerseHighlight === "function") {
    updateVerseHighlight();
  }

  window.presentedSongIdx = -1;
  window.presentedSlideIdx = -1;
  if (typeof updateSongSlideHighlight === "function") {
    updateSongSlideHighlight();
  }
  if (typeof updateSongListHighlight === "function") {
    updateSongListHighlight();
  }

  const liveIndicator = document.getElementById("liveSlideIndicator");
  if (liveIndicator) liveIndicator.innerText = "No Presentation Active";

  // Back to the OFF AIR placeholder; the engine frame keeps its last slide behind it
  const ph = document.getElementById("livePlaceholder");
  if (ph) ph.classList.remove("hidden");
  if (typeof updateProjectionControls === "function") updateProjectionControls();

  // Clear any output-state overlay and toolbar highlight
  if (typeof setLiveMonitorMode === "function") setLiveMonitorMode("live", true);
  window.liveMonitorState = { primary: "", secondary: "", reference: "", indicator: "" };
}

function DOMIntializeCallback(a) {
  if (newWindow && newWindow.window) {
    newWindow.window.passVariable = passVariable;
  }
}

function passVariable() {
  this.p_text1_arr = p_text1_arr;
  this.p_text2_arr = p_text2_arr;
  this.p_title_arr = p_title_arr;
  this.p_text1_font = p_text1_font;
  this.p_text2_font = p_text2_font;
  this.p_title = p_title;
  this.p_footnote = p_footnote;
  this.p_current_index = p_current_index;
  this.p_last_index = p_last_index;
  this.p_bkgnd_filename = p_bkgnd_filename;
  this.p_bkgnd_color = p_bkgnd_color;
  this.p_font_color = p_font_color;
  this.p_window_X = pWindowX;
  this.p_window_Y = pWindowY;
  this.p_topMargin = p_topMargin;
  this.p_bottomMargin = p_bottomMargin;
  this.p_leftMargin = p_leftMargin;
  this.p_rightMargin = p_rightMargin;
  this.p_maxFontSize = p_maxFontSize;
  this.p_enableTransition = p_enableTransition;
  this.p_showTitle = p_showTitle;
  this.p_enableShadow = p_enableShadow;
  this.p_ver1ScaleFactor = p_ver1ScaleFactor;
  this.p_ver2ScaleFactor = p_ver2ScaleFactor;
  this.p_logo_mode = (typeof p_logo_mode !== "undefined") ? p_logo_mode : false;
  this.p_logo_image = (typeof p_logo_image !== "undefined") ? p_logo_image : "";
  this.p_logo_title = (typeof p_logo_title !== "undefined") ? p_logo_title : "";
  this.p_logo_sub = (typeof p_logo_sub !== "undefined") ? p_logo_sub : "";
  this.p_logo_bg = (typeof p_logo_bg !== "undefined") ? p_logo_bg : "#020617";
  this.p_logo_color = (typeof p_logo_color !== "undefined") ? p_logo_color : "#ffffff";
  this.p_logo_imgsize = (typeof p_logo_imgsize !== "undefined") ? p_logo_imgsize : 40;
  this.p_logo_titlesize = (typeof p_logo_titlesize !== "undefined") ? p_logo_titlesize : 8;
  this.p_logo_subsize = (typeof p_logo_subsize !== "undefined") ? p_logo_subsize : 4;
  this.p_logo_title_bold = (typeof p_logo_title_bold !== "undefined") ? p_logo_title_bold : true;
  this.p_logo_title_italic = (typeof p_logo_title_italic !== "undefined") ? p_logo_title_italic : false;
  this.p_logo_sub_bold = (typeof p_logo_sub_bold !== "undefined") ? p_logo_sub_bold : false;
  this.p_logo_sub_italic = (typeof p_logo_sub_italic !== "undefined") ? p_logo_sub_italic : false;
  this.p_logo_bgimage = (typeof p_logo_bgimage !== "undefined") ? p_logo_bgimage : "";
  this.p_logo_bgdim = (typeof p_logo_bgdim !== "undefined") ? p_logo_bgdim : 50;
  this.p_output_mode = (typeof liveOutputMode !== "undefined") ? liveOutputMode : "live";
  this.activeThemeObj = (typeof window !== "undefined" && window.activeThemeObj) ? window.activeThemeObj : null;
  // Shadow globals must follow the theme too: the projection renderer reads
  // module-level blur/shadowColor (not activeThemeObj directly), so without
  // these lines they freeze at whatever the projection window opened with --
  // theme edits would never reach the live slide until a full reload.
  const shadowTheme = this.activeThemeObj;
  if (shadowTheme) {
    this.blur = (typeof shadowTheme.shadowBlur !== "undefined") ? shadowTheme.shadowBlur : 4;
    this.shadowColor = shadowTheme.shadowColor || "#000000";
  }
}

function processClose() {
  if (presentWindowOpen) {
    closePresentWindow();
  }
}

// ---------------------------------------------------------------------------
// Toolbar projection transport (mockup: cast + prev/next + stop).
// One driver for the Bible / Songs / Program clusters: idle shows a black
// cast with grayed-out transport; live shows a green cast, dark transport
// and a red stop. Cast buttons are never disabled (they start projection).
// ---------------------------------------------------------------------------
const PROJECTION_TRANSPORT_GROUPS = [
  { cast: "present", prev: "prevBut", next: "nextBut", stop: "closeBut" },
  { cast: "songnav_presentbutton", prev: "songnav_prevbutton", next: "songnav_nextbutton", stop: "songnav_closebutton" },
  { cast: "prog_present_btn", prev: "prog_prev_btn", next: "prog_next_btn", stop: "prog_close_btn" }
];

function updateProjectionControls() {
  try {
    const live = (typeof presentWindowOpen !== "undefined") && !!presentWindowOpen;
    // Every transport Prev/Next (all clusters + sidebar monitor) follows the
    // same rules as the speaker remote: nothing live, tema/person live, or
    // song/program at an end all disable the corresponding button.
    const nav = (typeof computeRemoteNav === "function") ? computeRemoteNav() : { canPrev: true, canNext: true };
    PROJECTION_TRANSPORT_GROUPS.forEach((g) => {
      const cast = document.getElementById(g.cast);
      const prev = document.getElementById(g.prev);
      const next = document.getElementById(g.next);
      const stop = document.getElementById(g.stop);
      if (cast) cast.classList.toggle("ctl-live-cast", live);
      if (prev) prev.disabled = !(live && nav.canPrev);
      if (next) next.disabled = !(live && nav.canNext);
      if (stop) stop.classList.toggle("ctl-live-stop", live);
      if (stop) stop.disabled = !live;
    });
    const mPrev = document.getElementById("monitorPrevBtn");
    const mNext = document.getElementById("monitorNextBtn");
    if (mPrev) mPrev.disabled = !(live && nav.canPrev);
    if (mNext) mNext.disabled = !(live && nav.canNext);
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Custom logo screen (Logo toolbar button).
// Config persists in localStorage; the projector + sidebar preview render it
// through the shared presentation.htm engine (logoLayer overlay).
// ---------------------------------------------------------------------------
window.p_logo_mode = false;
window.p_logo_image = "uecfi-logo.png";
window.p_logo_title = "Union Espiritista Cristiana de Filipinas, Inc.";
window.p_logo_sub = "";
window.p_logo_bg = "#020617";
window.p_logo_color = "#ffffff";
window.p_logo_imgsize = 40;
window.p_logo_titlesize = 8;
window.p_logo_subsize = 4;
window.p_logo_title_bold = true;
window.p_logo_title_italic = false;
window.p_logo_sub_bold = false;
window.p_logo_sub_italic = false;
window.p_logo_bgimage = "";
window.p_logo_bgdim = 50;
function logoNum(v, d) {
  const n = Number(v);
  return isFinite(n) ? n : d;
}
function loadLogoScreenConfig() {
  try {
    const raw = localStorage.getItem("uecfi_logo_screen");
    if (raw) {
      const c = JSON.parse(raw);
      if (c && typeof c === "object") {
        window.p_logo_image = (typeof c.image === "string") ? c.image : "uecfi-logo.png";
        window.p_logo_title = (typeof c.title === "string") ? c.title : "Union Espiritista Cristiana de Filipinas, Inc.";
        window.p_logo_sub = (typeof c.subtitle === "string") ? c.subtitle : "";
        window.p_logo_bg = (typeof c.bg === "string") ? c.bg : "#020617";
        window.p_logo_color = (typeof c.color === "string") ? c.color : "#ffffff";
        window.p_logo_imgsize = Math.min(95, Math.max(5, logoNum(c.imgPct, 40)));
        window.p_logo_titlesize = Math.min(25, Math.max(1, logoNum(c.titlePct, 8)));
        window.p_logo_subsize = Math.min(15, Math.max(1, logoNum(c.subPct, 4)));
        window.p_logo_title_bold = (c.titleBold === undefined) ? true : !!c.titleBold;
        window.p_logo_title_italic = !!c.titleItalic;
        window.p_logo_sub_bold = !!c.subBold;
        window.p_logo_sub_italic = !!c.subItalic;
        window.p_logo_bgimage = (typeof c.bgImage === "string") ? c.bgImage : "";
        window.p_logo_bgdim = Math.min(90, Math.max(0, logoNum(c.bgDim, 50)));
        return;
      }
    }
  } catch (e) {}
  saveLogoScreenConfig();
}
function saveLogoScreenConfig() {
  try {
    localStorage.setItem("uecfi_logo_screen", JSON.stringify({
      image: window.p_logo_image || "",
      title: window.p_logo_title || "",
      subtitle: window.p_logo_sub || "",
      bg: window.p_logo_bg || "#020617",
      color: window.p_logo_color || "#ffffff",
      imgPct: logoNum(window.p_logo_imgsize, 40),
      titlePct: logoNum(window.p_logo_titlesize, 8),
      subPct: logoNum(window.p_logo_subsize, 4),
      titleBold: window.p_logo_title_bold !== false,
      titleItalic: !!window.p_logo_title_italic,
      subBold: !!window.p_logo_sub_bold,
      subItalic: !!window.p_logo_sub_italic,
      bgImage: (typeof window.p_logo_bgimage === "string") ? window.p_logo_bgimage : "",
      bgDim: logoNum(window.p_logo_bgdim, 50)
    }));
  } catch (e) {}
}
// Re-push current controller state to the real projector popup (if open).
// Mirrors presentation()'s push path without opening any window.
function refreshProjectorEngine() {
  try {
    passVariable();
    if (typeof presentWindowOpen !== "undefined" && presentWindowOpen && newWindow && newWindow.window) {
      const win = newWindow.window;
      if (!win.closed) {
        if (typeof win.passVariable === "function") win.passVariable();
        if (typeof win.updatePresentation === "function") win.updatePresentation();
        if (typeof win.updateContent2 === "function") win.updateContent2();
        else if (typeof win.updateContent === "function") win.updateContent();
      }
    }
  } catch (e) {}
}
// WYSIWYG content for the sidebar logo overlay.
function renderLogoOverlay() {
  try {
    const img = document.getElementById("logoOverlayImg");
    if (img) {
      if (window.p_logo_image) {
        if (img.getAttribute("src") !== window.p_logo_image) img.setAttribute("src", window.p_logo_image);
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }
    }
    const t = document.getElementById("logoOverlayTitle");
    if (t) {
      t.textContent = window.p_logo_title || "";
      t.style.display = window.p_logo_title ? "block" : "none";
      t.style.fontWeight = window.p_logo_title_bold === false ? "normal" : "bold";
      t.style.fontStyle = window.p_logo_title_italic ? "italic" : "normal";
    }
    const s = document.getElementById("logoOverlaySub");
    if (s) {
      s.textContent = window.p_logo_sub || "";
      s.style.display = window.p_logo_sub ? "block" : "none";
      s.style.fontWeight = window.p_logo_sub_bold ? "bold" : "normal";
      s.style.fontStyle = window.p_logo_sub_italic ? "italic" : "normal";
    }
    const logo = document.getElementById("logoOverlay");
    if (logo) logo.style.background = window.p_logo_bg || "#020617";
    const tinted = [t, s];
    tinted.forEach((el) => { if (el) el.style.color = window.p_logo_color || "#ffffff"; });
    // Sidebar mirror of the engine background photo + dimming overlay.
    try {
      const bg = document.getElementById("logoOverlayBg");
      if (bg) {
        if (window.p_logo_bgimage) {
          const primary = `./background/${window.p_logo_bgimage}`;
          const fallback = `storage/background/${window.p_logo_bgimage}`;
          if (bg.getAttribute("data-file") !== window.p_logo_bgimage) {
            bg.setAttribute("data-file", window.p_logo_bgimage);
            bg.onerror = () => {
              bg.onerror = null;
              if (bg.getAttribute("src") !== fallback) bg.setAttribute("src", fallback);
            };
            bg.setAttribute("src", primary);
          }
          bg.style.display = "block";
        } else {
          bg.removeAttribute("data-file");
          bg.style.display = "none";
        }
      }
      const dimPct = Math.min(90, Math.max(0, logoNum(window.p_logo_bgdim, 50)));
      const dim = document.getElementById("logoOverlayDim");
      if (dim) {
        if (window.p_logo_bgimage && dimPct > 0) {
          dim.style.display = "block";
          dim.style.opacity = String(dimPct / 100);
        } else {
          dim.style.display = "none";
        }
      }
    } catch (e) {}
  } catch (e) {}
}
// Background-photo gallery for the logo screen. Reuses the Theme
// designer's scanned library when available, else the shipped defaults.
function logoBackgroundList() {
  try {
    if (window.themeManager && Array.isArray(window.themeManager.availableImages)
        && window.themeManager.availableImages.length > 0) {
      return window.themeManager.availableImages;
    }
  } catch (e) {}
  return [{ name: "UECFI", file: "UECFI.png" }, { name: "Grapevine", file: "Grapevine.png" }];
}
function renderLogoBgGallery() {
  try {
    const host = document.getElementById("logoBgGallery");
    if (!host) return;
    const current = String(window.logoDesignerBgImage || "").toLowerCase();
    const ring = (on) => on
      ? "ring-2 ring-brand-600 border-brand-500 shadow-sm bg-brand-50/30"
      : "border-slate-200 hover:border-slate-400 bg-white";
    const badge = (on) => on
      ? `<span class="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-600 text-white flex items-center justify-center text-[9px]"><i class="fa-solid fa-check"></i></span>`
      : "";
    let html = `
      <div onclick="selectLogoBackground('')" title="Solid color (no photo)"
           class="relative flex flex-col p-1 rounded-lg border transition text-left cursor-pointer ${ring(current === "")}">
        <div class="w-full aspect-video rounded bg-slate-900 border border-slate-100/50 flex items-center justify-center relative">
          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">None</span>
          ${badge(current === "")}
        </div>
        <div class="mt-1 px-0.5 truncate text-[10px] font-semibold text-slate-700 leading-tight">Solid color</div>
      </div>`;
    logoBackgroundList().forEach((img) => {
      if (!img || !img.file) return;
      const on = String(img.file).toLowerCase() === current;
      const safeFile = String(img.file).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      html += `
      <div onclick="selectLogoBackground('${safeFile}')" title="${escapeNotepadHtml(img.name || img.file)} (${escapeNotepadHtml(img.file)})"
           class="relative flex flex-col p-1 rounded-lg border transition text-left cursor-pointer ${ring(on)}">
        <div class="w-full aspect-video rounded overflow-hidden bg-slate-900 border border-slate-100/50 flex items-center justify-center relative">
          <img src="./background/${escapeNotepadHtml(img.file)}" onerror="this.onerror=null;this.src='storage/background/${escapeNotepadHtml(img.file)}'" alt="${escapeNotepadHtml(img.name || "")}" class="w-full h-full object-cover" />
          ${badge(on)}
        </div>
        <div class="mt-1 px-0.5 truncate text-[10px] font-semibold text-slate-700 leading-tight">${escapeNotepadHtml(img.name || img.file)}</div>
      </div>`;
    });
    host.innerHTML = html;
  } catch (e) {}
}
// Gallery picks apply immediately (same as the Theme designer).
function selectLogoBackground(file) {
  try {
    window.logoDesignerBgImage = file || "";
    window.p_logo_bgimage = file || "";
    saveLogoScreenConfig();
    renderLogoBgGallery();
    renderLogoOverlay();
    if (window.liveOutputMode === "logo") {
      refreshProjectorEngine();
      pushSidebarPreview();
    }
  } catch (e) {}
}
// Upload a photo into the shared background library (background/ +
// storage/background/ mirrors + registry), then auto-select it.
function uploadLogoBackground(event) {
  try {
    const input = event ? event.target : null;
    if (!input || !input.files || input.files.length === 0) return;
    const file = input.files[0];
    const fileName = file.name || "";
    const ext = ("." + (fileName.split(".").pop() || "")).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"].indexOf(ext) < 0) {
      alert("Unsupported file format. Please upload JPG, PNG, WEBP, BMP, or GIF images.");
      return;
    }
    if (typeof require !== "undefined") {
      try {
        const fs = require("fs");
        const path = require("path");
        const dir1 = path.join(process.cwd(), "background");
        const dir2 = path.join(process.cwd(), "storage", "background");
        if (!fs.existsSync(dir1)) fs.mkdirSync(dir1, { recursive: true });
        if (!fs.existsSync(dir2)) fs.mkdirSync(dir2, { recursive: true });
        if (file.path) {
          fs.copyFileSync(file.path, path.join(dir1, fileName));
          fs.copyFileSync(file.path, path.join(dir2, fileName));
        } else if (typeof Buffer !== "undefined") {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const buffer = Buffer.from(reader.result);
              fs.writeFileSync(path.join(dir1, fileName), buffer);
              fs.writeFileSync(path.join(dir2, fileName), buffer);
            } catch (e2) {}
          };
          reader.readAsArrayBuffer(file);
        }
      } catch (err) {
        console.error("[LOGO] Error saving uploaded background to disk:", err);
      }
    }
    try {
      let storedCustom = [];
      const raw = localStorage.getItem("uecfi_custom_backgrounds");
      if (raw) storedCustom = JSON.parse(raw);
      const baseName = fileName.replace(/\.[^/.]+$/, "");
      const cleanName = baseName.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (!storedCustom.some((x) => x && x.file && x.file.toLowerCase() === fileName.toLowerCase())) {
        storedCustom.push({ name: cleanName || fileName, file: fileName });
        localStorage.setItem("uecfi_custom_backgrounds", JSON.stringify(storedCustom));
      }
    } catch (e) {
      console.warn("[LOGO] Error persisting uploaded background to registry:", e);
    }
    try {
      if (window.themeManager && typeof window.themeManager.loadAvailableImages === "function") {
        window.themeManager.loadAvailableImages();
      }
    } catch (e) {}
    try { input.value = ""; } catch (e) {}
    selectLogoBackground(fileName);
  } catch (e) {}
}
// Logo screen designer modal (image + title + subtitle + colors).
window.logoDesignerImageData = null;
function openLogoDesigner() {
  try {
    if (typeof AppUI === "undefined" || !AppUI.Modal) return;
    loadLogoScreenConfig();
    if (!window.logoDesignerModal) {
      window.logoDesignerModal = new AppUI.Modal("logoScreenDialog");
      window.logoDesignerModal.render();
    }
    window.logoDesignerImageData = window.p_logo_image || null;
    window.logoDesignerBgImage = window.p_logo_bgimage || "";
    window.logoDesignerModal.setHeader("Logo Screen");
    window.logoDesignerModal.setBody(
      `<div class="flex flex-col gap-3">`
      + `<div class="flex items-start gap-3">`
      + `<img id="logoDesignerPreview" src="${window.p_logo_image || ""}" style="display:${window.p_logo_image ? "block" : "none"};width:96px;height:96px;object-fit:contain;background:#0f172a;border-radius:12px;border:1px solid #e2e8f0;">`
      + `<div class="flex-1 min-w-0 flex flex-col gap-2">`
      + `<input id="logoDesignerFile" type="file" accept="image/*" class="w-full text-xs text-slate-600">`
      + `<button type="button" id="logoDesignerRemoveBtn" class="px-2.5 py-1 text-[11px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition self-start" style="background:none;border:0;cursor:pointer;">Remove image</button>`
      + `</div></div>`
      + `<div class="block"><div class="flex items-center justify-between mb-1"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Title</span>`
      + `<span class="flex items-center gap-1">`
      + `<button type="button" id="logoDesignerTitleBold" title="Bold title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><b>B</b></button>`
      + `<button type="button" id="logoDesignerTitleItalic" title="Italic title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><i>I</i></button>`
      + `</span></div>`
      + `<input id="logoDesignerTitle" type="text" maxlength="60" value="${escapeNotepadHtml(window.p_logo_title || "")}" placeholder="Union Espiritista Cristiana de Filipinas, Inc." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans"></div>`
      + `<div class="block"><div class="flex items-center justify-between mb-1"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Subtitle</span>`
      + `<span class="flex items-center gap-1">`
      + `<button type="button" id="logoDesignerSubBold" title="Bold subtitle" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><b>B</b></button>`
      + `<button type="button" id="logoDesignerSubItalic" title="Italic subtitle" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><i>I</i></button>`
      + `</span></div>`
      + `<input id="logoDesignerSub" type="text" maxlength="120" value="${escapeNotepadHtml(window.p_logo_sub || "")}" placeholder="Optional second line" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans"></div>`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Image size (<span id="logoDesignerImgVal">${Math.round(logoNum(window.p_logo_imgsize, 40))}%</span> of screen height)</span>`
      + `<input id="logoDesignerImg" type="range" min="5" max="95" step="1" value="${Math.round(logoNum(window.p_logo_imgsize, 40))}" class="w-full"></label>`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Title size (<span id="logoDesignerTitleVal">${Math.round(logoNum(window.p_logo_titlesize, 8))}%</span> of screen height)</span>`
      + `<input id="logoDesignerTitleSize" type="range" min="1" max="25" step="0.5" value="${logoNum(window.p_logo_titlesize, 8)}" class="w-full"></label>`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Subtitle size (<span id="logoDesignerSubVal">${Math.round(logoNum(window.p_logo_subsize, 4))}%</span> of screen height)</span>`
      + `<input id="logoDesignerSubSize" type="range" min="1" max="15" step="0.5" value="${logoNum(window.p_logo_subsize, 4)}" class="w-full"></label>`
      + `<div class="flex items-center gap-4">`
      + `<label class="flex items-center gap-2 text-xs font-semibold text-slate-600">Background <input id="logoDesignerBg" type="color" value="${escapeNotepadHtml(window.p_logo_bg || "#020617")}" style="width:36px;height:26px;padding:0;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;"></label>`
      + `<label class="flex items-center gap-2 text-xs font-semibold text-slate-600">Text <input id="logoDesignerColor" type="color" value="${escapeNotepadHtml(window.p_logo_color || "#ffffff")}" style="width:36px;height:26px;padding:0;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;"></label>`
      + `</div>`
      + `<div class="block"><div class="flex items-center justify-between mb-1"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Background photo</span>`
      + `<span class="flex items-center gap-2">`
      + `<input type="file" id="logoBgUploadInput" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" class="hidden" onchange="uploadLogoBackground(event)">`
      + `<button type="button" onclick="document.getElementById('logoBgUploadInput').click()" class="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button>`
      + `</span></div>`
      + `<div id="logoBgGallery" class="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1.5 bg-slate-50 border border-slate-200 rounded-xl"></div>`
      + `</div>`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Photo dimming (<span id="logoDesignerDimVal">${Math.round(logoNum(window.p_logo_bgdim, 50))}%</span>)</span>`
      + `<input id="logoDesignerDim" type="range" min="0" max="90" step="1" value="${Math.round(logoNum(window.p_logo_bgdim, 50))}" class="w-full"></label>`
      + `<div class="flex items-center justify-end gap-2 pt-1">`
      + `<button type="button" id="logoDesignerCancelBtn" class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cancel</button>`
      + `<button type="button" id="logoDesignerSaveBtn" class="px-4 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition">Save</button>`
      + `</div></div>`
    );
    const fileInput = document.getElementById("logoDesignerFile");
    if (fileInput) fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) handleLogoDesignerFile(f);
    });
    const removeBtn = document.getElementById("logoDesignerRemoveBtn");
    if (removeBtn) removeBtn.onclick = () => {
      window.logoDesignerImageData = "";
      const prev = document.getElementById("logoDesignerPreview");
      if (prev) { prev.removeAttribute("src"); prev.style.display = "none"; }
      if (fileInput) fileInput.value = "";
    };
    const cancelBtn = document.getElementById("logoDesignerCancelBtn");
    if (cancelBtn) cancelBtn.onclick = () => { try { window.logoDesignerModal.hide(); } catch (e) {} };
    const saveBtn = document.getElementById("logoDesignerSaveBtn");
    if (saveBtn) saveBtn.onclick = saveLogoDesigner;
    const bindLogoRange = (rangeId, valId) => {
      const r = document.getElementById(rangeId);
      const v = document.getElementById(valId);
      if (r && v) r.addEventListener("input", () => { v.textContent = `${r.value}%`; });
    };
    bindLogoRange("logoDesignerImg", "logoDesignerImgVal");
    bindLogoRange("logoDesignerTitleSize", "logoDesignerTitleVal");
    bindLogoRange("logoDesignerSubSize", "logoDesignerSubVal");
    bindLogoRange("logoDesignerDim", "logoDesignerDimVal");
    renderLogoBgGallery();
    // Bold/italic toggles seed from the saved config.
    window.logoDesignerTitleBold = window.p_logo_title_bold !== false;
    window.logoDesignerTitleItalic = !!window.p_logo_title_italic;
    window.logoDesignerSubBold = !!window.p_logo_sub_bold;
    window.logoDesignerSubItalic = !!window.p_logo_sub_italic;
    const paintLogoFmt = (btn, on) => {
      if (!btn) return;
      btn.style.background = on ? "#7c3aed" : "#ffffff";
      btn.style.color = on ? "#ffffff" : "#64748b";
      btn.style.borderColor = on ? "#7c3aed" : "#cbd5e1";
    };
    const fmtPairs = [
      ["logoDesignerTitleBold", "TitleBold"],
      ["logoDesignerTitleItalic", "TitleItalic"],
      ["logoDesignerSubBold", "SubBold"],
      ["logoDesignerSubItalic", "SubItalic"]
    ];
    fmtPairs.forEach(([id, key]) => {
      const btn = document.getElementById(id);
      const stateKey = `logoDesigner${key}`;
      paintLogoFmt(btn, !!window[stateKey]);
      if (btn) btn.onclick = () => {
        window[stateKey] = !window[stateKey];
        paintLogoFmt(btn, !!window[stateKey]);
      };
    });
    window.logoDesignerModal.show();
  } catch (e) {}
}
// Downscale uploads (max 960px) so the data URL stays localStorage-safe.
function handleLogoDesignerFile(file) {
  try {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const maxSide = 960;
            const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            const isJpeg = /jpe?g/i.test(file.type || "");
            window.logoDesignerImageData = canvas.toDataURL(isJpeg ? "image/jpeg" : "image/png", 0.9);
            const prev = document.getElementById("logoDesignerPreview");
            if (prev) { prev.src = window.logoDesignerImageData; prev.style.display = "block"; }
          } catch (e) {}
        };
        img.src = reader.result;
      } catch (e) {}
    };
    reader.readAsDataURL(file);
  } catch (e) {}
}
function saveLogoDesigner() {
  try {
    const titleEl = document.getElementById("logoDesignerTitle");
    const subEl = document.getElementById("logoDesignerSub");
    const bgEl = document.getElementById("logoDesignerBg");
    const colorEl = document.getElementById("logoDesignerColor");
    const imgRange = document.getElementById("logoDesignerImg");
    const titleRange = document.getElementById("logoDesignerTitleSize");
    const subRange = document.getElementById("logoDesignerSubSize");
    const dimRange = document.getElementById("logoDesignerDim");
    window.p_logo_image = (typeof window.logoDesignerImageData === "string") ? window.logoDesignerImageData : (window.p_logo_image || "");
    window.p_logo_title = titleEl ? (titleEl.value || "").trim().slice(0, 60) : (window.p_logo_title || "");
    window.p_logo_sub = subEl ? (subEl.value || "").trim().slice(0, 120) : (window.p_logo_sub || "");
    window.p_logo_bg = (bgEl && bgEl.value) ? bgEl.value : "#020617";
    window.p_logo_color = (colorEl && colorEl.value) ? colorEl.value : "#ffffff";
    window.p_logo_imgsize = imgRange ? Math.min(95, Math.max(5, Math.round(logoNum(imgRange.value, 40)))) : 40;
    window.p_logo_titlesize = titleRange ? Math.min(25, Math.max(1, logoNum(titleRange.value, 8))) : 8;
    window.p_logo_subsize = subRange ? Math.min(15, Math.max(1, logoNum(subRange.value, 4))) : 4;
    window.p_logo_bgdim = dimRange ? Math.min(90, Math.max(0, Math.round(logoNum(dimRange.value, 50)))) : 50;
    window.p_logo_bgimage = (typeof window.logoDesignerBgImage === "string") ? window.logoDesignerBgImage : (window.p_logo_bgimage || "");
    window.p_logo_title_bold = (typeof window.logoDesignerTitleBold === "boolean") ? window.logoDesignerTitleBold : (window.p_logo_title_bold !== false);
    window.p_logo_title_italic = (typeof window.logoDesignerTitleItalic === "boolean") ? window.logoDesignerTitleItalic : !!window.p_logo_title_italic;
    window.p_logo_sub_bold = (typeof window.logoDesignerSubBold === "boolean") ? window.logoDesignerSubBold : !!window.p_logo_sub_bold;
    window.p_logo_sub_italic = (typeof window.logoDesignerSubItalic === "boolean") ? window.logoDesignerSubItalic : !!window.p_logo_sub_italic;
    saveLogoScreenConfig();
    renderLogoOverlay();
    if (window.logoDesignerModal) {
      try { window.logoDesignerModal.hide(); } catch (e) {}
    }
    // A visible logo screen updates immediately.
    if (window.liveOutputMode === "logo") {
      refreshProjectorEngine();
      pushSidebarPreview();
    }
  } catch (e) {}
}
// ---------------------------------------------------------------------------
// Live Output Preview (right-sidebar monitor) controller.
// Single writer for the monitor's text content; output-state (logo /
// blackout) overlays sit on top and any new presented content returns the
// monitor to live-text mode.
// ---------------------------------------------------------------------------
window.liveOutputMode = "live"; // live | logo | black
window.liveMonitorState = { primary: "", secondary: "", reference: "", indicator: "" };
// True while a PROGRAM item owns live projection (any sub-type). Routes
// remote + monitor transport to programManager instead of stale verse/song
// state. See stepLiveMonitor.
window.liveProgramActive = false;

// Push new content to the monitor and return to live-text mode.
// Called by every present path (verses, songs, program items). The monitor
// frame runs the real projection page, so it mirrors the projector exactly.
function setLiveMonitorContent(o) {
  try {
    o = o || {};
    window.liveMonitorState = {
      primary: o.primary || "",
      secondary: o.secondary || "",
      reference: o.reference || "",
      indicator: o.indicator || ""
    };
    setLiveMonitorMode("live", true);
    const ind = document.getElementById("liveSlideIndicator");
    if (ind && window.liveMonitorState.indicator) ind.innerText = window.liveMonitorState.indicator;
    const ph = document.getElementById("livePlaceholder");
    if (ph) ph.classList.add("hidden");
    pushSidebarPreview();
    sizeSidebarPreview();
  } catch (e) {}
}
// Switch the monitor output state. Toolbar entry point is toggleOutputState().
// The engine frame always stays visible; black/logo cover it.
function setLiveMonitorMode(mode, silent) {
  try {
    const prev = window.liveOutputMode;
    window.liveOutputMode = mode;
    const frame = document.getElementById("livePreviewFrame");
    if (frame) frame.style.visibility = "visible";
    const blackout = document.getElementById("blackoutOverlay");
    if (blackout) blackout.classList.toggle("hidden", mode !== "black");
    const logo = document.getElementById("logoOverlay");
    if (logo) logo.classList.toggle("hidden", mode !== "logo");
    const states = { logo: "logoSplitWrap", black: "btnBlack" };
    Object.keys(states).forEach((key) => {
      const btn = document.getElementById(states[key]);
      if (btn) btn.style.outline = (mode === key) ? "2px solid #7c3aed" : "";
    });
    // Logo mode also drives the real projector (and the sidebar engine
    // frame, which runs the same page): entering projects the custom logo
    // screen, leaving restores the last live content. If no projection is
    // active, the projector is opened first so the logo has somewhere to go.
    if (mode === "logo") {
      window.p_logo_mode = true;
      loadLogoScreenConfig();
      renderLogoOverlay();
      if (typeof presentWindowOpen !== "undefined" && !presentWindowOpen && typeof presentation === "function") {
        presentation();
        window.p_logo_mode = true;
      }
      refreshProjectorEngine();
      pushSidebarPreview();
    } else {
      window.p_logo_mode = false;
      // Push the projector + preview whenever the visible output may
      // differ: entering black/clear, leaving any overlay state, or
      // switching directly between states. (Plain live->live presents push
      // through their own paths, so they are skipped here.)
      if (mode !== "live" || prev === "logo" || prev === "black") {
        refreshProjectorEngine();
        pushSidebarPreview();
      }
    }
    if (!silent) sizeSidebarPreview();
  } catch (e) {}
}

// Toolbar: Clear Text / Logo / Black Screen. Clicking the active state
// restores the live content.
function toggleOutputState(mode) {
  try {
    if (window.liveOutputMode === mode) {
      reRenderLiveMonitor();
    } else {
      setLiveMonitorMode(mode);
    }
  } catch (e) {}
}

// Re-apply the last live content (used when leaving an overlay state).
function reRenderLiveMonitor() {
  try {
    setLiveMonitorMode("live", true);
    pushSidebarPreview();
    sizeSidebarPreview();
  } catch (e) {}
}

// Shared transport rules for dashboard buttons, sidebar monitor and the
// speaker remote: what CAN Prev/Next do right now?
//   - nothing live                  -> neither
//   - program tema/person live      -> neither (always)
//   - program song/scripture/general -> within the item only (no looping,
//     no crossing into the next item)
//   - songs-tab song live           -> within the song only (no wrap-around)
//   - verses (and anything else)    -> both (legacy wrap behavior kept)
function computeRemoteNav() {
  const off = { canPrev: false, canNext: false };
  try {
    if ((typeof presentWindowOpen !== "undefined") && !presentWindowOpen) return off;
    const progActive = (typeof window !== "undefined" && !!window.liveProgramActive);
    const pm = (typeof window !== "undefined" && window.programManager) ? window.programManager : null;
    if (progActive && pm &&
        typeof pm.presentedItemIndex === "number" && pm.presentedItemIndex >= 0 &&
        Array.isArray(pm.items) && pm.presentedItemIndex < pm.items.length) {
      const item = pm.items[pm.presentedItemIndex];
      const t = item ? item.type : "";
      if (t === "tema" || t === "person") return off;
      let total = 1;
      try {
        const slides = pm.generateSlidesForItem(item);
        if (Array.isArray(slides)) total = slides.length;
      } catch (e) {}
      const pos = pm.presentedSlideIndex || 0;
      return { canPrev: pos > 0, canNext: pos < total - 1 };
    }
    const t = (typeof window !== "undefined" && window.liveProjectionType) || null;
    const canon = (t && typeof window !== "undefined" && window.themeManager && typeof window.themeManager.resolveProjectionContext === "function")
      ? window.themeManager.resolveProjectionContext(t)
      : t;
    if (canon === "songs") {
      const st = (typeof window !== "undefined" && window.liveSongState) ? window.liveSongState : null;
      if (!st || !st.slides || !st.slides.length) return off;
      const idx = st.index || 0;
      return { canPrev: idx > 0, canNext: idx < st.slides.length - 1 };
    }
    if (!t && !progActive) return off;
    return { canPrev: true, canNext: true };
  } catch (e) {
    return { canPrev: true, canNext: true };
  }
}

// Monitor Prev/Next: advance whatever is currently live.
function navPrevVerse() {
  stepLiveMonitor(-1);
}
function navNextVerse() {
  stepLiveMonitor(1);
}
// Returns true when a step actually happened (drives truthful remote replies).
function stepLiveMonitor(dir) {
  try {
    const nav = (typeof computeRemoteNav === "function") ? computeRemoteNav() : { canPrev: true, canNext: true };
    if (dir < 0 && !nav.canPrev) return false;
    if (dir > 0 && !nav.canNext) return false;
    // A live program item always wins: program Next/Prev must step through
    // program slides even when the item's sub-type is song/scripture (the
    // Songs-tab/verse state those would dispatch to is stale in that case).
    // Set by program presents; cleared by every non-program present and on close.
    const progActive = (typeof window !== "undefined" && !!window.liveProgramActive);
    const pm = (typeof window !== "undefined" && window.programManager) ? window.programManager : null;
    if (progActive && pm &&
        typeof pm.presentedItemIndex === "number" && pm.presentedItemIndex >= 0 &&
        Array.isArray(pm.items) && pm.presentedItemIndex < pm.items.length) {
      if (typeof pm.programNavAllowed === "function" && !pm.programNavAllowed(dir)) return false;
      if (dir < 0) {
        if (typeof pm.previousSlide === "function") { pm.previousSlide(); return true; }
      } else {
        if (typeof pm.nextSlide === "function") { pm.nextSlide(); return true; }
      }
      return false;
    }
    const t = (typeof window !== "undefined" && window.liveProjectionType) || null;
    if (!t) return false;
    const canon = (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.resolveProjectionContext === "function")
      ? window.themeManager.resolveProjectionContext(t)
      : t;
    if (canon === "verses") {
      if (dir < 0) {
        if (typeof processPrevButton === "function") { processPrevButton(); return true; }
      } else {
        if (typeof processNextButton === "function") { processNextButton(); return true; }
      }
      return false;
    } else if (canon === "songs") {
      return stepLiveSong(dir);
    } else if (canon === "program_tema" || canon === "program_person" || canon === "program_general") {
      if (typeof window !== "undefined" && window.programManager) {
        if (dir < 0) {
          if (typeof window.programManager.previousSlide === "function") { window.programManager.previousSlide(); return true; }
        } else {
          if (typeof window.programManager.nextSlide === "function") { window.programManager.nextSlide(); return true; }
        }
      }
      return false;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Song toolbar entry points (referenced by song_nav prev/next/close buttons)
// and by the speaker-remote command API (webserver commands 2/3).
// Advance whatever is currently live (verses, songs, or program items) via
// stepLiveMonitor; silent no-op when nothing is live.
function call_nextSlide() {
  if (typeof stepLiveMonitor === "function") return stepLiveMonitor(1);
  return false;
}
function call_prevSlide() {
  if (typeof stepLiveMonitor === "function") return stepLiveMonitor(-1);
  return false;
}

function call_closePresentation() {
  if (typeof closePresentWindow === "function") closePresentWindow();
}

// Sidebar notepads: multiple user scratch lists, persisted in localStorage.
// Independent from projection state (never presents, never clears on close).
// Storage: "uecfi_notepads" = { pads: [{ name, items: [{text, done}] }], active }.
// The legacy single-list key "uecfi_notepad_items" migrates into "Notepad 1".
window.notepadPadsData = null;
function normalizeNotepadItems(arr) {
  try {
    return (Array.isArray(arr) ? arr : [])
      .map(x => {
        if (typeof x === "string") return { text: x, done: false };
        if (x && typeof x.text === "string") return { text: x.text, done: !!x.done };
        return null;
      })
      .filter(x => x !== null);
  } catch (e) {
    return [];
  }
}
function loadNotepadPads() {
  try {
    if (window.notepadPadsData) return window.notepadPadsData;
    const raw = localStorage.getItem("uecfi_notepads");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.pads) && parsed.pads.length > 0) {
        let active = parseInt(parsed.active, 10);
        if (!isFinite(active) || active < 0 || active >= parsed.pads.length) active = 0;
        window.notepadPadsData = {
          pads: parsed.pads.map((p, i) => ({
            name: (p && typeof p.name === "string" && p.name.trim()) ? p.name.trim().slice(0, 40) : `Notepad ${i + 1}`,
            numbered: !!(p && p.numbered),
            items: normalizeNotepadItems(p ? p.items : [])
          })),
          active: active
        };
        return window.notepadPadsData;
      }
    }
    // First run or legacy data: migrate the old single list into "Notepad 1".
    let items = [];
    try {
      const legacy = localStorage.getItem("uecfi_notepad_items");
      if (legacy) items = normalizeNotepadItems(JSON.parse(legacy));
    } catch (e) {}
    window.notepadPadsData = { pads: [{ name: "Notepad 1", numbered: false, items: items }], active: 0 };
    saveNotepadPads();
    try { localStorage.removeItem("uecfi_notepad_items"); } catch (e) {}
  } catch (e) {
    window.notepadPadsData = { pads: [{ name: "Notepad 1", numbered: false, items: [] }], active: 0 };
  }
  return window.notepadPadsData;
}
function saveNotepadPads() {
  try {
    localStorage.setItem("uecfi_notepads", JSON.stringify(window.notepadPadsData || { pads: [], active: 0 }));
  } catch (e) {}
}
// Item accessors operate on the active pad, so every existing item-level
// function (add/toggle/delete/edit/move/uncheck) works unchanged.
function loadNotepadItems() {
  try {
    const store = loadNotepadPads();
    const pad = store.pads[store.active] || store.pads[0];
    return pad ? pad.items : [];
  } catch (e) {
    return [];
  }
}
function saveNotepadItems() {
  saveNotepadPads();
}
function switchNotepad(idx) {
  try {
    const store = loadNotepadPads();
    if (idx >= 0 && idx < store.pads.length && idx !== store.active) {
      store.active = idx;
      window.notepadEditingIndex = -1;
      saveNotepadPads();
      renderNotepad();
    }
  } catch (e) {}
}
function addNotepadPad() {
  try {
    const store = loadNotepadPads();
    const taken = {};
    store.pads.forEach(p => { taken[p.name] = true; });
    let n = store.pads.length + 1;
    while (taken[`Notepad ${n}`]) n++;
    const suggestion = `Notepad ${n}`;
    openNotepadNameDialog("add", -1, suggestion);
  } catch (e) {}
}
function toggleNotepadNumbering() {
  try {
    const store = loadNotepadPads();
    const pad = store.pads[store.active] || store.pads[0];
    if (!pad) return;
    pad.numbered = !pad.numbered;
    saveNotepadPads();
    renderNotepad();
  } catch (e) {}
}
function scrollNotepadTabs(dir) {
  try {
    const host = document.getElementById("notepadTabs");
    if (!host) return;
    const step = Math.max(80, Math.floor((host.clientWidth || 200) * 0.6));
    if (typeof host.scrollBy === "function") {
      host.scrollBy({ left: dir * step, behavior: "smooth" });
    } else {
      host.scrollLeft += dir * step;
    }
  } catch (e) {}
}
function renameNotepadPad(idx) {
  try {
    const store = loadNotepadPads();
    if (idx < 0 || idx >= store.pads.length) return;
    openNotepadNameDialog("rename", idx, store.pads[idx].name);
  } catch (e) {}
}
// In-app name dialog (native prompt() is unreliable in some hosts).
// mode "add" creates a pad, mode "rename" renames pads[idx].
window.notepadNameModal = null;
function openNotepadNameDialog(mode, idx, initial) {
  try {
    if (typeof AppUI === "undefined" || !AppUI.Modal) {
      // Last-resort fallback when the modal system is unavailable.
      const answer = prompt(mode === "rename" ? "Rename notepad:" : "Name the new notepad:", initial);
      if (answer === null) return;
      saveNotepadNameDialogResult(mode, idx, answer, initial);
      return;
    }
    if (!window.notepadNameModal) {
      window.notepadNameModal = new AppUI.Modal("notepadNameDialog");
      window.notepadNameModal.render();
    }
    window.notepadNameModal.setHeader(mode === "rename" ? "Rename Notepad" : "New Notepad");
    window.notepadNameModal.setBody(
      `<div class="flex flex-col gap-3">`
      + `<input id="notepadNameInput" type="text" maxlength="40" value="${escapeNotepadHtml(initial || "")}" placeholder="Notepad name" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans">`
      + `<div class="flex items-center justify-end gap-2">`
      + `<button type="button" id="notepadNameCancelBtn" class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cancel</button>`
      + `<button type="button" id="notepadNameSaveBtn" class="px-4 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition">Save</button>`
      + `</div></div>`
    );
    const save = () => {
      const input = document.getElementById("notepadNameInput");
      saveNotepadNameDialogResult(mode, idx, input ? input.value : "", initial);
    };
    const cancelBtn = document.getElementById("notepadNameCancelBtn");
    const saveBtn = document.getElementById("notepadNameSaveBtn");
    const input = document.getElementById("notepadNameInput");
    if (cancelBtn) cancelBtn.onclick = () => { try { window.notepadNameModal.hide(); } catch (e) {} };
    if (saveBtn) saveBtn.onclick = save;
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
      });
      setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 50);
    }
    window.notepadNameModal.show();
  } catch (e) {}
}
function saveNotepadNameDialogResult(mode, idx, rawValue, fallback) {
  try {
    if (window.notepadNameModal) {
      try { window.notepadNameModal.hide(); } catch (e) {}
    }
    const name = ((rawValue || "").trim().slice(0, 40)) || ((fallback || "").trim().slice(0, 40));
    if (!name) return;
    const store = loadNotepadPads();
    if (mode === "rename") {
      if (idx < 0 || idx >= store.pads.length) return;
      store.pads[idx].name = name;
    } else {
      store.pads.push({ name: name, numbered: false, items: [] });
      store.active = store.pads.length - 1;
    }
    window.notepadEditingIndex = -1;
    saveNotepadPads();
    renderNotepad();
  } catch (e) {}
}
function deleteNotepadPad(idx) {
  try {
    const store = loadNotepadPads();
    if (idx < 0 || idx >= store.pads.length) return;
    const pad = store.pads[idx];
    if (!confirm(`Delete notepad "${pad.name}" and its ${pad.items.length} note${pad.items.length !== 1 ? "s" : ""}?`)) return;
    store.pads.splice(idx, 1);
    if (store.pads.length === 0) {
      store.pads.push({ name: "Notepad 1", numbered: false, items: [] });
    }
    if (store.active > idx) store.active--;
    if (store.active >= store.pads.length) store.active = store.pads.length - 1;
    window.notepadEditingIndex = -1;
    saveNotepadPads();
    renderNotepad();
  } catch (e) {}
}
function renderNotepadTabs() {
  try {
    const host = document.getElementById("notepadTabs");
    if (!host) return;
    const store = loadNotepadPads();
    let html = "";
    for (let i = 0; i < store.pads.length; i++) {
      const pad = store.pads[i];
      const cls = (i === store.active)
        ? "background:#4f46e5;color:#fff;"
        : "background:#f1f5f9;color:#475569;";
      html += `<span data-active="${(i === store.active) ? 1 : 0}" onclick="if(typeof switchNotepad==='function') switchNotepad(${i});" ondblclick="if(typeof renameNotepadPad==='function') renameNotepadPad(${i});" title="Switch notepad (double-click to rename)" class="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer" style="${cls}max-width:120px;">`
        + `<span class="flex-1 min-w-0 truncate">${escapeNotepadHtml(pad.name)}${pad.items.length > 0 ? ` (${pad.items.length})` : ""}</span>`
        + `<span onclick="event.stopPropagation(); if(typeof deleteNotepadPad==='function') deleteNotepadPad(${i});" title="Delete notepad" style="cursor:pointer;opacity:.6;font-size:12px;line-height:1;padding:0 1px;">&times;</span>`
        + `</span>`;
    }
    host.innerHTML = html;
    // Keep the active tab in view after re-renders (no-op when visible).
    try {
      const live = host.querySelector('[data-active="1"]');
      if (live && typeof live.scrollIntoView === "function") live.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (e) {}
  } catch (e) {}
}
function escapeNotepadHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function renderNotepad() {
  try {
    renderNotepadTabs();
    const store = loadNotepadPads();
    const activePad = store.pads[store.active] || store.pads[0];
    const numbered = !!(activePad && activePad.numbered);
    const numBtn = document.getElementById("notepadNumberBtn");
    if (numBtn) {
      try {
        numBtn.style.color = numbered ? "#4f46e5" : "";
        numBtn.title = numbered ? "Hide note numbers" : "Number notes";
      } catch (e) {}
    }
    const countEl = document.getElementById("notepadCount");
    const listEl = document.getElementById("notepadList");
    if (!listEl) return;
    const items = loadNotepadItems();
    if (countEl) countEl.textContent = items.length > 0 ? `${items.length} note${items.length !== 1 ? "s" : ""}` : "";
    if (items.length === 0) {
      listEl.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">Jot down reminders, cues, or announcements here.</div>';
      return;
    }
    const editing = (typeof window.notepadEditingIndex === "number") ? window.notepadEditingIndex : -1;
    let html = "";
    for (let i = 0; i < items.length; i++) {
      const done = !!items[i].done;
      const textStyle = done
        ? "text-decoration:line-through;color:#94a3b8;"
        : "";
      if (i === editing) {
        html += `<div class="border-b border-slate-100 flex items-center gap-1.5" style="height:30px;overflow:hidden;">`
          + `<input type="text" id="notepadEditInput" maxlength="200" value="${escapeNotepadHtml(items[i].text)}" class="flex-1 min-w-0 px-2 bg-white border border-brand-300 rounded text-xs text-slate-800 focus:outline-none focus:border-brand-500" style="height:24px;">`
          + `<button type="button" title="Save" onclick="if(typeof saveNotepadEdit==='function') saveNotepadEdit();" class="shrink-0 text-emerald-600 hover:text-emerald-700 rounded transition" style="background:none;border:0;font-size:11px;padding:2px;"><i class="fa-solid fa-check"></i></button>`
          + `<button type="button" title="Cancel" onclick="if(typeof cancelNotepadEdit==='function') cancelNotepadEdit();" class="shrink-0 text-slate-400 hover:text-slate-600 rounded transition" style="background:none;border:0;font-size:11px;padding:2px;"><i class="fa-solid fa-xmark"></i></button>`
          + `</div>`;
      } else {
        html += `<div class="group border-b border-slate-100 flex items-center gap-1" style="height:28px;overflow:hidden;">`
          + (numbered ? `<span class="shrink-0 text-[10px] font-bold text-slate-400" style="min-width:18px;text-align:right;">${i + 1}</span>` : "")
          + `<input type="checkbox" ${done ? "checked" : ""} title="Mark done" onchange="if(typeof toggleNotepadItem==='function') toggleNotepadItem(${i});" class="shrink-0 rounded accent-brand-600" style="width:13px;height:13px;margin:0;">`
          + `<span class="flex-1 min-w-0 text-xs text-slate-700 truncate" style="${textStyle}">${escapeNotepadHtml(items[i].text)}</span>`
          + `<span class="shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition" style="display:inline-flex;gap:2px;">`
          + `<button type="button" title="Edit note" onclick="if(typeof editNotepadItem==='function') editNotepadItem(${i});" class="text-slate-400 hover:text-brand-600 rounded transition" style="background:none;border:0;font-size:10px;padding:2px;"><i class="fa-solid fa-pen"></i></button>`
          + `<button type="button" title="Move up" onclick="if(typeof moveNotepadItem==='function') moveNotepadItem(${i}, -1);" class="text-slate-400 hover:text-slate-700 rounded transition" style="background:none;border:0;font-size:10px;padding:2px;"><i class="fa-solid fa-chevron-up"></i></button>`
          + `<button type="button" title="Move down" onclick="if(typeof moveNotepadItem==='function') moveNotepadItem(${i}, 1);" class="text-slate-400 hover:text-slate-700 rounded transition" style="background:none;border:0;font-size:10px;padding:2px;"><i class="fa-solid fa-chevron-down"></i></button>`
          + `<button type="button" title="Delete note" onclick="if(typeof deleteNotepadItem==='function') deleteNotepadItem(${i});" class="text-slate-300 hover:text-red-500 transition" style="background:none;border:0;font-size:12px;padding:2px;line-height:1;">&times;</button>`
          + `</span>`
          + `</div>`;
      }
    }
    listEl.innerHTML = html;
    const editInput = document.getElementById("notepadEditInput");
    if (editInput) {
      try {
        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);
        editInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); saveNotepadEdit(); }
          else if (e.key === "Escape") { cancelNotepadEdit(); }
        });
      } catch (e) {}
    }
  } catch (e) {}
}
function addNotepadItem() {
  try {
    const input = document.getElementById("notepadInput");
    if (!input) return;
    const text = (input.value || "").trim();
    if (!text) return;
    const items = loadNotepadItems();
    items.push({ text: text, done: false });
    saveNotepadItems();
    input.value = "";
    renderNotepad();
    try { input.focus(); } catch (e) {}
  } catch (e) {}
}
function toggleNotepadItem(idx) {
  try {
    const items = loadNotepadItems();
    if (idx >= 0 && idx < items.length) {
      items[idx].done = !items[idx].done;
      saveNotepadItems();
      renderNotepad();
    }
  } catch (e) {}
}
function uncheckAllNotepadItems() {
  try {
    const items = loadNotepadItems();
    let changed = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].done) {
        items[i].done = false;
        changed = true;
      }
    }
    if (changed) {
      saveNotepadItems();
      renderNotepad();
    }
  } catch (e) {}
}
function deleteNotepadItem(idx) {  try {
    const items = loadNotepadItems();
    if (idx >= 0 && idx < items.length) {
      if (!confirm(`Delete this note?\n\n"${String(items[idx].text).slice(0, 80)}"`)) return;
      items.splice(idx, 1);
      if (window.notepadEditingIndex === idx) window.notepadEditingIndex = -1;
      else if (typeof window.notepadEditingIndex === "number" && window.notepadEditingIndex > idx) window.notepadEditingIndex--;
      saveNotepadItems();
      renderNotepad();
    }
  } catch (e) {}
}
function editNotepadItem(idx) {
  try {
    const items = loadNotepadItems();
    if (idx < 0 || idx >= items.length) return;
    window.notepadEditingIndex = idx;
    renderNotepad();
  } catch (e) {}
}
function saveNotepadEdit() {
  try {
    const idx = (typeof window.notepadEditingIndex === "number") ? window.notepadEditingIndex : -1;
    const input = document.getElementById("notepadEditInput");
    const items = loadNotepadItems();
    if (idx >= 0 && idx < items.length && input) {
      const text = (input.value || "").trim();
      if (text) items[idx].text = text;
      saveNotepadItems();
    }
    window.notepadEditingIndex = -1;
    renderNotepad();
  } catch (e) {
    window.notepadEditingIndex = -1;
  }
}
function cancelNotepadEdit() {
  try {
    window.notepadEditingIndex = -1;
    renderNotepad();
  } catch (e) {}
}
function moveNotepadItem(idx, dir) {
  try {
    const items = loadNotepadItems();
    const j = idx + dir;
    if (idx < 0 || idx >= items.length || j < 0 || j >= items.length) return;
    const tmp = items[idx];
    items[idx] = items[j];
    items[j] = tmp;
    if (window.notepadEditingIndex === idx) window.notepadEditingIndex = j;
    else if (window.notepadEditingIndex === j) window.notepadEditingIndex = idx;
    saveNotepadItems();
    renderNotepad();
  } catch (e) {}
}
function initNotepad() {
  try {
    renderNotepad();
    const input = document.getElementById("notepadInput");
    if (input && !input.dataset.bound) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addNotepadItem();
        }
      });
      input.dataset.bound = "1";
    }
    const btn = document.getElementById("notepadAddBtn");
    if (btn && !btn.dataset.bound) {
      btn.addEventListener("click", addNotepadItem);
      btn.dataset.bound = "1";
    }
    const addPadBtn = document.getElementById("notepadAddPadBtn");
    if (addPadBtn && !addPadBtn.dataset.bound) {
      addPadBtn.addEventListener("click", addNotepadPad);
      addPadBtn.dataset.bound = "1";
    }
    const tabsPrevBtn = document.getElementById("notepadTabsPrevBtn");
    if (tabsPrevBtn && !tabsPrevBtn.dataset.bound) {
      tabsPrevBtn.addEventListener("click", () => scrollNotepadTabs(-1));
      tabsPrevBtn.dataset.bound = "1";
    }
    const tabsNextBtn = document.getElementById("notepadTabsNextBtn");
    if (tabsNextBtn && !tabsNextBtn.dataset.bound) {
      tabsNextBtn.addEventListener("click", () => scrollNotepadTabs(1));
      tabsNextBtn.dataset.bound = "1";
    }
  } catch (e) {}
}

// Advance the live song by re-presenting the neighboring slide.
// Clamped to the song ends (no wrap-around); returns whether a step happened.
function stepLiveSong(dir) {
  try {
    const st = window.liveSongState;
    if (!st || !st.slides || !st.slides.length) return false;
    const len = st.slides.length;
    const cur = st.index || 0;
    let idx = cur + (dir < 0 ? -1 : 1);
    if (idx < 0) idx = 0;
    if (idx > len - 1) idx = len - 1;
    if (idx === cur) return false;
    const songObj = { slides: st.slides, name: st.title, font: st.font, copyright: st.copyright };
    const pres = new songPresentObj();
    pres.init(songObj);
    pres.present(idx);
    st.index = idx;
    // Keep the card highlight in sync with the projected slide
    window.presentedSlideIdx = idx;
    if (typeof window.updateSongSlideHighlight === "function") {
      window.updateSongSlideHighlight();
    }
    if (typeof window.updateScheduleSlideHighlight === "function") {
      window.updateScheduleSlideHighlight();
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Push the current controller projection state into the sidebar engine
// frame (which reads it exactly like the real projection window does).
// Returns false when the frame isn't ready yet (caller retries on load).
function pushSidebarPreview() {
  try {
    const frame = document.getElementById("livePreviewFrame");
    if (!frame) return false;
    if (!frame.dataset.engineReady) {
      frame.dataset.engineReady = "1";
      frame.addEventListener("load", () => {
        pushSidebarPreview();
        sizeSidebarPreview();
      });
      frame.src = "presentation.htm";
    }
    const win = frame.contentWindow;
    if (!win || typeof win.updatePresentation !== "function") return false;
    if (typeof win.passVariable === "function") win.passVariable();
    win.updatePresentation();
    if (typeof win.updateContent2 === "function") win.updateContent2();
    else if (typeof win.updateContent === "function") win.updateContent();
    return true;
  } catch (e) {
    return false;
  }
}

// Scale the full-size engine frame into the monitor box (exact ratio).
function sizeSidebarPreview() {
  try {
    const box = document.getElementById("liveMonitorBox");
    const frame = document.getElementById("livePreviewFrame");
    if (!box || !frame) return;
    let projW = 1920, projH = 1080;
    try {
      const screens = getScreensArray() || [];
      const b = ((screens[selectedScreenIndex] || screens[0] || {}).bounds) || {};
      if (b.width > 0) {
        projW = Math.round(b.width);
        projH = Math.round(b.height || b.width * 9 / 16);
      }
    } catch (e) {}
    const availW = box.clientWidth || box.offsetWidth || 0;
    if (availW <= 0 || projW <= 0) return;
    const s = availW / projW;
    frame.style.width = projW + "px";
    frame.style.height = projH + "px";
    frame.style.transform = `scale(${s})`;
    box.style.height = Math.max(1, Math.round(projH * s)) + "px";
  } catch (e) {}
}

function setScreen(b, a) {
  pWindowX = b;
  pWindowY = a;
}

function getScreenSizeX() {
  return pWindowX;
}

function getScreenSizeY() {
  return pWindowY;
}
