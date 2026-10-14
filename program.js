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
  constructor() {    this.items = [];
    this.selectedItemIndex = -1;
    this.presentedItemIndex = -1;
    this.presentedSlideIndex = -1;
    this.editingIndex = -1;
    this.dbFile = null;
    this.storagePath = "program/program.json";
  }

  init() {
    console.log("[PROGRAM] Initializing ProgramManager...");
    this.loadProgramData();
    this.renderLeftNav();
    this.renderRightWorkspace();
    this.bindEvents();
  }

  // Persist items to storage and localStorage fallback
  saveProgramData() {
    try {
      const dataStr = JSON.stringify(this.items, null, 2);
      AppStorage.writeFile(this.storagePath, dataStr);
      localStorage.setItem("uecfi_program_items", dataStr);
    } catch (e) {
      console.warn("[PROGRAM] Error saving program data:", e);
      localStorage.setItem("uecfi_program_items", JSON.stringify(this.items));
    }
  }

  // Load items from storage
  loadProgramData() {
    let loaded = false;
    try {
      if (AppStorage.existsSync(this.storagePath)) {
        const fullPath = AppStorage.resolveStoragePath(this.storagePath);
        if (typeof require === "function") {
          const fs = require("fs");
          if (fs.existsSync(fullPath)) {
            const dataStr = fs.readFileSync(fullPath, "utf8");
            this.items = JSON.parse(dataStr);
            loaded = true;
          }
        }
      }
    } catch (e) {
      console.warn("[PROGRAM] Could not read from AppStorage:", e);
    }

    if (!loaded) {
      const localStr = localStorage.getItem("uecfi_program_items");
      if (localStr) {
        try {
          this.items = JSON.parse(localStr);
          loaded = true;
        } catch (e) {
          console.error("[PROGRAM] Error parsing localStorage items", e);
        }
      }
    }

    if (!loaded || !Array.isArray(this.items) || this.items.length === 0) {
      // Default initial starter items to guide users
      this.items = [
        {
          id: "item_" + Date.now() + "_1",
          type: "tema",
          title: "(Tema)",
          data: {
            tema: "Ang Matibay na Pananampalataya sa Panahon ng Pagsubok",
            batayan: [
              { bookIndex: 18, bookName: "Mga Awit/Psalms", chapter: 23, fromVerse: 1, toVerse: 6 }
            ]
          }
        },
        {
          id: "item_" + Date.now() + "_2",
          type: "person",
          title: "Panauhing Tagapagsalita",
          data: {
            personType: "Panauhing Tagapagsalita",
            name: "Kapatid na Juan dela Cruz",
            centro: "Centro General Mariano Alvarez"
          }
        }
      ];
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
          <button onclick="programManager.openItemModal(-1)" class="mt-2 px-3 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg font-bold text-xs transition">
            + Add First Item
          </button>
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
        summaryText = item.data.name ? `${item.data.name}${item.data.centro ? ` (${item.data.centro})` : ""}` : (item.data.centro || "");
      } else if (item.type === "song") {
        const slideCount = (item.data.lyrics ? item.data.lyrics.split(/\n\s*\n/).filter(s => s.trim().length > 0).length : 0);
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
        let slideClass = "program-slide-card bg-white border rounded-xl p-5 shadow-xs transition cursor-pointer relative hover:shadow-md ";
        if (isSlidePresented) {
          slideClass += "program-slide-presented ";
        } else {
          slideClass += "border-slate-200 hover:border-brand-400";
        }

        slidesHtml += `
          <div onclick="event.preventDefault(); programManager.presentSlide(${this.selectedItemIndex}, ${sIdx})" 
               class="${slideClass}">
            <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <span class="text-[11px] font-bold uppercase tracking-wider ${isSlidePresented ? 'text-emerald-700' : 'text-slate-500'}">
                Slide ${sIdx + 1} of ${slides.length} ${isSlidePresented ? '<span class="ml-2 px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[9px] font-bold uppercase tracking-wider">LIVE</span>' : ''}
              </span>
              <div class="has-tooltip shrink-0"><button onclick="event.stopPropagation(); programManager.presentSlide(${this.selectedItemIndex}, ${sIdx})" class="px-2.5 py-1 text-xs font-bold rounded-md ${isSlidePresented ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-brand-50 text-slate-700 hover:text-brand-700'} transition flex items-center gap-1.5">
                <i class="fa-solid fa-play text-[10px]"></i> Present
              </button><div class="tooltip-content tooltip-bottom">Present This Slide</div></div>
            </div>
            <div class="text-center py-4 px-2">
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
        const name = item.data.name || "";
        const centro = item.data.centro || "";
        return [
          {
            text1: name,
            text2: centro ? `(${centro})` : ""
          }
        ];
      }

      case "song": {
        const lyrics = item.data.lyrics || "";
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
    window.p_current_index = this.presentedSlideIndex;
    window.p_last_index = slides.length - 1;
    // Verse slide titles must not leak into program items
    window.p_title_arr = [];
    // A program present supersedes any schedule highlight
    window.presentedScheduleId = null;
    if (typeof window.updateScheduleHighlight === "function") window.updateScheduleHighlight();
    if (typeof window.updateScheduleSlideHighlight === "function") window.updateScheduleSlideHighlight();

    if (item.type === "song") {
      window.p_title = item.title || "";
    } else if (item.type === "scripture") {

      // In Verses tab, title shows the specific reference (e.g., Genesis 1:1 or Genesis 1)
      window.p_title = curSlide.reference || item.title || "";
    } else {
      // General, Person, Tema types: title only (no footnote on program items)
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
    this.renderLeftNav();
    this.renderRightWorkspace();
  }

  updateLiveMonitorDisplay(slide, item, slideIdx, totalSlides) {
    if (typeof setLiveMonitorContent === "function") {
      setLiveMonitorContent({
        primary: slide.text1 || "",
        secondary: slide.text2 || "",
        reference: item.title || "",
        indicator: `Program Item ${this.presentedItemIndex + 1} (${slideIdx + 1} of ${totalSlides})`
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
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Name</label>
          <input id="inputPersonName" type="text" value="${this.currentModalData.name || ""}" 
                 placeholder="e.g. Kapatid na Juan dela Cruz" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500">
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Centro</label>
          <input id="inputPersonCentro" type="text" value="${this.currentModalData.centro || ""}" 
                 placeholder="e.g. Centro General Mariano Alvarez" 
                 class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-brand-500">
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
                    class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-brand-500 custom-scrollbar">${this.currentModalData.lyrics || ""}</textarea>
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
      `;
    }
  }

  getAllSongs() {
    // 1. Try global songManagerObj.M.data
    if (typeof songManagerObj !== "undefined" && songManagerObj && songManagerObj.M && Array.isArray(songManagerObj.M.data) && songManagerObj.M.data.length > 0) {
      return songManagerObj.M.data;
    }

    // 2. Try window._allSongsCache if previously loaded
    if (window._allSongsCache && Array.isArray(window._allSongsCache) && window._allSongsCache.length > 0) {
      return window._allSongsCache;
    }

    // 3. Try reading directly from SQLite database via better-sqlite3 in Electron
    try {
      if (typeof require !== "undefined") {
        const Database = require("better-sqlite3");
        const path = require("path");
        const fs = require("fs");
        let dbPath = path.join(__dirname, "storage", "song", "default.db");
        if (!fs.existsSync(dbPath)) {
          dbPath = path.join(process.cwd(), "storage", "song", "default.db");
        }
        if (fs.existsSync(dbPath)) {
          const db = new Database(dbPath, { readonly: true });
          const rows = db.prepare("SELECT * FROM sm ORDER BY name ASC").all();
          db.close();
          if (rows && rows.length > 0) {
            window._allSongsCache = rows;
            return rows;
          }
        }
      }
    } catch (e) {
      console.warn("[PROGRAM] Error reading songs directly from SQLite:", e);
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
    const song = songList[parseInt(songIdx)];
    if (!song) return;

    if (!this.currentModalData) this.currentModalData = {};
    if (song.font) this.currentModalData.font = song.font;
    if (song.copyright) this.currentModalData.copyright = song.copyright;

    const titleInput = document.getElementById("inputItemTitle");
    if (titleInput) titleInput.value = song.name || "";

    const lyricsInput = document.getElementById("inputSongLyrics");
    if (lyricsInput) {
      let lyricsText = "";
      if (song.lyrics) {
        if (Array.isArray(song.lyrics)) {
          lyricsText = song.lyrics.join("\n\n");
        } else if (typeof song.lyrics === "string") {
          // If lyrics contain <slide> tags or <BR> tags from the legacy DB, convert them cleanly
          let clean = song.lyrics
            .replace(/<slide>\s*<slide>/gi, "<slide>")
            .split(/<slide>/gi)
            .map(part => part.replace(/<br\s*\/?>/gi, "\n").trim())
            .filter(part => part.length > 0);
          lyricsText = clean.join("\n\n");
        }
      }
      lyricsInput.value = lyricsText;
    }
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
      data.lyrics = document.getElementById("inputSongLyrics") ? document.getElementById("inputSongLyrics").value.trim() : "";
      if (this.currentModalData && this.currentModalData.font) {
        data.font = this.currentModalData.font;
      }
      if (this.currentModalData && this.currentModalData.copyright) {
        data.copyright = this.currentModalData.copyright;
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

    const newItem = {
      id: this.editingIndex >= 0 ? this.items[this.editingIndex].id : "item_" + Date.now(),
      type: type,
      title: title,
      data: data
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
}

// Global singleton instance
window.programManager = new ProgramManager();
