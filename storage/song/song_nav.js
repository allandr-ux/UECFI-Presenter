/**
 * Song Navigation Controller
 * 
 * Manages song selection, filtering by category, song search,
 * and presentation trigger. Refactored from legacy YUI DataTable
 * to native AppUI.DataTable.
 */
function songNavClass() {
  this.init = I;
  this.setFormats = A;
  this.update_songList = H;
  this.update_CategoryList = B;
  this.searchComplete = s;
  this.processExportSongDB = v;
  this.isSongSearchEditActive = c;
  this.sn_searchSong = d;
  this.sn_newSong = j;
  this.sn_editSong = p;
  this.sn_deleteSong = n;
  this.sn_deleteSongByCat = q;
  this.setSelectedSong = function(newIdx, newTitle) {
    if (newIdx != null) {
      a = newIdx;
      if (newTitle) b = newTitle;
      F();
    }
  };

  let songListTable = null;
  let o = null;
  let k = true;
  let D = false;
  let a = 0;
  let b = "";
  let m = 20;
  let J = false;
  let r = false;

  // Global song dataset container
  window.songDataStore = { songTitle: [] };

  function I() {
    E();
    i();
    o = new songObj();
    o.init();
    o.slides = [];
    k = true;
  }

  function E() {
    new icon("songnav_presentbutton", " PRESENT Song ", "graphics/icon/present_48.png", "graphics/icon/present_48.png", "");
    new icon("songnav_prevbutton", " PREVIOUS Slide ", "graphics/icon/left.png", "graphics/icon/left.png", "");
    new icon("songnav_nextbutton", " NEXT Slide ", "graphics/icon/right.png", "graphics/icon/right.png", "");
    new icon("songnav_closebutton", " CLOSE Presentation ", "graphics/icon/closepresent_32.png", "graphics/icon/closepresent_32.png", "");
    new icon("songnav_add2schedule_button", " SCHEDULE Song ", "graphics/icon/schedule32.png", "graphics/icon/schedule32.png", "");
    new icon("songnav_searchbutton", " SEARCH Song ", "graphics/icon/search_32.png", "graphics/icon/search_32.png", "");
    new icon("songnav_clearbutton", " CLEAR Search ", "graphics/icon/clearsearch_32.png", "graphics/icon/clearsearch_32.png", "");
  }

  function i() {
    const catSel = document.getElementById("songnav_category");
    if (catSel) catSel.addEventListener("change", z, false);

    const btnPresent = document.getElementById("songnav_presentbutton");
    if (btnPresent) btnPresent.addEventListener("click", l, false);

    const btnPrev = document.getElementById("songnav_prevbutton");
    if (btnPrev) btnPrev.addEventListener("click", y, false);

    const btnNext = document.getElementById("songnav_nextbutton");
    if (btnNext) btnNext.addEventListener("click", h, false);

    const btnClose = document.getElementById("songnav_closebutton");
    if (btnClose) btnClose.addEventListener("click", e, false);

    const btnSchedule = document.getElementById("songnav_add2schedule_button");
    if (btnSchedule) btnSchedule.addEventListener("click", x, false);

    const btnSearch = document.getElementById("songnav_searchbutton");
    if (btnSearch) btnSearch.addEventListener("click", d, false);

    const btnClear = document.getElementById("songnav_clearbutton");
    if (btnClear) btnClear.addEventListener("click", f, false);

    const editBox = document.getElementById("songnav_editbox");
    if (editBox) {
      editBox.addEventListener("blur", K);
      editBox.addEventListener("focus", G);
    }
  }

  function K() { D = false; }
  function G() { D = true; }
  function c() { return D; }

  function A() {
    m = parseInt((tabHeight - 285) / 22);
    if (!k) {
      setTimeout(() => C(), 100);
    }
  }

  function z() {
    const catEl = document.getElementById("songnav_category");
    const M = catEl.selectedIndex;
    const L = catEl.options[M].text;
    t("Selected Category Value: " + L);
    songManagerObj.getSongsFromCat(L);
  }

  function j() {
    songEditObj.showEditPanel(null, false, null);
  }

  function p() {
    t("Launch panel edit song..");
    songEditObj.showEditPanel(o, true, a);
  }

  function H(L, Q) {
    window.songDataStore.songTitle.length = 0;
    if (L && L.data) {
      const N = L.data.length;
      for (let O = 0; O < N; O++) {
        if (Q === "_ALL" || L.data[O].cat === Q) {
          window.songDataStore.songTitle.push({
            ID: O,
            Title: L.data[O].name,
            id: L.data[O].id
          });
        }
      }
    }
    C();
  }

  function B(P) {
    clearSelectList("songnav_category");
    const catEl = document.getElementById("songnav_category");
    catEl.options[0] = new Option("_ALL", 0);
    if (P && P.data) {
      const L = P.data.length;
      let N = 1;
      for (let M = 0; M < L; M++) {
        if (P.data[M].cat != null) {
          catEl.options[N] = new Option(P.data[M].cat, N);
          N++;
        }
      }
    }
    catEl.selectedIndex = 0;
  }

  function F() {
    o = songManagerObj.getSongObj(a, J);
    u(o);
  }

  function l() {
    const L = new songPresentObj();
    L.init(o);
    L.present();
  }

  function y() {
    t("Calling prev slide from song_nav.js");
    call_prevSlide();
  }

  function h() {
    t("Calling next slide from song_nav.js");
    call_nextSlide();
  }

  function e() {
    call_closePresentation();
  }

  function n() {
    const M = confirm('Do you want to delete "' + b + '" ?');
    if (M) {
      let L = a;
      if (a !== 0) a = a - 1;
      songManagerObj.deleteSong(L);
    }
  }

  function q() {
    const catEl = document.getElementById("songnav_category");
    const N = catEl.selectedIndex;
    const M = catEl.options[N].text;
    if (M !== "_ALL") {
      const L = confirm('Do you want to delete ALL songs from "' + M + '" category?');
      if (L) {
        a = 0;
        songManagerObj.deleteSongByCat(M);
      }
    } else {
      alert("Can not delete the _ALL category. Please select a specific category.");
    }
  }

  function d() {
    const editBox = document.getElementById("songnav_editbox");
    let L = editBox ? editBox.value : "";
    L = "%" + L + "%";
    songManagerObj.searchRecords(L);
  }

  function f() {
    J = false;
    z();
  }

  function u(L) {
    if (!L) return;
    const R = navFontSize + "px";
    document.getElementById("ly").style.fontSize = R;
    document.getElementById("ly_name").innerHTML = L.name || "";
    document.getElementById("ly_cat").innerHTML = L.catIndex || "";
    document.getElementById("ly_font").innerHTML = L.font || "";
    document.getElementById("ly_key").innerHTML = L.key || "";
    document.getElementById("ly_copy").innerHTML = L.copyright || "";
    document.getElementById("ly_notes").innerHTML = L.notes || "";
    document.getElementById("ly_slide").style.fontFamily = L.font || "sans-serif";

    const Q = L.slides ? L.slides.length : 0;
    let N = "";
    for (let P = 0; P < Q; P++) {
      N = N + '<div id="lyricsID' + P + '"></div><hr>';
    }
    document.getElementById("ly_slide").innerHTML = N;
    for (let P = 0; P < Q; P++) {
      const O = "lyricsID" + P;
      const lyr = new songLyricsClass();
      lyr.init(L, O, P);
    }
  }

  function s(L) {
    t("Search Complete");
    if (L != null) {
      J = true;
      H(L, "_ALL");
    } else {
      alert("No match");
    }
  }

  async function v() {
    const P = "./song/default.db";
    const srcPath = AppStorage.resolvePath(P);
    const destDir = AppStorage.resolvePath("vvexport");
    const destPath = AppStorage.resolvePath("vvexport", "default_songs.db");
    try {
      AppStorage.copyFile(srcPath, destPath, true);
      alert('Song database saved to vvexport folder: ' + destPath);
    } catch(err) {
      alert('Unable to save song database: ' + err.message);
    }
  }

  function x() {
    const L = songManagerObj.getSongID(a, J);
    scheduleObj.processAddSong(L);
  }

  function t(L) {
    if (r) console.log("[SongNav] " + L);
  }

  function C() {
    t("Fired datatable fill for songs.....");
    songListTable = new AppUI.DataTable(
      "songnav_songlistnew",
      [{ key: "Title" }],
      window.songDataStore.songTitle
    );

    songListTable.on("select", (record) => {
      if (record) {
        a = record.ID;
        b = record.Title;
        F();
      } else {
        a = 0;
        b = "";
      }
    });

    if (window.songDataStore.songTitle.length > 0) {
      const idxToSelect = (a >= 0 && a < window.songDataStore.songTitle.length) ? a : 0;
      songListTable.selectRow(idxToSelect);
    } else {
      a = 0;
      b = "";
    }
    k = false;
    // Trigger immediate render of modern song list cards if initialized
    if (typeof window.renderModernSongList === "function") {
      window.renderModernSongList();
    }
  }
}