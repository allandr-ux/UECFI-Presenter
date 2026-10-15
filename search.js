function vvsearch(M) {
  this.init = P;
  this.close = N;
  this.setFontSize = y;
  this.searchKeywordInit = H;
  let r = 3;
  var G = null;
  let Q;
  let q;
  let A;
  let O = 0;
  let J = 50;
  let C;
  let e = 0;
  let l = 0;
  let w = false;
  let F = false;
  let K = null;
  function P() {
    t();
    K = new stopWatch();
    E();
  }
  function N() {
    S();
  }
  function t() {
    document.getElementById("searchButtonID").addEventListener("click", p);
    document.getElementById("adSearchButton").addEventListener("click", s);
    const searchEl = document.getElementById("searchID");
    if (searchEl) {
      searchEl.addEventListener("blur", d);
      searchEl.addEventListener("focus", n);
      searchEl.addEventListener("input", onBasicInput);
    }
    const adSearchEl = document.getElementById("adSearch");
    if (adSearchEl) {
      adSearchEl.addEventListener("blur", u);
      adSearchEl.addEventListener("focus", v);
      adSearchEl.addEventListener("input", onAdvancedInput);
    }
    const styleEl = document.getElementById("searchStyle");
    if (styleEl) styleEl.addEventListener("change", onAdvancedInput);
    const bookEl = document.getElementById("searchBook");
    if (bookEl) bookEl.addEventListener("change", onAdvancedInput);
  }
  function n() {
    w = true;
  }
  function d() {
    w = false;
  }
  function v() {
    F = true;
  }
  function u() {
    F = false;
  }
  function S() {
    document.getElementById("searchButtonID").removeEventListener("click", p);
    document.getElementById("adSearchButton").removeEventListener("click", s);
    const searchEl = document.getElementById("searchID");
    if (searchEl) searchEl.removeEventListener("input", onBasicInput);
    const adSearchEl = document.getElementById("adSearch");
    if (adSearchEl) adSearchEl.removeEventListener("input", onAdvancedInput);
    const styleEl = document.getElementById("searchStyle");
    if (styleEl) styleEl.removeEventListener("change", onAdvancedInput);
    const bookEl = document.getElementById("searchBook");
    if (bookEl) bookEl.removeEventListener("change", onAdvancedInput);
    if (quietTimer) {
      try { clearTimeout(quietTimer); } catch (e) {}
      quietTimer = null;
    }
  }
  // Live as-you-type search: debounced quiet runs that never alert and
  // never yank the tab view. Explicit Search buttons / Enter keep the
  // classic switching behavior.
  let quietTimer = null;
  function onBasicInput() {
    queueLiveSearch(false);
  }
  function onAdvancedInput() {
    queueLiveSearch(true);
  }
  function queueLiveSearch(isAdvanced) {
    try {
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        quietTimer = null;
        runQuietSearch(isAdvanced);
      }, 350);
    } catch (e) {}
  }
  function runQuietSearch(isAdvanced) {
    try {
      if (isAdvanced) s(true);
      else p(true);
    } catch (e) {}
  }
  function E() {
    clearSelectList("searchBook");
    document.getElementById("searchBook").options[0] = new Option(
      "All Books",
      0,
    );
    const V = booknames.length;
    for (let U = 1; U <= V; U++) {
      document.getElementById("searchBook").options[U] = new Option(
        booknames[U - 1],
        U,
      );
    }
    document.getElementById("searchBook").selectedIndex = 0;
  }
  // Scans the loaded Bible XMLs directly -- no separate search database
  // needed. A verse matches when the query hits EITHER active version
  // (primary or secondary). Modes: 0 = every keyword occurs in the verse
  // (Contains), 1 = whole input occurs as one phrase (Exact Phrase),
  // 2 = every keyword occurs as a whole word (Exact Word).
  // Returns [{bookNum, chNum, verseNum}] with 1-based book numbers.
  function verseMatches(hays, words, wholeWord) {
    // Whole-word mode normalizes keywords exactly like haystack tokens
    // (splits hyphens etc.), so "pag-ibig" can match "pag-ibig".
    let keys = words;
    if (wholeWord) {
      keys = [];
      words.forEach(w => String(w).split(/[^\p{L}\p{N}]+/u).forEach(t => { if (t !== "") keys.push(t); }));
      if (keys.length === 0) return false;
    }
    for (let hi = 0; hi < hays.length; hi++) {
      const hay = hays[hi];
      if (!hay) continue;
      let ok = true;
      for (let k = 0; k < keys.length; k++) {
        if (hay.indexOf(keys[k]) === -1) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (wholeWord) {
        // Substring pre-check passed; verify whole-word boundaries with a
        // Unicode-aware token set (splits hyphens, keeps ñ/accents intact).
        // "Ama" therefore never matches "Laman" or "Naman".
        const tokens = new Set(hay.split(/[^\p{L}\p{N}]+/u));
        for (let k = 0; k < keys.length; k++) {
          if (!tokens.has(keys[k])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
      }
      return true;
    }
    return false;
  }
  function scanBible(V, onlyBook, mode) {
    const rows = [];
    try {
      const root = (typeof bible !== "undefined" && bible[version1]) ? bible[version1] : null;
      if (!root) return rows;
      const root2 = (typeof version2 !== "undefined" && version2 !== version1
        && typeof bible !== "undefined" && bible[version2]) ? bible[version2] : null;
      const words = (V || [])
        .map(p => String(p).replace(/^%+|%+$/g, "").toLowerCase())
        .filter(word => word !== "");
      if (words.length === 0) return rows;
      const wholeWord = (mode === 2);
      const bookFilter = parseInt(onlyBook, 10) || 0;
      const books = root.getElementsByTagName("b");
      const books2 = root2 ? root2.getElementsByTagName("b") : null;
      for (let bi = 0; bi < books.length; bi++) {
        const bookNum = bi + 1;
        if (bookFilter !== 0 && bookFilter !== bookNum) continue;
        const chs = books[bi].getElementsByTagName("c");
        const chs2 = (books2 && books2[bi]) ? books2[bi].getElementsByTagName("c") : null;
        for (let ci = 0; ci < chs.length; ci++) {
          const vs = chs[ci].getElementsByTagName("v");
          const vs2 = (chs2 && chs2[ci]) ? chs2[ci].getElementsByTagName("v") : null;
          for (let vi = 0; vi < vs.length; vi++) {
            const hay1 = (vs[vi].textContent || "").toLowerCase();
            let hay2 = "";
            try {
              const v2 = vs2 ? vs2[vi] : null;
              hay2 = ((v2 && v2.textContent) || "").toLowerCase();
            } catch (e2) {}
            if (verseMatches([hay1, hay2], words, wholeWord)) {
              rows.push({ bookNum: bookNum, chNum: ci + 1, verseNum: vi + 1 });
            }
          }
        }
      }
    } catch (err) {
      console.error("[SEARCH] XML scan error:", err);
    }
    return rows;
  }
  function T(quiet) {
    const V = m(0);
    console.log(`Length of keyword array: ${V[0]}`);
    const rows = scanBible(V, 0, 0);
    G = { data: rows.length > 0 ? rows : null };
    x(quiet);
  }
  function f(quiet) {
    const V = m(e);
    console.log(`Length of keyword array: ${V.length}`);
    const rows = scanBible(V, l, parseInt(e, 10) || 0);
    G = { data: rows.length > 0 ? rows : null };
    x(quiet);
  }
  function x(U) {
    const quiet = (U === true);
    K.stop();
    console.log(`Time to search:${K.delta()}`);
    O = 0;
    J = 50;
    k();
    K.stop();
    console.log(`Time to print:${K.delta()}`);
    // Explicit searches jump to the results tab; live typing stays put.
    // Tab 3 is Search (0: Verses, 1: Lyrics, 2: Slides, 3: Search, 4: Schedule)
    if (!quiet) tabViewN.selectTab(3);
  }
  function k() {
    const V = document.getElementById("searchResultID");
    V.innerHTML = "";
    if (G.data == null) {
      V.innerHTML = `No match found for "<b>${C}</b>".`;
    } else {
      A = G.data.length;
      let ag = "";
      let X = J;
      if (A < O + J) {
        X = A - O;
      }
      ag = `${ag}Found <b>${A}</b> results for "<b>${C}</b>". Showing results ${O + 1} to ${O + X}<br>`;
      if (A > J) {
        ag = `${ag}<input class="style2" type="button" id="prevResult" value=" PREVIOUS ">`;
        ag = `${ag}<input class="style2" type="button" id="nextResult" value="   NEXT   ">`;
      }
      ag = `${ag}<input class="style2" type="button" id="saveResult" value=" SAVE RESULTS ">`;
      ag = `${ag}<br><br>`;
      ag = `${ag}<table border=0>`;
      for (i = O; i < O + X; i++) {
        ag = `${ag}<tr class="vcClass" data-search-idx="${i}"><td width="4%">`;
        var ab = `searchNC_${i}`;
        ag = `${ag}<div class="vcClass" id="${ab}"><img src="graphics/icon/notes_s.png"></div>`;
        ag = `${ag}</td><td class="navtd" width="48%">`;
        var ab = `searchVC1_${i}`;
        ag = `${ag}<div class="vcClass" id="${ab}">a</div>`;
        ag = `${ag}</td><td class="navtd" width="48%">`;
        var ab = `searchVC2_${i}`;
        ag = `${ag}<div class="vcClass" id="${ab}">b</div>`;
        ag = `${ag}</td></tr>`;
      }
      ag = `${ag}</table>`;
      if (A > J) {
        ag = `${ag}<br><div>Showing results ${O + 1} to ${O + X} of ${A}<br>`;
        ag = `${ag}<input class="style2" type="button" id="prevResultB" value=" PREVIOUS ">`;
        ag = `${ag}<input class="style2" type="button" id="nextResultB" value="   NEXT   "></div>`;
      }
      V.innerHTML = ag;
      const ah = new Array();
      const Z = new Array();
      const Y = new Array();
      for (i = O; i < O + X; i++) {
        const ac = `searchNC_${i}`;
        const af = `searchVC1_${i}`;
        const aa = `searchVC2_${i}`;
        const ai = G.data[i];
        ah[i] = new postit();
        ah[i].init(ac, ai.bookNum, ai.chNum, ai.verseNum);
        let W = bible[version1]
          .getElementsByTagName("b")
          [ai.bookNum - 1].getElementsByTagName("c")
          [ai.chNum - 1].getElementsByTagName("v")[ai.verseNum - 1].textContent;
        const U = bible[version2]
          .getElementsByTagName("b")
          [ai.bookNum - 1].getElementsByTagName("c")
          [ai.chNum - 1].getElementsByTagName("v")[ai.verseNum - 1].textContent;
        W = g(W);
        Z[i] = new verseClass();
        var ae = `<font face="Arial, Helvetica, sans-serif">${booknames[ai.bookNum - 1]} ${ai.chNum}:${ai.verseNum}</font><br>${W}`;
        var ad = bibleVersionArray[version1][6];
        Z[i].init(af, ae, ai.bookNum, ai.chNum, ai.verseNum, ad);
        Y[i] = new verseClass();
        var ae = `<font face="Arial, Helvetica, sans-serif">${booknames[ai.bookNum - 1]} ${ai.chNum}:${ai.verseNum}</font><br>${g(U)}`;
        var ad = bibleVersionArray[version2][6];
        Y[i].init(aa, ae, ai.bookNum, ai.chNum, ai.verseNum, ad);
      }
      if (A > J) {
        document.getElementById("prevResult").addEventListener("click", a);
        document.getElementById("nextResult").addEventListener("click", h);
        document.getElementById("prevResultB").addEventListener("click", a);
        document.getElementById("nextResultB").addEventListener("click", h);
      }
      document.getElementById("saveResult").addEventListener("click", c);
      if (typeof updateVerseHighlight === "function") updateVerseHighlight();
    }
  }
  function c() {
    let W = "";
    W = `${W}<div class="style2">Enter a filename for the search results. <br><input type="text" size="20" id="promptTextID"><br>`;
    W = `${W}<br><input type="button" id="promptSaveID" value=" SAVE "> |`;
    W = `${W}<input type="button" id="promptCancelID" value=" CANCEL "></DIV>`;
    const U = new AppUI.Modal("prompt_panelObj");
    U.render(document.body);
    U.setHeader("Filename");
    U.setBody(W);
    document.getElementById("promptSaveID").addEventListener("click", V, false);
    document
      .getElementById("promptCancelID")
      .addEventListener("click", X, false);
    U.show();
    function X() {
      document.getElementById("promptTextID").value = "";
      U.hide();
    }
    function V() {
      const ae = G.data.length;
      let ag = "";
      const aa = document.getElementById("promptTextID").value;
      U.hide();
      ag = `${ag}<HTML>\n<HEAD>\n<TITLE>Search Result for: ${C}</TITLE>\n</HEAD>\n<BODY>\n`;
      ag = `${ag}<H1>Search Result for: ${C}</H1><br><br>\n`;
      ag = `${ag}<TABLE>\n`;
      for (let af = 0; af < ae; af++) {
        const ah = G.data[af];
        const ab = `${af + 1}......${booknames[ah.bookNum - 1]} ${ah.chNum}:${ah.verseNum}`;
        const Z = bible[version1]
          .getElementsByTagName("b")
          [ah.bookNum - 1].getElementsByTagName("c")
          [ah.chNum - 1].getElementsByTagName("v")[ah.verseNum - 1].textContent;
        const Y = bible[version2]
          .getElementsByTagName("b")
          [ah.bookNum - 1].getElementsByTagName("c")
          [ah.chNum - 1].getElementsByTagName("v")[ah.verseNum - 1].textContent;
        const ad = bibleVersionArray[version1][6];
        const ac = bibleVersionArray[version2][6];
        ag = `${ag}<tr>\n`;
        ag = `${ag}<td width=14%>${ab}</td>\n`;
        ag = `${ag}<td width=43%><font face="${ad}">${Z}</font></td>\n`;
        ag = `${ag}<td width=43%><font face="${ac}">${Y}</font></td>\n`;
        ag = `${ag}</tr>\n`;
        ag = `${ag}<tr><td><br></td> <td><br></td> <td><br></td></tr>\n`;
      }
      ag = `${ag}</TABLE>\n</BODY>`;
      filesave2vvexport(ag, aa);
      alert(
        `Search Result File "${aa}.html" saved to vvexport folder on the desktop.`,
      );
    }
  }
  function h() {
    let U = O + J;
    if (U > A) {
      U = 0;
    }
    O = U;
    k();
    scrollSearchToTop();
  }
  function a() {
    let U = O - J;
    if (U < 0) {
      const V = A % J;
      U = A - V;
    }
    O = U;
    k();
    scrollSearchToTop();
  }
  // Paging rebuilds the results list: return the viewport to the top
  // so the new page reads from the first row.
  function scrollSearchToTop() {
    try {
      const host = document.getElementById("searchResultID");
      const scroller = host ? host.closest(".overflow-y-auto") : null;
      if (scroller) scroller.scrollTop = 0;
      else if (host) host.scrollIntoView({ block: "start" });
    } catch (e) {}
  }
  function b(V) {
    console.log("Error message:", V.error.message);
    console.log("Details:", V.error.details);
    const U = `Error message:${V.error.message} Details:${V.error.details}Error handling results Contact uecfipresenter@yahoo.com with this error message`;
    alert(U);
  }
  function p(quiet) {
    const U = j(0, quiet === true);
    if (U) {
      document.getElementById("adSearch").value = C;
      K.start();
      e = 0;
      T(quiet === true);
    }
  }
  function s(quiet) {
    const U = j(1, quiet === true);
    if (U) {
      K.start();
      e = document.getElementById("searchStyle").value;
      l = document.getElementById("searchBook").value;
      f(quiet === true);
    }
  }
  function H() {
    if (w) {
      p();
    } else {
      if (F) {
        s();
      } else {
      }
    }
  }
  function j(V, quiet) {
    if (V == 0) {
      C = document.getElementById("searchID").value;
    } else {
      C = document.getElementById("adSearch").value;
    }
    const W = C.replace(/ /g, "");
    if (W == null) {
      if (!quiet) alert("Invalid Search Entry");
      return false;
    }
    const U = W.split("");
    if (U.length < 3) {
      if (quiet) {
        showSearchHint();
      } else {
        alert("Invalid or Small word for search");
      }
      return false;
    }
    return true;
  }
  // Live-typing placeholder when the query is too short to run.
  function showSearchHint() {
    try {
      const V = document.getElementById("searchResultID");
      if (V) {
        V.innerHTML = '<div class="text-center py-16 text-slate-400">'
          + '<i class="fa-solid fa-magnifying-glass text-4xl mb-3 text-slate-300"></i>'
          + '<h3 class="text-sm font-bold text-slate-600">Keep typing…</h3>'
          + '<p class="text-xs text-slate-400 mt-1">Results appear once you type at least 3 letters.</p></div>';
      }
    } catch (e) {}
  }
  function z(U) {
    let V = null;
    if (U == 0) {
      const X = C.split(" ");
      V = "%";
      for (let W = 0; W < X.length; W++) {
        console.log(X[W]);
        if (X[W] != "") {
          V = `${V + X[W]}%`;
        }
      }
    } else {
      V = `%${C}%`;
    }
    return V;
  }
  function m(U) {
    const V = new Array();
    if (U == 0 || U == 2) {
      let Y = 0;
      const X = C.split(" ");
      for (let W = 0; W < X.length; W++) {
        if (X[W] != "") {
          V[Y] = `%${X[W]}%`;
          console.log(V[Y]);
          Y++;
        }
      }
    } else {
      V[0] = `%${C}%`;
    }
    return V;
  }
  // Escape literal text for use inside a RegExp (typed queries often
  // contain characters like "(" mid-word while the user is still typing).
  function escReg(s) {
    return String(s == null ? "" : s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function g(U) {
    let ab = U;
    if (e == 2) {
      // Exact Word: wrap a display word only when the keyword occurs in it
      // as a full token -- "Ama," highlights, "Laman" never does.
      const Z = C.split(" ").map(s => String(s).toLowerCase()).filter(s => s !== "");
      const ac = ab.split(" ");
      for (var aa = 0; aa < ac.length; aa++) {
        const toks = ac[aa].toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t !== "");
        let hit = false;
        for (let X = 0; X < Z.length && !hit; X++) {
          const parts = Z[X].split(/[^\p{L}\p{N}]+/u).filter(t => t !== "");
          if (parts.length > 0 && parts.every(p => toks.indexOf(p) !== -1)) hit = true;
        }
        if (hit) ac[aa] = `<span class="highlighttext">${ac[aa]}</span> `;
      }
      ab = "";
      for (var aa = 0; aa < ac.length; aa++) {
        ab = `${ab + ac[aa]} `;
      }
    } else if (e == 0) {
      const Z = C.split(" ");
      const ac = ab.split(" ");
      for (var aa = 0; aa < ac.length; aa++) {
        for (let X = 0; X < Z.length; X++) {
          const W = ac[aa].toLowerCase();
          const ad = Z[X].toLowerCase();
          if (ad !== "" && W.indexOf(ad) !== -1) {
            ac[aa] = `<span class="highlighttext">${ac[aa]}</span> `;
            break;
          }
        }
      }
      ab = "";
      for (var aa = 0; aa < ac.length; aa++) {
        ab = `${ab + ac[aa]} `;
      }
    } else {
      const V = `<span class="highlighttext">${C}</span> `;
      ab = ab.replace(new RegExp(escReg(C), "gi"), V);
    }
    return ab;
  }
  function y(U) {
    r = U;
    if (G != null) {
      k();
    }
  }
}
