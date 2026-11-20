/**
 * reading_edit.js
 * Controller for the Add / Edit Reading modal dialog.
 */
function readingEditClass() {
  var modal = null;
  var currentReading = null;
  var templateHtml = "";

  this.init = function(html) {
    templateHtml = html;
    modal = new AppUI.Modal("readingEditModal");
    modal.render(document.body);
    modal.setHeader("Add / Edit Reading");
    modal.setBody(templateHtml);
    modal.hide();

    bindEvents();
  };

  this.openModal = function(rObj) {
    currentReading = rObj || null;
    populateForm(currentReading);
    if (modal) modal.show();
  };

  this.closeModal = function() {
    if (modal) modal.hide();
  };

  function bindEvents() {
    var saveBtn = document.getElementById("readingEdit_saveButtonID");
    if (saveBtn) saveBtn.addEventListener("click", onSave, false);

    var cancelBtn = document.getElementById("readingEdit_cancelButtonID");
    if (cancelBtn) cancelBtn.addEventListener("click", function() {
      if (modal) modal.hide();
    }, false);

    var presentBtn = document.getElementById("re_presentID");
    if (presentBtn) presentBtn.addEventListener("click", onPresentFromModal, false);

    var addCatBtn = document.getElementById("readingEdit_addCatButtonID");
    if (addCatBtn) addCatBtn.addEventListener("click", toggleAddCategory, false);

    var submitCatBtn = document.getElementById("re_submitCatButtonID2");
    if (submitCatBtn) submitCatBtn.addEventListener("click", onSubmitNewCategory, false);

    var slidesInput = document.getElementById("re_slidesInput");
    if (slidesInput) slidesInput.addEventListener("input", updateSlideCounter, false);
  }

  function populateForm(r) {
    // Hide inline add category box
    var catBox = document.getElementById("re_catInputContainer");
    if (catBox) catBox.style.display = "none";

    populateCategoryDropdown(r ? r.catIndex : "Doctrines");

    var nameInput = document.getElementById("readingEdit_NameID");
    var notesInput = document.getElementById("re_notesID");
    var slidesInput = document.getElementById("re_slidesInput");

    if (r) {
      if (nameInput) nameInput.value = r.name || "";
      if (notesInput) notesInput.value = r.notes || "";
      if (slidesInput) {
        var text = (r.slides && r.slides.length > 0)
          ? r.slides.join("\n\n")
          : (r.lyrics ? r.lyrics.replace(/<slide>/gi, "\n\n") : "");
        slidesInput.value = text;
      }
    } else {
      if (nameInput) nameInput.value = "";
      if (notesInput) notesInput.value = "";
      if (slidesInput) slidesInput.value = "";
    }

    updateSlideCounter();
  }

  function populateCategoryDropdown(selectedCat) {
    var sel = document.getElementById("readingnav_category2");
    if (!sel) return;
    sel.innerHTML = "";

    var defaultCats = ["Doctrines", "Principles", "Prayers", "Creeds", "Responsive Readings"];
    var dbCats = [];
    if (typeof readingManagerObj !== "undefined" && readingManagerObj) {
      var list = readingManagerObj.getCategoryList();
      if (list && list.data) {
        dbCats = list.data.map(function(c) { return c.cat; }).filter(Boolean);
      }
    }

    var merged = Array.from(new Set(defaultCats.concat(dbCats)));
    merged.sort();

    merged.forEach(function(cat) {
      var opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      if (selectedCat && cat.toLowerCase() === selectedCat.toLowerCase()) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    });
  }

  function toggleAddCategory() {
    var box = document.getElementById("re_catInputContainer");
    var input = document.getElementById("re_catTextID");
    if (box) {
      var isHidden = (box.style.display === "none");
      box.style.display = isHidden ? "flex" : "none";
      if (isHidden && input) {
        input.value = "";
        input.focus();
      }
    }
  }

  function onSubmitNewCategory() {
    var input = document.getElementById("re_catTextID");
    if (!input) return;
    var newCat = input.value.trim();
    if (!newCat) return;

    var sel = document.getElementById("readingnav_category2");
    if (sel) {
      var opt = document.createElement("option");
      opt.value = newCat;
      opt.textContent = newCat;
      opt.selected = true;
      sel.appendChild(opt);
    }
    var box = document.getElementById("re_catInputContainer");
    if (box) box.style.display = "none";
  }

  function updateSlideCounter() {
    var input = document.getElementById("re_slidesInput");
    var badge = document.getElementById("re_slideCountNumber");
    if (!input || !badge) return;

    var slides = parseSlides(input.value);
    var count = slides.length;
    badge.textContent = count + " Slide" + (count !== 1 ? "s" : "");
  }

  function parseSlides(text) {
    if (!text || !text.trim()) return [];
    return text
      .split(/\n\s*\n+/)
      .map(function(s) { return s.trim(); })
      .filter(function(s) { return s.length > 0; });
  }

  function extractReadingFromForm() {
    var nameEl = document.getElementById("readingEdit_NameID");
    var title = nameEl ? nameEl.value.trim() : "";
    if (!title) {
      alert("Please enter a Title for this reading.");
      if (nameEl) nameEl.focus();
      return null;
    }

    var catEl = document.getElementById("readingnav_category2");
    var cat = (catEl && catEl.value) ? catEl.value : "Doctrines";

    var notesEl = document.getElementById("re_notesID");
    var notes = notesEl ? notesEl.value.trim() : "";

    var slidesEl = document.getElementById("re_slidesInput");
    var slidesText = slidesEl ? slidesEl.value : "";
    var parsedSlides = parseSlides(slidesText);
    if (parsedSlides.length === 0) {
      parsedSlides = [""];
    }

    var r = new readingObj();
    if (currentReading && currentReading.id) {
      r.id = currentReading.id;
    }
    r.name = title;
    r.catIndex = cat;
    r.notes = notes;
    r.slides = parsedSlides;
    r.lyrics = parsedSlides.join("<slide>");
    return r;
  }

  function onSave() {
    var r = extractReadingFromForm();
    if (!r) return;

    if (typeof readingManagerObj !== "undefined" && readingManagerObj) {
      var ok = readingManagerObj.saveReading(r);
      if (ok && modal) {
        modal.hide();
      }
    }
  }

  function onPresentFromModal() {
    var r = extractReadingFromForm();
    if (!r) return;

    if (typeof readingManagerObj !== "undefined" && readingManagerObj) {
      readingManagerObj.saveReading(r);
    }
    if (modal) modal.hide();

    if (typeof readingPresentObj !== "undefined") {
      var p = new readingPresentObj();
      p.init(r);
      p.present(0);
    }
  }
}

if (typeof window !== "undefined") {
  window.readingEditClass = readingEditClass;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { readingEditClass };
}
