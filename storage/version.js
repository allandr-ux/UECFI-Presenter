var version1 = 1;
var version2 = 2;
var bibleVersionArray = new Array(["", ""]);
window.version1 = version1;
window.version2 = version2;
window.bibleVersionArray = bibleVersionArray;
var versionManageDialog;
var new_fname,
  new_revision,
  new_title,
  new_font,
  new_font_list,
  new_copyright,
  new_sizefactor;
var verFile = null;
var singleVersion = true;
/**
 * Loads configured Bible versions from xml/version.xml.
 * Uses AppStorage/fetch with DOMParser instead of legacy XMLHttpRequest.
 */
async function loadBibleVersion() {
  const versionFile = "xml/version.xml";
  try {
    let xmlText = "";
    if (typeof AppStorage !== "undefined" && AppStorage.readFile) {
      xmlText = await AppStorage.readFile(versionFile);
    } else {
      const res = await fetch(versionFile);
      xmlText = await res.text();
    }
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    const a = xmlDoc.documentElement;
    if (!a) return;

    const f = a.getElementsByTagName("version").length;
    bibleVersionArray[0] = ["None", ""];
    for (let i = 0; i < f; i++) {
      const d = i + 1;
      const e = a.getElementsByTagName("version")[i];
      bibleVersionArray[d] = [
        e.getElementsByTagName("name")[0]?.textContent || "",
        e.getElementsByTagName("file")[0]?.textContent || "",
        e.getElementsByTagName("font")[0]?.textContent || "",
        e.getElementsByTagName("copyright")[0]?.textContent || "",
        e.getElementsByTagName("fontsizefactor")[0]?.textContent || "1",
        e.getElementsByTagName("searchfile")[0]?.textContent || "",
        e.getElementsByTagName("selectedfont")[0]?.textContent || ""
      ];
    }
  } catch (err) {
    console.warn("[VERSION] Error loading version.xml:", err);
  }
}
function versionFill(b) {
  clearSelectList("version1Menu");
  clearSelectList("version2Menu");
  const a = bibleVersionArray.length;
  for (i = 1; i < a; i++) {
    document.getElementById("version1Menu").options[i] = new Option(
      bibleVersionArray[i][0],
      i,
    );
    document.getElementById("version2Menu").options[i] = new Option(
      bibleVersionArray[i][0],
      i,
    );
  }
  document.getElementById("version1Menu").selectedIndex = version1;
  document.getElementById("version2Menu").selectedIndex = version2;
  document.getElementById("version1Text").innerHTML =
    `Version 1: ${bibleVersionArray[version1][0]}`;
  document.getElementById("version2Text").innerHTML =
    `Version 2: ${bibleVersionArray[version2][0]}`;
  if (b) {
    document
      .getElementById("versionSave")
      .addEventListener("click", saveVersionSelection, false);
    versionManageDialog = new AppUI.Modal("versionManageDialog");
    versionManageDialog.render();
  }
}
function saveVersionSelection() {
  const c = version1;
  const b = version2;
  version1 = document.getElementById("version1Menu").selectedIndex;
  version2 = document.getElementById("version2Menu").selectedIndex;
  if (c != version1 && c != version2) {
    bible[c] = null;
  }
  if (b != version1 && b != version2) {
    bible[b] = null;
  }
  if (version1 != c && version1 != b) {
    loadBible(version1, false);
  }
  if (version2 != b && version2 != c) {
    loadBible(version2, false);
  }
  if (version1 != c) {
    loadBookNames(version1);
    putbook();
    if (bibleVersionArray[version1][5] != "") {
      const a = `./bible/${bibleVersionArray[version1][5]}`;
      console.log(`             Search file....${a}`);
      if (searchObj != null) {
        searchObj.close();
        searchObj = null;
      }
      searchObj = new vvsearch(a);
      searchObj.init();
      document.getElementById("searchID").disabled = false;
      document.getElementById("adSearch").disabled = false;
      document.getElementById("adSearchButton").disabled = false;
    } else {
      if (searchObj != null) {
        searchObj.close();
      }
      searchObj = null;
      document.getElementById("searchID").disabled = true;
      document.getElementById("adSearch").disabled = true;
      document.getElementById("adSearchButton").disabled = true;
      enterForSearchActive = false;
    }
  }
  document.getElementById("version1Text").innerHTML =
    `Version 1: ${bibleVersionArray[version1][0]}`;
  document.getElementById("version2Text").innerHTML =
    `Version 2: ${bibleVersionArray[version2][0]}`;
  window.version1 = version1;
  window.version2 = version2;
  window.bibleVersionArray = bibleVersionArray;
  saveConfigXML();
  updateVerseContainer();
  if (typeof window.renderModernBookList === "function") {
    window.renderModernBookList();
  }
  if (typeof bibleVersionSelObj !== "undefined" && bibleVersionSelObj && typeof bibleVersionSelObj.hide === "function") {
    bibleVersionSelObj.hide();
  } else {
    const p2 = document.getElementById("panelObj2");
    if (p2 && p2.close) p2.close();
  }
}
async function readPanelContent(a) {
  try {
    versionManageDialog.setBody("Loading....");
    let content = "";
    if (typeof AppStorage !== "undefined" && AppStorage.readFile) {
      content = await AppStorage.readFile(a);
    } else {
      const res = await fetch(a);
      content = await res.text();
    }
    versionManageDialog.setBody(content);
    fillVersionPanel();
  } catch (err) {
    console.warn("[VERSION] Failed to load panel content:", err);
    versionManageDialog.setBody("<p class='p-4 text-red-500'>Error loading version management content.</p>");
  }
}
function fillVersionPanel() {
  document.getElementById("versionDivID").style.height = 150;
  document.getElementById("selectVersionList").width = 80;
  document.getElementById("fontVersionList").width = 200;
  document
    .getElementById("selectVersionList")
    .addEventListener("change", updateVersionDetails, false);
  document
    .getElementById("deleteVersionButton")
    .addEventListener("click", deleteVersionConfirm, false);
  document
    .getElementById("saveVersionButton")
    .addEventListener("click", saveVersion, false);
  document
    .getElementById("closeVersionButton")
    .addEventListener("click", panelClose, false);
  document
    .getElementById("addSearchDB_Button")
    .addEventListener("click", loadSearchFile, false);
  document
    .getElementById("browseVersionButton")
    .addEventListener("click", showBrowse, false);
  verFile = null;
  document.getElementById("versionVersionTextbox").disabled = true;
  document.getElementById("copyrightVersionTextarea").disabled = true;
  document.getElementById("saveVersionButton").disabled = false;
  loadVersionList();
}
function loadVersionList() {
  console.log("Load Version List function...");
  const a = bibleVersionArray.length;
  console.log(`Number of version: ${a}`);
  clearSelectList("selectVersionList");
  for (i = 1; i < a; i++) {
    document.getElementById("selectVersionList").options[i - 1] = new Option(
      bibleVersionArray[i][0],
      i,
    );
  }
  document.getElementById("selectVersionList").selectedIndex = 0;
  console.log("About to update version details....");
  updateVersionDetails();
}
function updateVersionDetails() {
  const c = document.getElementById("selectVersionList").selectedIndex;
  const d = document.getElementById("selectVersionList").options[c].value;
  document.getElementById("versionVersionTextbox").value =
    bibleVersionArray[d][0];
  document.getElementById("copyrightVersionTextarea").value =
    bibleVersionArray[d][3];
  if (bibleVersionArray[d][5] != "") {
    document.getElementById("searchDBTextID").innerHTML = "Search DB Installed";
  } else {
    document.getElementById("searchDBTextID").innerHTML =
      "Search DB NOT Installed";
  }
  const f = bibleVersionArray[d][2];
  const a = f.split(",");
  const e = a.length;
  document.getElementById("fontVersionList").options.length = 0;
  clearSelectList("fontVersionList");
  for (let b = 0; b < e; b++) {
    document.getElementById("fontVersionList").options[b] = new Option(
      a[b],
      a[b],
    );
  }
}
function toggleSaveButton() {
  const a = document.getElementById("saveVersionButton").disabled;
  if (a) {
    document.getElementById("saveVersionButton").disabled = false;
  } else {
    document.getElementById("saveVersionButton").disabled = true;
  }
}
function toggleLoadButton() {
  alert("Activating Load button....");
}
function deleteVersion() {
  const m = bibleVersionArray;
  const versionXmlPath = AppStorage.resolveStoragePath("xml", "version.xml");
  const versionBakPath = AppStorage.resolveStoragePath("xml", "version.bak");
  AppStorage.copyFile(versionXmlPath, versionBakPath, true);

  const g = document.getElementById("selectVersionList").selectedIndex;
  const a = document.getElementById("selectVersionList").options[g].value;
  const f = bibleVersionArray[a][1];
  bibleVersionArray.splice(a, 1);
  const c = generateVersionXML();
  var n = "./xml/version.xml";
  save2file(c, n, false);

  const bibleFilePath = AppStorage.resolveStoragePath("bible", f);
  AppStorage.deleteFile(bibleFilePath);
  loadVersionList();
  const l = parseInt(a, 10);
  let j = parseInt(version1, 10);
  let h = parseInt(version2, 10);
  if (l < j) {
    j--;
  }
  if (l < h) {
    h--;
  }
  version1 = j;
  version2 = h;
  versionFill(false);
  saveConfigXML();
  loadBookNames(version1);
  putbook();
  updateVerseContainer();
}
function deleteVersionConfirm() {
  const a = document.getElementById("selectVersionList").selectedIndex;
  const b = parseInt(document.getElementById("selectVersionList").options[a].value, 10);
  if (b === parseInt(version1, 10) || b === parseInt(version2, 10)) {
    alert("Cannot delete the active primary or secondary Bible version. Please change version selection first.");
  } else {
    deletePromptShow();
  }
}
function saveVersion() {
  const b = document.getElementById("selectVersionList").selectedIndex;
  const d = document.getElementById("selectVersionList").options[b].value;
  const a = document.getElementById("fontVersionList").selectedIndex;
  const e = document.getElementById("fontVersionList").options[a].value;
  console.log(`[VERSION MANAGE] selectedfont Index: ${a}`);
  console.log(`[VERSION MANAGE] selectedfont Name: ${e}`);
  bibleVersionArray[d][6] = e;
  const f = generateVersionXML();
  const c = "./xml/version.xml";
  save2file(f, c, false);
  updateVerseContainer();
}
function loadBibleDBEvent(a) {
  const b = a.currentTarget.nativePath;
  console.log(`Load Bible Event Processed: ${b}`);
  loadVersion(b);
}
function loadVersion(f) {
  console.log("Loading Version ....");
  let u;
  let q;
  const o = f;
  console.log(`filename: ${o}`);
  const ext = (o.split('.').pop() || '').toLowerCase();
  if (ext != "xml" && ext != "db") {
    alert("Invalid UECFI Presenter file.");
    return false;
  }
  const fileExists = AppStorage.existsSync(o);
  if (!fileExists) {
    alert("File does not exists.");
    return false;
  }
  if (ext == "db") {
    const d = bibleVersionArray.length;
    u = extractFileName(o);
    u = u.split(".")[0];
    q = 0;
    for (var p = 1; p < d; p++) {
      let r = bibleVersionArray[p][1];
      r = r.split(".")[0];
      if (r == u) {
        q = p;
        break;
      }
    }
    if (q != 0) {
      const c = extractFileName(o);
      const targetDbPath = AppStorage.resolveStoragePath("bible", c);
      console.log(`Source: ${o}`);
      console.log(`Destination: ${targetDbPath}`);
      AppStorage.copyFile(o, targetDbPath, true);
      bibleVersionArray[q][5] = c;
      var b = generateVersionXML();
      var l = "./xml/version.xml";
      save2file(b, l, false);
      alert(
        `Added searh database for "${bibleVersionArray[q][0]}" Bible version.`,
      );
      return true;
    } else {
      alert(`Please add the matching Bible for ${u} search database.`);
      return false;
    }
  } else {
    console.log(`***VerFile....${o}`);
    extractInfo(o);
    console.log(new_fname);
    const e = `bible/${new_fname}`;
    const j = fileExist(e, 1);
    if (j) {
      alert("File already loaded");
      return true;
    }
    let t = true;
    let g = false;
    const a = bibleVersionArray.length;
    let k = a;
    for (var p = 1; p < a; p++) {
      if (bibleVersionArray[p][1] == new_fname) {
        t = false;
        g = true;
        k = p;
      }
    }
    if (t || g) {
      const targetPath = AppStorage.resolveStoragePath("bible", new_fname);
      const srcPath = s.nativePath || (s.url ? s.url.replace(/^file:\/\//, '') : s);
      AppStorage.copyFile(srcPath, targetPath, true);
      bibleVersionArray.push(["", ""]);
      bibleVersionArray[k][0] = new_title;
      bibleVersionArray[k][1] = new_fname;
      bibleVersionArray[k][2] = new_font_list;
      bibleVersionArray[k][3] = new_copyright;
      bibleVersionArray[k][4] = new_sizefactor;
      bibleVersionArray[k][5] = "";
      bibleVersionArray[k][6] = new_font;
    }
    var b = generateVersionXML();
    var l = "./xml/version.xml";
    save2file(b, l, false);
    loadVersionList();
    versionFill(false);
    return true;
  }
}
function extractInfo(a) {
  try {
    let xmlContent = '';
    const fs = (typeof require === 'function') ? require('fs') : null;
    let localPath = a;
    if (localPath.startsWith('file://')) {
      localPath = localPath.replace(/^file:\/\//, '');
    }
    if (fs && fs.existsSync(localPath)) {
      xmlContent = fs.readFileSync(localPath, 'utf8');
    } else {
      let req = new XMLHttpRequest();
      req.open("GET", a, false);
      req.send(null);
      xmlContent = req.responseText;
    }
    // Remove BOM if present
    xmlContent = xmlContent.replace(/^\uFEFF/, '');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');
    const b = doc.documentElement;
    
    // Fallback: If fname tag does not exist or does not end with .xml, derive from filename
    let parsedFname = b.getElementsByTagName("fname")[0]?.textContent;
    if (!parsedFname || !parsedFname.toLowerCase().endsWith(".xml")) {
      parsedFname = extractFileName(localPath);
    }
    new_fname = parsedFname;
    new_revision = b.getElementsByTagName("revision")[0]?.textContent || "1";
    new_title = b.getElementsByTagName("title")[0]?.textContent || extractFileName(localPath).replace('.xml', '');
    new_font_list = b.getElementsByTagName("font")[0]?.textContent || "Arial,Helvetica,sans-serif,Calibri";
    new_copyright = b.getElementsByTagName("copyright")[0]?.textContent || "";
    new_sizefactor = b.getElementsByTagName("sizefactor")[0]?.textContent || "1";
    const d = new_font_list.split(",");
    new_font = d[0].trim();
  } catch(e) {
    console.error("Error in extractInfo:", e);
  }
}
function generateVersionXML() {
  let a = "";
  const b = bibleVersionArray.length;
  a = `${a}<?xml version="1.0" encoding="ISO-8859-1"?>\n`;
  a = `${a}<bibleversion>\n`;
  for (i = 1; i < b; i++) {
    a = `${a}  <version>\n`;
    a = `${a}    <name>${bibleVersionArray[i][0]}</name>\n`;
    a = `${a}    <file>${bibleVersionArray[i][1]}</file>\n`;
    a = `${a}    <font>${bibleVersionArray[i][2]}</font>\n`;
    a = `${a}    <copyright>${bibleVersionArray[i][3]}</copyright>\n`;
    a = `${a}    <fontsizefactor>${bibleVersionArray[i][4]}</fontsizefactor>\n`;
    a = `${a}    <searchfile>${bibleVersionArray[i][5]}</searchfile>\n`;
    a = `${a}    <selectedfont>${bibleVersionArray[i][6]}</selectedfont>\n`;
    a = `${a}  </version>\n`;
  }
  a = `${a}</bibleversion>\n`;
  return a;
}
async function showBrowse() {
  try {
    let selectedPath = null;
    if (window.electronBridge && typeof window.electronBridge.showOpenDialogAsync === "function") {
      selectedPath = await window.electronBridge.showOpenDialogAsync({
        title: "Select UECFI Presenter Bible",
        filters: [{ name: "Bible Database", extensions: ["xml", "db"] }]
      });
    } else if (window.electronBridge && typeof window.electronBridge.showOpenDialog === "function") {
      selectedPath = window.electronBridge.showOpenDialog({
        title: "Select UECFI Presenter Bible",
        filters: [{ name: "Bible Database", extensions: ["xml", "db"] }]
      });
    }
    if (selectedPath) {
      loadVersion(selectedPath);
    }
  } catch(err) {
    console.error("[VERSION] showBrowse error:", err);
  }
}
function panelClose() {
  versionManageDialog.hide();
}
function manageVersion() {
  versionManageDialog.show();
  versionManageDialog.setHeader("Bible Version Manager");
  versionManageDialog.setBody("");
  readPanelContent("./content/version.txt", "versionManageDialog");
}
function processSingleVersion() {
  singleVersion = document.getElementById("singleVersionBoxID").checked;
  if (singleVersion) {
    document.getElementById("version2Menu").disabled = true;
  } else {
    document.getElementById("version2Menu").disabled = false;
  }
  saveConfigXML();
}
async function loadSearchFile() {
  console.log("[VERSION MANAGE] Add Search DB to the system");
  try {
    let selectedPath = null;
    if (window.electronBridge && typeof window.electronBridge.showOpenDialogAsync === "function") {
      selectedPath = await window.electronBridge.showOpenDialogAsync({
        title: "Open Search Database",
        filters: [{ name: "UECFI Presenter DB", extensions: ["db"] }]
      });
    }
    if (selectedPath) {
      loadVersion(selectedPath);
    }
  } catch(err) {
    console.error("[VERSION] loadSearchFile error:", err);
  }
}
function getVersion1Filename() {
  return bibleVersionArray[version1][1];
}
function getVersion1Name() {
  return bibleVersionArray[version1][0];
}
function updateVersionXML() {
  const b = generateVersionXML();
  const a = "./xml/version.xml";
  save2file(b, a, false);
}
