// Signaling logic
const SIGNALING_URL = 'https://uecfi-signaling.onrender.com';
let socket = null;
let roomSecret = "";
let hostPeer = null;

function initSignaling() {
  socket = window.electronBridge.io(SIGNALING_URL);
  
  socket.on("connect", () => {
    console.log("Connected to signaling server:", socket.id);
  });

  socket.on("signal", ({ from, signal }) => {
    if (hostPeer) {
        hostPeer.signal(signal);
    } else {
        startHostPeer(from, signal);
    }
  });
}

function startHostPeer(guestId, incomingSignal) {
    hostPeer = new window.electronBridge.SimplePeer({ initiator: false, trickle: false });

    hostPeer.on('signal', data => {
        socket.emit("signal", { to: guestId, signal: data });
    });

    hostPeer.on('stream', stream => {
        console.log("Received guest stream:", stream);
        // Will be routed to the Canvas engine in the next phase
    });

    if (incomingSignal) {
        hostPeer.signal(incomingSignal);
    }
}

function createLiveRoom() {
  const roomId = "UECFI-" + Math.random().toString(36).substr(2, 6).toUpperCase();
  roomSecret = Math.random().toString(36).substr(2, 6).toUpperCase();
  
  socket.emit("create-room", { roomId, secret: roomSecret });
  alert(`Room Created! ID: ${roomId} Secret: ${roomSecret}`);
}

initSignaling();
// Signaling logic
const SIGNALING_URL = 'https://uecfi-signaling.onrender.com';
let socket = null;
let roomSecret = "";

function initSignaling() {
  socket = window.electronBridge.io(SIGNALING_URL);
  
  socket.on("connect", () => {
    console.log("Connected to signaling server:", socket.id);
  });
}

function createLiveRoom() {
  const roomId = "UECFI-" + Math.random().toString(36).substr(2, 6).toUpperCase();
  roomSecret = Math.random().toString(36).substr(2, 6).toUpperCase();
  
  socket.emit("create-room", { roomId, secret: roomSecret });
  alert(`Room Created! ID: ${roomId} Secret: ${roomSecret}`);
}

initSignaling();
let bookIndex = 0;
let chapterIndex = 0;
let verseIndex = 0;
let bible = new Array();
let content1 = new Array();
let content2 = new Array();
let numofch = new Array(
  [0],
  [
    50, 31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33,
    38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 55, 32, 20, 31, 29, 43, 36,
    30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26,
  ],
  [
    40, 22, 25, 22, 31, 23, 30, 25, 32, 35, 29, 10, 51, 22, 31, 27, 36, 16, 27,
    25, 26, 36, 31, 33, 18, 40, 37, 21, 43, 46, 38, 18, 35, 23, 35, 35, 38, 29,
    31, 43, 38,
  ],
  [
    27, 17, 16, 17, 35, 19, 30, 38, 36, 24, 20, 47, 8, 59, 57, 33, 34, 16, 30,
    37, 27, 24, 33, 44, 23, 55, 46, 34,
  ],
  [
    36, 54, 34, 51, 49, 31, 27, 89, 26, 23, 36, 35, 16, 33, 45, 41, 50, 13, 32,
    22, 29, 35, 41, 30, 25, 18, 65, 23, 31, 40, 16, 54, 42, 56, 29, 34, 13,
  ],
  [
    34, 46, 37, 29, 49, 33, 25, 26, 20, 29, 22, 32, 32, 18, 29, 23, 22, 20, 22,
    21, 20, 23, 30, 25, 22, 19, 19, 26, 68, 29, 20, 30, 52, 29, 12,
  ],
  [
    24, 18, 24, 17, 24, 15, 27, 26, 35, 27, 43, 23, 24, 33, 15, 63, 10, 18, 28,
    51, 9, 45, 34, 16, 33,
  ],
  [
    21, 36, 23, 31, 24, 31, 40, 25, 35, 57, 18, 40, 15, 25, 20, 20, 31, 13, 31,
    30, 48, 25,
  ],
  [4, 22, 23, 18, 22],
  [
    31, 28, 36, 21, 22, 12, 21, 17, 22, 27, 27, 15, 25, 23, 52, 35, 23, 58, 30,
    24, 42, 15, 23, 29, 22, 44, 25, 12, 25, 11, 31, 13,
  ],
  [
    24, 27, 32, 39, 12, 25, 23, 29, 18, 13, 19, 27, 31, 39, 33, 37, 23, 29, 33,
    43, 26, 22, 51, 39, 25,
  ],
  [
    22, 53, 46, 28, 34, 18, 38, 51, 66, 28, 29, 43, 33, 34, 31, 34, 34, 24, 46,
    21, 43, 29, 53,
  ],
  [
    25, 18, 25, 27, 44, 27, 33, 20, 29, 37, 36, 21, 21, 25, 29, 38, 20, 41, 37,
    37, 21, 26, 20, 37, 20, 30,
  ],
  [
    29, 54, 55, 24, 43, 26, 81, 40, 40, 44, 14, 47, 40, 14, 17, 29, 43, 27, 17,
    19, 8, 30, 19, 32, 31, 31, 32, 34, 21, 30,
  ],
  [
    36, 17, 18, 17, 22, 14, 42, 22, 18, 31, 19, 23, 16, 22, 15, 19, 14, 19, 34,
    11, 37, 20, 12, 21, 27, 28, 23, 9, 27, 36, 27, 21, 33, 25, 33, 27, 23,
  ],
  [10, 11, 70, 13, 24, 17, 22, 28, 36, 15, 44],
  [13, 11, 20, 32, 23, 19, 19, 73, 18, 38, 39, 36, 47, 31],
  [10, 22, 23, 15, 17, 14, 14, 10, 17, 32, 3],
  [
    42, 22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21,
    29, 29, 34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24,
    41, 30, 24, 34, 17,
  ],
  [
    150, 6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7, 8, 6, 7, 5, 11, 15, 50, 14, 9,
    13, 31, 6, 10, 22, 12, 14, 9, 11, 12, 24, 11, 22, 22, 28, 12, 40, 22, 13,
    17, 13, 11, 5, 26, 17, 11, 9, 14, 20, 23, 19, 9, 6, 7, 23, 13, 11, 11, 17,
    12, 8, 12, 11, 10, 13, 20, 7, 35, 36, 5, 24, 20, 28, 23, 10, 12, 20, 72, 13,
    19, 16, 8, 18, 12, 13, 17, 7, 18, 52, 17, 16, 15, 5, 23, 11, 13, 12, 9, 9,
    5, 8, 28, 22, 35, 45, 48, 43, 13, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176,
    7, 8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 13, 10, 7,
    12, 15, 21, 10, 20, 14, 9, 6,
  ],
  [
    31, 33, 22, 35, 27, 23, 35, 27, 36, 18, 32, 31, 28, 25, 35, 33, 33, 28, 24,
    29, 30, 31, 29, 35, 34, 28, 28, 27, 28, 27, 33, 31,
  ],
  [12, 18, 26, 22, 16, 20, 12, 29, 17, 18, 20, 10, 14],
  [8, 17, 17, 11, 16, 16, 13, 13, 14],
  [
    66, 31, 22, 26, 6, 30, 13, 25, 22, 21, 34, 16, 6, 22, 32, 9, 14, 14, 7, 25,
    6, 17, 25, 18, 23, 12, 21, 13, 29, 24, 33, 9, 20, 24, 17, 10, 22, 38, 22, 8,
    31, 29, 25, 28, 28, 25, 13, 15, 22, 26, 11, 23, 15, 12, 17, 13, 12, 21, 14,
    21, 22, 11, 12, 19, 12, 25, 24,
  ],
  [
    52, 19, 37, 25, 31, 31, 30, 34, 22, 26, 25, 23, 17, 27, 22, 21, 21, 27, 23,
    15, 18, 14, 30, 40, 10, 38, 24, 22, 17, 32, 24, 40, 44, 26, 22, 19, 32, 21,
    28, 18, 16, 18, 22, 13, 30, 5, 28, 7, 47, 39, 46, 64, 34,
  ],
  [5, 22, 22, 66, 22, 22],
  [
    48, 28, 10, 27, 17, 17, 14, 27, 18, 11, 22, 25, 28, 23, 23, 8, 63, 24, 32,
    14, 49, 32, 31, 49, 27, 17, 21, 36, 26, 21, 26, 18, 32, 33, 31, 15, 38, 28,
    23, 29, 49, 26, 20, 27, 31, 25, 24, 23, 35,
  ],
  [12, 21, 49, 30, 37, 31, 28, 28, 27, 27, 21, 45, 13],
  [14, 11, 23, 5, 19, 15, 11, 16, 14, 17, 15, 12, 14, 16, 9],
  [3, 20, 32, 21],
  [9, 15, 16, 15, 13, 27, 14, 17, 14, 15],
  [1, 21],
  [4, 17, 10, 10, 11],
  [7, 16, 13, 12, 13, 15, 16, 20],
  [3, 15, 13, 19],
  [3, 17, 20, 19],
  [3, 18, 15, 20],
  [2, 15, 23],
  [14, 21, 13, 10, 14, 11, 15, 14, 23, 17, 12, 17, 14, 9, 21],
  [4, 14, 17, 18, 6],
  [
    28, 25, 23, 17, 25, 48, 34, 29, 34, 38, 42, 30, 50, 58, 36, 39, 28, 27, 35,
    30, 34, 46, 46, 39, 51, 46, 75, 66, 20,
  ],
  [16, 45, 28, 35, 41, 43, 56, 37, 38, 50, 52, 33, 44, 37, 72, 47, 20],
  [
    24, 80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43,
    48, 47, 38, 71, 56, 53,
  ],
  [
    21, 51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40,
    42, 31, 25,
  ],
  [
    28, 26, 47, 26, 37, 42, 15, 60, 40, 43, 48, 30, 25, 52, 28, 41, 40, 34, 28,
    41, 38, 40, 30, 35, 27, 27, 32, 44, 31,
  ],
  [16, 32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27],
  [16, 31, 16, 23, 21, 13, 20, 40, 13, 27, 33, 34, 31, 13, 40, 58, 24],
  [13, 24, 17, 18, 18, 21, 18, 16, 24, 15, 18, 33, 21, 14],
  [6, 24, 21, 29, 31, 26, 18],
  [6, 23, 22, 21, 32, 33, 24],
  [4, 30, 30, 21, 23],
  [4, 29, 23, 25, 18],
  [5, 10, 20, 13, 18, 28],
  [3, 12, 17, 18],
  [6, 20, 15, 16, 16, 25, 21],
  [4, 18, 26, 17, 22],
  [3, 16, 15, 15],
  [1, 25],
  [13, 14, 18, 19, 16, 14, 20, 28, 13, 28, 39, 40, 29, 25],
  [5, 27, 26, 18, 17, 20],
  [5, 25, 25, 22, 19, 14],
  [3, 21, 22, 18],
  [5, 10, 29, 24, 21, 21],
  [1, 13],
  [1, 14],
  [1, 25],
  [
    22, 20, 29, 22, 11, 14, 17, 17, 13, 21, 11, 19, 17, 18, 20, 8, 21, 18, 24,
    21, 15, 27, 21,
  ],
);
let booknames = new Array(
  "Genesis",
  "Exodo/Exodus",
  "Levitico/Leviticus",
  "Mga Bilang/Numbers",
  "Deuteronomio/Deuteronomy",
  "Josue/Joshua",
  "Mga Hukom/Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Mga Hari/1 Kings",
  "2 Mga Hari/2 Kings",
  "1 Mga Cronica/1 Chronicles",
  "2 Mga Cronica/2 Chronicles",
  "Ezra",
  "Nehemias/Nehemiah",
  "Ester/Esther",
  "Job",
  "Mga Awit/Psalms",
  "Mga Kawikaan/Proverbs",
  "Mga Mangangaral/Ecclesiastes",
  "Awit ni Solomon/Song of Solomon",
  "Isaias/Isaiah",
  "Jeremias/Jeremiah",
  "Mga Panaghoy/Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadias/Obadiah",
  "Jonas/Jonah",
  "Mikas/Micah",
  "Nahum",
  "Habakkuk",
  "Zefanias/Zephaniah",
  "Haggai",
  "Zacarias/Zechariah",
  "Malakias/Malachi",
  "Mateo/Matthew",
  "Marcos/Mark",
  "Lucas/Luke",
  "Juan/John",
  "Mga Gawa/Acts",
  "Mga Taga-Roma/Romans",
  "1 Mga Taga-Corinto/1 Corinthians",
  "2 Mga Taga-Corinto/2 Corinthians",
  "Mga Taga-Galacia/Galatians",
  "Mga Taga-Efeso/Ephesians",
  "Mga Taga-Filipos/Philippians",
  "Mga Taga-Colosas/Colossians",
  "1 Mga Taga-Tesalonica/1 Thessalonians",
  "2 Mga Taga-Tesalonica/2 Thessalonians",
  "1 Kay Timoteo/1 Timothy",
  "2 Kay Timoteo/2 Timothy",
  "Kay Tito/Titus",
  "Kay Filemon/Philemon",
  "Hebreo/Hebrews",
  "Santiago/James",
  "1 Pedro/1 Peter",
  "2 Pedro/2 Peter",
  "1 Juan/1 John",
  "2 Juan/2 John",
  "3 Juan/3 John",
  "Judas/Jude",
  "Apocalipsis/Revelation",
);
let default_booknames = new Array(
  "Genesis",
  "Exodo/Exodus",
  "Levitico/Leviticus",
  "Mga Bilang/Numbers",
  "Deuteronomio/Deuteronomy",
  "Josue/Joshua",
  "Mga Hukom/Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Mga Hari/1 Kings",
  "2 Mga Hari/2 Kings",
  "1 Mga Cronica/1 Chronicles",
  "2 Mga Cronica/2 Chronicles",
  "Ezra",
  "Nehemias/Nehemiah",
  "Ester/Esther",
  "Job",
  "Mga Awit/Psalms",
  "Mga Kawikaan/Proverbs",
  "Mga Mangangaral/Ecclesiastes",
  "Awit ni Solomon/Song of Solomon",
  "Isaias/Isaiah",
  "Jeremias/Jeremiah",
  "Mga Panaghoy/Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadias/Obadiah",
  "Jonas/Jonah",
  "Mikas/Micah",
  "Nahum",
  "Habakkuk",
  "Zefanias/Zephaniah",
  "Haggai",
  "Zacarias/Zechariah",
  "Malakias/Malachi",
  "Mateo/Matthew",
  "Marcos/Mark",
  "Lucas/Luke",
  "Juan/John",
  "Mga Gawa/Acts",
  "Mga Taga-Roma/Romans",
  "1 Mga Taga-Corinto/1 Corinthians",
  "2 Mga Taga-Corinto/2 Corinthians",
  "Mga Taga-Galacia/Galatians",
  "Mga Taga-Efeso/Ephesians",
  "Mga Taga-Filipos/Philippians",
  "Mga Taga-Colosas/Colossians",
  "1 Mga Taga-Tesalonica/1 Thessalonians",
  "2 Mga Taga-Tesalonica/2 Thessalonians",
  "1 Kay Timoteo/1 Timothy",
  "2 Kay Timoteo/2 Timothy",
  "Kay Tito/Titus",
  "Kay Filemon/Philemon",
  "Hebreo/Hebrews",
  "Santiago/James",
  "1 Pedro/1 Peter",
  "2 Pedro/2 Peter",
  "1 Juan/1 John",
  "2 Juan/2 John",
  "3 Juan/3 John",
  "Judas/Jude",
  "Apocalipsis/Revelation",
);
let themeState = false;
let navDualLanguage;
let navFontSize;
let enterPressed = false;
let searchFocus = false;
let verseFocus = false;
let tabViewN = null;
let searchObj = null;
let scheduleObj = null;
let webServerObj = null;
let bibleRefObj = null;
let songEditObj = null;
let songNavObj = null;
let songManagerObj = null;
let helpObj = null;
let bibleVersionSelObj = null;
let remoteVV_UI_Obj = null;
let setup_present_UI_Obj = null;
let updateVV_UI_Obj = null;
let varID = "";
let songEditUI = "";
let helpContent = "";
let cpObj = null;
let firstTimeFlag = false;
let enterForSearchActive = true;
let enterForBibleRef = false;
let vvMenu = null;
function getBookValue() {
  return document.getElementById("bookList").selectedIndex;
}
function getChapterValue() {
  return document.getElementById("chapterList").selectedIndex;
}
function getVerseValue() {
  return document.getElementById("verseList").selectedIndex;
}
// Builds one title per slide ("Book Chapter:Verse", range for paired slides)
// so the projected title tracks Prev/Next navigation instead of freezing on
// the first presented verse. Mirrors launch()'s slide pairing exactly.
function buildSlideTitles(pair, bIdx, cIdx) {
  const arr = [];
  try {
    const name = (typeof booknames !== "undefined" && booknames[bIdx]) ? booknames[bIdx] : "";
    const ch = cIdx + 1;
    const n = (typeof content1 !== "undefined" && content1.length) ? content1.length : 0;
    if (!name || !n) return arr;
    if (pair === 2) {
      const slides = Math.ceil(n / 2);
      for (let i = 0; i < slides; i++) {
        const v1 = i * 2 + 1;
        const v2 = Math.min(i * 2 + 2, n);
        arr[i] = (v1 === v2) ? `${name} ${ch}:${v1}` : `${name} ${ch}:${v1}-${v2}`;
      }
    } else {
      for (let i = 0; i < n; i++) {
        arr[i] = `${name} ${ch}:${i + 1}`;
      }
    }
  } catch (e) {}
  return arr;
}
function launch(g) {
  const c = document.getElementById("multipleVerseID").checked;
  let e = 1;
  if (c) {
    e = 2;
  }
  let b = new Array();
  let a = new Array();
  let h = 0;
  h = p_last_index + 1;
  j = p_last_index;
  b = content1;
  a = content2;
  if (e == 2) {
    const l = h % 2;
    if (l == 0) {
      j = parseInt(h / 2) - 1;
      for (var f = 0; f <= j; f++) {
        b[f] = `${content1[f * 2]}<BR>${content1[f * 2 + 1]}`;
        a[f] = `${content2[f * 2]}<BR>${content2[f * 2 + 1]}`;
      }
    } else {
      j = parseInt(h / 2);
      for (var f = 0; f < j; f++) {
        b[f] = `${content1[f * 2]}<BR>${content1[f * 2 + 1]}`;
        a[f] = `${content2[f * 2]}<BR>${content2[f * 2 + 1]}`;
      }
      b[f] = content1[f * 2];
      a[f] = content2[f * 2];
    }
  }
  var j = parseInt((p_last_index + 1) / e) - 1;
  if (e == 1) {
    // getdata() stores the verse COUNT, so the formula above is only right
    // on the first launch after a present. Repeated Next/Prev launches reuse
    // the previous last-index and would decay by one on every press --
    // re-derive from the content length instead (stable across presses).
    var n = (typeof content1 !== "undefined" && content1) ? content1.length : 0;
    var j = (n > 0) ? n - 1 : parseInt(p_last_index / e) - 1;
  }
  const k = parseInt(g / e);
  if (singleVersion) {
    const d = a.length;
    for (f = 0; f < d; f++) {
      a[f] = "";
    }
  }
  p_text1_arr = b;
  p_text2_arr = a;
  p_title_arr = buildSlideTitles(e, bookIndex, chapterIndex);
  p_title = p_title;
  // A verse present supersedes any schedule highlight and any live program:
  // monitor/remote transport returns to verse navigation.
  window.presentedScheduleId = null;
  if (typeof window !== "undefined") window.liveProgramActive = false;  if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
  if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();
  p_footnote = p_footer;
  window.p_person_title = "";
  window.p_person_title_arr = [];
  p_current_index = k;
  p_last_index = j;
  // Design (fonts, colors, scales, background, margins) comes exclusively
  // from ThemeManager ("verses" context) -- see applyThemeToProjection.
  if (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.applyThemeToProjection === "function") {
    window.themeManager.applyThemeToProjection("verses");
  }
  if (typeof setLiveProjectionType === "function") setLiveProjectionType("verses");
  presentation();
  if (typeof setLiveMonitorContent === "function") {
    setLiveMonitorContent({
      primary: p_text1_arr[k],
      secondary: p_text2_arr[k],
      reference: p_title,
      indicator: `Verse ${k + 1} of ${j + 1}`
    });
  }
  window.presentedVerseIndex = g;
  window.selectedVerseIndex = g;
  if (typeof updateVerseHighlight === 'function') updateVerseHighlight();
  // Keep the projected verse visible and centered so the surrounding
  // verses stay in view for the operator (mirrors the Slides tab).
  try {
    const card = document.getElementById(`verseRow_${g}`);
    if (card && typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "center" });
  } catch (e) {}
}
/**
 * Asynchronously loads and parses a Bible XML file into bible[e] via AppStorage
 * so startup never stalls the UI thread with synchronous XMLHttpRequest calls.
 */
