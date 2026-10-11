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
    }
    const adSearchEl = document.getElementById("adSearch");
    if (adSearchEl) {
      adSearchEl.addEventListener("blur", u);
      adSearchEl.addEventListener("focus", v);
    }
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
  // Scans the loaded primary Bible XML directly -- no separate search
  // database needed. Same matching semantics as the old SQL version:
  // every keyword must occur in the same verse (Contains), or the whole
  // input must occur as one phrase (Exact). Returns [{bookNum, chNum,
  // verseNum}] with 1-based book numbers, or [] when nothing is loaded.
  function scanBible(V, onlyBook) {
    const rows = [];
    try {
      const root = (typeof bible !== "undefined" && bible[version1]) ? bible[version1] : null;
      if (!root) return rows;
      const words = (V || [])
        .map(p => String(p).replace(/^%+|%+$/g, "").toLowerCase())
        .filter(word => word !== "");
      if (words.length === 0) return rows;
      const bookFilter = parseInt(onlyBook, 10) || 0;
      const books = root.getElementsByTagName("b");
      for (let bi = 0; bi < books.length; bi++) {
        const bookNum = bi + 1;
        if (bookFilter !== 0 && bookFilter !== bookNum) continue;
        const chs = books[bi].getElementsByTagName("c");
        for (let ci = 0; ci < chs.length; ci++) {
          const vs = chs[ci].getElementsByTagName("v");
          for (let vi = 0; vi < vs.length; vi++) {
            const hay = (vs[vi].textContent || "").toLowerCase();
            let ok = true;
            for (let k = 0; k < words.length; k++) {
              if (hay.indexOf(words[k]) === -1) {
                ok = false;
                break;
              }
            }
            if (ok) rows.push({ bookNum: bookNum, chNum: ci + 1, verseNum: vi + 1 });
          }
        }
      }
    } catch (err) {
      console.error("[SEARCH] XML scan error:", err);
    }
    return rows;
  }
  function T() {
    const V = m(0);
    console.log(`Length of keyword array: ${V[0]}`);
    const rows = scanBible(V, 0);
    G = { data: rows.length > 0 ? rows : null };
    x();
  }
  function f() {
    const V = m(e);
    console.log(`Length of keyword array: ${V.length}`);
    const rows = scanBible(V, l);
    G = { data: rows.length > 0 ? rows : null };
    x();
  }
  function x(U) {
    K.stop();
    console.log(`Time to search:${K.delta()}`);
    O = 0;
    J = 50;
    k();
    K.stop();
    console.log(`Time to print:${K.delta()}`);
    // Tab 4 is Search (0: Verses, 1: Lyrics, 2: Program, 3: Notes, 4: Search, 5: Schedule, 6: Graphics)
    tabViewN.selectTab(4);
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
        var ae = `<font face="Arial, Helvetica, sans-serif">${booknames[ai.bookNum - 1]} ${ai.chNum}:${ai.verseNum}</font><br>${U}`;
        var ad = bibleVersionArray[version2][6];
        Y[i].init(aa, ae, ai.bookNum, ai.chNum, ai.verseNum, ad);
      }
      if (A > J) {
        document.getElementById("prevResult").addEventListener("click", a);
        document.getElementById("nextResult").addEventListener("click", h);
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
  }
  function a() {
    let U = O - J;
    if (U < 0) {
      const V = A % J;
      U = A - V;
    }
    O = U;
    k();
  }
  function b(V) {
    console.log("Error message:", V.error.message);
    console.log("Details:", V.error.details);
    const U = `Error message:${V.error.message} Details:${V.error.details}Error handling results Contact uecfipresenter@yahoo.com with this error message`;
    alert(U);
  }
  function p() {
    const U = j(0);
    if (U) {
      document.getElementById("adSearch").value = C;
      K.start();
      e = 0;
      T();
    }
  }
  function s() {
    const U = j(1);
    if (U) {
      K.start();
      e = document.getElementById("searchStyle").value;
      l = document.getElementById("searchBook").value;
      f();
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
  function j(V) {
    if (V == 0) {
      C = document.getElementById("searchID").value;
    } else {
      C = document.getElementById("adSearch").value;
    }
    const W = C.replace(/ /g, "");
    if (W == null) {
      alert("Invalid Search Entry");
      return false;
    }
    const U = W.split("");
    if (U.length < 3) {
      alert("Invalid or Small word for search");
      return false;
    }
    return true;
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
    if (U == 0) {
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
  function g(U) {
    let ab = U;
    if (e == 0) {
      const Z = C.split(" ");
      const ac = ab.split(" ");
      for (var aa = 0; aa < ac.length; aa++) {
        for (let X = 0; X < Z.length; X++) {
          const W = ac[aa].toLowerCase();
          const ad = Z[X].toLowerCase();
          const Y = W.match(ad);
          if (Y != null) {
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
      ab = ab.replace(new RegExp(C, "gi"), V);
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
