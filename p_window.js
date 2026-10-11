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
// Live Output Preview (right-sidebar monitor) controller.
// Single writer for the monitor's text content; output-state (clear / logo /
// blackout) overlays sit on top and any new presented content returns the
// monitor to live-text mode.
// ---------------------------------------------------------------------------
window.liveOutputMode = "live"; // live | clear | logo | black
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
// "clear" hides the engine frame (background stays); black/logo cover it.
function setLiveMonitorMode(mode, silent) {
  try {
    window.liveOutputMode = mode;
    const frame = document.getElementById("livePreviewFrame");
    if (frame) frame.style.visibility = (mode === "clear") ? "hidden" : "visible";
    const blackout = document.getElementById("blackoutOverlay");
    if (blackout) blackout.classList.toggle("hidden", mode !== "black");
    const logo = document.getElementById("logoOverlay");
    if (logo) logo.classList.toggle("hidden", mode !== "logo");
    const states = { clear: "btnClear", logo: "btnLogo", black: "btnBlack" };
    Object.keys(states).forEach((key) => {
      const btn = document.getElementById(states[key]);
      if (btn) btn.style.outline = (mode === key) ? "2px solid #7c3aed" : "";
    });
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

// Sidebar notepad: user-generated scratch list, persisted in localStorage.
// Independent from projection state (never presents, never clears on close).
window.notepadItems = null;
function loadNotepadItems() {
  try {
    if (window.notepadItems !== null && window.notepadItems !== undefined) return window.notepadItems;
    const raw = localStorage.getItem("uecfi_notepad_items");
    const parsed = raw ? JSON.parse(raw) : [];
    // Normalize: legacy plain strings become unchecked note objects
    window.notepadItems = (Array.isArray(parsed) ? parsed : [])
      .map(x => {
        if (typeof x === "string") return { text: x, done: false };
        if (x && typeof x.text === "string") return { text: x.text, done: !!x.done };
        return null;
      })
      .filter(x => x !== null);
  } catch (e) {
    window.notepadItems = [];
  }
  return window.notepadItems;
}
function saveNotepadItems() {
  try {
    localStorage.setItem("uecfi_notepad_items", JSON.stringify(window.notepadItems || []));
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