async function loadBibleAsync(e) {
  if (!bibleVersionArray || !bibleVersionArray[e] || !bibleVersionArray[e][1]) return;
  if (bible[e]) return;
  const fileName = bibleVersionArray[e][1];
  const candidates = [];
  if (typeof AppStorage !== "undefined" && typeof AppStorage.resolveStoragePath === "function") {
    candidates.push(AppStorage.resolveStoragePath("bible", fileName));
  }
  candidates.push(`bible/${fileName}`);

  for (const candidate of candidates) {
    try {
      if (typeof AppStorage !== "undefined" && typeof AppStorage.readFile === "function") {
        const xmlText = await AppStorage.readFile(candidate);
        if (xmlText) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "application/xml");
          if (xmlDoc && xmlDoc.documentElement) {
            bible[e] = xmlDoc.documentElement;
            return;
          }
        }
      }
    } catch (err) {}
  }
}

function loadBible(e, a) {
  if (!bibleVersionArray || !bibleVersionArray[e]) return;
  if (bible[e]) return; // Already cached in memory

  // When async loading is requested (a === true), delegate to loadBibleAsync
  // to avoid deprecated main-thread XMLHttpRequest calls.
  if (a === true) {
    if (typeof printStatus === "function") {
      printStatus(`Loading ${bibleVersionArray[e][0]} Bible Database.`, true);
    }
    loadBibleAsync(e).then(() => {
      if (typeof printStatus === "function") {
        printStatus(`Loaded ${bibleVersionArray[e][0]} Bible Database.`, false);
      }
    });
    return;
  }

  // Synchronous caller fallback (e.g. version switching in saveVersionSelection):
  // In Electron/Node, read directly via fs + DOMParser to avoid Chromium's
  // synchronous XMLHttpRequest IPC bottleneck.
  let filePath = AppStorage.resolveStoragePath("bible", bibleVersionArray[e][1]);
  try {
    if (typeof require === "function") {
      const fs = require("fs");
      const path = require("path");
      const cleanPath = filePath.startsWith("file://") ? filePath.replace("file://", "") : filePath;
      const fullPath = path.isAbsolute(cleanPath)
        ? cleanPath
        : path.join((typeof AppStorage !== "undefined" && AppStorage.appDir) ? AppStorage.appDir() : "", cleanPath);
      if (fs.existsSync(fullPath)) {
        const xmlText = fs.readFileSync(fullPath, "utf8");
        if (xmlText) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "application/xml");
          if (xmlDoc && xmlDoc.documentElement) {
            bible[e] = xmlDoc.documentElement;
            return;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[BIBLE] Direct fs read fallback failed, trying XHR:", err);
  }

  let fileUrl = filePath;
  if (typeof AppStorage !== "undefined" && typeof AppStorage.toFileUrl === "function") {
    try {
      fileUrl = AppStorage.toFileUrl(fileUrl);
    } catch (err) {}
  }

  const b = new XMLHttpRequest();
  b.onreadystatechange = () => {
    if (b.readyState == 4 && (b.status === 200 || b.status === 0)) {
      if (b.responseXML && b.responseXML.documentElement) {
        bible[e] = b.responseXML.documentElement;
      } else if (b.responseText) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(b.responseText, "application/xml");
          bible[e] = xmlDoc.documentElement;
        } catch (err) {
          console.error("[BIBLE] Error parsing XML:", err);
        }
      }
    }
  };
  try {
    b.open("GET", fileUrl, Boolean(a));
    b.send(null);
  } catch (err) {
    console.error("[BIBLE] Error loading Bible file:", fileUrl, err);
  }
}
function loadBookNames(d) {
  if (!bible[d] || typeof bible[d].getElementsByTagName !== 'function') {
    console.warn(`[BOOKNAMES] Bible ${d} not loaded, keeping default book names.`);
    try { booknames = default_booknames; } catch (e) {}
    return;
  }
  const c = bible[d].getElementsByTagName("booknames")[0];
  if (c == null) {
    // No <booknames> element (e.g. Tagalog, Pampango): derive single-language
    // names from each book's own <b n="..."> attribute instead of falling
    // back to the dual-language default list.
    try {
      const books = bible[d].getElementsByTagName("b");
      if (books && books.length > 0) {
        const arr = [];
        for (let i = 0; i < books.length; i++) {
          const nm = (books[i].getAttribute) ? books[i].getAttribute("n") : null;
          arr[i] = (nm && nm.trim()) ? nm.trim() : (default_booknames[i] || `Book ${i + 1}`);
        }
        booknames = arr;
        return;
      }
    } catch (e) {
      console.warn("[BOOKNAMES] Could not read <b n> attributes:", e);
    }
    booknames = default_booknames;
  } else {
    const a = c.textContent;
    const b = a.split(",");
    booknames = b;
  }
}
function getSingleVerse(d, g, e, a) {
  let f;
  const ver = (a == 1) ? bible[version1] : bible[version2];
  if (!ver || typeof ver.getElementsByTagName !== 'function') {
    console.warn(`[BIBLE] getSingleVerse: Bible version ${a == 1 ? version1 : version2} not loaded.`);
    return "";
  }
  if (a == 1) {
    f = bible[version1]
      .getElementsByTagName("b")
      [d].getElementsByTagName("c")
      [g].getElementsByTagName("v")[e];
  } else {
    f = bible[version2]
      .getElementsByTagName("b")
      [d].getElementsByTagName("c")
      [g].getElementsByTagName("v")[e];
  }
  if (!f) return "";
  f = f.textContent;
  return f;
}
function getdata() {
  const c = new Array();
  const a = new Array();
  content1 = bible[version1]
    .getElementsByTagName("b")
    [bookIndex].getElementsByTagName("c")
    [chapterIndex].getElementsByTagName("v");
  content2 = bible[version2]
    .getElementsByTagName("b")
    [bookIndex].getElementsByTagName("c")
    [chapterIndex].getElementsByTagName("v");
  p_last_index = content1.length;
  for (let b = 0; b < p_last_index; b++) {
    if (content1[b].textContent != "") {
      c[b] = `${b + 1} ${content1[b].textContent}`;
    } else {
      c[b] = content1[b].textContent;
    }
    if (content2[b].textContent != "") {
      a[b] = `${b + 1} ${content2[b].textContent}`;
    } else {
      a[b] = content2[b].textContent;
    }
  }
  content1 = c;
  content2 = a;
}
function present() {
  bookIndex = document.getElementById("bookList").selectedIndex;
  chapterIndex = document.getElementById("chapterList").selectedIndex;
  verseIndex = document.getElementById("verseList").selectedIndex;
  recent.addSelection(bookIndex, chapterIndex, verseIndex);
  getdata();
  p_footer = `${bibleVersionArray[version1][3]} / ${bibleVersionArray[version2][3]}`;
  p_title = `${booknames[bookIndex]} ${chapterIndex + 1}:${verseIndex + 1}`;
  launch(verseIndex);
  themeState = false;
  disableNavButtons(false);
}
function present_external(a, e, d) {
  bookIndex = a;
  chapterIndex = e;
  verseIndex = d;
  getdata();
  p_footer = `${bibleVersionArray[version1][3]} / ${bibleVersionArray[version2][3]}`;
  p_title = `${booknames[bookIndex]} ${chapterIndex + 1}:${verseIndex + 1}`;
  launch(verseIndex);
  themeState = false;
  disableNavButtons(false);
}
function presentTheme() {
  if (themeState) {
    present();
  } else {
    themeState = true;
    p_title = "";
    p_footnote = "";
    p_title_arr = [];
    window.p_person_title = "";
    window.p_person_title_arr = [];
    p_last_index = 0;
    if (typeof window !== "undefined") window.liveProgramActive = false;
    content1[0] = "";
    content2[0] = "";
    p_current_index = 0;
    // Design comes exclusively from ThemeManager ("general" context).
    if (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.applyThemeToProjection === "function") {
      window.themeManager.applyThemeToProjection("general");
    }
    if (typeof setLiveProjectionType === "function") setLiveProjectionType("general");
    presentation();
  }
}
function putbook() {
  clearSelectList("bookList");
  const a = booknames.length;
  for (i = 0; i < a; i++) {
    document.getElementById("bookList").options[i] = new Option(
      booknames[i],
      i,
    );
  }
  document.getElementById("bookList").selectedIndex = 0;
}
function putch() {
  clearSelectList("chapterList");
  val = document.getElementById("bookList").selectedIndex + 1;
  for (i = 0; i < numofch[val][0]; i++) {
    document.getElementById("chapterList").options[i] = new Option(i + 1, i);
  }
  document.getElementById("chapterList").selectedIndex = 0;
  putver();
}
function putver() {
  bookval = document.getElementById("bookList").selectedIndex + 1;
  chval = document.getElementById("chapterList").selectedIndex + 1;
  clearSelectList("verseList");
  for (i = 0; i < numofch[bookval][chval]; i++) {
    document.getElementById("verseList").options[i] = new Option(i + 1, i + 1);
  }
  document.getElementById("verseList").selectedIndex = 0;
  window.presentedVerseIndex = -1;
  window.selectedVerseIndex = 0;
  updateVerseContainer();
}
function updateVerseContainer() {
  priFontName = bibleVersionArray[version1][6];
  secFontName = bibleVersionArray[version2][6];
  console.log(`font size uecfipresenter.js  ${navFontSize}`);
  navDualLanguage = document.getElementById("navDualLanguageID").checked;
  bookIndex = document.getElementById("bookList").selectedIndex;
  chapterIndex = document.getElementById("chapterList").selectedIndex;
  verseIndex = document.getElementById("verseList").selectedIndex;
  getdata();
  const m = content1.length;
  let k = "";
  k = `${k}<table border=0>`;
  if (navDualLanguage) {
    k = `${k}<tr><td width="4%"></td><td width="48%"></td><td width="48%"></td></tr>`;
  } else {
    k = `${k}<tr><td width="4%"></td><td width="96%"></td></tr>`;
  }
  for (i = 0; i < m; i++) {
    if (navDualLanguage) {
      k = `${k}<tr class="vcClass" id="verseRow_${i}" style="cursor: pointer;" onclick="handleVerseCardClick(${i})"><td width="4%">`;
      var e = `NC_${i}`;
      k = `${k}<div class="vcClass verse-number-bubble" id="${e}">${i + 1}</div>`;
      k = `${k}</td><td class="navtd" width="48%" style="padding-right: 20px;">`;
      var e = `VC1_${i}`;
      k = `${k}<div class="vcClass" id="${e}">a</div>`;
      k = `${k}</td><td class="navtd" width="48%" style="border-left: 1px solid #E2E8F0; padding-left: 20px;">`;
      var e = `VC2_${i}`;
      k = `${k}<div class="vcClass" id="${e}">b</div>`;
      k = `${k}</td></tr>`;
    } else {
      k = `${k}<tr class="vcClass" id="verseRow_${i}" style="cursor: pointer;" onclick="handleVerseCardClick(${i})"><td width="4%">`;
      var e = `NC_${i}`;
      k = `${k}<div class="vcClass verse-number-bubble" id="${e}">${i + 1}</div>`;
      k = `${k}</td><td class="navtd" width="96%">`;
      var e = `VC1_${i}`;
      k = `${k}<div class="vcClass" id="${e}">x</div>`;
      k = `${k}</td></tr>`;
    }
  }
  k = `${k}</table>`;
  document.getElementById("verseTab").innerHTML = k;
  const l = new Array();
  const b = new Array();
  const a = new Array();
  for (i = 0; i < m; i++) {
    const j = `VC1_${i}`;
    const d = `VC2_${i}`;
    const c = `NC_${i}`;
    const numPrefix = new RegExp(`^\\s*${i + 1}\\s+`);
    l[i] = new postit();
    l[i].init(c, bookIndex + 1, chapterIndex + 1, i + 1);
    b[i] = new verseClass();
    var h = String(content1[i] || "").replace(numPrefix, "").trimStart();
    var g = bibleVersionArray[version1][6];
    b[i].init(j, h, bookIndex + 1, chapterIndex + 1, i + 1, g);
    if (navDualLanguage) {
      a[i] = new verseClass();
      var h = String(content2[i] || "").replace(numPrefix, "").trimStart();
      var g = bibleVersionArray[version2][6];
      a[i].init(d, h, bookIndex + 1, chapterIndex + 1, i + 1, g);
    }
  }
  if (typeof updateVerseHighlight === 'function') updateVerseHighlight();
}

