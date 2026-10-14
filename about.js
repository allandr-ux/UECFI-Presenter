/**
 * About dialog: app version, developer, and website.
 * Opened from the Help menu (menu/menu.xml -> showAboutDialog).
 */
function getAppVersion() {
  try {
    if (typeof require === "function") {
      const path = require("path");
      const pkg = require(path.join(process.cwd(), "package.json"));
      if (pkg && pkg.version) return String(pkg.version);
    }
  } catch (e) {}
  return "1.0.0";
}
function openUecfiWebsite() {
  try {
    if (window.electronBridge && typeof window.electronBridge.openExternal === "function") {
      window.electronBridge.openExternal("https://uecfi.net");
      return;
    }
  } catch (e) {}
  try {
    window.open("https://uecfi.net", "_blank");
  } catch (e) {}
}
window.aboutModal = null;
function showAboutDialog() {
  try {
    if (typeof AppUI === "undefined" || !AppUI.Modal) return;
    if (!window.aboutModal) {
      window.aboutModal = new AppUI.Modal("aboutDialog");
      window.aboutModal.render();
    }
    window.aboutModal.setHeader("About UECFI Presenter");
    window.aboutModal.setBody(
      `<div class="flex flex-col items-center text-center gap-1.5 py-2">`
      + `<img src="uecfi-logo.png" alt="UECFI logo" style="width:120px;max-width:60%;object-fit:contain;margin-bottom:6px;">`
      + `<div class="text-lg font-bold text-slate-900">UECFI Presenter</div>`
      + `<div class="text-xs text-slate-500">Version ${getAppVersion()}</div>`
      + `<div class="text-xs text-slate-600 mt-2">Developed by <span class="font-bold text-slate-800">Kurog</span></div>`
      + `<a href="#" onclick="if(typeof openUecfiWebsite==='function') openUecfiWebsite(); return false;" class="text-xs font-semibold text-brand-600 hover:text-brand-700 mt-1">uecfi.net</a>`
      + `</div>`
    );
    window.aboutModal.show();
  } catch (e) {}
}
