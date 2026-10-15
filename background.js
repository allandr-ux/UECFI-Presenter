/**
 * Legacy Background Compatibility Shim
 * 
 * The legacy Graphics tab has been completely deprecated in favor of the modern Theme Designer (theme_manager.js).
 * This shim ensures backwards compatibility for any legacy callers without throwing runtime errors.
 */
var bkgndIndex = 0;
var textColorHEX = "FFFFFF";

var bkgnd = {
  selectedIndex: 0,
  newSelectedIndex: -1,
  name: [],
  filename: [],
  numofPicsInRow: 4,
  init() {},
  getBkgndFilename() {
    return "./background/UECFI.png";
  },
  loadList() {},
  fill() {},
  showBrowse() {},
  delBkgnd() {}
};

function cp() {
  this.init = function() {};
  this.cp_reset = function() {};
}
