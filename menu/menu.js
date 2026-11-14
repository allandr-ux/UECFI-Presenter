function song_new_menu(a){if(songNavObj!=null){songNavObj.sn_newSong()}}function song_edit_menu(a){if(songNavObj!=null){songNavObj.sn_editSong()}}function song_delete_menu(a){if(songNavObj!=null){songNavObj.sn_deleteSong()}}function song_delete_cat_menu(a){if(songNavObj!=null){songNavObj.sn_deleteSongByCat()}}function songDB_Export_all_db(){songNavObj.processExportSongDB()}function songDB_Export_all_xml(){songManagerObj.processExportSongXML()}function songDB_Export_cat_xml(){songManagerObj.processExportCatXML()}function songDB_Export_single_xml(){if(songManagerObj&&songManagerObj.processExportSingleSongXML){songManagerObj.processExportSingleSongXML()}}function songDB_Import_db(){songManagerObj.processImportSongDB()}function songDB_Import_xml(){songManagerObj.processImportSongXML()}function setup_bible_version(){bibleVersionSelObj.show()}function show_bible_manage(){manageVersion()}function remoteVV_UI(){remoteVV_UI_Obj.show()}function show_present_setup_UI(){setup_present_UI_Obj.show()}function show_updateVV_UI(){updateVV_UI_Obj.show()}function uecfipresenterExit(){processExit();window.close()}function addBkgndMenu(){bkgnd.showBrowse()}function deleteBkgndMenu(){bkgnd.delBkgnd()}function resetFGMenu(){cpObj.cp_reset()}function showHelp_menu(){helpObj.showHelp()}function vvPromote_menu1(){promoteVV(1)}function vvPromote_menu2(){promoteVV(2)};

function program_add_item_menu() {
  if (typeof window !== "undefined" && window.programManager && typeof window.programManager.openItemModal === "function") {
    window.programManager.openItemModal(-1);
  }
}
function program_clear_menu() {
  if (typeof window !== "undefined" && window.programManager && typeof window.programManager.clearAllItems === "function") {
    window.programManager.clearAllItems();
  }
}
function program_export_menu() {
  if (typeof window !== "undefined" && window.programManager && typeof window.programManager.exportProgram === "function") {
    window.programManager.exportProgram();
  }
}
function program_export_single_menu() {
  if (typeof window !== "undefined" && window.programManager && typeof window.programManager.exportSingleItem === "function") {
    window.programManager.exportSingleItem();
  }
}
function program_import_menu() {
  if (typeof window !== "undefined" && window.programManager && typeof window.programManager.importProgram === "function") {
    window.programManager.importProgram();
  }
}
