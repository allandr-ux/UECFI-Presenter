/*
 * program.js
 * Comprehensive Program Management for UECFI Presenter
 * Supports: Person, Song, Scripture, Tema, and General program items.
 * Allows adding, editing, reordering, deleting, previewing, and live presenting.
 */

/**
 * Book name in the PRIMARY Bible version only.
 * Stored names use the dual-language "Primary/Secondary" convention
 * (e.g. "Mga Awit/Psalms"), where the first segment is the primary
 * (version1) language -- so only the text before "/" is shown.
 * Used for Batayan and scripture reference displays alike.
 */
function primaryBookName(ref) {
  let name = "";
  if (ref && ref.bookName) {
    name = ref.bookName;
  } else if (ref && typeof ref.bookIndex === "number" &&
             typeof booknames !== "undefined" && booknames[ref.bookIndex]) {
    name = booknames[ref.bookIndex];
  }
  return String(name).split("/")[0].trim();
}

class ProgramManager {
  constructor() {
    this.items = [];
    this.selectedItemIndex = -1;
    this.presentedItemIndex = -1;
    this.presentedSlideIndex = -1;
    this.editingIndex = -1;
    this.dbFile = null;
    this.workingCustomSlide = null;
    this.editingCustomSlideIndex = -1;
    this.editingCustomSlideFromModal = false;
    // Live file lives under storage/ (writable on installed builds);
    // shipped program/program.json is first-run fallback only.
    this.storagePath = "storage/program/program.json";
    this.fallbackPath = "program/program.json";
  }

  init() {
    console.log("[PROGRAM] Initializing ProgramManager...");
    this.loadProgramData();
    this.renderLeftNav();
    this.renderRightWorkspace();
    this.bindEvents();
  }

  // Persist items to the writable storage file + localStorage mirror.
  // Never writes the shipped fallback (read-only on installed builds).
  saveProgramData() {
    const dataStr = JSON.stringify(this.items, null, 2);
    try {
      if (typeof AppStorage !== "undefined" && AppStorage.writeFile) {
        AppStorage.writeFile(this.storagePath, dataStr);
      }
    } catch (e) {
      console.warn("[PROGRAM] Error saving program data:", e);
    }
    try {
      localStorage.setItem("uecfi_program_items", dataStr);
    } catch (e) {
      console.warn("[PROGRAM] localStorage mirror failed:", e);
    }
  }

