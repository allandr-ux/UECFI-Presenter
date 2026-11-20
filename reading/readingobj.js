/**
 * readingobj.js
 * Data model representing a centro Reading (Doctrines, Principles, Creeds, Responsive Readings).
 * Provides a clean object structure without music-specific properties.
 */
function readingObj() {
  this.init = init;
  this.id = null;
  this.catIndex = "Doctrines";
  this.name = "";
  this.font = "";
  this.bkgnd_fname = "";
  this.notes = "";
  this.slides = [];
  this.lyrics = ""; // Raw text representation for serialization and export

  function init() {
    this.id = null;
    this.catIndex = "Doctrines";
    this.name = "";
    this.font = "";
    this.bkgnd_fname = "";
    this.notes = "";
    this.slides = [];
    this.lyrics = "";
  }
}

if (typeof window !== "undefined") {
  window.readingObj = readingObj;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { readingObj };
}
