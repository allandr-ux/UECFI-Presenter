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

let _cachedScreensArray = null;
let _cachedScreensTimestamp = 0;

function getScreensArray(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && _cachedScreensArray && (now - _cachedScreensTimestamp < 5000)) {
    return _cachedScreensArray;
  }
  if (window.electronBridge && typeof window.electronBridge.getScreens === "function") {
    try {
      _cachedScreensArray = window.electronBridge.getScreens() || [];
      _cachedScreensTimestamp = now;
      return _cachedScreensArray;
    } catch (e) {
      console.error("[BRIDGE] getScreens error:", e);
    }
  }
  _cachedScreensArray = [
    { bounds: { x: 0, y: 0, width: (typeof window !== "undefined" && window.screen && window.screen.width) || 1920, height: (typeof window !== "undefined" && window.screen && window.screen.height) || 1080 } }
  ];
  _cachedScreensTimestamp = now;
  return _cachedScreensArray;
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
  // Fresh projection always owns the screen: drop any logo/attention overlay first.
  window.p_logo_mode = false;
  window.p_attention_mode = false;

  // When any camera feed is in full screen and the operator projects a slide,
  // ask them which stage layout they want to use.
  if (typeof window !== "undefined" && window.liveStudio && typeof window.liveStudio.promptLayoutForSlideProjection === "function") {
    window.liveStudio.promptLayoutForSlideProjection();
  }
  const isProjectorOpen = Boolean(presentWindowOpen && newWindow && newWindow.window && !newWindow.window.closed);
  if (!isProjectorOpen) {
    const screens = getScreensArray(true);
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
    const features = `width=${targetBounds.width},height=${targetBounds.height},left=${targetBounds.x},top=${targetBounds.y},frame=false`;
    const popup = window.open("presentation.htm", "UECFI_Presentation", features);

    if (popup) {
      popup.isSanctuaryProjector = true;
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
        popup.isSanctuaryProjector = true;
        popup.passVariable = passVariable;
        try {
          if (typeof popup.passVariable === "function") popup.passVariable();
          if (typeof popup.updatePresentation === "function") popup.updatePresentation();
          if (typeof popup.updateContent2 === "function") popup.updateContent2();
        } catch (e) {
          console.warn("[PRESENTATION] Popup load synchronization error:", e);
        }
        pushSidebarPreview();
        if (window.liveStudio && typeof window.liveStudio.syncStageVideoToWindow === "function") {
          window.liveStudio.syncStageVideoToWindow(popup, false);
        }
      });

      presentWindowOpen = true;
    }

    passVariable();
  } else {
    passVariable();
    if (newWindow && newWindow.window && !newWindow.window.closed) {
      const win = newWindow.window;
      if (typeof win.passVariable === "function") win.passVariable();
      if (typeof win.updatePresentation === "function") win.updatePresentation();
      if (typeof win.updateContent2 === "function") win.updateContent2();
      else if (typeof win.updateContent === "function") win.updateContent();
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
  if (typeof window !== "undefined" && window.songAudioEngine) {
    try { window.songAudioEngine.stop(); } catch (e) {}
  }
  // A closed projector must not reopen onto a stale logo or attention overlay.
  window.p_logo_mode = false;
  window.p_attention_mode = false;
  if (typeof setLiveProjectionType === "function") setLiveProjectionType(null);
  if (typeof window !== "undefined") window.liveProgramActive = false;
  if (typeof disableNavButtons === "function") {
    disableNavButtons(true);
  }

  window.presentedVerseIndex = -1;
  window.presentedSearchIdx = -1;
  window.presentedScheduleId = null;
  window.p_dual_text1_arr = null;
  window.p_dual_text2_arr = null;
  window.p_dual_footnote = null;
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
  window.liveReadingState = null;
  window.presentedReadingSlideIdx = -1;
  if (typeof window.updateReadingSlideHighlight === "function") {
    window.updateReadingSlideHighlight();
  }
  if (typeof updateSongListHighlight === "function") {
    updateSongListHighlight();
  }
  if (typeof window.programManager !== "undefined" && typeof window.programManager.clearPresentationHighlight === "function") {
    window.programManager.clearPresentationHighlight();
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
  // Determine if this projection window is the main centro projection screen
  const isSanctuaryProjector = Boolean(
    this.isSanctuaryProjector ||
    (typeof newWindow !== "undefined" && newWindow && newWindow.window === this) ||
    this.name === "UECFI_Presentation"
  );
  const activeSource = (typeof window !== "undefined" && window.liveStudio) ? window.liveStudio.activeStageSource : null;
  const isExcludedCamera = isSanctuaryProjector && activeSource && activeSource.type === "camera";
  const hasVideoOnThisScreen = Boolean(!isExcludedCamera && activeSource && activeSource.stream);

  // Only apply dual verse mode when verses are actually the active presentation type
  const isVersesLive = Boolean(
    (typeof window !== "undefined") && (
      window.liveProjectionType === "verses" ||
      (window.liveProjectionType == null && !window.liveProgramActive && (window.presentedSongIdx == null || window.presentedSongIdx < 0) && typeof window.presentedVerseIndex === "number" && window.presentedVerseIndex >= 0)
    )
  );

  // Main display should always be dual verse mode when no video feed is present on it AND verses are being projected.
  // Note: Centro camera is never projected to the main centro projection screen
  // (only remote guest video feeds are displayed to the congregation), so when centro camera
  // is on stage or when no video is on stage, there is no video feed on the main display.
  // When projecting songs, custom slides, schedule items, etc., those slides must never be replaced with verses!
  if (isVersesLive && isSanctuaryProjector && !hasVideoOnThisScreen && (typeof window !== "undefined" && window.p_dual_text1_arr && window.p_dual_text1_arr.length > 0)) {
    this.p_text1_arr = window.p_dual_text1_arr.slice();
    this.p_text2_arr = (window.p_dual_text2_arr && window.p_dual_text2_arr.length > 0) ? window.p_dual_text2_arr.slice() : [];
    this.p_footnote = window.p_dual_footnote || p_footnote;
  } else {
    this.p_text1_arr = (typeof window !== "undefined" && window.p_text1_arr) ? window.p_text1_arr : ((typeof p_text1_arr !== "undefined") ? p_text1_arr : []);
    this.p_text2_arr = (typeof window !== "undefined" && window.p_text2_arr) ? window.p_text2_arr : ((typeof p_text2_arr !== "undefined") ? p_text2_arr : []);
    this.p_footnote = (typeof window !== "undefined" && typeof window.p_footnote !== "undefined") ? window.p_footnote : ((typeof p_footnote !== "undefined") ? p_footnote : "");
  }

  // Preserve dual verse data on target window for direct access by presentation renderer
  if (typeof window !== "undefined" && isVersesLive) {
    this.p_dual_text1_arr = window.p_dual_text1_arr ? window.p_dual_text1_arr.slice() : null;
    this.p_dual_text2_arr = window.p_dual_text2_arr ? window.p_dual_text2_arr.slice() : null;
    this.p_dual_footnote = window.p_dual_footnote || null;
  } else {
    this.p_dual_text1_arr = null;
    this.p_dual_text2_arr = null;
    this.p_dual_footnote = null;
  }

  this.p_person_title_arr = (typeof window !== "undefined" && window.p_person_title_arr) ? window.p_person_title_arr : ((typeof p_person_title_arr !== "undefined") ? p_person_title_arr : []);
  this.p_person_title = (typeof window !== "undefined" && typeof window.p_person_title !== "undefined") ? window.p_person_title : ((typeof p_person_title !== "undefined") ? p_person_title : "");
  this.p_title_arr = (typeof window !== "undefined" && window.p_title_arr) ? window.p_title_arr : ((typeof p_title_arr !== "undefined") ? p_title_arr : []);
  this.p_text1_font = (typeof window !== "undefined" && window.p_text1_font) ? window.p_text1_font : ((typeof p_text1_font !== "undefined") ? p_text1_font : "Arial");
  this.p_text2_font = (typeof window !== "undefined" && window.p_text2_font) ? window.p_text2_font : ((typeof p_text2_font !== "undefined") ? p_text2_font : "Arial");
  this.p_title = (typeof window !== "undefined" && typeof window.p_title !== "undefined") ? window.p_title : ((typeof p_title !== "undefined") ? p_title : "");
  this.p_current_index = (typeof window !== "undefined" && typeof window.p_current_index !== "undefined") ? window.p_current_index : ((typeof p_current_index !== "undefined") ? p_current_index : 0);
  this.p_last_index = (typeof window !== "undefined" && typeof window.p_last_index !== "undefined") ? window.p_last_index : ((typeof p_last_index !== "undefined") ? p_last_index : 0);
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
  this.p_attention_mode = (typeof p_attention_mode !== "undefined") ? p_attention_mode : false;
  this.p_attention_image = (typeof p_attention_image !== "undefined") ? p_attention_image : "";
  this.p_attention_title = (typeof p_attention_title !== "undefined") ? p_attention_title : "ATTENTION";
  this.p_attention_sub = (typeof p_attention_sub !== "undefined") ? p_attention_sub : "";
  this.p_attention_bg = (typeof p_attention_bg !== "undefined") ? p_attention_bg : "#000000";
  this.p_attention_color = (typeof p_attention_color !== "undefined") ? p_attention_color : "#ffffff";
  this.p_attention_imgsize = (typeof p_attention_imgsize !== "undefined") ? p_attention_imgsize : 35;
  this.p_attention_titlesize = (typeof p_attention_titlesize !== "undefined") ? p_attention_titlesize : 10;
  this.p_attention_subsize = (typeof p_attention_subsize !== "undefined") ? p_attention_subsize : 5;
  this.p_attention_title_bold = (typeof p_attention_title_bold !== "undefined") ? p_attention_title_bold : true;
  this.p_attention_title_italic = (typeof p_attention_title_italic !== "undefined") ? p_attention_title_italic : false;
  this.p_attention_title_caps = (typeof p_attention_title_caps !== "undefined") ? p_attention_title_caps : true;
  this.p_attention_title_color = (typeof p_attention_title_color !== "undefined") ? p_attention_title_color : (typeof p_attention_color !== "undefined" ? p_attention_color : "#ffffff");
  this.p_attention_title_border_color = (typeof p_attention_title_border_color !== "undefined") ? p_attention_title_border_color : "#000000";
  this.p_attention_title_border_thickness = (typeof p_attention_title_border_thickness !== "undefined") ? p_attention_title_border_thickness : 0;
  this.p_attention_title_padding_v = (typeof p_attention_title_padding_v !== "undefined") ? p_attention_title_padding_v : 0;
  this.p_attention_title_padding_h = (typeof p_attention_title_padding_h !== "undefined") ? p_attention_title_padding_h : 0;
  this.p_attention_sub_bold = (typeof p_attention_sub_bold !== "undefined") ? p_attention_sub_bold : false;
  this.p_attention_sub_italic = (typeof p_attention_sub_italic !== "undefined") ? p_attention_sub_italic : false;
  this.p_attention_sub_caps = (typeof p_attention_sub_caps !== "undefined") ? p_attention_sub_caps : false;
  this.p_attention_sub_color = (typeof p_attention_sub_color !== "undefined") ? p_attention_sub_color : (typeof p_attention_color !== "undefined" ? p_attention_color : "#ffffff");
  this.p_attention_sub_border_color = (typeof p_attention_sub_border_color !== "undefined") ? p_attention_sub_border_color : "#000000";
  this.p_attention_sub_border_thickness = (typeof p_attention_sub_border_thickness !== "undefined") ? p_attention_sub_border_thickness : 0;
  this.p_attention_sub_padding_v = (typeof p_attention_sub_padding_v !== "undefined") ? p_attention_sub_padding_v : 0;
  this.p_attention_sub_padding_h = (typeof p_attention_sub_padding_h !== "undefined") ? p_attention_sub_padding_h : 0;
  this.p_attention_border_color = (typeof p_attention_border_color !== "undefined") ? p_attention_border_color : "#ffffff";
  this.p_attention_border_thickness = (typeof p_attention_border_thickness !== "undefined") ? p_attention_border_thickness : 0;
  this.p_attention_padding_v = (typeof p_attention_padding_v !== "undefined") ? p_attention_padding_v : 5;
  this.p_attention_padding_h = (typeof p_attention_padding_h !== "undefined") ? p_attention_padding_h : 5;
  this.p_attention_speaker_show = (typeof p_attention_speaker_show !== "undefined") ? p_attention_speaker_show : false;
  this.p_attention_bgimage = (typeof p_attention_bgimage !== "undefined") ? p_attention_bgimage : "";
  this.p_attention_bgdim = (typeof p_attention_bgdim !== "undefined") ? p_attention_bgdim : 60;
  this.p_custom_slide = (typeof window !== "undefined" && typeof window.p_custom_slide !== "undefined") ? window.p_custom_slide : ((typeof p_custom_slide !== "undefined") ? p_custom_slide : null);
  this.p_timer_state = (typeof window !== "undefined" && window.timerManager) ? window.timerManager.getState() : null;
  this.p_output_mode = (typeof liveOutputMode !== "undefined") ? liveOutputMode : "live";
  const isAudioSongSync = Boolean(
    window.songAudioEngine &&
    window.songAudioEngine.syncEnabled &&
    window.songAudioEngine.currentSong &&
    window.songAudioEngine.currentSong.audio &&
    window.songAudioEngine.allTimedLines &&
    window.songAudioEngine.allTimedLines.length > 0
  );
  this.p_teleprompter_mode = isAudioSongSync;
  this.p_teleprompter_lines = isAudioSongSync ? window.songAudioEngine.allTimedLines : null;
  this.p_teleprompter_font_size = (isAudioSongSync && window.songAudioEngine) ? window.songAudioEngine.teleprompterFontSize : null;
  this.p_sync_enabled = (typeof window.songAudioEngine !== "undefined") ? window.songAudioEngine.syncEnabled : true;
  this.p_sync_active_line_index = (typeof window.songAudioEngine !== "undefined")
    ? (window.songAudioEngine.activeGlobalLineIndex >= 0 ? window.songAudioEngine.activeGlobalLineIndex : window.songAudioEngine.activeLineIndex)
    : -1;
  const curSongStyle = (window.themeManager && typeof window.themeManager.getStyleBundle === "function" && window.themeManager.getStyleBundle("songs")) || null;
  this.p_sync_active_color = (curSongStyle && curSongStyle.syncActiveColor) || "#F59E0B";
  this.p_sync_inactive_color = (curSongStyle && curSongStyle.syncInactiveColor) || "#94A3B8";
  const curSong = (window.songAudioEngine && window.songAudioEngine.currentSong) || null;
  const songNameKey = (curSong && curSong.name) ? curSong.name.trim().toLowerCase() : "";
  const curSongOutlineEnabled = Boolean(
    (curSong && curSong.activeOutlineEnabled) ||
    (curSongStyle && curSongStyle.syncActiveOutlineEnabled) ||
    (typeof localStorage !== "undefined" && songNameKey && localStorage.getItem("uecfi_song_outline_enabled_" + songNameKey) === "true")
  );
  this.p_sync_active_outline_enabled = curSongOutlineEnabled;
  this.p_sync_active_outline_color = (curSong && curSong.activeOutlineEnabled && curSong.activeOutlineColor)
    || (curSongStyle && curSongStyle.syncActiveOutlineColor)
    || (typeof localStorage !== "undefined" && songNameKey ? localStorage.getItem("uecfi_song_outline_color_" + songNameKey) : null)
    || (curSong && curSong.activeOutlineColor)
    || "#000000";
  this.p_sync_active_outline_thickness = (curSong && curSong.activeOutlineEnabled && typeof curSong.activeOutlineThickness === "number")
    ? curSong.activeOutlineThickness
    : ((curSongStyle && typeof curSongStyle.syncActiveOutlineThickness === "number")
      ? curSongStyle.syncActiveOutlineThickness
      : (typeof localStorage !== "undefined" && songNameKey && localStorage.getItem("uecfi_song_outline_thick_" + songNameKey) ? Number(localStorage.getItem("uecfi_song_outline_thick_" + songNameKey)) : 2));
  this.activeThemeObj = (typeof window !== "undefined" && window.activeThemeObj) ? window.activeThemeObj : null;
  // For the main centro projection screen, the centro camera is never projected
  // or laid out (only remote guest video feeds are displayed on the centro screen).
  // Operator preview monitor and remote audience streams continue to receive the centro camera.
  this.p_stage_layout = (!isExcludedCamera && activeSource) ? window.liveStudio.stageLayout : null;
  this.p_stage_stream_id = (!isExcludedCamera && activeSource && activeSource.stream) ? ((activeSource.type || "src") + "_" + (activeSource.id || "live")) : null;
  this.p_stage_source_type = (!isExcludedCamera && activeSource) ? activeSource.type : null;
  // Shadow globals must follow the theme too: the projection renderer reads
  // module-level blur/shadowColor (not activeThemeObj directly), so without
  // these lines they freeze at whatever the projection window opened with --
  // theme edits would never reach the live slide until a full reload.
  // Broadcast Speaker Lower Third state
  this.p_speaker_lower_third = (typeof window !== "undefined" && window.p_speaker_lower_third) ? window.p_speaker_lower_third : null;
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
  { cast: "readingnav_presentbutton", prev: "readingnav_prevbutton", next: "readingnav_nextbutton", stop: "readingnav_closebutton" },
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
// For animated GIFs, preserve full multi-frame animation instead of rasterizing on canvas.
function handleLogoDesignerFile(file) {
  try {
    const isGif = file && (file.type === "image/gif" || /\.gif$/i.test(file.name || ""));
    const reader = new FileReader();
    if (isGif) {
      reader.onload = () => {
        try {
          window.logoDesignerImageData = reader.result;
          const prev = document.getElementById("logoDesignerPreview");
          if (prev) { prev.src = window.logoDesignerImageData; prev.style.display = "block"; }
        } catch (e) {}
      };
      reader.readAsDataURL(file);
      return;
    }
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
// Custom attention screen (Attention toolbar button).
// Config persists in localStorage ("uecfi_attention_screen"); the projector
// + sidebar preview render it through the shared presentation.htm engine.
// ---------------------------------------------------------------------------
window.p_attention_mode = false;
window.p_attention_image = "";
window.p_attention_title = "ATTENTION";
window.p_attention_sub = "Panalangin / Silence Please";
window.p_attention_bg = "#000000";
window.p_attention_color = "#ffffff";
window.p_attention_imgsize = 35;
window.p_attention_titlesize = 10;
window.p_attention_subsize = 5;
window.p_attention_title_bold = true;
window.p_attention_title_italic = false;
window.p_attention_title_caps = true;
window.p_attention_title_color = "#ffffff";
window.p_attention_title_border_color = "#000000";
window.p_attention_title_border_thickness = 0;
window.p_attention_title_padding_v = 0;
window.p_attention_title_padding_h = 0;
window.p_attention_sub_bold = false;
window.p_attention_sub_italic = false;
window.p_attention_sub_caps = false;
window.p_attention_sub_color = "#ffffff";
window.p_attention_sub_border_color = "#000000";
window.p_attention_sub_border_thickness = 0;
window.p_attention_sub_padding_v = 0;
window.p_attention_sub_padding_h = 0;
window.p_attention_border_color = "#ffffff";
window.p_attention_border_thickness = 0;
window.p_attention_padding_v = 5;
window.p_attention_padding_h = 5;
window.p_attention_play_chime = true;
window.p_attention_chime_volume = 100;
window.p_attention_speaker_show = false;
window.p_attention_bgimage = "";
window.p_attention_bgdim = 60;
window.p_custom_slide = null;

function playAttentionChime(volumeOverride) {
  try {
    if (!window.attentionAudio) {
      window.attentionAudio = new Audio("attention.mp3");
    }
    const rawVol = (volumeOverride !== undefined && volumeOverride !== null)
      ? logoNum(volumeOverride, 100)
      : logoNum(window.p_attention_chime_volume, 100);
    window.attentionAudio.volume = Math.min(1, Math.max(0, rawVol / 100));
    window.attentionAudio.currentTime = 0;
    const playPromise = window.attentionAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((e) => {
        console.warn("[ATTENTION] Audio playback error:", e);
      });
    }
  } catch (e) {
    console.warn("[ATTENTION] Error playing chime:", e);
  }
}

function stopAttentionChime() {
  try {
    if (window.attentionAudio) {
      window.attentionAudio.pause();
      window.attentionAudio.currentTime = 0;
    }
  } catch (e) {}
}

function loadAttentionScreenConfig() {
  try {
    const raw = localStorage.getItem("uecfi_attention_screen");
    if (raw) {
      const c = JSON.parse(raw);
      if (c && typeof c === "object") {
        window.p_attention_image = (typeof c.image === "string") ? c.image : "";
        window.p_attention_title = (typeof c.title === "string") ? c.title : "ATTENTION";
        window.p_attention_sub = (typeof c.subtitle === "string") ? c.subtitle : "Panalangin / Silence Please";
        window.p_attention_bg = (typeof c.bg === "string") ? c.bg : "#000000";
        window.p_attention_color = (typeof c.color === "string") ? c.color : "#ffffff";
        window.p_attention_imgsize = Math.min(95, Math.max(5, logoNum(c.imgPct, 35)));
        window.p_attention_titlesize = Math.min(25, Math.max(1, logoNum(c.titlePct, 10)));
        window.p_attention_subsize = Math.min(15, Math.max(1, logoNum(c.subPct, 5)));
        window.p_attention_title_bold = (c.titleBold === undefined) ? true : !!c.titleBold;
        window.p_attention_title_italic = !!c.titleItalic;
        window.p_attention_title_caps = (c.titleCaps === undefined) ? true : !!c.titleCaps;
        window.p_attention_title_color = (typeof c.titleColor === "string") ? c.titleColor : (window.p_attention_color || "#ffffff");
        window.p_attention_title_border_color = (typeof c.titleBorderColor === "string") ? c.titleBorderColor : "#000000";
        window.p_attention_title_border_thickness = Math.min(20, Math.max(0, logoNum(c.titleBorderThickness, 0)));
        window.p_attention_title_padding_v = Math.min(50, Math.max(0, logoNum(c.titlePaddingV, 0)));
        window.p_attention_title_padding_h = Math.min(50, Math.max(0, logoNum(c.titlePaddingH, 0)));
        window.p_attention_sub_bold = !!c.subBold;
        window.p_attention_sub_italic = !!c.subItalic;
        window.p_attention_sub_caps = !!c.subCaps;
        window.p_attention_sub_color = (typeof c.subColor === "string") ? c.subColor : (window.p_attention_color || "#ffffff");
        window.p_attention_sub_border_color = (typeof c.subBorderColor === "string") ? c.subBorderColor : "#000000";
        window.p_attention_sub_border_thickness = Math.min(20, Math.max(0, logoNum(c.subBorderThickness, 0)));
        window.p_attention_sub_padding_v = Math.min(50, Math.max(0, logoNum(c.subPaddingV, 0)));
        window.p_attention_sub_padding_h = Math.min(50, Math.max(0, logoNum(c.subPaddingH, 0)));
        window.p_attention_border_color = (typeof c.borderColor === "string") ? c.borderColor : "#ffffff";
        window.p_attention_border_thickness = Math.min(50, Math.max(0, logoNum(c.borderThickness, 0)));
        window.p_attention_play_chime = (c.playChime === undefined) ? true : !!c.playChime;
        window.p_attention_chime_volume = Math.min(100, Math.max(0, logoNum(c.chimeVolume, 100)));
        window.p_attention_speaker_show = !!c.speakerShow;
        const fallbackPad = logoNum(c.padding, 5);
        window.p_attention_padding_v = Math.min(25, Math.max(0, logoNum(c.paddingV !== undefined ? c.paddingV : fallbackPad, 5)));
        window.p_attention_padding_h = Math.min(25, Math.max(0, logoNum(c.paddingH !== undefined ? c.paddingH : fallbackPad, 5)));
        window.p_attention_bgimage = (typeof c.bgImage === "string") ? c.bgImage : "";
        window.p_attention_bgdim = Math.min(90, Math.max(0, logoNum(c.bgDim, 60)));
        return;
      }
    }
  } catch (e) {}
  saveAttentionScreenConfig();
}

function saveAttentionScreenConfig() {
  try {
    localStorage.setItem("uecfi_attention_screen", JSON.stringify({
      image: window.p_attention_image || "",
      title: (typeof window.p_attention_title === "string") ? window.p_attention_title : "ATTENTION",
      subtitle: (typeof window.p_attention_sub === "string") ? window.p_attention_sub : "",
      bg: window.p_attention_bg || "#000000",
      color: window.p_attention_color || "#ffffff",
      imgPct: logoNum(window.p_attention_imgsize, 35),
      titlePct: logoNum(window.p_attention_titlesize, 10),
      subPct: logoNum(window.p_attention_subsize, 5),
      titleBold: window.p_attention_title_bold !== false,
      titleItalic: !!window.p_attention_title_italic,
      titleCaps: window.p_attention_title_caps !== false,
      titleColor: window.p_attention_title_color || window.p_attention_color || "#ffffff",
      titleBorderColor: window.p_attention_title_border_color || "#000000",
      titleBorderThickness: logoNum(window.p_attention_title_border_thickness, 0),
      titlePaddingV: logoNum(window.p_attention_title_padding_v, 0),
      titlePaddingH: logoNum(window.p_attention_title_padding_h, 0),
      subBold: !!window.p_attention_sub_bold,
      subItalic: !!window.p_attention_sub_italic,
      subCaps: !!window.p_attention_sub_caps,
      subColor: window.p_attention_sub_color || window.p_attention_color || "#ffffff",
      subBorderColor: window.p_attention_sub_border_color || "#000000",
      subBorderThickness: logoNum(window.p_attention_sub_border_thickness, 0),
      subPaddingV: logoNum(window.p_attention_sub_padding_v, 0),
      subPaddingH: logoNum(window.p_attention_sub_padding_h, 0),
      borderColor: window.p_attention_border_color || "#ffffff",
      borderThickness: logoNum(window.p_attention_border_thickness, 0),
      playChime: window.p_attention_play_chime !== false,
      chimeVolume: Math.min(100, Math.max(0, logoNum(window.p_attention_chime_volume, 100))),
      speakerShow: !!window.p_attention_speaker_show,
      paddingV: logoNum(window.p_attention_padding_v, 5),
      paddingH: logoNum(window.p_attention_padding_h, 5),
      padding: logoNum(window.p_attention_padding_v, 5),
      bgImage: (typeof window.p_attention_bgimage === "string") ? window.p_attention_bgimage : "",
      bgDim: logoNum(window.p_attention_bgdim, 60)
    }));
  } catch (e) {}
}

// WYSIWYG content for the sidebar attention overlay.
function renderAttentionOverlay() {
  try {
    const content = document.getElementById("attentionOverlayContent");
    if (content) {
      const padV = Math.min(25, Math.max(0, logoNum(window.p_attention_padding_v, 5)));
      const padH = Math.min(25, Math.max(0, logoNum(window.p_attention_padding_h, 5)));
      const borderThick = Math.max(0, logoNum(window.p_attention_border_thickness, 0));
      const borderColor = window.p_attention_border_color || "#ffffff";

      content.style.position = "absolute";
      content.style.left = `${padH}%`;
      content.style.top = `${padV}%`;
      content.style.width = `calc(100% - ${padH * 2}%)`;
      content.style.height = `calc(100% - ${padV * 2}%)`;
      content.style.boxSizing = "border-box";
      if (borderThick > 0) {
        const previewBorderPx = Math.max(1, Math.min(4, Math.round(borderThick * 0.25)));
        content.style.border = `${previewBorderPx}px solid ${borderColor}`;
        content.style.borderRadius = `${Math.min(6, Math.max(0, previewBorderPx * 2))}px`;
        content.style.padding = "8px";
      } else {
        content.style.border = "none";
        content.style.borderRadius = "0px";
        content.style.padding = "0px";
      }
    }
    const img = document.getElementById("attentionOverlayImg");
    if (img) {
      if (window.p_attention_image) {
        if (img.getAttribute("src") !== window.p_attention_image) img.setAttribute("src", window.p_attention_image);
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }
    }
    const t = document.getElementById("attentionOverlayTitle");
    if (t) {
      t.textContent = window.p_attention_title || "";
      t.style.display = window.p_attention_title ? "block" : "none";
      t.style.color = window.p_attention_title_color || window.p_attention_color || "#ffffff";
      t.style.fontWeight = window.p_attention_title_bold === false ? "normal" : "bold";
      t.style.fontStyle = window.p_attention_title_italic ? "italic" : "normal";
      t.style.textTransform = (window.p_attention_title_caps !== false) ? "uppercase" : "none";
      const tBorderThick = Math.max(0, logoNum(window.p_attention_title_border_thickness, 0));
      const tBorderColor = window.p_attention_title_border_color || "#000000";
      const tPadV = Math.max(0, logoNum(window.p_attention_title_padding_v, 0));
      const tPadH = Math.max(0, logoNum(window.p_attention_title_padding_h, 0));
      const previewTStroke = Math.max(0, Math.round(tBorderThick * 0.25));
      if (previewTStroke > 0) {
        t.style.webkitTextStroke = `${previewTStroke}px ${tBorderColor}`;
        t.style.paintOrder = "stroke fill";
      } else {
        t.style.webkitTextStroke = "0px transparent";
        t.style.paintOrder = "normal";
      }
      t.style.padding = `${Math.round(tPadV * 0.25)}px ${Math.round(tPadH * 0.25)}px`;
    }
    const s = document.getElementById("attentionOverlaySub");
    if (s) {
      s.textContent = window.p_attention_sub || "";
      s.style.display = window.p_attention_sub ? "block" : "none";
      s.style.color = window.p_attention_sub_color || window.p_attention_color || "#ffffff";
      s.style.fontWeight = window.p_attention_sub_bold ? "bold" : "normal";
      s.style.fontStyle = window.p_attention_sub_italic ? "italic" : "normal";
      s.style.textTransform = window.p_attention_sub_caps ? "uppercase" : "none";
      const sBorderThick = Math.max(0, logoNum(window.p_attention_sub_border_thickness, 0));
      const sBorderColor = window.p_attention_sub_border_color || "#000000";
      const sPadV = Math.max(0, logoNum(window.p_attention_sub_padding_v, 0));
      const sPadH = Math.max(0, logoNum(window.p_attention_sub_padding_h, 0));
      const previewSStroke = Math.max(0, Math.round(sBorderThick * 0.25));
      if (previewSStroke > 0) {
        s.style.webkitTextStroke = `${previewSStroke}px ${sBorderColor}`;
        s.style.paintOrder = "stroke fill";
      } else {
        s.style.webkitTextStroke = "0px transparent";
        s.style.paintOrder = "normal";
      }
      s.style.padding = `${Math.round(sPadV * 0.25)}px ${Math.round(sPadH * 0.25)}px`;
    }
    const att = document.getElementById("attentionOverlay") || document.getElementById("blackoutOverlay");
    if (att) att.style.background = window.p_attention_bg || "#000000";
    // Sidebar mirror of the engine background photo + dimming overlay.
    try {
      const bg = document.getElementById("attentionOverlayBg");
      if (bg) {
        if (window.p_attention_bgimage) {
          const primary = `./background/${window.p_attention_bgimage}`;
          const fallback = `storage/background/${window.p_attention_bgimage}`;
          if (bg.getAttribute("data-file") !== window.p_attention_bgimage) {
            bg.setAttribute("data-file", window.p_attention_bgimage);
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
      const dimPct = Math.min(90, Math.max(0, logoNum(window.p_attention_bgdim, 60)));
      const dim = document.getElementById("attentionOverlayDim");
      if (dim) {
        if (window.p_attention_bgimage && dimPct > 0) {
          dim.style.display = "block";
          dim.style.opacity = String(dimPct / 100);
        } else {
          dim.style.display = "none";
        }
      }
    } catch (e) {}
  } catch (e) {}
}

function renderAttentionBgGallery() {
  try {
    const host = document.getElementById("attentionBgGallery");
    if (!host) return;
    const current = String(window.attentionDesignerBgImage || "").toLowerCase();
    const ring = (on) => on
      ? "ring-2 ring-brand-600 border-brand-500 shadow-sm bg-brand-50/30"
      : "border-slate-200 hover:border-slate-400 bg-white";
    const badge = (on) => on
      ? `<span class="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-600 text-white flex items-center justify-center text-[9px]"><i class="fa-solid fa-check"></i></span>`
      : "";
    let html = `
      <div onclick="selectAttentionBackground('')" title="Solid color (no photo)"
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
      <div onclick="selectAttentionBackground('${safeFile}')" title="${escapeNotepadHtml(img.name || img.file)} (${escapeNotepadHtml(img.file)})"
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

function selectAttentionBackground(file) {
  try {
    window.attentionDesignerBgImage = file || "";
    window.p_attention_bgimage = file || "";
    saveAttentionScreenConfig();
    renderAttentionBgGallery();
    renderAttentionOverlay();
    if (window.liveOutputMode === "attention" || window.liveOutputMode === "black") {
      refreshProjectorEngine();
      pushSidebarPreview();
    }
  } catch (e) {}
}

function uploadAttentionBackground(event) {
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
        console.error("[ATTENTION] Error saving uploaded background to disk:", err);
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
      console.warn("[ATTENTION] Error persisting uploaded background to registry:", e);
    }
    try {
      if (window.themeManager && typeof window.themeManager.loadAvailableImages === "function") {
        window.themeManager.loadAvailableImages();
      }
    } catch (e) {}
    try { input.value = ""; } catch (e) {}
    selectAttentionBackground(fileName);
  } catch (e) {}
}

window.attentionDesignerImageData = null;
function openAttentionDesigner() {
  try {
    if (typeof AppUI === "undefined" || !AppUI.Modal) return;
    loadAttentionScreenConfig();
    if (!window.attentionDesignerModal) {
      window.attentionDesignerModal = new AppUI.Modal("attentionScreenDialog");
      window.attentionDesignerModal.render();
    }
    window.attentionDesignerImageData = window.p_attention_image || null;
    window.attentionDesignerBgImage = window.p_attention_bgimage || "";
    window.attentionDesignerModal.setHeader("Attention Screen");
    window.attentionDesignerModal.setBody(
      `<div class="flex flex-col gap-3">`
      + `<div class="flex items-start gap-3">`
      + `<img id="attentionDesignerPreview" src="${window.p_attention_image || ""}" style="display:${window.p_attention_image ? "block" : "none"};width:96px;height:96px;object-fit:contain;background:#0f172a;border-radius:12px;border:1px solid #e2e8f0;">`
      + `<div class="flex-1 min-w-0 flex flex-col gap-2">`
      + `<input id="attentionDesignerFile" type="file" accept="image/*" class="w-full text-xs text-slate-600">`
      + `<button type="button" id="attentionDesignerRemoveBtn" class="px-2.5 py-1 text-[11px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition self-start" style="background:none;border:0;cursor:pointer;">Remove image</button>`
      + `</div></div>`
      + `<div class="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">`
      + `<div class="flex items-center justify-between"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">Title / Header</span>`
      + `<span class="flex items-center gap-1">`
      + `<button type="button" id="attentionDesignerTitleBold" title="Bold title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><b>B</b></button>`
      + `<button type="button" id="attentionDesignerTitleItalic" title="Italic title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><i>I</i></button>`
      + `<button type="button" id="attentionDesignerTitleCaps" title="All caps title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:11px;font-weight:bold;cursor:pointer;background:#fff;">AA</button>`
      + `</span></div>`
      + `<input id="attentionDesignerTitle" type="text" maxlength="60" value="${escapeNotepadHtml(window.p_attention_title || "")}" placeholder="ATTENTION" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans bg-white">`
      + `<label class="block"><span class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Title size (<span id="attentionDesignerTitleVal">${Math.round(logoNum(window.p_attention_titlesize, 10))}%</span> of screen height)</span>`
      + `<input id="attentionDesignerTitleSize" type="range" min="1" max="25" step="0.5" value="${logoNum(window.p_attention_titlesize, 10)}" class="w-full"></label>`
      + `<div class="flex items-center gap-3 pt-1 border-t border-slate-200/60 flex-wrap">`
      + `<label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Color <input id="attentionDesignerTitleColor" type="color" value="${escapeNotepadHtml(window.p_attention_title_color || window.p_attention_color || "#ffffff")}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>`
      + `<label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Border <input id="attentionDesignerTitleBorderColor" type="color" value="${escapeNotepadHtml(window.p_attention_title_border_color || "#000000")}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>`
      + `<label class="flex-1 min-w-[140px] block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">Thickness (<span id="attentionDesignerTitleBorderVal">${logoNum(window.p_attention_title_border_thickness, 0)}px</span>)</span>`
      + `<input id="attentionDesignerTitleBorder" type="range" min="0" max="15" step="1" value="${logoNum(window.p_attention_title_border_thickness, 0)}" class="w-full"></label>`
      + `</div>`
      + `<div class="grid grid-cols-2 gap-2 pt-1">`
      + `<label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">V-Padding (<span id="attentionDesignerTitlePadVVal">${logoNum(window.p_attention_title_padding_v, 0)}px</span>)</span>`
      + `<input id="attentionDesignerTitlePadV" type="range" min="0" max="40" step="1" value="${logoNum(window.p_attention_title_padding_v, 0)}" class="w-full"></label>`
      + `<label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">H-Padding (<span id="attentionDesignerTitlePadHVal">${logoNum(window.p_attention_title_padding_h, 0)}px</span>)</span>`
      + `<input id="attentionDesignerTitlePadH" type="range" min="0" max="40" step="1" value="${logoNum(window.p_attention_title_padding_h, 0)}" class="w-full"></label>`
      + `</div>`
      + `</div>`
      + `<div class="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">`
      + `<div class="flex items-center justify-between"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">Subtitle / Notice Message</span>`
      + `<span class="flex items-center gap-1">`
      + `<button type="button" id="attentionDesignerSubBold" title="Bold subtitle" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><b>B</b></button>`
      + `<button type="button" id="attentionDesignerSubItalic" title="Italic subtitle" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><i>I</i></button>`
      + `<button type="button" id="attentionDesignerSubCaps" title="All caps subtitle" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:11px;font-weight:bold;cursor:pointer;background:#fff;">AA</button>`
      + `</span></div>`
      + `<input id="attentionDesignerSub" type="text" maxlength="120" value="${escapeNotepadHtml(window.p_attention_sub || "")}" placeholder="Panalangin / Silence Please" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans bg-white">`
      + `<label class="block"><span class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Subtitle size (<span id="attentionDesignerSubVal">${Math.round(logoNum(window.p_attention_subsize, 5))}%</span> of screen height)</span>`
      + `<input id="attentionDesignerSubSize" type="range" min="1" max="15" step="0.5" value="${logoNum(window.p_attention_subsize, 5)}" class="w-full"></label>`
      + `<div class="flex items-center gap-3 pt-1 border-t border-slate-200/60 flex-wrap">`
      + `<label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Color <input id="attentionDesignerSubColor" type="color" value="${escapeNotepadHtml(window.p_attention_sub_color || window.p_attention_color || "#ffffff")}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>`
      + `<label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Border <input id="attentionDesignerSubBorderColor" type="color" value="${escapeNotepadHtml(window.p_attention_sub_border_color || "#000000")}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>`
      + `<label class="flex-1 min-w-[140px] block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">Thickness (<span id="attentionDesignerSubBorderVal">${logoNum(window.p_attention_sub_border_thickness, 0)}px</span>)</span>`
      + `<input id="attentionDesignerSubBorder" type="range" min="0" max="15" step="1" value="${logoNum(window.p_attention_sub_border_thickness, 0)}" class="w-full"></label>`
      + `</div>`
      + `<div class="grid grid-cols-2 gap-2 pt-1">`
      + `<label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">V-Padding (<span id="attentionDesignerSubPadVVal">${logoNum(window.p_attention_sub_padding_v, 0)}px</span>)</span>`
      + `<input id="attentionDesignerSubPadV" type="range" min="0" max="40" step="1" value="${logoNum(window.p_attention_sub_padding_v, 0)}" class="w-full"></label>`
      + `<label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">H-Padding (<span id="attentionDesignerSubPadHVal">${logoNum(window.p_attention_sub_padding_h, 0)}px</span>)</span>`
      + `<input id="attentionDesignerSubPadH" type="range" min="0" max="40" step="1" value="${logoNum(window.p_attention_sub_padding_h, 0)}" class="w-full"></label>`
      + `</div>`
      + `</div>`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Image size (<span id="attentionDesignerImgVal">${Math.round(logoNum(window.p_attention_imgsize, 35))}%</span> of screen height)</span>`
      + `<input id="attentionDesignerImg" type="range" min="5" max="95" step="1" value="${Math.round(logoNum(window.p_attention_imgsize, 35))}" class="w-full"></label>`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Card border thickness (<span id="attentionDesignerBorderThicknessVal">${logoNum(window.p_attention_border_thickness, 0)}px</span>)</span>`
      + `<input id="attentionDesignerBorderThickness" type="range" min="0" max="25" step="1" value="${logoNum(window.p_attention_border_thickness, 0)}" class="w-full"></label>`
      + `<div class="grid grid-cols-2 gap-3">`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Card V-padding (<span id="attentionDesignerPaddingVVal">${logoNum(window.p_attention_padding_v, 5)}%</span>)</span>`
      + `<input id="attentionDesignerPaddingV" type="range" min="0" max="25" step="1" value="${logoNum(window.p_attention_padding_v, 5)}" class="w-full"></label>`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Card H-padding (<span id="attentionDesignerPaddingHVal">${logoNum(window.p_attention_padding_h, 5)}%</span>)</span>`
      + `<input id="attentionDesignerPaddingH" type="range" min="0" max="25" step="1" value="${logoNum(window.p_attention_padding_h, 5)}" class="w-full"></label>`
      + `</div>`
      + `<div class="flex items-center gap-4 flex-wrap">`
      + `<label class="flex items-center gap-2 text-xs font-semibold text-slate-600">Background <input id="attentionDesignerBg" type="color" value="${escapeNotepadHtml(window.p_attention_bg || "#000000")}" style="width:36px;height:26px;padding:0;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;"></label>`
      + `<label class="flex items-center gap-2 text-xs font-semibold text-slate-600">Card Border <input id="attentionDesignerBorderColor" type="color" value="${escapeNotepadHtml(window.p_attention_border_color || "#ffffff")}" style="width:36px;height:26px;padding:0;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;"></label>`
      + `</div>`
      + `<div class="block"><div class="flex items-center justify-between mb-1"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Background photo</span>`
      + `<span class="flex items-center gap-2">`
      + `<input type="file" id="attentionBgUploadInput" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" class="hidden" onchange="uploadAttentionBackground(event)">`
      + `<button type="button" onclick="document.getElementById('attentionBgUploadInput').click()" class="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button>`
      + `</span></div>`
      + `<div id="attentionBgGallery" class="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1.5 bg-slate-50 border border-slate-200 rounded-xl"></div>`
      + `</div>`
      + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Photo dimming (<span id="attentionDesignerDimVal">${Math.round(logoNum(window.p_attention_bgdim, 60))}%</span>)</span>`
      + `<input id="attentionDesignerDim" type="range" min="0" max="90" step="1" value="${Math.round(logoNum(window.p_attention_bgdim, 60))}" class="w-full"></label>`
      + `<div class="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2.5">`
      + `<div class="flex items-center justify-between">`
      + `<div><span class="block text-xs font-bold text-slate-700">Audio chime (attention.mp3)</span>`
      + `<span class="block text-[11px] text-slate-500">Play chime automatically when attention screen opens</span></div>`
      + `<label class="relative inline-flex items-center cursor-pointer">`
      + `<input type="checkbox" id="attentionDesignerPlayChime" class="sr-only peer" ${window.p_attention_play_chime !== false ? "checked" : ""}>`
      + `<div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>`
      + `</label>`
      + `</div>`
      + `<div class="pt-2 border-t border-slate-200/80 flex items-center gap-3">`
      + `<div class="flex-1">`
      + `<div class="flex items-center justify-between mb-1"><span class="text-[11px] font-semibold text-slate-600">Chime volume</span><span id="attentionDesignerChimeVolumeVal" class="text-[11px] font-bold text-brand-600">${Math.min(100, Math.max(0, logoNum(window.p_attention_chime_volume, 100)))}%</span></div>`
      + `<input type="range" id="attentionDesignerChimeVolume" min="0" max="100" step="1" value="${Math.min(100, Math.max(0, logoNum(window.p_attention_chime_volume, 100)))}" class="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600">`
      + `</div>`
      + `<button type="button" id="attentionDesignerChimeTestBtn" class="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 shrink-0">Test</button>`
      + `</div>`
      + `</div>`
      + `<div class="p-3 bg-slate-50/70 border border-slate-200 rounded-xl flex items-center justify-between">`
      + `<div><span class="block text-xs font-bold text-slate-700">Remote speaker screen</span>`
      + `<span class="block text-[11px] text-slate-500">Keep current slide visible on speaker remote (do not override)</span></div>`
      + `<label class="relative inline-flex items-center cursor-pointer">`
      + `<input type="checkbox" id="attentionDesignerSpeakerKeepSlide" class="sr-only peer" ${window.p_attention_speaker_show ? "" : "checked"}>`
      + `<div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>`
      + `</label>`
      + `</div>`
      + `<div class="flex items-center justify-end gap-2 pt-1">`
      + `<button type="button" id="attentionDesignerCancelBtn" class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cancel</button>`
      + `<button type="button" id="attentionDesignerSaveBtn" class="px-4 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition">Save</button>`
      + `</div></div>`
    );
    const fileInput = document.getElementById("attentionDesignerFile");
    if (fileInput) fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) handleAttentionDesignerFile(f);
    });
    const removeBtn = document.getElementById("attentionDesignerRemoveBtn");
    if (removeBtn) removeBtn.onclick = () => {
      window.attentionDesignerImageData = "";
      const prev = document.getElementById("attentionDesignerPreview");
      if (prev) { prev.removeAttribute("src"); prev.style.display = "none"; }
      if (fileInput) fileInput.value = "";
    };
    const cancelBtn = document.getElementById("attentionDesignerCancelBtn");
    if (cancelBtn) cancelBtn.onclick = () => { try { window.attentionDesignerModal.hide(); } catch (e) {} };
    const saveBtn = document.getElementById("attentionDesignerSaveBtn");
    if (saveBtn) saveBtn.onclick = saveAttentionDesigner;
    const bindAttentionRange = (rangeId, valId, unit = "%") => {
      const r = document.getElementById(rangeId);
      const v = document.getElementById(valId);
      if (r && v) r.addEventListener("input", () => { v.textContent = `${r.value}${unit}`; });
    };
    bindAttentionRange("attentionDesignerImg", "attentionDesignerImgVal", "%");
    bindAttentionRange("attentionDesignerTitleSize", "attentionDesignerTitleVal", "%");
    bindAttentionRange("attentionDesignerTitleBorder", "attentionDesignerTitleBorderVal", "px");
    bindAttentionRange("attentionDesignerTitlePadV", "attentionDesignerTitlePadVVal", "px");
    bindAttentionRange("attentionDesignerTitlePadH", "attentionDesignerTitlePadHVal", "px");
    bindAttentionRange("attentionDesignerSubSize", "attentionDesignerSubVal", "%");
    bindAttentionRange("attentionDesignerSubBorder", "attentionDesignerSubBorderVal", "px");
    bindAttentionRange("attentionDesignerSubPadV", "attentionDesignerSubPadVVal", "px");
    bindAttentionRange("attentionDesignerSubPadH", "attentionDesignerSubPadHVal", "px");
    bindAttentionRange("attentionDesignerBorderThickness", "attentionDesignerBorderThicknessVal", "px");
    bindAttentionRange("attentionDesignerPaddingV", "attentionDesignerPaddingVVal", "%");
    bindAttentionRange("attentionDesignerPaddingH", "attentionDesignerPaddingHVal", "%");
    bindAttentionRange("attentionDesignerDim", "attentionDesignerDimVal", "%");
    bindAttentionRange("attentionDesignerChimeVolume", "attentionDesignerChimeVolumeVal", "%");
    const chimeVolEl = document.getElementById("attentionDesignerChimeVolume");
    if (chimeVolEl) {
      chimeVolEl.addEventListener("input", () => {
        if (window.attentionAudio) {
          window.attentionAudio.volume = Math.min(1, Math.max(0, logoNum(chimeVolEl.value, 100) / 100));
        }
      });
    }
    const chimeTestBtn = document.getElementById("attentionDesignerChimeTestBtn");
    if (chimeTestBtn) {
      chimeTestBtn.onclick = () => {
        playAttentionChime(chimeVolEl ? chimeVolEl.value : window.p_attention_chime_volume);
      };
    }
    renderAttentionBgGallery();
    // Formatting toggles seed from the saved config.
    window.attentionDesignerTitleBold = window.p_attention_title_bold !== false;
    window.attentionDesignerTitleItalic = !!window.p_attention_title_italic;
    window.attentionDesignerTitleCaps = window.p_attention_title_caps !== false;
    window.attentionDesignerSubBold = !!window.p_attention_sub_bold;
    window.attentionDesignerSubItalic = !!window.p_attention_sub_italic;
    window.attentionDesignerSubCaps = !!window.p_attention_sub_caps;
    const paintAttentionFmt = (btn, on) => {
      if (!btn) return;
      btn.style.background = on ? "#7c3aed" : "#ffffff";
      btn.style.color = on ? "#ffffff" : "#64748b";
      btn.style.borderColor = on ? "#7c3aed" : "#cbd5e1";
    };
    const fmtPairs = [
      ["attentionDesignerTitleBold", "TitleBold"],
      ["attentionDesignerTitleItalic", "TitleItalic"],
      ["attentionDesignerTitleCaps", "TitleCaps"],
      ["attentionDesignerSubBold", "SubBold"],
      ["attentionDesignerSubItalic", "SubItalic"],
      ["attentionDesignerSubCaps", "SubCaps"]
    ];
    fmtPairs.forEach(([id, key]) => {
      const btn = document.getElementById(id);
      const stateKey = `attentionDesigner${key}`;
      paintAttentionFmt(btn, !!window[stateKey]);
      if (btn) btn.onclick = () => {
        window[stateKey] = !window[stateKey];
        paintAttentionFmt(btn, !!window[stateKey]);
      };
    });
    window.attentionDesignerModal.show();
  } catch (e) {}
}

function handleAttentionDesignerFile(file) {
  try {
    const isGif = file && (file.type === "image/gif" || /\.gif$/i.test(file.name || ""));
    const reader = new FileReader();
    if (isGif) {
      reader.onload = () => {
        try {
          window.attentionDesignerImageData = reader.result;
          const prev = document.getElementById("attentionDesignerPreview");
          if (prev) { prev.src = window.attentionDesignerImageData; prev.style.display = "block"; }
        } catch (e) {}
      };
      reader.readAsDataURL(file);
      return;
    }
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
            window.attentionDesignerImageData = canvas.toDataURL(isJpeg ? "image/jpeg" : "image/png", 0.9);
            const prev = document.getElementById("attentionDesignerPreview");
            if (prev) { prev.src = window.attentionDesignerImageData; prev.style.display = "block"; }
          } catch (e) {}
        };
        img.src = reader.result;
      } catch (e) {}
    };
    reader.readAsDataURL(file);
  } catch (e) {}
}

function saveAttentionDesigner() {
  try {
    const titleEl = document.getElementById("attentionDesignerTitle");
    const subEl = document.getElementById("attentionDesignerSub");
    const titleColorEl = document.getElementById("attentionDesignerTitleColor");
    const titleBorderColorEl = document.getElementById("attentionDesignerTitleBorderColor");
    const titleBorderRange = document.getElementById("attentionDesignerTitleBorder");
    const titlePadVRange = document.getElementById("attentionDesignerTitlePadV");
    const titlePadHRange = document.getElementById("attentionDesignerTitlePadH");
    const subColorEl = document.getElementById("attentionDesignerSubColor");
    const subBorderColorEl = document.getElementById("attentionDesignerSubBorderColor");
    const subBorderRange = document.getElementById("attentionDesignerSubBorder");
    const subPadVRange = document.getElementById("attentionDesignerSubPadV");
    const subPadHRange = document.getElementById("attentionDesignerSubPadH");
    const bgEl = document.getElementById("attentionDesignerBg");
    const borderColorEl = document.getElementById("attentionDesignerBorderColor");
    const borderThickRange = document.getElementById("attentionDesignerBorderThickness");
    const padVRange = document.getElementById("attentionDesignerPaddingV");
    const padHRange = document.getElementById("attentionDesignerPaddingH");
    const chimeEl = document.getElementById("attentionDesignerPlayChime");
    const chimeVolEl = document.getElementById("attentionDesignerChimeVolume");
    const imgRange = document.getElementById("attentionDesignerImg");
    const titleRange = document.getElementById("attentionDesignerTitleSize");
    const subRange = document.getElementById("attentionDesignerSubSize");
    const dimRange = document.getElementById("attentionDesignerDim");
    window.p_attention_image = (typeof window.attentionDesignerImageData === "string") ? window.attentionDesignerImageData : (window.p_attention_image || "");
    window.p_attention_title = titleEl ? (titleEl.value || "").trim().slice(0, 60) : (window.p_attention_title || "");
    window.p_attention_sub = subEl ? (subEl.value || "").trim().slice(0, 120) : (window.p_attention_sub || "");
    window.p_attention_title_color = (titleColorEl && titleColorEl.value) ? titleColorEl.value : "#ffffff";
    window.p_attention_title_border_color = (titleBorderColorEl && titleBorderColorEl.value) ? titleBorderColorEl.value : "#000000";
    window.p_attention_title_border_thickness = titleBorderRange ? Math.min(20, Math.max(0, Math.round(logoNum(titleBorderRange.value, 0)))) : 0;
    window.p_attention_title_padding_v = titlePadVRange ? Math.min(50, Math.max(0, Math.round(logoNum(titlePadVRange.value, 0)))) : 0;
    window.p_attention_title_padding_h = titlePadHRange ? Math.min(50, Math.max(0, Math.round(logoNum(titlePadHRange.value, 0)))) : 0;
    window.p_attention_sub_color = (subColorEl && subColorEl.value) ? subColorEl.value : "#ffffff";
    window.p_attention_sub_border_color = (subBorderColorEl && subBorderColorEl.value) ? subBorderColorEl.value : "#000000";
    window.p_attention_sub_border_thickness = subBorderRange ? Math.min(20, Math.max(0, Math.round(logoNum(subBorderRange.value, 0)))) : 0;
    window.p_attention_sub_padding_v = subPadVRange ? Math.min(50, Math.max(0, Math.round(logoNum(subPadVRange.value, 0)))) : 0;
    window.p_attention_sub_padding_h = subPadHRange ? Math.min(50, Math.max(0, Math.round(logoNum(subPadHRange.value, 0)))) : 0;
    window.p_attention_bg = (bgEl && bgEl.value) ? bgEl.value : "#000000";
    window.p_attention_color = window.p_attention_title_color || "#ffffff";
    window.p_attention_border_color = (borderColorEl && borderColorEl.value) ? borderColorEl.value : "#ffffff";
    window.p_attention_border_thickness = borderThickRange ? Math.min(50, Math.max(0, Math.round(logoNum(borderThickRange.value, 0)))) : 0;
    window.p_attention_padding_v = padVRange ? Math.min(25, Math.max(0, Math.round(logoNum(padVRange.value, 5)))) : 5;
    window.p_attention_padding_h = padHRange ? Math.min(25, Math.max(0, Math.round(logoNum(padHRange.value, 5)))) : 5;
    window.p_attention_play_chime = chimeEl ? !!chimeEl.checked : true;
    window.p_attention_chime_volume = chimeVolEl ? Math.min(100, Math.max(0, logoNum(chimeVolEl.value, 100))) : 100;
    const speakerKeepEl = document.getElementById("attentionDesignerSpeakerKeepSlide");
    window.p_attention_speaker_show = speakerKeepEl ? !speakerKeepEl.checked : false;
    window.p_attention_imgsize = imgRange ? Math.min(95, Math.max(5, Math.round(logoNum(imgRange.value, 35)))) : 35;
    window.p_attention_titlesize = titleRange ? Math.min(25, Math.max(1, logoNum(titleRange.value, 10))) : 10;
    window.p_attention_subsize = subRange ? Math.min(15, Math.max(1, logoNum(subRange.value, 5))) : 5;
    window.p_attention_bgdim = dimRange ? Math.min(90, Math.max(0, Math.round(logoNum(dimRange.value, 60)))) : 60;
    window.p_attention_bgimage = (typeof window.attentionDesignerBgImage === "string") ? window.attentionDesignerBgImage : (window.p_attention_bgimage || "");
    window.p_attention_title_bold = (typeof window.attentionDesignerTitleBold === "boolean") ? window.attentionDesignerTitleBold : (window.p_attention_title_bold !== false);
    window.p_attention_title_italic = (typeof window.attentionDesignerTitleItalic === "boolean") ? window.attentionDesignerTitleItalic : !!window.p_attention_title_italic;
    window.p_attention_title_caps = (typeof window.attentionDesignerTitleCaps === "boolean") ? window.attentionDesignerTitleCaps : (window.p_attention_title_caps !== false);
    window.p_attention_sub_bold = (typeof window.attentionDesignerSubBold === "boolean") ? window.attentionDesignerSubBold : !!window.p_attention_sub_bold;
    window.p_attention_sub_italic = (typeof window.attentionDesignerSubItalic === "boolean") ? window.attentionDesignerSubItalic : !!window.p_attention_sub_italic;
    window.p_attention_sub_caps = (typeof window.attentionDesignerSubCaps === "boolean") ? window.attentionDesignerSubCaps : !!window.p_attention_sub_caps;
    saveAttentionScreenConfig();
    renderAttentionOverlay();
    if (window.attentionDesignerModal) {
      try { window.attentionDesignerModal.hide(); } catch (e) {}
    }
    // A visible attention screen updates immediately.
    if (window.liveOutputMode === "attention" || window.liveOutputMode === "black") {
      refreshProjectorEngine();
      pushSidebarPreview();
    }
  } catch (e) {}
}
// ---------------------------------------------------------------------------
// Live Output Preview (right-sidebar monitor) controller.
// Single writer for the monitor's text content; output-state (logo /
// attention) overlays sit on top and any new presented content returns the
// monitor to live-text mode.
// ---------------------------------------------------------------------------
window.liveOutputMode = "live"; // live | logo | attention | black
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
    if (o.customSlide && typeof o.customSlide === "object") {
      window.p_custom_slide = o.customSlide;
    } else {
      window.p_custom_slide = null;
    }
    window.liveMonitorState = {
      primary: o.primary || "",
      secondary: o.secondary || "",
      personTitle: o.personTitle || "",
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

    // Broadcast current slide update to remote guests in Green Room
    if (window.liveStudio && window.liveStudio.socket && window.liveStudio.socket.readyState === WebSocket.OPEN) {
      try {
        const ms = window.liveMonitorState || {};
        const displayTitle = (ms.reference || ms.indicator || ms.primary || '').replace(/<[^>]+>/g, ' ').trim();
        window.liveStudio.socket.send(JSON.stringify({
          type: 'program-update',
          programState: { title: displayTitle }
        }));
      } catch (err) {}
    }
  } catch (e) {}
}
// Switch the monitor output state. Toolbar entry point is toggleOutputState().
// The engine frame always stays visible; attention/logo cover it.
function setLiveMonitorMode(mode, silent) {
  try {
    const prev = window.liveOutputMode;
    const isAttention = (mode === "attention" || mode === "black");
    window.liveOutputMode = isAttention ? "attention" : mode;
    const frame = document.getElementById("livePreviewFrame");
    if (frame) frame.style.visibility = "visible";
    const blackout = document.getElementById("attentionOverlay") || document.getElementById("blackoutOverlay");
    if (blackout) blackout.classList.toggle("hidden", !isAttention);
    const logo = document.getElementById("logoOverlay");
    if (logo) logo.classList.toggle("hidden", mode !== "logo");
    const states = { logo: "logoSplitWrap", attention: "attentionSplitWrap", black: "attentionSplitWrap" };
    Object.keys(states).forEach((key) => {
      const btn = document.getElementById(states[key]);
      if (btn) {
        const isActive = (window.liveOutputMode === key) || (isAttention && (key === "attention" || key === "black"));
        btn.style.outline = isActive ? "2px solid #7c3aed" : "";
      }
    });
    // Logo and Attention modes also drive the real projector (and the sidebar engine
    // frame, which runs the same page): entering projects the custom screen,
    // leaving restores the last live content. If no projection is active, the
    // projector is opened first so the screen has somewhere to go.
    if (mode === "logo") {
      stopAttentionChime();
      window.p_logo_mode = true;
      window.p_attention_mode = false;
      loadLogoScreenConfig();
      renderLogoOverlay();
      if (typeof presentWindowOpen !== "undefined" && !presentWindowOpen && typeof presentation === "function") {
        presentation();
        window.p_logo_mode = true;
      }
      refreshProjectorEngine();
      pushSidebarPreview();
    } else if (isAttention) {
      window.p_logo_mode = false;
      window.p_attention_mode = true;
      loadAttentionScreenConfig();
      renderAttentionOverlay();
      if (typeof presentWindowOpen !== "undefined" && !presentWindowOpen && typeof presentation === "function") {
        presentation();
        window.p_attention_mode = true;
      }
      refreshProjectorEngine();
      pushSidebarPreview();
      if (window.p_attention_play_chime !== false) {
        playAttentionChime();
      }
    } else {
      stopAttentionChime();
      window.p_logo_mode = false;
      window.p_attention_mode = false;
      // Push the projector + preview whenever the visible output may
      // differ: entering attention/clear, leaving any overlay state, or
      // switching directly between states. (Plain live->live presents push
      // through their own paths, so they are skipped here.)
      if (mode !== "live" || prev === "logo" || prev === "black" || prev === "attention") {
        refreshProjectorEngine();
        pushSidebarPreview();
      }
    }
    if (!silent) sizeSidebarPreview();
  } catch (e) {}
}

// Toolbar: Clear Text / Logo / Attention. Clicking the active state
// restores the live content.
function toggleOutputState(mode) {
  try {
    const isAttention = (mode === "attention" || mode === "black");
    const isCurrentActive = isAttention
      ? (window.liveOutputMode === "attention" || window.liveOutputMode === "black")
      : (window.liveOutputMode === mode);

    if (isCurrentActive) {
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

    // Broadcast current slide update to remote guests in Green Room
    if (window.liveStudio && window.liveStudio.socket && window.liveStudio.socket.readyState === WebSocket.OPEN) {
      try {
        const ms = window.liveMonitorState || {};
        const displayTitle = (ms.reference || ms.indicator || ms.primary || '').replace(/<[^>]+>/g, ' ').trim();
        window.liveStudio.socket.send(JSON.stringify({
          type: 'program-update',
          programState: { title: displayTitle }
        }));
      } catch (err) {}
    }
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
    if (t === "readings") {
      const st = (typeof window !== "undefined" && window.liveReadingState) ? window.liveReadingState : null;
      if (!st || !st.slides || !st.slides.length) return off;
      const idx = st.index || 0;
      return { canPrev: idx > 0, canNext: idx < st.slides.length - 1 };
    }
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
  window.isAdvancingSlide = true;
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
    if (t === "readings") {
      if (typeof window !== "undefined" && window.readingNavObj) {
        return dir < 0 ? Boolean(window.readingNavObj.prevSlide()) : Boolean(window.readingNavObj.nextSlide());
      }
      return false;
    }
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
      return stepLiveSong(dir, true);
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
  } finally {
    setTimeout(() => { window.isAdvancingSlide = false; }, 120);
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
if (typeof window !== "undefined") {
  window.nextSlide = call_nextSlide;
  window.prevSlide = call_prevSlide;
}

// Determines if Bible verses / scripture are actively presented.
function isLiveVerseActive() {
  try {
    const live = ((typeof presentWindowOpen !== "undefined") && !!presentWindowOpen) ||
                 (typeof window !== "undefined" && !!window.presentWindowOpen);
    if (!live) return false;
    const progActive = (typeof window !== "undefined" && !!window.liveProgramActive);
    const pm = (typeof window !== "undefined" && window.programManager) ? window.programManager : null;
    if (progActive && pm &&
        typeof pm.presentedItemIndex === "number" && pm.presentedItemIndex >= 0 &&
        Array.isArray(pm.items) && pm.presentedItemIndex < pm.items.length) {
      const item = pm.items[pm.presentedItemIndex];
      return !!(item && item.type === "scripture");
    }
    const t = (typeof window !== "undefined" && window.liveProjectionType) || null;
    const canon = (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.resolveProjectionContext === "function")
      ? window.themeManager.resolveProjectionContext(t)
      : t;
    return canon === "verses";
  } catch (e) {
    return false;
  }
}

// Dedicated verse navigation entry points (verses only - does not advance songs/program items).
function call_nextVerse() {
  try {
    if (!isLiveVerseActive()) return false;
    const progActive = (typeof window !== "undefined" && !!window.liveProgramActive);
    const pm = (typeof window !== "undefined" && window.programManager) ? window.programManager : null;
    if (progActive && pm &&
        typeof pm.presentedItemIndex === "number" && pm.presentedItemIndex >= 0 &&
        Array.isArray(pm.items) && pm.presentedItemIndex < pm.items.length) {
      if (typeof pm.programNavAllowed === "function" && !pm.programNavAllowed(1)) return false;
      if (typeof pm.nextSlide === "function") { pm.nextSlide(); return true; }
      return false;
    }
    if (typeof processNextButton === "function") {
      processNextButton();
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

function call_prevVerse() {
  try {
    if (!isLiveVerseActive()) return false;
    const progActive = (typeof window !== "undefined" && !!window.liveProgramActive);
    const pm = (typeof window !== "undefined" && window.programManager) ? window.programManager : null;
    if (progActive && pm &&
        typeof pm.presentedItemIndex === "number" && pm.presentedItemIndex >= 0 &&
        Array.isArray(pm.items) && pm.presentedItemIndex < pm.items.length) {
      if (typeof pm.programNavAllowed === "function" && !pm.programNavAllowed(-1)) return false;
      if (typeof pm.previousSlide === "function") { pm.previousSlide(); return true; }
      return false;
    }
    if (typeof processPrevButton === "function") {
      processPrevButton();
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

if (typeof window !== "undefined") {
  window.isLiveVerseActive = isLiveVerseActive;
  window.call_nextVerse = call_nextVerse;
  window.call_prevVerse = call_prevVerse;
}

function call_closePresentation() {
  if (typeof closePresentWindow === "function") closePresentWindow();
}

// ---------------------------------------------------------------------------
// Keyboard Left and Right arrow shortcuts for Live Output Preview navigation.
// Pressing Left or Right arrow triggers previous/next slide on the live output
// preview (#monitorPrevBtn / #monitorNextBtn -> navPrevVerse() / navNextVerse()).
// Does not intercept when typing inside text inputs, textareas, selects, or editable fields,
// nor when modal dialogs or Settings overlay are open.
// ---------------------------------------------------------------------------
if (typeof window !== "undefined" && !window._monitorKeyboardNavBound) {
  window._monitorKeyboardNavBound = true;
  document.addEventListener("keydown", function(e) {
    const isLeft = (e.key === "ArrowLeft" || e.keyCode === 37);
    const isRight = (e.key === "ArrowRight" || e.keyCode === 39);
    if (!isLeft && !isRight) return;

    // Ignore if modifier keys (Ctrl, Alt, Meta/Cmd) are pressed
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Check if user is typing in an input, textarea, select, or editable element
    const target = e.target;
    const tag = (target && target.tagName) ? target.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (target && target.isContentEditable)) {
      return;
    }
    const active = document.activeElement;
    if (active && active !== target) {
      const activeTag = (active.tagName) ? active.tagName.toUpperCase() : "";
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT" || active.isContentEditable) {
        return;
      }
    }

    // Do not intercept if Settings page is open
    const settingsEl = document.getElementById("settingsPage");
    if (settingsEl && !settingsEl.classList.contains("hidden")) return;

    // Do not intercept if any modal/dialog is open
    const openDialog = document.querySelector("dialog[open], #programItemModal, #programImportModal");
    if (openDialog) return;

    if (isLeft) {
      e.preventDefault();
      const btn = document.getElementById("monitorPrevBtn");
      if (btn && !btn.disabled) {
        btn.click();
        btn.classList.add("ring-2", "ring-brand-400");
        setTimeout(() => btn.classList.remove("ring-2", "ring-brand-400"), 120);
      } else if (!btn && typeof navPrevVerse === "function") {
        navPrevVerse();
      }
    } else if (isRight) {
      e.preventDefault();
      const btn = document.getElementById("monitorNextBtn");
      if (btn && !btn.disabled) {
        btn.click();
        btn.classList.add("ring-2", "ring-brand-400");
        setTimeout(() => btn.classList.remove("ring-2", "ring-brand-400"), 120);
      } else if (!btn && typeof navNextVerse === "function") {
        navNextVerse();
      }
    }
  });
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
      // Allow an empty pads array (0 notepad tabs) as a valid persisted state
      if (parsed && Array.isArray(parsed.pads)) {
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
    // First run or legacy data: only create "Notepad 1" if migrating non-empty legacy items;
    // otherwise start with 0 notepad tabs until the user clicks + to add one.
    let items = [];
    try {
      const legacy = localStorage.getItem("uecfi_notepad_items");
      if (legacy) items = normalizeNotepadItems(JSON.parse(legacy));
    } catch (e) {}
    window.notepadPadsData = items.length > 0
      ? { pads: [{ name: "Notepad 1", numbered: false, items: items }], active: 0 }
      : { pads: [], active: 0 };
    saveNotepadPads();
    try { localStorage.removeItem("uecfi_notepad_items"); } catch (e) {}
  } catch (e) {
    window.notepadPadsData = { pads: [], active: 0 };
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
    // Keep 0 tabs when the last notepad is deleted until the user adds a new one
    if (store.pads.length === 0) {
      store.active = 0;
    } else {
      if (store.active > idx) store.active--;
      if (store.active >= store.pads.length) store.active = store.pads.length - 1;
    }
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
    const hasPads = store.pads.length > 0;
    const activePad = hasPads ? (store.pads[store.active] || store.pads[0]) : null;
    const numbered = !!(activePad && activePad.numbered);
    const numBtn = document.getElementById("notepadNumberBtn");
    if (numBtn) {
      try {
        numBtn.style.color = numbered ? "#4f46e5" : "";
        numBtn.title = numbered ? "Hide note numbers" : "Number notes";
        numBtn.style.display = hasPads ? "" : "none";
      } catch (e) {}
    }
    const noteInputEl = document.getElementById("notepadInput");
    const noteAddBtnEl = document.getElementById("notepadAddBtn");
    if (noteInputEl) {
      noteInputEl.disabled = !hasPads;
      noteInputEl.placeholder = hasPads ? "Add a note..." : "Create a notepad (+) first...";
    }
    if (noteAddBtnEl) {
      noteAddBtnEl.disabled = !hasPads;
    }
    const countEl = document.getElementById("notepadCount");
    const listEl = document.getElementById("notepadList");
    if (!listEl) return;
    if (!hasPads) {
      if (countEl) countEl.textContent = "";
      listEl.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">Click <b>+</b> above to create a notepad.</div>';
      return;
    }
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
    const store = loadNotepadPads();
    if (!store.pads || store.pads.length === 0) {
      addNotepadPad();
      return;
    }
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
function stepLiveSong(dir, fromMonitor = false) {
  if (!fromMonitor && window.isAdvancingSlide) return false;
  window.isAdvancingSlide = true;
  try {
    const st = window.liveSongState;
    if (!st || !st.slides || !st.slides.length) return false;
    const len = st.slides.length;
    const cur = st.index || 0;
    let idx = cur + (dir < 0 ? -1 : 1);
    if (idx < 0) idx = 0;
    if (idx > len - 1) idx = len - 1;
    if (idx === cur) return false;
    const songObj = {
      slides: st.slides,
      name: st.title,
      font: st.font,
      copyright: st.copyright,
      audio: st.audio || "",
      lyrics: st.lyrics || ""
    };
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
  } finally {
    setTimeout(() => { window.isAdvancingSlide = false; }, 120);
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
    if (window.liveStudio && typeof window.liveStudio.syncStageVideoToWindow === "function") {
      window.liveStudio.syncStageVideoToWindow(win, true);
    }
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
