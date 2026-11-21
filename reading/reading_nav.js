/**
 * reading_nav.js
 * Left catalog and navigation controller for the Readings module.
 * Manages category filtering, search, reading selection, slide card rendering, and projection triggers.
 */
function readingNavClass() {
  var selectedReading = null;
  var currentCategory = "_ALL";
  var readingsData = [];

  this.init = function() {
    bindEvents();
  };

  this.updateCategoryList = function(catResult) {
    var sel = document.getElementById("modernReadingCategory");
    if (!sel) return;
    var currentVal = sel.value || "_ALL";
    sel.innerHTML = '<option value="_ALL">All Categories</option>';

    var cats = [];
    if (catResult && catResult.data) {
      cats = catResult.data.map(function(c) { return c.cat; }).filter(Boolean);
    }
    cats.sort();

    cats.forEach(function(cat) {
      var opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });

    sel.value = currentVal;
  };

  this.updateReadingList = function(result, category) {
    if (category) currentCategory = category;
    readingsData = (result && result.data) ? result.data : [];
    renderReadingList();
  };

  this.searchComplete = function(result) {
    readingsData = (result && result.data) ? result.data : [];
    renderReadingList();
  };

  this.getSelectedReading = function() {
    return selectedReading;
  };

  this.selectReadingById = function(id) {
    if (typeof readingManagerObj !== "undefined" && readingManagerObj) {
      var r = readingManagerObj.getReadingObjWithID(id);
      if (r) {
        displayReadingSlides(r);
      }
    }
  };

  this.presentCurrentReading = function(slideIdx) {
    if (!selectedReading) return;
    if (typeof readingPresentObj !== "undefined") {
      var p = new readingPresentObj();
      p.init(selectedReading);
      p.present(slideIdx != null ? slideIdx : 0);
    }
  };

  this.nextSlide = function() {
    var st = window.liveReadingState;
    if (st && Array.isArray(st.slides) && st.slides.length > 0) {
      var nextIdx = (st.index || 0) + 1;
      if (nextIdx < st.slides.length) {
        if (typeof readingPresentObj !== "undefined") {
          var p = new readingPresentObj();
          p.init({ name: st.title || "", notes: st.notes || "", slides: st.slides });
          p.present(nextIdx);
          return true;
        }
      }
      return false;
    }
    if (!selectedReading || !Array.isArray(selectedReading.slides)) return false;
    var fallbackNext = (window.presentedReadingSlideIdx >= 0 ? window.presentedReadingSlideIdx : 0) + 1;
    if (fallbackNext < selectedReading.slides.length) {
      this.presentCurrentReading(fallbackNext);
      return true;
    }
    return false;
  };

  this.prevSlide = function() {
    var st = window.liveReadingState;
    if (st && Array.isArray(st.slides) && st.slides.length > 0) {
      var prevIdx = (st.index || 0) - 1;
      if (prevIdx >= 0) {
        if (typeof readingPresentObj !== "undefined") {
          var p = new readingPresentObj();
          p.init({ name: st.title || "", notes: st.notes || "", slides: st.slides });
          p.present(prevIdx);
          return true;
        }
      }
      return false;
    }
    if (!selectedReading || !Array.isArray(selectedReading.slides)) return false;
    var fallbackPrev = (window.presentedReadingSlideIdx >= 0 ? window.presentedReadingSlideIdx : 0) - 1;
    if (fallbackPrev >= 0) {
      this.presentCurrentReading(fallbackPrev);
      return true;
    }
    return false;
  };

  function bindEvents() {
    var catSelect = document.getElementById("modernReadingCategory");
    if (catSelect) {
      catSelect.addEventListener("change", function() {
        currentCategory = this.value;
        renderReadingList();
      }, false);
    }

    var searchInput = document.getElementById("modernReadingSearch");
    var searchBtn = document.getElementById("modernReadingSearchBtn");
    var clearBtn = document.getElementById("modernReadingClearBtn");

    if (searchInput) {
      searchInput.addEventListener("input", function() {
        if (clearBtn) clearBtn.style.display = this.value ? "block" : "none";
        if (this.value === "" && typeof readingManagerObj !== "undefined") {
          readingManagerObj.search("");
        }
      }, false);

      searchInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && typeof readingManagerObj !== "undefined") {
          readingManagerObj.search(this.value);
        }
      }, false);
    }

    if (searchBtn && searchInput) {
      searchBtn.addEventListener("click", function() {
        if (typeof readingManagerObj !== "undefined") {
          readingManagerObj.search(searchInput.value);
        }
      }, false);
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener("click", function() {
        searchInput.value = "";
        clearBtn.style.display = "none";
        if (typeof readingManagerObj !== "undefined") {
          readingManagerObj.search("");
        }
      }, false);
    }
  }

  function renderReadingList() {
    var listEl = document.getElementById("modernReadingList");
    if (!listEl) return;
    listEl.innerHTML = "";

    var filtered = readingsData;
    if (currentCategory && currentCategory !== "_ALL") {
      filtered = readingsData.filter(function(r) {
        return (r.cat || "").toLowerCase() === currentCategory.toLowerCase();
      });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">No readings found</div>';
      clearPreview();
      return;
    }

    filtered.forEach(function(item) {
      var isLiveReading = Boolean(
        typeof window !== "undefined" &&
        window.presentWindowOpen &&
        window.liveProjectionType === "readings" &&
        window.presentedReadingId != null &&
        String(window.presentedReadingId) === String(item.id)
      );
      var isSelected = selectedReading && String(selectedReading.id) === String(item.id);
      var classes = "bg-slate-50 border-slate-200 hover:border-brand-500 hover:shadow-sm text-slate-800";
      if (isLiveReading) {
        classes = "song-presented";
      } else if (isSelected) {
        classes = "song-selected";
      }

      var card = document.createElement("div");
      card.id = "readingRow_" + item.id;
      card.dataset.readingId = String(item.id);
      card.className = "p-2.5 border rounded-lg cursor-pointer transition " + classes;

      var safeTitle = String(item.name || "Untitled")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      card.innerHTML =
        '<div class="flex items-center justify-between gap-1">' +
          '<div class="flex-1 min-w-0">' +
            '<p class="text-xs font-bold leading-snug truncate flex items-center">' +
              '<span class="truncate">' + safeTitle + '</span>' +
            '</p>' +
          '</div>' +
          (isLiveReading ? '<span class="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-wider shrink-0">LIVE</span>' : '') +
          '<div class="flex items-center gap-1 opacity-90 shrink-0 text-[10px]">' +
            '<div class="has-tooltip"><button type="button" data-action="present" class="p-1 hover:bg-black/10 text-emerald-600 hover:text-emerald-700 rounded transition"><i class="fa-solid fa-play"></i></button><div class="tooltip-content tooltip-bottom">Present Reading</div></div>' +
            '<div class="has-tooltip"><button type="button" data-action="schedule" class="p-1 hover:bg-black/10 text-brand-600 hover:text-brand-700 rounded transition"><i class="fa-regular fa-calendar-plus"></i></button><div class="tooltip-content tooltip-bottom">Add Reading to Schedule</div></div>' +
            '<div class="has-tooltip"><button type="button" data-action="edit" class="p-1 hover:bg-black/10 text-slate-600 hover:text-slate-900 rounded transition"><i class="fa-solid fa-pen-to-square"></i></button><div class="tooltip-content tooltip-bottom">Edit Reading</div></div>' +
            '<div class="has-tooltip"><button type="button" data-action="delete" class="p-1 hover:bg-red-500/20 text-red-500 rounded transition"><i class="fa-regular fa-trash-can"></i></button><div class="tooltip-content tooltip-bottom">Delete Reading</div></div>' +
          '</div>' +
        '</div>';

      card.addEventListener("click", function() {
        selectReading(item.id);
      }, false);

      card.addEventListener("dblclick", function() {
        presentReadingById(item.id);
      }, false);

      var btnPresent = card.querySelector("[data-action='present']");
      if (btnPresent) {
        btnPresent.addEventListener("click", function(ev) {
          ev.stopPropagation();
          presentReadingById(item.id);
        }, false);
      }

      var btnSchedule = card.querySelector("[data-action='schedule']");
      if (btnSchedule) {
        btnSchedule.addEventListener("click", function(ev) {
          ev.stopPropagation();
          addReadingToSchedule(item);
        }, false);
      }

      var btnEdit = card.querySelector("[data-action='edit']");
      if (btnEdit) {
        btnEdit.addEventListener("click", function(ev) {
          ev.stopPropagation();
          editReadingById(item.id);
        }, false);
      }

      var btnDelete = card.querySelector("[data-action='delete']");
      if (btnDelete) {
        btnDelete.addEventListener("click", function(ev) {
          ev.stopPropagation();
          deleteReadingById(item);
        }, false);
      }

      listEl.appendChild(card);
    });

    // Auto-select first item if nothing selected or current selection missing
    if (!selectedReading && filtered.length > 0) {
      selectReading(filtered[0].id);
    }
  }

  function presentReadingById(id) {
    if (typeof readingManagerObj === "undefined" || !readingManagerObj) return;
    var r = readingManagerObj.getReadingObjWithID(id);
    if (!r) return;
    selectedReading = r;
    displayReadingSlides(r);
    renderReadingList();
    if (typeof readingPresentObj !== "undefined") {
      var p = new readingPresentObj();
      p.init(r);
      p.present(0);
    }
  }

  function addReadingToSchedule(item) {
    if (!item || item.id == null) return;
    if (typeof scheduleObj === "undefined" || !scheduleObj || typeof scheduleObj.processAddReading !== "function") {
      if (typeof showToast === "function") showToast("Schedule is not available", "error");
      return;
    }
    var added = scheduleObj.processAddReading(item.id);
    var label = item.name || "Reading";
    if (typeof showToast === "function") {
      if (added === false) {
        showToast(label + " is already in the Schedule", "info");
      } else {
        showToast(label + " added to Schedule");
      }
    }
  }

  function editReadingById(id) {
    if (typeof readingManagerObj === "undefined" || !readingManagerObj) return;
    var r = readingManagerObj.getReadingObjWithID(id);
    if (!r) return;
    selectedReading = r;
    displayReadingSlides(r);
    renderReadingList();
    if (typeof window !== "undefined" && window.readingEditObj && typeof window.readingEditObj.openModal === "function") {
      window.readingEditObj.openModal(r);
    }
  }

  function deleteReadingById(item) {
    if (!item || item.id == null) return;
    if (typeof readingManagerObj === "undefined" || !readingManagerObj) return;
    var name = item.name || "this reading";
    if (!confirm('Delete "' + name + '"?')) return;
    if (selectedReading && String(selectedReading.id) === String(item.id)) {
      selectedReading = null;
    }
    readingManagerObj.deleteReading(item.id);
    if (typeof showToast === "function") {
      showToast('Deleted "' + name + '"', "info");
    }
  }

  function selectReading(id) {
    if (typeof readingManagerObj !== "undefined" && readingManagerObj) {
      var r = readingManagerObj.getReadingObjWithID(id);
      if (r) {
        selectedReading = r;
        displayReadingSlides(r);
        renderReadingList();
      }
    }
  }

  window.updateReadingListHighlight = renderReadingList;

  function displayReadingSlides(r) {
    selectedReading = r;
    var nameEl = document.getElementById("rd_name");
    if (nameEl) nameEl.textContent = r.name || "";

    var catEl = document.getElementById("rd_cat");
    if (catEl) catEl.textContent = r.catIndex || "Doctrines";

    var notesEl = document.getElementById("rd_notes");
    if (notesEl) notesEl.textContent = r.notes || "None";

    var badgeEl = document.getElementById("rd_slideCountBadge");
    var count = r.slides ? r.slides.length : 0;
    if (badgeEl) badgeEl.textContent = count + " slide" + (count !== 1 ? "s" : "");

    var slideHost = document.getElementById("rd_slide");
    if (!slideHost) return;
    slideHost.innerHTML = "";

    // Resolve font from global theme
    var font = (typeof window !== "undefined" && window.themeManager && typeof window.themeManager.resolveProjectionStyle === "function")
      ? window.themeManager.resolveProjectionStyle("readings").primaryFont
      : "sans-serif";
    slideHost.style.fontFamily = font || "sans-serif";

    var html = "";
    for (var i = 0; i < count; i++) {
      html += '<div id="readingSlideID' + i + '" class="reading-slide-card"></div>';
    }
    slideHost.innerHTML = html;

    for (var i = 0; i < count; i++) {
      var cardId = "readingSlideID" + i;
      var renderer = new readingSlidesClass();
      renderer.init(r, cardId, i);
    }

    if (typeof window.updateReadingSlideHighlight === "function") {
      window.updateReadingSlideHighlight();
    }
  }

  function clearPreview() {
    selectedReading = null;
    var nameEl = document.getElementById("rd_name");
    if (nameEl) nameEl.textContent = "No Reading Selected";
    var catEl = document.getElementById("rd_cat");
    if (catEl) catEl.textContent = "";
    var notesEl = document.getElementById("rd_notes");
    if (notesEl) notesEl.textContent = "";
    var badgeEl = document.getElementById("rd_slideCountBadge");
    if (badgeEl) badgeEl.textContent = "0 slides";
    var slideHost = document.getElementById("rd_slide");
    if (slideHost) slideHost.innerHTML = "";
  }
}

/**
 * Slide highlight helper for active reading slides in the preview panel
 */
window.updateReadingSlideHighlight = function() {
  var slideHost = document.getElementById("rd_slide");
  if (!slideHost) return;

  var cards = slideHost.querySelectorAll(".reading-slide-card");
  cards.forEach(function(card) {
    card.classList.remove("slide-presented");
  });

  if (window.liveReadingState && typeof window.liveReadingState.index === "number") {
    var activeCard = document.getElementById("readingSlideID" + window.liveReadingState.index);
    if (activeCard) {
      activeCard.classList.add("slide-presented");
      activeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
};

if (typeof window !== "undefined") {
  window.readingNavClass = readingNavClass;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { readingNavClass };
}
