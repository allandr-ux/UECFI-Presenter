/**
 * Modern Schedule Controller
 * 
 * Manages Bible verse & Song presentation schedules.
 * Fully migrated to AppDB and AppStorage, removing all air.* references.
 */
function schedule() {
  this.init = N;
  this.processAddSong = l;
  this.processAddVerse = M;
  this.getScheduleText = j;
  this.processRemotePresent = O;

  let G;
  const H = 0;
  const y = false;
  const E = "./xml/schedule.db";
  let L;
  let A;
  let K;
  let v;
  let c;
  let uDb = null;
  let p = null;
  let initialized = false;

  function N() {
    // song_manager.refreshAllSongs() re-calls schedule init whenever songs
    // reload; without this guard every song refresh re-bound all listeners
    // (duplicate handlers) and re-queried the DB. Refresh data only.
    if (initialized) {
      try { a(); } catch (e) { console.warn("[SCHEDULE] refresh failed:", e); }
      return;
    }
    initialized = true;
    w("Initializing Schedule");
    G = 0;
    // h() replaces hidden <img> shims with <span> nodes (see common.js icon()),
    // so it must run BEFORE r() binds listeners, otherwise bindings are lost
    // when the original nodes are replaced.
    h();
    r();
    s();
  }

  // NOTE: no auto-init here on purpose. fillTabs("scheduleTab") explicitly
  // calls scheduleObj.init() after schedule.txt is injected. Auto-running N()
  // inside the constructor caused double event bindings + double DB opens.

  function r() {
    const sel = document.getElementById("sch_selectID");
    if (sel) sel.addEventListener("change", m, false);

    const up = document.getElementById("sch_upID");
    if (up) up.addEventListener("click", o, false);

    const down = document.getElementById("sch_downID");
    if (down) down.addEventListener("click", J, false);

    const del = document.getElementById("sch_deleteID");
    if (del) del.addEventListener("click", x, false);

    const delAll = document.getElementById("sch_deleteAllID");
    if (delAll) delAll.addEventListener("click", n, false);

    const present = document.getElementById("sch_presentID");
    if (present) present.addEventListener("click", t, false);

    // Double-click a list entry to present it immediately
    const list = document.getElementById("sch_selectID");
    if (list && !list.dataset.dblBound) {
      list.addEventListener("dblclick", t, false);
      list.dataset.dblBound = "1";
    }
  }

  function h() {
    L = new icon("sch_upID", " Move Schedule Item UP ", "graphics/icon/up.png", "graphics/icon/up.png", "");
    A = new icon("sch_downID", " Move Schedule Item DOWN ", "graphics/icon/down.png", "graphics/icon/down.png", "");
    K = new icon("sch_deleteID", " REMOVE Selected Schedule Item ", "graphics/icon/sch_del.png", "graphics/icon/sch_del.png", "");
    v = new icon("sch_deleteAllID", " CLEAR Schedule ", "graphics/icon/sch_delall.png", "graphics/icon/sch_delall.png", "");
    c = new icon("sch_presentID", " PRESENT Selected Schedule Item ", "graphics/icon/present_48.png", "graphics/icon/present_48.png", "");
  }

  function s() {
    const fullPath = AppStorage.resolveStoragePath(E);
    uDb = AppDB.open(fullPath);
    w("DB connection established");
    f();
  }

  function f() {
    w("Creating schedule table...");
    try {
      uDb.exec(
        "CREATE TABLE IF NOT EXISTS sch (schId INTEGER PRIMARY KEY AUTOINCREMENT, isSong BOOLEAN, book INTEGER, ch INTEGER, ver INTEGER, songID INTEGER, sch_order INTEGER)"
      );
      w("Schedule table created.");
      a();
    } catch(e) {
      w("Error creating schedule table: " + e.message);
    }
  }

  function C(isSong, book, ch, ver, songID, sch_order) {
    w(`Adding Record ${book} ${ch} ${ver} ${sch_order} ${isSong} ${songID}`);
    try {
      uDb.run(
        "INSERT INTO sch (isSong, book, ch, ver, songID, sch_order) VALUES (?, ?, ?, ?, ?, ?)",
        [isSong ? 1 : 0, book, ch, ver, songID, sch_order]
      );
      w("Inserted into schedule DB successfully...");
      a();
    } catch(e) {
      w("INSERT error: " + e.message);
    }
  }

  function Q(id) {
    w("Deleting schedule record...");
    try {
      uDb.run("DELETE FROM sch WHERE schId = ?", [id]);
      if (p && p.data != null) {
        const numofRecords = p.data.length;
        if (G == numofRecords - 1) {
          G--;
        }
      }
      a();
    } catch(e) {
      w("Error deleting record from schedule DB: " + e.message);
    }
  }

  function k() {
    w("Deleting ALL schedule records...");
    try {
      uDb.run("DELETE FROM sch");
      G = 0;
      a();
    } catch(e) {
      w("Error deleting all records from schedule DB: " + e.message);
    }
  }

  function B(id, val) {
    w(`Swapping Order Value for Key ${id} to ${val}`);
    try {
      uDb.run("UPDATE sch SET sch_order = ? WHERE schId = ?", [val, id]);
      w("Changed the order value");
      a();
    } catch(e) {
      w("Error updating the order value: " + e.message);
    }
  }

  function a() {
    w("Getting ALL Data from Schedule DB");
    try {
      const rows = uDb.allSync("SELECT * FROM sch ORDER BY sch_order ASC");
      w("Successfully got all data from schedule DB");
      p = { data: rows.length > 0 ? rows : null };
      P();
    } catch(e) {
      w("Error getting all records: " + e.message);
    }
  }

  function P() {
    const countEl = document.getElementById("sch_itemCount");
    const typeEl = document.getElementById("sch_previewType");
    if (p && p.data != null) {
      clearSelectList("sch_selectID");
      const S = p.data.length;
      if (countEl) {
        countEl.style.display = "";
        countEl.textContent = `${S} item${S !== 1 ? "s" : ""}`;
      }
      for (let T = 0; T < S; T++) {
        const R = p.data[T];
        let U;
        try {
          U = b(R.isSong, R.book, R.ch, R.ver, R.songID);
        } catch (e) {
          console.warn("[SCHEDULE] Skipping unreadable row:", R, e);
          U = "[S] Unreadable item";
        }
        const opt = new Option(U, R.schId);
        try { opt.dataset.label = U; } catch (e) {}
        document.getElementById("sch_selectID").options[T] = opt;
      }
      d();
      if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
    } else {
      clearSelectList("sch_selectID");
      const sel = document.getElementById("sch_selectID");
      if (sel) sel.options[0] = new Option("None", 0);
      if (countEl) countEl.style.display = "none";
      if (typeEl) typeEl.textContent = "";
      const previewEl = document.getElementById("sch_verseTextID");
      if (previewEl) {
        previewEl.innerHTML = `
          <div class="text-center py-12 my-auto text-slate-400">
            <i class="fa-regular fa-calendar-check text-4xl mb-3 text-slate-300"></i>
            <h3 class="text-sm font-bold text-slate-600">No Schedule Item Selected</h3>
            <p class="text-xs text-slate-400 mt-1">Select an item from the list or add items from the Bible / Songs tab.</p>
          </div>
        `;
      }
    }
  }

  function d() {
    const R = document.getElementById("sch_selectID");
    if (!R) return;
    R.selectedIndex = G;
    q(G);
  }

  function q(R) {
    if (!p || !p.data || !p.data[R]) return;
    const typeEl = document.getElementById("sch_previewType");
    // Emerald ring while the previewed item is the live projection
    try {
      const preview = document.getElementById("sch_verseTextID");
      const pid = (typeof window.presentedScheduleId !== "undefined" && window.presentedScheduleId !== null) ? String(window.presentedScheduleId) : null;
      if (preview) preview.classList.toggle("schedule-presented", pid !== null && String(p.data[R].schId) === pid);
    } catch (e) {}
    let ac = "";
    if (p.data[R].isSong == false) {
      const Y = p.data[R];
      let V = "";
      let T2 = "";
      try {
        V = getSingleVerse(Y.book, Y.ch, Y.ver, 1);
        T2 = getSingleVerse(Y.book, Y.ch, Y.ver, 2);
      } catch (e) {
        console.warn("[SCHEDULE] Verse preview failed (bible not loaded yet?):", Y, e);
        V = "(Verse text unavailable — bible still loading)";
      }
      const refText = b(Y.isSong, Y.book, Y.ch, Y.ver, Y.songID);
      const priFont = (typeof priFontName !== "undefined" && priFontName) ? priFontName : "Arial";
      const secFont = (typeof secFontName !== "undefined" && secFontName) ? secFontName : "Arial";
      // Mirror projection: single-version mode shows the primary text only
      const showDual = !(typeof singleVersion !== "undefined" && singleVersion);
      if (typeEl) typeEl.textContent = "Verse";
      ac = `${ac}<div id="scheduleTextDIV" class="cursor-pointer" title="Click to present">`;
      ac = `${ac}<div class="text-[11px] font-bold uppercase tracking-wider text-brand-700 mb-2">${refText}</div>`;
      ac = `${ac}<p class="text-[15px] font-semibold leading-relaxed text-slate-900" style="font-family:${priFont};">${V}</p>`;
      if (showDual && T2) {
        ac = `${ac}<div class="my-3 mx-auto h-0.5 w-16 rounded-full bg-slate-200"></div>`;
        ac = `${ac}<p class="text-[13px] leading-relaxed text-slate-600" style="font-family:${secFont};">${T2}</p>`;
      }
      ac = `${ac}<p class="mt-3 text-[11px] font-medium text-slate-400">Click to present</p></div>`;
      document.getElementById("sch_verseTextID").innerHTML = ac;
      const textDiv = document.getElementById("scheduleTextDIV");
      if (textDiv) textDiv.addEventListener("click", t, false);
    } else {
      const ab = p.data[R].songID;
      const X = songManagerObj.getSongObjWithID(ab);
      if (X != null) {
        const S = X.font;
        const Z = X.slides ? X.slides.length : 0;
        if (typeEl) typeEl.textContent = "Song";
        ac = `${ac}<div class="mb-3 flex items-center justify-between gap-2">`;
        ac = `${ac}<span class="text-[15px] font-bold text-slate-900 truncate">${X.name}</span>`;
        ac = `${ac}<span class="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">${Z} slide${Z !== 1 ? "s" : ""}</span></div>`;
        ac = `${ac}<div class="space-y-3">`;
        for (let W = 0; W < Z; W++) {
          ac = `${ac}<div id="schlyricsID${W}" class="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2"></div>`;
        }
        ac = `${ac}</div>`;
        document.getElementById("sch_verseTextID").innerHTML = ac;
        for (let W = 0; W < Z; W++) {
          const U = `schlyricsID${W}`;
          const el = document.getElementById(U);
          if (el) el.style.fontFamily = S;
          const lyr = new songLyricsClass();
          lyr.init(X, U, W);
        }
        if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();
      } else {
        alert("Song Deleted from Song Database");
        x();
      }
    }
  }

  function F(R) {
    if (p && p.data != null && p.data[R]) {
      return p.data[R].sch_order;
    }
    return 0;
  }

  function z(R) {
    if (p && p.data != null && p.data[R]) {
      return p.data[R].schId;
    }
    return 0;
  }

  function e() {
    let S = 0;
    if (p && p.data != null) {
      const T = p.data.length;
      for (let R = 0; R < T; R++) {
        if (p.data[R].sch_order > S) S = p.data[R].sch_order;
      }
      return S + 1;
    }
    return 0;
  }

  function l(R) {
    w(`Add Song with ID ${R}`);
    // Prevent duplicates: same song already scheduled
    try {
      const existing = uDb.getSync("SELECT schId FROM sch WHERE isSong = 1 AND songID = ?", [R]);
      if (existing && existing.schId) {
        w("Song already in schedule, skipping.");
        a();
        return false;
      }
    } catch (e) {}
    const S = e();
    C(true, 0, 0, 0, R, S);
    return true;
  }

  function M(R, T, S) {
    // Prevent duplicates: same verse already scheduled
    try {
      const existing = uDb.getSync("SELECT schId FROM sch WHERE isSong = 0 AND book = ? AND ch = ? AND ver = ?", [R, T, S]);
      if (existing && existing.schId) {
        w("Verse already in schedule, skipping.");
        a();
        return false;
      }
    } catch (e) {}
    const U = e();
    C(false, R, T, S, 0, U);
    return true;
  }

  function m() {
    G = document.getElementById("sch_selectID").selectedIndex;
    q(G);
    if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
  }

  // Highlights the live-projected slide card inside the schedule song
  // preview. Follows presentedSlideIdx while the selected schedule entry is
  // a song and is the live projection; otherwise shows no slide highlight.
  window.updateScheduleSlideHighlight = function() {
    try {
      const host = document.getElementById("sch_verseTextID");
      if (host) host.querySelectorAll("[id^='schlyricsID']").forEach(el => el.classList.remove("sch-slide-presented"));
      const pid = (typeof window.presentedScheduleId !== "undefined" && window.presentedScheduleId !== null) ? String(window.presentedScheduleId) : null;
      if (pid === null || !p || !p.data || !p.data[G]) return;
      const row = p.data[G];
      if (!(row.isSong == true) || String(row.schId) !== pid) return;
      const idx = (typeof window.presentedSlideIdx === "number" && window.presentedSlideIdx >= 0) ? window.presentedSlideIdx : 0;
      const el = document.getElementById(`schlyricsID${idx}`);
      if (el) el.classList.add("sch-slide-presented");
    } catch (e) {}
  };

  function b(S, V, U, R, T) {
    let W = "";
    if (S == false) {
      // V/U/R are 0-based indices (from selectedIndex). booknames[] is 0-based,
      // chapter/verse display is 1-based. bibleBook was a legacy undefined global.
      const bookName = (typeof booknames !== "undefined" && booknames[V]) ? booknames[V] : `Book ${V + 1}`;
      W = `${bookName} ${U + 1}:${R + 1}`;
    } else {
      // songManagerObj isn't ready on the very first render (it initializes
      // after schedule); the guarded re-init refreshes labels once it is.
      if (typeof songManagerObj === "undefined" || !songManagerObj) return "[S] Song";
      const song = songManagerObj.getSongObjWithID(T);
      W = song ? `[S] ${song.name}` : "[S] Unknown Song";
    }
    return W;
  }

  function o() {
    if (G > 0 && p && p.data) {
      const R = F(G);
      const T = z(G);
      const S = F(G - 1);
      const U = z(G - 1);
      B(T, S);
      B(U, R);
      G--;
    }
  }

  function J() {
    if (p && p.data && G < p.data.length - 1) {
      const R = F(G);
      const T = z(G);
      const S = F(G + 1);
      const U = z(G + 1);
      B(T, S);
      B(U, R);
      G++;
    }
  }

  function x() {
    if (p && p.data && p.data[G]) {
      const R = z(G);
      if (typeof window.presentedScheduleId !== "undefined" && window.presentedScheduleId !== null && String(R) === String(window.presentedScheduleId)) {
        window.presentedScheduleId = null;
      }
      Q(R);
    }
  }

  function n() {
    const R = confirm("Are you sure you want to delete ALL items from the Schedule?");
    if (R) k();
  }

  function t() {
    if (!p || !p.data || !p.data[G]) return;
    const R = p.data[G];
    if (R.isSong == false) {
      // bookSelIndex/chSelIndex/verseSelIndex/call_present() never existed.
      // Use the standard 0-based present path (mirrors recent.presentFromRecent).
      if (typeof present_external === "function") {
        present_external(R.book, R.ch, R.ver);
      } else {
        bookIndex = R.book;
        chapterIndex = R.ch;
        verseIndex = R.ver;
        const bookSel = document.getElementById("bookList");
        const chSel = document.getElementById("chapterList");
        const vSel = document.getElementById("verseList");
        if (bookSel) bookSel.selectedIndex = R.book;
        if (typeof putch === "function") putch();
        if (chSel) chSel.selectedIndex = R.ch;
        if (typeof putver === "function") putver();
        if (vSel) vSel.selectedIndex = R.ver;
        if (typeof present === "function") present();
      }
    } else {
      const S = songManagerObj.getSongObjWithID(R.songID);
      if (S) {
        const pres = new songPresentObj();
        pres.init(S);
        pres.present();
        window.presentedSlideIdx = 0;
      }
    }
    window.presentedScheduleId = R.schId;
    q(G);
    if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
    if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();
  }

  function O(R) {
    if (!p || !p.data || !p.data[R]) return;
    const S = p.data[R];
    if (S.isSong == false) {
      if (typeof present_external === "function") {
        present_external(S.book, S.ch, S.ver);
      } else {
        bookIndex = S.book;
        chapterIndex = S.ch;
        verseIndex = S.ver;
        if (typeof present === "function") present();
      }
    } else {
      const T = songManagerObj.getSongObjWithID(S.songID);
      if (T) {
        const pres = new songPresentObj();
        pres.init(T);
        pres.present();
      }
    }
    window.presentedScheduleId = S.schId;
    if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
  }

  function j() {
    let R = "";
    if (p && p.data != null) {
      const T = p.data.length;
      for (let S = 0; S < T; S++) {
        R = `${R}${b(p.data[S].isSong, p.data[S].book, p.data[S].ch, p.data[S].ver, p.data[S].songID)}\n`;
      }
    } else {
      R = "None";
    }
    return R;
  }

  function w(R) {
    if (y) console.log(`[SCHEDULE] ${R}`);
  }
}
