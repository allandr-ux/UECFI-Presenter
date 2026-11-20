/**
 * reading_slides.js
 * Renders individual slide cards in the Readings Preview panel (#rd_slide).
 * Handles click-to-present for reading slides.
 */
function readingSlidesClass() {
  var reading = null;
  var containerId = null;
  var slideIndex = 0;

  this.init = function(rObj, elementId, index) {
    reading = rObj;
    containerId = elementId;
    slideIndex = index;

    var rawText = (reading && reading.slides && reading.slides[slideIndex]) ? reading.slides[slideIndex] : "";
    var el = document.getElementById(containerId);
    if (el) {
      el.innerHTML = '<a href="#">' + rawText + '</a>';
      el.addEventListener("click", onClick, false);
    }
  };

  function onClick() {
    if (typeof readingPresentObj !== "undefined") {
      var p = new readingPresentObj();
      p.init(reading);
      p.present(slideIndex);
    }
  }
}

if (typeof window !== "undefined") {
  window.readingSlidesClass = readingSlidesClass;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { readingSlidesClass };
}
