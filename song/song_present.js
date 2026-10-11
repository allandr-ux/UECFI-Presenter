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
    // A song present supersedes any schedule highlight and any live program
    window.presentedScheduleId = null;
    if (typeof window !== "undefined") window.liveProgramActive = false;
    if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
    if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();
    
    if (slideIndex == null) {
      p_current_index = 0;
    } else {
      p_current_index = slideIndex;
    }
    p_last_index = activeSong.slides.length - 1;

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
          index: liveIdx
        };
      }
    } catch (e) {}

    presentation();

    try {
      const idx = (slideIndex == null) ? 0 : slideIndex;
      if (typeof setLiveMonitorContent === "function") {
        const slides = activeSong.slides || [];
        setLiveMonitorContent({
          primary: slides[idx],
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