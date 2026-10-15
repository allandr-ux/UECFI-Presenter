let portNumber = 50000;
let IPList = null;
// Numeric helpers for remote-port validation (toggleRemoteVV depends on them).
function IsNumeric(s) {
  if (s === null || s === undefined) return false;
  const t = String(s).trim();
  return t !== "" && !isNaN(t) && isFinite(Number(t));
}
function withinRange(min, max, v) {
  const n = Number(v);
  return isFinite(n) && n >= min && n <= max;
}
/**
 * Loads configuration settings asynchronously using AppStorage.
 * Gracefully falls back to fetch if AppStorage is not ready.
 */
async function loadConfig() {
  // Live settings live in storage/xml/config.xml; the shipped file is only
  // a first-run fallback (same split-brain that hid uploaded bibles).
  const candidates = [];
  if (typeof AppStorage !== "undefined" && AppStorage.resolveStoragePath) {
    candidates.push(AppStorage.resolveStoragePath("xml", "config.xml"));
  }
  candidates.push("./xml/config.xml");
  try {
    let xmlText = "";
    let lastErr = null;
    for (const configFile of candidates) {
      try {
        if (typeof AppStorage !== "undefined" && AppStorage.readFile) {
          xmlText = await AppStorage.readFile(configFile);
        } else {
          const res = await fetch(configFile);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          xmlText = await res.text();
        }
        if (xmlText) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!xmlText) throw lastErr || new Error("config.xml not found");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    const a = xmlDoc.documentElement;
    if (!a) return;

    version1 = a.getElementsByTagName("version1")[0]?.textContent || "1";
    version2 = a.getElementsByTagName("version2")[0]?.textContent || "2";
    bkgndIndex = a.getElementsByTagName("bkgndIndex")[0]?.textContent || "0";
    p_topMargin = a.getElementsByTagName("topMargin")[0]?.textContent || "10";
    p_bottomMargin = a.getElementsByTagName("bottomMargin")[0]?.textContent || "10";
    p_leftMargin = a.getElementsByTagName("leftMargin")[0]?.textContent || "10";
    p_rightMargin = a.getElementsByTagName("rightMargin")[0]?.textContent || "10";

    const singleVerVal = a.getElementsByTagName("singleVersion")[0]?.textContent;
    singleVersion = (singleVerVal !== "false");

    const navDualVal = a.getElementsByTagName("navduallang")[0]?.textContent;
    navDualLanguage = (navDualVal !== "false");

    navFontSize = a.getElementsByTagName("navFontSize")[0]?.textContent || "14";
    selectedScreenIndex = a.getElementsByTagName("screensel")[0]?.textContent || "0";

    const maxFontNode = a.getElementsByTagName("maxFontSize")[0];
    if (maxFontNode) p_maxFontSize = maxFontNode.textContent;

    const transNode = a.getElementsByTagName("enableTransition")[0];
    p_enableTransition = (transNode ? transNode.textContent === "true" : true);

    const shadowNode = a.getElementsByTagName("enableShadow")[0];
    p_enableShadow = (shadowNode ? shadowNode.textContent === "true" : true);

    const titleNode = a.getElementsByTagName("enableTitle")[0];
    p_showTitle = (titleNode ? titleNode.textContent === "true" : true);

    const textColorNode = a.getElementsByTagName("textColorHEX")[0];
    if (textColorNode && textColorNode.textContent) {
      textColorHEX = textColorNode.textContent;
      p_font_color = textColorHEX;
    }
  } catch (err) {
    console.warn("[CONFIG] Error loading config.xml asynchronously:", err);
  }
}
function generateConfigXML() {
  let a = "";
  a = `${a}<?xml version="1.0" encoding="ISO-8859-1"?>\n`;
  a = `${a}<configuration>\n`;
  a = `${a}  <version1>${version1}</version1>\n`;
  a = `${a}  <version2>${version2}</version2>\n`;
  const savedBkgndIdx = (typeof bkgnd !== "undefined" && bkgnd && bkgnd.selectedIndex != null) ? bkgnd.selectedIndex : 0;
  a = `${a}  <bkgndIndex>${savedBkgndIdx}</bkgndIndex>\n`;
  a = `${a}  <topMargin>${p_topMargin}</topMargin>\n`;
  a = `${a}  <bottomMargin>${p_bottomMargin}</bottomMargin>\n`;
  a = `${a}  <leftMargin>${p_leftMargin}</leftMargin>\n`;
  a = `${a}  <rightMargin>${p_rightMargin}</rightMargin>\n`;
  a = `${a}  <singleVersion>${singleVersion}</singleVersion>\n`;
  a = `${a}  <navduallang>${navDualLanguage}</navduallang>\n`;
  a = `${a}  <navFontSize>${navFontSize}</navFontSize>\n`;
  a = `${a}  <screensel>${selectedScreenIndex}</screensel>\n`;
  a = `${a}  <maxFontSize>${p_maxFontSize}</maxFontSize>\n`;
  a = `${a}  <enableTransition>${p_enableTransition}</enableTransition>\n`;
  a = `${a}  <enableShadow>${p_enableShadow}</enableShadow>\n`;
  a = `${a}  <enableTitle>${p_showTitle}</enableTitle>\n`;
  a = `${a}  <textColorHEX>${textColorHEX}</textColorHEX>\n`;
  a = `${a}</configuration>\n`;
  return a;
}
function saveConfigXML() {
  const a = generateConfigXML();
  const b = AppStorage.resolveStoragePath("xml", "config.xml");
  save2file(a, b, false);
}
function configInit() {
  // Every lookup is guarded: a single missing element (e.g. a settings
  // modal body that failed to load) must never abort init and leave the
  // remote Enable button without its click handler.
  const on = (id, evt, fn) => {
    try {
      const el = document.getElementById(id);
      if (el && typeof fn === "function") el.addEventListener(evt, fn);
    } catch (e) {}
  };
  const setVal = (id, v) => {
    try {
      const el = document.getElementById(id);
      if (el) el.value = v;
    } catch (e) {}
  };
  const setChecked = (id, v) => {
    try {
      const el = document.getElementById(id);
      if (el) el.checked = !!v;
    } catch (e) {}
  };
  const extFn = (name) => {
    try {
      if (typeof window !== "undefined" && typeof window[name] === "function") return window[name];
      if (typeof eval(name) === "function") return eval(name);
    } catch (e) {}
    return null;
  };
  on("navDualLanguageID", "click", extFn("updateVerseContainer"));
  on("singleVersionBoxID", "click", extFn("processSingleVersion"));
  on("presentConfigSaveButton", "click", extFn("savePresentationMargin"));
  setVal("presentConfigMarginTop", (typeof p_topMargin !== "undefined") ? p_topMargin : "");
  setVal("presentConfigMarginBottom", (typeof p_bottomMargin !== "undefined") ? p_bottomMargin : "");
  setVal("presentConfigMarginLeft", (typeof p_leftMargin !== "undefined") ? p_leftMargin : "");
  setVal("presentConfigMarginRight", (typeof p_rightMargin !== "undefined") ? p_rightMargin : "");
  setVal("presentConfigMaxFontSize", (typeof p_maxFontSize !== "undefined") ? p_maxFontSize : "");
  setChecked("presentConfigEnableTransition", (typeof p_enableTransition !== "undefined") && p_enableTransition);
  setChecked("presentConfigEnableSongTitle", (typeof p_showTitle !== "undefined") && p_showTitle);
  setChecked("presentConfigEnableShadow", (typeof p_enableShadow !== "undefined") && p_enableShadow);
  if (typeof singleVersion !== "undefined" && singleVersion) {
    setChecked("singleVersionBoxID", true);
    try { document.getElementById("version2Menu").disabled = true; } catch (e) {}
  }
  if (typeof navDualLanguage !== "undefined") {
    setChecked("navDualLanguageID", navDualLanguage);
  }
  try { fillIP_address(); } catch (e) { console.warn("[CONFIG] fillIP_address failed:", e); }
  
  // Restore ports and sync UI
  try { syncRemoteVVStatusUI(); } catch (e) {}

  on("saveRemoteVVSettings", "click", toggleRemoteVV);
  on("remoteBtnAdd", "click", addRemoteButton);
  on("remoteSongAdd", "click", addRemoteSongButton);
  on("remoteProgAdd", "click", addRemoteProgButton);
  on("remoteSrcRefresh", "click", populateRemoteSources);
  try { renderRemoteButtons(); } catch (e) {}
  try { populateRemoteSources(); } catch (e) {}
  try { if (typeof getScreenList === "function") getScreenList(); } catch (e) {}
  try { if (typeof fillScreenList === "function") fillScreenList(); } catch (e) {}
  try { if (typeof addScreenSelectionEvent === "function") addScreenSelectionEvent(); } catch (e) {}
  try {
    const FS = (typeof fontSizeSlider !== "undefined") ? fontSizeSlider : null;
    if (FS) { const b = new FS(); b.init(); }
  } catch (e) {}
  try {
    const VU = (typeof vvupdate !== "undefined") ? vvupdate : null;
    if (VU) { const a = new VU(); a.init(); }
  } catch (e) {}
}
function fillIP_address() {
  try { clearSelectList("configIPaddr"); } catch (e) {}
  IPList = null;
  try { IPList = remoteVV_IPList(); } catch (e) { IPList = null; }
  // Never leave the list empty: fall back to localhost so the Enable
  // button stays usable even when no LAN interface is detected.
  if (!IPList || IPList.length === 0) IPList = ["127.0.0.1"];
  let sel = null;
  try { sel = document.getElementById("configIPaddr"); } catch (e) { sel = null; }
  if (!sel) return;
  try {
    for (let i = 0; i < IPList.length; i++) {
      sel.options[i] = new Option(
        IPList[i],
        i,
      );
    }
    sel.selectedIndex = 0;
  } catch (e) {}
}
function getSelected_IP_address() {
  try {
    const sel = document.getElementById("configIPaddr");
    if (!sel) return (IPList && IPList.length > 0) ? IPList[0] : false;
    const a = sel.selectedIndex;
    if (a != null && IPList && IPList[a]) {
      return IPList[a];
    }
    return (IPList && IPList.length > 0) ? IPList[0] : false;
  } catch (e) {
    return false;
  }
}
function remoteCfgVal(id) {
  try {
    const el = document.getElementById(id);
    return el ? String(el.value).trim() : "";
  } catch (e) { return ""; }
}
function remoteCfgSet(id, prop, val) {
  try {
    const el = document.getElementById(id);
    if (el) el[prop] = val;
  } catch (e) {}
}
// Re-reads the live server state into the Remote Access modal (button
// label, field locks, status URLs). Called at init AND every time the
// modal opens, so it can never show a stale status.
function syncRemoteVVStatusUI() {
  try {
    // Local guarded setter: the setVal helper lives inside configInit()
    // and is not visible at module scope (that scoping gap is exactly what
    // used to abort this sync with a silent ReferenceError).
    const setV = (id, v) => {
      try {
        const el = document.getElementById(id);
        if (el) el.value = v;
      } catch (e) {}
    };
    const pp = localStorage.getItem("remoteVVPresenterPort");
    if (pp) setV("configPresenterPort", pp);
    const ap = localStorage.getItem("remoteVVAudiencePort");
    if (ap) setV("configAudiencePort", ap);

    if (typeof webServerObj !== "undefined" && webServerObj && typeof webServerObj.remoteVVStatus === "function") {
      if (webServerObj.remoteVVStatus()) {
        remoteCfgSet("saveRemoteVVSettings", "value", " Disable Remote Access ");
        remoteCfgSet("configPresenterPort", "disabled", true);
        remoteCfgSet("configAudiencePort", "disabled", true);
        remoteCfgSet("configIPaddr", "disabled", true);
        refreshRemoteVVStatus();
      } else {
        remoteCfgSet("saveRemoteVVSettings", "value", " Enable Remote Access ");
        try { document.getElementById("remoteVVStatus").innerHTML = "Remote Access Disabled"; } catch (e) {}
        remoteCfgSet("configPresenterPort", "disabled", false);
        remoteCfgSet("configAudiencePort", "disabled", false);
        remoteCfgSet("configIPaddr", "disabled", false);
      }
    }
  } catch (e) {}
}
let presenterPortNumber = 50000;
let audiencePortNumber = 50001;
function toggleRemoteVV() {
  if (typeof webServerObj === "undefined" || !webServerObj || typeof webServerObj.remoteVVStatus !== "function") {
    alert("Remote server module not loaded. Please restart the app.");
    return;
  }
  if (webServerObj.remoteVVStatus() == false) {
    const pp = remoteCfgVal("configPresenterPort");
    const ap = remoteCfgVal("configAudiencePort");
    const c = getSelected_IP_address();
    if (!IsNumeric(pp) || !IsNumeric(ap)) {
      alert("Invalid Port Number. Valid range is 49152 to 65535.");
      remoteCfgSet("configPresenterPort", "value", presenterPortNumber);
      remoteCfgSet("configAudiencePort", "value", audiencePortNumber);
      return;
    }
    if (!withinRange(49152, 65535, pp) || !withinRange(49152, 65535, ap)) {
      alert("Port Number: Out of Range. Valid range is 49152 to 65535.");
      remoteCfgSet("configPresenterPort", "value", presenterPortNumber);
      remoteCfgSet("configAudiencePort", "value", audiencePortNumber);
      return;
    }
    if (parseInt(pp, 10) === parseInt(ap, 10)) {
      alert("Presenter and audience ports must be different.");
      return;
    }
    presenterPortNumber = pp;
    audiencePortNumber = ap;
    portNumber = pp;
    const a = webServerObj.init({ presenterPort: pp, audiencePort: ap, host: c });
    if (a) {
      localStorage.setItem("remoteVVEnabled", "true");
      localStorage.setItem("remoteVVPresenterPort", pp);
      localStorage.setItem("remoteVVAudiencePort", ap);
      remoteCfgSet("saveRemoteVVSettings", "value", " Disable Remote Access ");
      remoteCfgSet("configPresenterPort", "disabled", true);
      remoteCfgSet("configAudiencePort", "disabled", true);
      remoteCfgSet("configIPaddr", "disabled", true);
      refreshRemoteVVStatus();
    }
  } else {
    webServerObj.init();
    localStorage.setItem("remoteVVEnabled", "false");
    remoteCfgSet("saveRemoteVVSettings", "value", " Enable Remote Access ");
    try {
      document.getElementById("remoteVVStatus").innerHTML =
        "Remote Access Disabled";
    } catch (e) {}
    remoteCfgSet("configPresenterPort", "disabled", false);
    remoteCfgSet("configAudiencePort", "disabled", false);
    remoteCfgSet("configIPaddr", "disabled", false);
  }
}
function refreshRemoteVVStatus() {
  try {
    const st = webServerObj.getStatus ? webServerObj.getStatus() : null;
    const lines = [];
    if (st) {
      if (st.presenter && st.presenter.running) lines.push(`Speaker: http://${getSelected_IP_address()}:${st.presenter.port}/`);
      if (st.audience && st.audience.running) lines.push(`Audience: http://${getSelected_IP_address()}:${st.audience.port}/`);
    }
    document.getElementById("remoteVVStatus").innerHTML =
      lines.length > 0 ? lines.join("<br>") : "Remote Access Disabled";
  } catch (e) {}
}
// Speaker-remote custom buttons (dashboard side of /api/buttons)
function getRemoteButtons() {
  try {
    const raw = localStorage.getItem("uecfi_remote_buttons");
    if (!raw) return [{ label: "Blank Screen", command: "4", value: "0" }];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [{ label: "Blank Screen", command: "4", value: "0" }];
    const clean = parsed.filter(b => b && typeof b.label === "string" && b.label.trim() !== "");
    return clean.length > 0 ? clean : [{ label: "Blank Screen", command: "4", value: "0" }];
  } catch (e) {
    return [{ label: "Blank Screen", command: "4", value: "0" }];
  }
}
function saveRemoteButtons(list) {
  try {
    localStorage.setItem("uecfi_remote_buttons", JSON.stringify(list));
  } catch (e) {}
}
function renderRemoteButtons() {
  try {
    const host = document.getElementById("remoteBtnList");
    if (!host) return;
    const list = getRemoteButtons();
    if (list.length === 0) {
      host.innerHTML = "<p><i>No custom buttons yet.</i></p>";
      return;
    }
    let html = "";
    const actions = { 1: "verse", 2: "next", 3: "previous", 4: "blank", 7: "schedule", 8: "song", 9: "program" };
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    for (let i = 0; i < list.length; i++) {
      const act = actions[list[i].command] || ("cmd " + list[i].command);
      html += `<div class="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">`
        + `<span class="flex-1 min-w-0 text-xs text-slate-700 truncate"><b>${esc(list[i].label)}</b> `
        + `<span class="text-[11px] text-slate-400">(${act}${list[i].value ? ", " + esc(list[i].value) : ""})</span></span>`
        + `<input type="button" value="Delete" onclick="deleteRemoteButton(${i})" class="px-2 py-1 bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 rounded-md text-[11px] font-semibold transition cursor-pointer shrink-0"></div>`;
    }
    host.innerHTML = html;
  } catch (e) {}
}
function addRemoteButton() {
  try {
    const labelEl = document.getElementById("remoteBtnLabel");
    const cmdEl = document.getElementById("remoteBtnCommand");
    const valEl = document.getElementById("remoteBtnValue");
    const label = labelEl ? labelEl.value.trim().slice(0, 24) : "";
    const command = cmdEl ? cmdEl.value : "";
    const value = valEl ? valEl.value.trim() : "";
    if (label === "" || !/^\d+$/.test(command)) {
      alert("Give the button a label and pick an action.");
      return;
    }
    const list = getRemoteButtons();
    list.push({ label: label, command: command, value: value });
    saveRemoteButtons(list);
    if (labelEl) labelEl.value = "";
    if (valEl) valEl.value = "";
    renderRemoteButtons();
  } catch (e) {}
}
function deleteRemoteButton(idx) {
  try {
    const list = getRemoteButtons();
    if (idx >= 0 && idx < list.length) {
      list.splice(idx, 1);
      saveRemoteButtons(list.length > 0 ? list : [{ label: "Blank Screen", command: "4", value: "0" }]);
      renderRemoteButtons();
    }
  } catch (e) {}
}
// Song / program pickers for one-tap remote buttons. Songs resolve by
// stable song id (command 8), program items by stable item id (command 9).
function getRemoteSongList() {
  try {
    if (typeof songManagerObj !== "undefined" && songManagerObj &&
        typeof songManagerObj.getAllSongs === "function") {
      const list = songManagerObj.getAllSongs();
      if (Array.isArray(list)) return list.filter(s => s && s.name);
    }
  } catch (e) {}
  return [];
}
function getRemoteProgList() {
  try {
    const pm = (typeof programManager !== "undefined") ? programManager :
      ((typeof window !== "undefined" && window.programManager) ? window.programManager : null);
    if (pm && Array.isArray(pm.items)) return pm.items.filter(it => it && it.title);
  } catch (e) {}
  return [];
}
function fillRemoteSelect(id, items, labelFn, valueFn, emptyText) {
  try {
    const sel = document.getElementById(id);
    if (!sel) return;
    try { clearSelectList(id); } catch (e) {}
    if (!items || items.length === 0) {
      sel.options[0] = new Option(emptyText, "");
      sel.selectedIndex = 0;
      return;
    }
    for (let i = 0; i < items.length; i++) {
      sel.options[i] = new Option(labelFn(items[i]), valueFn(items[i]));
    }
    sel.selectedIndex = 0;
  } catch (e) {}
}
function populateRemoteSources() {
  fillRemoteSelect("remoteSongPick", getRemoteSongList(),
    s => String(s.name).slice(0, 40), s => String(s.id), "(no songs loaded)");
  fillRemoteSelect("remoteProgPick", getRemoteProgList(),
    it => String(it.title).slice(0, 40), it => String(it.id), "(no program items)");
}
function addRemoteSourceButton(kind) {
  try {
    const isSong = (kind === "song");
    const sel = document.getElementById(isSong ? "remoteSongPick" : "remoteProgPick");
    if (!sel || sel.selectedIndex < 0 || !sel.options[sel.selectedIndex]) return;
    const opt = sel.options[sel.selectedIndex];
    if (!opt.value) return; // placeholder entry
    const list = getRemoteButtons();
    list.push({
      label: String(opt.text).slice(0, 24),
      command: isSong ? "8" : "9",
      value: String(opt.value)
    });
    saveRemoteButtons(list);
    renderRemoteButtons();
  } catch (e) {}
}
function addRemoteSongButton() { addRemoteSourceButton("song"); }
function addRemoteProgButton() { addRemoteSourceButton("program"); }
