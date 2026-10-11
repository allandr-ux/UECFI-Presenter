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
    p_text1_arr = activeSong.slides;
    p_text2_arr = createEmptyArray(activeSong.slides.length);
    p_text1_font = activeSong.font || "Arial";
    p_text2_font = activeSong.font || "Arial";
    p_title = activeSong.name || "";
    p_footnote = activeSong.copyright || "";
    
    if (slideIndex == null) {
      p_current_index = 0;
    } else {
      p_current_index = slideIndex;
    }
    p_last_index = activeSong.slides.length - 1;

    // Clean defaults before ThemeManager applies user-defined theme
    p_bkgnd_filename = "./background/lens.jpg";
    p_bkgnd_color = "black";
    p_font_color = "#FFFFFF";
    p_ver1ScaleFactor = 2;
    p_ver2ScaleFactor = 2;

    if (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.applyThemeToProjection === "function") {
      window.themeManager.applyThemeToProjection("songs");
    }

    presentation();
  }

  function createEmptyArray(len) {
    const arr = new Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = "";
    }
    return arr;
  }
}