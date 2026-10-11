function notes() {
  this.init = v;
  this.showNotesPanel = m;
  this.hideNotesPanel = o;
  this.setNotesContainerID = r;
  this.setVariables = c;
  let h;
  let u;
  let f;
  let s;
  let e = 0;
  let d = 0;
  let w = 0;
  let A = null;
  function v() {
    console.log("Notes initialization....");
    x();
    k();
    q();
  }
  function r(B) {
    h = B;
  }
  function c(B, D, C) {
    e = B;
    d = D;
    w = C;
  }
  function k() {
    console.log("Initializing Notes panel....");
    u = new AppUI.Modal("notesPanelID");
  }
  function q() {
    console.log("Generating Notes panel Content....");
    u.setHeader("Verse Notes");
    let B = `
      <div class="flex flex-col gap-3">
        <textarea id="notes_rte" rows="6" class="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans" placeholder="Write study or sermon notes here..."></textarea>
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" id="notesCancelButton" class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cancel</button>
          <button type="button" id="notesSaveButton" class="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition shadow-xs">Save Note</button>
        </div>
      </div>
    `;
    u.setBody(B);
    u.render();

    f = {
      getEditorHTML: () => (document.getElementById("notes_rte") ? document.getElementById("notes_rte").value : ""),
      cleanHTML: (html) => html || "",
      setEditorHTML: (val) => {
        const el = document.getElementById("notes_rte");
        if (el) el.value = val || "";
      }
    };

    const saveBtn = document.getElementById("notesSaveButton");
    if (saveBtn) saveBtn.addEventListener("click", t, false);
    const cancelBtn = document.getElementById("notesCancelButton");
    if (cancelBtn) cancelBtn.addEventListener("click", p, false);
  }
  function m() {
    u.show();
  }
  function o() {
    u.hide();
  }
  function x() {
    const fullPath = AppStorage.resolveStoragePath("notes", "defaultnotes.db");
    A = AppDB.open(fullPath);
    g();
  }
  function g() {
    try {
      A.exec(
        "CREATE TABLE IF NOT EXISTS notesTable (noteId INTEGER PRIMARY KEY AUTOINCREMENT, noteText TEXT, noteTextFormat TEXT, bookNum INTEGER, chNum INTEGER, verseNum INTEGER)"
      );
    } catch(e) {
      console.error("[NotesEditor] Table creation error:", e);
    }
  }
  function a(C, B) {
    try {
      A.run(
        "INSERT INTO notesTable (noteText, noteTextFormat, bookNum, chNum, verseNum) VALUES (?, ?, ?, ?, ?)",
        [C, B, e, d, w]
      );
    } catch(e) {
      console.error("[NotesEditor] Insert error:", e);
    }
  }
  function t() {
    console.log("Saving Notes.....");
    const E = f.getEditorHTML();
    const C = f.cleanHTML(E);
    console.log(E);
    console.log(C);
    const D = /<\S[^><]*>/g;
    const B = C.replace(/<br>/gi, "\n").replace(D, "");
    console.log(B);
    a(B, C);
  }
  function p() {
    console.log("Cancelling notes....");
  }
}
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
    document.getElementById(a).addEventListener("click", b, false);
  }
  function b() {
    notesObj.setVariables(e, c, f);
    notesObj.showNotesPanel();
  }
}
