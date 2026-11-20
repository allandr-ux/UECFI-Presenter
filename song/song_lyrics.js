/**
 * Song Lyrics Card Renderer
 * 
 * Renders individual lyric slide cards in the Song Preview panel (#ly_slide)
 * and Schedule preview panel.
 * 
 * Automatically hides synchronization timestamps (e.g. [00:17.10]) from the
 * preview cards so operators see clean, readable lyrics, while preserving the
 * underlying timestamps in the song object for audio sync during presentation.
 */
function songLyricsClass() {
  this.init = c;
  var d = null;
  var a = null;
  var e = 0;

  function stripTimestamps(text) {
    if (!text) return "";
    return String(text).replace(/\[\s*\d{1,2}:\d{2}(?:[.:]\d{1,3})?\s*\]\s*/g, "");
  }

  function c(g, f, h) {
    d = g;
    a = f;
    e = h;
    var rawText = (d && d.slides && d.slides[e]) ? d.slides[e] : "";
    var cleanText = stripTimestamps(rawText);
    var i = '<a href="#">' + cleanText + "</a>";
    var el = document.getElementById(a);
    if (el) {
      el.innerHTML = i;
      el.addEventListener("click", b, false);
    }
  }

  function b() {
    var f = new songPresentObj();
    f.init(d);
    f.present(e);
  }
}
