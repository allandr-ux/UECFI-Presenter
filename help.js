function vvhelpClass() {
  this.init = f;
  this.showHelp = d;
  let c = null;
  let a = null;
  function f(g) {
    c = g;
    e();
  }
  function e() {
    a = new AppUI.Modal("panelObjh");
    a.render(document.body);
    a.setHeader("UECFI Presenter Help");
    a.setBody(c);
    a.hide();
  }
  function d() {
    a.show();
  }
  function b() {
    a.hide();
  }
}
function openExternalURL(url) {
  const targetUrl = url || "https://github.com";
  // Route external links through preload's electronBridge first so renderer
  // code stays decoupled from direct Electron module requires.
  try {
    if (typeof window !== "undefined" && window.electronBridge && typeof window.electronBridge.openExternal === "function") {
      window.electronBridge.openExternal(targetUrl);
      return;
    }
    if (typeof require === "function") {
      const { shell } = require("electron");
      if (shell && shell.openExternal) {
        shell.openExternal(targetUrl);
        return;
      }
    }
  } catch (e) {}
  window.open(targetUrl, "_blank");
}
