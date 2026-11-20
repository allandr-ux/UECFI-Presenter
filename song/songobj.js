function songObj() {
  this.init = init;
  this.id = null;
  this.catIndex = "";
  this.name = "";
  this.font = "";
  this.bkgnd_fname = "";
  this.key = "";
  this.copyright = "";
  this.notes = "";
  this.slides = [];
  this.audio = "";
  this.lyrics = "";
  this.teleprompterFontSize = null;
  this.leadAdvanceMs = 0;
  this.activeOutlineEnabled = false;
  this.activeOutlineColor = "#000000";
  this.activeOutlineThickness = 2;

  function init() {
    this.id = null;
    this.catIndex = "";
    this.name = "";
    this.font = "";
    this.bkgnd_fname = "";
    this.key = "";
    this.copyright = "";
    this.notes = "";
    this.slides = [];
    this.audio = "";
    this.lyrics = "";
    this.teleprompterFontSize = null;
    this.leadAdvanceMs = 0;
    this.activeOutlineEnabled = false;
    this.activeOutlineColor = "#000000";
    this.activeOutlineThickness = 2;
  }
}