window.handleVerseCardClick = function(i) {
  // Clicking the card immediately presents the verse
  window.selectedVerseIndex = i;
  window.presentedVerseIndex = i;
  const vList = document.getElementById("verseList");
  if (vList) {
    vList.selectedIndex = i;
  }
  present();
};

window.handleSidebarVerseSelect = function(i) {
  // Selecting from left-hand panel highlights in violet/purple but does not present
  window.selectedVerseIndex = i;
  const vList = document.getElementById("verseList");
  if (vList) {
    vList.selectedIndex = i;
  }
  updateVerseHighlight();
  const card = document.getElementById(`verseRow_${i}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

window.updateVerseHighlight = function() {
  const rows = document.querySelectorAll("#verseTab tr.vcClass");
  rows.forEach((tr, idx) => {
    tr.classList.remove("verse-presented", "verse-selected");
    if (idx === window.presentedVerseIndex) {
      tr.classList.add("verse-presented");
    } else if (idx === window.selectedVerseIndex) {
      tr.classList.add("verse-selected");
    }
  });

  // Search results highlight the presented row (tracked by data index)
  const presentedSearch = (typeof window.presentedSearchIdx === "number") ? window.presentedSearchIdx : -1;
  document.querySelectorAll("#searchResultID tr.vcClass").forEach((tr) => {
    tr.classList.remove("verse-presented");
    if (presentedSearch >= 0 && parseInt(tr.getAttribute("data-search-idx"), 10) === presentedSearch) {
      tr.classList.add("verse-presented");
    }
  });

  const modernContainer = document.getElementById("modernVerseList");
  if (modernContainer) {
    const buttons = modernContainer.querySelectorAll("button");
    buttons.forEach((btn, idx) => {
      btn.className = "w-full text-center py-1 transition rounded font-medium ";
      if (idx === window.presentedVerseIndex) {
        btn.className += "bg-emerald-600 text-white font-bold shadow-sm";
      } else if (idx === window.selectedVerseIndex) {
        btn.className += "bg-brand-600 text-white font-bold shadow-sm";
      } else {
        btn.className += "text-slate-700 hover:bg-slate-200";
      }
    });
  }
};
// Schedule tab highlight: "▶ " prefix on the live-projected entry.
// Tracked by stable schId (not position) so reorder/delete can't mislabel.
window.updateScheduleHighlight = function() {
  try {
    const sel = document.getElementById("sch_selectID");
    if (!sel || !sel.options) return;
    const pid = (typeof window.presentedScheduleId !== "undefined" && window.presentedScheduleId !== null)
      ? String(window.presentedScheduleId) : null;
    for (let i = 0; i < sel.options.length; i++) {
      const opt = sel.options[i];
      if (opt.dataset && opt.dataset.label === undefined && opt.text) {
        opt.dataset.label = opt.text;
      }
      const base = (opt.dataset && opt.dataset.label !== undefined) ? opt.dataset.label : opt.text;
      const isLive = pid !== null && String(opt.value) === pid;
      const want = isLive ? `▶ ${base}` : base;
      if (opt.text !== want) opt.text = want;
    }
  } catch (e) {}
};
/**
 * Preloads UI HTML templates from ./content/*.txt asynchronously into memory
 * (window._templateCache) so generateTabContent() runs without synchronous XHR
 * or main-thread disk stalls.
 */
async function preloadContentTemplates() {
  if (typeof window === "undefined") return;
  if (!window._templateCache) window._templateCache = {};
  const files = [
    "./content/setup_biblesel.txt",
    "./content/setup_remote.txt",
    "./content/setup_presentui.txt",
    "./content/setup_update.txt",
    "./content/config.txt",
    "./content/nav.txt",
    "./content/search.txt",
    "./content/schedule.txt",
    "./content/song_nav.txt",
    "./content/help.txt",
    "./content/song_edit.txt",
    "./content/song_lyrics.txt",
    "./content/program_nav.txt",
    "./content/program_workspace.txt"
  ];
  await Promise.all(files.map(async (f) => {
    try {
      if (typeof AppStorage !== "undefined" && typeof AppStorage.readFile === "function") {
        const txt = await AppStorage.readFile(f);
        if (txt) {
          window._templateCache[f] = txt;
          window._templateCache[f.replace(/^\.\//, "")] = txt;
        }
      }
    } catch (e) {}
  }));
}

async function vvinit() {
  splash(true);
  const a = firstTimeCheck();
  if (!a) {
    alert("Error loading database. Please contact uecfipresenter@yahoo.com");
  }
  tabFrame();
  tabFrameVerse();

  // Await async version registry, configuration, and UI template preloading
  // deterministically instead of relying on a blind 500ms setTimeout.
  try {
    await Promise.all([
      loadBibleVersion(),
      loadConfig(),
      preloadContentTemplates()
    ]);
    await Promise.all([
      loadBibleAsync(version1),
      loadBibleAsync(version2)
    ]);
  } catch (e) {
    console.warn("[INIT] Async preload warning, continuing with fallback:", e);
  }

  loadBible(version1, false);
  loadBible(version2, false);
  loadBookNames(version1);
  generateTabContent();
  splash(false);
  setupNavWindow();
  // Every projection context must resolve to a real theme bundle --
  // warns in console if any design falls back to factory defaults.
  if (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.validateProjectionContexts === "function") {
    window.themeManager.validateProjectionContexts();
  }
  syncTabHeaderHeights();
  if (typeof sizeSidebarPreview === "function") {
    try { sizeSidebarPreview(); } catch (e) {}
  }
  if (typeof initNotepad === "function") {
    try { initNotepad(); } catch (e) {}
  }
  if (typeof loadLogoScreenConfig === "function") {
    try { loadLogoScreenConfig(); } catch (e) {}
  }
  if (typeof renderLogoOverlay === "function") {
    try { renderLogoOverlay(); } catch (e) {}
  }
  if (typeof loadAttentionScreenConfig === "function") {
    try { loadAttentionScreenConfig(); } catch (e) {}
  }
  if (typeof renderAttentionOverlay === "function") {
    try { renderAttentionOverlay(); } catch (e) {}
  }
  if (typeof maybeShowRemoteToast === "function") {
    try { maybeShowRemoteToast(); } catch (e) {}
  }
  if (typeof updateProjectionControls === "function") {
    try { updateProjectionControls(); } catch (e) {}
  }
  AppUI.setupApplicationMenu("menu/menu.xml");
  window.addEventListener("resize", setupNavWindow);
  window.addEventListener("beforeunload", processExit);
}
function setupNavWindow() {
  const e = 20;
  const a = window.innerWidth - 16;
  const h = window.innerHeight - 50;
  const c = parseInt((a * 3) / 100);
  const d = parseInt((h * 4) / 100);
  document.getElementById("container").style.top = d;
  document.getElementById("container").style.left = c;
  tabHeight = h - 2 * d;
  tabWidth = 300;
  document.getElementById("container").style.height = tabHeight;
  document.getElementById("container").style.width = tabWidth;
  const g = parseInt((22 / 420) * (tabHeight - 150));
  document.getElementById("bookList").size = g;
  document.getElementById("chapterList").size = g;
  document.getElementById("verseList").size = g;
  if (document.getElementById("bkgndDivId")) {
    document.getElementById("bkgndDivId").style.height = parseInt(tabHeight - 300);
  }
  document.getElementById("container2").style.top = d;
  document.getElementById("container2").style.left = tabWidth + 2 * c;
  const b = a - tabWidth - 3 * c;
  document.getElementById("container2").style.height = tabHeight;
  document.getElementById("container2").style.width = b;
  document.getElementById("verseTab").style.width = b - 25;
  document.getElementById("verseTab").style.height = tabHeight - 55;
  if (document.getElementById("bkgndTab")) {
    document.getElementById("bkgndTab").style.width = b - 25;
    document.getElementById("bkgndTab").style.height = tabHeight - 60;
  }
  // Schedule/Lyrics/Slides tabs were never sized -> height:100% of an
  // auto-height wrapper collapses to 0px and the tab looks blank.
  // Give them the same explicit pixel sizing as the other tabs.
  const schedTab = document.getElementById("scheduleTab");
  if (schedTab) {
    schedTab.style.width = b - 25;
    schedTab.style.height = tabHeight - 55;
  }
  const lyricsTab = document.getElementById("lyricsTab");
  if (lyricsTab) {
    lyricsTab.style.width = b - 25;
    lyricsTab.style.height = tabHeight - 55;
  }
  const programTab = document.getElementById("programTab");
  if (programTab) {
    programTab.style.width = b - 25;
    programTab.style.height = tabHeight - 55;
  }
  document.getElementById("searchResultID").style.width = b - 25;
  document.getElementById("searchResultID").style.height = tabHeight - 150;
  songNavObj.setFormats();
  syncTabHeaderHeights();
  if (typeof sizeSidebarPreview === "function") {
    try { sizeSidebarPreview(); } catch (e) {}
  }
}

/**
 * Equalize middle-panel tab header bars to the Schedule header height.
 * The Schedule header is measured read-only (never modified); Lyrics /
 * Slides / Search headers are compact single-row bars by design so
 * their content always fits the measured height. Re-runs on tab switch and
 * resize because hidden tabs report offsetHeight 0 until first shown.
 */
function syncTabHeaderHeights() {
  try {
    const ref = document.querySelector("#scheduleTab > div > div.shrink-0");
    const refH = ref ? ref.offsetHeight : 0;
    if (!refH) return false;
    const sels = [
      "#lyricsTab > div > div.shrink-0",
      "#searchTab > div > div.shrink-0",
      "#programWorkspace > div > div.shrink-0",
    ];
    sels.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.style.height = `${refH}px`;
        el.style.minHeight = `${refH}px`;
      }
    });
    return true;
  } catch (e) {
    console.warn("[HEADERS] sync failed:", e);
    return false;
  }
}
function setupTheme() {
  const a = document.getElementById("themeList").value;
  switch (a) {
    case "1":
      document.body.style.backgroundImage = "url(graphics/background2.png)";
      break;
    case "2":
      document.body.style.backgroundImage = "url(graphics/background3.png)";
      break;
    default:
  }
}
function generateTabContent() {
  promptInit();
  readContentFile2Var("./content/setup_biblesel.txt");
  bibleVersionSelObj = new bibleVersionSelClass();
  bibleVersionSelObj.init(varID);
  readContentFile2Var("./content/setup_remote.txt");
  remoteVV_UI_Obj = new remoteVV_UI_Class();
  remoteVV_UI_Obj.init(varID);
  readContentFile2Var("./content/setup_presentui.txt");
  setup_present_UI_Obj = new setup_present_UI_Class();
  setup_present_UI_Obj.init(varID);
  readContentFile2Var("./content/setup_update.txt");
  updateVV_UI_Obj = new updateVV_UI_Class();
  updateVV_UI_Obj.init(varID);
  readTabContentFile("./content/config.txt", "configTab");
  readTabContentFile("./content/nav.txt", "navTab");
  readTabContentFile("./content/search.txt", "searchField");
  readTabContentFile("./content/schedule.txt", "scheduleTab");
  readTabContentFile("./content/song_nav.txt", "songNavTab");
  readContentFile2Var("./content/help.txt");
  helpContent = varID;
  readContentFile2Var("./content/song_edit.txt");
  songEditUI = varID;
  readTabContentFile("./content/song_lyrics.txt", "lyricsTab");
  readTabContentFile("./content/program_nav.txt", "programNavTab");
  readTabContentFile("./content/program_workspace.txt", "programTab");
  cpObj = new cp();
  cpObj.init();
  // NOTE: the legacy per-version searchfile slot is inert metadata only;
  // search always runs directly on the loaded Bible XML.
  searchObj = new vvsearch();
  searchObj.init();
  webServerObj = new vvWebServer();
  
  // Auto-start remote server if enabled (default to true)
  setTimeout(() => {
    try {
      const remoteEnabled = localStorage.getItem("remoteVVEnabled") !== "false";
      if (remoteEnabled) {
        const pp = localStorage.getItem("remoteVVPresenterPort") || 50000;
        const ap = localStorage.getItem("remoteVVAudiencePort") || 50001;
        
        let c = "127.0.0.1";
        if (typeof remoteVV_IPList === "function") {
           const ipl = remoteVV_IPList();
           if (ipl && ipl.length > 0) c = ipl[0];
        }
        
        webServerObj.init({ presenterPort: pp, audiencePort: ap, host: c });
        try { if (typeof syncRemoteVVStatusUI === "function") syncRemoteVVStatusUI(); } catch (e) {}
      }
    } catch(e) {
      console.warn("Failed to auto-start remote server", e);
    }
  }, 1000);
  bibleRefObj = new BibleReference();
  songNavObj = new songNavClass();
  songNavObj.init();
  songManagerObj = new songManagerClass();
  songManagerObj.init(true);
  // Initialize modern song list & lyric card sync immediately after songManagerObj
  // populates the first song so Song #0's lyric cards and title highlight on first open.
  if (typeof setupModernSongNavSync === "function") {
    setupModernSongNavSync();
  }
  songEditObj = new songEditClass();
  songEditObj.init(songEditUI);
  helpObj = new vvhelpClass();
  helpObj.init(helpContent);
  if (typeof window.programManager !== "undefined" && window.programManager && typeof window.programManager.init === "function") {
    window.programManager.init();
  }
}
/**
 * Reads text content from a file path into global varID.
 * Checks the async-preloaded window._templateCache first (0ms in-memory hit),
 * then falls back to Node.js fs or AppStorage/XHR for dynamic paths.
 */
function readContentFile2Var(a) {
  try {
    if (typeof window !== "undefined" && window._templateCache) {
      const cached = window._templateCache[a] || window._templateCache[String(a).replace(/^\.\//, "")];
      if (typeof cached === "string" && cached.length > 0) {
        varID = cached;
        return;
      }
    }
    if (typeof require === "function") {
      const fs = require("fs");
      const path = require("path");
      const cleanPath = a.startsWith("file://") ? a.replace("file://", "") : a;
      const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join((typeof AppStorage !== "undefined" && AppStorage.appDir) ? AppStorage.appDir() : "", cleanPath);
      if (fs.existsSync(fullPath)) {
        varID = fs.readFileSync(fullPath, "utf8");
        return;
      }
    }
  } catch(e) {
    // Continue to fallback
  }

  // Browser synchronous fallback via AppStorage or synchronous XHR fallback
  try {
    const lsVal = typeof AppStorage !== "undefined" ? AppStorage.getItem("uecfi_file_" + a.replace(/^[\.\/]+/, "")) : null;
    if (lsVal !== null) {
      varID = lsVal;
      return;
    }
    const b = new XMLHttpRequest();
    b.open("GET", a, false);
    b.send(null);
    varID = b.responseText;
  } catch (err) {
    console.error("[CONTENT] Error reading content file:", a, err);
  }
}

/**
 * Reads tab template content and injects into target DOM element, then initializes the tab.
 * Uses the async-preloaded window._templateCache when available to avoid main-thread stalls.
 */
function readTabContentFile(a, b) {
  let content = "";
  try {
    if (typeof window !== "undefined" && window._templateCache) {
      const cached = window._templateCache[a] || window._templateCache[String(a).replace(/^\.\//, "")];
      if (typeof cached === "string" && cached.length > 0) {
        content = cached;
      }
    }
    if (!content && typeof require === "function") {
      const fs = require("fs");
      const path = require("path");
      const cleanPath = a.startsWith("file://") ? a.replace("file://", "") : a;
      const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join((typeof AppStorage !== "undefined" && AppStorage.appDir) ? AppStorage.appDir() : "", cleanPath);
      if (fs.existsSync(fullPath)) {
        content = fs.readFileSync(fullPath, "utf8");
      }
    }
  } catch(e) {}

  if (!content) {
    try {
      const bReq = new XMLHttpRequest();
      bReq.open("GET", a, false);
      bReq.send(null);
      content = bReq.responseText;
    } catch(err) {
      console.error("[TAB CONTENT] Error loading tab file:", a, err);
    }
  }

  if (b !== "configTab" && content) {
    const el = document.getElementById(b);
    if (el) el.innerHTML = content;
    else console.log("MISSING ELEMENT: " + b);
  }
  fillTabs(b);
}

function fillTabs(a) {
  if (a == "navTab") {
    fillNav();
  }
  if (a == "configTab") {
    versionFill(true);
    configInit();
  }
  if (a == "scheduleTab") {
    // Initialize schedule controller and bind events / load records
    scheduleObj = new schedule();
    if (typeof scheduleObj.init === "function") {
      scheduleObj.init();
    }
  }
  if (a == "programNavTab" || a == "programTab") {
    if (typeof window.programManager !== "undefined" && window.programManager && typeof window.programManager.init === "function") {
      window.programManager.init();
    }
  }
}

/**
 * Loads book names list from xml/booknames.xml asynchronously or via Node fs.
 */
async function updateBookNameVar() {
  const filePath = "./xml/booknames.xml";
  try {
    let xmlText = "";
    if (typeof AppStorage !== "undefined" && AppStorage.readFile) {
      xmlText = await AppStorage.readFile(filePath);
    } else {
      const res = await fetch(filePath);
      xmlText = await res.text();
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const e = doc.documentElement;
    if (e) {
      const d = e.getElementsByTagName("b").length;
      for (let c = 0; c < d; c++) {
        booknames[c] = e.getElementsByTagName("b")[c].textContent;
      }
    }
  } catch(err) {
    console.warn("[BOOKNAMES] Error loading book names:", err);
  }
}
function fillNav() {
  putbook();
  putch();
  setupModernNavSync();
  document.getElementById("bookList").addEventListener("change", putch, false);
  document
    .getElementById("chapterList")
    .addEventListener("change", putver, false);
  document.getElementById("present").addEventListener("click", present, false);
  const c = new icon(
    "searchButtonID",
    " SEARCH ",
    "graphics/icon/search_32.png",
    "graphics/icon/search_32.png",
    "",
  );
  const g = new icon(
    "present",
    " PRESENT ",
    "graphics/icon/present_48.png",
    "graphics/icon/present_48.png",
    "",
  );
  const b = new icon(
    "prevBut",
    " PREVIOUS ",
    "graphics/icon/left.png",
    "graphics/icon/left.png",
    "",
  );
  const h = new icon(
    "nextBut",
    " NEXT ",
    "graphics/icon/right.png",
    "graphics/icon/right.png",
    "",
  );
  const d = new icon(
    "closeBut",
    " CLOSE Presentation ",
    "graphics/icon/closepresent_32.png",
    "graphics/icon/closepresent_32.png",
    "",
  );
  const f = new icon(
    "addScheduleBut",
    " ADD Verse to SCHEDULE ",
    "graphics/icon/schedule32.png",
    "graphics/icon/schedule32.png",
    "",
  );
  document
    .getElementById("nextBut")
    .addEventListener("click", processNextButton, false);
  document
    .getElementById("prevBut")
    .addEventListener("click", processPrevButton, false);
  document
    .getElementById("closeBut")
    .addEventListener("click", closePresentWindow, false);
  document
    .getElementById("addScheduleBut")
    .addEventListener("click", nav_addVerse2Schedule, false);
  document
    .getElementById("nav_bibleRef_presentID")
    .addEventListener("click", processNavBibleRef, false);
  document
    .getElementById("nav_bibleRef_findID")
    .addEventListener("click", processNavBibleRefFind, false);
  const e = new icon(
    "nav_bibleRef_presentID",
    " QUICK PRESENT ",
    "graphics/icon/qpresent_24.png",
    "graphics/icon/qpresent_24.png",
    "",
  );
  const a = new icon(
    "nav_bibleRef_findID",
    " FIND ",
    "graphics/icon/search_s.png",
    "graphics/icon/search_s.png",
    "",
  );
  const refInput = document.getElementById("nav_bibleRefID");
  if (refInput) {
    refInput.addEventListener("blur", bibleRefBlur);
    refInput.addEventListener("focus", bibleRefFocus);
  }
  disableNavButtons(true);
  document.getElementById("searchID").disabled = false;
  recent.init();
}
// Recent strip lives at the bottom of the middle panel but belongs to the
// Verses tab: visible only while Verses is active and items exist.
// Active-tab detection reads the live DOM (the AppTabs content wrapper whose
// display the tab control itself toggles for the visible #verseTab), with the
// tab-object label as fallback -- so icon rewrites, label drift, or tab-object
// wiring quirks can never strand the strip on the wrong tab.
function updateRecentStripVisibility() {
  try {
    const strip = document.getElementById("modernRecentStrip");
    if (!strip) return;
    let onVerses = false;
    try {
      const vt = document.getElementById("verseTab");
      const wrap = vt ? vt.parentElement : null;
      if (wrap && wrap.style) {
        // Wrapper exists: DOM truth is authoritative, never overridden by label.
        onVerses = wrap.style.display !== "none";
      } else if (typeof tabViewN !== "undefined" && tabViewN) {
        // Wrapper missing (early init / DOM not ready): label fallback only.
        const active = tabViewN.get ? tabViewN.get("activeTab") : null;
        const label = active && typeof active.get === "function" ? (active.get("label") || "") : "";
        onVerses = String(label).trim() === "Verses";
      }
    } catch (e) {}
    let hasItems = false;
    try {
      const legacy = document.getElementById("recentSel");
      hasItems = !!legacy && legacy.options.length > 0;
    } catch (e) {}
    strip.style.display = (onVerses && hasItems) ? "flex" : "none";
  } catch (e) {}
}
function tabFrame() {
  const b = new AppUI.Tabs();
  b.addTab({
    label: " Bible ",
    content: '<div id="navTab">Bible</div>',
    active: true,
  });
  b.addTab({
    label: " Songs ",
    content: '<div id="songNavTab">Songs</div>',
  });
  b.addTab({
    label: " Program ",
    content: '<div id="programNavTab">Program</div>',
  });
  b.appendTo("container");
  window.tabViewLeft = b;
  setTimeout(() => {
    const tabs = document.querySelectorAll('#container .app-modern-tabs ul li');
    if(tabs[0]) tabs[0].innerHTML = '<i class="fa-solid fa-book-bible"></i> Bible';
    if(tabs[1]) tabs[1].innerHTML = '<i class="fa-solid fa-music"></i> Songs';
    if(tabs[2]) tabs[2].innerHTML = '<i class="fa-solid fa-list-check"></i> Program';
  }, 100);

  b.addListener("activeTabChange", a);
  function a() {
    if (window._syncingTabs) return;
    window._syncingTabs = true;
    try {
      const c = b.activeTab;
      const d = c ? c.label : "";
      const bibleBar = document.getElementById("modernActionButtons");
      const songBar = document.getElementById("modernSongActionButtons");
      const progBar = document.getElementById("modernProgramActionButtons");

      if (d == " Bible ") {
        tabViewN.selectTab(0);
        if (bibleBar) bibleBar.style.display = "flex";
        if (songBar) songBar.style.display = "none";
        if (progBar) progBar.style.display = "none";
      }
      if (d == " Songs ") {
        tabViewN.selectTab(1);
        if (bibleBar) bibleBar.style.display = "none";
        if (songBar) songBar.style.display = "flex";
        if (progBar) progBar.style.display = "none";
      }
      if (d == " Program ") {
        tabViewN.selectTab(2);
        if (bibleBar) bibleBar.style.display = "none";
        if (songBar) songBar.style.display = "none";
        if (progBar) progBar.style.display = "flex";
      }
    } finally {
      window._syncingTabs = false;
    }
  }
}
function tabFrameVerse() {
  const a = new AppUI.Tabs();
  a.addTab({
    label: " Verses ",
    content: '<div id="verseTab" class="tabSubContainer" >Verses</div>',
    active: true,
  });
  a.addTab({
    label: " Lyrics ",
    content: '<div id="lyricsTab" class="tabSubContainer" >Lyrics</div>',
  });
  a.addTab({
    label: " Slides ",
    content: '<div id="programTab" class="tabSubContainer" style="height: 100%;">Slides</div>',
  });
  a.addTab({
    label: " Search",
    content:
      '<div id="searchTab"><div id="searchField" class="searchFieldContainer"></div></div>',
  });
  a.addTab({
    label: " Schedule ",
    content: '<div id="scheduleTab" class="tabSubContainer" style="height: 100%; overflow: hidden;">Schedule</div>',
  });
  a.appendTo("container2");
  setTimeout(() => {
    // Inject modern strip at bottom of container2
    console.log("RUNNING STRIP INJECTION!"); const strip = document.createElement("div");
    strip.id = "modernRecentStrip";
    strip.innerHTML = '<span class="recent-label">Recent</span><div id="modernRecentButtons" style="display:flex; gap:8px;"></div>';
    document.getElementById("container2").appendChild(strip); console.log("STRIP APPENDED. container2 has childNodes:", document.getElementById("container2").childNodes.length);

    const legacyRecent = document.getElementById("recentSel");
    const newRecent = document.getElementById("modernRecentButtons");

    function renderRecent() {
        if(!legacyRecent || !newRecent) return;
        newRecent.innerHTML = "";
        if (typeof updateRecentStripVisibility === "function") updateRecentStripVisibility();
        for(let i=0; i<legacyRecent.options.length; i++) {
            const btn = document.createElement("button");
            btn.className = "recent-button";
            btn.innerText = legacyRecent.options[i].text;
            btn.onclick = () => {
                legacyRecent.selectedIndex = i;
                legacyRecent.dispatchEvent(new Event("click")); // Trigger navigation!
            };
            newRecent.appendChild(btn);
        }
    }

    const obs = new MutationObserver(renderRecent);
    if(legacyRecent) {
        obs.observe(legacyRecent, { childList: true, subtree: true });
        renderRecent();
    }
  }, 1000);

  setTimeout(() => {
    const tabs = document.querySelectorAll('#container2 .app-modern-tabs ul li');
    if(tabs[0]) tabs[0].innerHTML = '<i class="fa-solid fa-list-ol"></i> Verses';
    if(tabs[1]) tabs[1].innerHTML = '<i class="fa-solid fa-align-left"></i> Lyrics';
    if(tabs[2]) tabs[2].innerHTML = '<i class="fa-solid fa-layer-group"></i> Slides';
    if(tabs[3]) tabs[3].innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Search';
    if(tabs[4]) tabs[4].innerHTML = '<i class="fa-regular fa-calendar-check"></i> Schedule';
  }, 100);

  tabViewN = a;

  // Synchronize right panel tabs with their parent/corresponding tabs in the left panel
  a.addListener("activeTabChange", () => {
    // If settings page was open, hide it when switching tabs
    closeSettingsPage();
    // Recent strip belongs to Verses: re-evaluate on every tab switch
    try { updateRecentStripVisibility(); } catch (e) {}
    // Newly shown tab headers get real heights now -- re-equalize
    try { syncTabHeaderHeights(); } catch (e) {}

    if (window._syncingTabs) return;
    window._syncingTabs = true;
    try {
      const activeRightTab = a.get("activeTab");
      if (!activeRightTab) return;
      const rightLabel = (activeRightTab.get("label") || "").trim();
      const bibleBar = document.getElementById("modernActionButtons");
      const songBar = document.getElementById("modernSongActionButtons");
      const progBar = document.getElementById("modernProgramActionButtons");

      // For search, schedule and graphics, do nothing to the left panel
      let leftTabIndex = -1;
      if (rightLabel === "Verses") {
        leftTabIndex = 0; // Bible tab in left panel
      } else if (rightLabel === "Lyrics") {
        leftTabIndex = 1; // Songs tab in left panel
      } else if (rightLabel === "Slides" || rightLabel === "Program") {
        leftTabIndex = 2; // Program tab in left panel
      }

      // If this tab has a corresponding parent tab in the left panel, switch to it
      if (leftTabIndex !== -1) {
        if (window.tabViewLeft && typeof window.tabViewLeft.selectTab === "function") {
          window.tabViewLeft.selectTab(leftTabIndex);
        }

        // Update top action button toolbars according to active mode
        if (leftTabIndex === 0) {
          if (bibleBar) bibleBar.style.display = "flex";
          if (songBar) songBar.style.display = "none";
          if (progBar) progBar.style.display = "none";
        } else if (leftTabIndex === 1) {
          if (bibleBar) bibleBar.style.display = "none";
          if (songBar) songBar.style.display = "flex";
          if (progBar) progBar.style.display = "none";
        } else if (leftTabIndex === 2) {
          if (bibleBar) bibleBar.style.display = "none";
          if (songBar) songBar.style.display = "none";
          if (progBar) progBar.style.display = "flex";
        }
      }
    } finally {
      window._syncingTabs = false;
    }
  });

  // Load and mount Settings Page as a full-window modal overlay directly on document.body
  readContentFile2Var("./content/settings_page.txt");
  if (varID) {
    const settingsWrapper = document.createElement("div");
    settingsWrapper.innerHTML = varID;
    const settingsEl = settingsWrapper.firstElementChild;
    if (settingsEl) {
      document.body.appendChild(settingsEl);
      if (window.themeManager && typeof window.themeManager.init === "function") {
        window.themeManager.init();
      }
    }
  }
}

/**
 * Open the Settings page full-window overlay
 */
function openSettingsPage() {
  const settingsEl = document.getElementById("settingsPage");
  if (settingsEl) {
    settingsEl.classList.remove("hidden");
    if (window.themeManager && typeof window.themeManager.init === "function") {
      window.themeManager.init();
    }
    // Measure and refresh preview canvas layout after overlay becomes visible
    if (window.themeManager && typeof window.themeManager.updatePreviewCanvas === "function") {
      requestAnimationFrame(() => {
        try { window.themeManager.updatePreviewCanvas(); } catch (e) {}
      });
    }
  }
}

/**
 * Close the Settings page full-window overlay
 */
function closeSettingsPage() {
  const settingsEl = document.getElementById("settingsPage");
  if (settingsEl) {
    settingsEl.classList.add("hidden");
  }
}

// Global keyboard shortcut: Press Escape to close Settings page
if (typeof window !== "undefined" && !window._settingsEscBound) {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const settingsEl = document.getElementById("settingsPage");
      if (settingsEl && !settingsEl.classList.contains("hidden")) {
        closeSettingsPage();
      }
    }
  });
  window._settingsEscBound = true;
}
let splashWindow;
function splash(g) {
  // Splash screen is handled during desktop app startup; no-op in modern layout
}
function processExit() {
  if (presentWindowOpen) {
    if (window.electronBridge && typeof window.electronBridge.closeProjectionWindow === "function") {
      window.electronBridge.closeProjectionWindow();
    } else if (newWindow && newWindow.close) {
      newWindow.close();
    }
  }
}
function firstTimeCheck() {
  let b = true;
  const a = fileExist("xml/version.xml", 1);
  if (!a) {
    b = setupVVersion();
  }
  const d = fileExist("xml/backgroundlist.xml", 1);
  if (!d) {
    b = setupVBkgnd();
  }
  const c = fileExist("xml/config.xml", 1);
  if (!c) {
    b = setupVConfig();
  }
  if (!a && !d && !c) {
    firstTimeFlag = true;
  }
  console.log(`First time check: ${b}`);
  return b;
}
function setupVVersion() {
  createFolder("xml");
  createFolder("bible");
  createFolder("song");
  createFolder("network");
  var a = copyFile("xml/version.xml", "xml/version.xml");
  if (!a) {
    return a;
  }
  var a = copyFile("bible", "bible");
  if (!a) {
    return a;
  }
  var a = copyFile("network/remotexml2.html", "network/remotexml2.html");
  if (!a) {
    return a;
  }
  var a = copyFile("song/default.db", "song/default.db");
  if (!a) {
    return a;
  }
  return a;
}
function setupVBkgnd() {
  var a = copyFile("xml/backgroundlist.xml", "xml/backgroundlist.xml");
  if (!a) {
    return a;
  }
  var a = copyFile("background", "background");
  if (!a) {
    return a;
  }
  return a;
}
function mainWindowKey(a) {
  key = a.keyCode;
  switch (key) {
    case 13:
      if (enterForSearchActive) {
        searchObj.searchKeywordInit();
      }
      if (enterForBibleRef) {
        processNavBibleRef();
      }
      if (songNavObj.isSongSearchEditActive()) {
        songNavObj.sn_searchSong();
      }
      break;
  }
}
function setupVConfig() {
  const a = copyFile("xml/config.xml", "xml/config.xml");
  if (!a) {
    return a;
  }
  return a;
}
function searchFocusChange() {
  searchKeyword();
}
function processFontSizeChange() {
  updateVerseContainer();
  searchObj.setFontSize(navFontSize);
}
function printStatus(a, b) {}
function roll_over(b, a) {
  document.getElementById(b).src = a;
}
function msg() {
  alert("clicked...");
}
function test() {
  function b() {
    alert("m1");
  }
  function a() {
    alert("m2");
  }
}


function setupModernNavSync() {

    const modernSearch = document.getElementById('modernRefInput');
    const legacySearch = document.getElementById('nav_bibleRefID');
    
    // Store typeahead candidate results
    window.currentTypeaheadResult = null;

    if (modernSearch && legacySearch) {
        modernSearch.addEventListener('input', (e) => {
            const val = e.target.value;
            legacySearch.value = val;

            if (val.trim() === '') {
                window.currentTypeaheadResult = null;
                renderBookList();
            } else if (typeof bibleRefObj !== 'undefined' && typeof bibleRefObj.searchCandidates === 'function') {
                const searchRes = bibleRefObj.searchCandidates(val);
                window.currentTypeaheadResult = searchRes;
                
                // If there is a strongest candidate, automatically select it (without auto-presenting)
                if (searchRes && searchRes.strongestCandidate >= 0) {
                    const legacySelect = document.getElementById('bookList');
                    if (legacySelect && legacySelect.selectedIndex !== searchRes.strongestCandidate) {
                        legacySelect.selectedIndex = searchRes.strongestCandidate;
                        // Trigger legacy putch() and putver() so chapter & verse populate
                        if (typeof putch === 'function') putch();
                        const chList = document.getElementById('chapterList');
                        if (chList) chList.selectedIndex = 0;
                        if (typeof putver === 'function') putver();
                        const vList = document.getElementById('verseList');
                        if (vList) vList.selectedIndex = 0;
                        window.selectedVerseIndex = 0;
                        if (typeof updateVerseContainer === 'function') updateVerseContainer();
                    }
                }
                renderBookList();
            }
        });
        modernSearch.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') {
                legacySearch.value = e.target.value;
                document.getElementById('modernRefGoBtn').click();
            }
        });
        document.getElementById('modernRefGoBtn').addEventListener('click', () => {
            legacySearch.value = modernSearch.value;
            // The legacy engine expects processNavBibleRef to read from nav_bibleRefID
            if(typeof processNavBibleRef === 'function') processNavBibleRef();
        });
    }

    // 1. Build interceptors for selectedIndex
    function intercept(id, onIndexChange) {
        const el = document.getElementById(id);
        const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
        Object.defineProperty(el, 'selectedIndex', {
            get: function() { return desc.get.call(this); },
            set: function(val) {
                desc.set.call(this, val);
                onIndexChange();
            }
        });
    }

    // 2. Build MutationObservers to catch when options are repopulated by legacy JS
    function observeOptions(id, onRebuild) {
        const el = document.getElementById(id);
        const observer = new MutationObserver((mutations) => {
            let optionsChanged = false;
            mutations.forEach(m => {
                if (m.type === 'childList') optionsChanged = true;
            });
            if (optionsChanged) onRebuild();
        });
        observer.observe(el, { childList: true });
    }

    // Helper to highlight matching text inside book names
    function highlightMatchText(text, query) {
        if (!text || !query) return text;
        const cleanQ = query.trim().replace(/[^a-zA-Z0-9]/g, '');
        if (!cleanQ) return text;
        const regex = new RegExp(`(${cleanQ})`, 'gi');
        return text.replace(regex, '<span class="bg-amber-200 text-amber-900 px-0.5 rounded font-bold">$1</span>');
    }

    // 3. Render functions
    function renderBookList() {
        const legacySelect = document.getElementById('bookList');
        const modernContainer = document.getElementById('modernBookList');
        if (!legacySelect || !modernContainer) return;
        const activeIdx = legacySelect.selectedIndex;

        const typeahead = window.currentTypeaheadResult;
        const candidateMap = new Map();
        if (typeahead && typeahead.candidates && typeahead.candidates.length > 0) {
            typeahead.candidates.forEach(c => candidateMap.set(c.bookIndex, c));
        }
        
        let html = '';
        for(let i=0; i < legacySelect.options.length; i++) {
            
            // If typeahead search is active, hide books that don't match candidates
            if (typeahead && typeahead.query) {
                if (!candidateMap.has(i)) {
                    continue; // Hide books that don't match the search
                }
            }
            
            function getBookNameSafely(vIndex, bIndex) {
                if (typeof bible !== 'undefined' && bible[vIndex]) {
                    const c = bible[vIndex].getElementsByTagName("booknames")[0];
                    if (c != null) {
                        const arr = c.textContent.split(',');
                        if (arr[bIndex]) return arr[bIndex].trim();
                    }
                    // No <booknames> (e.g. Tagalog, Pampango): use that
                    // version's own single-language <b n="..."> attribute.
                    try {
                        const books = bible[vIndex].getElementsByTagName("b");
                        if (books && books[bIndex] && books[bIndex].getAttribute) {
                            const nm = books[bIndex].getAttribute("n");
                            if (nm && nm.trim()) return nm.trim();
                        }
                    } catch (e) {}
                }
                if (typeof default_booknames !== 'undefined') {
                    const fallback = default_booknames[bIndex];
                    if (fallback) {
                        const parts = fallback.split('/');
                        if (typeof version2 !== 'undefined' && vIndex === version2) {
                            return parts.length > 1 ? parts[1].trim() : parts[0].trim();
                        }
                        return parts[0].trim();
                    }
                }
                return legacySelect.options[bIndex].text;
            }

            const v1 = typeof version1 !== 'undefined' ? version1 : 1;
            const v2 = typeof version2 !== 'undefined' ? version2 : 2;

            let primaryName = getBookNameSafely(v1, i);
            let secondaryName = getBookNameSafely(v2, i);

            // Highlight matching substrings if search is active
            const isActive = (i === activeIdx);
            const isMatch = candidateMap.has(i);

            if (typeahead && typeahead.query) {
                const hlClass = isActive 
                    ? 'bg-amber-300 text-slate-900 px-0.5 rounded font-extrabold'
                    : 'bg-amber-200 text-amber-900 px-0.5 rounded font-bold';
                const tokens = typeahead.query.trim().split(/\s+/).map(t => t.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
                if (tokens.length > 0) {
                    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const patterns = [];
                    if (tokens.length > 1) {
                        patterns.push(tokens.map(esc).join('\\s+'));
                        patterns.push(tokens.map(esc).join(''));
                    }
                    tokens.forEach(t => {
                        if (t.length >= 2 || !patterns.length) patterns.push(esc(t));
                    });
                    if (patterns.length > 0) {
                        const regex = new RegExp(`(${patterns.join('|')})`, 'gi');
                        primaryName = primaryName.replace(regex, `<span class="${hlClass}">$1</span>`);
                        secondaryName = secondaryName.replace(regex, `<span class="${hlClass}">$1</span>`);
                    }
                }
            }

            let classes = '';
            if (isActive) {
                classes = 'bg-brand-600 text-white rounded font-bold shadow-sm ring-2 ring-brand-400';
            } else if (isMatch) {
                classes = 'bg-brand-50 text-brand-900 border border-brand-200 hover:bg-brand-100 rounded font-semibold';
            } else {
                classes = 'text-slate-700 hover:bg-slate-200 rounded font-medium';
            }

            html += `
                <button onclick="document.getElementById('bookList').selectedIndex = ${i}; document.getElementById('bookList').dispatchEvent(new Event('change'));" 
                        class="w-full text-left px-2 py-1.5 transition ${classes}">
                    <div class="text-[11px] leading-tight">${primaryName}</div>
                    <div class="text-[9px] opacity-75 leading-none mt-0.5">${secondaryName}</div>
                </button>
            `;
        }

        if (html === '' && typeahead && typeahead.query) {
            html = `<div class="p-3 text-center text-xs text-slate-400 italic">No matching books found for "${typeahead.query}"</div>`;
        }

        modernContainer.innerHTML = html;
        if(modernContainer.querySelector('.bg-brand-600')) {
            modernContainer.querySelector('.bg-brand-600').scrollIntoView({block: 'nearest'});
        }
    }

    function renderChapterList() {
        const legacySelect = document.getElementById('chapterList');
        const modernContainer = document.getElementById('modernChapterList');
        const activeIdx = legacySelect.selectedIndex;
        
        let html = '';
        for(let i=0; i < legacySelect.options.length; i++) {
            const num = legacySelect.options[i].text;
            const isActive = (i === activeIdx);
            const classes = isActive 
                ? 'bg-brand-600 text-white rounded font-bold' 
                : 'text-slate-700 hover:bg-slate-200 rounded font-medium';
            html += `
                <button onclick="document.getElementById('chapterList').selectedIndex = ${i}; document.getElementById('chapterList').dispatchEvent(new Event('change'));" 
                        class="w-full text-center py-1 transition ${classes}">
                    ${num}
                </button>
            `;
        }
        modernContainer.innerHTML = html;
        if(modernContainer.children[activeIdx]) modernContainer.children[activeIdx].scrollIntoView({block: 'nearest'});
    }

    function renderVerseList() {
        const legacySelect = document.getElementById('verseList');
        const modernContainer = document.getElementById('modernVerseList');
        if (!legacySelect || !modernContainer) return;
        
        let html = '';
        for(let i=0; i < legacySelect.options.length; i++) {
            const num = legacySelect.options[i].text;
            const isPresented = (i === window.presentedVerseIndex);
            const isSelected = (i === window.selectedVerseIndex);
            let classes = 'text-slate-700 hover:bg-slate-200 rounded font-medium';
            if (isPresented) {
                classes = 'bg-emerald-600 text-white rounded font-bold shadow-sm';
            } else if (isSelected) {
                classes = 'bg-brand-600 text-white rounded font-bold shadow-sm';
            }
            html += `
                <button onclick="handleSidebarVerseSelect(${i});" 
                        ondblclick="handleVerseCardClick(${i});"
                        class="w-full text-center py-1 transition ${classes}">
                    ${num}
                </button>
            `;
        }
        modernContainer.innerHTML = html;
        const activeIdx = (window.presentedVerseIndex >= 0) ? window.presentedVerseIndex : window.selectedVerseIndex;
        if(modernContainer.children[activeIdx]) modernContainer.children[activeIdx].scrollIntoView({block: 'nearest'});
    }

    // Explicitly bind header close button to closePresentWindow
    const headerCloseBtn = document.getElementById('closeBut');
    if (headerCloseBtn) {
        headerCloseBtn.addEventListener('click', () => {
            if (typeof closePresentWindow === 'function') {
                closePresentWindow();
            }
        });
    }

    // Set up everything
    window.renderModernBookList = renderBookList;
    window.renderModernChapterList = renderChapterList;
    window.renderModernVerseList = renderVerseList;

    intercept('bookList', renderBookList);
    intercept('chapterList', renderChapterList);
    intercept('verseList', renderVerseList);

    observeOptions('bookList', renderBookList);
    observeOptions('chapterList', renderChapterList);
    observeOptions('verseList', renderVerseList);
    
    // Initial render
    setTimeout(() => {
        renderBookList();
        renderChapterList();
        renderVerseList();
    }, 100);
}


// --- MODERN SONG NAV SYNC ---

let songNavSyncRetries = 0;
function setupModernSongNavSync() {
    if (window._modernSongNavSynced) return;
    const legacyCategory = document.getElementById('songnav_category');
    const modernCategory = document.getElementById('modernSongCategory');
    const legacySearch = document.getElementById('songnav_editbox');
    const legacySearchBtn = document.getElementById('songnav_searchbutton');
    const modernSearch = document.getElementById('modernSongSearch');
    const modernSearchBtn = document.getElementById('modernSongSearchBtn');
    const modernList = document.getElementById('modernSongList');
    const legacyListContainer = document.getElementById('songnav_songlistnew');

    if(!legacyCategory || !modernList) {
        if (songNavSyncRetries++ < 30) {
            setTimeout(setupModernSongNavSync, 300);
        }
        return;
    }
    window._modernSongNavSynced = true;
    console.log("Modern song nav sync initialized successfully.");

    // Sync categories
    setTimeout(() => { modernCategory.innerHTML = legacyCategory.innerHTML; }, 500);
    modernCategory.addEventListener('change', () => {
        if (modernSearch && modernSearch.value) {
            modernSearch.value = '';
            window.currentSongTypeaheadResult = null;
            const clearBtn = document.getElementById('modernSongClearBtn');
            if (clearBtn) clearBtn.classList.add('hidden');
        }
        legacyCategory.selectedIndex = modernCategory.selectedIndex;
        legacyCategory.value = modernCategory.value;
        legacyCategory.dispatchEvent(new Event('change'));
    });

    // Intelligent real-time Song Search (mirrors Bible Book Search)
    window.currentSongTypeaheadResult = null;

    function normSongText(str) {
        if (!str) return "";
        return str
            .toString()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "");
    }

    function songLevenshtein(s1, s2) {
        const len1 = s1.length;
        const len2 = s2.length;
        const dp = Array.from({ length: len1 + 1 }, () => new Int32Array(len2 + 1));
        for (let i = 0; i <= len1; i++) dp[i][0] = i;
        for (let k = 0; k <= len2; k++) dp[0][k] = k;
        for (let i = 1; i <= len1; i++) {
            for (let k = 1; k <= len2; k++) {
                const cost = s1[i - 1] === s2[k - 1] ? 0 : 1;
                dp[i][k] = Math.min(dp[i - 1][k] + 1, dp[i][k - 1] + 1, dp[i - 1][k - 1] + cost);
            }
        }
        return dp[len1][len2];
    }

    function searchCandidateSongs(input) {
        if (!input || typeof input !== "string") return null;
        const qClean = input.trim();
        const qNorm = normSongText(qClean);
        if (!qNorm) return null;

        const songData = (window.songDataStore && Array.isArray(window.songDataStore.songTitle))
            ? window.songDataStore.songTitle
            : [];
        if (songData.length === 0) return null;

        // Collect raw rows map for lyrics and extra metadata
        const rawMap = new Map();
        if (typeof songManagerObj !== 'undefined' && songManagerObj) {
            let rawList = [];
            if (typeof songManagerObj.getRawSongRows === 'function') {
                rawList = songManagerObj.getRawSongRows();
            } else if (songManagerObj.allSongsResult && Array.isArray(songManagerObj.allSongsResult.data)) {
                rawList = songManagerObj.allSongsResult.data;
            }
            if (Array.isArray(rawList)) {
                rawList.forEach(r => {
                    if (r) {
                        if (r.id != null) rawMap.set(String(r.id), r);
                        if (r.name) rawMap.set(String(r.name).trim().toLowerCase(), r);
                    }
                });
            }
        }

        const numMatch = qClean.replace(/^#/, '').match(/^(\d+)$/);
        const qNum = numMatch ? parseInt(numMatch[1], 10) : null;

        const scoredCandidates = [];

        for (let i = 0; i < songData.length; i++) {
            const item = songData[i];
            const title = item.Title || item.name || '';
            const tNorm = normSongText(title);
            if (!tNorm) continue;

            const raw = rawMap.get(String(item.id)) || rawMap.get(title.trim().toLowerCase()) || null;
            const lyrics = raw ? (raw.lyrics || '') : '';

            let bestScore = -1;
            let matchType = '';
            let snippet = '';

            // 1. Number match (e.g. typing "1" or "#1" matches song #1 or title starting with number)
            if (qNum !== null) {
                const titleNumMatch = title.match(/(?:^|[^\d])0*(\d+)(?:[^\d]|$)/);
                if (titleNumMatch && parseInt(titleNumMatch[1], 10) === qNum) {
                    bestScore = 920;
                    matchType = 'number_title';
                } else if (item.id === qNum) {
                    bestScore = 750;
                    matchType = 'number_id';
                }
            }

            // 2. Exact Title Match
            if (tNorm === qNorm) {
                bestScore = 1000;
                matchType = 'exact';
            }
            // 3. Title Prefix Match
            else if (tNorm.startsWith(qNorm)) {
                const score = 850 - Math.min(100, (tNorm.length - qNorm.length) * 2);
                if (score > bestScore) {
                    bestScore = score;
                    matchType = 'prefix';
                }
            }
            // 4. Word-initial prefix in title (e.g. searching "Upaya" matches "Calam At Upaya")
            else {
                const words = title.split(/[\s\-_,\.;:]+/).map(normSongText).filter(Boolean);
                for (let w of words) {
                    if (w.startsWith(qNorm)) {
                        const score = 800 - Math.min(100, (w.length - qNorm.length) * 2);
                        if (score > bestScore) {
                            bestScore = score;
                            matchType = 'word_prefix';
                        }
                        break;
                    }
                }
            }

            // 5. Title Substring Match
            if (bestScore < 650 && tNorm.includes(qNorm) && qNorm.length >= 2) {
                const score = 650 - Math.min(100, (tNorm.length - qNorm.length) * 2);
                if (score > bestScore) {
                    bestScore = score;
                    matchType = 'substring';
                }
            }

            // 6. Fuzzy Match on Title / Words (tolerates typos)
            if (bestScore < 450 && qNorm.length >= 3) {
                let minDist = songLevenshtein(qNorm, tNorm);
                const words = title.split(/[\s\-_,\.;:]+/).map(normSongText).filter(Boolean);
                for (let w of words) {
                    if (w.length >= 3) {
                        const d = songLevenshtein(qNorm, w);
                        if (d < minDist) minDist = d;
                    }
                }
                const maxAllowed = qNorm.length >= 7 ? 3 : (qNorm.length >= 4 ? 2 : 1);
                if (minDist <= maxAllowed) {
                    const score = 450 - minDist * 50;
                    if (score > bestScore) {
                        bestScore = score;
                        matchType = 'fuzzy';
                    }
                }
            }

            // 7. Lyrics match (secondary fallback)
            if (bestScore < 400 && lyrics && qNorm.length >= 3) {
                const cleanLyrics = lyrics.replace(/<slide>|<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ');
                const lNorm = normSongText(cleanLyrics);
                if (lNorm.includes(qNorm)) {
                    const score = 350;
                    if (score > bestScore) {
                        bestScore = score;
                        matchType = 'lyrics';
                        const pos = cleanLyrics.toLowerCase().indexOf(qClean.toLowerCase());
                        if (pos >= 0) {
                            const start = Math.max(0, pos - 20);
                            const end = Math.min(cleanLyrics.length, pos + qClean.length + 25);
                            snippet = (start > 0 ? '...' : '') + cleanLyrics.substring(start, end).trim() + (end < cleanLyrics.length ? '...' : '');
                        }
                    }
                }
            }

            if (bestScore > 0) {
                scoredCandidates.push({
                    index: i,
                    score: bestScore,
                    matchType: matchType,
                    name: title,
                    snippet: snippet
                });
            }
        }

        scoredCandidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return String(a.name || '').trim().localeCompare(String(b.name || '').trim(), undefined, { sensitivity: 'base' });
        });

        return {
            query: qClean,
            strongestCandidate: scoredCandidates.length > 0 ? scoredCandidates[0].index : -1,
            candidates: scoredCandidates
        };
    }

    function handleSongSearchInput(val) {
        if (legacySearch) legacySearch.value = val;
        const clearBtn = document.getElementById('modernSongClearBtn');
        if (clearBtn) {
            if (val && val.trim() !== '') clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
        }

        if (!val || val.trim() === '') {
            window.currentSongTypeaheadResult = null;
            renderSongList();
            return;
        }

        const searchRes = searchCandidateSongs(val);
        window.currentSongTypeaheadResult = searchRes;

        // Auto-select strongest candidate to show lyrics immediately (matching book search behavior)
        if (searchRes && searchRes.strongestCandidate >= 0) {
            if (window.selectedSongIdx !== searchRes.strongestCandidate) {
                window.selectSongByIndex(searchRes.strongestCandidate);
            }
        }
        renderSongList();
    }

    // Sync modern search events
    modernSearch.addEventListener('input', (e) => {
        handleSongSearchInput(e.target.value);
    });

    modernSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const res = window.currentSongTypeaheadResult;
            if (res && res.strongestCandidate >= 0) {
                window.selectSongByIndex(res.strongestCandidate);
            }
        } else if (e.key === 'Escape') {
            modernSearch.value = '';
            handleSongSearchInput('');
        }
    });

    modernSearchBtn.addEventListener('click', () => {
        handleSongSearchInput(modernSearch.value);
    });

    const modernClearBtn = document.getElementById('modernSongClearBtn');
    if (modernClearBtn) {
        modernClearBtn.addEventListener('click', () => {
            modernSearch.value = '';
            handleSongSearchInput('');
            modernSearch.focus();
        });
    }

    // Preserve any existing selection/presentation state instead of resetting to -1
    if (typeof window.presentedSongIdx !== 'number') window.presentedSongIdx = -1;
    if (typeof window.selectedSongIdx !== 'number' || window.selectedSongIdx < 0) window.selectedSongIdx = 0;
    if (typeof window.presentedSlideIdx !== 'number') window.presentedSlideIdx = -1;

    // Helper to highlight slides
    window.updateSongSlideHighlight = function() {
        const slideDivs = document.querySelectorAll('#ly_slide div[id^="lyricsID"]');
        slideDivs.forEach((div, sIdx) => {
            if (sIdx === window.presentedSlideIdx && window.presentedSongIdx >= 0 && window.presentedSongIdx === window.selectedSongIdx) {
                div.classList.add('slide-presented');
            } else {
                div.classList.remove('slide-presented');
            }
        });
        // Keep the projected lyric slide centered so the surrounding
        // slides stay in view (mirrors the Slides tab). Only scrolls when
        // the viewed song is the presented one.
        try {
            const live = document.querySelector('#ly_slide div.slide-presented');
            if (live && typeof live.scrollIntoView === "function") live.scrollIntoView({ block: "center" });
        } catch (e) {}
    };

    // Bind song close button to closePresentWindow
    const songCloseBtn = document.getElementById('songnav_closebutton');
    if (songCloseBtn) {
        songCloseBtn.addEventListener('click', () => {
            if (typeof closePresentWindow === 'function') {
                closePresentWindow();
            }
        });
    }

    // Track presentation of songs when songnav_presentbutton is clicked
    const legacyPresentBtn = document.getElementById('songnav_presentbutton');
    if (legacyPresentBtn) {
        legacyPresentBtn.addEventListener('click', () => {
            if (typeof window.selectedSongIdx !== 'number' || window.selectedSongIdx < 0) {
                window.selectedSongIdx = 0;
            }
            window.presentedSongIdx = window.selectedSongIdx;
            window.presentedSlideIdx = 0; // Default to first slide
            renderSongList();
            attachSlideClickListeners();
            updateSongSlideHighlight();
        });
    }

    // Clicking the song title highlights it in purple
    window.selectSongByIndex = function(idx) {
        window.selectedSongIdx = idx;
        // Do not alter presentedSongIdx or presentedSlideIdx unless this song is the one presented
        const legacyRows = document.querySelectorAll('#songnav_songlistnew tbody tr');
        let title = "";
        if (legacyRows[idx]) {
            legacyRows[idx].click();
            const titleCell = legacyRows[idx].querySelector('td:last-child');
            if (titleCell) title = titleCell.textContent.trim();
        }
        if (typeof songNavObj !== 'undefined' && songNavObj && typeof songNavObj.setSelectedSong === 'function') {
            songNavObj.setSelectedSong(idx, title);
        }
        renderSongList();
        attachSlideClickListeners();
        setTimeout(attachSlideClickListeners, 100);
    };

    // Double-clicking the song title highlights it in green, projects first slide, highlights first slide card in green
    window.presentSongByIndex = function(idx) {
        window.selectedSongIdx = idx;
        window.presentedSongIdx = idx;
        window.presentedSlideIdx = 0;
        const legacyRows = document.querySelectorAll('#songnav_songlistnew tbody tr');
        let title = "";
        if (legacyRows[idx]) {
            legacyRows[idx].click();
            const titleCell = legacyRows[idx].querySelector('td:last-child');
            if (titleCell) title = titleCell.textContent.trim();
        }
        if (typeof songNavObj !== 'undefined' && songNavObj && typeof songNavObj.setSelectedSong === 'function') {
            songNavObj.setSelectedSong(idx, title);
        }
        const presentBtn = document.getElementById('songnav_presentbutton');
        if (presentBtn) {
            presentBtn.click();
        }
        renderSongList();
        attachSlideClickListeners();
        updateSongSlideHighlight();
        setTimeout(() => {
            attachSlideClickListeners();
            updateSongSlideHighlight();
        }, 150);
    };

    function attachSlideClickListeners() {
        const slideDivs = document.querySelectorAll('#ly_slide div[id^="lyricsID"]');
        slideDivs.forEach((div, sIdx) => {
            if (!div.dataset.highlightHooked) {
                div.dataset.highlightHooked = "true";
                div.addEventListener('click', () => {
                    // Clicking a slide/card will project that slide, highlight that card in green and highlight the song title in green
                    if (typeof window.selectedSongIdx !== 'number' || window.selectedSongIdx < 0) {
                        window.selectedSongIdx = 0;
                    }
                    window.presentedSongIdx = window.selectedSongIdx;
                    window.presentedSlideIdx = sIdx;
                    renderSongList();
                    updateSongSlideHighlight();
                });
            }
        });
        updateSongSlideHighlight();
    }

    // Observe changes to ly_slide to hook click listeners on newly rendered slides
    const lyricsContainer = document.getElementById('ly_slide');
    if (lyricsContainer) {
        const lyricsObserver = new MutationObserver(() => {
            attachSlideClickListeners();
        });
        lyricsObserver.observe(lyricsContainer, { childList: true });
    }

    // Quick Action helpers for individual songs
    window.quickPresentSong = function(idx, e) {
        if (e && e.stopPropagation) e.stopPropagation();
        window.presentSongByIndex(idx);
    };

    window.quickAddSongToSchedule = function(idx, e) {
        if (e && e.stopPropagation) e.stopPropagation();
        window.selectSongByIndex(idx);
        const addSchedBtn = document.getElementById('songnav_add2schedule_button');
        if (addSchedBtn) addSchedBtn.click();
    };

    window.quickEditSong = function(idx, e) {
        if (e && e.stopPropagation) e.stopPropagation();
        window.selectSongByIndex(idx);
        if (typeof song_edit_menu === 'function') {
            song_edit_menu();
        }
    };

    window.quickDeleteSong = function(idx, e) {
        if (e && e.stopPropagation) e.stopPropagation();
        window.selectSongByIndex(idx);
        if (typeof song_delete_menu === 'function') {
            song_delete_menu();
        }
    };

    function renderSongList() {
        // Rebuilding innerHTML resets the list scroll to top, so preserve
        // it across the rebuild (clicking a lyric slide re-renders this list).
        let savedScroll = 0;
        try { savedScroll = modernList ? modernList.scrollTop : 0; } catch (e) {}
        // Source songs either from window.songDataStore or from the legacy table tbody rows
        const songData = (window.songDataStore && Array.isArray(window.songDataStore.songTitle) && window.songDataStore.songTitle.length > 0)
            ? window.songDataStore.songTitle
            : null;

        const tbodies = legacyListContainer ? legacyListContainer.getElementsByTagName('tbody') : null;
        const rows = (tbodies && tbodies.length > 0) ? tbodies[0].getElementsByTagName('tr') : [];

        const totalItems = songData ? songData.length : rows.length;
        if (totalItems === 0) {
            modernList.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">No songs found.</div>';
            return;
        }

        const typeahead = window.currentSongTypeaheadResult;
        const candidateMap = new Map();
        if (typeahead && typeahead.candidates && typeahead.candidates.length > 0) {
            typeahead.candidates.forEach(c => candidateMap.set(c.index, c));
        }

        if (typeahead && typeahead.query && candidateMap.size === 0) {
            modernList.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 italic">No matching songs found for "${typeahead.query}"</div>`;
            return;
        }

        // Keep window.presentedSongIdx in sync with currently live song
        if (window.liveSongState && window.liveSongState.title && songData) {
            const liveTitle = String(window.liveSongState.title).trim().toLowerCase();
            const foundLive = songData.findIndex(s => (s.Title || s.name || "").trim().toLowerCase() === liveTitle);
            window.presentedSongIdx = foundLive;
        }

        // Clamp selectedSongIdx if out of bounds
        if (typeof window.selectedSongIdx === 'number' && window.selectedSongIdx >= totalItems) {
            window.selectedSongIdx = totalItems > 0 ? 0 : -1;
        }

        let html = '';
        const count = (typeahead && typeahead.query) ? typeahead.candidates.length : totalItems;

        for (let idx = 0; idx < count; idx++) {
            const i = (typeahead && typeahead.query) ? typeahead.candidates[idx].index : idx;
            const cand = (typeahead && typeahead.query) ? typeahead.candidates[idx] : null;

            let title = '';
            let isLegacySelected = false;

            if (songData && songData[i]) {
                title = songData[i].Title || songData[i].name || '';
                if (rows[i] && rows[i].classList.contains('app-row-selected')) {
                    isLegacySelected = true;
                }
            } else if (rows[i]) {
                const tr = rows[i];
                const titleCell = tr.querySelector('td:last-child');
                if (!titleCell) continue;
                title = titleCell.textContent || titleCell.innerText;
                isLegacySelected = tr.classList.contains('app-row-selected');
            }

            if (!title || title.trim() === 'Data Table Shim' || title.trim() === 'No records found.') continue;

            if (isLegacySelected && (window.selectedSongIdx === -1 || window.selectedSongIdx >= totalItems)) {
                window.selectedSongIdx = i;
            }

            const isPresented = (i === window.presentedSongIdx);
            const isSelected = (i === window.selectedSongIdx);

            let classes = 'bg-slate-50 border-slate-200 hover:border-brand-500 hover:shadow-sm text-slate-800';
            if (isPresented) {
                classes = 'song-presented';
            } else if (isSelected) {
                classes = 'song-selected';
            }

            let displayTitle = title;
            if (typeahead && typeahead.query) {
                const hlClass = isSelected 
                    ? 'bg-amber-300 text-slate-900 px-0.5 rounded font-extrabold'
                    : 'bg-amber-200 text-amber-900 px-0.5 rounded font-bold';
                const tokens = typeahead.query.trim().split(/\s+/).map(t => t.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
                if (tokens.length > 0) {
                    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const patterns = [];
                    if (tokens.length > 1) {
                        patterns.push(tokens.map(esc).join('\\s+'));
                        patterns.push(tokens.map(esc).join(''));
                    }
                    tokens.forEach(t => {
                        if (t.length >= 2 || !patterns.length) patterns.push(esc(t));
                    });
                    if (patterns.length > 0) {
                        const regex = new RegExp(`(${patterns.join('|')})`, 'gi');
                        displayTitle = displayTitle.replace(regex, `<span class="${hlClass}">$1</span>`);
                    }
                }
            }

            let snippetHtml = '';
            if (cand && cand.matchType === 'lyrics' && cand.snippet) {
                let snip = cand.snippet;
                const tokens = typeahead.query.trim().split(/\s+/).map(t => t.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
                if (tokens.length > 0) {
                    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`(${tokens.map(esc).join('|')})`, 'gi');
                    snip = snip.replace(regex, '<span class="bg-amber-200 text-amber-900 px-0.5 rounded font-bold">$1</span>');
                }
                snippetHtml = `<div class="text-[10px] text-slate-500 italic mt-0.5 truncate flex items-center gap-1"><span class="px-1 py-0.2 rounded bg-slate-200/70 text-[9px] font-semibold text-slate-600 uppercase tracking-wider shrink-0">In Lyrics</span> <span class="truncate">${snip}</span></div>`;
            }

            const songHasAudio = !!(songData && songData[i] && songData[i].audio);

            html += `
                <div id="songRow_${i}"
                     onclick="selectSongByIndex(${i})" 
                     ondblclick="presentSongByIndex(${i})"
                     class="p-2.5 border rounded-lg cursor-pointer transition ${classes}">
                    <div class="flex items-center justify-between gap-1">
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold leading-snug truncate flex items-center">
                              <span class="truncate">${displayTitle}</span>
                              ${songHasAudio ? '<i class="fa-solid fa-music text-purple-600 text-[10px] ml-1.5 shrink-0" title="Has backing track audio"></i>' : ''}
                            </p>
                            ${snippetHtml}
                        </div>
                        ${isPresented ? '<span class="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-wider shrink-0">LIVE</span>' : ''}
                        <div class="flex items-center gap-1 opacity-90 shrink-0 text-[10px]">
                            <div class="has-tooltip"><button onclick="quickPresentSong(${i}, event)" class="p-1 hover:bg-black/10 text-emerald-600 hover:text-emerald-700 rounded transition"><i class="fa-solid fa-play"></i></button><div class="tooltip-content tooltip-bottom">Present Song</div></div>
                            <div class="has-tooltip"><button onclick="quickAddSongToSchedule(${i}, event)" class="p-1 hover:bg-black/10 text-brand-600 hover:text-brand-700 rounded transition"><i class="fa-regular fa-calendar-plus"></i></button><div class="tooltip-content tooltip-bottom">Add Song to Schedule</div></div>
                            <div class="has-tooltip"><button onclick="quickEditSong(${i}, event)" class="p-1 hover:bg-black/10 text-slate-600 hover:text-slate-900 rounded transition"><i class="fa-solid fa-pen-to-square"></i></button><div class="tooltip-content tooltip-bottom">Edit Song</div></div>
                            <div class="has-tooltip"><button onclick="quickDeleteSong(${i}, event)" class="p-1 hover:bg-red-500/20 text-red-500 rounded transition"><i class="fa-regular fa-trash-can"></i></button><div class="tooltip-content tooltip-bottom">Delete Song</div></div>
                        </div>
                    </div>
                </div>
            `;
        }
        modernList.innerHTML = html;
        try {
            if (modernList) {
                const selectedEl = modernList.querySelector('.song-selected');
                if (typeahead && typeahead.query && selectedEl && typeof selectedEl.scrollIntoView === 'function') {
                    selectedEl.scrollIntoView({ block: 'nearest' });
                } else {
                    modernList.scrollTop = savedScroll;
                }
            }
        } catch (e) {}
    }
    window.renderModernSongList = renderSongList;
    window.updateSongListHighlight = renderSongList;

    // Immediately sync categories, render songs, and hook initial Song #0 lyric cards
    // that were already rendered into #ly_slide prior to MutationObserver setup.
    if (legacyCategory.options.length > 0) {
        modernCategory.innerHTML = legacyCategory.innerHTML;
    }
    renderSongList();
    attachSlideClickListeners();

    const listObserver = new MutationObserver(() => renderSongList());
    listObserver.observe(legacyListContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const catObserver = new MutationObserver(() => {
        modernCategory.innerHTML = legacyCategory.innerHTML;
    });
    catObserver.observe(legacyCategory, { childList: true });
}

setTimeout(setupModernSongNavSync, 1000);
