/**
 * Modern Notes Management Controller
 * 
 * Manages notes collections, creation, deletion, and selection.
 * Fully migrated to AppDB and AppStorage, removing all air.* references.
 */
function manageNotes() {
  this.init = N;
  this.nm_addRecord_ext = C;

  let f = false;
  let h = false;
  let A = true;
  const B = "./notes/nm.db";
  let pDb = null;
  let G = "";
  let E = "";
  let e = "";
  let D = false;
  let w = null;
  const k = [];
  let d = "";
  let l;

  function N(W) {
    h = W;
    m();
    f = false;
    o();
  }

  function m() {
    const selEl = document.getElementById("nm_selectID");
    if (selEl) selEl.addEventListener("change", j, false);

    const selBtn = document.getElementById("nm_sel_buttonID");
    if (selBtn) selBtn.addEventListener("click", y, false);

    const delBtn = document.getElementById("nm_deleteID");
    if (delBtn) delBtn.addEventListener("click", U, false);

    const addBtn = document.getElementById("nm_add_buttonID");
    if (addBtn) addBtn.addEventListener("click", H, false);

    const saveFileBtn = document.getElementById("nm_save_file_buttonID");
    if (saveFileBtn) saveFileBtn.addEventListener("click", O, false);

    const newBtn = document.getElementById("nm_newID");
    if (newBtn) newBtn.addEventListener("click", u, false);

    const type1 = document.getElementById("nm_note_type1");
    if (type1) type1.addEventListener("change", F, false);

    const type2 = document.getElementById("nm_note_type2");
    if (type2) type2.addEventListener("change", F, false);

    const savePromptBtn = document.getElementById("nm_save_promptID");
    if (savePromptBtn) savePromptBtn.addEventListener("click", J, false);

    const cancelPromptBtn = document.getElementById("nm_cancel_promptID");
    if (cancelPromptBtn) cancelPromptBtn.addEventListener("click", T, false);

    const promptDiv = document.getElementById("nm_new_promptID");
    if (promptDiv) promptDiv.style.visibility = "hidden";
  }

  function j() {
    const sel = document.getElementById("nm_selectID");
    const W = sel.selectedIndex;
    if (w && w.data && w.data[W]) {
      document.getElementById("nm_nameID").innerHTML = w.data[W].name;
      document.getElementById("nm_descriptionID").innerHTML = w.data[W].description;
    }
  }

  function y() {
    const Y = document.getElementById("nm_selectID");
    const aa = Y.options[Y.selectedIndex].value;
    const X = l;
    l = aa;
    R(aa, 1);
    R(X, 0);
    const W = S(aa);
    const Z = `./notes/${W.filename}`;
    notesObj.init(Z);
  }

  function U() {
    const Z = document.getElementById("nm_selectID");
    const X = Z.options[Z.selectedIndex].value;
    const W = S(X);
    let aa = W.filename;
    if (aa == "defaultnotes.db") {
      alert("The Default Notes file can not be deleted.");
    } else {
      if (aa == d) {
        alert(`${aa} is the active notes file and can not be deleted.`);
      } else {
        const ab = confirm(`Are you sure you want to delete ${aa}`);
        if (ab) {
          V(X);
          const fullPath = AppStorage.resolveStoragePath("notes", aa);
          AppStorage.deleteFile(fullPath);
          alert(`Deleted Notes file ${aa}`);
        }
      }
    }
  }

  async function H() {
    try {
      let selectedPath = null;
      if (window.electronBridge && typeof window.electronBridge.showOpenDialogAsync === "function") {
        selectedPath = await window.electronBridge.showOpenDialogAsync({
          title: "Select Notes DB",
          filters: [{ name: "UECFI Presenter DB", extensions: ["db"] }]
        });
      } else if (window.electronBridge && typeof window.electronBridge.showOpenDialog === "function") {
        selectedPath = window.electronBridge.showOpenDialog({
          title: "Select Notes DB",
          filters: [{ name: "UECFI Presenter DB", extensions: ["db"] }]
        });
      }
      if (selectedPath) {
        const filename = extractFileName(selectedPath);
        const dest = AppStorage.resolveStoragePath("notes", filename);
        AppStorage.copyFile(selectedPath, dest, true);
        alert("Notes Database Added to UECFI Presenter");
        const ab = new notesInfo();
        ab.init(filename);
      }
    } catch(err) {
      console.error("[NM] Error adding notes DB:", err);
    }
  }

  async function O() {
    const ad = document.getElementById("nm_selectID");
    const ac = ad.options[ad.selectedIndex].value - 1;
    if (!w || !w.data || !w.data[ac]) return;
    const Y = w.data[ac].filename;
    const src = AppStorage.resolveStoragePath("notes", Y);
    const dest = AppStorage.resolvePath("vvexport", Y);
    try {
      AppStorage.copyFile(src, dest, true);
      alert(`Notes file ${Y} saved to vvexport folder: ${dest}`);
    } catch(e) {
      alert("Unable to save Notes: " + e.message);
    }
  }

  function T() {
    P(false);
    document.getElementById("nm_name_promptID").value = "";
    document.getElementById("nm_description_promptID").value = "";
    document.getElementById("nm_sel_dataID").style.visibility = "visible";
    document.getElementById("nm_new_promptID").style.visibility = "hidden";
  }

  function u() {
    P(true);
    document.getElementById("nm_name_promptID").value = "";
    document.getElementById("nm_description_promptID").value = "";
    document.getElementById("nm_sel_dataID").style.visibility = "hidden";
    document.getElementById("nm_new_promptID").style.visibility = "visible";
  }

  function F() {
    const Y = document.getElementById("nm_note_type1");
    if (Y.checked) {
      const bookEl = document.getElementById("bookList");
      const chEl = document.getElementById("chapterList");
      const W = (bookEl ? bookEl.selectedIndex : 0) + 1;
      const Z = (chEl ? chEl.selectedIndex : 0) + 1;
      notesObj.getNotes(W, Z, 0);
    } else {
      notesObj.getNotes(-1, 0, 0);
    }
  }

  function J() {
    let X = document.getElementById("nm_name_promptID").value;
    const Y = document.getElementById("nm_description_promptID").value;
    X = r(X);
    if (g(X)) {
      P(false);
      document.getElementById("nm_sel_dataID").style.visibility = "visible";
      document.getElementById("nm_new_promptID").style.visibility = "hidden";
      G = X;
      E = M(X);
      e = Y;
      D = false;
      x();
    } else {
      alert("Invalid Notes name.");
    }
  }

  function v() {
    if (w && w.data != null) {
      clearSelectList("nm_selectID");
      const X = w.data.length;
      for (let Y = 0; Y < X; Y++) {
        const W = w.data[Y];
        document.getElementById("nm_selectID").options[Y] = new Option(W.name, W.nmId);
        if (W.selected) {
          document.getElementById("nm_selectID").selectedIndex = Y;
          document.getElementById("nm_nameID").innerHTML = W.name;
          document.getElementById("nm_descriptionID").innerHTML = W.description;
          l = W.nmId;
        }
      }
    }
  }

  function M(Z) {
    let W = Z.replace(/ /g, "_").substr(0, 8).toLowerCase();
    if (W == "defaultnotes") {
      const X = Math.floor(Math.random() * 1000);
      W = `${W + X}.db`;
    } else {
      W = `${W}.db`;
    }
    K();
    const aa = k.length;
    for (let Y = 0; Y < aa; Y++) {
      if (W == k[Y]) {
        const X = Math.floor(Math.random() * 1000);
        W = `a${X}${W}`;
        Y = 0;
      }
    }
    return W;
  }

  function K() {
    if (w && w.data != null) {
      const X = w.data.length;
      for (let Y = 0; Y < X; Y++) {
        k[Y] = w.data[Y].filename;
      }
    }
  }

  function q() {
    if (h) {
      G = "Default Notes";
      E = "defaultnotes.db";
      e = "Default notes. Automatically created when UECFI Presenter is launched the first time.";
      D = 1;
      x();
    } else {
      a();
    }
  }

  function L() {
    if (w && w.data != null) {
      const X = w.data.length;
      for (let Y = 0; Y < X; Y++) {
        const W = w.data[Y];
        if (W.selected) {
          d = W.filename;
          break;
        }
      }
    }
  }

  function C(X, W, Y) {
    G = X;
    E = Y;
    e = W;
    D = 0;
    x();
  }

  function S(Z) {
    if (!w || !w.data) return null;
    const X = w.data.length;
    for (let Y = 0; Y < X; Y++) {
      if (w.data[Y].nmId == Z) {
        return w.data[Y];
      }
    }
    return null;
  }

  function P(disabled) {
    const ids = ["nm_newID", "nm_add_buttonID", "nm_selectID", "nm_sel_buttonID", "nm_deleteID", "nm_save_file_buttonID"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
  }

  function g(W) {
    return !!(W && W.length > 0);
  }

  function r(X) {
    return X ? X.replace(/[^a-zA-Z 0-9]+/g, "").replace(/ /g, "") : "";
  }

  function o() {
    const fullPath = AppStorage.resolveStoragePath(B);
    pDb = AppDB.open(fullPath);
    f = true;
    n();
  }

  function n() {
    try {
      pDb.exec(
        "CREATE TABLE IF NOT EXISTS nm (nmId INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, filename TEXT, description TEXT, selected BOOLEAN)"
      );
      q();
    } catch(e) {
      console.error("[NM] Error creating nm table:", e);
    }
  }

  function x() {
    try {
      pDb.run(
        "INSERT INTO nm (name, filename, description, selected) VALUES (?, ?, ?, ?)",
        [G, E, e, D ? 1 : 0]
      );
      a();
    } catch(e) {
      console.error("[NM] Insert error:", e);
    }
  }

  function a() {
    try {
      const rows = pDb.allSync("SELECT * FROM nm");
      w = { data: rows.length > 0 ? rows : null };
      L();
      v();
      if (A) {
        const aa = `./notes/${d}`;
        notesObj.init(aa);
        A = false;
      }
    } catch(e) {
      console.error("[NM] Select all error:", e);
    }
  }

  function V(Z) {
    try {
      pDb.run("DELETE FROM nm WHERE nmId = ?", [Z]);
      a();
    } catch(e) {
      console.error("[NM] Delete error:", e);
    }
  }

  function R(X, Z) {
    try {
      pDb.run("UPDATE nm SET selected = ? WHERE nmId = ?", [Z ? 1 : 0, X]);
      a();
    } catch(e) {
      console.error("[NM] Update selected error:", e);
    }
  }
}
