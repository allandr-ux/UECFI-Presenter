let promptDialog;
let genericPanelObj = null;
function promptInit() {
  promptDialog = new AppUI.Modal("promptDialog");
  promptDialog.render();
}
function deletePromptShow() {
  const a =
    'Are you sure you want to delete version? <br><br> <input id="yesButton" type="button" value=" YES "><input id="noButton" type="button" value=" NO "> ';
  promptDialog.setHeader("Delete Version");
  promptDialog.setBody(a);
  promptDialog.show();
  document
    .getElementById("yesButton")
    .addEventListener("click", processYes, false);
  document
    .getElementById("noButton")
    .addEventListener("click", processNo, false);
}
function processNo() {
  promptDialog.hide();
}
function processYes() {
  promptDialog.hide();
  deleteVersion();
}
function save2file(c, d, a) {
  try {
    AppStorage.writeFile(d, c);
  } catch (err) {
    console.warn("[STORAGE] save2file error:", err);
  }
}
function filesave2vvexport(c, a) {
  const d = `./vvexport/${a}.html`;
  const fullPath = AppStorage.resolvePath("vvexport", `${a}.html`);
  try {
    AppStorage.writeFile(fullPath, c);
  } catch(e) {
    console.error("[STORAGE] filesave2vvexport error:", e);
  }
}
function fileExist(b, a) {
  const fullPath = a == 1 ? AppStorage.resolveStoragePath(b) : AppStorage.resolvePath(b);
  return AppStorage.existsSync(fullPath);
}
function createFolder(b) {
  const fullPath = AppStorage.resolveStoragePath(b);
  if (typeof require === "function") {
    const fs = require("fs");
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log("Directory Created..");
    }
  }
}
function clearSelectList(b) {
  const a = document.getElementById(b);
  if (a) {
    while (a.options.length > 0) {
      a.options[0] = null;
    }
  }
}
function copyFile(d, c) {
  const src = AppStorage.resolvePath(d);
  const dest = AppStorage.resolveStoragePath(c);
  return AppStorage.copyFile(src, dest, true);
}
function extractFileName(c) {
  if (!c) return "";
  const parts = c.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1];
}
function stopWatch() {
  this.start = g;
  this.stop = c;
  this.reset = e;
  this.delta = f;
  let d = 0;
  let b = 0;
  let a = 0;
  function g() {
    const h = new Date();
    d = h.getTime();
  }
  function c() {
    const h = new Date();
    b = h.getTime();
  }
  function e() {
    d = 0;
    b = 0;
  }
  function f() {
    a = b - d;
    return a;
  }
}
function fontSizeSlider() {
  this.init = g;
  this.getFontSize = a;
  let d = null;
  const e = 14;
  function g() {
    const h = (navFontSize - 8) * 10;
    const input = AppUI.createSlider("sliderbg", 0, 200, h, (val) => {
      console.log(`Temp slider value: ${val}`);
      navFontSize = val / 10 + 8;
      processFontSizeChange();
    });
    d = {
      setValue: (val) => { if (input) input.value = val; },
      getValue: () => (input ? parseInt(input.value, 10) : 0),
      subscribe: () => {}
    };
  }
  function c() {}
  function f() {
    const h = Math.round(d.getValue());
    console.log(`Temp slider value: ${h}`);
    navFontSize = h / 10 + 8;
    processFontSizeChange();
  }
  function a() {
    return e;
  }
  function b() {}
}
function BibleReference() {
  this.init = r;
  this.present = l;
  this.getErrorMessage = f;
  this.getBook = h;
  this.getChapter = p;
  this.getVerse = k;
  this.searchCandidates = searchCandidateBooks;
  let o = null;
  let q = null;
  let m = null;
  let n = null;
  let g = null;
  let j = null;
  let b = "";
  const c = true;

  // Comprehensive canon book metadata: standard 66 books with English, Tagalog, Kapampangan, Spanish names and abbreviations
  const canonBooks = [
    { id: 0, en: "Genesis", names: ["Genesis", "Henesis"], abbr: ["gen", "ge", "gn"] },
    { id: 1, en: "Exodus", names: ["Exodus", "Exodo", "Eksodo"], abbr: ["ex", "exo", "exod"] },
    { id: 2, en: "Leviticus", names: ["Leviticus", "Levitico"], abbr: ["lev", "le", "lv"] },
    { id: 3, en: "Numbers", names: ["Numbers", "Mga Bilang", "Bilang", "Ding Bilang", "Numeros"], abbr: ["num", "nu", "nm", "nb"] },
    { id: 4, en: "Deuteronomy", names: ["Deuteronomy", "Deuteronomio"], abbr: ["deut", "dt", "de", "deu"] },
    { id: 5, en: "Joshua", names: ["Joshua", "Josue"], abbr: ["josh", "jos", "jsh"] },
    { id: 6, en: "Judges", names: ["Judges", "Mga Hukom", "Hukom", "Ding Hukom", "Jueces"], abbr: ["judg", "jdg", "jg", "jue"] },
    { id: 7, en: "Ruth", names: ["Ruth", "Rut"], abbr: ["rut", "ru", "rth"] },
    { id: 8, en: "1 Samuel", names: ["1 Samuel", "1Samuel", "1 Sam", "1Sam", "Unang Samuel"], abbr: ["1sam", "1sa", "1s"] },
    { id: 9, en: "2 Samuel", names: ["2 Samuel", "2Samuel", "2 Sam", "2Sam", "Ikalawang Samuel"], abbr: ["2sam", "2sa", "2s"] },
    { id: 10, en: "1 Kings", names: ["1 Kings", "1Kings", "1 Mga Hari", "1 Hari", "1 Ding Hari", "1 Reyes", "Unang Hari"], abbr: ["1kgs", "1ki", "1k", "1kg", "1hari"] },
    { id: 11, en: "2 Kings", names: ["2 Kings", "2Kings", "2 Mga Hari", "2 Hari", "2 Ding Hari", "2 Reyes", "Ikalawang Hari"], abbr: ["2kgs", "2ki", "2k", "2kg", "2hari"] },
    { id: 12, en: "1 Chronicles", names: ["1 Chronicles", "1Chronicles", "1 Mga Cronica", "1 Cronica", "1 Ding Cronica", "1 Cronicas", "1 Cron", "Unang Cronica"], abbr: ["1chr", "1ch", "1cron", "1cr"] },
    { id: 13, en: "2 Chronicles", names: ["2 Chronicles", "2Chronicles", "2 Mga Cronica", "2 Cronica", "2 Ding Cronica", "2 Cronicas", "2 Cron", "Ikalawang Cronica"], abbr: ["2chr", "2ch", "2cron", "2cr"] },
    { id: 14, en: "Ezra", names: ["Ezra", "Esdras"], abbr: ["ezr", "ez", "esd"] },
    { id: 15, en: "Nehemiah", names: ["Nehemiah", "Nehemias"], abbr: ["neh", "ne", "nehem"] },
    { id: 16, en: "Esther", names: ["Esther", "Ester"], abbr: ["est", "esth", "es"] },
    { id: 17, en: "Job", names: ["Job"], abbr: ["jb"] },
    { id: 18, en: "Psalms", names: ["Psalms", "Psalm", "Mga Awit", "Awit", "Ding Salmo", "Salmo", "Salmos"], abbr: ["ps", "psa", "psm", "pss"] },
    { id: 19, en: "Proverbs", names: ["Proverbs", "Proverb", "Mga Kawikaan", "Kawikaan", "Ding Proverbio", "Proverbio", "Proverbios"], abbr: ["prov", "pro", "prv", "pr"] },
    { id: 20, en: "Ecclesiastes", names: ["Ecclesiastes", "Mga Mangangaral", "Mangangaral", "Eclesiastes", "Eclesiastés", "Qoheleth"], abbr: ["eccl", "ecc", "ec", "qoh"] },
    { id: 21, en: "Song of Solomon", names: ["Song of Solomon", "Song of Songs", "Awit ni Solomon", "Awit ng mga Awit", "Cantares", "Cantar de los Cantares", "Kanta da ring Kanta"], abbr: ["song", "songs", "sos", "cant", "cantares"] },
    { id: 22, en: "Isaiah", names: ["Isaiah", "Isaias"], abbr: ["isa", "is"] },
    { id: 23, en: "Jeremiah", names: ["Jeremiah", "Jeremias"], abbr: ["jer", "je", "jr"] },
    { id: 24, en: "Lamentations", names: ["Lamentations", "Mga Panaghoy", "Panaghoy", "Ding Panangis", "Panangis", "Lamentaciones"], abbr: ["lam", "la"] },
    { id: 25, en: "Ezekiel", names: ["Ezekiel", "Ezequiel"], abbr: ["ezek", "eze", "ezk"] },
    { id: 26, en: "Daniel", names: ["Daniel"], abbr: ["dan", "da", "dn"] },
    { id: 27, en: "Hosea", names: ["Hosea", "Oseas"], abbr: ["hos", "ho"] },
    { id: 28, en: "Joel", names: ["Joel"], abbr: ["jl", "joe"] },
    { id: 29, en: "Amos", names: ["Amos", "Amós"], abbr: ["am", "amo"] },
    { id: 30, en: "Obadiah", names: ["Obadiah", "Obadias", "Abdias", "Abdías"], abbr: ["obad", "ob", "abd"] },
    { id: 31, en: "Jonah", names: ["Jonah", "Jonas", "Jonás"], abbr: ["jon", "jnh"] },
    { id: 32, en: "Micah", names: ["Micah", "Mikas", "Miqueas"], abbr: ["mic", "mc"] },
    { id: 33, en: "Nahum", names: ["Nahum", "Nahúm"], abbr: ["nah", "na"] },
    { id: 34, en: "Habakkuk", names: ["Habakkuk", "Habacuc"], abbr: ["hab", "hb"] },
    { id: 35, en: "Zephaniah", names: ["Zephaniah", "Zefanias", "Sofonias", "Sofonías"], abbr: ["zeph", "zep", "zp"] },
    { id: 36, en: "Haggai", names: ["Haggai", "Hageo"], abbr: ["hag", "hg"] },
    { id: 37, en: "Zechariah", names: ["Zechariah", "Zacarias", "Zacarías"], abbr: ["zech", "zec", "zc"] },
    { id: 38, en: "Malachi", names: ["Malachi", "Malakias", "Malaquias", "Malaquías"], abbr: ["mal", "ml"] },
    { id: 39, en: "Matthew", names: ["Matthew", "Mateo"], abbr: ["matt", "mat", "mt"] },
    { id: 40, en: "Mark", names: ["Mark", "Marcos"], abbr: ["mrk", "mk", "mr"] },
    { id: 41, en: "Luke", names: ["Luke", "Lucas"], abbr: ["luk", "lk", "lu"] },
    { id: 42, en: "John", names: ["John", "Juan"], abbr: ["jhn", "jn", "j"] },
    { id: 43, en: "Acts", names: ["Acts", "Mga Gawa", "Gawa", "Ding Gawa", "Hechos"], abbr: ["act", "ac"] },
    { id: 44, en: "Romans", names: ["Romans", "Mga Taga-Roma", "Taga-Roma", "Roma", "Romanos"], abbr: ["rom", "ro", "rm"] },
    { id: 45, en: "1 Corinthians", names: ["1 Corinthians", "1Corinthians", "1 Mga Taga-Corinto", "1 Taga-Corinto", "1 Corinto", "1 Corintios", "1 Cor"], abbr: ["1cor", "1co", "1c"] },
    { id: 46, en: "2 Corinthians", names: ["2 Corinthians", "2Corinthians", "2 Mga Taga-Corinto", "2 Taga-Corinto", "2 Corinto", "2 Corintios", "2 Cor"], abbr: ["2cor", "2co", "2c"] },
    { id: 47, en: "Galatians", names: ["Galatians", "Mga Taga-Galacia", "Taga-Galacia", "Galacia", "Gálatas", "Galatas"], abbr: ["gal", "ga"] },
    { id: 48, en: "Ephesians", names: ["Ephesians", "Mga Taga-Efeso", "Taga-Efeso", "Efeso", "Efesios"], abbr: ["eph", "ep"] },
    { id: 49, en: "Philippians", names: ["Philippians", "Mga Taga-Filipos", "Taga-Filipos", "Filipos", "Filipenses"], abbr: ["phil", "php", "flp"] },
    { id: 50, en: "Colossians", names: ["Colossians", "Mga Taga-Colosas", "Taga-Colosas", "Colosas", "Colosenses"], abbr: ["col", "cl"] },
    { id: 51, en: "1 Thessalonians", names: ["1 Thessalonians", "1Thessalonians", "1 Mga Taga-Tesalonica", "1 Taga-Tesalonica", "1 Tesalonica", "1 Tesalonicenses", "1 Tes"], abbr: ["1thess", "1th", "1ts", "1tes"] },
    { id: 52, en: "2 Thessalonians", names: ["2 Thessalonians", "2Thessalonians", "2 Mga Taga-Tesalonica", "2 Taga-Tesalonica", "2 Tesalonica", "2 Tesalonicenses", "2 Tes"], abbr: ["2thess", "2th", "2ts", "2tes"] },
    { id: 53, en: "1 Timothy", names: ["1 Timothy", "1Timothy", "1 Kay Timoteo", "1 Timoteo", "1 Tim"], abbr: ["1tim", "1ti", "1tm"] },
    { id: 54, en: "2 Timothy", names: ["2 Timothy", "2Timothy", "2 Kay Timoteo", "2 Timoteo", "2 Tim"], abbr: ["2tim", "2ti", "2tm"] },
    { id: 55, en: "Titus", names: ["Titus", "Kay Tito", "Tito"], abbr: ["tit", "ti"] },
    { id: 56, en: "Philemon", names: ["Philemon", "Kay Filemon", "Filemon", "Filemón"], abbr: ["phlm", "phm", "pm"] },
    { id: 57, en: "Hebrews", names: ["Hebrews", "Hebreo", "Hebreos"], abbr: ["heb", "he"] },
    { id: 58, en: "James", names: ["James", "Santiago"], abbr: ["jas", "jm", "stg"] },
    { id: 59, en: "1 Peter", names: ["1 Peter", "1Peter", "1 Pedro", "1 Ped", "1 Pet"], abbr: ["1pet", "1pe", "1pt", "1p"] },
    { id: 60, en: "2 Peter", names: ["2 Peter", "2Peter", "2 Pedro", "2 Ped", "2 Pet"], abbr: ["2pet", "2pe", "2pt", "2p"] },
    { id: 61, en: "1 John", names: ["1 John", "1John", "1 Juan", "1 Jn"], abbr: ["1jn", "1jhn", "1j"] },
    { id: 62, en: "2 John", names: ["2 John", "2John", "2 Juan", "2 Jn"], abbr: ["2jn", "2jhn", "2j"] },
    { id: 63, en: "3 John", names: ["3 John", "3John", "3 Juan", "3 Jn"], abbr: ["3jn", "3jhn", "3j"] },
    { id: 64, en: "Jude", names: ["Jude", "Judas"], abbr: ["jud", "jde"] },
    { id: 65, en: "Revelation", names: ["Revelation", "Revelations", "Apocalipsis", "Pahayag", "Pasingag"], abbr: ["rev", "re", "apoc"] }
  ];

  // Dynamically collect extra book names from all XML Bibles (both active and inactive) in filesystem or memory
  function getDynamicBookNames() {
    const customMap = {};
    for (let i = 0; i < 66; i++) customMap[i] = [];

    // 1. From global default_booknames and booknames arrays
    if (typeof default_booknames !== "undefined" && Array.isArray(default_booknames)) {
      default_booknames.forEach((item, idx) => {
        if (idx < 66 && item) {
          const parts = item.split("/");
          parts.forEach(p => {
            const trimmed = p.trim();
            if (trimmed && !customMap[idx].includes(trimmed)) customMap[idx].push(trimmed);
          });
        }
      });
    }

    if (typeof booknames !== "undefined" && Array.isArray(booknames)) {
      booknames.forEach((item, idx) => {
        if (idx < 66 && item) {
          const parts = item.split("/");
          parts.forEach(p => {
            const trimmed = p.trim();
            if (trimmed && !customMap[idx].includes(trimmed)) customMap[idx].push(trimmed);
          });
        }
      });
    }

    // 2. From all XML files in bible/, storage/bible/, or root directory
    try {
      let nodeFs = null;
      if (typeof require === "function") {
        try { nodeFs = require("fs"); } catch(e) {}
      }
      if (nodeFs) {
        const dirs = ["./bible", "./storage/bible", "."];
        const processedFiles = new Set();
        dirs.forEach(dir => {
          if (!nodeFs.existsSync(dir)) return;
          try {
            const files = nodeFs.readdirSync(dir);
            files.forEach(f => {
              if (!f.endsWith(".xml") || processedFiles.has(f)) return;
              processedFiles.add(f);
              try {
                const content = nodeFs.readFileSync(dir + "/" + f, "latin1");
                const cdata = content.match(/<booknames><!\[CDATA\[(.*?)\]\]><\/booknames>/);
                if (cdata) {
                  const arr = cdata[1].split(",");
                  arr.forEach((bname, idx) => {
                    const trimmed = bname.trim();
                    if (idx < 66 && trimmed && !customMap[idx].includes(trimmed)) {
                      customMap[idx].push(trimmed);
                    }
                  });
                } else {
                  const bTags = [...content.matchAll(/<b n=\"([^\"]+)\"/g)].map(x => x[1]);
                  bTags.forEach((bname, idx) => {
                    const trimmed = bname.trim();
                    if (idx < 66 && trimmed && !customMap[idx].includes(trimmed)) {
                      customMap[idx].push(trimmed);
                    }
                  });
                }
              } catch(err) {}
            });
          } catch(err) {}
        });
      }
    } catch(err) {}

    return customMap;
  }

  // Normalization helper: strips accents, removes punctuation, formats leading digits
  function norm(str) {
    if (!str) return "";
    return str
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^(?:first|1st)\s*/i, "1")
      .replace(/^(?:second|2nd)\s*/i, "2")
      .replace(/^(?:third|3rd)\s*/i, "3")
      .replace(/^iii\s*/i, "3")
      .replace(/^ii\s*/i, "2")
      .replace(/^i\s*/i, "1")
      .replace(/^(\d+)\s*/, "$1")
      .replace(/[^a-z0-9]/g, "");
  }

  // Levenshtein distance for fuzzy matching typos
  function levenshtein(s1, s2) {
    const len1 = s1.length;
    const len2 = s2.length;
    const dp = Array.from({ length: len1 + 1 }, () => new Int32Array(len2 + 1));
    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let k = 0; k <= len2; k++) dp[0][k] = k;
    for (let i = 1; i <= len1; i++) {
      for (let k = 1; k <= len2; k++) {
        const cost = s1[i - 1] === s2[k - 1] ? 0 : 1;
        dp[i][k] = Math.min(
          dp[i - 1][k] + 1,
          dp[i][k - 1] + 1,
          dp[i - 1][k - 1] + cost
        );
      }
    }
    return dp[len1][len2];
  }

  // Find book index 0..65 based on user's query string
  function findBookIndex(bookQuery) {
    const qNorm = norm(bookQuery);
    if (!qNorm) return -1;

    const dynamicNames = getDynamicBookNames();

    // Pass 1: Exact match against all canon names, abbreviations, and dynamic uploaded version names
    for (let i = 0; i < canonBooks.length; i++) {
      const bItem = canonBooks[i];
      const allNames = bItem.names.concat(bItem.abbr).concat(dynamicNames[i] || []);
      for (let name of allNames) {
        if (norm(name) === qNorm) {
          return i;
        }
      }
    }

    // Pass 2: Prefix / Starts-with match (if query is at least 3 chars)
    if (qNorm.length >= 3) {
      for (let i = 0; i < canonBooks.length; i++) {
        const bItem = canonBooks[i];
        const allNames = bItem.names.concat(dynamicNames[i] || []);
        for (let name of allNames) {
          const nN = norm(name);
          if (nN.startsWith(qNorm) || (qNorm.length >= 4 && qNorm.startsWith(nN))) {
            return i;
          }
        }
      }
    }

    // Pass 3: Fuzzy matching using Levenshtein distance (tolerates typos and misspellings)
    let bestIdx = -1;
    let bestDist = 999;
    for (let i = 0; i < canonBooks.length; i++) {
      const bItem = canonBooks[i];
      const allNames = bItem.names.concat(dynamicNames[i] || []);
      for (let name of allNames) {
        const nN = norm(name);

        // Ensure leading digits match (preventing 1 Cor from matching 2 Cor)
        const qDigit = qNorm.match(/^(\d)/);
        const nDigit = nN.match(/^(\d)/);
        if (qDigit && nDigit && qDigit[1] !== nDigit[1]) continue;
        if (qDigit && !nDigit) continue;
        if (!qDigit && nDigit) continue;

        const dist = levenshtein(qNorm, nN);
        const maxAllowed = nN.length >= 7 ? 3 : (nN.length >= 4 ? 2 : 1);
        if (dist <= maxAllowed && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
    }

    return bestIdx;
  }

  // Typeahead candidate search: returns all matching books with scores and strongest candidate
  function searchCandidateBooks(input) {
    if (!input || typeof input !== "string") return null;
    let clean = input.trim()
      .replace(/^(?:first|1st)\s+/i, "1 ")
      .replace(/^(?:second|2nd)\s+/i, "2 ")
      .replace(/^(?:third|3rd)\s+/i, "3 ")
      .replace(/^iii\s+/i, "3 ")
      .replace(/^ii\s+/i, "2 ")
      .replace(/^i\s+/i, "1 ");

    // Extract book part before any chapter or chapter:verse digits
    let m = clean.match(/^(.+?)\s*\d+[\s:\.,]*\d*$/);
    let bookQuery = m ? m[1].trim() : clean;

    const qNorm = norm(bookQuery);
    if (!qNorm) return null;

    const dynamicNames = getDynamicBookNames();
    const scoredCandidates = [];

    for (let i = 0; i < canonBooks.length; i++) {
      const b = canonBooks[i];
      const allNames = b.names.concat(b.abbr).concat(dynamicNames[i] || []);
      let bestScore = -1;
      let matchedName = "";
      let matchType = "";

      for (let name of allNames) {
        const nN = norm(name);
        if (!nN) continue;

        // 1. Exact match
        if (nN === qNorm) {
          bestScore = 1000;
          matchedName = name;
          matchType = "exact";
          break;
        }

        // Leading digit check
        const qDigit = qNorm.match(/^(\d)/);
        const nDigit = nN.match(/^(\d)/);
        if (qDigit && nDigit && qDigit[1] !== nDigit[1]) continue;
        if (qDigit && !nDigit && !/^\d+$/.test(qNorm)) continue;
        if (!qDigit && nDigit) continue;

        // 2. Prefix match
        if (nN.startsWith(qNorm)) {
          const score = 800 - (nN.length - qNorm.length) * 10;
          if (score > bestScore) {
            bestScore = score;
            matchedName = name;
            matchType = "prefix";
          }
        }
        // 3. Substring match
        else if (nN.includes(qNorm) && qNorm.length >= 2) {
          const score = 600 - (nN.length - qNorm.length) * 10;
          if (score > bestScore) {
            bestScore = score;
            matchedName = name;
            matchType = "substring";
          }
        }
        // 4. Fuzzy match
        else if (qNorm.length >= 3) {
          const dist = levenshtein(qNorm, nN);
          const maxDist = nN.length >= 7 ? 3 : (nN.length >= 4 ? 2 : 1);
          if (dist <= maxDist) {
            const score = 400 - dist * 50;
            if (score > bestScore) {
              bestScore = score;
              matchedName = name;
              matchType = "fuzzy";
            }
          }
        }
      }

      if (bestScore > 0) {
        scoredCandidates.push({
          bookIndex: i,
          score: bestScore,
          matchType: matchType,
          matchedName: matchedName,
          enName: b.en
        });
      }
    }

    scoredCandidates.sort((a, b) => b.score - a.score);

    return {
      query: bookQuery,
      strongestCandidate: scoredCandidates.length > 0 ? scoredCandidates[0].bookIndex : -1,
      candidates: scoredCandidates
    };
  }

  function r(t) {
    o = t;
    b = "";
    const s = e();
    return s;
  }

  function e() {
    let isValid = true;
    let z = o;
    a(`Processing ...: ${z}`);
    g = 1;
    j = 1;

    if (!z || typeof z !== "string") {
      b = "Please enter a scripture reference.";
      return false;
    }

    let clean = z.trim();

    // Standardize leading Roman numerals or ordinal words: e.g. "I Cor", "1st John"
    clean = clean
      .replace(/^(?:first|1st)\s+/i, "1 ")
      .replace(/^(?:second|2nd)\s+/i, "2 ")
      .replace(/^(?:third|3rd)\s+/i, "3 ")
      .replace(/^iii\s+/i, "3 ")
      .replace(/^ii\s+/i, "2 ")
      .replace(/^i\s+/i, "1 ");

    let parsedBookStr = "";

    // Pattern 1: Book Chapter:Verse or Book Chapter.Verse or Book Chapter,Verse or Book Chapter Verse
    // e.g. "John 3:16", "1 Cor 13 4", "1Cor 13:4", "Psa 23:1", "Genisis 1:1"
    let match = clean.match(/^(.+?)\s*(\d+)[\s:\.,]+(\d+)\s*$/);
    if (match) {
      parsedBookStr = match[1].trim();
      g = parseInt(match[2], 10);
      j = match[3] ? parseInt(match[3], 10) : 1;
    } else {
      // Pattern 2: Book Chapter (e.g. "John 3", "Psa 23", "1 Cor 13") -> verse defaults to 1
      match = clean.match(/^(.+?)\s+(\d+)\s*$/);
      if (match) {
        parsedBookStr = match[1].trim();
        g = parseInt(match[2], 10);
        j = 1;
      } else {
        // Pattern 3: Just Book Name -> chapter 1, verse 1
        parsedBookStr = clean;
        g = 1;
        j = 1;
      }
    }

    q = parsedBookStr;
    a(`Parsed Query: Book='${q}', Chapter=${g}, Verse=${j}`);

    // Resolve book index across all active and inactive versions and fuzzy spelling rules
    n = findBookIndex(q);

    if (n === -1) {
      b = `Did not find matching book name for "${q}"`;
      isValid = false;
    } else {
      // Determine presentation book title from active booknames array if available, or canonical English name
      if (typeof booknames !== "undefined" && booknames[n]) {
        m = booknames[n];
      } else {
        m = canonBooks[n].en;
      }

      if (!IsNumeric(g.toString()) || isNaN(g) || g < 1) {
        b = "Invalid chapter number.";
        isValid = false;
      } else if (!IsNumeric(j.toString()) || isNaN(j) || j < 1) {
        b = "Invalid verse number.";
        isValid = false;
      } else if (typeof numofch !== "undefined" && numofch[n + 1]) {
        const lastCh = numofch[n + 1][0];
        a(`Last Chapter number: ${lastCh}`);
        if (g < 1 || g > lastCh) {
          b = `Invalid chapter number ${g} for ${m} (max: ${lastCh})`;
          isValid = false;
        } else {
          const lastVer = numofch[n + 1][g];
          a(`Last Verse number: ${lastVer}`);
          if (j < 1 || j > lastVer) {
            b = `Invalid verse number ${j} for ${m} ${g} (max: ${lastVer})`;
            isValid = false;
          }
        }
      }
    }

    return isValid;
  }

  function l() {
    bookIndex = n;
    chapterIndex = g - 1;
    verseIndex = j - 1;
    recent.addSelection(bookIndex, chapterIndex, verseIndex);
    getdata();
    p_footer = `${bibleVersionArray[version1][3]} / ${bibleVersionArray[version2][3]}`;
    p_title = `${m} ${chapterIndex + 1}`;
    launch(verseIndex);
  }
  function d() {}
  function f() {
    a(b);
    return b;
  }
  function h() {
    return n;
  }
  function p() {
    return g;
  }
  function k() {
    return j;
  }
  function a(s) {
    if (c) {
      console.log(`[BIBLE REF]: ${s}`);
    }
  }
}
function icon(a, n, e, d, b) {
  this.disableIcon = o;
  this.enableIcon = c;
  const l = a;
  const f = n;
  const k = e;
  const j = d;
  const g = b;
  let h = null;
  
  let el = document.getElementById(l);
  if (el && el.tagName.toLowerCase() === 'img') {
    let span = document.createElement('span');
    span.id = el.id;
    span.className = 'material-symbols-outlined modern-icon';
    span.title = f;
    
    let sym = "star";
    let src = k.toLowerCase();
    if (src.includes("present")) sym = "play_circle";
    else if (src.includes("left")) sym = "arrow_back";
    else if (src.includes("right")) sym = "arrow_forward";
    else if (src.includes("close")) sym = "close";
    else if (src.includes("schedule")) sym = "list_alt";
    else if (src.includes("clear")) sym = "backspace";
    else if (src.includes("search")) sym = "search";
    else if (src.includes("down")) sym = "arrow_downward";
    else if (src.includes("up")) sym = "arrow_upward";
    else if (src.includes("delall")) sym = "delete_sweep";
    else if (src.includes("del")) sym = "delete";
    else if (src.includes("add")) sym = "add_circle";
    
    span.innerText = sym;
    el.parentNode.replaceChild(span, el);
    el = span;
  }
  
  if (el) {
    el.addEventListener("mouseover", m, false);
    el.addEventListener("mouseout", i, false);
    el.addEventListener("mousedown", p, false);
    el.addEventListener("mouseup", m, false);
  }

  function o() {
    if (el) el.style.opacity = '0.3';
    if (el) el.style.pointerEvents = 'none';
  }
  function c() {
    if (el) el.style.opacity = '1.0';
    if (el) el.style.pointerEvents = 'auto';
  }
  function m() {}
  function i() {}
  function p() {}
}

function invert_hex_color(d) {
  const e = "0123456789ABCDEF";
  function c(f) {
    return e.charAt((f >> 4) & 15) + e.charAt(f & 15);
  }
  function b(f) {
    f = f.toUpperCase();
    return parseInt(f, 16);
  }
  function a(f) {
    if (f.length < 6 || f.length > 6) {
      window.alert("You Must Enter a six digit color code");
      return false;
    }
    hex1 = f.slice(0, 2);
    hexb1 = f.slice(2, 4);
    hexc1 = f.slice(4, 6);
    hex2 = 16 * b(hex1.slice(0, 1));
    hex3 = b(hex1.slice(1, 2));
    hex1 = hex1 + hex2;
    hexb2 = 16 * b(hexb1.slice(0, 1));
    hexb3 = b(hexb1.slice(1, 2));
    hexb1 = hexb2 + hexb3;
    hexc2 = 16 * b(hexc1.slice(0, 1));
    hexc3 = b(hexc1.slice(1, 2));
    hexc1 = hexc2 + hexc3;
    newColor = `${c(255 - hex1)}${c(255 - hexb1)}${c(255 - hexc1)}`;
    return newColor;
  }
  return a(d);
}
function generateGenericPanel() {
  genericPanelObj = new AppUI.Modal("genericPanelObj");
  genericPanelObj.render();
  genericPanelObj.setHeader("Bible Version Selection");
  genericPanelObj.setBody("test");
  genericPanelObj.show();
}
function promoteVV(a) {
  p_text1_arr = new Array();
  p_text2_arr = new Array();
  p_title = "";
  p_footnote = "";
  p_title_arr = [];
  p_current_index = 0;
  p_last_index = 0;
  // A promo slide supersedes any live program for transport purposes.
  if (typeof window !== "undefined") window.liveProgramActive = false;
  // Design comes from ThemeManager ("verses" context). The legacy promo
  // images (promote1/2.jpg) were removed; this now projects a plain
  // gradient slide. The explicit image-mode patch below keeps the renderer
  // on the p_bkgnd_filename branch.
  if (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.applyThemeToProjection === "function") {
    window.themeManager.applyThemeToProjection("verses");
  }
  if (typeof setLiveProjectionType === "function") setLiveProjectionType("verses");
  p_bkgnd_filename = "./background/UECFI.png";
  // Force image-background mode on the active theme copy (not the stored
  // theme) so the renderer takes the p_bkgnd_filename branch above instead
  // of painting the theme's gradient/color background over the promo slide.
  if (window.activeThemeObj) {
    window.activeThemeObj = Object.assign({}, window.activeThemeObj, { backgroundType: "image" });
  }
  presentation();
}
/**
 * Minimal toast notification (bottom-center, auto-dismiss).
 * Inline styles only so it works regardless of stylesheet state.
 */
function showToast(message, type) {
  try {
    let host = document.getElementById("uecfiToastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "uecfiToastHost";
      host.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    const bg = (type === "error") ? "#dc2626" : (type === "info") ? "#2563eb" : "#059669";
    const mark = (type === "error") ? "\u2715" : (type === "info") ? "i" : "\u2713";
    el.style.cssText = `display:flex;align-items:center;gap:8px;background:${bg};color:#fff;font-size:13px;font-weight:600;padding:10px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.25);opacity:0;transition:opacity 0.2s ease;max-width:80vw;`;
    const icon = document.createElement("span");
    icon.textContent = mark;
    const label = document.createElement("span");
    label.textContent = message;
    el.appendChild(icon);
    el.appendChild(label);
    host.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; });
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, 2600);
  } catch (e) {}
}
