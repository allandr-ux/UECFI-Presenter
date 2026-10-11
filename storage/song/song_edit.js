function songEditClass() {
  this.init = M;
  this.showEditPanel = j;
  this.setEditPrimaryKey = A;

  var b = false; // edit flag (false = new song, true = update song)
  var o = -1;    // edit index
  var m = -1;    // primary key ID
  var q = false; // trace flag
  var f = "";    // template HTML
  var h = null;  // panel dialog object
  var z = null;  // legacy TabView dummy
  var currentSongObj = null; // song being edited
  var n = "";    // new category cache
  var s = 0;     // selected category index
  var e = ["Arial", "Times New Roman", "Calibri"];
  var d = 0;     // selected font index
  var k = 3;

  function M(P) {
    v("Initialize Song Edit Panel");
    e = ["Arial", "Times New Roman", "Calibri"];
    f = P;
    G();
    l();
    F();
    O();
  }

  function G() {
    v("Generating Panel");
    h = new AppUI.Modal("panelObj");
    h.render(document.body);
    h.setHeader("Add / Edit Song");
    h.setBody(f);
    h.hide();
  }

  function O() {
    v("Generating Events");

    // Add / Delete / Create legacy slide buttons (safely bind if element exists)
    var btnAddSlide = document.getElementById("songEdit_addSlideButtonID");
    if (btnAddSlide) btnAddSlide.addEventListener("click", E, false);
    var btnDelSlide = document.getElementById("songEdit_deleteSlideButtonID");
    if (btnDelSlide) btnDelSlide.addEventListener("click", B, false);
    var btnCreateSlides = document.getElementById("songEdit_createSlidesButtonID");
    if (btnCreateSlides) btnCreateSlides.addEventListener("click", y, false);

    // Categories
    var btnAddCat = document.getElementById("songEdit_addCatButtonID");
    if (btnAddCat) btnAddCat.addEventListener("click", r, false);
    var btnSubmitCat = document.getElementById("se_submitCatButtonID2");
    if (btnSubmitCat) btnSubmitCat.addEventListener("click", a, false);

    // Fonts
    var btnAddFont = document.getElementById("se_addFontButtonID2");
    if (btnAddFont) btnAddFont.addEventListener("click", D, false);
    var btnSubmitFont = document.getElementById("se_submitFontButtonID2");
    if (btnSubmitFont) btnSubmitFont.addEventListener("click", C, false);
    var selFont = document.getElementById("se_fontID2");
    if (selFont) selFont.addEventListener("change", p, false);

    // Lyrics live slide counter
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (lyricsInput) {
      lyricsInput.addEventListener("input", updateSlideCounter, false);
    }

    // Modal action buttons
    var btnPresent = document.getElementById("se_presentID");
    if (btnPresent) btnPresent.addEventListener("click", g, false);
    var btnSave = document.getElementById("songEdit_saveButtonID");
    if (btnSave) btnSave.addEventListener("click", K, false);
    var btnCancel = document.getElementById("songEdit_cancelButtonID");
    if (btnCancel) btnCancel.addEventListener("click", u, false);
  }

  function updateSlideCounter() {
    var lyricsInput = document.getElementById("se_lyricsInput");
    var badgeNumber = document.getElementById("se_slideCountNumber");
    if (!lyricsInput || !badgeNumber) return;

    var text = lyricsInput.value || "";
    var slides = parseLyrics(text);
    var count = slides.length;
    badgeNumber.textContent = count + (count === 1 ? " Slide" : " Slides");
  }

  function parseLyrics(text) {
    if (!text) return [];
    var blocks = text.split(/\r?\n\s*\r?\n+/);
    var slides = [];
    for (var i = 0; i < blocks.length; i++) {
      var trimmed = blocks[i].trim();
      if (trimmed.length > 0) {
        slides.push(trimmed.replace(/\r?\n/g, "<BR>"));
      }
    }
    return slides;
  }

  function A(P) {
    m = P;
  }

  function F() {
    v("Init Slide Tabs (kept for legacy compatibility)");
    var slidesContainer = document.getElementById("se_slides");
    if (slidesContainer) {
      z = new AppUI.Tabs();
      z.appendTo("se_slides");
    }
  }

  function I() {
    if (z && typeof z.getTab === "function") {
      var P = 0;
      var Q = z.getTab(P);
      while (Q != null) {
        z.removeTab(Q);
        Q = z.getTab(P);
      }
    }
    k = 1;
  }

  function J() {
    var R = songManagerObj.get_sm_cat_records();
    if (R.data != null) {
      var Q = R.data.length;
      for (var P = 0; P < Q; P++) {
        if (R.data[P].cat != null) {
          document.getElementById("songnav_category2").options[P] = new Option(R.data[P].cat, P);
        }
      }
    }
  }

  function N(P) {
    var U = new Array();
    var S = songManagerObj.get_sm_cat_records();
    if (S.data != null) {
      var R = S.data.length;
      for (var Q = 0; Q < R; Q++) {
        if (S.data[Q].cat != null) {
          U.push(S.data[Q].cat);
        }
      }
      if (n != "") {
        U.push(n);
      }
      U.sort();
    }
    var T = U.length;
    s = 0;
    for (var Q = 0; Q < T; Q++) {
      document.getElementById("songnav_category2").options[Q] = new Option(U[Q], Q);
      if (P == null) {
        if (U[Q] == n) {
          s = Q;
        }
      } else {
        if (U[Q] == P) {
          s = Q;
        }
      }
    }
    n = "";
    document.getElementById("songnav_category2").selectedIndex = s;
  }

  function l(R) {
    var V = songManagerObj.getFontList();
    var Q = new Array();
    var T = null;
    if (V != null) {
      var U = e.length;
      for (var S = U - 1; S >= 0; S--) {
        T = V.indexOf(e[S]);
        if (T != -1) {
          e.splice(S, 1);
        }
      }
      Q = e.concat(V);
    } else {
      Q = e;
    }
    Q.sort();
    var W = Q.length;
    clearSelectList("se_fontID2");
    for (var S = 0; S < W; S++) {
      document.getElementById("se_fontID2").options[S] = new Option(Q[S], S);
      if (Q[S] == R) {
        d = S;
      }
    }
    document.getElementById("se_fontID2").selectedIndex = d;
    p();
  }

  function C() {
    var Q = document.getElementById("se_fontTextID").value;
    var P = w(Q);
    if (P) {
      var fontContainer = document.getElementById("se_fontInputContainer");
      if (fontContainer) fontContainer.style.display = "none";
      e.push(Q);
      l(Q);
    }
  }

  function p() {
    var fontSelect = document.getElementById("se_fontID2");
    if (!fontSelect || fontSelect.selectedIndex < 0) return;
    var T = fontSelect.selectedIndex;
    var S = fontSelect.options[T].text;

    // Apply font to unified lyrics textarea
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (lyricsInput) {
      lyricsInput.style.fontFamily = S;
    }
  }

  function w(P) {
    return true;
  }

  // Populate song data into modal
  function c(P) {
    currentSongObj = P;
    // Hide inline add category / font inputs by default
    var catContainer = document.getElementById("se_catInputContainer");
    if (catContainer) catContainer.style.display = "none";
    var fontContainer = document.getElementById("se_fontInputContainer");
    if (fontContainer) fontContainer.style.display = "none";

    if (P != null) {
      document.getElementById("songEdit_NameID").value = P.name || "";
      document.getElementById("se_copyrightID").value = P.copyright || "";
      N(P.catIndex);
      l(P.font);
      document.getElementById("se_keyID").value = P.key || "";
      document.getElementById("se_notesID").value = P.notes || "";

      // Load slides into unified textarea
      var slidesText = "";
      if (P.slides && P.slides.length > 0) {
        slidesText = P.slides.map(function(s) {
          return s.replace(/<BR>/gi, "\n");
        }).join("\n\n");
      }
      var lyricsInput = document.getElementById("se_lyricsInput");
      if (lyricsInput) {
        lyricsInput.value = slidesText;
      }
    } else {
      document.getElementById("songEdit_NameID").value = "";
      document.getElementById("se_copyrightID").value = "";
      N(null);
      l(null);
      document.getElementById("se_keyID").value = "";
      document.getElementById("se_notesID").value = "";
      var lyricsInput = document.getElementById("se_lyricsInput");
      if (lyricsInput) {
        lyricsInput.value = "";
      }
    }

    updateSlideCounter();
    p();
  }

  function j(P, Q, R) {
    b = Q;
    o = R;
    m = null;
    c(P);
    h.setHeader(Q ? "Edit Song" : "Add New Song");
    h.show();
  }

  function r() {
    var catContainer = document.getElementById("se_catInputContainer");
    var catInput = document.getElementById("se_catTextID");
    if (catContainer) {
      catContainer.style.display = catContainer.style.display === "none" ? "flex" : "none";
      if (catContainer.style.display !== "none" && catInput) {
        catInput.value = "";
        catInput.focus();
      }
    }
  }

  function a() {
    var Q = document.getElementById("se_catTextID").value;
    var P = t(Q);
    if (P) {
      var catContainer = document.getElementById("se_catInputContainer");
      if (catContainer) catContainer.style.display = "none";
      n = Q;
      N(null);
    }
  }

  function E() {
    var P = null;
    L(P);
  }

  function L(R) {
    // Kept for backward compatibility
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (lyricsInput && R) {
      if (lyricsInput.value.trim().length > 0) {
        lyricsInput.value += "\n\n" + R;
      } else {
        lyricsInput.value = R;
      }
      updateSlideCounter();
    }
  }

  function y() {
    // Legacy generate slides dialog is no longer needed since the main textarea already supports multi-stanza input,
    // but we can provide focus to the main lyrics textarea.
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (lyricsInput) lyricsInput.focus();
  }

  function B() {
    // Legacy delete slide: remove last stanza if requested
    var lyricsInput = document.getElementById("se_lyricsInput");
    if (!lyricsInput) return;
    var slides = parseLyrics(lyricsInput.value);
    if (slides.length > 1) {
      slides.pop();
      lyricsInput.value = slides.map(function(s) {
        return s.replace(/<BR>/gi, "\n");
      }).join("\n\n");
      updateSlideCounter();
    }
  }

  function D() {
    var fontContainer = document.getElementById("se_fontInputContainer");
    var fontInput = document.getElementById("se_fontTextID");
    if (fontContainer) {
      fontContainer.style.display = fontContainer.style.display === "none" ? "flex" : "none";
      if (fontContainer.style.display !== "none" && fontInput) {
        fontInput.value = "";
        fontInput.focus();
      }
    }
  }

  // Extract songObj from Form
  function H() {
    v("Extract data from Form");
    var X = document.getElementById("songEdit_NameID").value;
    X = X.replace(/^\s+|\s+$/g, "");
    X = X.replace(/\s\s+/g, " ");
    if (X == "") {
      alert("Please enter a valid Song Title");
      return false;
    }

    var U = new songObj();
    U.name = X;

    // Parse lyrics from unified textarea
    var lyricsInput = document.getElementById("se_lyricsInput");
    var lyricsText = lyricsInput ? lyricsInput.value : "";
    var parsedSlides = parseLyrics(lyricsText);

    // If no lyrics entered, keep at least one empty slide to avoid crash
    if (parsedSlides.length === 0) {
      parsedSlides = [""];
    }

    U.slides = parsedSlides;
    U.copyright = document.getElementById("se_copyrightID").value;
    var S = document.getElementById("songnav_category2").selectedIndex;
    if (S >= 0 && document.getElementById("songnav_category2").options[S]) {
      U.catIndex = document.getElementById("songnav_category2").options[S].text;
    } else {
      U.catIndex = "English";
    }

    // Song font defaults cleanly to Arial (or preserves previous font) without requiring user input
    var existingFont = (currentSongObj && currentSongObj.font) ? currentSongObj.font : "Arial";
    var V = document.getElementById("se_fontID2") ? document.getElementById("se_fontID2").selectedIndex : -1;
    if (V >= 0 && document.getElementById("se_fontID2").options[V] && document.getElementById("se_fontID2").options[V].text) {
      U.font = document.getElementById("se_fontID2").options[V].text;
    } else {
      U.font = existingFont;
    }

    U.key = document.getElementById("se_keyID").value;
    U.notes = document.getElementById("se_notesID").value;
    return U;
  }

  function g() {
    v("Process Present button");
    var Q = H();
    if (Q !== false) {
      var P = new songPresentObj();
      P.init(Q);
      P.present();
    }
  }

  function K() {
    v("Process Save button");
    var P = H();
    if (P !== false) {
      if (!b) {
        songManagerObj.addSong(P, true, false);
        b = true;
      } else {
        songManagerObj.updateSong(P, o, m);
      }
      h.hide();
    }
  }

  function i() {
    var Q = H();
    if (Q !== false) {
      for (var P = 0; P < 200; P++) {
        Q.name = "Test Song_" + P;
        if (!b) {
          songManagerObj.addSong(Q, false, false);
          b = true;
        } else {
          songManagerObj.updateSong(Q, o, m);
        }
      }
    }
  }

  function u() {
    v("Process Cancel button");
    var P = confirm("Do you want to CANCEL from Add/Edit Song panel?");
    if (P) {
      h.hide();
    }
  }

  function x(Q) {
    var P = Q.split('"');
    return P[1];
  }

  function t(P) {
    if (P != "_ALL") {
      return true;
    } else {
      alert("_ALL is reserved Category");
      return false;
    }
  }

  function v(P) {
    if (q) {
      console.log("[SongEdit]...." + P);
    }
  }
}