/**
 * Song Presenter Controller
 * 
 * Handles formatting and pushing song slides to projection.
 * Styling is driven exclusively by ThemeManager ("songs" context).
 */
function songPresentObj() {
  this.init = initSong;
  this.present = presentSong;
  let activeSong = new songObj();

  function initSong(songInstance) {
    activeSong = songInstance;
  }

  function presentSong(slideIndex) {
    // Content only -- design comes exclusively from ThemeManager ("songs").
    p_text1_arr = activeSong.slides;
    p_text2_arr = createEmptyArray(activeSong.slides.length);
    p_title = activeSong.name || "";
    p_title_arr = [];
    p_footnote = activeSong.copyright || "";
    // A song present supersedes any schedule highlight, live program, and stale verse state
    window.presentedScheduleId = null;
    window.presentedVerseIndex = -1;
    window.p_dual_text1_arr = null;
    window.p_dual_text2_arr = null;
    window.p_dual_footnote = null;
    if (typeof window !== "undefined") window.liveProgramActive = false;
    if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
    if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();
    if (typeof window !== "undefined" && window.programManager && typeof window.programManager.clearPresentationHighlight === "function") {
      window.programManager.clearPresentationHighlight();
    }
    
    if (slideIndex == null) {
      p_current_index = 0;
    } else {
      p_current_index = slideIndex;
    }
    p_last_index = activeSong.slides.length - 1;

    // Song typography and styles are strictly governed by global settings (themeManager)
    if (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.applyThemeToProjection === "function") {
      window.themeManager.applyThemeToProjection("songs");
    }
    if (typeof setLiveProjectionType === "function") setLiveProjectionType("songs");

    // Record live song state BEFORE rendering: updateProjectionControls()
    // (run at the end of presentation()) and the remote nav flags read it,
    // so recording it afterwards would leave Prev/Next one step behind.
    try {
      const liveIdx = (slideIndex == null) ? 0 : slideIndex;
      if (typeof window !== "undefined") {
        window.liveSongState = {
          slides: (activeSong.slides || []).slice(),
          title: activeSong.name || "",
          font: activeSong.font || "",
          copyright: activeSong.copyright || "",
          audio: activeSong.audio || "",
          lyrics: activeSong.lyrics || "",
          index: liveIdx
        };
        // Synchronize song list and lyric card highlights regardless of how
        // presentSong() was triggered (Play button, double-click, Lyrics tab
        // Present button, lyric card click, or remote).
        window.presentedSlideIdx = liveIdx;
        if (typeof window.selectedSongIdx !== "number" || window.selectedSongIdx < 0) {
          window.selectedSongIdx = 0;
        }
        // Match activeSong by title in songDataStore if needed, else use selectedSongIdx
        let matchedIdx = window.selectedSongIdx;
        if (window.songDataStore && Array.isArray(window.songDataStore.songTitle) && activeSong.name) {
          const found = window.songDataStore.songTitle.findIndex(
            (s) => (s.Title || s.name || "").trim() === String(activeSong.name).trim()
          );
          if (found >= 0) matchedIdx = found;
        }
        window.presentedSongIdx = matchedIdx;
        window.selectedSongIdx = matchedIdx;
      }
    } catch (e) {}

    // Initialize/start audio engine first so timed lines are ready for teleprompter projection
    try {
      const idx = (slideIndex == null) ? 0 : slideIndex;
      if (typeof window !== "undefined" && window.songAudioEngine) {
        if (slideIndex == null || !window.songAudioEngine.currentSong || window.songAudioEngine.currentSong.name !== activeSong.name) {
          window.songAudioEngine.startSong(activeSong, idx);
        } else {
          window.songAudioEngine.onSlideChanged(idx);
        }
      }
    } catch (e) {}

    presentation();

    try {
      if (typeof window !== "undefined") {
        if (window.presentedSongIdx !== window._lastRenderedSongIdx) {
          window._lastRenderedSongIdx = window.presentedSongIdx;
          if (typeof window.renderModernSongList === "function") window.renderModernSongList();
        }
        if (typeof window.updateSongSlideHighlight === "function") window.updateSongSlideHighlight();
      }
    } catch (e) {}

    try {
      const idx = (slideIndex == null) ? 0 : slideIndex;
      if (typeof setLiveMonitorContent === "function") {
        const slides = activeSong.slides || [];
        const rawSlide = slides[idx] || "";
        const cleanSlide = rawSlide.replace(/\[\s*\d{1,2}:\d{2}(?:[.:]\d{1,3})?\s*\]\s*/g, "");
        setLiveMonitorContent({
          primary: cleanSlide,
          secondary: "",
          reference: activeSong.name || "",
          indicator: `Slide ${idx + 1} of ${slides.length}`
        });
      }
    } catch (e) {}
  }

  function createEmptyArray(len) {
    const arr = new Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = "";
    }
    return arr;
  }
}