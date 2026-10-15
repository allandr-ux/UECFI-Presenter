/**
 * Startup toast inviting the operator to install the companion
 * Android remote app. Shows on every launch unless dismissed
 * permanently via "Don't show again" (localStorage).
 */
var REMOTE_APP_APK_URL = "https://downloads.uecfi.net/Apps/uecfi-remote.apk";
var REMOTE_TOAST_HIDE_KEY = "uecfi_hide_remote_toast";

function shouldShowRemoteToast() {
  try {
    return localStorage.getItem(REMOTE_TOAST_HIDE_KEY) !== "1";
  } catch (e) {
    return true;
  }
}
function setRemoteToastHidden(hidden) {
  try {
    if (hidden) localStorage.setItem(REMOTE_TOAST_HIDE_KEY, "1");
    else localStorage.removeItem(REMOTE_TOAST_HIDE_KEY);
  } catch (e) {}
}
function closeRemoteToast() {
  try {
    const el = document.getElementById("remoteAppToast");
    if (el) el.remove();
  } catch (e) {}
}
function downloadRemoteApp() {
  try {
    if (window.electronBridge && typeof window.electronBridge.openExternal === "function") {
      window.electronBridge.openExternal(REMOTE_APP_APK_URL);
    } else {
      window.open(REMOTE_APP_APK_URL, "_blank");
    }
  } catch (e) {}
  closeRemoteToast();
}
function maybeShowRemoteToast() {
  try {
    if (!shouldShowRemoteToast()) return;
    if (document.getElementById("remoteAppToast")) return;
    setTimeout(showRemoteToast, 1500);
  } catch (e) {}
}
function showRemoteToast() {
  try {
    if (!shouldShowRemoteToast()) return;
    if (document.getElementById("remoteAppToast")) return;
    const el = document.createElement("div");
    el.id = "remoteAppToast";
    el.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9999;width:300px;max-width:calc(100vw - 32px);background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 32px rgba(2,6,23,0.25);padding:14px;font-family:Inter,Arial,sans-serif;";
    el.innerHTML =
      `<button type="button" onclick="if(typeof closeRemoteToast==='function') closeRemoteToast();" title="Close" style="position:absolute;top:8px;right:8px;background:none;border:0;cursor:pointer;color:#94a3b8;font-size:14px;line-height:1;padding:4px;"><i class="fa-solid fa-xmark"></i></button>`
      + `<div style="display:flex;gap:10px;align-items:flex-start;">`
      + `<div style="width:40px;height:40px;flex:none;border-radius:12px;background:#7c3aed;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;"><i class="fa-brands fa-android"></i></div>`
      + `<div style="min-width:0;">`
      + `<div style="font-size:13px;font-weight:700;color:#0f172a;">Control slides from your phone</div>`
      + `<div style="font-size:11px;color:#64748b;margin-top:2px;">Get the UECFI Remote app for Android.</div>`
      + `</div></div>`
      + `<button type="button" onclick="if(typeof downloadRemoteApp==='function') downloadRemoteApp();" style="display:block;width:100%;margin-top:10px;padding:8px;border:0;border-radius:8px;background:#7c3aed;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Download Android App</button>`
      + `<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:#64748b;cursor:pointer;user-select:none;"><input type="checkbox" id="remoteToastOptOut" onchange="if(typeof setRemoteToastHidden==='function') setRemoteToastHidden(this.checked);" style="accent-color:#7c3aed;"> Don't show again</label>`;
    document.body.appendChild(el);
  } catch (e) {}
}
