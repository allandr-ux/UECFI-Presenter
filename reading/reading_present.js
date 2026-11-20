/**
 * reading_present.js
 * Controller for presenting centro readings (Doctrines, Principles, Creeds, Responsive Readings) on the live projection screen.
 */
function readingPresentObj() {
  this.init = initReading;
  this.present = presentReading;
  var activeReading = new readingObj();

  function initReading(instance) {
    activeReading = instance;
  }

  function presentReading(slideIndex) {
    if (!activeReading || !activeReading.slides || activeReading.slides.length === 0) {
      return;
    }

    p_text1_arr = activeReading.slides;
    p_text2_arr = new Array(activeReading.slides.length).fill("");
    p_title = activeReading.name || "";
    p_title_arr = [];
    p_footnote = activeReading.notes || "";

    // Clear conflicting presentations
    window.presentedScheduleId = null;
    window.presentedVerseIndex = -1;
    window.p_dual_text1_arr = null;
    window.p_dual_text2_arr = null;
    window.p_dual_footnote = null;
    if (typeof window !== "undefined") {
      window.liveProgramActive = false;
      window.liveSongState = null;
    }
    if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
    if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();
    if (typeof window.updateSongSlideHighlight === "function") window.updateSongSlideHighlight();
    if (typeof window !== "undefined" && window.programManager && typeof window.programManager.clearPresentationHighlight === "function") {
      window.programManager.clearPresentationHighlight();
    }

    if (slideIndex == null) {
      p_current_index = 0;
    } else {
      p_current_index = slideIndex;
    }
    p_last_index = activeReading.slides.length - 1;

    // Apply global theme
    if (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.applyThemeToProjection === "function") {
      // Use readings theme if defined, or fall back to clean songs theme
      window.themeManager.applyThemeToProjection("songs");
    }
    if (typeof setLiveProjectionType === "function") setLiveProjectionType("readings");

    // Track state
    try {
      const liveIdx = (slideIndex == null) ? 0 : slideIndex;
      if (typeof window !== "undefined") {
        window.liveReadingState = {
          slides: (activeReading.slides || []).slice(),
          title: activeReading.name || "",
          notes: activeReading.notes || "",
          index: liveIdx
        };
        window.presentedReadingSlideIdx = liveIdx;
      }
    } catch (e) {}

    // Call live presentation render
    presentation();
    if (typeof updateProjectionControls === "function") {
      try { updateProjectionControls(); } catch (e) {}
    }

    // Highlight active slide card in Readings preview panel
    try {
      if (typeof window !== "undefined" && typeof window.updateReadingSlideHighlight === "function") {
        window.updateReadingSlideHighlight();
      }
    } catch (e) {}

    // Update Live Monitor preview
    try {
      const idx = (slideIndex == null) ? 0 : slideIndex;
      if (typeof setLiveMonitorContent === "function") {
        const slides = activeReading.slides || [];
        setLiveMonitorContent({
          primary: slides[idx] || "",
          secondary: "",
          reference: activeReading.name || "",
          indicator: `Slide ${idx + 1} of ${slides.length}`
        });
      }
    } catch (e) {}
  }
}

if (typeof window !== "undefined") {
  window.readingPresentObj = readingPresentObj;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { readingPresentObj };
}
