/**
 * Modern Notes Controller
 * 
 * Manages Bible verse notes database and UI rendering.
 * Fully migrated to AppDB and AppStorage, removing all air.* references.
 */
function notes() {
  this.init = M;
  this.showNotesPanel = J;
  this.hideNotesPanel = C;
  this.setNotesContainerID = w;
  this.setVariables = L;
  this.getNotes = G;

  let o;
  let k;
  let a;
  let e;
  let v = null;
  let t;
  let z;
  let B = false;
  let f = false;
  let I;
  let H;
  let p = 0;
  let j = 0;
  let n = 0;
  let gDb = null;

  function M(P, Q, R) {
    console.log("[NOTES] Initialization....");
    if (P == null) {
      t = "./notes/defaultnotes.db";
      I = "Default Notes";
      H = "Default notes. Automatically created when UECFI Presenter is launched the first time.";
    } else {
      t = P;
      I = Q;
      H = R;
    }

    const fullPath = AppStorage.resolveStoragePath(t);
    if (!AppStorage.existsSync(t)) {
      f = true;
    }
    O();
    l();
    m();
  }

  function w(P) {
    o = P;
  }

  function L(P, R, Q) {
    p = P;
    j = R;
    n = Q;
  }

  function b() {
    let U;
    let T;
    let S = "";
    const P = p - 1;
    const W = j - 1;
    const Q = n - 1;
    const R = bibleVersionArray[version1][6];
    const V = bibleVersionArray[version2][6];
    U = bible[version1] ? bible[version1][P][W][Q] : "";
    S = `${S}<b>${bibleBook[p]} ${j}:${n}</b><br>`;
    S = `${S}<span style="font-family:${R}">${U}</span><br>`;
    if (dualVersion) {
      T = bible[version2] ? bible[version2][P][W][Q] : "";
      S = `${S}<span style="font-family:${V}">${T}</span><br>`;
    }
    return S;
  }

  function J() {
    k.setHeader(`Notes - ${bibleBook[p]} ${j}:${n}`);
    document.getElementById("notesVerseID").innerHTML = b();
    k.show();
    let P = false;
    if (v != null && v.data != null) {
      const R = v.data.length;
      for (let Q = 0; Q < R; Q++) {
        if (
          v.data[Q].bookNum == p &&
          v.data[Q].chNum == j &&
          v.data[Q].verseNum == n
        ) {
          document.getElementById("notes_rte").value = v.data[Q].noteText;
          B = true;
          P = true;
          break;
        }
      }
    }
    if (!P) {
      B = false;
      document.getElementById("notes_rte").value = "";
    }
  }

  function C() {
    k.hide();
  }

  function l() {
    k = new AppUI.Modal("notesPanelID");
  }

  function m() {
    k.setHeader("Notes");
    k.setBody(notesUI);
    k.render();
    const saveBtn = document.getElementById("notesSaveButton");
    if (saveBtn) saveBtn.addEventListener("click", s, false);
    const cancelBtn = document.getElementById("notesCancelButton");
    if (cancelBtn) cancelBtn.addEventListener("click", y, false);
  }

  function O() {
    const fullPath = AppStorage.resolveStoragePath(t);
    gDb = AppDB.open(fullPath);
    N();
  }

  function N() {
    A();
  }

  function A() {
    try {
      gDb.exec(
        "CREATE TABLE IF NOT EXISTS notesTable (noteId INTEGER PRIMARY KEY AUTOINCREMENT, noteText TEXT, noteTextFormat TEXT, bookNum INTEGER, chNum INTEGER, verseNum INTEGER)"
      );
      if (f) {
        K();
      }
      const noteTypeEl = document.getElementById("nm_note_type1");
      if (noteTypeEl && noteTypeEl.checked) {
        const bookEl = document.getElementById("bookList");
        const chEl = document.getElementById("chapterList");
        const T = (bookEl ? bookEl.selectedIndex : 0) + 1;
        const W = (chEl ? chEl.selectedIndex : 0) + 1;
        G(T, W, 0);
      } else {
        G(-1, 0, 0);
      }
    } catch (e) {
      console.error("[NOTES] Table creation error:", e);
    }
  }

  function K() {
    try {
      gDb.exec(
        "CREATE TABLE IF NOT EXISTS notesInfoTable (noteInfoName TEXT, noteInfoDes TEXT)"
      );
      h();
    } catch (e) {
      console.error("[NOTES] Info table error:", e);
    }
  }

  function h() {
    try {
      gDb.run(
        "INSERT INTO notesInfoTable (noteInfoName, noteInfoDes) VALUES (?, ?)",
        [I, H]
      );
    } catch (e) {
      console.error("[NOTES] Info insert error:", e);
    }
  }

  function E(noteText, noteFormat) {
    try {
      gDb.run(
        "INSERT INTO notesTable (noteText, noteTextFormat, bookNum, chNum, verseNum) VALUES (?, ?, ?, ?, ?)",
        [noteText, noteFormat, p, j, n]
      );
      G(p, j, n);
    } catch (e) {
      console.error("[NOTES] Insert error:", e);
    }
  }

  function u(noteText, noteFormat) {
    try {
      gDb.run(
        "UPDATE notesTable SET noteText = ?, noteTextFormat = ? WHERE bookNum = ? AND chNum = ? AND verseNum = ?",
        [noteText, noteFormat, p, j, n]
      );
      G(p, j, n);
    } catch (e) {
      console.error("[NOTES] Update error:", e);
    }
  }

  function G(bNum, chNum, vNum) {
    if (!gDb) return;
    try {
      let rows = [];
      if (bNum != -1) {
        rows = gDb.allSync(
          "SELECT * FROM notesTable WHERE bookNum = ? AND chNum = ? ORDER BY verseNum",
          [bNum, chNum]
        );
      } else {
        rows = gDb.allSync("SELECT * FROM notesTable");
      }
      v = { data: rows.length > 0 ? rows : null };
      d();
    } catch (e) {
      console.error("[NOTES] Query error:", e);
      v = { data: null };
      d();
    }
  }

  function d() {
    let html = "No Notes for this chapter...";
    const resultContainer = document.getElementById("notesResultsID");
    if (!resultContainer) return;
    resultContainer.innerHTML = "";

    if (v != null && v.data != null) {
      html = '<table class="w-full text-xs">';
      const count = v.data.length;
      for (let W = 0; W < count; W++) {
        const bIdx = v.data[W].bookNum - 1;
        const cIdx = v.data[W].chNum - 1;
        const vIdx = v.data[W].verseNum - 1;
        const font1 = bibleVersionArray[version1][6];
        const font2 = bibleVersionArray[version2][6];
        const verseText1 = bible[version1] ? bible[version1][bIdx][cIdx][vIdx] : "";
        const verseText2 = (dualVersion && bible[version2]) ? bible[version2][bIdx][cIdx][vIdx] : "";

        html += `<tr class="border-b border-slate-100"><td class="p-2" width="30%">`;
        html += `<b>${bibleBook[v.data[W].bookNum]} ${v.data[W].chNum}:${v.data[W].verseNum}</b><br>`;
        html += `<span style="font-family:${font1}">${verseText1}</span><br>`;
        if (dualVersion) {
          html += `<span style="font-family:${font2}">${verseText2}</span><br>`;
        }
        html += `</td><td class="p-2" width="40%">`;
        html += `<span class="notes_css">${v.data[W].noteTextFormat}</span></td>`;
        html += `<td class="p-2" width="30%">`;
        html += `<span id="verse_note_edit_${W}" class="cursor-pointer text-brand-600 font-semibold mr-2">[ Edit ]</span>`;
        html += `<span id="verse_note_delete_${W}" class="cursor-pointer text-red-500 font-semibold">[ Delete ]</span>`;
        html += `</td></tr>`;
      }
      html += `</table>`;
    }
    resultContainer.innerHTML = html;
  }

  function s() {
    const rawVal = document.getElementById("notes_rte").value || "";
    const cleanVal = rawVal.replace(/<[^>]*>/g, "");
    if (!B) {
      E(cleanVal, rawVal);
    } else {
      u(cleanVal, rawVal);
    }
    C();
  }

  function y() {
    C();
  }
}

function notesInfo() {
  this.init = e;
  let d;
  function e(filename) {
    d = filename;
    b();
  }
  function b() {
    const fullPath = AppStorage.resolveStoragePath("notes", d);
    try {
      const db = AppDB.open(fullPath);
      const row = db.getSync("SELECT * FROM notesInfoTable");
      if (row) {
        notesManageObj.nm_addRecord_ext(row.noteInfoName, row.noteInfoDes, d);
      }
    } catch(err) {
      alert("Invalid Notes Database");
    }
  }
}

/**
 * Post-it note attachment for verse cards
 */
function postit() {
  this.init = d;
  let a = null;
  let e;
  let c;
  let f;
  function d(h, g, j, i) {
    a = h;
    e = g;
    c = j;
    f = i;
    const el = document.getElementById(a);
    if (el) {
      el.addEventListener("click", b, false);
    }
  }
  function b() {
    if (notesObj) {
      notesObj.setVariables(e, c, f);
      notesObj.showNotesPanel();
    }
  }
}
