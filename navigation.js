let prevIcon;
let nextIcon;
let closeIcon;
function getNumofVerses() {
  return numofch[bookIndex + 1][chapterIndex + 1];
}
function processNextButton() {
  let a;
  const b = getNumofVerses();
  if (verseIndex + 1 == b) {
    a = 0;
  } else {
    a = verseIndex + 1;
  }
  verseIndex = a;
  launch(verseIndex);
}
function processNextButton_hold() {
  console.log(`CurrentIndex : ${newWindow.p_current_index}`);
  const b = document.getElementById("verseList").selectedIndex;
  let a;
  const c = getNumofVerses();
  console.log(`Verse: ${b} Max Verse: ${c}`);
  if (b + 1 == c) {
    a = 0;
  } else {
    a = b + 1;
  }
  document.getElementById("verseList").selectedIndex = a;
  present();
}
function processPrevButton() {
  let a;
  const b = getNumofVerses();
  if (verseIndex + 1 == 1) {
    a = b - 1;
  } else {
    a = verseIndex - 1;
  }
  verseIndex = a;
  launch(verseIndex);
}
function processPrevButton_hold() {
  console.log(`CurrentIndex : ${newWindow.p_current_index}`);
  const b = document.getElementById("verseList").selectedIndex;
  let a;
  const c = getNumofVerses();
  console.log(`Verse: ${b} Max Verse: ${c}`);
  if (b + 1 == 1) {
    a = c - 1;
  } else {
    a = b - 1;
  }
  document.getElementById("verseList").selectedIndex = a;
  present();
}
function disableNavButtons(a) {
  if (a) {
    document
      .getElementById("nextBut")
      .removeEventListener("click", processNextButton, false);
    document
      .getElementById("prevBut")
      .removeEventListener("click", processPrevButton, false);
    document
      .getElementById("closeBut")
      .removeEventListener("click", closePresentWindow, false);
  } else {
    document
      .getElementById("nextBut")
      .addEventListener("click", processNextButton, false);
    document
      .getElementById("prevBut")
      .addEventListener("click", processPrevButton, false);
    document
      .getElementById("closeBut")
      .addEventListener("click", closePresentWindow, false);
  }
}
function disableNavButtons_old(a) {
  document.getElementById("nextBut").disabled = a;
  document.getElementById("prevBut").disabled = a;
  document.getElementById("themeBut").disabled = a;
  document.getElementById("closeBut").disabled = a;
}
function processNavBibleRef() {
  const d = document.getElementById("nav_bibleRefID").value;
  const e = bibleRefObj.init(d);
  if (e) {
    const c = bibleRefObj.getBook();
    const b = bibleRefObj.getChapter();
    const a = bibleRefObj.getVerse();
    document.getElementById("bookList").selectedIndex = c;
    putch();
    document.getElementById("chapterList").selectedIndex = b - 1;
    putver();
    document.getElementById("verseList").selectedIndex = a - 1;
    window.presentedVerseIndex = a - 1;
    window.selectedVerseIndex = a - 1;
    updateVerseContainer();
    bibleRefObj.present();
  } else {
    alert(bibleRefObj.getErrorMessage());
  }
}
function processNavBibleRefFind() {
  const d = document.getElementById("nav_bibleRefID").value;
  const e = bibleRefObj.init(d);
  if (e) {
    const c = bibleRefObj.getBook();
    const b = bibleRefObj.getChapter();
    const a = bibleRefObj.getVerse();
    document.getElementById("bookList").selectedIndex = c;
    putch();
    document.getElementById("chapterList").selectedIndex = b - 1;
    putver();
    document.getElementById("verseList").selectedIndex = a - 1;
    window.selectedVerseIndex = a - 1;
    updateVerseContainer();
  } else {
    alert(bibleRefObj.getErrorMessage());
  }
}
function bibleRefBlur() {
  enterForBibleRef = false;
}
function bibleRefFocus() {
  enterForBibleRef = true;
}
function nav_addVerse2Schedule() {
  const b = getBookValue();
  const a = getChapterValue();
  const c = getVerseValue();
  const added = scheduleObj.processAddVerse(b, a, c);
  if (typeof showToast === "function") {
    const ref = (typeof booknames !== "undefined" && booknames[b]) ? `${booknames[b]} ${a + 1}:${c + 1}` : "Verse";
    if (added === false) {
      showToast(`${ref} is already in the Schedule`, "info");
    } else {
      showToast(`${ref} added to Schedule`);
    }
  }
}
function testxxx(a) {
  console.log(`X : ${a}`);
}

// Interactive verse card handler class
function verseClass() {
  this.init = j;
  let h = "";
  let k = null;
  let b = null;
  let i = null;
  let a = null;
  let c = null;
  function j(m, o, l, r, n, q) {
    a = m;
    h = o;
    k = l;
    b = r;
    i = n;
    c = q;
    const el = document.getElementById(a);
    if (!el) return;
    const p = `${navFontSize}px`;
    el.style.fontSize = p;
    el.style.fontFamily = q;
    el.innerHTML = `<a href="#">${h}</a>`;
    d();
  }
  function d() {
    const el = document.getElementById(a);
    if (el) el.addEventListener("click", g, false);
  }
  function g() {
    bookIndex = k - 1;
    chapterIndex = b - 1;
    verseIndex = i - 1;
    // Track search-result presentations so the row can highlight; presenting
    // from anywhere else clears the search highlight.
    const m = /searchVC[12]_(\d+)/.exec(a || "");
    window.presentedSearchIdx = m ? parseInt(m[1], 10) : -1;
    if (typeof recent !== "undefined" && recent && typeof recent.addSelection === "function") {
      recent.addSelection(bookIndex, chapterIndex, verseIndex);
    }
    getdata();
    p_footer = `${bibleVersionArray[version1][3]} / ${bibleVersionArray[version2][3]}`;
    p_title = `${booknames[bookIndex]} ${chapterIndex + 1}:${verseIndex + 1}`;
    launch(verseIndex);
    const vList = document.getElementById("verseList");
    if (vList) vList.selectedIndex = verseIndex;
    if (typeof disableNavButtons === "function") disableNavButtons(false);
    if (typeof updateVerseHighlight === "function") updateVerseHighlight();
  }
}
function slideshow() {
  bookIndex = document.getElementById("bookList").selectedIndex;
  chapterIndex = document.getElementById("chapterList").selectedIndex;
  verseIndex = document.getElementById("verseList").selectedIndex;
  getdata();
  p_footer = `${bibleVersionArray[version1][3]} / ${bibleVersionArray[version2][3]}`;
  p_title = `${booknames[bookIndex]} ${chapterIndex + 1}:${verseIndex + 1}`;
  launch(verseIndex);
}