  // Load order: storage file -> localStorage -> shipped fallback.
  // The old code read the shipped file first, so edits saved to
  // localStorage (or a failed Program-Files write) were shadowed on
  // restart and items appeared to not persist.
  loadProgramData() {
    const tryReadSync = (relPath) => {
      try {
        let fullPath = relPath;
        if (typeof AppStorage !== "undefined" && AppStorage.resolveStoragePath && relPath === this.storagePath) {
          fullPath = AppStorage.resolveStoragePath("program", "program.json");
        } else if (typeof AppStorage !== "undefined" && AppStorage.appDir) {
          const path = require("path");
          fullPath = path.join(AppStorage.appDir(), relPath);
        }
        if (typeof require === "function") {
          const fs = require("fs");
          if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, "utf8");
          }
        }
      } catch (e) {}
      return null;
    };

    let loaded = false;
    // 1. Writable storage file (source of truth once it exists)
    try {
      const stored = tryReadSync(this.storagePath);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.items = parsed;
          loaded = true;
        }
      }
    } catch (e) {
      console.warn("[PROGRAM] Could not read storage file:", e);
    }

    // 2. localStorage mirror (covers web/failed-disk cases, newer than shipped)
    if (!loaded) {
      const localStr = localStorage.getItem("uecfi_program_items");
      if (localStr) {
        try {
          const parsed = JSON.parse(localStr);
          if (Array.isArray(parsed)) {
            this.items = parsed;
            loaded = true;
          }
        } catch (e) {
          console.error("[PROGRAM] Error parsing localStorage items", e);
        }
      }
    }

    // 3. Shipped fallback (first run): adopt it into storage so later
    // edits have a writable home.
    if (!loaded) {
      try {
        const shipped = tryReadSync(this.fallbackPath);
        if (shipped !== null) {
          const parsed = JSON.parse(shipped);
          if (Array.isArray(parsed)) {
            this.items = parsed;
            loaded = true;
            // Adopt shipped content into the writable storage file.
            try { this.saveProgramData(); } catch (e) {}
          }
        }
      } catch (e) {
        console.warn("[PROGRAM] Could not read shipped fallback:", e);
      }
    }

    if (!loaded || !Array.isArray(this.items)) {
      // Fresh installs start with an empty program; the operator builds it
      // with "+ Add Item". (An intentionally emptied program stays empty.)
      this.items = [];
      this.saveProgramData();
    }
  }

  bindEvents() {
    // Toolbar buttons in header
    const addBtn = document.getElementById("prog_add_btn");
    if (addBtn) addBtn.onclick = () => this.openItemModal(-1);

    const prevBtn = document.getElementById("prog_prev_btn");
    if (prevBtn) prevBtn.onclick = () => this.previousSlide();

    const nextBtn = document.getElementById("prog_next_btn");
    if (nextBtn) nextBtn.onclick = () => this.nextSlide();

    const closeBtn = document.getElementById("prog_close_btn");
    if (closeBtn) closeBtn.onclick = () => {
      if (typeof closePresentWindow === "function") closePresentWindow();
      this.clearPresentationHighlight();
    };

    const clearAllBtn = document.getElementById("prog_clear_all_btn");
    if (clearAllBtn) clearAllBtn.onclick = () => this.clearAllItems();

    const importBtn = document.getElementById("prog_import_btn");
    if (importBtn) importBtn.onclick = () => this.importProgram();

    const exportBtn = document.getElementById("prog_export_btn");
    if (exportBtn) exportBtn.onclick = () => this.exportProgram();
  }

  // Render left panel items list
  renderLeftNav() {
    const container = document.getElementById("programItemList");
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-slate-400 text-xs italic flex flex-col items-center justify-center space-y-2">
          <i class="fa-solid fa-list-check text-2xl text-slate-300"></i>
          <span>No program items added yet.</span>
          <div class="flex items-center gap-2 mt-2">
            <button onclick="programManager.openItemModal(-1)" class="px-3 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg font-bold text-xs transition">
              + Add First Item
            </button>
            <button onclick="programManager.importProgram()" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-semibold text-xs transition flex items-center gap-1.5">
              <i class="fa-solid fa-file-import text-brand-600 text-xs"></i> Import JSON
            </button>
          </div>
        </div>
      `;
      return;
    }

    let html = "";
    this.items.forEach((item, idx) => {
      const isSelected = idx === this.selectedItemIndex;
      const isPresented = idx === this.presentedItemIndex;

      let typeBadge = "";
      switch (item.type) {
        case "person":
          typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"><i class="fa-solid fa-user-tie"></i> Person</span>';
          break;
        case "song":
          typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200"><i class="fa-solid fa-music"></i> Song</span>';
          break;
        case "scripture":
          typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200"><i class="fa-solid fa-book-bible"></i> Scripture</span>';
          break;
        case "tema":
          typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><i class="fa-solid fa-cross"></i> Tema</span>';
          break;
        case "general":
        default:
          typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"><i class="fa-regular fa-file-lines"></i> General</span>';
          break;
      }

      let rowClass = "p-2 rounded-lg border cursor-pointer flex flex-col gap-1 relative group transition ";
      if (isPresented) {
        rowClass += "prog-item-presented";
      } else if (isSelected) {
        rowClass += "prog-item-selected";
      } else {
        rowClass += "bg-slate-50 border-slate-200 hover:border-brand-500 hover:shadow-sm text-slate-800";
      }

      // Secondary summary line
      let summaryText = "";
      if (item.type === "person") {
        const rawName = item.data.name || "";
        const pTitle = item.data.personTitle || "";
        const cleanName = (pTitle && rawName.toLowerCase().startsWith(pTitle.toLowerCase() + " "))
          ? rawName.substring(pTitle.length).trim()
          : rawName;
        const fullPersonName = [pTitle, cleanName].filter(Boolean).join(" ");
        summaryText = fullPersonName ? `${fullPersonName}${item.data.centro ? ` (${item.data.centro})` : ""}` : (item.data.centro || "");
      } else if (item.type === "song") {
        const slideCount = this.generateSlidesForItem(item).length;
        summaryText = `${slideCount} slide${slideCount !== 1 ? "s" : ""}`;
      } else if (item.type === "scripture") {
        if (item.data.references && item.data.references.length > 0) {
          summaryText = item.data.references.map(r => `${primaryBookName(r)} ${r.chapter}:${r.fromVerse}${r.toVerse > r.fromVerse ? "-" + r.toVerse : ""}`).join("; ");
        }
      } else if (item.type === "tema") {
        summaryText = item.data.tema ? item.data.tema.substring(0, 45) + (item.data.tema.length > 45 ? "..." : "") : "";
      } else if (item.type === "general") {
        summaryText = item.data.content ? item.data.content.substring(0, 45) + (item.data.content.length > 45 ? "..." : "") : "";
      }

      html += `
        <div id="prog_item_row_${idx}" 
             onclick="programManager.selectItem(${idx})"
             ondblclick="programManager.presentItem(${idx})"
             class="${rowClass}">
          <div class="flex items-center justify-between gap-1">
            <span class="prog-item-title text-xs font-bold leading-snug truncate max-w-[200px]">${item.title}</span>
            <div class="shrink-0">${typeBadge}</div>
          </div>
          <div class="flex items-center justify-between gap-1">
            <div class="text-[11px] opacity-75 truncate flex-1 min-w-0">${summaryText ? summaryText : `Item #${idx + 1}`}</div>
            <div class="flex items-center gap-1 opacity-90 shrink-0 text-[10px]">
              <div class="has-tooltip"><button onclick="event.stopPropagation(); programManager.moveItem(${idx}, -1)" class="p-1 hover:bg-black/10 rounded"><i class="fa-solid fa-chevron-up"></i></button><div class="tooltip-content tooltip-bottom">Move Up</div></div>
              <div class="has-tooltip"><button onclick="event.stopPropagation(); programManager.moveItem(${idx}, 1)" class="p-1 hover:bg-black/10 rounded"><i class="fa-solid fa-chevron-down"></i></button><div class="tooltip-content tooltip-bottom">Move Down</div></div>
              ${(item.type === "person" || item.type === "general") ? `
                <div class="has-tooltip"><button onclick="event.stopPropagation(); programManager.openCustomSlideDesigner(${idx})" class="p-1 hover:bg-black/10 rounded ${(item.customSlide && item.customSlide.active) ? 'text-brand-600 font-bold' : 'text-slate-600'}"><i class="fa-solid fa-palette"></i></button><div class="tooltip-content tooltip-bottom">Customize Slide</div></div>
              ` : ""}
              <div class="has-tooltip"><button onclick="event.stopPropagation(); programManager.exportSingleItem(${idx})" class="p-1 hover:bg-black/10 rounded text-slate-600"><i class="fa-solid fa-file-export"></i></button><div class="tooltip-content tooltip-bottom">Export Item</div></div>
              <div class="has-tooltip"><button onclick="event.stopPropagation(); programManager.openItemModal(${idx})" class="p-1 hover:bg-black/10 rounded"><i class="fa-solid fa-pen-to-square"></i></button><div class="tooltip-content tooltip-bottom">Edit Item</div></div>
              <div class="has-tooltip"><button onclick="event.stopPropagation(); programManager.deleteItem(${idx})" class="p-1 hover:bg-red-500/20 text-red-500 rounded"><i class="fa-regular fa-trash-can"></i></button><div class="tooltip-content tooltip-bottom">Delete Item</div></div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // Render right workspace view (slides preview and details)
  renderRightWorkspace() {
    const container = document.getElementById("programWorkspace");
    if (!container) return;

    if (this.selectedItemIndex < 0 || this.selectedItemIndex >= this.items.length) {
      if (this.items.length > 0) {
        this.selectedItemIndex = 0;
      } else {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400">
            <i class="fa-solid fa-list-check text-4xl mb-3 text-slate-300"></i>
            <h3 class="text-base font-bold text-slate-600">No Program Item Selected</h3>
            <p class="text-xs max-w-sm mt-1">Select an item from the left program panel, or click "+ Add Item" to create one.</p>
          </div>
        `;
        return;
      }
    }

    const item = this.items[this.selectedItemIndex];
    const isThisItemPresented = (this.selectedItemIndex === this.presentedItemIndex);

    const slides = this.generateSlidesForItem(item);

    let slidesHtml = "";
    const isScripture = (item.type === "scripture");
    const isDual = document.getElementById("navDualLanguageID") ? document.getElementById("navDualLanguageID").checked : false;
    let lastGroupHeader = null;

    slides.forEach((slide, sIdx) => {
      const isSlidePresented = isThisItemPresented && (sIdx === this.presentedSlideIndex);

      if (isScripture) {
        // Insert group header when transitioning to a new scripture reference group
        if (slide.groupHeader && slide.groupHeader !== lastGroupHeader) {
          lastGroupHeader = slide.groupHeader;
          slidesHtml += `
            <div class="program-scripture-group-header">
              <div class="group-title">
                <i class="fa-solid fa-book-bible"></i>
                <span>${slide.groupHeader}</span>
              </div>
              <span class="group-badge">Passage</span>
            </div>
          `;
        }

        // Render scripture card identically to verse tab card
        const cardClass = `program-scripture-card ${isSlidePresented ? "scripture-presented" : ""}`;
        const verseNum = slide.verseNum || (sIdx + 1);
        const col1Text = slide.rawText1 || slide.text1 || "";
        const col2Text = slide.rawText2 || slide.text2 || "";

        if (isDual && col2Text) {
          slidesHtml += `
            <div onclick="event.preventDefault(); programManager.presentSlide(${this.selectedItemIndex}, ${sIdx})" class="${cardClass}">
              <div class="program-verse-bubble">${verseNum}</div>
              <div class="program-verse-col1" style="padding-right: 20px;">
                ${col1Text}
              </div>
              <div class="program-verse-col2">
                ${col2Text}
              </div>
            </div>
          `;
        } else {
          slidesHtml += `
            <div onclick="event.preventDefault(); programManager.presentSlide(${this.selectedItemIndex}, ${sIdx})" class="${cardClass}">
              <div class="program-verse-bubble">${verseNum}</div>
              <div class="program-verse-single">
                ${col1Text}
              </div>
            </div>
          `;
        }
      } else {
        const isCustom = (item.type === "person" || item.type === "general") && (item.customSlide && item.customSlide.active);
        let slideClass = "program-slide-card bg-white border rounded-xl p-5 shadow-xs transition cursor-pointer relative hover:shadow-md ";
        if (isSlidePresented) {
          slideClass += "program-slide-presented ";
        } else {
          slideClass += isCustom ? "border-brand-300 hover:border-brand-500" : "border-slate-200 hover:border-brand-400";
        }

        slidesHtml += `
          <div onclick="event.preventDefault(); programManager.presentSlide(${this.selectedItemIndex}, ${sIdx})" 
               class="${slideClass}">
            <div class="absolute top-3 right-3 flex items-center gap-1">
              ${isCustom ? `
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200 flex items-center gap-1">
                  <i class="fa-solid fa-palette text-[9px]"></i> Custom Slide
                </span>
              ` : `
                <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200 flex items-center gap-1">
                  <i class="fa-solid fa-wand-magic-sparkles text-[9px]"></i> Theme Default
                </span>
              `}
            </div>
            <div class="text-center py-4 px-2">
              ${item.type === "person" ? `
                <span class="text-[11px] font-bold uppercase tracking-wider text-amber-600 block mb-1">
                  ${(isCustom && item.customSlide && item.customSlide.title) ? item.customSlide.title : (item.data.personType || item.title || "Panauhing Tagapagsalita")}
                </span>
              ` : ""}
              ${isCustom && item.customSlide && item.customSlide.image ? `
                <img src="${item.customSlide.image}" class="w-16 h-16 object-contain rounded-lg mx-auto mb-2.5 border border-slate-200 bg-slate-900 shadow-xs" alt="Slide Graphic" />
              ` : ""}
              ${(item.type === "person" && (item.data.personTitle || (isCustom && item.customSlide && item.customSlide.personTitle))) ? `
                <span class="text-xs font-semibold text-slate-500 block mb-0.5">
                  ${(isCustom && item.customSlide && item.customSlide.personTitle) ? item.customSlide.personTitle : item.data.personTitle}
                </span>
              ` : ""}
              ${slide.text1 ? `<p class="text-base font-bold text-slate-900 leading-relaxed">${slide.text1}</p>` : ""}
              ${slide.text2 ? `<p class="text-xs text-slate-500 font-medium mt-2 leading-relaxed">${slide.text2}</p>` : ""}
            </div>
          </div>
        `;
      }
    });

    container.innerHTML = `
      <div class="flex flex-col h-full bg-slate-50 w-full relative">
        <!-- Header detail bar (compact single-row, matches Schedule header height) -->
        <div class="shrink-0 bg-white border-b border-slate-200 p-4 shadow-sm z-10 flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-bold text-slate-900 tracking-tight leading-tight truncate">${item.title} <span class="ml-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${item.type === 'person' ? 'bg-amber-100 text-amber-800' : item.type === 'song' ? 'bg-purple-100 text-purple-800' : item.type === 'scripture' ? 'bg-blue-100 text-blue-800' : item.type === 'tema' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}">${item.type.toUpperCase()}</span></h2>
            <p class="text-[11px] text-slate-400 mt-0.5">${slides.length} slide${slides.length !== 1 ? 's' : ''} ready to project</p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            ${(item.type === "person" || item.type === "general") ? `
              <button onclick="programManager.openCustomSlideDesigner(${this.selectedItemIndex})" class="px-3 py-1.5 border ${(item.customSlide && item.customSlide.active) ? 'border-brand-500 bg-brand-50 text-brand-700 font-bold' : 'border-slate-200 hover:border-brand-300 bg-white text-slate-700'} rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5" title="Customize slide layout, colors, and background">
                <i class="fa-solid fa-palette text-brand-600"></i> Customize Slide ${(item.customSlide && item.customSlide.active) ? '<span class="w-2 h-2 rounded-full bg-brand-600 inline-block"></span>' : ''}
              </button>
            ` : ""}
            <button onclick="programManager.exportSingleItem(${this.selectedItemIndex})" class="px-3 py-1.5 border border-slate-200 hover:border-slate-300 bg-white text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5" title="Export this item to JSON">
              <i class="fa-solid fa-file-export text-slate-500"></i> Export
            </button>
            <button onclick="programManager.openItemModal(${this.selectedItemIndex})" class="px-3 py-1.5 border border-slate-200 hover:border-slate-300 bg-white text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5">
              <i class="fa-solid fa-pen-to-square text-brand-600"></i> Edit
            </button>
            <button onclick="programManager.presentItem(${this.selectedItemIndex})" class="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5">
              <i class="fa-solid fa-play text-xs"></i> Present Item
            </button>
          </div>
        </div>

        <!-- Slides List -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <div class="max-w-3xl mx-auto space-y-4 pb-12">
            ${slidesHtml}
          </div>
        </div>
      </div>
    `;
    if (typeof syncTabHeaderHeights === "function") {
      try { syncTabHeaderHeights(); } catch (e) {}
    }
  }

  // Generate slide text array { text1, text2 } for any item type
  generateSlidesForItem(item) {
    if (!item) return [];

    switch (item.type) {
      case "person": {
        let name = item.data.name || "";
        const centro = item.data.centro || "";
        const personTitle = item.data.personTitle || "";
        if (personTitle && typeof name === "string") {
          const ptLower = personTitle.toLowerCase();
          if (name.toLowerCase().startsWith(ptLower + " ")) {
            name = name.substring(personTitle.length).trim();
          }
        }
        return [
          {
            text1: name,
            text2: centro ? (centro.startsWith("(") ? centro : `(${centro})`) : "",
            personTitle: personTitle
          }
        ];
      }

      case "song": {
        let lyrics = item.data.lyrics || "";
        if (!lyrics && item.title && typeof songManagerObj !== "undefined" && songManagerObj) {
          try {
            let matched = null;
            if (typeof songManagerObj.getRawSongRows === "function") {
              const rows = songManagerObj.getRawSongRows();
              if (Array.isArray(rows)) {
                matched = rows.find(r => r && r.name && r.name.trim().toLowerCase() === String(item.title).trim().toLowerCase());
              }
            }
            if (matched && matched.lyrics) {
              lyrics = matched.lyrics;
              item.data.lyrics = lyrics;
            }
          } catch (e) {}
        }

        // Split slides by double newline or <slide>
        let rawParts = [];
        if (lyrics.includes("<slide>")) {
          rawParts = lyrics.split(/<slide>/gi).map(p => p.trim()).filter(p => p.length > 0);
        } else {
          rawParts = lyrics.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
        }

        if (rawParts.length === 0) {
          return [{ text1: item.title, text2: "" }];
        }

        return rawParts.map(p => {
          // Clean up existing tags and convert \n to <BR> so projection window renders line breaks
          let formattedText = p
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .trim()
            .split("\n")
            .map(line => line.trim())
            .join("<BR>");

          return {
            text1: formattedText,
            text2: ""
          };
        });
      }

      case "scripture": {
        const refs = item.data.references || [];
        const slides = [];
        refs.forEach((ref, rIdx) => {
          const bIdx = parseInt(ref.bookIndex);
          const ch = parseInt(ref.chapter);
          const fromV = parseInt(ref.fromVerse);
          const toV = parseInt(ref.toVerse || ref.fromVerse);
          const groupHeader = `${primaryBookName(ref)} ${ch}:${fromV}${toV > fromV ? "-" + toV : ""}`;

          for (let v = fromV; v <= toV; v++) {
            let vText1 = "";
            let vText2 = "";
            try {
              if (typeof getSingleVerse === "function") {
                vText1 = getSingleVerse(bIdx, ch - 1, v - 1, 1);
                const dual = document.getElementById("navDualLanguageID") ? document.getElementById("navDualLanguageID").checked : false;
                if (dual) {
                  vText2 = getSingleVerse(bIdx, ch - 1, v - 1, 2);
                }
              }
            } catch (e) {
              console.warn("[PROGRAM] Could not fetch verse text from XML", e);
            }

            slides.push({
              refIndex: rIdx,
              groupHeader: groupHeader,
              verseNum: v,
              rawText1: vText1 || "",
              rawText2: vText2 || "",
              text1: vText1 ? `${v} ${vText1}` : `${primaryBookName(ref)} ${ch}:${v}`,
              text2: vText2 ? `${v} ${vText2}` : "",
              reference: `${primaryBookName(ref)} ${ch}:${v}`
            });
          }
        });

        if (slides.length === 0) {
          return [{ text1: item.title, text2: "" }];
        }
        return slides;
      }

      case "tema": {
        const temaText = item.data.tema || "";
        let batayanStr = "";
        if (item.data.batayan) {
          if (typeof item.data.batayan === "string") {
            batayanStr = item.data.batayan;
          } else if (Array.isArray(item.data.batayan) && item.data.batayan.length > 0) {
            batayanStr = item.data.batayan.map(r => {
              if (typeof r === "string") return r;
              if (r && (r.bookName || typeof r.bookIndex === "number")) {
                return `${primaryBookName(r)} ${r.chapter}:${r.fromVerse}${r.toVerse && r.toVerse > r.fromVerse ? "-" + r.toVerse : ""}`;
              }
              return "";
            }).filter(Boolean).join("; ");
          }
        }
        return [
          {
            text1: temaText ? `"${temaText}"` : "(Tema)",
            text2: batayanStr ? `Batayan: ${batayanStr}` : ""
          }
        ];
      }

      case "general":
      default: {
        const content = item.data.content || "";
        const parts = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        if (parts.length === 0) {
          return [{ text1: item.title, text2: "" }];
        }
        return parts.map(p => {
          let formattedText = p
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .trim()
            .split("\n")
            .map(line => line.trim())
            .join("<BR>");

          return {
            text1: formattedText,
            text2: ""
          };
        });
      }
    }
  }

  // Select item in left list and view in right panel
  selectItem(idx) {
    this.selectedItemIndex = idx;
    this.renderLeftNav();
    this.renderRightWorkspace();
  }

  // Present an entire item (starts at slide 0)
  presentItem(idx) {
    this.selectedItemIndex = idx;
    this.presentedItemIndex = idx;
    this.presentedSlideIndex = 0;
    this.executePresentation();
  }

  // Present a specific slide of an item
  presentSlide(itemIdx, slideIdx) {
    this.selectedItemIndex = itemIdx;
    this.presentedItemIndex = itemIdx;
    this.presentedSlideIndex = slideIdx;
    this.executePresentation();
  }

  // Resolve active theme bundle for a program item type ('person' or 'general')
  getThemeDefaultsForType(type) {
    const canonical = (type === "person" || type === "program_person") ? "program_person" : "program_general";
    let style = null;
    if (typeof window !== "undefined" && window.themeManager) {
      if (typeof window.themeManager.resolveProjectionStyle === "function") {
        style = window.themeManager.resolveProjectionStyle(canonical);
      } else if (typeof window.themeManager.getStyleForContext === "function") {
        style = window.themeManager.getStyleForContext(canonical);
      }
    }
    if (!style) {
      if (canonical === "program_person") {
        style = {
          backgroundType: "gradient",
          bgGradient: "linear-gradient(135deg, #1c1917 0%, #292524 50%, #0c0a09 100%)",
          bgImage: "UECFI.png",
          bgColor: "#1c1917",
          overlayOpacity: 25,
          primaryFont: "Arial",
          primaryColor: "#FFFFFF",
          primaryScale: 1.6,
          primaryWeight: "bold",
          secondaryFont: "Arial",
          secondaryColor: "#FDE68A",
          secondaryScale: 1.05,
          secondaryWeight: "normal",
          secondaryItalic: false,
          headerColor: "#F59E0B",
          headerFont: "Arial",
          headerSize: 16,
          headerWeight: "bold",
          headerTransform: "uppercase",
          headerAlign: "center",
          textAlign: "center"
        };
      } else {
        style = {
          backgroundType: "gradient",
          bgGradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          bgImage: "UECFI.png",
          bgColor: "#0f172a",
          overlayOpacity: 20,
          primaryFont: "Arial",
          primaryColor: "#FFFFFF",
          primaryScale: 1.5,
          primaryWeight: "bold",
          secondaryFont: "Arial",
          secondaryColor: "#CBD5E1",
          secondaryScale: 1.1,
          secondaryWeight: "normal",
          secondaryItalic: false,
          headerColor: "#94A3B8",
          headerFont: "Arial",
          headerSize: 14,
          headerWeight: "bold",
          headerTransform: "uppercase",
          headerAlign: "center",
          textAlign: "center"
        };
      }
    }
    return style;
  }

  // Perform presentation to screen and update live monitor
  executePresentation() {
    if (this.presentedItemIndex < 0 || this.presentedItemIndex >= this.items.length) return;
    const item = this.items[this.presentedItemIndex];
    const slides = this.generateSlidesForItem(item);
    if (slides.length === 0) return;

    if (this.presentedSlideIndex < 0 || this.presentedSlideIndex >= slides.length) {
      this.presentedSlideIndex = 0;
    }

    const curSlide = slides[this.presentedSlideIndex];

    // Content only -- design (fonts, colors, scales, background, margins)
    // comes exclusively from ThemeManager; item.type maps to its bundle
    // inside applyThemeToProjection (song->songs, scripture->verses, ...).
    window.p_text1_arr = slides.map(s => s.text1 || "");
    window.p_text2_arr = slides.map(s => s.text2 || "");
    const isPerson = item.type === "person";
    window.p_person_title = isPerson ? ((item.data && item.data.personTitle) || curSlide.personTitle || "") : "";
    window.p_person_title_arr = slides.map(s => (isPerson ? (s.personTitle || (item.data && item.data.personTitle) || "") : ""));
    window.p_current_index = this.presentedSlideIndex;
    window.p_last_index = slides.length - 1;
    // Verse slide titles must not leak into program items
    window.p_title_arr = [];
    // A program present supersedes any schedule highlight
    window.presentedScheduleId = null;
    if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
    if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();

    if (item.type === "scripture") {
      // In Verses tab, title shows the specific reference (e.g., Genesis 1:1 or Genesis 1)
      window.p_title = curSlide.reference || item.title || "";
    } else {
      // Song, Tema, Person, General types: show item title in live projection
      window.p_title = item.title || "";
    }
    // Program items project no footnote
    window.p_footnote = "";

    // Apply specific theme styling for this item type if ThemeManager exists
    if (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.applyThemeToProjection === "function") {
      window.themeManager.applyThemeToProjection(item.type);
    }
    if (typeof setLiveProjectionType === "function") setLiveProjectionType(item.type);
    // A program item now owns live projection (any sub-type): remote and
    // monitor transport must step program slides, not stale verse/song state.
    if (typeof window !== "undefined") window.liveProgramActive = true;

    // Song backing track & synchronized lyrics
    if (typeof window !== "undefined" && window.songAudioEngine) {
      if (item.type === "song") {
        const audioFile = (item.data && item.data.audio) || "";
        const lyrics = (item.data && item.data.lyrics) || "";
        if (!window.songAudioEngine.currentSong || window.songAudioEngine.currentSong.name !== item.title) {
          window.songAudioEngine.startSong({
            name: item.title,
            audio: audioFile,
            lyrics: lyrics,
            slides: slides.map(s => s.text1)
          }, this.presentedSlideIndex);
        } else {
          window.songAudioEngine.onSlideChanged(this.presentedSlideIndex);
        }
      } else {
        window.songAudioEngine.stop();
      }
    }

    // Custom slide layer configuration for Person & General types
    if ((item.type === "person" || item.type === "general") && item.customSlide && item.customSlide.active) {
      const themeDefaults = this.getThemeDefaultsForType(item.type);
      const isPerson = item.type === "person";
      const customProps = item.customSlide;

      const defaultCentro = (item.data && item.data.centro) ? (item.data.centro.startsWith("(") ? item.data.centro : "(" + item.data.centro + ")") : "";
      const baseTitle = isPerson
        ? ((item.data && item.data.personType) || item.title || "Panauhing Tagapagsalita")
        : (item.title || "");
      const basePersonTitle = isPerson ? ((item.data && item.data.personTitle) || curSlide.personTitle || "") : "";
      const baseText1 = curSlide.text1 || (item.data && item.data.name) || "";
      const baseText2 = curSlide.text2 || defaultCentro;

      const cs = {
        active: true,
        type: item.type,
        // Content
        title: (typeof customProps.title === "string" && customProps.title.trim() !== "") ? customProps.title : baseTitle,
        personTitle: (typeof customProps.personTitle === "string" && customProps.personTitle.trim() !== "") ? customProps.personTitle : basePersonTitle,
        text1: (typeof customProps.text1 === "string" && customProps.text1.trim() !== "") ? customProps.text1 : baseText1,
        text2: (typeof customProps.text2 === "string" && customProps.text2.trim() !== "") ? customProps.text2 : baseText2,
        // Graphic
        image: customProps.image || "",
        imgSize: (isFinite(Number(customProps.imgSize)) && Number(customProps.imgSize) > 0) ? Number(customProps.imgSize) : 35,
        // Header / Title styles (inherit from Settings Theme if not customized)
        titleColor: customProps.titleColor || themeDefaults.headerColor || (isPerson ? "#F59E0B" : "#94A3B8"),
        titleBold: customProps.titleBold !== undefined ? !!customProps.titleBold : (themeDefaults.headerWeight !== "normal"),
        titleItalic: customProps.titleItalic !== undefined ? !!customProps.titleItalic : false,
        titleCaps: customProps.titleCaps !== undefined ? !!customProps.titleCaps : (themeDefaults.headerTransform === "uppercase"),
        titleFont: customProps.titleFont || themeDefaults.headerFont || "Arial",
        titleSize: (isFinite(Number(customProps.titleSize)) && Number(customProps.titleSize) > 0) ? Number(customProps.titleSize) : 8,
        titleBorderColor: customProps.titleBorderColor || "#000000",
        titleBorderThickness: isFinite(Number(customProps.titleBorderThickness)) ? Number(customProps.titleBorderThickness) : 0,
        titlePaddingV: isFinite(Number(customProps.titlePaddingV)) ? Number(customProps.titlePaddingV) : 0,
        titlePaddingH: isFinite(Number(customProps.titlePaddingH)) ? Number(customProps.titlePaddingH) : 0,
        // Person Title styles (for Person items)
        personTitleColor: customProps.personTitleColor || themeDefaults.secondaryColor || "#FDE68A",
        personTitleBold: customProps.personTitleBold !== undefined ? !!customProps.personTitleBold : true,
        personTitleItalic: customProps.personTitleItalic !== undefined ? !!customProps.personTitleItalic : false,
        personTitleCaps: customProps.personTitleCaps !== undefined ? !!customProps.personTitleCaps : false,
        personTitleFont: customProps.personTitleFont || themeDefaults.primaryFont || "Arial",
        personTitleSize: (isFinite(Number(customProps.personTitleSize)) && Number(customProps.personTitleSize) > 0) ? Number(customProps.personTitleSize) : 6,
        personTitleBorderColor: customProps.personTitleBorderColor || "#000000",
        personTitleBorderThickness: isFinite(Number(customProps.personTitleBorderThickness)) ? Number(customProps.personTitleBorderThickness) : 0,
        personTitlePaddingV: isFinite(Number(customProps.personTitlePaddingV)) ? Number(customProps.personTitlePaddingV) : 0,
        personTitlePaddingH: isFinite(Number(customProps.personTitlePaddingH)) ? Number(customProps.personTitlePaddingH) : 0,
        // Primary text (Name / Content)
        text1Color: customProps.text1Color || themeDefaults.primaryColor || "#FFFFFF",
        text1Bold: customProps.text1Bold !== undefined ? !!customProps.text1Bold : (themeDefaults.primaryWeight !== "normal"),
        text1Italic: customProps.text1Italic !== undefined ? !!customProps.text1Italic : false,
        text1Caps: customProps.text1Caps !== undefined ? !!customProps.text1Caps : false,
        text1Font: customProps.text1Font || themeDefaults.primaryFont || "Arial",
        text1Size: (isFinite(Number(customProps.text1Size)) && Number(customProps.text1Size) > 0) ? Number(customProps.text1Size) : (isPerson ? 12 : 7),
        text1BorderColor: customProps.text1BorderColor || "#000000",
        text1BorderThickness: isFinite(Number(customProps.text1BorderThickness)) ? Number(customProps.text1BorderThickness) : 0,
        text1PaddingV: isFinite(Number(customProps.text1PaddingV)) ? Number(customProps.text1PaddingV) : 0,
        text1PaddingH: isFinite(Number(customProps.text1PaddingH)) ? Number(customProps.text1PaddingH) : 0,
        // Secondary text (Centro / Subtitle)
        text2Color: customProps.text2Color || themeDefaults.secondaryColor || (isPerson ? "#FDE68A" : "#CBD5E1"),
        text2Bold: customProps.text2Bold !== undefined ? !!customProps.text2Bold : (themeDefaults.secondaryWeight === "bold"),
        text2Italic: customProps.text2Italic !== undefined ? !!customProps.text2Italic : (!!themeDefaults.secondaryItalic),
        text2Caps: customProps.text2Caps !== undefined ? !!customProps.text2Caps : false,
        text2Font: customProps.text2Font || themeDefaults.secondaryFont || "Arial",
        text2Size: (isFinite(Number(customProps.text2Size)) && Number(customProps.text2Size) > 0) ? Number(customProps.text2Size) : 5,
        text2BorderColor: customProps.text2BorderColor || "#000000",
        text2BorderThickness: isFinite(Number(customProps.text2BorderThickness)) ? Number(customProps.text2BorderThickness) : 0,
        text2PaddingV: isFinite(Number(customProps.text2PaddingV)) ? Number(customProps.text2PaddingV) : 0,
        text2PaddingH: isFinite(Number(customProps.text2PaddingH)) ? Number(customProps.text2PaddingH) : 0,
        // Background & Inset Card styles
        bg: customProps.bg || themeDefaults.bgColor || (isPerson ? "#1c1917" : "#0f172a"),
        bgGradient: customProps.bgGradient || ((themeDefaults.backgroundType === "gradient" && themeDefaults.bgGradient) ? themeDefaults.bgGradient : ""),
        bgImage: (customProps.bgImage !== undefined && customProps.bgImage !== null && customProps.bgImage !== "")
          ? customProps.bgImage
          : ((themeDefaults.backgroundType === "image" && themeDefaults.bgImage) ? themeDefaults.bgImage : ""),
        bgDim: (customProps.bgDim !== undefined && customProps.bgDim !== null && customProps.bgDim !== "")
          ? Number(customProps.bgDim)
          : ((typeof themeDefaults.overlayOpacity !== "undefined" && themeDefaults.overlayOpacity !== null) ? Number(themeDefaults.overlayOpacity) : 25),
        borderThickness: isFinite(Number(customProps.borderThickness)) ? Number(customProps.borderThickness) : 0,
        borderColor: customProps.borderColor || "#ffffff",
        paddingV: isFinite(Number(customProps.paddingV)) ? Number(customProps.paddingV) : 5,
        paddingH: isFinite(Number(customProps.paddingH)) ? Number(customProps.paddingH) : 5,
        textAlign: customProps.textAlign || themeDefaults.textAlign || "center"
      };
      window.p_custom_slide = cs;
    } else {
      window.p_custom_slide = null;
    }

    // Call projection engine
    if (typeof presentation === "function") {
      presentation();
    }

    // Update Live Monitor UI
    this.updateLiveMonitorDisplay(curSlide, item, this.presentedSlideIndex, slides.length);

    // Refresh UI highlights
    this.renderLeftNav();
    this.renderRightWorkspace();
    // The workspace re-render rebuilds the scrollable slides list, which
    // resets its scroll to top. Center the projected (LIVE) slide so the
    // operator can see the slides above and below it without scrolling.
    try {
      const ws = document.getElementById("programWorkspace");
      const live = ws ? ws.querySelector(".program-slide-presented, .scripture-presented") : null;
      if (live && typeof live.scrollIntoView === "function") {
        live.scrollIntoView({ block: "center" });
      }
    } catch (e) {}
  }

  // Slide navigation
  // Transport rules (shared with the speaker remote): tema/person items
  // never step; song/scripture/general items step within the item only
  // (no looping, no crossing into the next item).
  programNavAllowed(dir) {
    try {
      const idx = this.presentedItemIndex;
      if (idx < 0 || !Array.isArray(this.items) || idx >= this.items.length) return false;
      const item = this.items[idx];
      const t = item ? item.type : "";
      if (t === "tema" || t === "person") return false;
      let total = 1;
      try {
        const slides = this.generateSlidesForItem(item);
        if (Array.isArray(slides)) total = slides.length;
      } catch (e) {}
      const ni = (this.presentedSlideIndex || 0) + dir;
      return ni >= 0 && ni < total;
    } catch (e) {
      return false;
    }
  }
  nextSlide() {
    if (!this.programNavAllowed(1)) return;
    if (this.presentedItemIndex < 0) return;
    const item = this.items[this.presentedItemIndex];
    const slides = this.generateSlidesForItem(item);
    if (this.presentedSlideIndex < slides.length - 1) {
      this.presentedSlideIndex++;
      this.executePresentation();
    } else if (this.presentedItemIndex < this.items.length - 1) {
      // Advance to next program item!
      this.presentedItemIndex++;
      this.selectedItemIndex = this.presentedItemIndex;
      this.presentedSlideIndex = 0;
      this.executePresentation();
    }
  }

  previousSlide() {
    if (!this.programNavAllowed(-1)) return;
    if (this.presentedItemIndex < 0) return;
    if (this.presentedSlideIndex > 0) {
      this.presentedSlideIndex--;
      this.executePresentation();
    } else if (this.presentedItemIndex > 0) {
      // Step back to previous program item's last slide
      this.presentedItemIndex--;
      this.selectedItemIndex = this.presentedItemIndex;
      const prevItem = this.items[this.presentedItemIndex];
      const prevSlides = this.generateSlidesForItem(prevItem);
      this.presentedSlideIndex = Math.max(0, prevSlides.length - 1);
      this.executePresentation();
    }
  }

  clearPresentationHighlight() {
    this.presentedItemIndex = -1;
    this.presentedSlideIndex = -1;
    if (typeof window !== "undefined" && window.songAudioEngine) {
      window.songAudioEngine.stop();
    }
    this.renderLeftNav();
    this.renderRightWorkspace();
  }

  updateLiveMonitorDisplay(slide, item, slideIdx, totalSlides) {
    if (typeof setLiveMonitorContent === "function") {
      setLiveMonitorContent({
        primary: slide.text1 || "",
        secondary: slide.text2 || "",
        personTitle: slide.personTitle || (item.data && item.data.personTitle) || "",
        reference: item.title || "",
        indicator: `Program Item ${this.presentedItemIndex + 1} (${slideIdx + 1} of ${totalSlides})`,
        customSlide: window.p_custom_slide
      });
    }
  }

  // Reorder items
  moveItem(idx, direction) {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= this.items.length) return;
    const temp = this.items[idx];
    this.items[idx] = this.items[targetIdx];
    this.items[targetIdx] = temp;

    if (this.selectedItemIndex === idx) {
      this.selectedItemIndex = targetIdx;
    } else if (this.selectedItemIndex === targetIdx) {
      this.selectedItemIndex = idx;
    }

    if (this.presentedItemIndex === idx) {
      this.presentedItemIndex = targetIdx;
    } else if (this.presentedItemIndex === targetIdx) {
      this.presentedItemIndex = idx;
    }

    this.saveProgramData();
    this.renderLeftNav();
    this.renderRightWorkspace();
  }

  deleteItem(idx) {
    if (confirm(`Are you sure you want to delete "${this.items[idx].title}"?`)) {
      this.items.splice(idx, 1);
      if (this.selectedItemIndex === idx) {
        this.selectedItemIndex = Math.min(idx, this.items.length - 1);
      } else if (this.selectedItemIndex > idx) {
        this.selectedItemIndex--;
      }

      if (this.presentedItemIndex === idx) {
        this.clearPresentationHighlight();
      } else if (this.presentedItemIndex > idx) {
        this.presentedItemIndex--;
      }

      this.saveProgramData();
      this.renderLeftNav();
      this.renderRightWorkspace();
    }
  }

  clearAllItems() {
    if (confirm("Are you sure you want to clear all items in the program?")) {
      this.items = [];
      this.selectedItemIndex = -1;
      this.clearPresentationHighlight();
      this.saveProgramData();
      this.renderLeftNav();
      this.renderRightWorkspace();
    }
  }

  // Open Add/Edit Item Modal
  openItemModal(index) {
    this.editingIndex = index;
    const isEdit = index >= 0;
    const item = isEdit ? this.items[index] : {
      type: "person",
      title: "",
      data: {}
    };

    let modal = document.getElementById("programItemModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "programItemModal";
      document.body.appendChild(modal);
    }

    modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4";
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 class="font-bold text-slate-900 text-base">${isEdit ? "Edit Program Item" : "Add Program Item"}</h3>
            <p class="text-xs text-slate-500">Configure slide details and projection format</p>
          </div>
          <button onclick="programManager.closeItemModal()" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          <!-- Item Type Selection -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Item Type</label>
            <div class="grid grid-cols-5 gap-2">
              <button type="button" onclick="programManager.switchModalType('person')" id="btnType_person" class="modal-type-btn p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1">
                <i class="fa-solid fa-user-tie text-base"></i>
                <span class="text-[11px] font-bold">Person</span>
              </button>
              <button type="button" onclick="programManager.switchModalType('song')" id="btnType_song" class="modal-type-btn p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1">
                <i class="fa-solid fa-music text-base"></i>
                <span class="text-[11px] font-bold">Song</span>
              </button>
              <button type="button" onclick="programManager.switchModalType('scripture')" id="btnType_scripture" class="modal-type-btn p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1">
                <i class="fa-solid fa-book-bible text-base"></i>
                <span class="text-[11px] font-bold">Scripture</span>
              </button>
              <button type="button" onclick="programManager.switchModalType('tema')" id="btnType_tema" class="modal-type-btn p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1">
                <i class="fa-solid fa-cross text-base"></i>
                <span class="text-[11px] font-bold">Tema</span>
              </button>
              <button type="button" onclick="programManager.switchModalType('general')" id="btnType_general" class="modal-type-btn p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1">
                <i class="fa-regular fa-file-lines text-base"></i>
                <span class="text-[11px] font-bold">General</span>
              </button>
            </div>
          </div>

          <!-- Dynamic Form Fields Container -->
          <div id="modalDynamicFields" class="space-y-4 pt-2"></div>
        </div>

        <!-- Modal Footer -->
        <div class="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
          <button type="button" onclick="programManager.closeItemModal()" class="px-4 py-2 border border-slate-200 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition">
            Cancel
          </button>
          <button type="button" onclick="programManager.saveModalItem()" class="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5">
            <i class="fa-solid fa-check"></i> ${isEdit ? "Update Item" : "Add to Program"}
          </button>
        </div>
      </div>
    `;

    this.currentModalType = item.type || "person";
    this.currentModalData = JSON.parse(JSON.stringify(item.data || {}));
    this.currentModalTitle = item.title || "";
    this.switchModalType(this.currentModalType);
  }

  closeItemModal() {
    const modal = document.getElementById("programItemModal");
    if (modal) modal.remove();
  }

  // Switch type and render corresponding fields
  switchModalType(type) {
    this.currentModalType = type;

    // Update type button styling
    const types = ["person", "song", "scripture", "tema", "general"];
    types.forEach(t => {
      const btn = document.getElementById(`btnType_${t}`);
      if (btn) {
        if (t === type) {
          btn.className = "modal-type-btn p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 bg-brand-600 text-white border-brand-600 shadow-sm";
        } else {
          btn.className = "modal-type-btn p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 bg-white hover:bg-slate-50 border-slate-200 text-slate-700";
        }
      }
    });

    const fieldsContainer = document.getElementById("modalDynamicFields");
    if (!fieldsContainer) return;

    if (type === "person") {
      const quickFills = ["Panauhing Tagapagsalita", "Medium", "Choir"];
      fieldsContainer.innerHTML = `
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Person Type (Role)</label>
          <div class="flex items-center gap-1.5 mb-2">
            ${quickFills.map(qf => `
              <button type="button" onclick="document.getElementById('inputPersonType').value='${qf}';" class="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 rounded-md border border-slate-200 transition">
                ${qf}
              </button>
            `).join("")}
          </div>
          <input id="inputPersonType" type="text" value="${this.currentModalData.personType || "Panauhing Tagapagsalita"}" 
                 placeholder="e.g. Panauhing Tagapagsalita" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Person Title <span class="text-[10px] font-normal lowercase text-slate-400">(optional)</span></label>
            <div class="flex items-center gap-1">
              ${["Pastor", "Brother", "Sister", "Bishop", "Evangelist", "Elder"].map(t => `
                <button type="button" onclick="document.getElementById('inputPersonTitle').value='${t}';" class="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-600 rounded border border-slate-200 transition">
                  ${t}
                </button>
              `).join("")}
              <button type="button" onclick="document.getElementById('inputPersonTitle').value='';" class="px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-red-500 rounded transition" title="Clear title">
                &times;
              </button>
            </div>
          </div>
          <input id="inputPersonTitle" type="text" value="${this.currentModalData.personTitle || ""}" 
                 placeholder="e.g. Pastor, Sister, Brother" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Name</label>
          <input id="inputPersonName" type="text" value="${this.currentModalData.name || ""}" 
                 placeholder="e.g. Juan dela Cruz" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Centro</label>
          <input id="inputPersonCentro" type="text" value="${this.currentModalData.centro || ""}" 
                 placeholder="e.g. Centro General Mariano Alvarez" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div class="p-3.5 bg-brand-50/60 border border-brand-200 rounded-xl flex items-center justify-between gap-3 mt-3">
          <div>
            <div class="text-xs font-bold text-brand-900 flex items-center gap-2">
              <i class="fa-solid fa-palette text-brand-600"></i>
              <span>Slide Customization</span>
              <span id="modalCustomSlideStatus">
                ${(this.currentModalData && this.currentModalData.customSlide && this.currentModalData.customSlide.active) 
                  ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-600 text-white">Custom Active</span>' 
                  : '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600">Standard Theme</span>'}
              </span>
            </div>
            <div class="text-[11px] text-brand-700/80 mt-0.5">Customize speaker photo, typography, card borders, colors, and background.</div>
          </div>
          <button type="button" onclick="programManager.openCustomSlideDesignerFromModal()" class="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer">
            <i class="fa-solid fa-pen-ruler"></i> Customize
          </button>
        </div>
      `;
    } else if (type === "song") {
      const songList = this.getAllSongs();
      let songOptions = '<option value="">-- Choose from Song Database (Optional) --</option>';
      songList.forEach((s, sIdx) => {
        songOptions += `<option value="${sIdx}">${s.name}</option>`;
      });

      fieldsContainer.innerHTML = `
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Song Picker</label>
          <select id="selectSongPicker" onchange="programManager.onSongPicked(this.value)" 
                  class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500">
            ${songOptions}
          </select>
          <p class="text-[10px] text-slate-400 mt-1">Selecting a song will automatically populate Title and Lyrics below (${songList.length} songs available).</p>
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Title</label>
          <input id="inputItemTitle" type="text" value="${this.currentModalTitle || ""}" placeholder="Song Title" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Lyrics (Separate slides with empty lines)</label>
          <textarea id="inputSongLyrics" rows="8" placeholder="Enter lyrics here. Leave a blank line between slides..." 
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-brand-500 custom-scrollbar">${this.formatLyricsForTextarea(this.currentModalData.lyrics || "")}</textarea>
          <p class="text-[10px] text-slate-400 mt-1">Tip: Add timestamps like <code class="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono">[00:15.50]</code> to auto-advance slides and highlight lines.</p>
        </div>

        <div class="p-3 bg-purple-50/50 border border-purple-200 rounded-xl space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5"><i class="fa-solid fa-music text-purple-600"></i> Backing Track Audio (Optional)</span>
            <input type="file" id="inputSongAudioFile" accept=".mp3, .wav, .m4a, .ogg, .aac, .flac, .mp4, .wma" class="hidden" onchange="programManager.handleSongAudioUpload(event)">
            <input type="hidden" id="inputSongAudio" value="${this.currentModalData.audio || ""}">
            <button type="button" onclick="event.stopPropagation(); document.getElementById('inputSongAudioFile').click()" class="px-2.5 py-1 text-xs font-semibold bg-white border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-lg transition cursor-pointer">
              <i class="fa-solid fa-cloud-arrow-up"></i> ${this.currentModalData.audio ? "Change Audio" : "Upload Audio"}
            </button>
          </div>
          <div id="progSongAudioDisplay" class="text-xs ${this.currentModalData.audio ? 'text-purple-900 font-semibold' : 'text-slate-400'}">
            ${this.currentModalData.audio ? ('Attached: ' + this.currentModalData.audio) : 'No audio attached.'}
          </div>
        </div>
      `;
    } else if (type === "scripture") {
      fieldsContainer.innerHTML = `
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Title</label>
          <input id="inputItemTitle" type="text" value="${this.currentModalTitle || ""}" placeholder="e.g. Pagbasa ng Banal na Kasulatan" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Scripture References</label>
            <button type="button" onclick="programManager.addScriptureReferenceRow('scriptureRefContainer')" class="px-2.5 py-1 text-[11px] font-bold bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-md border border-brand-200 transition flex items-center gap-1">
              <i class="fa-solid fa-plus text-[10px]"></i> Add Reference
            </button>
          </div>
          <div id="scriptureRefContainer" class="space-y-2"></div>
        </div>
      `;

      const refs = (this.currentModalData.references && this.currentModalData.references.length > 0)
        ? this.currentModalData.references
        : [{ bookIndex: 0, bookName: primaryBookName({ bookIndex: 0 }) || "Genesis", chapter: 1, fromVerse: 1, toVerse: 1 }];

      refs.forEach(ref => this.addScriptureReferenceRow("scriptureRefContainer", ref));
    } else if (type === "tema") {
      // Format initial batayan text if it was previously an array of objects or a string
      let initialBatayanText = "";
      if (this.currentModalData.batayan) {
        if (typeof this.currentModalData.batayan === "string") {
          initialBatayanText = this.currentModalData.batayan;
        } else if (Array.isArray(this.currentModalData.batayan)) {
          initialBatayanText = this.currentModalData.batayan
            .map(b => {
              if (typeof b === "string") return b;
              if (b && (b.bookName || typeof b.bookIndex === "number")) {
                return `${primaryBookName(b)} ${b.chapter}:${b.fromVerse}${b.toVerse && b.toVerse > b.fromVerse ? "-" + b.toVerse : ""}`;
              }
              return "";
            })
            .filter(Boolean)
            .join("; ");
        }
      }

      fieldsContainer.innerHTML = `
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Title</label>
          <input id="inputItemTitle" type="text" value="${this.currentModalTitle || "(Tema)"}" placeholder="(Tema)" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Tema (Theme Statement)</label>
          <textarea id="inputTemaContent" rows="3" placeholder="Ipasok ang tema dito..." 
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500">${this.currentModalData.tema || ""}</textarea>
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Batayan (Scripture Reference)</label>
          <input id="inputTemaBatayan" type="text" value="${initialBatayanText}" placeholder="Hal. Mga Awit 23:1-6; Juan 3:16" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500">
          <p class="text-[11px] text-slate-400 mt-1">Ipasok ang talata o reperensya bilang payak na teksto (hal. Santiago 1:5, Awit 23:1-6).</p>
        </div>
      `;
    } else if (type === "general") {
      fieldsContainer.innerHTML = `
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Title</label>
          <input id="inputItemTitle" type="text" value="${this.currentModalTitle || ""}" placeholder="Item Title (e.g. Announcements)" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Content (Separate slides with empty lines)</label>
          <textarea id="inputGeneralContent" rows="6" placeholder="Enter general text or announcement content..." 
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500 custom-scrollbar">${this.currentModalData.content || ""}</textarea>
        </div>

        <div class="p-3.5 bg-brand-50/60 border border-brand-200 rounded-xl flex items-center justify-between gap-3 mt-3">
          <div>
            <div class="text-xs font-bold text-brand-900 flex items-center gap-2">
              <i class="fa-solid fa-palette text-brand-600"></i>
              <span>Slide Customization</span>
              <span id="modalCustomSlideStatus">
                ${(this.currentModalData && this.currentModalData.customSlide && this.currentModalData.customSlide.active) 
                  ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-600 text-white">Custom Active</span>' 
                  : '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600">Standard Theme</span>'}
              </span>
            </div>
            <div class="text-[11px] text-brand-700/80 mt-0.5">Customize slide graphics, typography, card borders, colors, and background.</div>
          </div>
          <button type="button" onclick="programManager.openCustomSlideDesignerFromModal()" class="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer">
            <i class="fa-solid fa-pen-ruler"></i> Customize
          </button>
        </div>
      `;
    }
  }

  formatLyricsForTextarea(lyrics) {
    if (!lyrics) return "";
    if (Array.isArray(lyrics)) return lyrics.join("\n\n");
    if (typeof lyrics === "string" && lyrics.includes("<slide>")) {
      return lyrics
        .replace(/<slide>\s*<slide>/gi, "<slide>")
        .split(/<slide>/gi)
        .map(part => part.replace(/<br\s*\/?>/gi, "\n").trim())
        .filter(part => part.length > 0)
        .join("\n\n");
    }
    return String(lyrics);
  }

  getAllSongs() {
    // 1. Prefer songManagerObj.getAllSongs() or songManagerObj.getRawSongRows()
    if (typeof songManagerObj !== "undefined" && songManagerObj) {
      if (typeof songManagerObj.getAllSongs === "function") {
        const list = songManagerObj.getAllSongs();
        if (Array.isArray(list) && list.length > 0) return list;
      }
      if (typeof songManagerObj.getRawSongRows === "function") {
        const list = songManagerObj.getRawSongRows();
        if (Array.isArray(list) && list.length > 0) return list;
      }
      if (songManagerObj.M && Array.isArray(songManagerObj.M.data) && songManagerObj.M.data.length > 0) {
        return songManagerObj.M.data;
      }
    }

    // 2. Try window._allSongsCache if previously loaded
    if (window._allSongsCache && Array.isArray(window._allSongsCache) && window._allSongsCache.length > 0) {
      return window._allSongsCache;
    }

    // 3. Query through the unified AppDB abstraction layer (supports both
    // Electron SQLite and web localStorage/JSON fallback without raw require).
    try {
      if (typeof AppDB !== "undefined" && typeof AppDB.openDatabase === "function") {
        const db = AppDB.openDatabase("song", "default.db");
        if (db && typeof db.executeSql === "function") {
          const rs = db.executeSql("SELECT * FROM sm ORDER BY name COLLATE NOCASE ASC");
          const rows = [];
          while (rs && rs.isValidRow()) {
            const rawLyrics = rs.fieldByName("lyrics") || rs.fieldByName("slides") || "";
            rows.push({
              id: rs.fieldByName("id"),
              name: rs.fieldByName("name"),
              cat: rs.fieldByName("cat"),
              font: rs.fieldByName("font"),
              font2: rs.fieldByName("font2"),
              timestamp: rs.fieldByName("timestamp"),
              yvideo: rs.fieldByName("yvideo"),
              bkgnd: rs.fieldByName("bkgnd"),
              key: rs.fieldByName("key"),
              copyright: rs.fieldByName("copyright"),
              notes: rs.fieldByName("notes"),
              lyrics: rawLyrics,
              slides: rs.fieldByName("slides"),
              slides2: rs.fieldByName("slides2"),
              name2: rs.fieldByName("name2"),
              tags: rs.fieldByName("tags"),
              subcat: rs.fieldByName("subcat")
            });
            rs.next();
          }
          if (rs && typeof rs.close === "function") rs.close();
          if (db && typeof db.close === "function") db.close();
          if (rows.length > 0) {
            window._allSongsCache = rows;
            return rows;
          }
        }
      }
    } catch (e) {
      console.warn("[PROGRAM] Error reading songs via AppDB:", e);
    }

    // 4. Try modern songDataStore or legacy fallback if available
    if (window.songDataStore && Array.isArray(window.songDataStore.songTitle) && window.songDataStore.songTitle.length > 0) {
      return window.songDataStore.songTitle.map(item => ({
        id: item.ID,
        name: item.Title
      }));
    }

    return [];
  }

  onSongPicked(songIdx) {
    if (songIdx === "" || songIdx === null || typeof songIdx === "undefined") return;
    const songList = this.getAllSongs();
    let song = songList[parseInt(songIdx)];
    if (!song) return;

    // Resolve full lyrics/slides if not present directly on the item
    if (!song.lyrics && (!song.slides || song.slides.length === 0) && typeof songManagerObj !== "undefined" && songManagerObj) {
      if (song.id != null && typeof songManagerObj.getSongObjWithID === "function") {
        const fullObj = songManagerObj.getSongObjWithID(song.id);
        if (fullObj) {
          song = Object.assign({}, song, fullObj);
          if (fullObj.slides && Array.isArray(fullObj.slides) && !song.lyrics) {
            song.lyrics = fullObj.slides.join("<slide>");
          }
        }
      }
      if (!song.lyrics && typeof songManagerObj.getRawSongRows === "function") {
        const raw = songManagerObj.getRawSongRows();
        if (Array.isArray(raw)) {
          const rawMatch = raw.find(r => r && (r.id === song.id || (r.name && r.name === song.name)));
          if (rawMatch && rawMatch.lyrics) {
            song = Object.assign({}, song, rawMatch);
          }
        }
      }
    }

    if (!this.currentModalData) this.currentModalData = {};
    if (song.font) this.currentModalData.font = song.font;
    if (song.copyright || song.copy) this.currentModalData.copyright = song.copyright || song.copy;

    const titleInput = document.getElementById("inputItemTitle");
    if (titleInput) titleInput.value = song.name || "";

    const lyricsInput = document.getElementById("inputSongLyrics");
    if (lyricsInput) {
      let lyricsText = "";
      if (song.lyrics) {
        if (Array.isArray(song.lyrics)) {
          lyricsText = song.lyrics.join("\n\n");
        } else if (typeof song.lyrics === "string") {
          let clean = song.lyrics
            .replace(/<slide>\s*<slide>/gi, "<slide>")
            .split(/<slide>/gi)
            .map(part => part.replace(/<br\s*\/?>/gi, "\n").trim())
            .filter(part => part.length > 0);
          lyricsText = clean.join("\n\n");
        }
      } else if (Array.isArray(song.slides) && song.slides.length > 0) {
        lyricsText = song.slides
          .map(part => String(part).replace(/<br\s*\/?>/gi, "\n").trim())
          .filter(part => part.length > 0)
          .join("\n\n");
      }
      lyricsInput.value = lyricsText;
    }

    if (song.audio) {
      if (!this.currentModalData) this.currentModalData = {};
      this.currentModalData.audio = song.audio;
      const audioInput = document.getElementById("inputSongAudio");
      if (audioInput) audioInput.value = song.audio;
      const display = document.getElementById("progSongAudioDisplay");
      if (display) {
        display.textContent = "Attached: " + song.audio;
        display.className = "text-xs text-purple-900 font-semibold";
      }
    }
  }

  handleSongAudioUpload(event) {
    try {
      const input = event ? event.target : null;
      if (!input || !input.files || input.files.length === 0) return;
      const file = input.files[0];
      const fileName = file.name || "";
      if (!fileName) return;

      if (typeof require !== "undefined") {
        try {
          const fs = require("fs");
          const path = require("path");
          const dir1 = path.join(process.cwd(), "audio");
          const dir2 = path.join(process.cwd(), "storage", "audio");
          if (!fs.existsSync(dir1)) fs.mkdirSync(dir1, { recursive: true });
          if (!fs.existsSync(dir2)) fs.mkdirSync(dir2, { recursive: true });

          if (file.path) {
            fs.copyFileSync(file.path, path.join(dir1, fileName));
            fs.copyFileSync(file.path, path.join(dir2, fileName));
          } else {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const buffer = Buffer.from(reader.result);
                fs.writeFileSync(path.join(dir1, fileName), buffer);
                fs.writeFileSync(path.join(dir2, fileName), buffer);
              } catch (e2) {}
            };
            reader.readAsArrayBuffer(file);
          }
        } catch (err) {
          console.error("[PROGRAM] Error saving audio:", err);
        }
      }

      if (!this.currentModalData) this.currentModalData = {};
      this.currentModalData.audio = fileName;

      const audioInput = document.getElementById("inputSongAudio");
      if (audioInput) audioInput.value = fileName;
      const display = document.getElementById("progSongAudioDisplay");
      if (display) {
        display.textContent = "Attached: " + fileName;
        display.className = "text-xs text-purple-900 font-semibold";
      }
      if (input) input.value = "";
    } catch (e) {}
  }

  // Scripture reference builder row
  addScriptureReferenceRow(containerId, initialData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const rowId = "sref_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const row = document.createElement("div");
    row.id = rowId;
    row.className = "flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg scripture-ref-row";

    // Book dropdown shows primary-language names only (value stays the index)
    const bList = (typeof booknames !== "undefined" && Array.isArray(booknames)) ? booknames : ["Genesis"];
    let bookOpts = "";
    bList.forEach((bn, idx) => {
      const label = String(bn).split("/")[0].trim() || bn;
      bookOpts += `<option value="${idx}">${label}</option>`;
    });

    row.innerHTML = `
      <div class="flex-1 min-w-[120px]">
        <select class="ref-book w-full p-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-brand-500" 
                onchange="programManager.updateRefChapters('${rowId}')">
          ${bookOpts}
        </select>
      </div>
      <div class="w-16">
        <select class="ref-chapter w-full p-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-brand-500" 
                onchange="programManager.updateRefVerses('${rowId}')">
        </select>
      </div>
      <div class="w-14">
        <select class="ref-from-verse w-full p-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-brand-500"
                onchange="programManager.updateRefToVerseMin('${rowId}')">
        </select>
      </div>
      <span class="text-xs text-slate-400 font-bold">to</span>
      <div class="w-14">
        <select class="ref-to-verse w-full p-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-brand-500">
        </select>
      </div>
      <button type="button" onclick="document.getElementById('${rowId}').remove()" class="p-1.5 text-slate-400 hover:text-red-500 rounded transition" title="Remove reference">
        <i class="fa-solid fa-trash-can text-xs"></i>
      </button>
    `;

    container.appendChild(row);

    const bSel = row.querySelector(".ref-book");
    if (initialData && typeof initialData.bookIndex !== "undefined") {
      bSel.selectedIndex = initialData.bookIndex;
    }
    this.updateRefChapters(rowId, initialData ? initialData.chapter : 1);
    this.updateRefVerses(rowId, initialData ? initialData.fromVerse : 1, initialData ? initialData.toVerse : 1);
  }

  updateRefChapters(rowId, selectedCh) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const bSel = row.querySelector(".ref-book");
    const chSel = row.querySelector(".ref-chapter");
    const bIdx = parseInt(bSel.value) + 1; // 1-indexed for numofch

    chSel.innerHTML = "";
    const totalCh = (typeof numofch !== "undefined" && numofch[bIdx]) ? numofch[bIdx][0] : 50;
    for (let c = 1; c <= totalCh; c++) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.text = c;
      chSel.appendChild(opt);
    }
    if (selectedCh && selectedCh <= totalCh) {
      chSel.value = selectedCh;
    } else {
      chSel.selectedIndex = 0;
    }
    this.updateRefVerses(rowId);
  }

  updateRefVerses(rowId, selectedFromV, selectedToV) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const bSel = row.querySelector(".ref-book");
    const chSel = row.querySelector(".ref-chapter");
    const fromVSel = row.querySelector(".ref-from-verse");
    const toVSel = row.querySelector(".ref-to-verse");

    const bIdx = parseInt(bSel.value) + 1;
    const ch = parseInt(chSel.value);
    const totalV = (typeof numofch !== "undefined" && numofch[bIdx] && numofch[bIdx][ch]) ? numofch[bIdx][ch] : 50;

    fromVSel.innerHTML = "";
    toVSel.innerHTML = "";
    for (let v = 1; v <= totalV; v++) {
      const opt1 = document.createElement("option");
      opt1.value = v;
      opt1.text = v;
      fromVSel.appendChild(opt1);

      const opt2 = document.createElement("option");
      opt2.value = v;
      opt2.text = v;
      toVSel.appendChild(opt2);
    }

    if (selectedFromV && selectedFromV <= totalV) {
      fromVSel.value = selectedFromV;
    } else {
      fromVSel.selectedIndex = 0;
    }

    if (selectedToV && selectedToV <= totalV) {
      toVSel.value = selectedToV;
    } else {
      toVSel.value = fromVSel.value;
    }
  }

  updateRefToVerseMin(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const fromVSel = row.querySelector(".ref-from-verse");
    const toVSel = row.querySelector(".ref-to-verse");
    if (parseInt(toVSel.value) < parseInt(fromVSel.value)) {
      toVSel.value = fromVSel.value;
    }
  }

  // Save Add/Edit Modal
  saveModalItem() {
    const type = this.currentModalType;
    let title = "";
    const data = {};

    if (type === "person") {
      data.personType = document.getElementById("inputPersonType") ? document.getElementById("inputPersonType").value.trim() : "";
      data.personTitle = document.getElementById("inputPersonTitle") ? document.getElementById("inputPersonTitle").value.trim() : "";
      data.name = document.getElementById("inputPersonName") ? document.getElementById("inputPersonName").value.trim() : "";
      data.centro = document.getElementById("inputPersonCentro") ? document.getElementById("inputPersonCentro").value.trim() : "";
      
      // For Person type, Person Type (role) is the title
      title = data.personType || "Panauhing Tagapagsalita";
      if (!data.personType && !data.name) {
        alert("Please provide at least a Person Type (Role) or Name.");
        return;
      }
    } else {
      title = document.getElementById("inputItemTitle") ? document.getElementById("inputItemTitle").value.trim() : "";
      if (!title) {
        alert("Please provide a Title for this program item.");
        return;
      }
    }

    if (type === "song") {
      let lyricsVal = document.getElementById("inputSongLyrics") ? document.getElementById("inputSongLyrics").value.trim() : "";
      if (!lyricsVal && title && typeof songManagerObj !== "undefined" && songManagerObj) {
        let matchedSong = null;
        if (typeof songManagerObj.getRawSongRows === "function") {
          const raw = songManagerObj.getRawSongRows();
          if (Array.isArray(raw)) {
            matchedSong = raw.find(r => r && r.name && r.name.trim().toLowerCase() === title.trim().toLowerCase());
          }
        }
        if (matchedSong && matchedSong.lyrics) {
          lyricsVal = matchedSong.lyrics
            .replace(/<slide>\s*<slide>/gi, "<slide>")
            .split(/<slide>/gi)
            .map(part => part.replace(/<br\s*\/?>/gi, "\n").trim())
            .filter(part => part.length > 0)
            .join("\n\n");
        }
      }
      data.lyrics = lyricsVal;
      if (this.currentModalData && this.currentModalData.font) {
        data.font = this.currentModalData.font;
      }
      if (this.currentModalData && (this.currentModalData.copyright || this.currentModalData.copy)) {
        data.copyright = this.currentModalData.copyright || this.currentModalData.copy;
      }
      const audioInput = document.getElementById("inputSongAudio");
      if (audioInput && audioInput.value.trim()) {
        data.audio = audioInput.value.trim();
      } else if (this.currentModalData && this.currentModalData.audio) {
        data.audio = this.currentModalData.audio;
      }
    } else if (type === "scripture") {
      data.references = [];
      const rows = document.querySelectorAll("#scriptureRefContainer .scripture-ref-row");
      rows.forEach(r => {
        const bSel = r.querySelector(".ref-book");
        const chSel = r.querySelector(".ref-chapter");
        const fromSel = r.querySelector(".ref-from-verse");
        const toSel = r.querySelector(".ref-to-verse");
        data.references.push({
          bookIndex: parseInt(bSel.value),
          bookName: bSel.options[bSel.selectedIndex].text,
          chapter: parseInt(chSel.value),
          fromVerse: parseInt(fromSel.value),
          toVerse: parseInt(toSel.value)
        });
      });
    } else if (type === "tema") {
      data.tema = document.getElementById("inputTemaContent") ? document.getElementById("inputTemaContent").value.trim() : "";
      data.batayan = document.getElementById("inputTemaBatayan") ? document.getElementById("inputTemaBatayan").value.trim() : "";
    } else if (type === "general") {
      data.content = document.getElementById("inputGeneralContent") ? document.getElementById("inputGeneralContent").value.trim() : "";
    }

    const customSlideObj = (this.currentModalData && this.currentModalData.customSlide)
      || (this.editingIndex >= 0 && this.items[this.editingIndex].customSlide)
      || (this.editingIndex >= 0 && this.items[this.editingIndex].data && this.items[this.editingIndex].data.customSlide)
      || null;

    if (customSlideObj) {
      data.customSlide = customSlideObj;
    }

    const newItem = {
      id: this.editingIndex >= 0 ? this.items[this.editingIndex].id : "item_" + Date.now(),
      type: type,
      title: title,
      data: data,
      customSlide: customSlideObj
    };

    if (this.editingIndex >= 0) {
      this.items[this.editingIndex] = newItem;
      this.selectedItemIndex = this.editingIndex;
    } else {
      this.items.push(newItem);
      this.selectedItemIndex = this.items.length - 1;
    }

    this.saveProgramData();
    this.closeItemModal();
    this.renderLeftNav();
    this.renderRightWorkspace();
  }

  _notify(message, type = "info") {
    if (typeof showToast === "function") {
      showToast(message, type);
    } else if (typeof alert === "function") {
      alert(message);
    } else {
      console.log(`[PROGRAM ${type.toUpperCase()}] ${message}`);
    }
  }

  // Helper to extract file path from Electron dialog result
  _extractDialogFilePath(res) {
    if (!res) return null;
    if (typeof res === "string") return res;
    if (res.canceled) return null;
    if (Array.isArray(res.filePaths) && res.filePaths.length > 0) return res.filePaths[0];
    if (typeof res.filePath === "string" && res.filePath) return res.filePath;
    if (Array.isArray(res) && res.length > 0) return res[0];
    return null;
  }

  // Resolve default directory for save dialog
  _resolveDefaultSavePath(fileName) {
    if (typeof require === "function") {
      try {
        const path = require("path");
        const os = require("os");
        const fs = require("fs");
        if (path.isAbsolute(fileName)) return fileName;
        const downloadsDir = path.join(os.homedir(), "Downloads");
        const baseDir = fs.existsSync(downloadsDir) ? downloadsDir : os.homedir();
        return path.join(baseDir, fileName);
      } catch (e) {}
    }
    return fileName;
  }

  // Prompt save file dialog
  async _promptSaveJsonPath(dialogOptions) {
    if (typeof window !== "undefined" && window.electronBridge) {
      if (typeof window.electronBridge.showSaveDialogAsync === "function") {
        const res = await window.electronBridge.showSaveDialogAsync(dialogOptions);
        if (res) return res;
      } else if (typeof window.electronBridge.showSaveDialog === "function") {
        const res = window.electronBridge.showSaveDialog(dialogOptions);
        if (res) return res;
      }
    }
    if (typeof require === "function") {
      try {
        const { ipcRenderer } = require("electron");
        if (ipcRenderer && ipcRenderer.invoke) {
          return await ipcRenderer.invoke("dialog:show-save", dialogOptions);
        }
      } catch (e) {}
    }
    return null;
  }

  // Prompt open file dialog
  async _promptOpenJsonPath(dialogOptions) {
    if (typeof window !== "undefined" && window.electronBridge) {
      if (typeof window.electronBridge.showOpenDialogAsync === "function") {
        const res = await window.electronBridge.showOpenDialogAsync(dialogOptions);
        if (res) return res;
      } else if (typeof window.electronBridge.showOpenDialog === "function") {
        const res = window.electronBridge.showOpenDialog(dialogOptions);
        if (res) return res;
      }
    }
    if (typeof require === "function") {
      try {
        const { ipcRenderer } = require("electron");
        if (ipcRenderer && ipcRenderer.invoke) {
          return await ipcRenderer.invoke("dialog:show-open", dialogOptions);
        }
      } catch (e) {}
    }
    return null;
  }

  // Export full program (all items)
  async exportProgram() {
    if (!this.items || this.items.length === 0) {
      this._notify("No program items to export. Add items first.", "info");
      return;
    }

    const payload = {
      app: "UECFI Presenter",
      format: "uecfi-program",
      version: 1,
      exportedAt: new Date().toISOString(),
      count: this.items.length,
      items: this.items
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    const defaultFileName = `uecfi_program_${dateStr}.json`;
    await this._saveJsonPayload(payload, defaultFileName, `${this.items.length} program item${this.items.length !== 1 ? 's' : ''}`);
  }

  // Export a single program item
  async exportSingleItem(index) {
    const idx = (typeof index === "number" && index >= 0) ? index : this.selectedItemIndex;
    if (idx < 0 || idx >= this.items.length) {
      this._notify("No item selected to export.", "info");
      return;
    }

    const item = this.items[idx];
    const payload = {
      app: "UECFI Presenter",
      format: "uecfi-program-item",
      version: 1,
      exportedAt: new Date().toISOString(),
      item: item
    };

    const safeTitle = (item.title || "item")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "item";
    const dateStr = new Date().toISOString().slice(0, 10);
    const defaultFileName = `uecfi_program_item_${safeTitle}_${dateStr}.json`;
    await this._saveJsonPayload(payload, defaultFileName, `"${item.title}"`);
  }

  // Internal save helper for desktop and browser fallback
  async _saveJsonPayload(payload, defaultFileName, label) {
    const jsonStr = JSON.stringify(payload, null, 2);
    const hasDesktopSave = (typeof window !== "undefined" && window.electronBridge && (window.electronBridge.showSaveDialogAsync || window.electronBridge.showSaveDialog)) || (typeof require === "function");

    if (hasDesktopSave) {
      try {
        const dialogOpts = {
          title: `Export ${label} to JSON`,
          defaultPath: this._resolveDefaultSavePath(defaultFileName),
          filters: [
            { name: "JSON Files (*.json)", extensions: ["json"] },
            { name: "All Files (*.*)", extensions: ["*"] }
          ]
        };

        const res = await this._promptSaveJsonPath(dialogOpts);
        let targetPath = this._extractDialogFilePath(res);
        if (!targetPath) return; // User canceled

        if (!/\.json$/i.test(targetPath)) {
          targetPath += ".json";
        }

        let wroteDirect = false;
        if (typeof require === "function") {
          try {
            const fs = require("fs");
            const path = require("path");
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, jsonStr, "utf8");
            wroteDirect = true;
          } catch (fsErr) {
            console.warn("[PROGRAM] Direct fs write failed, trying AppStorage:", fsErr);
          }
        }

        if (!wroteDirect && typeof AppStorage !== "undefined" && AppStorage.writeFile) {
          await AppStorage.writeFile(targetPath, jsonStr);
        }

        this._notify(`Exported ${label} successfully!`);
      } catch (err) {
        console.error("[PROGRAM] Error saving JSON file:", err);
        this._notify("Export failed: " + (err && err.message ? err.message : err), "error");
      }
    } else {
      // Browser fallback using Blob download
      try {
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this._notify(`Exported ${label} to ${defaultFileName}`);
      } catch (err) {
        this._notify("Error exporting JSON in browser: " + (err && err.message ? err.message : err), "error");
      }
    }
  }

  // Import program items from file
  async importProgram() {
    const hasDesktopOpen = (typeof window !== "undefined" && window.electronBridge && (window.electronBridge.showOpenDialogAsync || window.electronBridge.showOpenDialog)) || (typeof require === "function");

    if (hasDesktopOpen) {
      try {
        const dialogOpts = {
          title: "Select Program File to Import (JSON or XML)",
          filters: [
            { name: "Program Files (*.json, *.xml)", extensions: ["json", "xml"] },
            { name: "JSON Files (*.json)", extensions: ["json"] },
            { name: "XML Files (*.xml)", extensions: ["xml"] },
            { name: "All Files (*.*)", extensions: ["*"] }
          ],
          properties: ["openFile"]
        };

        const res = await this._promptOpenJsonPath(dialogOpts);
        const filePath = this._extractDialogFilePath(res);
        if (!filePath) return; // User canceled

        let content = null;
        if (typeof require === "function") {
          try {
            const fs = require("fs");
            if (fs.existsSync(filePath)) {
              content = fs.readFileSync(filePath, "utf8");
            }
          } catch (fsErr) {
            console.warn("[PROGRAM] Direct fs read failed, trying AppStorage:", fsErr);
          }
        }

        if (content === null && typeof AppStorage !== "undefined" && AppStorage.readFile) {
          content = await AppStorage.readFile(filePath);
        }

        if (typeof content !== "string") {
          throw new Error("Unable to read selected file.");
        }

        const fileName = filePath.replace(/\\/g, "/").split("/").pop();
        this.processImportedContent(content, fileName);
      } catch (err) {
        console.error("[PROGRAM] Error opening program file:", err);
        this._notify("Error opening file: " + (err && err.message ? err.message : err), "error");
      }
    } else {
      // Browser fallback
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.xml,application/json,text/xml";
      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            this.processImportedContent(evt.target.result, file.name);
          };
          reader.onerror = () => {
            this._notify("Failed to read the selected file.", "error");
          };
          reader.readAsText(file, "UTF-8");
        }
      };
      input.click();
    }
  }

  // Parse and validate imported content
  processImportedContent(rawContent, sourceName) {
    if (!rawContent || typeof rawContent !== "string" || !rawContent.trim()) {
      this._notify("Selected file is empty.", "error");
      return;
    }

    const trimmed = rawContent.trim();
    let candidateItems = [];

    if (trimmed.startsWith("<")) {
      // XML format (e.g. Song DB XML or single song XML)
      try {
        let songs = [];
        if (typeof songPortXML !== "undefined") {
          try {
            const port = new songPortXML();
            if (typeof port.parseXMLString === "function") {
              songs = port.parseXMLString(rawContent);
            }
          } catch (e) {}
        }
        if ((!songs || songs.length === 0) && typeof DOMParser !== "undefined") {
          const parser = new DOMParser();
          const doc = parser.parseFromString(rawContent, "text/xml");
          const songNodes = doc.getElementsByTagName("song");
          for (let i = 0; i < songNodes.length; i++) {
            const sn = songNodes[i];
            const nameEl = sn.getElementsByTagName("name")[0] || sn.getElementsByTagName("title")[0];
            const lyricsEl = sn.getElementsByTagName("lyrics")[0];
            const fontEl = sn.getElementsByTagName("font")[0];
            const copyEl = sn.getElementsByTagName("copyright")[0] || sn.getElementsByTagName("copy")[0];
            const name = nameEl ? nameEl.textContent.trim() : `Song ${i + 1}`;
            const lyrics = lyricsEl ? lyricsEl.textContent : "";
            const font = fontEl ? fontEl.textContent.trim() : "Arial";
            const copy = copyEl ? copyEl.textContent.trim() : "";
            songs.push({ name, lyrics, font, copy });
          }
        }
        if (!songs || songs.length === 0) {
          const songMatches = rawContent.match(/<song[\s\S]*?<\/song>/gi);
          if (songMatches) {
            songMatches.forEach((sChunk, i) => {
              const titleMatch = sChunk.match(/<(?:title|name)>([\s\S]*?)<\/(?:title|name)>/i);
              const lyricsMatch = sChunk.match(/<lyrics>([\s\S]*?)<\/lyrics>/i);
              const fontMatch = sChunk.match(/<font>([\s\S]*?)<\/font>/i);
              const copyMatch = sChunk.match(/<(?:copyright|copy)>([\s\S]*?)<\/(?:copyright|copy)>/i);
              songs.push({
                name: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : `Song ${i + 1}`,
                lyrics: lyricsMatch ? lyricsMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1") : "",
                font: fontMatch ? fontMatch[1].trim() : "Arial",
                copy: copyMatch ? copyMatch[1].trim() : ""
              });
            });
          }
        }

        if (Array.isArray(songs) && songs.length > 0) {
          candidateItems = songs.map((s, idx) => ({
            id: `item_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            type: "song",
            title: s.name || `Song ${idx + 1}`,
            data: {
              lyrics: s.lyrics || "",
              font: s.font || "Arial",
              copyright: s.copy || s.copyright || ""
            }
          }));
        } else {
          this._notify("No valid song or program items found in the XML file.", "error");
          return;
        }
      } catch (xmlErr) {
        console.error("[PROGRAM] XML parsing failed:", xmlErr);
        this._notify("Error parsing XML: " + xmlErr.message, "error");
        return;
      }
    } else {
      // JSON format
      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch (jsonErr) {
        console.error("[PROGRAM] JSON parsing failed:", jsonErr);
        this._notify("Invalid JSON file: " + jsonErr.message, "error");
        return;
      }

      if (Array.isArray(parsed)) {
        candidateItems = parsed;
      } else if (parsed && Array.isArray(parsed.items)) {
        candidateItems = parsed.items;
      } else if (parsed && parsed.item && typeof parsed.item === "object") {
        candidateItems = [parsed.item];
      } else if (parsed && typeof parsed === "object" && (parsed.type || parsed.title || parsed.data)) {
        candidateItems = [parsed];
      }
    }

    if (!Array.isArray(candidateItems) || candidateItems.length === 0) {
      this._notify("No program items found in the selected file.", "error");
      return;
    }

    const validTypes = ["person", "song", "scripture", "tema", "general"];
    const validItems = [];

    candidateItems.forEach((raw, idx) => {
      if (!raw || typeof raw !== "object") return;
      const rawType = raw.type ? String(raw.type).trim().toLowerCase() : "";
      const type = validTypes.includes(rawType) ? rawType : "general";

      let title = raw.title ? String(raw.title).trim() : "";
      const data = (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) ? raw.data : {};

      if (!title) {
        if (type === "person") title = data.personType || data.name || "Person";
        else if (type === "tema") title = "Tema";
        else if (type === "scripture") title = "Scripture";
        else if (type === "song") title = "Song";
        else title = `Program Item ${idx + 1}`;
      }

      const customSlideObj = raw.customSlide || data.customSlide || null;
      if (customSlideObj) data.customSlide = customSlideObj;

      validItems.push({
        id: raw.id ? String(raw.id) : `item_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        type: type,
        title: title,
        data: data,
        customSlide: customSlideObj
      });
    });

    if (validItems.length === 0) {
      this._notify("No valid program items could be parsed from the file.", "error");
      return;
    }

    // If current program already has items, prompt user to Replace or Append
    if (this.items && this.items.length > 0) {
      this.showImportModeModal(validItems, sourceName || "file");
    } else {
      this.applyImportedItems(validItems, "replace");
    }
  }

  // Modal to prompt Replace vs Append
  showImportModeModal(validItems, sourceName) {
    const existing = document.getElementById("programImportModal");
    if (existing) existing.remove();

    const count = validItems.length;
    const currentCount = this.items.length;
    const safeSource = (sourceName || "").replace(/[<>&"]/g, "");

    const modal = document.createElement("div");
    modal.id = "programImportModal";
    modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4";
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Modal Header -->
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-sm">
              <i class="fa-solid fa-file-import"></i>
            </div>
            <div>
              <h3 class="font-bold text-slate-900 text-sm">Import Program Items</h3>
              <p class="text-[11px] text-slate-400">Choose how to add imported items</p>
            </div>
          </div>
          <button onclick="document.getElementById('programImportModal').remove()" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-5 space-y-3.5">
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
            <div class="flex justify-between items-center">
              <span class="text-slate-500">Source:</span>
              <span class="font-semibold text-slate-800 truncate max-w-[220px]" title="${safeSource}">${safeSource}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500">Items in file:</span>
              <span class="font-bold text-brand-600">${count} item${count !== 1 ? 's' : ''}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500">Current program:</span>
              <span class="font-bold text-slate-800">${currentCount} item${currentCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <p class="text-xs text-slate-600">
            How would you like to handle your existing program items?
          </p>

          <div class="space-y-2">
            <button id="btnImportAppend" class="w-full p-3 rounded-xl border border-brand-200 bg-brand-50/50 hover:bg-brand-50 hover:border-brand-400 transition flex items-start gap-3 text-left group">
              <div class="w-6 h-6 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <div class="flex-1">
                <div class="text-xs font-bold text-brand-900 group-hover:text-brand-700">Append to Current Program</div>
                <div class="text-[11px] text-brand-700/80 mt-0.5">Keep existing ${currentCount} item(s) and add ${count} new item(s) at the end.</div>
              </div>
            </button>

            <button id="btnImportReplace" class="w-full p-3 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50/50 transition flex items-start gap-3 text-left group">
              <div class="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-red-100 text-slate-600 group-hover:text-red-600 flex items-center justify-center shrink-0 mt-0.5 text-xs transition">
                <i class="fa-solid fa-rotate"></i>
              </div>
              <div class="flex-1">
                <div class="text-xs font-bold text-slate-800 group-hover:text-red-700">Replace Current Program</div>
                <div class="text-[11px] text-slate-500 group-hover:text-red-600/80 mt-0.5">Clear existing items and replace them with the ${count} imported item(s).</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
          <button onclick="document.getElementById('programImportModal').remove()" class="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition">
            Cancel
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const appendBtn = document.getElementById("btnImportAppend");
    if (appendBtn) {
      appendBtn.onclick = () => {
        modal.remove();
        this.applyImportedItems(validItems, "append");
      };
    }

    const replaceBtn = document.getElementById("btnImportReplace");
    if (replaceBtn) {
      replaceBtn.onclick = () => {
        modal.remove();
        this.applyImportedItems(validItems, "replace");
      };
    }
  }

  // Apply imported items to memory, disk, and UI
  applyImportedItems(validItems, mode) {
    if (!Array.isArray(validItems) || validItems.length === 0) return;

    if (mode === "replace") {
      this.clearPresentationHighlight();
      this.items = validItems;
      this.selectedItemIndex = this.items.length > 0 ? 0 : -1;
    } else {
      const existingIds = new Set(this.items.map(it => it.id));
      const startingIdx = this.items.length;
      validItems.forEach((it, idx) => {
        let itemId = it.id;
        if (!itemId || existingIds.has(itemId)) {
          itemId = `item_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        }
        existingIds.add(itemId);
        const itCustomSlide = it.customSlide || (it.data && it.data.customSlide) || null;
        if (itCustomSlide && it.data) it.data.customSlide = itCustomSlide;
        this.items.push({
          id: itemId,
          type: it.type,
          title: it.title,
          data: it.data,
          customSlide: itCustomSlide
        });
      });
      this.selectedItemIndex = startingIdx;
    }

    this.saveProgramData();
    this.renderLeftNav();
    this.renderRightWorkspace();

    const count = validItems.length;
    const msg = mode === "replace"
      ? `Replaced program with ${count} imported item${count !== 1 ? 's' : ''}!`
      : `Appended ${count} imported item${count !== 1 ? 's' : ''} to program!`;

    this._notify(msg);
  }

  // -------------------------------------------------------------------------
  // Custom Slide Designer for Person & General Program Items
  // Mirrors openAttentionDesigner / openLogoDesigner from p_window.js
  // -------------------------------------------------------------------------

  openCustomSlideDesignerFromModal() {
    this.editingCustomSlideFromModal = true;
    this.editingCustomSlideIndex = this.editingIndex;

    const modalType = this.currentModalType || "person";
    let targetObj = (this.currentModalData && this.currentModalData.customSlide) ? this.currentModalData.customSlide : null;
    if (!targetObj && this.editingIndex >= 0 && this.items[this.editingIndex]) {
      targetObj = this.items[this.editingIndex].customSlide || (this.items[this.editingIndex].data && this.items[this.editingIndex].data.customSlide) || null;
    }

    const defaultTitle = (modalType === "person") 
      ? (document.getElementById("inputPersonType") ? document.getElementById("inputPersonType").value.trim() : (this.currentModalData.personType || "Panauhing Tagapagsalita"))
      : (document.getElementById("inputItemTitle") ? document.getElementById("inputItemTitle").value.trim() : (this.currentModalTitle || "ANNOUNCEMENTS"));

    const defaultPersonTitle = (modalType === "person")
      ? (document.getElementById("inputPersonTitle") ? document.getElementById("inputPersonTitle").value.trim() : (this.currentModalData.personTitle || ""))
      : "";

    let defaultText1 = (modalType === "person")
      ? (document.getElementById("inputPersonName") ? document.getElementById("inputPersonName").value.trim() : (this.currentModalData.name || ""))
      : (document.getElementById("inputGeneralContent") ? document.getElementById("inputGeneralContent").value.trim().split(/\n\s*\n/)[0] : (this.currentModalData.content || "").split(/\n\s*\n/)[0] || "");
    if (modalType === "person" && defaultPersonTitle && typeof defaultText1 === "string") {
      const ptLower = defaultPersonTitle.toLowerCase();
      if (defaultText1.toLowerCase().startsWith(ptLower + " ")) {
        defaultText1 = defaultText1.substring(defaultPersonTitle.length).trim();
      }
    }

    const defaultText2 = (modalType === "person")
      ? (document.getElementById("inputPersonCentro") ? document.getElementById("inputPersonCentro").value.trim() : (this.currentModalData.centro || ""))
      : "";

    this.showCustomSlideDesignerModal({
      type: modalType,
      customSlide: targetObj,
      defaultTitle: defaultTitle,
      defaultPersonTitle: defaultPersonTitle,
      defaultText1: defaultText1,
      defaultText2: defaultText2 ? (defaultText2.startsWith("(") ? defaultText2 : "(" + defaultText2 + ")") : ""
    });
  }

  openCustomSlideDesigner(index) {
    const idx = (typeof index === "number" && index >= 0) ? index : this.selectedItemIndex;
    if (idx < 0 || idx >= this.items.length) {
      this._notify("No item selected to customize.", "info");
      return;
    }

    const item = this.items[idx];
    if (item.type !== "person" && item.type !== "general") {
      this._notify("Slide customization is only available for Person and General items.", "info");
      return;
    }

    this.editingCustomSlideFromModal = false;
    this.editingCustomSlideIndex = idx;

    const slides = this.generateSlidesForItem(item);
    const firstSlide = (slides && slides[0]) || { text1: "", text2: "" };

    const defaultTitle = (item.type === "person")
      ? (item.data.personType || item.title || "Panauhing Tagapagsalita")
      : (item.title || "ANNOUNCEMENTS");

    const defaultPersonTitle = (item.type === "person")
      ? (item.data.personTitle || (firstSlide && firstSlide.personTitle) || "")
      : "";

    let defaultText1 = (item.type === "person")
      ? (item.data.name || firstSlide.text1 || "")
      : (firstSlide.text1 || (item.data.content || "").split(/\n\s*\n/)[0] || "");
    if (item.type === "person" && defaultPersonTitle && typeof defaultText1 === "string") {
      const ptLower = defaultPersonTitle.toLowerCase();
      if (defaultText1.toLowerCase().startsWith(ptLower + " ")) {
        defaultText1 = defaultText1.substring(defaultPersonTitle.length).trim();
      }
    }

    const defaultText2 = (item.type === "person")
      ? (firstSlide.text2 || (item.data.centro ? (item.data.centro.startsWith("(") ? item.data.centro : "(" + item.data.centro + ")") : ""))
      : "";

    this.showCustomSlideDesignerModal({
      type: item.type,
      customSlide: item.customSlide || (item.data && item.data.customSlide) || null,
      defaultTitle: defaultTitle,
      defaultPersonTitle: defaultPersonTitle,
      defaultText1: defaultText1,
      defaultText2: defaultText2
    });
  }

  showCustomSlideDesignerModal(opts) {
    try {
      if (typeof AppUI === "undefined" || !AppUI.Modal) return;

      const type = opts.type || "person";
      const isPerson = type === "person";
      const existing = opts.customSlide || {};
      const themeStyle = this.getThemeDefaultsForType(type);

      const numVal = (v, d) => (isFinite(Number(v)) ? Number(v) : d);
      const strVal = (v, d) => (typeof v === "string" ? v : d);
      const boolVal = (v, d) => (v !== undefined ? !!v : d);

      const themeBgImage = (themeStyle.backgroundType === "image" && themeStyle.bgImage) ? themeStyle.bgImage : "";
      const themeBgDim = (typeof themeStyle.overlayOpacity !== "undefined" && themeStyle.overlayOpacity !== null) ? Number(themeStyle.overlayOpacity) : 25;
      const themeBgColor = themeStyle.bgColor || (isPerson ? "#1c1917" : "#0f172a");

      this.workingCustomSlide = {
        active: boolVal(existing.active, true),
        type: type,
        image: strVal(existing.image, ""),
        imgSize: numVal(existing.imgSize, 35),
        title: strVal(existing.title, opts.defaultTitle || (isPerson ? "Panauhing Tagapagsalita" : "ANNOUNCEMENTS")),
        personTitle: strVal(existing.personTitle, opts.defaultPersonTitle || ""),
        personTitleSize: numVal(existing.personTitleSize, 6),
        personTitleBold: boolVal(existing.personTitleBold, true),
        personTitleItalic: boolVal(existing.personTitleItalic, false),
        personTitleCaps: boolVal(existing.personTitleCaps, false),
        personTitleFont: strVal(existing.personTitleFont, themeStyle.primaryFont || "Arial"),
        personTitleColor: strVal(existing.personTitleColor, themeStyle.secondaryColor || "#FDE68A"),
        personTitleBorderColor: strVal(existing.personTitleBorderColor, "#000000"),
        personTitleBorderThickness: numVal(existing.personTitleBorderThickness, 0),
        personTitlePaddingV: numVal(existing.personTitlePaddingV, 0),
        personTitlePaddingH: numVal(existing.personTitlePaddingH, 0),
        titleSize: numVal(existing.titleSize, 8),
        titleBold: boolVal(existing.titleBold, themeStyle.headerWeight !== "normal"),
        titleItalic: boolVal(existing.titleItalic, false),
        titleCaps: boolVal(existing.titleCaps, themeStyle.headerTransform === "uppercase"),
        titleFont: strVal(existing.titleFont, themeStyle.headerFont || "Arial"),
        titleColor: strVal(existing.titleColor, themeStyle.headerColor || (isPerson ? "#F59E0B" : "#94A3B8")),
        titleBorderColor: strVal(existing.titleBorderColor, "#000000"),
        titleBorderThickness: numVal(existing.titleBorderThickness, 0),
        titlePaddingV: numVal(existing.titlePaddingV, 0),
        titlePaddingH: numVal(existing.titlePaddingH, 0),
        text1: strVal(existing.text1, opts.defaultText1 || ""),
        text1Size: numVal(existing.text1Size, isPerson ? 12 : 7),
        text1Bold: boolVal(existing.text1Bold, themeStyle.primaryWeight !== "normal"),
        text1Italic: boolVal(existing.text1Italic, false),
        text1Caps: boolVal(existing.text1Caps, false),
        text1Font: strVal(existing.text1Font, themeStyle.primaryFont || "Arial"),
        text1Color: strVal(existing.text1Color, themeStyle.primaryColor || "#ffffff"),
        text1BorderColor: strVal(existing.text1BorderColor, "#000000"),
        text1BorderThickness: numVal(existing.text1BorderThickness, 0),
        text1PaddingV: numVal(existing.text1PaddingV, 0),
        text1PaddingH: numVal(existing.text1PaddingH, 0),
        text2: strVal(existing.text2, opts.defaultText2 || ""),
        text2Size: numVal(existing.text2Size, 5),
        text2Bold: boolVal(existing.text2Bold, themeStyle.secondaryWeight === "bold"),
        text2Italic: boolVal(existing.text2Italic, !!themeStyle.secondaryItalic),
        text2Caps: boolVal(existing.text2Caps, false),
        text2Font: strVal(existing.text2Font, themeStyle.secondaryFont || "Arial"),
        text2Color: strVal(existing.text2Color, themeStyle.secondaryColor || (isPerson ? "#FDE68A" : "#cbd5e1")),
        text2BorderColor: strVal(existing.text2BorderColor, "#000000"),
        text2BorderThickness: numVal(existing.text2BorderThickness, 0),
        text2PaddingV: numVal(existing.text2PaddingV, 0),
        text2PaddingH: numVal(existing.text2PaddingH, 0),
        bg: strVal(existing.bg, themeBgColor),
        bgGradient: strVal(existing.bgGradient, (themeStyle.backgroundType === "gradient" && themeStyle.bgGradient) ? themeStyle.bgGradient : ""),
        borderColor: strVal(existing.borderColor, "#ffffff"),
        borderThickness: numVal(existing.borderThickness, 0),
        paddingV: numVal(existing.paddingV, 5),
        paddingH: numVal(existing.paddingH, 5),
        bgImage: strVal(existing.bgImage, themeBgImage),
        bgDim: numVal(existing.bgDim, themeBgDim)
      };

      if (!window.customSlideDesignerModal) {
        window.customSlideDesignerModal = new AppUI.Modal("customSlideDesignerDialog");
        window.customSlideDesignerModal.render();
      }

      const cs = this.workingCustomSlide;
      const esc = (s) => (typeof escapeNotepadHtml === "function" ? escapeNotepadHtml(s) : String(s || "").replace(/"/g, "&quot;"));

      window.customSlideDesignerModal.setHeader(`Customize Slide &mdash; ${isPerson ? "Person" : "General"}`);
      window.customSlideDesignerModal.setBody(
        `<div class="flex flex-col gap-3">`
        + `<!-- Active toggle card -->`
        + `<div class="p-3 bg-brand-50/70 border border-brand-200 rounded-xl flex items-center justify-between">`
        + `  <div>`
        + `    <span class="block text-xs font-bold text-slate-800">Enable Custom Slide Styling</span>`
        + `    <span class="block text-[11px] text-slate-500">When enabled, this item uses individual design overrides. Unmodified settings inherit Settings &gt; Theme Designer (${isPerson ? "Person" : "General"}) defaults.</span>`
        + `  </div>`
        + `  <label class="relative inline-flex items-center cursor-pointer">`
        + `    <input type="checkbox" id="csActiveToggle" class="sr-only peer" ${cs.active ? "checked" : ""}>`
        + `    <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>`
        + `  </label>`
        + `</div>`

        + `<!-- Image upload & preview -->`
        + `<div class="flex items-start gap-3">`
        + `  <img id="csImagePreview" src="${cs.image || ""}" style="display:${cs.image ? "block" : "none"};width:96px;height:96px;object-fit:contain;background:#0f172a;border-radius:12px;border:1px solid #e2e8f0;">`
        + `  <div class="flex-1 min-w-0 flex flex-col gap-2">`
        + `    <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-700">${isPerson ? "Speaker Portrait / Photo" : "Slide Graphic / Logo"}</label>`
        + `    <input id="csImageFile" type="file" accept="image/*" class="w-full text-xs text-slate-600">`
        + `    <button type="button" id="csImageRemoveBtn" class="px-2.5 py-1 text-[11px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition self-start" style="background:none;border:0;cursor:pointer;">Remove image</button>`
        + `  </div>`
        + `</div>`
        + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Image size (<span id="csImgSizeVal">${cs.imgSize}%</span> of screen height)</span>`
        + `<input id="csImgSize" type="range" min="5" max="85" step="1" value="${cs.imgSize}" class="w-full"></label>`

        + `<!-- Title / Header -->`
        + `<div class="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">`
        + `  <div class="flex items-center justify-between"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">Header / Role / Title</span>`
        + `  <span class="flex items-center gap-1">`
        + `    <button type="button" id="csTitleBold" title="Bold title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><b>B</b></button>`
        + `    <button type="button" id="csTitleItalic" title="Italic title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><i>I</i></button>`
        + `    <button type="button" id="csTitleCaps" title="All caps title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:11px;font-weight:bold;cursor:pointer;background:#fff;">AA</button>`
        + `  </span></div>`
        + `  <input id="csTitle" type="text" maxlength="80" value="${esc(cs.title)}" placeholder="${isPerson ? "Panauhing Tagapagsalita" : "ANNOUNCEMENTS"}" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans bg-white">`
        + `  <label class="block"><span class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Title size (<span id="csTitleSizeVal">${cs.titleSize}%</span> of screen height)</span>`
        + `  <input id="csTitleSize" type="range" min="1" max="25" step="0.5" value="${cs.titleSize}" class="w-full"></label>`
        + `  <div class="flex items-center gap-3 pt-1 border-t border-slate-200/60 flex-wrap">`
        + `    <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Color <input id="csTitleColor" type="color" value="${esc(cs.titleColor)}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>`
        + `    <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Border <input id="csTitleBorderColor" type="color" value="${esc(cs.titleBorderColor)}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>`
        + `    <label class="flex-1 min-w-[140px] block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">Thickness (<span id="csTitleBorderVal">${cs.titleBorderThickness}px</span>)</span>`
        + `    <input id="csTitleBorder" type="range" min="0" max="15" step="1" value="${cs.titleBorderThickness}" class="w-full"></label>`
        + `  </div>`
        + `  <div class="grid grid-cols-2 gap-2 pt-1">`
        + `    <label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">V-Padding (<span id="csTitlePadVVal">${cs.titlePaddingV}px</span>)</span>`
        + `    <input id="csTitlePadV" type="range" min="0" max="40" step="1" value="${cs.titlePaddingV}" class="w-full"></label>`
        + `    <label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">H-Padding (<span id="csTitlePadHVal">${cs.titlePaddingH}px</span>)</span>`
        + `    <input id="csTitlePadH" type="range" min="0" max="40" step="1" value="${cs.titlePaddingH}" class="w-full"></label>`
        + `  </div>`
        + `</div>`

        + (isPerson ? `
          <div class="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">Person Title (Optional)</span>
              <span class="flex items-center gap-1">
                <button type="button" id="csPersonTitleBold" title="Bold title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><b>B</b></button>
                <button type="button" id="csPersonTitleItalic" title="Italic title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><i>I</i></button>
                <button type="button" id="csPersonTitleCaps" title="All caps title" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:11px;font-weight:bold;cursor:pointer;background:#fff;">AA</button>
              </span>
            </div>
            <div class="flex items-center gap-1 mb-1">
              ${["Pastor", "Brother", "Sister", "Bishop", "Evangelist", "Elder"].map(t => `
                <button type="button" onclick="document.getElementById('csPersonTitle').value='${t}';" class="px-1.5 py-0.5 text-[10px] font-semibold bg-white hover:bg-brand-50 hover:text-brand-700 text-slate-600 rounded border border-slate-200 transition">
                  ${t}
                </button>
              `).join("")}
              <button type="button" onclick="document.getElementById('csPersonTitle').value='';" class="px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-red-500 rounded transition" title="Clear title">
                &times;
              </button>
            </div>
            <input id="csPersonTitle" type="text" maxlength="60" value="${esc(cs.personTitle || "")}" placeholder="e.g. Pastor, Sister, Brother" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans bg-white">
            <label class="block"><span class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Title size (<span id="csPersonTitleSizeVal">${cs.personTitleSize}%</span> of screen height)</span>
            <input id="csPersonTitleSize" type="range" min="1" max="20" step="0.5" value="${cs.personTitleSize}" class="w-full"></label>
            <div class="flex items-center gap-3 pt-1 border-t border-slate-200/60 flex-wrap">
              <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Color <input id="csPersonTitleColor" type="color" value="${esc(cs.personTitleColor)}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>
              <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Border <input id="csPersonTitleBorderColor" type="color" value="${esc(cs.personTitleBorderColor)}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>
              <label class="flex-1 min-w-[140px] block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">Thickness (<span id="csPersonTitleBorderVal">${cs.personTitleBorderThickness}px</span>)</span>
              <input id="csPersonTitleBorder" type="range" min="0" max="15" step="1" value="${cs.personTitleBorderThickness}" class="w-full"></label>
            </div>
            <div class="grid grid-cols-2 gap-2 pt-1">
              <label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">V-Padding (<span id="csPersonTitlePadVVal">${cs.personTitlePaddingV}px</span>)</span>
              <input id="csPersonTitlePadV" type="range" min="0" max="40" step="1" value="${cs.personTitlePaddingV}" class="w-full"></label>
              <label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">H-Padding (<span id="csPersonTitlePadHVal">${cs.personTitlePaddingH}px</span>)</span>
              <input id="csPersonTitlePadH" type="range" min="0" max="40" step="1" value="${cs.personTitlePaddingH}" class="w-full"></label>
            </div>
          </div>
        ` : "")

        + `<!-- Text 1 (Name for Person, Content for General) -->`
        + `<div class="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">`
        + `  <div class="flex items-center justify-between"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">${isPerson ? "Person Name" : "Slide Content / Body"}</span>`
        + `  <span class="flex items-center gap-1">`
        + `    <button type="button" id="csText1Bold" title="Bold text" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><b>B</b></button>`
        + `    <button type="button" id="csText1Italic" title="Italic text" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><i>I</i></button>`
        + `    <button type="button" id="csText1Caps" title="All caps text" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:11px;font-weight:bold;cursor:pointer;background:#fff;">AA</button>`
        + `  </span></div>`
        + `  ${isPerson 
              ? `<input id="csText1" type="text" maxlength="100" value="${esc(cs.text1)}" placeholder="e.g. Kapatid na Juan dela Cruz" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans bg-white">`
              : `<textarea id="csText1" rows="3" placeholder="Slide content text..." class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans bg-white custom-scrollbar">${esc(cs.text1)}</textarea>`}`
        + `  <label class="block"><span class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Text size (<span id="csText1SizeVal">${cs.text1Size}%</span> of screen height)</span>`
        + `  <input id="csText1Size" type="range" min="1" max="25" step="0.5" value="${cs.text1Size}" class="w-full"></label>`
        + `  <div class="flex items-center gap-3 pt-1 border-t border-slate-200/60 flex-wrap">`
        + `    <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Color <input id="csText1Color" type="color" value="${esc(cs.text1Color)}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>`
        + `    <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Border <input id="csText1BorderColor" type="color" value="${esc(cs.text1BorderColor)}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>`
        + `    <label class="flex-1 min-w-[140px] block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">Thickness (<span id="csText1BorderVal">${cs.text1BorderThickness}px</span>)</span>`
        + `    <input id="csText1Border" type="range" min="0" max="15" step="1" value="${cs.text1BorderThickness}" class="w-full"></label>`
        + `  </div>`
        + `  <div class="grid grid-cols-2 gap-2 pt-1">`
        + `    <label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">V-Padding (<span id="csText1PadVVal">${cs.text1PaddingV}px</span>)</span>`
        + `    <input id="csText1PadV" type="range" min="0" max="40" step="1" value="${cs.text1PaddingV}" class="w-full"></label>`
        + `    <label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">H-Padding (<span id="csText1PadHVal">${cs.text1PaddingH}px</span>)</span>`
        + `    <input id="csText1PadH" type="range" min="0" max="40" step="1" value="${cs.text1PaddingH}" class="w-full"></label>`
        + `  </div>`
        + `</div>`

        + `<!-- Text 2 (Centro for Person) -->`
        + (isPerson ? `
          <div class="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-700">Subtitle / Centro</span>
            <span class="flex items-center gap-1">
              <button type="button" id="csText2Bold" title="Bold subtitle" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><b>B</b></button>
              <button type="button" id="csText2Italic" title="Italic subtitle" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;background:#fff;"><i>I</i></button>
              <button type="button" id="csText2Caps" title="All caps subtitle" style="width:28px;height:28px;border-radius:8px;border:1px solid #cbd5e1;font-size:11px;font-weight:bold;cursor:pointer;background:#fff;">AA</button>
            </span></div>
            <input id="csText2" type="text" maxlength="100" value="${esc(cs.text2)}" placeholder="e.g. (Centro General Mariano Alvarez)" class="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 font-sans bg-white">
            <label class="block"><span class="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Subtitle size (<span id="csText2SizeVal">${cs.text2Size}%</span> of screen height)</span>
            <input id="csText2Size" type="range" min="1" max="20" step="0.5" value="${cs.text2Size}" class="w-full"></label>
            <div class="flex items-center gap-3 pt-1 border-t border-slate-200/60 flex-wrap">
              <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Color <input id="csText2Color" type="color" value="${esc(cs.text2Color)}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>
              <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">Border <input id="csText2BorderColor" type="color" value="${esc(cs.text2BorderColor)}" style="width:30px;height:24px;padding:0;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer;"></label>
              <label class="flex-1 min-w-[140px] block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">Thickness (<span id="csText2BorderVal">${cs.text2BorderThickness}px</span>)</span>
              <input id="csText2Border" type="range" min="0" max="15" step="1" value="${cs.text2BorderThickness}" class="w-full"></label>
            </div>
            <div class="grid grid-cols-2 gap-2 pt-1">
              <label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">V-Padding (<span id="csText2PadVVal">${cs.text2PaddingV}px</span>)</span>
              <input id="csText2PadV" type="range" min="0" max="40" step="1" value="${cs.text2PaddingV}" class="w-full"></label>
              <label class="block"><span class="block text-[10px] font-semibold text-slate-500 mb-0.5">H-Padding (<span id="csText2PadHVal">${cs.text2PaddingH}px</span>)</span>
              <input id="csText2PadH" type="range" min="0" max="40" step="1" value="${cs.text2PaddingH}" class="w-full"></label>
            </div>
          </div>
        ` : "")

        + `<!-- Card Border & Inset Padding -->`
        + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Card border thickness (<span id="csBorderThicknessVal">${cs.borderThickness}px</span>)</span>`
        + `<input id="csBorderThickness" type="range" min="0" max="25" step="1" value="${cs.borderThickness}" class="w-full"></label>`
        + `<div class="grid grid-cols-2 gap-3">`
        + `  <label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Card V-padding (<span id="csPaddingVVal">${cs.paddingV}%</span>)</span>`
        + `  <input id="csPaddingV" type="range" min="0" max="25" step="1" value="${cs.paddingV}" class="w-full"></label>`
        + `  <label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Card H-padding (<span id="csPaddingHVal">${cs.paddingH}%</span>)</span>`
        + `  <input id="csPaddingH" type="range" min="0" max="25" step="1" value="${cs.paddingH}" class="w-full"></label>`
        + `</div>`

        + `<!-- Background & Border Colors -->`
        + `<div class="flex items-center gap-4 flex-wrap">`
        + `  <label class="flex items-center gap-2 text-xs font-semibold text-slate-600">Background <input id="csBg" type="color" value="${esc(cs.bg === "transparent" ? "#000000" : cs.bg)}" style="width:36px;height:26px;padding:0;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;"></label>`
        + `  <label class="flex items-center gap-2 text-xs font-semibold text-slate-600">Card Border <input id="csBorderColor" type="color" value="${esc(cs.borderColor)}" style="width:36px;height:26px;padding:0;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;"></label>`
        + `</div>`

        + `<!-- Background Photo & Dimming -->`
        + `<div class="block"><div class="flex items-center justify-between mb-1"><span class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Background Photo</span>`
        + `  <span class="flex items-center gap-2">`
        + `    <input type="file" id="csBgUploadInput" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" class="hidden">`
        + `    <button type="button" id="csBgUploadBtn" class="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</button>`
        + `  </span></div>`
        + `  <div id="csBgGallery" class="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1.5 bg-slate-50 border border-slate-200 rounded-xl"></div>`
        + `</div>`
        + `<label class="block"><span class="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Photo dimming (<span id="csDimVal">${cs.bgDim}%</span>)</span>`
        + `<input id="csDim" type="range" min="0" max="90" step="1" value="${cs.bgDim}" class="w-full"></label>`

        + `<!-- Modal Actions -->`
        + `<div class="flex items-center justify-between pt-2 border-t border-slate-200">`
        + `  <button type="button" id="csResetBtn" class="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition">Reset to Default</button>`
        + `  <div class="flex items-center gap-2">`
        + `    <button type="button" id="csCancelBtn" class="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cancel</button>`
        + `    <button type="button" id="csSaveBtn" class="px-5 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition">Save Customization</button>`
        + `  </div>`
        + `</div></div>`
      );

      // Bind file input
      const fileInput = document.getElementById("csImageFile");
      if (fileInput) {
        fileInput.addEventListener("change", () => {
          const f = fileInput.files && fileInput.files[0];
          if (f) this.handleCustomSlideImageFile(f);
        });
      }
      const removeBtn = document.getElementById("csImageRemoveBtn");
      if (removeBtn) {
        removeBtn.onclick = () => {
          this.workingCustomSlide.image = "";
          const prev = document.getElementById("csImagePreview");
          if (prev) { prev.removeAttribute("src"); prev.style.display = "none"; }
          if (fileInput) fileInput.value = "";
        };
      }

      // Bind ranges
      const bindRange = (rangeId, valId, unit = "%") => {
        const r = document.getElementById(rangeId);
        const v = document.getElementById(valId);
        if (r && v) r.addEventListener("input", () => { v.textContent = `${r.value}${unit}`; });
      };
      bindRange("csImgSize", "csImgSizeVal", "%");
      bindRange("csTitleSize", "csTitleSizeVal", "%");
      bindRange("csTitleBorder", "csTitleBorderVal", "px");
      bindRange("csTitlePadV", "csTitlePadVVal", "px");
      bindRange("csTitlePadH", "csTitlePadHVal", "px");
      bindRange("csText1Size", "csText1SizeVal", "%");
      bindRange("csText1Border", "csText1BorderVal", "px");
      bindRange("csText1PadV", "csText1PadVVal", "px");
      bindRange("csText1PadH", "csText1PadHVal", "px");
      if (isPerson) {
        bindRange("csPersonTitleSize", "csPersonTitleSizeVal", "%");
        bindRange("csPersonTitleBorder", "csPersonTitleBorderVal", "px");
        bindRange("csPersonTitlePadV", "csPersonTitlePadVVal", "px");
        bindRange("csPersonTitlePadH", "csPersonTitlePadHVal", "px");
        bindRange("csText2Size", "csText2SizeVal", "%");
        bindRange("csText2Border", "csText2BorderVal", "px");
        bindRange("csText2PadV", "csText2PadVVal", "px");
        bindRange("csText2PadH", "csText2PadHVal", "px");
      }
      bindRange("csBorderThickness", "csBorderThicknessVal", "px");
      bindRange("csPaddingV", "csPaddingVVal", "%");
      bindRange("csPaddingH", "csPaddingHVal", "%");
      bindRange("csDim", "csDimVal", "%");

      // Bind formatting toggles
      const paintFmt = (btn, on) => {
        if (!btn) return;
        btn.style.background = on ? "#7c3aed" : "#ffffff";
        btn.style.color = on ? "#ffffff" : "#64748b";
        btn.style.borderColor = on ? "#7c3aed" : "#cbd5e1";
      };

      const toggleKeys = [
        ["csTitleBold", "titleBold"],
        ["csTitleItalic", "titleItalic"],
        ["csTitleCaps", "titleCaps"],
        ["csText1Bold", "text1Bold"],
        ["csText1Italic", "text1Italic"],
        ["csText1Caps", "text1Caps"]
      ];
      if (isPerson) {
        toggleKeys.push(["csPersonTitleBold", "personTitleBold"]);
        toggleKeys.push(["csPersonTitleItalic", "personTitleItalic"]);
        toggleKeys.push(["csPersonTitleCaps", "personTitleCaps"]);
        toggleKeys.push(["csText2Bold", "text2Bold"]);
        toggleKeys.push(["csText2Italic", "text2Italic"]);
        toggleKeys.push(["csText2Caps", "text2Caps"]);
      }

      toggleKeys.forEach(([btnId, key]) => {
        const btn = document.getElementById(btnId);
        paintFmt(btn, !!this.workingCustomSlide[key]);
        if (btn) {
          btn.onclick = () => {
            this.workingCustomSlide[key] = !this.workingCustomSlide[key];
            paintFmt(btn, !!this.workingCustomSlide[key]);
          };
        }
      });

      // Gallery and photo upload
      this.renderCustomSlideBgGallery();
      const bgUploadBtn = document.getElementById("csBgUploadBtn");
      const bgUploadInput = document.getElementById("csBgUploadInput");
      if (bgUploadBtn && bgUploadInput) {
        bgUploadBtn.onclick = () => bgUploadInput.click();
        bgUploadInput.onchange = (e) => this.uploadCustomSlideBackground(e);
      }

      // Dialog buttons
      const cancelBtn = document.getElementById("csCancelBtn");
      if (cancelBtn) cancelBtn.onclick = () => window.customSlideDesignerModal.hide();

      const saveBtn = document.getElementById("csSaveBtn");
      if (saveBtn) saveBtn.onclick = () => this.saveCustomSlideDesigner();

      const resetBtn = document.getElementById("csResetBtn");
      if (resetBtn) resetBtn.onclick = () => this.resetCustomSlideDesigner();

      window.customSlideDesignerModal.show();
    } catch (e) {
      console.error("[PROGRAM] Error opening custom slide designer:", e);
    }
  }

  handleCustomSlideImageFile(file) {
    try {
      const isGif = file && (file.type === "image/gif" || /\.gif$/i.test(file.name || ""));
      const reader = new FileReader();
      if (isGif) {
        reader.onload = () => {
          try {
            const dataUrl = reader.result;
            this.workingCustomSlide.image = dataUrl;
            const prev = document.getElementById("csImagePreview");
            if (prev) { prev.src = dataUrl; prev.style.display = "block"; }
          } catch (e) {}
        };
        reader.readAsDataURL(file);
        return;
      }
      reader.onload = () => {
        try {
          const img = new Image();
          img.onload = () => {
            try {
              const maxSide = 960;
              const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
              const canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(img.width * scale));
              canvas.height = Math.max(1, Math.round(img.height * scale));
              canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
              const isJpeg = /jpe?g/i.test(file.type || "");
              const dataUrl = canvas.toDataURL(isJpeg ? "image/jpeg" : "image/png", 0.9);
              this.workingCustomSlide.image = dataUrl;
              const prev = document.getElementById("csImagePreview");
              if (prev) { prev.src = dataUrl; prev.style.display = "block"; }
            } catch (e) {}
          };
          img.src = reader.result;
        } catch (e) {}
      };
      reader.readAsDataURL(file);
    } catch (e) {}
  }

  renderCustomSlideBgGallery() {
    try {
      const host = document.getElementById("csBgGallery");
      if (!host) return;
      const current = String((this.workingCustomSlide && this.workingCustomSlide.bgImage) || "").toLowerCase();
      const ring = (on) => on
        ? "ring-2 ring-brand-600 border-brand-500 shadow-sm bg-brand-50/30"
        : "border-slate-200 hover:border-slate-400 bg-white";
      const badge = (on) => on
        ? `<span class="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-600 text-white flex items-center justify-center text-[9px]"><i class="fa-solid fa-check"></i></span>`
        : "";
      let html = `
        <div onclick="programManager.selectCustomSlideBackground('')" title="Solid color (no photo)"
             class="relative flex flex-col p-1 rounded-lg border transition text-left cursor-pointer ${ring(current === "")}">
          <div class="w-full aspect-video rounded bg-slate-900 border border-slate-100/50 flex items-center justify-center relative">
            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">None</span>
            ${badge(current === "")}
          </div>
          <div class="mt-1 px-0.5 truncate text-[10px] font-semibold text-slate-700 leading-tight">Solid color</div>
        </div>`;

      const bgList = (typeof logoBackgroundList === "function") ? logoBackgroundList() : [{ name: "UECFI", file: "UECFI.png" }, { name: "Grapevine", file: "Grapevine.png" }];
      const esc = (s) => (typeof escapeNotepadHtml === "function" ? escapeNotepadHtml(s) : String(s || "").replace(/"/g, "&quot;"));

      bgList.forEach((img) => {
        if (!img || !img.file) return;
        const on = String(img.file).toLowerCase() === current;
        const safeFile = String(img.file).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        html += `
        <div onclick="programManager.selectCustomSlideBackground('${safeFile}')" title="${esc(img.name || img.file)} (${esc(img.file)})"
             class="relative flex flex-col p-1 rounded-lg border transition text-left cursor-pointer ${ring(on)}">
          <div class="w-full aspect-video rounded overflow-hidden bg-slate-900 border border-slate-100/50 flex items-center justify-center relative">
            <img src="./background/${esc(img.file)}" onerror="this.onerror=null;this.src='storage/background/${esc(img.file)}'" alt="${esc(img.name || "")}" class="w-full h-full object-cover" />
            ${badge(on)}
          </div>
          <div class="mt-1 px-0.5 truncate text-[10px] font-semibold text-slate-700 leading-tight">${esc(img.name || img.file)}</div>
        </div>`;
      });
      host.innerHTML = html;
    } catch (e) {}
  }

  selectCustomSlideBackground(file) {
    if (this.workingCustomSlide) {
      this.workingCustomSlide.bgImage = file || "";
      this.renderCustomSlideBgGallery();
    }
  }

  uploadCustomSlideBackground(event) {
    try {
      const input = event ? event.target : null;
      if (!input || !input.files || input.files.length === 0) return;
      const file = input.files[0];
      const fileName = file.name || "";
      const ext = ("." + (fileName.split(".").pop() || "")).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"].indexOf(ext) < 0) {
        alert("Unsupported file format. Please upload JPG, PNG, WEBP, BMP, or GIF images.");
        return;
      }
      if (typeof require !== "undefined") {
        try {
          const fs = require("fs");
          const path = require("path");
          const dir1 = path.join(process.cwd(), "background");
          const dir2 = path.join(process.cwd(), "storage", "background");
          if (!fs.existsSync(dir1)) fs.mkdirSync(dir1, { recursive: true });
          if (!fs.existsSync(dir2)) fs.mkdirSync(dir2, { recursive: true });
          if (file.path) {
            fs.copyFileSync(file.path, path.join(dir1, fileName));
            fs.copyFileSync(file.path, path.join(dir2, fileName));
          } else if (typeof Buffer !== "undefined") {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const buffer = Buffer.from(reader.result);
                fs.writeFileSync(path.join(dir1, fileName), buffer);
                fs.writeFileSync(path.join(dir2, fileName), buffer);
              } catch (e2) {}
            };
            reader.readAsArrayBuffer(file);
          }
        } catch (err) {
          console.error("[PROGRAM] Error saving uploaded background to disk:", err);
        }
      }
      try {
        let storedCustom = [];
        const raw = localStorage.getItem("uecfi_custom_backgrounds");
        if (raw) storedCustom = JSON.parse(raw);
        const baseName = fileName.replace(/\.[^/.]+$/, "");
        const cleanName = baseName.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        if (!storedCustom.some((x) => x && x.file && x.file.toLowerCase() === fileName.toLowerCase())) {
          storedCustom.push({ name: cleanName || fileName, file: fileName });
          localStorage.setItem("uecfi_custom_backgrounds", JSON.stringify(storedCustom));
        }
      } catch (e) {
        console.warn("[PROGRAM] Error persisting uploaded background to registry:", e);
      }
      try {
        if (window.themeManager && typeof window.themeManager.loadAvailableImages === "function") {
          window.themeManager.loadAvailableImages();
        }
      } catch (e) {}
      try { input.value = ""; } catch (e) {}
      this.selectCustomSlideBackground(fileName);
    } catch (e) {}
  }

  saveCustomSlideDesigner() {
    try {
      const cs = this.workingCustomSlide;
      if (!cs) return;

      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : "";
      };
      const getNum = (id, def = 0) => {
        const el = document.getElementById(id);
        return el ? (isFinite(Number(el.value)) ? Number(el.value) : def) : def;
      };
      const getChecked = (id, def = false) => {
        const el = document.getElementById(id);
        return el ? !!el.checked : def;
      };

      cs.active = getChecked("csActiveToggle", true);
      cs.title = getVal("csTitle").trim();
      cs.titleSize = Math.min(25, Math.max(1, getNum("csTitleSize", 8)));
      cs.titleColor = getVal("csTitleColor") || "#ffffff";
      cs.titleBorderColor = getVal("csTitleBorderColor") || "#000000";
      cs.titleBorderThickness = Math.min(20, Math.max(0, getNum("csTitleBorder", 0)));
      cs.titlePaddingV = Math.min(40, Math.max(0, getNum("csTitlePadV", 0)));
      cs.titlePaddingH = Math.min(40, Math.max(0, getNum("csTitlePadH", 0)));

      cs.text1 = getVal("csText1").trim();
      cs.text1Size = Math.min(25, Math.max(1, getNum("csText1Size", cs.type === "person" ? 12 : 7)));
      cs.text1Color = getVal("csText1Color") || "#ffffff";
      cs.text1BorderColor = getVal("csText1BorderColor") || "#000000";
      cs.text1BorderThickness = Math.min(20, Math.max(0, getNum("csText1Border", 0)));
      cs.text1PaddingV = Math.min(40, Math.max(0, getNum("csText1PadV", 0)));
      cs.text1PaddingH = Math.min(40, Math.max(0, getNum("csText1PadH", 0)));

      if (cs.type === "person") {
        cs.personTitle = getVal("csPersonTitle").trim();
        cs.personTitleSize = Math.min(25, Math.max(1, getNum("csPersonTitleSize", 6)));
        cs.personTitleColor = getVal("csPersonTitleColor") || "#FDE68A";
        cs.personTitleBorderColor = getVal("csPersonTitleBorderColor") || "#000000";
        cs.personTitleBorderThickness = Math.min(20, Math.max(0, getNum("csPersonTitleBorder", 0)));
        cs.personTitlePaddingV = Math.min(40, Math.max(0, getNum("csPersonTitlePadV", 0)));
        cs.personTitlePaddingH = Math.min(40, Math.max(0, getNum("csPersonTitlePadH", 0)));
        cs.text2 = getVal("csText2").trim();
        cs.text2Size = Math.min(20, Math.max(1, getNum("csText2Size", 5)));
        cs.text2Color = getVal("csText2Color") || "#cbd5e1";
        cs.text2BorderColor = getVal("csText2BorderColor") || "#000000";
        cs.text2BorderThickness = Math.min(20, Math.max(0, getNum("csText2Border", 0)));
        cs.text2PaddingV = Math.min(40, Math.max(0, getNum("csText2PadV", 0)));
        cs.text2PaddingH = Math.min(40, Math.max(0, getNum("csText2PadH", 0)));
      }

      cs.imgSize = Math.min(85, Math.max(5, getNum("csImgSize", 35)));
      cs.borderThickness = Math.min(25, Math.max(0, getNum("csBorderThickness", 0)));
      cs.paddingV = Math.min(25, Math.max(0, getNum("csPaddingV", 5)));
      cs.paddingH = Math.min(25, Math.max(0, getNum("csPaddingH", 5)));
      cs.bg = getVal("csBg") || "#000000";
      cs.borderColor = getVal("csBorderColor") || "#ffffff";
      cs.bgDim = Math.min(90, Math.max(0, getNum("csDim", 60)));

      const finalCs = JSON.parse(JSON.stringify(cs));

      if (this.editingCustomSlideFromModal) {
        // Saving back to open Add/Edit Item modal
        if (!this.currentModalData) this.currentModalData = {};
        this.currentModalData.customSlide = finalCs;
        const statusEl = document.getElementById("modalCustomSlideStatus");
        if (statusEl) {
          statusEl.innerHTML = finalCs.active
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-600 text-white">Custom Active</span>'
            : '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600">Standard Theme</span>';
        }
      } else {
        // Saving directly to item in this.items
        const idx = this.editingCustomSlideIndex;
        if (idx >= 0 && idx < this.items.length) {
          const item = this.items[idx];
          item.customSlide = finalCs;
          if (!item.data) item.data = {};
          item.data.customSlide = finalCs;
          this.saveProgramData();
          this.renderLeftNav();
          this.renderRightWorkspace();

          // If currently presented live, refresh projector immediately!
          if (idx === this.presentedItemIndex) {
            this.executePresentation();
          }
        }
      }

      if (window.customSlideDesignerModal) {
        window.customSlideDesignerModal.hide();
      }
      this._notify("Custom slide design saved!");
    } catch (e) {
      console.error("[PROGRAM] Error saving custom slide designer:", e);
    }
  }

  resetCustomSlideDesigner() {
    if (!confirm("Reset custom slide design to standard theme defaults?")) return;
    try {
      this.workingCustomSlide = null;

      if (this.editingCustomSlideFromModal) {
        // Unset in open Add/Edit Item modal
        if (!this.currentModalData) this.currentModalData = {};
        this.currentModalData.customSlide = null;
        const statusEl = document.getElementById("modalCustomSlideStatus");
        if (statusEl) {
          statusEl.innerHTML = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-600">Theme Default</span>';
        }
      } else {
        // Unset directly on the item
        const idx = this.editingCustomSlideIndex;
        if (idx >= 0 && idx < this.items.length) {
          const item = this.items[idx];
          item.customSlide = null;
          if (item.data) item.data.customSlide = null;
          this.saveProgramData();
          this.renderLeftNav();
          this.renderRightWorkspace();

          // If currently presented live, refresh projector immediately!
          if (idx === this.presentedItemIndex) {
            this.executePresentation();
          }
        }
      }

      if (window.customSlideDesignerModal) {
        window.customSlideDesignerModal.hide();
      }
      this._notify("Slide reset to theme defaults!");
    } catch (e) {
      console.error("[PROGRAM] Error resetting custom slide designer:", e);
    }
  }
}

// Global singleton instance
window.programManager = new ProgramManager();
