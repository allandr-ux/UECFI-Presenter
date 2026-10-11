recent = {
  maxNumofElements: 30,
  numofElements: 0,
  startIndex: 0,
  nextIndex: 0,
  bArray: [],
  cArray: [],
  vArray: [],
  init() {
    recent.numofElements = 0;
    recent.startIndex = 0;
    recent.nextIndex = 0;
    recent.bArray = new Array();
    recent.cArray = new Array();
    recent.vArray = new Array();
    console.log("Initialzied Recent Selection");
    recent.dispSelection();
  },
    addSelection(a, f, d) {
    let duplicateIndex = -1;
    for (let i = 0; i < recent.numofElements; i++) {
       if (recent.bArray[i] === a && recent.cArray[i] === f && recent.vArray[i] === d) {
           duplicateIndex = i;
           break;
       }
    }
    if (duplicateIndex !== -1) {
        recent.bArray.splice(duplicateIndex, 1);
        recent.cArray.splice(duplicateIndex, 1);
        recent.vArray.splice(duplicateIndex, 1);
        recent.numofElements--;
        recent.nextIndex--;
    }
    recent.bArray.unshift(a);
    recent.cArray.unshift(f);
    recent.vArray.unshift(d);
    recent.numofElements++;
    recent.nextIndex++;
    if (recent.numofElements > recent.maxNumofElements) {
        recent.bArray.pop();
        recent.cArray.pop();
        recent.vArray.pop();
        recent.numofElements--;
        recent.nextIndex--;
    }
    recent.dispSelection();
    const e = `${booknames[a]} ${f + 1}:${d + 1} added to Recent list`;
    printStatus(e, false);
  },
  updateIndex() {
    recent.nextIndex++;
    recent.numofElements++;
  },
  dispSelection() {
    const a = new Array();
    for (i = 0; i < recent.numofElements; i++) {
      a[i] =
        `${booknames[recent.bArray[i]]} ${recent.cArray[i] + 1}:${recent.vArray[i] + 1}`;
    }
    clearSelectList("recentSel");
    for (i = 0; i < recent.numofElements; i++) {
      document.getElementById("recentSel").options[i] = new Option(a[i], i);
    }
    document.getElementById("recentSel").selectedIndex = 0;
    document
      .getElementById("recentSel")
      .addEventListener("click", recent.presentFromRecent, false);
  },
  presentFromRecent(b) {
    const a =
      document.getElementById("recentSel").options[
        document.getElementById("recentSel").selectedIndex
      ].value;
    bookIndex = recent.bArray[a];
    chapterIndex = recent.cArray[a];
    verseIndex = recent.vArray[a];
    getdata();
    p_footer = `${bibleVersionArray[version1][3]} / ${bibleVersionArray[version2][3]}`;
    p_title = `${booknames[bookIndex]} ${chapterIndex + 1}:${verseIndex + 1}`;
    launch(verseIndex);
  },
  data2string() {
    let a = "";
    for (i = 0; i < recent.numofElements; i++) {
      a = `${a + booknames[recent.bArray[i]]} ${recent.cArray[i] + 1}:${recent.vArray[i] + 1}|`;
    }
    console.log(`Recent list: ${a}`);
    return a;
  },
};
